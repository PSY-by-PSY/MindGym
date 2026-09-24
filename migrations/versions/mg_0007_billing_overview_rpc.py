"""Expose a minimal owner-scoped billing overview read model."""
from alembic import op


revision = "mg_0007_billing_overview_rpc"
down_revision = "mg_0006_billing_resume_checkout_rpc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
      CREATE FUNCTION billing.get_overview_for_user(p_user_id uuid)
      RETURNS TABLE(
        subscription_id uuid, plan_code text, subscription_status text,
        current_period_ends_at timestamptz, next_charge_at timestamptz,
        cancel_at timestamptz, orders jsonb
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        WITH current_subscription AS (
          SELECT s.*
          FROM billing.subscriptions s
          WHERE s.user_id = p_user_id
          ORDER BY s.created_at DESC
          LIMIT 1
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
                 FROM billing.orders o
                 JOIN billing.subscriptions os ON os.id = o.subscription_id
                 WHERE os.user_id = p_user_id
               ), '[]'::jsonb)
        FROM current_subscription s
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_overview_for_user(uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_overview_for_user(uuid) TO service_role")


def downgrade() -> None:
    op.execute("DROP FUNCTION billing.get_overview_for_user(uuid)")
