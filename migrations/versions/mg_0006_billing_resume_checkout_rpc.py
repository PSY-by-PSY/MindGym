"""Read an owner-scoped, still-payable order for checkout resumption."""
from alembic import op


revision = "mg_0006_billing_resume_checkout_rpc"
down_revision = "mg_0005_billing_order_status_rpc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
      CREATE FUNCTION billing.get_resumable_checkout_for_user(p_user_id uuid, p_order_id uuid)
      RETURNS TABLE(
        order_id uuid, merchant_order_no text, status text, amount_cents integer,
        currency text, plan_name text, expires_at timestamptz
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = billing, pg_catalog AS $function$
        SELECT o.id, o.merchant_order_no, o.status, o.amount_cents, o.currency,
               o.plan_name_snapshot, o.expires_at
        FROM billing.orders o
        JOIN billing.subscriptions s ON s.id = o.subscription_id
        WHERE o.id = p_order_id
          AND s.user_id = p_user_id
          AND o.status IN ('pending', 'processing')
          AND o.expires_at > now()
      $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid) TO service_role")


def downgrade() -> None:
    op.execute("DROP FUNCTION billing.get_resumable_checkout_for_user(uuid,uuid)")
