"""Queue verified provider callbacks for asynchronous, idempotent processing."""
from alembic import op


revision = "mg_0008_billing_callback_outbox"
down_revision = "mg_0007_billing_overview_rpc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Replacing the existing receipt function retains its PostgREST contract while
    # ensuring receipt persistence and queue publication share one transaction.
    op.execute("""
      CREATE OR REPLACE FUNCTION billing.record_provider_event(
        p_provider text, p_event_ref text, p_merchant_order_no text,
        p_signature_valid boolean, p_payload_redacted jsonb
      ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = billing, pg_catalog AS $function$
      DECLARE v_order_id uuid; v_event_id uuid;
      BEGIN
        SELECT id INTO v_order_id
        FROM billing.orders
        WHERE merchant_order_no = p_merchant_order_no;

        INSERT INTO billing.provider_events(
          provider, provider_event_ref, order_id, event_type,
          signature_valid, payload_redacted, processed_at
        ) VALUES (
          p_provider, p_event_ref, v_order_id, 'payment_callback',
          p_signature_valid, p_payload_redacted, NULL
        ) ON CONFLICT (provider, provider_event_ref) DO UPDATE
          SET received_at = now(), signature_valid = EXCLUDED.signature_valid
        RETURNING id INTO v_event_id;

        INSERT INTO billing.outbox_events(
          topic, aggregate_type, aggregate_id, dedupe_key, payload
        ) VALUES (
          'billing.provider_callback.received', 'provider_event', v_event_id,
          'provider-event:' || v_event_id::text,
          jsonb_build_object('provider_event_id', v_event_id)
        ) ON CONFLICT (dedupe_key) DO NOTHING;

        RETURN v_event_id;
      END; $function$;
    """)


def downgrade() -> None:
    op.execute("""
      CREATE OR REPLACE FUNCTION billing.record_provider_event(
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
