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


def downgrade() -> None:
    op.execute("DROP FUNCTION billing.get_overview_for_user(uuid)")
    op.execute("DROP FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid)")
    op.execute("DROP FUNCTION billing.get_order_for_user(uuid,uuid)")
    op.execute("DROP FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb)")
    op.execute("DROP FUNCTION billing.create_pending_checkout(uuid,text,text,text,timestamptz,timestamptz,text)")
