"""The draft cannot target hosted DBs. There is no production override."""
from sqlalchemy.engine import make_url


def checked_url(raw):
    if not raw:
        raise RuntimeError('MIGRATION_DATABASE_URL is required for a local test database.')
    url = make_url(raw)
    if url.get_backend_name() != 'postgresql':
        raise RuntimeError('Only PostgreSQL is supported.')
    if url.host not in ('127.0.0.1', 'localhost', '::1'):
        raise RuntimeError('Draft migrations only support loopback test databases.')
    if set(url.query) - {'sslmode'}:
        raise RuntimeError('Connection overrides are forbidden in local draft mode.')
    if not url.database:
        raise RuntimeError('Explicit test database name required.')
    return url.set(drivername='postgresql+psycopg')
