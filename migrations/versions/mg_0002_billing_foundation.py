"""Add the private recurring-billing ledger and durable outbox foundation.

This revision deliberately contains no PAYUNi wire fields or credentials.  It
creates the provider-neutral persistence boundary needed before sandbox work.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg


revision = "mg_0002_billing_foundation"
down_revision = "mg_0001_baseline"
branch_labels = None
depends_on = None


SCHEMA = "billing"


def _uuid_pk() -> tuple[sa.Column]:
    return (
        sa.Column(
            "id",
            pg.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
    )


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def upgrade() -> None:
    op.execute("CREATE SCHEMA billing AUTHORIZATION postgres")

    op.create_table(
        "plans",
        sa.Column("code", sa.Text(), primary_key=True),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("period", sa.Text(), nullable=False),
        sa.Column("period_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False, server_default="TWD"),
        sa.Column("terms_version", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.CheckConstraint("period IN ('month', 'quarter', 'year')", name="plans_period_check"),
        sa.CheckConstraint("period_count > 0", name="plans_period_count_check"),
        sa.CheckConstraint("amount_cents > 0", name="plans_amount_check"),
        schema=SCHEMA,
    )

    op.create_table(
        "subscriptions",
        *_uuid_pk(),
        sa.Column("user_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_code", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False, server_default="payuni"),
        sa.Column("provider_subscription_ref", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("current_period_starts_at", sa.DateTime(timezone=True)),
        sa.Column("current_period_ends_at", sa.DateTime(timezone=True)),
        sa.Column("next_charge_at", sa.DateTime(timezone=True)),
        sa.Column("cancel_at", sa.DateTime(timezone=True)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
        sa.Column("grace_ends_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["public.profiles.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["plan_code"], ["billing.plans.code"], ondelete="RESTRICT"),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'grace', 'cancel_scheduled', 'canceled', 'expired')",
            name="subscriptions_status_check",
        ),
        sa.UniqueConstraint("provider", "provider_subscription_ref", name="subscriptions_provider_ref_key"),
        schema=SCHEMA,
    )
    op.create_index(
        "subscriptions_one_live_per_user",
        "subscriptions",
        ["user_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("status IN ('pending', 'active', 'grace', 'cancel_scheduled')"),
    )
    op.create_index("subscriptions_due_idx", "subscriptions", ["next_charge_at"], schema=SCHEMA)

    op.create_table(
        "orders",
        *_uuid_pk(),
        sa.Column("subscription_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("merchant_order_no", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("plan_code_snapshot", sa.Text(), nullable=False),
        sa.Column("plan_name_snapshot", sa.Text(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False),
        sa.Column("terms_version", sa.Text(), nullable=False),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("failed_at", sa.DateTime(timezone=True)),
        sa.Column("anomaly_code", sa.Text()),
        *_timestamps(),
        sa.ForeignKeyConstraint(["subscription_id"], ["billing.subscriptions.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("merchant_order_no", name="orders_merchant_order_no_key"),
        sa.UniqueConstraint("subscription_id", "idempotency_key", name="orders_idempotency_key"),
        sa.CheckConstraint("kind IN ('initial', 'renewal')", name="orders_kind_check"),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'canceled', 'refunded', 'partially_refunded')",
            name="orders_status_check",
        ),
        sa.CheckConstraint("amount_cents > 0", name="orders_amount_check"),
        schema=SCHEMA,
    )
    op.create_index(
        "orders_one_pending_initial",
        "orders",
        ["subscription_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("kind = 'initial' AND status IN ('pending', 'processing')"),
    )
    op.create_index("orders_subscription_created_idx", "orders", ["subscription_id", "created_at"], schema=SCHEMA)

    op.create_table(
        "payment_attempts",
        *_uuid_pk(),
        sa.Column("order_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("provider_transaction_ref", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("failure_code", sa.Text()),
        sa.Column("failure_message", sa.Text()),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["order_id"], ["billing.orders.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("order_id", "attempt_no", name="payment_attempts_order_attempt_key"),
        sa.UniqueConstraint("provider_transaction_ref", name="payment_attempts_provider_ref_key"),
        sa.CheckConstraint("attempt_no > 0", name="payment_attempts_number_check"),
        sa.CheckConstraint(
            "status IN ('created', 'processing', 'succeeded', 'failed', 'unknown')",
            name="payment_attempts_status_check",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "payment_methods",
        *_uuid_pk(),
        sa.Column("subscription_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False, server_default="payuni"),
        sa.Column("provider_token_ref", sa.Text()),
        sa.Column("token_ciphertext", sa.Text()),
        sa.Column("card_masked", sa.Text()),
        sa.Column("card_brand", sa.Text()),
        sa.Column("token_expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["subscription_id"], ["billing.subscriptions.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("subscription_id", name="payment_methods_subscription_key"),
        schema=SCHEMA,
    )

    op.create_table(
        "provider_events",
        *_uuid_pk(),
        sa.Column("provider", sa.Text(), nullable=False, server_default="payuni"),
        sa.Column("provider_event_ref", sa.Text(), nullable=False),
        sa.Column("order_id", pg.UUID(as_uuid=True)),
        sa.Column("event_type", sa.Text()),
        sa.Column("signature_valid", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload_redacted", pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("process_error", sa.Text()),
        sa.ForeignKeyConstraint(["order_id"], ["billing.orders.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("provider", "provider_event_ref", name="provider_events_ref_key"),
        schema=SCHEMA,
    )

    op.create_table(
        "refunds",
        *_uuid_pk(),
        sa.Column("order_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("provider_refund_ref", sa.Text()),
        sa.Column("requested_by", pg.UUID(as_uuid=True)),
        sa.Column("succeeded_at", sa.DateTime(timezone=True)),
        sa.Column("failed_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["order_id"], ["billing.orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requested_by"], ["public.profiles.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("order_id", "idempotency_key", name="refunds_idempotency_key"),
        sa.UniqueConstraint("provider_refund_ref", name="refunds_provider_ref_key"),
        sa.CheckConstraint("status IN ('pending', 'processing', 'succeeded', 'failed')", name="refunds_status_check"),
        sa.CheckConstraint("amount_cents > 0", name="refunds_amount_check"),
        schema=SCHEMA,
    )

    op.create_table(
        "invoices",
        *_uuid_pk(),
        sa.Column("order_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("external_invoice_ref", sa.Text()),
        sa.Column("issued_at", sa.DateTime(timezone=True)),
        sa.Column("voided_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        *_timestamps(),
        sa.ForeignKeyConstraint(["order_id"], ["billing.orders.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("order_id", name="invoices_order_key"),
        sa.UniqueConstraint("external_invoice_ref", name="invoices_external_ref_key"),
        sa.CheckConstraint("status IN ('pending', 'issued', 'void_pending', 'voided', 'failed')", name="invoices_status_check"),
        schema=SCHEMA,
    )

    op.create_table(
        "outbox_events",
        *_uuid_pk(),
        sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("aggregate_type", sa.Text(), nullable=False),
        sa.Column("aggregate_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("dedupe_key", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.UniqueConstraint("dedupe_key", name="outbox_events_dedupe_key"),
        sa.CheckConstraint("status IN ('pending', 'processing', 'processed', 'dead')", name="outbox_events_status_check"),
        sa.CheckConstraint("attempt_count >= 0", name="outbox_events_attempt_count_check"),
        schema=SCHEMA,
    )
    op.create_index(
        "outbox_events_claim_idx",
        "outbox_events",
        ["available_at", "created_at"],
        schema=SCHEMA,
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )

    op.create_table(
        "entitlement_changes",
        *_uuid_pk(),
        sa.Column("subscription_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", pg.UUID(as_uuid=True)),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("tier", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["subscription_id"], ["billing.subscriptions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["billing.orders.id"], ondelete="SET NULL"),
        sa.CheckConstraint("tier IN ('free', 'pro', 'pass')", name="entitlement_changes_tier_check"),
        schema=SCHEMA,
    )

    for table in (
        "plans",
        "subscriptions",
        "orders",
        "payment_attempts",
        "payment_methods",
        "provider_events",
        "refunds",
        "invoices",
        "outbox_events",
        "entitlement_changes",
    ):
        op.execute(f"ALTER TABLE billing.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON TABLE billing.{table} FROM PUBLIC, anon, authenticated")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE billing.{table} TO service_role")

    op.execute("REVOKE ALL ON SCHEMA billing FROM PUBLIC, anon, authenticated")
    op.execute("GRANT USAGE ON SCHEMA billing TO service_role")

    op.execute(
        """
        CREATE FUNCTION billing.claim_outbox_events(
          p_limit integer DEFAULT 20,
          p_lease_seconds integer DEFAULT 60
        ) RETURNS SETOF billing.outbox_events
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = billing, pg_catalog
        AS $function$
        BEGIN
          IF p_limit < 1 OR p_limit > 100 OR p_lease_seconds < 1 OR p_lease_seconds > 3600 THEN
            RAISE EXCEPTION 'invalid outbox claim bounds';
          END IF;
          RETURN QUERY
          WITH candidates AS (
            SELECT id
            FROM billing.outbox_events
            WHERE available_at <= now()
              AND (status = 'pending' OR (status = 'processing' AND lease_until < now()))
            ORDER BY available_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT p_limit
          )
          UPDATE billing.outbox_events e
          SET status = 'processing',
              lease_until = now() + make_interval(secs => p_lease_seconds),
              attempt_count = e.attempt_count + 1,
              updated_at = now()
          FROM candidates c
          WHERE e.id = c.id
          RETURNING e.*;
        END;
        $function$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION billing.claim_outbox_events(integer, integer) FROM PUBLIC, anon, authenticated")
    op.execute("GRANT EXECUTE ON FUNCTION billing.claim_outbox_events(integer, integer) TO service_role")


def downgrade() -> None:
    op.execute("DROP SCHEMA billing CASCADE")
