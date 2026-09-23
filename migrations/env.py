"""SQL-first adoption baseline with ORM metadata for future revisions.

No application imports, dotenv loading, cloud project linking or production URL.
"""
import os
from alembic import context
from sqlalchemy import create_engine, pool
from backend.database.models import Base
from backend.database.scope import include_name, include_object
from migrations.local_only import checked_url

config = context.config
VERSION_SCHEMA = 'mindgym_migrations'
cmd = getattr(config.cmd_opts, 'cmd', None)
command = getattr(cmd[0], '__name__', '') if cmd else config.attributes.get('command', '')
if command == 'stamp':
    raise RuntimeError('Stamp is blocked for this unadopted baseline, including offline mode.')


def configure(**kwargs):
    context.configure(target_metadata=Base.metadata,
                      version_table_schema=VERSION_SCHEMA,
                      include_schemas=True, include_name=include_name,
                      include_object=include_object, compare_type=True,
                      compare_server_default=True, transactional_ddl=True, **kwargs)


if context.is_offline_mode():
    configure(url='postgresql+psycopg://', literal_binds=True)
    with context.begin_transaction():
        # Explicit marker required even if someone copies the offline SQL.
        context.execute("DO $$ BEGIN IF current_setting('mindgym.local_test', true) IS DISTINCT FROM 'baseline-v1' THEN RAISE EXCEPTION 'Local test marker required; do not execute on production'; END IF; END $$")
        context.execute('CREATE SCHEMA IF NOT EXISTS mindgym_migrations')
        context.execute('SET LOCAL search_path TO public, extensions')
        context.run_migrations()
else:
    if os.environ.get('MINDGYM_LOCAL_TEST') != '1':
        raise RuntimeError('Set MINDGYM_LOCAL_TEST=1 only for an isolated local test database.')
    engine = create_engine(checked_url(os.environ.get('MIGRATION_DATABASE_URL')), poolclass=pool.NullPool)
    try:
        with engine.connect() as connection, connection.begin():
            if command == 'upgrade':
                connection.exec_driver_sql("SET LOCAL mindgym.local_test = 'baseline-v1'")
                connection.exec_driver_sql('CREATE SCHEMA IF NOT EXISTS mindgym_migrations')
            else:
                # current/check/revision do not initialize any schemas or roles.
                connection.exec_driver_sql('SET TRANSACTION READ ONLY')
            connection.exec_driver_sql('SET LOCAL search_path TO public, extensions')
            configure(connection=connection)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
