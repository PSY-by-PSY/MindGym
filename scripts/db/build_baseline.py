"""Explicit initial-draft importer. Never run automatically during migrations.

Reads the private catalog CSV; emits sanitized, version-specific assets and models.
Refuses to overwrite an existing baseline. No DB connection is made.
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'migrations/baseline'
PRIVILEGES = dict(r='SELECT', a='INSERT', w='UPDATE', d='DELETE', D='TRUNCATE', x='REFERENCES', t='TRIGGER', m='MAINTAIN', U='USAGE', C='CREATE', X='EXECUTE')


def ident(s):
    return '"' + s.replace('"', '""') + '"'


def literal(s):
    return "'" + s.replace("'", "''") + "'"


def read_catalog(path):
    csv.field_size_limit(100_000_000)
    result = {}
    with path.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            values = json.loads(row['payload'])
            if len(values) != int(row['item_count']) or len(row['payload'].encode()) != int(row['payload_bytes']):
                raise ValueError('Truncated catalog category: ' + row['category'])
            if row['category'] in result:
                raise ValueError('Duplicate category')
            result[row['category']] = values
    if len(result) != 25:
        raise ValueError('Expected all 25 catalog categories')
    return result


def acl_sql(target, acl):
    # This snapshot uses unquoted built-in role names and explicit ACLs.
    if acl is None:
        raise ValueError('NULL ACL needs explicit default resolution: ' + target)
    roles = {'PUBLIC', 'anon', 'authenticated', 'service_role', 'postgres'}
    grants = []
    for value in acl:
        match = re.fullmatch(r'([\w]*)=([A-Za-z*]*)/([\w]+)', value)
        if not match:
            raise ValueError('Unsupported ACL syntax')
        grantee, codes, grantor = match.groups()
        grantee = grantee or 'PUBLIC'
        if grantor != 'postgres':
            raise ValueError('Object grantor needs review: ' + grantor)
        roles.add(grantee)
        for code, grant_option in re.findall(r'([A-Za-z])(\*?)', codes):
            grants.append('GRANT ' + PRIVILEGES[code] + ' ON ' + target + ' TO ' + ('PUBLIC' if grantee == 'PUBLIC' else ident(grantee)) + (' WITH GRANT OPTION' if grant_option else '') + ';')
    reset = ['REVOKE ALL PRIVILEGES ON ' + target + ' FROM ' + ('PUBLIC' if r == 'PUBLIC' else ident(r)) + ';' for r in sorted(roles)]
    return reset + grants


def build(source):
    if (BASE / 'manifest.json').exists():
        raise ValueError('Baseline already exists. Do not rewrite an adopted revision.')
    d = read_catalog(source)
    relations = {r['oid']: r for r in d['relations']}
    columns = {(c['attrelid'], c['attnum']): c for c in d['columns']}
    tables = sorted([r for r in d['relations'] if r['nspname']=='public' and r['relkind']=='r'], key=lambda r:r['relname'])
    if len(tables)!=35:
        raise ValueError('Unexpected scope; review new tables before importing')
    def qtable(oid):
        r=relations[oid]; return ident(r['nspname'])+'.'+ident(r['relname'])
    sql=[]; norm=[]; model=['"""Application ORM metadata adopted from 2026-09-23. Edit for FUTURE revisions only.",""'.replace('",""','"""'), 'import sqlalchemy as sa', 'from sqlalchemy.dialects import postgresql as pg', 'from sqlalchemy.orm import DeclarativeBase', '', 'class Base(DeclarativeBase):', '    pass', '', '# External reference only: excluded by migration filters.', 'auth_users = sa.Table("users", Base.metadata, sa.Column("id", pg.UUID(as_uuid=True), primary_key=True), schema="auth", info={"external": True})', '']
    types={'text':'sa.Text()', 'uuid':'pg.UUID(as_uuid=True)', 'timestamp with time zone':'sa.DateTime(timezone=True)', 'integer':'sa.Integer()', 'jsonb':'pg.JSONB()', 'boolean':'sa.Boolean()', 'text[]':'pg.ARRAY(sa.Text())', 'date':'sa.Date()', 'double precision':'sa.Double()', 'bigint':'sa.BigInteger()', 'numeric':'sa.Numeric()'}
    seqs={r['seqrelid']:r for r in d['sequences']}
    support={r['conindid'] for r in d['constraints'] if r['contype'] in ('p','u','x')}
    for t in tables:
        if t['reloptions'] or t['relispartition'] or t['relpersistence']!='p':
            raise ValueError('Unsupported table properties')
        cols=sorted([c for c in d['columns'] if c['attrelid']==t['oid']],key=lambda c:c['attnum'])
        cons=sorted([c for c in d['constraints'] if c['conrelid']==t['oid']],key=lambda c:c['conname'])
        idxs=sorted([i for i in d['indexes'] if i['indrelid']==t['oid'] and i['indexrelid'] not in support],key=lambda i:i['definition'])
        nt={'name':t['relname'],'owner':t['owner_name'],'rls':t['relrowsecurity'],'force_rls':t['relforcerowsecurity'],'replica_identity':t['relreplident'],'acl':t['relacl'],'columns':[], 'constraints':[], 'indexes':[i['definition'] for i in idxs]}
        fields=[];args=[]
        for c in cols:
            if c['attgenerated'] or c['attacl'] or c['attoptions']:
                raise ValueError('Unsupported column properties')
            nc={'name':c['attname'],'type':c['formatted_type'],'nullable':not c['attnotnull'],'default':c['default_expression'],'identity':c['attidentity'],'comment':c['comment']}
            field=ident(c['attname'])+' '+c['formatted_type']
            ca=[repr(c['attname']),types[c['formatted_type']]]
            if c['attidentity']:
                dep=next(x for x in d['dependencies'] if x['deptype']=='i' and x['classid']=='1259' and x['refobjid']==t['oid'] and x['refobjsubid']==c['attnum'] and x['objid'] in seqs)
                seq=seqs[dep['objid']]; nc['sequence']={k:seq[k] for k in ['relname','seqstart','seqincrement','seqmin','seqmax','seqcache','seqcycle']}
                mode='ALWAYS' if c['attidentity']=='a' else 'BY DEFAULT'
                field+=f' GENERATED {mode} AS IDENTITY (SEQUENCE NAME public.{ident(seq["relname"])} START WITH {seq["seqstart"]} INCREMENT BY {seq["seqincrement"]} MINVALUE {seq["seqmin"]} MAXVALUE {seq["seqmax"]} CACHE {seq["seqcache"]} '+('CYCLE' if seq['seqcycle'] else 'NO CYCLE')+')'
                ca.append(f'sa.Identity(always={c["attidentity"]=="a"!r}, start={seq["seqstart"]}, increment={seq["seqincrement"]}, minvalue={seq["seqmin"]}, maxvalue={seq["seqmax"]}, cache={seq["seqcache"]}, cycle={seq["seqcycle"]!r})')
            elif c['default_expression'] is not None:
                field+=' DEFAULT '+c['default_expression'];ca.append('server_default=sa.text('+repr(c['default_expression'])+')')
            if c['attnotnull']:field+=' NOT NULL'
            ca.append('nullable='+repr(not c['attnotnull']))
            if c['comment'] is not None:ca.append('comment='+repr(c['comment']))
            fields.append(field);args.append('    sa.Column('+', '.join(ca)+'),');nt['columns'].append(nc)
        sql.append('CREATE TABLE '+qtable(t['oid'])+' (\n  '+',\n  '.join(fields)+'\n);')
        sql.append('ALTER TABLE '+qtable(t['oid'])+' OWNER TO '+ident(t['owner_name'])+';')
        if t['relrowsecurity']:sql.append('ALTER TABLE '+qtable(t['oid'])+' ENABLE ROW LEVEL SECURITY;')
        if t['relforcerowsecurity']:sql.append('ALTER TABLE '+qtable(t['oid'])+' FORCE ROW LEVEL SECURITY;')
        for c in cons:
            nt['constraints'].append({k:c[k] for k in ['conname','contype','definition','condeferrable','condeferred','convalidated']})
            keys=[columns[(t['oid'],n)]['attname'] for n in (c['conkey'] or [])]
            if c['contype'] in ('p','u'):
                args.append('    sa.'+('PrimaryKeyConstraint' if c['contype']=='p' else 'UniqueConstraint')+'('+', '.join(map(repr,keys))+', name='+repr(c['conname'])+'),')
            elif c['contype']=='c':
                definition=c['definition'];assert definition.startswith('CHECK (') and definition.endswith(')')
                args.append('    sa.CheckConstraint('+repr(definition[6:-1])+', name='+repr(c['conname'])+'),')
            elif c['contype']=='f':
                ref=relations[c['confrelid']];targets=[(('' if ref['nspname']=='public' else ref['nspname']+'.')+ref['relname']+'.')+columns[(c['confrelid'],n)]['attname'] for n in c['confkey']]
                actions={'a':'NO ACTION','r':'RESTRICT','c':'CASCADE','n':'SET NULL','d':'SET DEFAULT'}
                extras=''
                for label,code in [('ondelete',c['confdeltype']),('onupdate',c['confupdtype'])]:
                    if code!='a':extras+=', '+label+'='+repr(actions[code])
                if c['condeferrable']:extras+=', deferrable=True, initially='+repr('DEFERRED' if c['condeferred'] else 'IMMEDIATE')
                args.append('    sa.ForeignKeyConstraint('+repr(keys)+', '+repr(targets)+', name='+repr(c['conname'])+extras+'),')
            else:raise ValueError('Unsupported constraint')
        cls=''.join(w.title() for w in t['relname'].split('_'))
        var=t['relname']+'_table'
        model.extend([var+' = sa.Table('+repr(t['relname'])+', Base.metadata,',*args,'    # Default schema is public; auth references remain explicitly qualified.',')'])
        for i in idxs:
            m=re.fullmatch(r'CREATE (UNIQUE )?INDEX (\w+) ON public\.\w+ USING btree (\(.*\))(?: WHERE (.*))?',i['definition'])
            # Separate WHERE before parsing index expressions (the regex above is greedy).
            core,*where=i['definition'].split(' WHERE ',1)
            m=re.fullmatch(r'CREATE (UNIQUE )?INDEX (\w+) ON public\.\w+ USING btree \((.*)\)',core)
            if not m:raise ValueError('Unsupported index')
            exprs=[]
            for part in m[3].split(', '):
                if re.fullmatch(r'\w+',part):exprs.append(var+'.c['+repr(part)+']')
                elif re.fullmatch(r'\w+ DESC',part):exprs.append(var+'.c['+repr(part[:-5])+'].desc()')
                else:exprs.append('sa.text('+repr(part)+')')
            model.append('sa.Index('+repr(m[2])+', '+', '.join(exprs)+', unique='+repr(bool(m[1]))+(', postgresql_where=sa.text('+repr(where[0])+')' if where else '')+', _table='+var+')')
        model.extend(['class '+cls+'(Base):','    __table__ = '+var,''])
        for c in cols:
            if c['comment'] is not None:sql.append('COMMENT ON COLUMN '+qtable(t['oid'])+'.'+ident(c['attname'])+' IS '+literal(c['comment'])+';')
        norm.append(nt)
    for foreign in [False,True]:
        for t in tables:
            for c in sorted([c for c in d['constraints'] if c['conrelid']==t['oid']],key=lambda c:c['conname']):
                if (c['contype']=='f')==foreign:sql.append('ALTER TABLE '+qtable(t['oid'])+' ADD CONSTRAINT '+ident(c['conname'])+' '+c['definition']+';')
    for t in norm:sql.extend(i+';' for i in t['indexes'])
    table_statements=sql;function_statements=[];funcs=[]
    for f in sorted([f for f in d['routines'] if f['nspname']=='public'],key=lambda f:(f['proname'],f['identity_arguments'])):
        s=f['definition'];adjusted=False
        if f['proname']=='notify_push_on_interaction':
            s,n=re.subn(r"url\s*:=\s*'[^']*'", "url := current_setting('mindgym.push_url', true)",s);assert n==1
            s,n=re.subn(r"('x-webhook-secret'\s*,\s*)'[^']*'",r"\1current_setting('mindgym.webhook_secret', true)",s);assert n==1
            s=s.replace('BEGIN\n',"BEGIN\n  -- Environment-specific integration: disabled unless explicitly configured.\n  IF current_setting('mindgym.notifications_enabled', true) IS DISTINCT FROM 'on' THEN\n    RETURN NEW;\n  END IF;\n",1);adjusted=True
        if re.search(r'https?://|eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{12,}',s):raise ValueError('Review embedded endpoint/credential in '+f['proname'])
        signature=ident('public')+'.'+ident(f['proname'])+'('+f['identity_arguments']+')'
        funcs.append({'name':f['proname'],'identity_arguments':f['identity_arguments'],'definition':s,'owner':f['owner_name'],'acl':f['proacl'],'environment_adapted':adjusted})
        function_statements.extend([s,'ALTER FUNCTION '+signature+' OWNER TO '+ident(f['owner_name'])+';'])
    access=[]
    for t in tables:access.extend(acl_sql('TABLE '+qtable(t['oid']),t['relacl']))
    for r in d['relations']:
        if r['nspname']=='public' and r['relkind']=='S':access.extend(acl_sql('SEQUENCE '+qtable(r['oid']),r['relacl']))
    for f in funcs:access.extend(acl_sql('FUNCTION public.'+ident(f['name'])+'('+f['identity_arguments']+')',f['acl']))
    policies=sorted([p for p in d['policies'] if p['nspname']=='public'],key=lambda p:(p['relname'],p['polname']))
    np=[]
    for p in policies:
        n={k:p[k] for k in ['relname','polname','polcmd','polpermissive','role_names','using_expression','check_expression']};np.append(n)
        stmt='CREATE POLICY '+ident(p['polname'])+' ON public.'+ident(p['relname'])+' AS '+('PERMISSIVE' if p['polpermissive'] else 'RESTRICTIVE')+' FOR '+{'*':'ALL','r':'SELECT','a':'INSERT','w':'UPDATE','d':'DELETE'}[p['polcmd']]+' TO '+', '.join('PUBLIC' if r=='PUBLIC' else ident(r) for r in p['role_names'])
        if p['using_expression']:stmt+=' USING ('+p['using_expression']+')'
        if p['check_expression']:stmt+=' WITH CHECK ('+p['check_expression']+')'
        access.append(stmt+';')
    triggers=[];nts=[]
    for t in sorted(d['triggers'],key=lambda t:(t['nspname'],t['relname'],t['tgname'])):
        if t['nspname']!='public' and not(t['nspname']=='auth' and t['relname']=='users' and t['tgname']=='on_auth_user_created'):continue
        nts.append({k:t[k] for k in ['nspname','relname','tgname','definition','tgenabled']});triggers.append(t['definition']+';')
        status={'O':'ENABLE','D':'DISABLE','R':'ENABLE REPLICA','A':'ENABLE ALWAYS'}[t['tgenabled']]
        if t['tgenabled'] != 'O':
            triggers.append('ALTER TABLE '+ident(t['nspname'])+'.'+ident(t['relname'])+' '+status+' TRIGGER '+ident(t['tgname'])+';')
    # Existing platform schema ACL/default ACL are inventory only: do not mutate
    # shared platform defaults. Explicit ACLs above completely cover owned objects.
    snapshot={'tables':norm,'functions':funcs,'policies':np,'triggers':nts,'platform_schema_acl':[n for n in d['schemas'] if n['nspname']=='public'],'platform_default_acl':[x for x in d['default_privileges'] if x['nspname']=='public']}
    snapshot['sequences'] = [{'name': r['relname'], 'owner': r['owner_name'], 'acl': r['relacl']} for r in sorted(d['relations'], key=lambda r: r['relname']) if r['nspname']=='public' and r['relkind']=='S']
    (ROOT/'backend/database/models.py').write_text('\n'.join(model).rstrip()+'\n')
    assets={'snapshot.json':snapshot,'tables.json':table_statements,'functions.json':function_statements,'access.json':access,'triggers.json':triggers}
    hashes={}
    for name,value in assets.items():
        content=json.dumps(value,ensure_ascii=False,indent=2)+'\n';(BASE/name).write_text(content);hashes[name]=hashlib.sha256(content.encode()).hexdigest()
    manifest={'revision':'mg_0001_baseline','status':'draft_local_only','source_commit':'74cb947e8134b73d6a2e8931ff90fe88d105acda','catalog_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'captured_at':d['metadata'][0]['captured_at'],'assets':hashes,'counts':{'tables':len(norm),'columns':sum(len(t['columns']) for t in norm),'functions':len(funcs),'policies':len(np),'triggers':len(nts)},'deviations':['notify_push_on_interaction: endpoint and secret replaced by environment GUCs, notifications disabled by default','Platform schema/default ACLs inventoried but not altered; owned-object ACLs restored explicitly','Cron jobs, platform services and config data not installed by baseline'], 'adoption_blockers':['Final fresh catalog required before adoption','Notification environment adaptation must be reviewed','Platform default ACL and schema prerequisite comparison required','No production write authorization']}
    (BASE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Built sanitized baseline:',manifest['counts'])

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('catalog',type=Path);build(p.parse_args().catalog)
