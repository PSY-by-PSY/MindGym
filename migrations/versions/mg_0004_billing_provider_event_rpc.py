"""Persist verified provider callback receipts idempotently."""
from alembic import op

revision = "mg_0004_billing_provider_event_rpc"
down_revision = "mg_0003_billing_checkout_rpc"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("""
      CREATE FUNCTION billing.record_provider_event(
        p_provider text, p_event_ref text, p_merchant_order_no text,
        p_signature_valid boolean, p_payload_redacted jsonb
      ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = billing, pg_catalog AS $function$
      DECLARE v_order_id uuid; v_event_id uuid;
      BEGIN
        SELECT id INTO v_order_id FROM billing.orders WHERE merchant_order_no = p_merchant_order_no;
        INSERT INTO billing.provider_events(provider,provider_event_ref,order_id,event_type,signature_valid,payload_redacted,processed_at)
        VALUES (p_provider,p_event_ref,v_order_id,'payment_callback',p_signature_valid,p_payload_redacted,NULL)
        ON CONFLICT (provider,provider_event_ref) DO UPDATE
          SET received_at=now(), signature_valid=EXCLUDED.signature_valid
        RETURNING id INTO v_event_id;
        RETURN v_event_id;
      END; $function$;
    """)
    op.execute("REVOKE ALL ON FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb) TO service_role")

def downgrade() -> None:
    op.execute("DROP FUNCTION billing.record_provider_event(text,text,text,boolean,jsonb)")
