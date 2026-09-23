"""Application baseline from the 2026-09-23 catalog; not a production adoption.

Versioned assets are immutable. Never import the current ORM models here.
Notifications are environment-adapted and disabled; cron is out of scope.
"""
import hashlib
import json
from pathlib import Path
import sqlalchemy as sa
from alembic import op

revision = "mg_0001_baseline"
down_revision = None
branch_labels = None
depends_on = None
MANIFEST_SHA256 = "3c8eec9342279a05d2d0b60ddb256be3c6e0141bac2091933e7b76abd4c61187"
ASSETS = Path(__file__).resolve().parents[1] / "baseline"


def load_assets():
    raw = (ASSETS / "manifest.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != MANIFEST_SHA256:
        raise RuntimeError("Baseline manifest changed. Create a new revision after adoption.")
    manifest = json.loads(raw)
    result = {}
    for name, expected in manifest["assets"].items():
        content = (ASSETS / name).read_bytes()
        if hashlib.sha256(content).hexdigest() != expected:
            raise RuntimeError("Baseline asset changed: " + name)
        result[name] = json.loads(content)
    return result


def execute(sql):
    # TextClause must not treat PostgreSQL casts or text such as ':name' as binds.
    op.execute(sa.text(sql.replace(":", r"\:")))


def upgrade():
    assets = load_assets()  # verify every file before the first DDL
    execute("""DO $preflight$
BEGIN
  IF current_setting('mindgym.local_test', true) IS DISTINCT FROM 'baseline-v1' THEN
    RAISE EXCEPTION 'Local test marker required';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'PostgreSQL 17+ is required for the captured ACL semantics';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Baseline owner mapping requires local postgres role';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Supabase Auth prerequisites missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')) THEN
    RAISE EXCEPTION 'Existing application objects: baseline cannot be replayed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
             AND tgname='on_auth_user_created') THEN
    RAISE EXCEPTION 'Auth trigger already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'Supabase application roles missing';
  END IF;
END $preflight$""")
    # SQL-language bodies can reference routines defined later. Runtime behavior
    # is verified separately; catalog dependencies alone are not sufficient.
    execute("SET LOCAL check_function_bodies = off")
    for name in ("tables.json", "functions.json", "access.json", "triggers.json"):
        for statement in assets[name]:
            execute(statement)


def downgrade():
    raise RuntimeError("Baseline downgrade is intentionally disabled; it must not drop application data.")
