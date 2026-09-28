"""billing cancellation and lifecycle

Revision ID: mg_0004_billing_lifecycle
Revises: mg_0003_billing_workflow
Create Date: 2026-09-28 14:00:00.000000
"""

from alembic import op

revision = "mg_0004_billing_lifecycle"
down_revision = "mg_0003_billing_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. User subscription cancellation RPC
    op.execute("""
      CREATE FUNCTION billing.cancel_subscription_for_user(p_user_id uuid, p_reason text)
      RETURNS TABLE(
        subscription_id uuid,
        status text,
        current_period_ends_at timestamptz,
        cancel_at timestamptz,
        provider_token_ref text,
        token_ciphertext text
      )
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
      DECLARE
        v_sub billing.subscriptions%ROWTYPE;
        v_pm billing.payment_methods%ROWTYPE;
      BEGIN
        -- Find the current active, grace, or cancel_scheduled subscription
        SELECT * INTO v_sub
        FROM billing.subscriptions
        WHERE user_id = p_user_id
          AND status IN ('active', 'grace', 'cancel_scheduled')
        ORDER BY created_at DESC
        LIMIT 1;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'no active subscription found for user'
            USING ERRCODE = 'P0002';
        END IF;

        -- Fetch payment method if present
        SELECT * INTO v_pm
        FROM billing.payment_methods
        WHERE subscription_id = v_sub.id
        ORDER BY created_at DESC
        LIMIT 1;

        -- If already cancel_scheduled, return existing record idempotently
        IF v_sub.status = 'cancel_scheduled' THEN
          RETURN QUERY SELECT
            v_sub.id, v_sub.status, v_sub.current_period_ends_at,
            v_sub.cancel_at, v_pm.provider_token_ref, v_pm.token_ciphertext;
          RETURN;
        END IF;

        -- Update subscription: schedule cancel at period end, stop renewal charges
        UPDATE billing.subscriptions
        SET status = 'cancel_scheduled',
            cancel_at = COALESCE(current_period_ends_at, clock_timestamp()),
            canceled_at = clock_timestamp(),
            next_charge_at = NULL,
            updated_at = clock_timestamp()
        WHERE id = v_sub.id
        RETURNING * INTO v_sub;

        -- Revoke payment method renewal authorization
        IF v_pm.id IS NOT NULL AND v_pm.revoked_at IS NULL THEN
          UPDATE billing.payment_methods
          SET revoked_at = clock_timestamp(),
              updated_at = clock_timestamp()
          WHERE id = v_pm.id
          RETURNING * INTO v_pm;
        END IF;

        -- Record entitlement change audit log (reason = 'user_canceled_renewal')
        INSERT INTO billing.entitlement_changes (
          subscription_id, reason, tier, status, effective_at, effective_until
        ) VALUES (
          v_sub.id, COALESCE(p_reason, 'user_canceled_renewal'), 'pro', 'active',
          clock_timestamp(), v_sub.current_period_ends_at
        );

        RETURN QUERY SELECT
          v_sub.id, v_sub.status, v_sub.current_period_ends_at,
          v_sub.cancel_at, v_pm.provider_token_ref, v_pm.token_ciphertext;
      END;
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.cancel_subscription_for_user(uuid,text) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.cancel_subscription_for_user(uuid,text) TO service_role")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS billing.cancel_subscription_for_user(uuid,text)")
