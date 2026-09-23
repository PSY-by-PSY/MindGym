"""Single explicit ownership boundary for autogenerate; never own auth.users."""
from backend.database.models import Base

APPLICATION_TABLES = frozenset(t.name for t in Base.metadata.tables.values() if t.schema in (None, 'public'))


def include_name(name, type_, parent_names):
    if type_ == 'schema':
        return name in (None, 'public')
    if type_ == 'table':
        return name in APPLICATION_TABLES
    return True


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == 'table':
        return obj.schema in (None, 'public') and name in APPLICATION_TABLES and not obj.info.get('external')
    return True
