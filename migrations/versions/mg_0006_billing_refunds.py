"""admin refunds and atomic entitlement revocation

Revision ID: mg_0006_billing_refunds
Revises: mg_0005_entitlement_cutover
Create Date: 2026-09-28 17:00:00.000000
"""

from alembic import op

revision = "mg_0006_billing_refunds"
down_revision = "mg_0005_entitlement_cutover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
      CREATE OR REPLACE FUNCTION billing.process_admin_refund(
        p_order_id uuid,
        p_amount_cents integer,
        p_reason text,
        p_requested_by uuid,
        p_idempotency_key text,
        p_provider_refund_ref text
      )
      RETURNS TABLE(
        refund_id uuid,
        order_id uuid,
        status text,
        amount_cents integer,
        reason text,
        succeeded_at timestamptz
      )
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, public, pg_catalog AS $function$
      DECLARE
        v_order billing.orders%ROWTYPE;
        v_sub billing.subscriptions%ROWTYPE;
        v_refund billing.refunds%ROWTYPE;
        v_ref_no text;
      BEGIN
        -- 1. Verify order exists and is paid
        SELECT * INTO v_order
        FROM billing.orders
        WHERE id = p_order_id FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
        END IF;

        IF v_order.status != 'paid' THEN
          RAISE EXCEPTION 'cannot refund non-paid order' USING ERRCODE = 'P0001';
        END IF;

        -- 2. Check for existing refund with same order_id & idempotency_key
        SELECT * INTO v_refund
        FROM billing.refunds
        WHERE order_id = p_order_id AND idempotency_key = p_idempotency_key;

        IF FOUND THEN
          RETURN QUERY SELECT
            v_refund.id, v_refund.order_id, v_refund.status,
            v_refund.amount_cents, v_refund.reason, v_refund.succeeded_at;
          RETURN;
        END IF;

        v_ref_no := COALESCE(p_provider_refund_ref, 'REFUND-' || p_order_id::text || '-' || clock_timestamp()::text);

        -- 3. Create refund record
        INSERT INTO billing.refunds (
          order_id, idempotency_key, status, amount_cents, reason,
          provider_refund_ref, requested_by, succeeded_at
        ) VALUES (
          p_order_id, p_idempotency_key, 'succeeded', p_amount_cents, p_reason,
          v_ref_no, p_requested_by, clock_timestamp()
        ) RETURNING * INTO v_refund;

        -- 4. Update order status to refunded
        UPDATE billing.orders
        SET status = 'refunded', updated_at = clock_timestamp()
        WHERE id = p_order_id;

        -- 5. Atomically revoke subscription & entitlement
        IF v_order.subscription_id IS NOT NULL THEN
          SELECT * INTO v_sub FROM billing.subscriptions WHERE id = v_order.subscription_id FOR UPDATE;

          IF FOUND THEN
            UPDATE billing.subscriptions
            SET status = 'canceled',
                canceled_at = clock_timestamp(),
                next_charge_at = NULL,
                updated_at = clock_timestamp()
            WHERE id = v_sub.id;

            -- Revoke payment method
            UPDATE billing.payment_methods
            SET revoked_at = clock_timestamp(), updated_at = clock_timestamp()
            WHERE subscription_id = v_sub.id AND revoked_at IS NULL;

            -- Insert entitlement change log (revoked)
            INSERT INTO billing.entitlement_changes (
              subscription_id, order_id, reason, tier, status, effective_at, effective_until
            ) VALUES (
              v_sub.id, p_order_id, COALESCE(p_reason, 'admin_refund'), 'free', 'revoked',
              clock_timestamp(), clock_timestamp()
            );

            -- Update public.subscriptions projection to free
            INSERT INTO public.subscriptions (user_id, tier, status, updated_at)
            VALUES (v_sub.user_id, 'free', 'canceled', clock_timestamp())
            ON CONFLICT (user_id) DO UPDATE SET
              tier = 'free', status = 'canceled', updated_at = clock_timestamp();
          END IF;
        END IF;

        -- 6. Insert outbox event
        INSERT INTO billing.outbox_events (
          topic, aggregate_type, aggregate_id, dedupe_key, payload
        ) VALUES (
          'billing.refund.succeeded', 'refund', v_refund.id,
          'refund-succeeded:' || v_refund.id::text,
          jsonb_build_object('refund_id', v_refund.id, 'order_id', p_order_id, 'amount_cents', p_amount_cents)
        ) ON CONFLICT (dedupe_key) DO NOTHING;

        RETURN QUERY SELECT
          v_refund.id, v_refund.order_id, v_refund.status,
          v_refund.amount_cents, v_refund.reason, v_refund.succeeded_at;
      END;
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.process_admin_refund(uuid,integer,text,uuid,text,text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.process_admin_refund(uuid,integer,text,uuid,text,text) TO service_role")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS billing.process_admin_refund(uuid,integer,text,uuid,text,text)")
