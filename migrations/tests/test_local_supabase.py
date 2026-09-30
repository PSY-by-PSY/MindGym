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
            if c.exec_driver_sql('SELECT version_num FROM mindgym_migrations.alembic_version').scalar()!='mg_0003_billing_workflow':
                raise RuntimeError('Expected recurring-billing workflow head; do not test arbitrary databases')
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

    def test_billing_is_private_and_outbox_claim_is_atomic(self):
        self.user(self.a)
        self.conn.exec_driver_sql("""
          INSERT INTO billing.plans(code,display_name,period,amount_cents,terms_version)
          VALUES ('test-monthly','Test monthly','month',100,'test-v1')
        """)
        subscription_id=self.conn.execute(sa.text("""
          INSERT INTO billing.subscriptions(user_id,plan_code)
          VALUES (:user_id,'test-monthly') RETURNING id
        """),{'user_id':self.a}).scalar_one()
        event_id=self.conn.execute(sa.text("""
          INSERT INTO billing.outbox_events(topic,aggregate_type,aggregate_id,dedupe_key)
          VALUES ('billing.test','subscription',:subscription_id,:dedupe_key) RETURNING id
        """),{'subscription_id':subscription_id,'dedupe_key':'test-'+str(self.a)}).scalar_one()

        self.assertFalse(self.conn.exec_driver_sql("SELECT has_schema_privilege('anon','billing','USAGE')").scalar_one())
        self.assertFalse(self.conn.exec_driver_sql("SELECT has_table_privilege('authenticated','billing.orders','SELECT')").scalar_one())
        self.assertFalse(self.conn.exec_driver_sql(
            "SELECT has_function_privilege('authenticated','billing.claim_outbox_events(integer,integer)','EXECUTE')"
        ).scalar_one())

        self.conn.exec_driver_sql('SET LOCAL ROLE service_role')
        claimed=self.conn.exec_driver_sql('SELECT id,status,attempt_count FROM billing.claim_outbox_events(10,60)').one()
        self.assertEqual(claimed,(event_id,'processing',1))

    def test_checkout_rpc_is_idempotent_for_service_role(self):
        self.user(self.a)
        self.conn.exec_driver_sql("""
          INSERT INTO billing.plans(code,display_name,period,amount_cents,terms_version)
          VALUES ('rpc-monthly','RPC monthly','month',100,'test-v1')
        """)
        self.conn.exec_driver_sql('SET LOCAL ROLE service_role')
        params={
            'user_id':self.a, 'plan_code':'rpc-monthly', 'idempotency_key':'test-idempotency',
            'terms_version':'test-v1', 'merchant_order_no':'MG-TEST-RPC',
        }
        first=self.conn.execute(sa.text("""
          SELECT * FROM billing.create_pending_checkout(
            :user_id,:plan_code,:idempotency_key,:terms_version,now(),
            'recurring-v1',now(),'web',now()+interval '24 hours',:merchant_order_no
          )
        """),params).mappings().one()
        second=self.conn.execute(sa.text("""
          SELECT * FROM billing.create_pending_checkout(
            :user_id,:plan_code,:idempotency_key,:terms_version,now(),
            'recurring-v1',now(),'web',now()+interval '24 hours',:merchant_order_no
          )
        """),params).mappings().one()
        self.assertFalse(first['reused'])
        self.assertTrue(second['reused'])
        self.assertEqual(first['order_id'],second['order_id'])

    def test_provider_callback_receipt_and_outbox_are_idempotent(self):
        self.user(self.a)
        self.conn.exec_driver_sql("""
          INSERT INTO billing.plans(code,display_name,period,amount_cents,terms_version)
          VALUES ('callback-monthly','Callback monthly','month',100,'test-v1')
        """)
        subscription_id=self.conn.execute(sa.text("""
          INSERT INTO billing.subscriptions(user_id,plan_code,status)
          VALUES (:user_id,'callback-monthly','pending') RETURNING id
        """),{'user_id':self.a}).scalar_one()
        self.conn.execute(sa.text("""
          INSERT INTO billing.orders(
            subscription_id,merchant_order_no,idempotency_key,kind,status,
            plan_code_snapshot,plan_name_snapshot,amount_cents,currency,
            terms_version,terms_accepted_at,recurring_consent_version,
            recurring_consented_at,recurring_consent_source,expires_at
          ) VALUES (
            :subscription_id,'MG-CALLBACK','callback-key','initial','pending',
            'callback-monthly','Callback monthly',100,'TWD','test-v1',now(),'recurring-v1',now(),'web',now()+interval '24 hours'
          )
        """),{'subscription_id':subscription_id})
        self.conn.exec_driver_sql('SET LOCAL ROLE service_role')
        params={
            'provider':'payuni', 'event_ref':'callback-replay', 'merchant_order_no':'MG-CALLBACK',
            'signature_valid':True, 'payload_redacted':'{"status":"opaque"}',
        }
        first=self.conn.execute(sa.text("""
          SELECT billing.record_provider_event(
            :provider,:event_ref,:merchant_order_no,:signature_valid,CAST(:payload_redacted AS jsonb)
          )
        """),params).scalar_one()
        second=self.conn.execute(sa.text("""
          SELECT billing.record_provider_event(
            :provider,:event_ref,:merchant_order_no,:signature_valid,CAST(:payload_redacted AS jsonb)
          )
        """),params).scalar_one()

        self.assertEqual(first,second)
        self.assertEqual(self.conn.execute(sa.text("""
          SELECT count(*) FROM billing.provider_events
          WHERE provider='payuni' AND provider_event_ref='callback-replay'
        """)).scalar_one(),1)
        self.assertEqual(self.conn.execute(sa.text("""
          SELECT count(*) FROM billing.outbox_events
          WHERE topic='billing.provider_callback.received'
            AND dedupe_key='provider-event:' || CAST(:event_id AS text)
        """),{'event_id':first}).scalar_one(),1)

    def test_initial_payment_outcome_is_atomic_and_idempotent(self):
        self.user(self.a)
        self.conn.exec_driver_sql("""
          INSERT INTO billing.plans(code,display_name,period,amount_cents,terms_version)
          VALUES ('outcome-monthly','Outcome monthly','month',100,'test-v1')
        """)
        subscription_id=self.conn.execute(sa.text("""
          INSERT INTO billing.subscriptions(user_id,plan_code,status)
          VALUES (:user_id,'outcome-monthly','pending') RETURNING id
        """),{'user_id':self.a}).scalar_one()
        order_id=self.conn.execute(sa.text("""
          INSERT INTO billing.orders(
            subscription_id,merchant_order_no,idempotency_key,kind,status,
            plan_code_snapshot,plan_name_snapshot,amount_cents,currency,
            terms_version,terms_accepted_at,recurring_consent_version,
            recurring_consented_at,recurring_consent_source,expires_at
          ) VALUES (
            :subscription_id,'MG-OUTCOME','outcome-key','initial','pending',
            'outcome-monthly','Outcome monthly',100,'TWD','test-v1',now(),'recurring-v1',now(),'web',now()+interval '24 hours'
          ) RETURNING id
        """),{'subscription_id':subscription_id}).scalar_one()
        event_id=self.conn.execute(sa.text("""
          INSERT INTO billing.provider_events(
            provider,provider_event_ref,order_id,event_type,signature_valid,payload_redacted
          ) VALUES ('payuni','trade-outcome',:order_id,'payment_callback',true,'{}'::jsonb)
          RETURNING id
        """),{'order_id':order_id}).scalar_one()
        self.conn.exec_driver_sql('SET LOCAL ROLE service_role')
        first=self.conn.execute(sa.text("""
          SELECT * FROM billing.apply_initial_payment_outcome(
            :event_id,'succeeded','trade-outcome',NULL,'payuni:test','ciphertext',now()
          )
        """),{'event_id':event_id}).mappings().one()
        second=self.conn.execute(sa.text("""
          SELECT * FROM billing.apply_initial_payment_outcome(
            :event_id,'succeeded','trade-outcome',NULL,'payuni:test','ciphertext',now()
          )
        """),{'event_id':event_id}).mappings().one()

        self.assertEqual((first['order_status'],first['already_processed']),('paid',False))
        self.assertTrue(second['already_processed'])
        self.assertEqual(self.conn.execute(sa.text('SELECT status FROM billing.orders WHERE id=:id'),{'id':order_id}).scalar_one(),'paid')
        self.assertEqual(self.conn.execute(sa.text('SELECT status FROM billing.subscriptions WHERE id=:id'),{'id':subscription_id}).scalar_one(),'active')
        self.assertEqual(self.conn.execute(sa.text('SELECT count(*) FROM billing.payment_attempts WHERE order_id=:id'),{'id':order_id}).scalar_one(),1)
        self.assertEqual(self.conn.execute(sa.text('SELECT provider_token_ref,token_ciphertext FROM billing.payment_methods WHERE subscription_id=:id'),{'id':subscription_id}).one(),('payuni:test','ciphertext'))
        self.assertIsNone(self.conn.execute(sa.text('SELECT token_ciphertext FROM billing.provider_events WHERE id=:id'),{'id':event_id}).scalar_one())
        self.assertEqual(self.conn.execute(sa.text('SELECT count(*) FROM billing.entitlement_changes WHERE order_id=:id'),{'id':order_id}).scalar_one(),1)
        self.assertEqual(self.conn.execute(sa.text('SELECT tier FROM public.subscriptions WHERE user_id=:id'),{'id':self.a}).scalar_one(),'pro')

    def test_initial_payment_failure_expires_without_granting_entitlement(self):
        self.user(self.a)
        self.conn.exec_driver_sql("""
          INSERT INTO billing.plans(code,display_name,period,amount_cents,terms_version)
          VALUES ('failure-monthly','Failure monthly','month',100,'test-v1')
        """)
        subscription_id=self.conn.execute(sa.text("""
          INSERT INTO billing.subscriptions(user_id,plan_code,status)
          VALUES (:user_id,'failure-monthly','pending') RETURNING id
        """),{'user_id':self.a}).scalar_one()
        order_id=self.conn.execute(sa.text("""
          INSERT INTO billing.orders(
            subscription_id,merchant_order_no,idempotency_key,kind,status,
            plan_code_snapshot,plan_name_snapshot,amount_cents,currency,
            terms_version,terms_accepted_at,recurring_consent_version,
            recurring_consented_at,recurring_consent_source,expires_at
          ) VALUES (
            :subscription_id,'MG-FAILURE','failure-key','initial','pending',
            'failure-monthly','Failure monthly',100,'TWD','test-v1',now(),'recurring-v1',now(),'web',now()+interval '24 hours'
          ) RETURNING id
        """),{'subscription_id':subscription_id}).scalar_one()
        event_id=self.conn.execute(sa.text("""
          INSERT INTO billing.provider_events(
            provider,provider_event_ref,order_id,event_type,signature_valid,payload_redacted
          ) VALUES ('payuni','trade-failure',:order_id,'payment_callback',true,'{}'::jsonb)
          RETURNING id
        """),{'order_id':order_id}).scalar_one()
        self.conn.exec_driver_sql('SET LOCAL ROLE service_role')
        result=self.conn.execute(sa.text("""
          SELECT * FROM billing.apply_initial_payment_outcome(
            :event_id,'failed','trade-failure','declined',NULL,NULL,now()
          )
        """),{'event_id':event_id}).mappings().one()

        self.assertEqual((result['order_status'],result['already_processed']),('failed',False))
        self.assertEqual(self.conn.execute(sa.text('SELECT status FROM billing.orders WHERE id=:id'),{'id':order_id}).scalar_one(),'failed')
        self.assertEqual(self.conn.execute(sa.text('SELECT status FROM billing.subscriptions WHERE id=:id'),{'id':subscription_id}).scalar_one(),'expired')
        self.assertEqual(self.conn.execute(sa.text("SELECT status,failure_code FROM billing.payment_attempts WHERE order_id=:id"),{'id':order_id}).one(),('failed','declined'))
        self.assertEqual(self.conn.execute(sa.text('SELECT count(*) FROM billing.entitlement_changes WHERE order_id=:id'),{'id':order_id}).scalar_one(),0)
        self.assertEqual(self.conn.execute(sa.text("SELECT count(*) FROM billing.outbox_events WHERE dedupe_key='payment-failed:' || CAST(:id AS text)"),{'id':order_id}).scalar_one(),1)

    def test_unverified_or_unknown_callback_cannot_apply_payment_outcome(self):
        self.user(self.a)
        self.conn.exec_driver_sql("""
          INSERT INTO billing.plans(code,display_name,period,amount_cents,terms_version)
          VALUES ('rejected-callback-monthly','Rejected callback monthly','month',100,'test-v1')
        """)
        subscription_id=self.conn.execute(sa.text("""
          INSERT INTO billing.subscriptions(user_id,plan_code,status)
          VALUES (:user_id,'rejected-callback-monthly','pending') RETURNING id
        """),{'user_id':self.a}).scalar_one()
        order_id=self.conn.execute(sa.text("""
          INSERT INTO billing.orders(
            subscription_id,merchant_order_no,idempotency_key,kind,status,
            plan_code_snapshot,plan_name_snapshot,amount_cents,currency,
            terms_version,terms_accepted_at,recurring_consent_version,
            recurring_consented_at,recurring_consent_source,expires_at
          ) VALUES (
            :subscription_id,'MG-REJECTED','rejected-key','initial','pending',
            'rejected-callback-monthly','Rejected callback monthly',100,'TWD','test-v1',now(),'recurring-v1',now(),'web',now()+interval '24 hours'
          ) RETURNING id
        """),{'subscription_id':subscription_id}).scalar_one()
        unverified_event_id=self.conn.execute(sa.text("""
          INSERT INTO billing.provider_events(
            provider,provider_event_ref,order_id,event_type,signature_valid,payload_redacted
          ) VALUES ('payuni','unverified-callback',:order_id,'payment_callback',false,'{}'::jsonb)
          RETURNING id
        """),{'order_id':order_id}).scalar_one()
        unknown_event_id=self.conn.execute(sa.text("""
          INSERT INTO billing.provider_events(
            provider,provider_event_ref,event_type,signature_valid,payload_redacted
          ) VALUES ('payuni','unknown-order-callback','payment_callback',true,'{}'::jsonb)
          RETURNING id
        """)).scalar_one()
        self.conn.exec_driver_sql('SET LOCAL ROLE service_role')
        for event_id, transaction_ref in ((unverified_event_id,'trade-unverified'),(unknown_event_id,'trade-unknown')):
            # PostgreSQL marks a transaction failed after an expected exception;
            # use a savepoint so the second hostile callback is independently tested.
            savepoint=self.conn.begin_nested()
            try:
                with self.assertRaisesRegex(sa.exc.DBAPIError,'verified provider event with known order is required'):
                    self.conn.execute(sa.text("""
                      SELECT * FROM billing.apply_initial_payment_outcome(
                        :event_id,'succeeded',:transaction_ref,NULL,'payuni:test','ciphertext',now()
                      )
                    """),{'event_id':event_id,'transaction_ref':transaction_ref})
            finally:
                savepoint.rollback()

        self.assertEqual(self.conn.execute(sa.text('SELECT status FROM billing.orders WHERE id=:id'),{'id':order_id}).scalar_one(),'pending')
        self.assertEqual(self.conn.execute(sa.text('SELECT status FROM billing.subscriptions WHERE id=:id'),{'id':subscription_id}).scalar_one(),'pending')
        self.assertEqual(self.conn.execute(sa.text('SELECT count(*) FROM billing.payment_attempts WHERE order_id=:id'),{'id':order_id}).scalar_one(),0)
        self.assertEqual(self.conn.execute(sa.text('SELECT count(*) FROM billing.entitlement_changes WHERE order_id=:id'),{'id':order_id}).scalar_one(),0)
        self.assertIsNone(self.conn.execute(sa.text('SELECT processed_at FROM billing.provider_events WHERE id=:id'),{'id':unverified_event_id}).scalar_one())
        self.assertIsNone(self.conn.execute(sa.text('SELECT processed_at FROM billing.provider_events WHERE id=:id'),{'id':unknown_event_id}).scalar_one())

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
        # mg_0005_entitlement_cutover upgrades is_pro and get_my_entitlements to read canonical billing
        differences = compare(capture(self.conn), self.snapshot)
        self.assertEqual(differences, ['get_my_entitlements.definition', 'is_pro.definition'])

if __name__=='__main__':unittest.main()
