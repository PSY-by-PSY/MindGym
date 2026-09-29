"""billing renewal scheduling and outcome processing

Revision ID: mg_0007_billing_renewal
Revises: mg_0006_billing_refunds
Create Date: 2026-09-28 17:30:00.000000
"""

from alembic import op

revision = "mg_0007_billing_renewal"
down_revision = "mg_0006_billing_refunds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. schedule_renewals RPC
    op.execute("""
      CREATE OR REPLACE FUNCTION billing.schedule_renewals(
        p_lookahead_interval interval DEFAULT '24 hours'::interval,
        p_limit integer DEFAULT 50
      )
      RETURNS TABLE(
        subscription_id uuid,
        order_id uuid,
        merchant_order_no text,
        amount_cents integer,
        currency text,
        user_id uuid,
        next_charge_at timestamptz
      )
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, public, pg_catalog AS $function$
      DECLARE
        v_sub RECORD;
        v_plan billing.plans%ROWTYPE;
        v_order billing.orders%ROWTYPE;
        v_order_no text;
        v_now timestamptz := clock_timestamp();
      BEGIN
        FOR v_sub IN
          SELECT s.id, s.user_id, s.plan_code, s.next_charge_at, s.status, s.grace_ends_at
          FROM billing.subscriptions s
          WHERE s.status IN ('active', 'grace')
            AND s.cancel_at IS NULL
            AND s.next_charge_at <= (v_now + p_lookahead_interval)
            AND NOT EXISTS (
              SELECT 1 FROM billing.orders o
              WHERE o.subscription_id = s.id
                AND o.kind = 'renewal'
                AND o.status IN ('pending', 'processing')
            )
          ORDER BY s.next_charge_at ASC
          LIMIT p_limit
          FOR UPDATE OF s SKIP LOCKED
        LOOP
          SELECT * INTO v_plan FROM billing.plans WHERE code = v_sub.plan_code;
          IF FOUND THEN
            -- PAYUNi /api/credit limits MerTradeNo to max 25 chars.
            -- Format: RNW-(8 chars sub id)-(12 chars YYMMDDHH24MI) = 25 chars exactly.
            v_order_no := 'RNW-' || substring(v_sub.id::text, 1, 8) || '-' || to_char(v_now, 'YYMMDDHH24MI');

            INSERT INTO billing.orders (
              subscription_id, merchant_order_no, idempotency_key, kind, status,
              plan_code_snapshot, plan_name_snapshot, amount_cents, currency,
              terms_version, terms_accepted_at, recurring_consent_version,
              recurring_consented_at, recurring_consent_source, expires_at
            ) VALUES (
              v_sub.id, v_order_no, 'renewal:' || v_sub.id::text || ':' || to_char(v_sub.next_charge_at, 'YYYYMMDDHH24MISS'),
              'renewal', 'pending',
              v_plan.code, v_plan.display_name, v_plan.amount_cents, v_plan.currency,
              v_plan.terms_version, v_now, 'v1', v_now, 'auto_renewal',
              v_now + interval '3 days'
            )
            ON CONFLICT (subscription_id, idempotency_key) DO NOTHING
            RETURNING * INTO v_order;

            IF v_order.id IS NOT NULL THEN
              INSERT INTO billing.outbox_events (
                topic, aggregate_type, aggregate_id, dedupe_key, payload
              ) VALUES (
                'billing.subscription.renewal_due', 'order', v_order.id,
                'renewal-due:' || v_order.id::text,
                jsonb_build_object(
                  'subscription_id', v_sub.id,
                  'order_id', v_order.id,
                  'merchant_order_no', v_order.merchant_order_no,
                  'amount_cents', v_order.amount_cents,
                  'currency', v_order.currency,
                  'user_id', v_sub.user_id
                )
              ) ON CONFLICT (dedupe_key) DO NOTHING;

              subscription_id := v_sub.id;
              order_id := v_order.id;
              merchant_order_no := v_order.merchant_order_no;
              amount_cents := v_order.amount_cents;
              currency := v_order.currency;
              user_id := v_sub.user_id;
              next_charge_at := v_sub.next_charge_at;
              RETURN NEXT;
            END IF;
          END IF;
        END LOOP;
      END;
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.schedule_renewals(interval,integer) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.schedule_renewals(interval,integer) TO service_role")

    # 2. get_renewal_order_for_processing RPC
    op.execute("""
      CREATE OR REPLACE FUNCTION billing.get_renewal_order_for_processing(p_order_id uuid)
      RETURNS TABLE(
        order_id uuid,
        subscription_id uuid,
        user_id uuid,
        merchant_order_no text,
        amount_cents integer,
        currency text,
        plan_code text,
        token_ciphertext text,
        provider_token_ref text,
        subscription_status text,
        grace_ends_at timestamptz
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT o.id, s.id, s.user_id, o.merchant_order_no, o.amount_cents, o.currency,
               o.plan_code_snapshot, pm.token_ciphertext, pm.provider_token_ref,
               s.status, s.grace_ends_at
        FROM billing.orders o
        JOIN billing.subscriptions s ON s.id = o.subscription_id
        LEFT JOIN billing.payment_methods pm ON pm.subscription_id = s.id AND pm.revoked_at IS NULL
        WHERE o.id = p_order_id AND o.kind = 'renewal' AND o.status IN ('pending', 'processing')
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_renewal_order_for_processing(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_renewal_order_for_processing(uuid) TO service_role")

    # 3. apply_renewal_outcome RPC
    op.execute("""
      CREATE OR REPLACE FUNCTION billing.apply_renewal_outcome(
        p_order_id uuid,
        p_outcome text,
        p_provider_transaction_ref text DEFAULT NULL,
        p_failure_code text DEFAULT NULL,
        p_effective_at timestamptz DEFAULT now(),
        p_grace_days integer DEFAULT 7
      )
      RETURNS TABLE(
        order_id uuid,
        order_status text,
        subscription_id uuid,
        subscription_status text,
        already_processed boolean,
        grace_ends_at timestamptz
      )
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, public, pg_catalog AS $function$
      DECLARE
        v_order billing.orders%ROWTYPE;
        v_subscription billing.subscriptions%ROWTYPE;
        v_plan billing.plans%ROWTYPE;
        v_period_end timestamptz;
        v_attempt_no integer;
        v_grace_end timestamptz;
      BEGIN
        IF p_outcome NOT IN ('succeeded', 'failed') THEN
          RAISE EXCEPTION 'unsupported payment outcome';
        END IF;

        SELECT * INTO v_order FROM billing.orders WHERE id = p_order_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
        END IF;

        SELECT * INTO v_subscription FROM billing.subscriptions WHERE id = v_order.subscription_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'subscription not found' USING ERRCODE = 'P0002';
        END IF;

        IF v_order.status = 'paid' THEN
          RETURN QUERY SELECT v_order.id, v_order.status, v_subscription.id, v_subscription.status, true, v_subscription.grace_ends_at;
          RETURN;
        END IF;

        IF v_order.kind != 'renewal' THEN
          RAISE EXCEPTION 'order is not a renewal order';
        END IF;

        SELECT * INTO v_plan FROM billing.plans WHERE code = v_order.plan_code_snapshot;
        SELECT COALESCE(max(attempt_no), 0) + 1 INTO v_attempt_no
        FROM billing.payment_attempts pa WHERE pa.order_id = v_order.id;

        INSERT INTO billing.payment_attempts(
          order_id, attempt_no, provider_transaction_ref, status,
          failure_code, attempted_at, resolved_at
        ) VALUES (
          v_order.id, v_attempt_no, NULLIF(p_provider_transaction_ref, ''), p_outcome,
          CASE WHEN p_outcome = 'failed' THEN NULLIF(p_failure_code, '') END,
          p_effective_at, p_effective_at
        );

        IF p_outcome = 'succeeded' THEN
          v_period_end := GREATEST(COALESCE(v_subscription.current_period_ends_at, p_effective_at), p_effective_at) + make_interval(months => CASE v_plan.period
            WHEN 'month' THEN v_plan.period_count
            WHEN 'quarter' THEN v_plan.period_count * 3
            WHEN 'year' THEN v_plan.period_count * 12
          END);

          UPDATE billing.orders
          SET status = 'paid', paid_at = p_effective_at, updated_at = clock_timestamp()
          WHERE id = v_order.id;

          UPDATE billing.subscriptions
          SET status = 'active',
              current_period_starts_at = COALESCE(current_period_ends_at, p_effective_at),
              current_period_ends_at = v_period_end,
              next_charge_at = v_period_end,
              grace_ends_at = NULL,
              updated_at = clock_timestamp()
          WHERE id = v_subscription.id;

          INSERT INTO billing.entitlement_changes(
            subscription_id, order_id, reason, tier, status, effective_at, effective_until
          ) VALUES (
            v_subscription.id, v_order.id, 'renewal', 'pro', 'active', p_effective_at, v_period_end
          );

          INSERT INTO public.subscriptions(
            user_id, tier, status, price_plan_code, started_at, expires_at
          ) VALUES (
            v_subscription.user_id, 'pro', 'active', v_order.plan_code_snapshot, p_effective_at, v_period_end
          )
          ON CONFLICT (user_id) DO UPDATE SET
            tier = 'pro', status = 'active', price_plan_code = EXCLUDED.price_plan_code,
            expires_at = EXCLUDED.expires_at, updated_at = clock_timestamp();

          INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
          VALUES (
            'billing.renewal.succeeded', 'order', v_order.id,
            'renewal-succeeded:' || v_order.id::text,
            jsonb_build_object('order_id', v_order.id, 'subscription_id', v_subscription.id)
          ) ON CONFLICT (dedupe_key) DO NOTHING;

          RETURN QUERY SELECT v_order.id, 'paid'::text, v_subscription.id, 'active'::text, false, NULL::timestamptz;

        ELSE -- failed
          UPDATE billing.orders
          SET status = 'failed', failed_at = p_effective_at, updated_at = clock_timestamp()
          WHERE id = v_order.id;

          IF v_subscription.status = 'active' THEN
            v_grace_end := p_effective_at + make_interval(days => p_grace_days);
            UPDATE billing.subscriptions
            SET status = 'grace', grace_ends_at = v_grace_end, updated_at = clock_timestamp()
            WHERE id = v_subscription.id;

            INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
            VALUES (
              'billing.renewal.failed_grace_started', 'order', v_order.id,
              'renewal-grace-started:' || v_order.id::text,
              jsonb_build_object('order_id', v_order.id, 'subscription_id', v_subscription.id, 'grace_ends_at', v_grace_end)
            ) ON CONFLICT (dedupe_key) DO NOTHING;

            RETURN QUERY SELECT v_order.id, 'failed'::text, v_subscription.id, 'grace'::text, false, v_grace_end;

          ELSIF v_subscription.status = 'grace' AND (p_effective_at >= v_subscription.grace_ends_at) THEN
            -- Grace period expired -> expire subscription
            UPDATE billing.subscriptions
            SET status = 'expired', next_charge_at = NULL, updated_at = clock_timestamp()
            WHERE id = v_subscription.id;

            UPDATE billing.payment_methods
            SET revoked_at = clock_timestamp(), updated_at = clock_timestamp()
            WHERE subscription_id = v_subscription.id AND revoked_at IS NULL;

            INSERT INTO billing.entitlement_changes(
              subscription_id, order_id, reason, tier, status, effective_at, effective_until
            ) VALUES (
              v_subscription.id, v_order.id, 'grace_period_expired', 'free', 'revoked', p_effective_at, p_effective_at
            );

            INSERT INTO public.subscriptions(user_id, tier, status, updated_at)
            VALUES (v_subscription.user_id, 'free', 'expired', clock_timestamp())
            ON CONFLICT (user_id) DO UPDATE SET
              tier = 'free', status = 'expired', updated_at = clock_timestamp();

            INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
            VALUES (
              'billing.renewal.grace_expired', 'order', v_order.id,
              'renewal-grace-expired:' || v_order.id::text,
              jsonb_build_object('order_id', v_order.id, 'subscription_id', v_subscription.id)
            ) ON CONFLICT (dedupe_key) DO NOTHING;

            RETURN QUERY SELECT v_order.id, 'failed'::text, v_subscription.id, 'expired'::text, false, v_subscription.grace_ends_at;

          ELSE
            -- Still in grace period
            RETURN QUERY SELECT v_order.id, 'failed'::text, v_subscription.id, v_subscription.status, false, v_subscription.grace_ends_at;
          END IF;
        END IF;
      END;
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.apply_renewal_outcome(uuid,text,text,text,timestamptz,integer) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.apply_renewal_outcome(uuid,text,text,text,timestamptz,integer) TO service_role")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS billing.apply_renewal_outcome(uuid,text,text,text,timestamptz,integer)")
    op.execute("DROP FUNCTION IF EXISTS billing.get_renewal_order_for_processing(uuid)")
    op.execute("DROP FUNCTION IF EXISTS billing.schedule_renewals(interval,integer)")
