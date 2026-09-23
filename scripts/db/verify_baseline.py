"""Read-only semantic baseline comparison. Outputs object labels, never secrets.

Targets local databases only. Does not inspect application data or initialize roles.
"""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import sqlalchemy as sa
from migrations.local_only import checked_url


def compare(actual, expected):
    differences = []
    def check(label, before, after):
        if before != after:
            differences.append(label)
    relations = {r['oid']: r for r in actual['relations']}
    live = {r['relname']:r for r in actual['relations'] if r['nspname']=='public' and r['relkind']=='r'}
    check('public tables',set(t['name'] for t in expected['tables']),set(live))
    supported = {c['conindid'] for c in actual['constraints'] if c['contype'] in ('p','u','x')}
    def acl(values):
        return sorted(values or [])
    for t in expected['tables']:
        name=t['name'];r=live.get(name)
        if r is None:continue
        for key, field in [('owner','owner_name'),('rls','relrowsecurity'),('force_rls','relforcerowsecurity'),('replica_identity','relreplident')]:check(name+'.'+key,t[key],r[field])
        check(name+'.acl',acl(t['acl']),acl(r['relacl']))
        cols=sorted([c for c in actual['columns'] if c['attrelid']==r['oid']],key=lambda c:c['attnum'])
        check(name+'.column_names',[c['name'] for c in t['columns']],[c['attname'] for c in cols])
        by_name={c['attname']:c for c in cols}
        for col in t['columns']:
            c=by_name.get(col['name'])
            if c is None:continue
            got={'name':c['attname'],'type':c['formatted_type'],'nullable':not c['attnotnull'],'default':c['default_expression'],'identity':c['attidentity'],'comment':c['comment']}
            if col['identity']:
                seq=next((s for s in actual['sequences'] if s['nspname']=='public' and s['relname']==col['sequence']['relname']),None)
                got['sequence']={k:seq[k] for k in col['sequence']} if seq else None
                dep=next((x for x in actual['dependencies'] if seq and x['classid']=='1259' and x['objid']==seq['seqrelid'] and x['refobjid']==r['oid'] and x['refobjsubid']==c['attnum'] and x['deptype']=='i'),None)
                check(name+'.'+col['name']+'.sequence_owner',True,dep is not None)
            check(name+'.'+col['name'],col,got)
        constraints=sorted([{k:c[k] for k in ['conname','contype','definition','condeferrable','condeferred','convalidated']} for c in actual['constraints'] if c['conrelid']==r['oid']],key=lambda c:c['conname'])
        check(name+'.constraints',t['constraints'],constraints)
        indexes=sorted(i['definition'] for i in actual['indexes'] if i['indrelid']==r['oid'] and i['indexrelid'] not in supported)
        check(name+'.indexes',t['indexes'],indexes)
        check(name+'.index_validity',True,all(i['indisvalid'] and i['indisready'] for i in actual['indexes'] if i['indrelid']==r['oid']))
    sequences = {r['relname']: r for r in actual['relations'] if r['nspname']=='public' and r['relkind']=='S'}
    check('sequence names', {s['name'] for s in expected['sequences']}, set(sequences))
    for seq in expected['sequences']:
        r = sequences.get(seq['name'])
        if r:
            check(seq['name']+'.owner', seq['owner'], r['owner_name'])
            check(seq['name']+'.acl', acl(seq['acl']), acl(r['relacl']))
    routines={(f['proname'],f['identity_arguments']):f for f in actual['routines'] if f['nspname']=='public'}
    check('public routine signatures',{(f['name'],f['identity_arguments']) for f in expected['functions']},set(routines))
    for f in expected['functions']:
        key=(f['name'],f['identity_arguments']);live_f=routines.get(key)
        if live_f:
            check(f['name']+'.definition',f['definition'].strip(),live_f['definition'].strip())
            check(f['name']+'.owner',f['owner'],live_f['owner_name'])
            check(f['name']+'.acl',acl(f['acl']),acl(live_f['proacl']))
    policies=sorted([{k:p[k] for k in ['relname','polname','polcmd','polpermissive','role_names','using_expression','check_expression']} for p in actual['policies'] if p['nspname']=='public'],key=lambda p:(p['relname'],p['polname']))
    check('RLS policies',expected['policies'],policies)
    triggers=sorted([{k:t[k] for k in ['nspname','relname','tgname','definition','tgenabled']} for t in actual['triggers'] if t['nspname']=='public' or (t['nspname']=='auth' and t['relname']=='users' and t['tgname']=='on_auth_user_created')],key=lambda t:(t['nspname'],t['relname'],t['tgname']))
    check('application triggers',expected['triggers'],triggers)
    return differences


def capture(connection):
    # SQL source is checked in; no dynamic SQL or application-table SELECTs.
    rows=connection.exec_driver_sql((ROOT/'scripts/db/export_catalog.sql').read_text()).mappings()
    return {r['category']:json.loads(r['payload']) for r in rows}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--expected',type=Path,default=ROOT/'migrations/baseline/snapshot.json')
    args=p.parse_args()
    engine=sa.create_engine(checked_url(os.environ.get('MIGRATION_DATABASE_URL')),poolclass=sa.pool.NullPool)
    try:
        with engine.connect() as conn, conn.begin():
            conn.exec_driver_sql('SET TRANSACTION READ ONLY')
            conn.exec_driver_sql('SET LOCAL search_path TO public, extensions')
            differences=compare(capture(conn),json.loads(args.expected.read_text()))
    finally:engine.dispose()
    print(json.dumps({'baseline_match':not differences,'differences':differences,'scope':'application objects; environment-adapted notification definition; excludes platform defaults, cron and data'},ensure_ascii=False,indent=2))
    return bool(differences)

if __name__=='__main__':sys.exit(main())
