"""Read-only verification for the recurring-billing migration head.

This complements verify_baseline.py: the baseline snapshot remains immutable,
while this verifier owns only the objects introduced by the billing migrations.
"""

import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import sqlalchemy as sa

from migrations.local_only import checked_url


EXPECTED_TABLES = {
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
}
EXPECTED_INDEXES = {
    "subscriptions_one_live_per_user",
    "subscriptions_due_idx",
    "orders_one_pending_initial",
    "orders_subscription_created_idx",
    "outbox_events_claim_idx",
}


def verify(connection) -> list[str]:
    differences: list[str] = []
    tables = set(connection.exec_driver_sql("""
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'billing'
    """).scalars())
    if tables != EXPECTED_TABLES:
        differences.append("billing tables")

    rls = dict(connection.exec_driver_sql("""
      SELECT c.relname, c.relrowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'billing' AND c.relkind = 'r'
    """).all())
    if set(rls) != EXPECTED_TABLES or not all(rls.values()):
        differences.append("billing RLS")

    indexes = set(connection.exec_driver_sql("""
      SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'billing'
    """).scalars())
    if not EXPECTED_INDEXES.issubset(indexes):
        differences.append("billing indexes")

    for signature, label in (
        ("billing.claim_outbox_events(integer,integer)", "billing claim function"),
        ("billing.create_pending_checkout(uuid,text,text,text,timestamptz,timestamptz,text)", "billing checkout function"),
        ("billing.record_provider_event(text,text,text,boolean,jsonb)", "billing callback receipt function"),
        ("billing.get_order_for_user(uuid,uuid)", "billing order read function"),
        ("billing.get_resumable_checkout_for_user(uuid,uuid)", "billing resume read function"),
        ("billing.get_overview_for_user(uuid)", "billing overview function"),
        ("billing.apply_initial_payment_outcome(uuid,text,text,text,timestamptz)", "billing payment outcome function"),
        ("billing.get_provider_event_for_processing(uuid)", "billing worker event function"),
        ("billing.complete_outbox_event(uuid)", "billing outbox completion function"),
        ("billing.reschedule_outbox_event(uuid,text,integer,integer)", "billing outbox retry function"),
        ("billing.claim_outbox_events_by_topic(text,integer,integer)", "billing topic claim function"),
        ("billing.dead_letter_outbox_event(uuid,text)", "billing outbox dead-letter function"),
        ("billing.get_outbox_health(text)", "billing outbox health function"),
        ("billing.list_dead_outbox_events(text,integer)", "billing dead-letter list function"),
    ):
        if connection.exec_driver_sql("SELECT to_regprocedure(%s)::text", (signature,)).scalar() is None:
            differences.append(label)

    for role in ("anon", "authenticated"):
        if connection.exec_driver_sql(
            "SELECT has_schema_privilege(%s, 'billing', 'USAGE')", (role,)
        ).scalar_one():
            differences.append(f"{role} billing schema privilege")
        exposed = connection.exec_driver_sql("""
          SELECT count(*)
          FROM pg_catalog.pg_tables
          WHERE schemaname = 'billing'
            AND (
              has_table_privilege(%s, quote_ident(schemaname)||'.'||quote_ident(tablename), 'SELECT') OR
              has_table_privilege(%s, quote_ident(schemaname)||'.'||quote_ident(tablename), 'INSERT') OR
              has_table_privilege(%s, quote_ident(schemaname)||'.'||quote_ident(tablename), 'UPDATE') OR
              has_table_privilege(%s, quote_ident(schemaname)||'.'||quote_ident(tablename), 'DELETE')
            )
        """, (role, role, role, role)).scalar_one()
        if exposed:
            differences.append(f"{role} billing table privileges")

    return differences


def main() -> int:
    engine = sa.create_engine(
        checked_url(os.environ.get("MIGRATION_DATABASE_URL")),
        poolclass=sa.pool.NullPool,
    )
    try:
        with engine.connect() as connection, connection.begin():
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            differences = verify(connection)
    finally:
        engine.dispose()
    print(json.dumps({"billing_head_match": not differences, "differences": differences}, indent=2))
    return bool(differences)


if __name__ == "__main__":
    sys.exit(main())
