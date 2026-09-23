"""Integration tests ONLY for a freshly rebuilt, isolated local Supabase.

Fixtures use synthetic users in rolled-back transactions. No hosted URLs accepted.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
import sqlalchemy as sa
from sqlalchemy.orm import Session
from backend.database.models import UserIntake
from migrations.local_only import checked_url
from scripts.db.verify_baseline import capture, compare

URL=os.environ.get('MIGRATION_TEST_DATABASE_URL')


@unittest.skipUnless(URL,'Set MIGRATION_TEST_DATABASE_URL to an isolated local Supabase with baseline applied')
class LocalSupabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine=sa.create_engine(checked_url(URL),poolclass=sa.pool.NullPool)
        with cls.engine.connect() as c:
            if c.exec_driver_sql('SELECT version_num FROM mindgym_migrations.alembic_version').scalar()!='mg_0001_baseline':
                raise RuntimeError('Expected baseline revision; do not test arbitrary databases')
        cls.snapshot=json.loads((ROOT/'migrations/baseline/snapshot.json').read_text())

    @classmethod
    def tearDownClass(cls):cls.engine.dispose()

    def setUp(self):
        self.conn=self.engine.connect();self.tx=self.conn.begin()
        self.conn.exec_driver_sql('SET LOCAL search_path TO public, extensions')
        self.a=uuid.uuid4();self.b=uuid.uuid4()

    def tearDown(self):self.tx.rollback();self.conn.close()

    def user(self, uid):
        self.conn.execute(sa.text("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES (:id,:email,CAST(:meta AS jsonb))"),{'id':uid,'email':str(uid)+'@example.invalid','meta':'{"full_name":"Migration test"}'})

    def actor(self,uid):
        self.conn.exec_driver_sql('RESET ROLE')
        self.conn.execute(sa.text("SELECT set_config('request.jwt.claim.sub',:id,true), set_config('request.jwt.claims',:claims,true)"),{'id':str(uid) if uid else '', 'claims':json.dumps({'sub':str(uid),'role':'authenticated'}) if uid else '{}'})
        self.conn.exec_driver_sql('SET LOCAL ROLE '+('authenticated' if uid else 'anon'))

    def test_catalog_matches_full_declared_scope(self):
        self.assertEqual(compare(capture(self.conn),self.snapshot),[])

    def test_comparator_detects_policy_drift(self):
        self.conn.exec_driver_sql('ALTER POLICY "user_intake: 本人可讀" ON public.user_intake USING (true)')
        self.assertIn('RLS policies', compare(capture(self.conn), self.snapshot))

    def test_auth_insert_creates_profile(self):
        self.user(self.a)
        name=self.conn.execute(sa.text('SELECT name FROM public.profiles WHERE id=:id'),{'id':self.a}).scalar_one()
        self.assertEqual(name,'Migration test')

    def test_rls_own_other_anonymous_and_orm(self):
        self.user(self.a);self.user(self.b);self.actor(self.a)
        self.conn.execute(sa.text('INSERT INTO public.user_intake(user_id) VALUES (:id)'),{'id':self.a})
        with Session(bind=self.conn,join_transaction_mode='create_savepoint') as session:
            record=session.get(UserIntake,self.a);self.assertIsNotNone(record)
            self.assertEqual(record.user_id,self.a)
        self.actor(self.b)
        self.assertEqual(self.conn.exec_driver_sql('SELECT count(*) FROM public.user_intake').scalar_one(),0)
        self.actor(None)
        self.assertEqual(self.conn.exec_driver_sql('SELECT count(*) FROM public.user_intake').scalar_one(),0)
        self.actor(self.a)
        self.assertEqual(self.conn.exec_driver_sql('SELECT count(*) FROM public.user_intake').scalar_one(),1)

    def test_rls_blocks_cross_user_insert(self):
        self.user(self.a);self.user(self.b);self.actor(self.a)
        with self.assertRaises(sa.exc.DBAPIError):
            self.conn.execute(sa.text('INSERT INTO public.user_intake(user_id) VALUES (:id)'),{'id':self.b})

    def test_identity_and_constraints(self):
        self.user(self.a)
        first=self.conn.exec_driver_sql("INSERT INTO ai_usage_log(provider,source,model) VALUES ('test','migration','none') RETURNING id").scalar_one()
        second=self.conn.exec_driver_sql("INSERT INTO ai_usage_log(provider,source,model) VALUES ('test','migration','none') RETURNING id").scalar_one()
        self.assertGreater(second,first)
        with self.assertRaises(sa.exc.DBAPIError):
            self.conn.execute(sa.text('INSERT INTO perma_scores(user_id,p_score) VALUES (:id,99)'),{'id':self.a})

    def test_current_entitlements_and_admin_boundary(self):
        self.user(self.a);self.actor(self.a)
        self.assertTrue(self.conn.exec_driver_sql('SELECT public.is_pro(auth.uid())').scalar_one())
        data=self.conn.exec_driver_sql('SELECT public.get_my_entitlements()').scalar_one()
        self.assertEqual(data['tier'],'free');self.assertTrue(data['is_pro'])
        with self.assertRaises(sa.exc.DBAPIError):
            self.conn.execute(sa.text("SELECT public.set_user_subscription(:id,'pro','active',false)"),{'id':self.a})

    def test_push_triggers_stay_disabled_and_no_cron_installed(self):
        rows=self.conn.exec_driver_sql("SELECT tgname,tgenabled FROM pg_trigger WHERE tgname IN ('comments_push','likes_push') ORDER BY tgname").all()
        self.assertEqual(rows,[('comments_push','D'),('likes_push','D')])
        # No execution of outbound routines; inspect the function and settings only.
        self.assertNotEqual(self.conn.exec_driver_sql("SELECT current_setting('mindgym.notifications_enabled',true)").scalar(),'on')
        exists=self.conn.exec_driver_sql("SELECT to_regclass('cron.job')").scalar()
        if exists:self.assertEqual(self.conn.exec_driver_sql('SELECT count(*) FROM cron.job').scalar_one(),0)

    def test_repeat_upgrade_check_and_status_are_safe(self):
        env={**os.environ,'MIGRATION_DATABASE_URL':URL,'MINDGYM_LOCAL_TEST':'1'}
        for args in [('upgrade','head'),('check',),('current',)]:
            result=subprocess.run([sys.executable,'-m','alembic',*args],cwd=ROOT,env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr+result.stdout)
        self.assertEqual(compare(capture(self.conn),self.snapshot),[])

if __name__=='__main__':unittest.main()
