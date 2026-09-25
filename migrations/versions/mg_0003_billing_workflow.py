"""Add the billing checkout, callback, and owner read-model workflow RPCs."""

from alembic import op


revision = "mg_0003_billing_workflow"
down_revision = "mg_0002_billing_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION billing.create_pending_checkout(
          p_user_id uuid,
          p_plan_code text,
          p_idempotency_key text,
          p_terms_version text,
          p_terms_accepted_at timestamptz,
          p_order_expires_at timestamptz,
          p_merchant_order_no text
        ) RETURNS TABLE (
          order_id uuid,
          subscription_id uuid,
          merchant_order_no text,
          order_status text,
          amount_cents integer,
          currency text,
          expires_at timestamptz,
          reused boolean
        )
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = billing, public, pg_catalog
        AS $function$
        DECLARE
          v_plan billing.plans%ROWTYPE;
          v_subscription billing.subscriptions%ROWTYPE;
          v_order billing.orders%ROWTYPE;
        BEGIN
          IF p_user_id IS NULL OR p_plan_code = '' OR p_idempotency_key = '' OR p_merchant_order_no = '' THEN
            RAISE EXCEPTION 'checkout identity fields are required';
          END IF;
          IF p_order_expires_at <= now() OR p_terms_accepted_at > now() + interval '5 minutes' THEN
            RAISE EXCEPTION 'invalid checkout timestamps';
          END IF;

          SELECT * INTO v_plan FROM billing.plans
          WHERE code = p_plan_code AND active = true;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'sellable plan not found';
          END IF;
          IF v_plan.terms_version <> p_terms_version THEN
            RAISE EXCEPTION 'terms version is no longer current';
          END IF;

          SELECT s.* INTO v_subscription
          FROM billing.subscriptions s
          WHERE s.user_id = p_user_id
            AND s.status IN ('pending', 'active', 'grace', 'cancel_scheduled')
          FOR UPDATE;

          IF FOUND THEN
            SELECT o.* INTO v_order
            FROM billing.orders o
            WHERE o.subscription_id = v_subscription.id
              AND o.idempotency_key = p_idempotency_key
            FOR UPDATE;
            IF FOUND THEN
              RETURN QUERY SELECT v_order.id, v_subscription.id, v_order.merchant_order_no,
                v_order.status, v_order.amount_cents, v_order.currency, v_order.expires_at, true;
              RETURN;
            END IF;
            IF v_subscription.status = 'pending' THEN
              RAISE EXCEPTION 'another pending checkout exists';
            END IF;
            RAISE EXCEPTION 'an active subscription already exists';
          END IF;

          INSERT INTO billing.subscriptions(user_id, plan_code, status)
          VALUES (p_user_id, v_plan.code, 'pending')
          RETURNING * INTO v_subscription;

          INSERT INTO billing.orders(
            subscription_id, merchant_order_no, idempotency_key, kind, status,
            plan_code_snapshot, plan_name_snapshot, amount_cents, currency,
            terms_version, terms_accepted_at, expires_at
          ) VALUES (
            v_subscription.id, p_merchant_order_no, p_idempotency_key, 'initial', 'pending',
            v_plan.code, v_plan.display_name, v_plan.amount_cents, v_plan.currency,
            p_terms_version, p_terms_accepted_at, p_order_expires_at
          ) RETURNING * INTO v_order;

          INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
          VALUES (
            'billing.checkout.created', 'order', v_order.id, 'checkout-created:' || v_order.id::text,
            jsonb_build_object('order_id', v_order.id, 'subscription_id', v_subscription.id)
          );

          RETURN QUERY SELECT v_order.id, v_subscription.id, v_order.merchant_order_no,
            v_order.status, v_order.amount_cents, v_order.currency, v_order.expires_at, false;
        END;
        $function$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION billing.create_pending_checkout(uuid,text,text,text,timestamptz,timestamptz,text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.create_pending_checkout(uuid,text,text,text,timestamptz,timestamptz,text) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.record_provider_event(
        p_provider text, p_event_ref text, p_merchant_order_no text,
        p_signature_valid boolean, p_payload_redacted jsonb
      ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = billing, pg_catalog AS $function$
      DECLARE v_order_id uuid; v_event_id uuid;
      BEGIN
        SELECT id INTO v_order_id FROM billing.orders WHERE merchant_order_no = p_merchant_order_no;
        INSERT INTO billing.provider_events(
          provider, provider_event_ref, order_id, event_type,
          signature_valid, payload_redacted, processed_at
        ) VALUES (
          p_provider, p_event_ref, v_order_id, 'payment_callback',
          p_signature_valid, p_payload_redacted, NULL
        ) ON CONFLICT (provider, provider_event_ref) DO UPDATE
          SET received_at = now(), signature_valid = EXCLUDED.signature_valid
        RETURNING id INTO v_event_id;
        INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
        VALUES (
          'billing.provider_callback.received', 'provider_event', v_event_id,
          'provider-event:' || v_event_id::text,
          jsonb_build_object('provider_event_id', v_event_id)
        ) ON CONFLICT (dedupe_key) DO NOTHING;
        RETURN v_event_id;
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.get_order_for_user(p_user_id uuid, p_order_id uuid)
      RETURNS TABLE(id uuid,status text,paid_at timestamptz,expires_at timestamptz,can_resume boolean)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT o.id,o.status,o.paid_at,o.expires_at,
          o.status IN ('pending','processing') AND o.expires_at > now()
        FROM billing.orders o JOIN billing.subscriptions s ON s.id=o.subscription_id
        WHERE o.id=p_order_id AND s.user_id=p_user_id
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_order_for_user(uuid,uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_order_for_user(uuid,uuid) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.get_resumable_checkout_for_user(p_user_id uuid, p_order_id uuid)
      RETURNS TABLE(
        order_id uuid, merchant_order_no text, status text, amount_cents integer,
        currency text, plan_name text, expires_at timestamptz
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT o.id, o.merchant_order_no, o.status, o.amount_cents, o.currency,
               o.plan_name_snapshot, o.expires_at
        FROM billing.orders o JOIN billing.subscriptions s ON s.id = o.subscription_id
        WHERE o.id = p_order_id AND s.user_id = p_user_id
          AND o.status IN ('pending', 'processing') AND o.expires_at > now()
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.get_overview_for_user(p_user_id uuid)
      RETURNS TABLE(
        subscription_id uuid, plan_code text, subscription_status text,
        current_period_ends_at timestamptz, next_charge_at timestamptz,
        cancel_at timestamptz, orders jsonb
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        WITH current_subscription AS (
          SELECT s.* FROM billing.subscriptions s WHERE s.user_id = p_user_id
          ORDER BY s.created_at DESC LIMIT 1
        )
        SELECT s.id, s.plan_code, s.status, s.current_period_ends_at,
               s.next_charge_at, s.cancel_at,
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'id', o.id, 'status', o.status, 'kind', o.kind,
                   'amount_cents', o.amount_cents, 'currency', o.currency,
                   'created_at', o.created_at, 'paid_at', o.paid_at,
                   'expires_at', o.expires_at
                 ) ORDER BY o.created_at DESC)
                 FROM billing.orders o JOIN billing.subscriptions os ON os.id = o.subscription_id
                 WHERE os.user_id = p_user_id
               ), '[]'::jsonb)
        FROM current_subscription s
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_overview_for_user(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_overview_for_user(uuid) TO service_role")

    # Only a provider adapter with an approved, verified outcome contract may call
    # this function. Generic UPP callbacks are intentionally not mapped to it.
    op.execute("""
      CREATE FUNCTION billing.apply_initial_payment_outcome(
        p_provider_event_id uuid,
        p_outcome text,
        p_provider_transaction_ref text,
        p_failure_code text DEFAULT NULL,
        p_effective_at timestamptz DEFAULT now()
      ) RETURNS TABLE(order_id uuid, order_status text, subscription_id uuid, already_processed boolean)
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, public, pg_catalog AS $function$
      DECLARE
        v_event billing.provider_events%ROWTYPE;
        v_order billing.orders%ROWTYPE;
        v_subscription billing.subscriptions%ROWTYPE;
        v_plan billing.plans%ROWTYPE;
        v_period_end timestamptz;
        v_attempt_no integer;
      BEGIN
        IF p_outcome NOT IN ('succeeded', 'failed') THEN
          RAISE EXCEPTION 'unsupported payment outcome';
        END IF;
        IF p_outcome = 'succeeded' AND COALESCE(p_provider_transaction_ref, '') = '' THEN
          RAISE EXCEPTION 'successful payment requires provider transaction reference';
        END IF;

        SELECT * INTO v_event FROM billing.provider_events
        WHERE id = p_provider_event_id FOR UPDATE;
        IF NOT FOUND OR NOT v_event.signature_valid OR v_event.order_id IS NULL THEN
          RAISE EXCEPTION 'verified provider event with known order is required';
        END IF;

        SELECT * INTO v_order FROM billing.orders WHERE id = v_event.order_id FOR UPDATE;
        SELECT * INTO v_subscription FROM billing.subscriptions WHERE id = v_order.subscription_id FOR UPDATE;
        IF v_event.processed_at IS NOT NULL THEN
          RETURN QUERY SELECT v_order.id, v_order.status, v_subscription.id, true;
          RETURN;
        END IF;
        IF v_order.kind <> 'initial' OR v_order.status NOT IN ('pending', 'processing') THEN
          RAISE EXCEPTION 'order is not an unapplied initial payment';
        END IF;

        SELECT * INTO v_plan FROM billing.plans WHERE code = v_order.plan_code_snapshot;
        SELECT COALESCE(max(attempt_no), 0) + 1 INTO v_attempt_no
        FROM billing.payment_attempts WHERE order_id = v_order.id;

        INSERT INTO billing.payment_attempts(
          order_id, attempt_no, provider_transaction_ref, status,
          failure_code, attempted_at, resolved_at
        ) VALUES (
          v_order.id, v_attempt_no, NULLIF(p_provider_transaction_ref, ''), p_outcome,
          CASE WHEN p_outcome = 'failed' THEN NULLIF(p_failure_code, '') END,
          p_effective_at, p_effective_at
        );

        IF p_outcome = 'succeeded' THEN
          v_period_end := p_effective_at + make_interval(months => CASE v_plan.period
            WHEN 'month' THEN v_plan.period_count
            WHEN 'quarter' THEN v_plan.period_count * 3
            WHEN 'year' THEN v_plan.period_count * 12
          END);
          UPDATE billing.orders SET status = 'paid', paid_at = p_effective_at, updated_at = now()
          WHERE id = v_order.id;
          UPDATE billing.subscriptions
          SET status = 'active', current_period_starts_at = p_effective_at,
              current_period_ends_at = v_period_end, next_charge_at = v_period_end,
              updated_at = now()
          WHERE id = v_subscription.id;
          INSERT INTO billing.entitlement_changes(
            subscription_id, order_id, reason, tier, status, effective_at, effective_until
          ) VALUES (v_subscription.id, v_order.id, 'initial_payment', 'pro', 'active', p_effective_at, v_period_end);
          INSERT INTO public.subscriptions(
            user_id, tier, status, price_plan_code, started_at, expires_at
          ) VALUES (v_subscription.user_id, 'pro', 'active', v_order.plan_code_snapshot, p_effective_at, v_period_end)
          ON CONFLICT (user_id) DO UPDATE SET
            tier = 'pro', status = 'active', price_plan_code = EXCLUDED.price_plan_code,
            started_at = EXCLUDED.started_at, expires_at = EXCLUDED.expires_at, updated_at = now();
          INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
          VALUES (
            'billing.payment.succeeded', 'order', v_order.id,
            'payment-succeeded:' || v_order.id::text,
            jsonb_build_object('order_id', v_order.id, 'subscription_id', v_subscription.id)
          ) ON CONFLICT (dedupe_key) DO NOTHING;
        ELSE
          UPDATE billing.orders SET status = 'failed', failed_at = p_effective_at, updated_at = now()
          WHERE id = v_order.id;
          UPDATE billing.subscriptions SET status = 'expired', updated_at = now()
          WHERE id = v_subscription.id;
          INSERT INTO billing.outbox_events(topic, aggregate_type, aggregate_id, dedupe_key, payload)
          VALUES (
            'billing.payment.failed', 'order', v_order.id,
            'payment-failed:' || v_order.id::text,
            jsonb_build_object('order_id', v_order.id, 'subscription_id', v_subscription.id)
          ) ON CONFLICT (dedupe_key) DO NOTHING;
        END IF;

        UPDATE billing.provider_events SET processed_at = now(), process_error = NULL WHERE id = v_event.id;
        RETURN QUERY SELECT v_order.id, p_outcome, v_subscription.id, false;
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.apply_initial_payment_outcome(uuid,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.apply_initial_payment_outcome(uuid,text,text,text,timestamptz) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.get_provider_event_for_processing(p_event_id uuid)
      RETURNS TABLE(event_id uuid, provider text, order_id uuid, payload_redacted jsonb)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT e.id, e.provider, e.order_id, e.payload_redacted
        FROM billing.provider_events e
        WHERE e.id = p_event_id AND e.signature_valid AND e.processed_at IS NULL
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_provider_event_for_processing(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_provider_event_for_processing(uuid) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.complete_outbox_event(p_event_id uuid)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
      BEGIN
        UPDATE billing.outbox_events
        SET status = 'processed', processed_at = now(), lease_until = NULL, updated_at = now()
        WHERE id = p_event_id AND status = 'processing';
        RETURN FOUND;
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.complete_outbox_event(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.complete_outbox_event(uuid) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.reschedule_outbox_event(
        p_event_id uuid, p_error text, p_delay_seconds integer DEFAULT 900,
        p_max_attempts integer DEFAULT 20
      ) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
      DECLARE v_attempt_count integer;
      BEGIN
        IF p_delay_seconds < 60 OR p_delay_seconds > 86400 OR p_max_attempts < 1 OR p_max_attempts > 100 THEN
          RAISE EXCEPTION 'invalid outbox retry delay';
        END IF;
        SELECT attempt_count INTO v_attempt_count FROM billing.outbox_events
        WHERE id = p_event_id AND status = 'processing' FOR UPDATE;
        IF NOT FOUND THEN
          RETURN 'not_claimed';
        END IF;
        IF v_attempt_count >= p_max_attempts THEN
          UPDATE billing.outbox_events
          SET status = 'dead', lease_until = NULL, last_error = left(COALESCE(p_error, ''), 500), updated_at = now()
          WHERE id = p_event_id;
          RETURN 'dead';
        END IF;
        UPDATE billing.outbox_events
        SET status = 'pending', available_at = now() + make_interval(secs => p_delay_seconds),
            lease_until = NULL, last_error = left(COALESCE(p_error, ''), 500), updated_at = now()
        WHERE id = p_event_id;
        RETURN 'rescheduled';
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.reschedule_outbox_event(uuid,text,integer,integer) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.reschedule_outbox_event(uuid,text,integer,integer) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.claim_outbox_events_by_topic(
        p_topic text, p_limit integer DEFAULT 20, p_lease_seconds integer DEFAULT 60
      ) RETURNS SETOF billing.outbox_events
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
      BEGIN
        IF p_topic = '' OR p_limit < 1 OR p_limit > 100 OR p_lease_seconds < 1 OR p_lease_seconds > 3600 THEN
          RAISE EXCEPTION 'invalid outbox claim bounds';
        END IF;
        RETURN QUERY
        WITH candidates AS (
          SELECT id FROM billing.outbox_events
          WHERE topic = p_topic AND available_at <= now()
            AND (status = 'pending' OR (status = 'processing' AND lease_until < now()))
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED LIMIT p_limit
        )
        UPDATE billing.outbox_events e
        SET status = 'processing', lease_until = now() + make_interval(secs => p_lease_seconds),
            attempt_count = e.attempt_count + 1, updated_at = now()
        FROM candidates c WHERE e.id = c.id
        RETURNING e.*;
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.claim_outbox_events_by_topic(text,integer,integer) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.claim_outbox_events_by_topic(text,integer,integer) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.dead_letter_outbox_event(p_event_id uuid, p_error text)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
      BEGIN
        UPDATE billing.outbox_events
        SET status = 'dead', lease_until = NULL, last_error = left(COALESCE(p_error, ''), 500), updated_at = now()
        WHERE id = p_event_id AND status = 'processing';
        RETURN FOUND;
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.dead_letter_outbox_event(uuid,text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.dead_letter_outbox_event(uuid,text) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.get_outbox_health(p_topic text DEFAULT NULL)
      RETURNS TABLE(topic text, status text, event_count bigint, oldest_created_at timestamptz)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT e.topic, e.status, count(*)::bigint, min(e.created_at)
        FROM billing.outbox_events e
        WHERE p_topic IS NULL OR e.topic = p_topic
        GROUP BY e.topic, e.status
        ORDER BY e.topic, e.status
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_outbox_health(text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_outbox_health(text) TO service_role")

    op.execute("""
      CREATE FUNCTION billing.list_dead_outbox_events(p_topic text DEFAULT NULL, p_limit integer DEFAULT 50)
      RETURNS TABLE(
        id uuid, topic text, aggregate_type text, aggregate_id uuid, attempt_count integer,
        last_error text, created_at timestamptz, updated_at timestamptz, payload jsonb
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT e.id, e.topic, e.aggregate_type, e.aggregate_id, e.attempt_count,
               e.last_error, e.created_at, e.updated_at, e.payload
        FROM billing.outbox_events e
        WHERE e.status = 'dead' AND (p_topic IS NULL OR e.topic = p_topic)
        ORDER BY e.updated_at DESC
        LIMIT LEAST(GREATEST(p_limit, 1), 100)
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.list_dead_outbox_events(text,integer) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.list_dead_outbox_events(text,integer) TO service_role")


def downgrade() -> None:
    op.execute("DROP FUNCTION billing.list_dead_outbox_events(text,integer)")
    op.execute("DROP FUNCTION billing.get_outbox_health(text)")
    op.execute("DROP FUNCTION billing.dead_letter_outbox_event(uuid,text)")
    op.execute("DROP FUNCTION billing.claim_outbox_events_by_topic(text,integer,integer)")
    op.execute("DROP FUNCTION billing.reschedule_outbox_event(uuid,text,integer,integer)")
    op.execute("DROP FUNCTION billing.complete_outbox_event(uuid)")
    op.execute("DROP FUNCTION billing.get_provider_event_for_processing(uuid)")
    op.execute("DROP FUNCTION billing.apply_initial_payment_outcome(uuid,text,text,text,timestamptz)")
    op.execute("DROP FUNCTION billing.get_overview_for_user(uuid)")
    op.execute("DROP FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid)")
    op.execute("DROP FUNCTION billing.get_order_for_user(uuid,uuid)")
    op.execute("DROP FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb)")
    op.execute("DROP FUNCTION billing.create_pending_checkout(uuid,text,text,text,timestamptz,timestamptz,text)")
