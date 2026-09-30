"""Single explicit ownership boundary for autogenerate; never own auth.users."""
from backend.database.models import Base

OWNED_SCHEMAS = frozenset({'public', 'billing'})
APPLICATION_TABLE_KEYS = frozenset(
    ((t.schema or 'public'), t.name)
    for t in Base.metadata.tables.values()
    if (t.schema or 'public') in OWNED_SCHEMAS and not t.info.get('external')
)
# The immutable baseline inventory intentionally describes public only.
APPLICATION_TABLES = frozenset(name for schema, name in APPLICATION_TABLE_KEYS if schema == 'public')


def include_name(name, type_, parent_names):
    if type_ == 'schema':
        return name in (None, *OWNED_SCHEMAS)
    if type_ == 'table':
        schema = parent_names.get('schema_name') or 'public'
        return (schema, name) in APPLICATION_TABLE_KEYS
    return True


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == 'table':
        schema = obj.schema or 'public'
        return (schema, name) in APPLICATION_TABLE_KEYS and not obj.info.get('external')
    return True
