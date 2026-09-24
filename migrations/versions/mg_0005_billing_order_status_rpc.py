"""Expose a minimal owner-scoped order status read model."""
from alembic import op
revision = "mg_0005_billing_order_status_rpc"
down_revision = "mg_0004_billing_provider_event_rpc"
branch_labels = None
depends_on = None

def upgrade() -> None:
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

def downgrade() -> None:
    op.execute("DROP FUNCTION billing.get_order_for_user(uuid,uuid)")
