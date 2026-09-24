"""Add the transactional checkout-intent RPC used by the FastAPI repository."""

from alembic import op


revision = "mg_0003_billing_checkout_rpc"
down_revision = "mg_0002_billing_recurring"
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


def downgrade() -> None:
    op.execute("DROP FUNCTION billing.create_pending_checkout(uuid,text,text,text,timestamptz,timestamptz,text)")
