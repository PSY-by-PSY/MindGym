import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from backend.database.models import Base
from backend.database.scope import APPLICATION_TABLE_KEYS, APPLICATION_TABLES, include_name, include_object
from migrations.local_only import checked_url

spec=importlib.util.spec_from_file_location('baseline', ROOT/'migrations/versions/mg_0001_baseline.py')
baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)

billing_spec=importlib.util.spec_from_file_location('billing_revision', ROOT/'migrations/versions/mg_0002_billing_recurring.py')
billing_revision=importlib.util.module_from_spec(billing_spec);billing_spec.loader.exec_module(billing_revision)
checkout_spec=importlib.util.spec_from_file_location('checkout_revision', ROOT/'migrations/versions/mg_0003_billing_checkout_rpc.py')
checkout_revision=importlib.util.module_from_spec(checkout_spec);checkout_spec.loader.exec_module(checkout_revision)
callback_spec=importlib.util.spec_from_file_location('callback_revision', ROOT/'migrations/versions/mg_0004_billing_provider_event_rpc.py')
callback_revision=importlib.util.module_from_spec(callback_spec);callback_spec.loader.exec_module(callback_revision)


class StaticTests(unittest.TestCase):
    def test_asset_integrity_and_scope(self):
        assets=baseline.load_assets();s=assets['snapshot.json']
        self.assertEqual((len(s['tables']),sum(len(t['columns']) for t in s['tables']),len(s['functions']),len(s['policies']),len(s['triggers'])),(35,315,49,98,10))
        public_mappers=[m for m in Base.registry.mappers if m.local_table.schema in (None,'public')]
        self.assertEqual(len(public_mappers),35)
        self.assertEqual(APPLICATION_TABLES,{t['name'] for t in s['tables']})

    def test_billing_revision_and_orm_scope(self):
        self.assertEqual(billing_revision.down_revision, 'mg_0001_baseline')
        self.assertEqual(checkout_revision.down_revision, 'mg_0002_billing_recurring')
        self.assertEqual(callback_revision.down_revision, 'mg_0003_billing_checkout_rpc')
        expected={
            'plans','subscriptions','orders','payment_attempts','payment_methods',
            'provider_events','refunds','invoices','outbox_events','entitlement_changes',
        }
        self.assertEqual({name for schema,name in APPLICATION_TABLE_KEYS if schema=='billing'},expected)
        self.assertTrue(include_name('billing','schema',{}))
        self.assertTrue(include_name('orders','table',{'schema_name':'billing'}))
        self.assertFalse(include_name('orders','table',{'schema_name':'public'}))
        self.assertTrue(include_object(Base.metadata.tables['billing.orders'],'orders','table',False,None))

    def test_tampered_asset_fails_before_ddl(self):
        import shutil
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)
            for source in baseline.ASSETS.iterdir():shutil.copy(source,target/source.name)
            (target/'tables.json').write_text('[]')
            with patch.object(baseline,'ASSETS',target):
                with self.assertRaisesRegex(RuntimeError,'asset changed'):baseline.load_assets()

    def test_remote_and_connection_override_rejected(self):
        for url in ['postgresql://postgres:secret@db.example.com/postgres','postgresql://postgres@localhost/postgres?host=remote','postgresql://postgres@localhost/postgres?hostaddr=1.2.3.4','postgresql://postgres@localhost/postgres?service=prod','sqlite:///local.db']:
            with self.subTest(url=url),self.assertRaises(RuntimeError):checked_url(url)
        self.assertEqual(checked_url('postgresql://postgres@127.0.0.1:54322/postgres').host,'127.0.0.1')

    def test_auth_and_unmanaged_tables_excluded(self):
        self.assertFalse(include_name('auth','schema',{}))
        self.assertFalse(include_name('unmanaged','table',{}))
        self.assertFalse(include_object(Base.metadata.tables['auth.users'],'users','table',False,None))
        self.assertTrue(include_object(Base.metadata.tables['user_intake'],'user_intake','table',False,None))

    def test_notifications_disabled_without_configuration(self):
        s=baseline.load_assets()['snapshot.json']
        adapted=[f for f in s['functions'] if f['environment_adapted']]
        self.assertEqual([f['name'] for f in adapted],['notify_push_on_interaction'])
        self.assertIn("IS DISTINCT FROM 'on'",adapted[0]['definition'])
        for f in s['functions']:
            self.assertNotIn('https://',f['definition'])
            self.assertNotRegex(f['definition'],r'eyJ[A-Za-z0-9_-]{20,}')
        for name in ('tables.json','functions.json','access.json','triggers.json'):
            self.assertNotIn('cron.schedule(', '\n'.join(baseline.load_assets()[name]))

    def test_offline_output_and_stamp_blocked(self):
        proc=subprocess.run([sys.executable,'-m','alembic','upgrade','head','--sql'],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(proc.returncode,0,proc.stderr)
        self.assertIn('Local test marker required',proc.stdout)
        self.assertIn('CREATE TABLE "public"."user_intake"',proc.stdout)
        self.assertIn('CREATE SCHEMA billing',proc.stdout)
        self.assertIn('CREATE TABLE billing.orders',proc.stdout)
        self.assertIn('claim_outbox_events',proc.stdout)
        self.assertIn('create_pending_checkout',proc.stdout)
        self.assertIn('record_provider_event',proc.stdout)
        self.assertNotIn('CREATE TABLE auth.users',proc.stdout)
        self.assertIn("'x-webhook-secret'",proc.stdout)
        blocked=subprocess.run([sys.executable,'-m','alembic','stamp','head','--sql'],cwd=ROOT,capture_output=True,text=True)
        self.assertNotEqual(blocked.returncode,0)
        self.assertIn('Stamp is blocked',blocked.stderr)

    def test_orm_check_constraints_render_balanced(self):
        # Guards the build script slice: 'CHECK (' is 7 chars. An off-by-one
        # leaves every CHECK unbalanced; upgrade() never notices because it
        # executes tables.json, but create_all()/autogenerate would emit bad SQL.
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.schema import CreateTable
        from backend.database.models import Base
        dialect = postgresql.dialect()
        seen = {'public':0,'billing':0}
        for table in Base.metadata.sorted_tables:
            if table.schema == "auth":
                continue
            ddl = str(CreateTable(table).compile(dialect=dialect))
            for line in ddl.splitlines():
                if "CHECK" in line:
                    seen[table.schema or 'public'] += 1
                    self.assertEqual(line.count("("), line.count(")"), (table.name, line.strip()))
        self.assertEqual(seen, {'public':26,'billing':15})

    def test_baseline_downgrade_refused(self):
        with self.assertRaisesRegex(RuntimeError,'intentionally disabled'):baseline.downgrade()

if __name__=='__main__':unittest.main()
