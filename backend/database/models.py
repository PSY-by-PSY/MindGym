"""Application ORM metadata adopted from 2026-09-23. Edit for FUTURE revisions only."""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

# External reference only: excluded by migration filters.
auth_users = sa.Table("users", Base.metadata, sa.Column("id", pg.UUID(as_uuid=True), primary_key=True), schema="auth", info={"external": True})

ai_usage_log_table = sa.Table('ai_usage_log', Base.metadata,
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True, start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cache=1, cycle=False), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('provider', sa.Text(), nullable=False),
    sa.Column('source', sa.Text(), nullable=False),
    sa.Column('model', sa.Text(), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('input_tokens', sa.Integer(), nullable=True),
    sa.Column('output_tokens', sa.Integer(), nullable=True),
    sa.Column('cache_write_tokens', sa.Integer(), nullable=True),
    sa.Column('cache_read_tokens', sa.Integer(), nullable=True),
    sa.Column('audio_seconds', sa.Numeric(), nullable=True),
    sa.Column('cost_usd', sa.Numeric(), server_default=sa.text('0'), nullable=False),
    sa.PrimaryKeyConstraint('id', name='ai_usage_log_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('ai_usage_log_created_at', ai_usage_log_table.c['created_at'].desc(), unique=False, _table=ai_usage_log_table)
sa.Index('ai_usage_log_source', ai_usage_log_table.c['source'], ai_usage_log_table.c['created_at'].desc(), unique=False, _table=ai_usage_log_table)
class AiUsageLog(Base):
    __table__ = ai_usage_log_table

app_config_table = sa.Table('app_config', Base.metadata,
    sa.Column('platform', sa.Text(), nullable=False),
    sa.Column('min_version', sa.Text(), nullable=False),
    sa.Column('update_url', sa.Text(), nullable=True),
    sa.Column('update_message', sa.Text(), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('platform', name='app_config_pkey'),
    sa.CheckConstraint("((platform = ANY (ARRAY['ios'::text, 'android'::text]))", name='app_config_platform_check'),
    # Default schema is public; auth references remain explicitly qualified.
)
class AppConfig(Base):
    __table__ = app_config_table

blocks_table = sa.Table('blocks', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('blocker_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('blocked_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('blocked_label', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['blocked_id'], ['profiles.id'], name='blocks_blocked_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('blocker_id', 'blocked_id', name='blocks_blocker_id_blocked_id_key'),
    sa.ForeignKeyConstraint(['blocker_id'], ['profiles.id'], name='blocks_blocker_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='blocks_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('blocks_blocker_idx', blocks_table.c['blocker_id'], unique=False, _table=blocks_table)
class Blocks(Base):
    __table__ = blocks_table

bot_like_queue_table = sa.Table('bot_like_queue', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('entry_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['entry_id'], ['gratitude_entries.id'], name='bot_like_queue_entry_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='bot_like_queue_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
class BotLikeQueue(Base):
    __table__ = bot_like_queue_table

comment_likes_table = sa.Table('comment_likes', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('comment_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['comment_id'], ['comments.id'], name='comment_likes_comment_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('comment_id', 'user_id', name='comment_likes_comment_id_user_id_key'),
    sa.PrimaryKeyConstraint('id', name='comment_likes_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='comment_likes_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class CommentLikes(Base):
    __table__ = comment_likes_table

comments_table = sa.Table('comments', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('entry_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('anon_name', sa.Text(), nullable=True),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('parent_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('moderation_status', sa.Text(), server_default=sa.text("'ok'::text"), nullable=False),
    sa.Column('moderated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('moderation_note', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['entry_id'], ['gratitude_entries.id'], name='comments_entry_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['parent_id'], ['comments.id'], name='comments_parent_id_fkey'),
    sa.PrimaryKeyConstraint('id', name='comments_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['auth.users.id'], name='comments_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class Comments(Base):
    __table__ = comments_table

crisis_alerts_table = sa.Table('crisis_alerts', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('practitioner_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('entry_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('source', sa.Text(), nullable=True),
    sa.Column('severity', sa.Text(), server_default=sa.text("'high'::text"), nullable=True),
    sa.Column('matched_terms', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['entry_id'], ['pro_entries.id'], name='crisis_alerts_entry_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='crisis_alerts_module_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='crisis_alerts_pkey'),
    sa.ForeignKeyConstraint(['practitioner_id'], ['profiles.id'], name='crisis_alerts_practitioner_id_fkey', ondelete='CASCADE'),
    sa.CheckConstraint("((severity = ANY (ARRAY['medium'::text, 'high'::text]))", name='crisis_alerts_severity_check'),
    sa.CheckConstraint("((source = ANY (ARRAY['keyword'::text, 'ai'::text]))", name='crisis_alerts_source_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='crisis_alerts_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('crisis_alerts_practitioner_idx', crisis_alerts_table.c['practitioner_id'], crisis_alerts_table.c['created_at'].desc(), unique=False, _table=crisis_alerts_table)
class CrisisAlerts(Base):
    __table__ = crisis_alerts_table

daily_schedule_table = sa.Table('daily_schedule', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('schedule_date', sa.Date(), nullable=False),
    sa.Column('practice_key', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id', name='daily_schedule_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='daily_schedule_user_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('user_id', 'schedule_date', 'practice_key', name='daily_schedule_user_id_schedule_date_practice_key_key'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('daily_schedule_user_date_idx', daily_schedule_table.c['user_id'], daily_schedule_table.c['schedule_date'], unique=False, _table=daily_schedule_table)
class DailySchedule(Base):
    __table__ = daily_schedule_table

device_tokens_table = sa.Table('device_tokens', Base.metadata,
    sa.Column('token', sa.Text(), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('platform', sa.Text(), server_default=sa.text("'ios'::text"), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('token', name='device_tokens_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='device_tokens_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('device_tokens_user_idx', device_tokens_table.c['user_id'], unique=False, _table=device_tokens_table)
class DeviceTokens(Base):
    __table__ = device_tokens_table

first_feedback_table = sa.Table('first_feedback', Base.metadata,
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('impression', sa.Text(), nullable=True),
    sa.Column('moment', sa.Text(), nullable=True),
    sa.Column('friend', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('user_id', name='first_feedback_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='first_feedback_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class FirstFeedback(Base):
    __table__ = first_feedback_table

focus_logs_table = sa.Table('focus_logs', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('log_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=True),
    sa.Column('had_focus_moment', sa.Boolean(), server_default=sa.text('false'), nullable=True),
    sa.Column('focus_description', sa.Text(), nullable=True),
    sa.Column('focus_conditions', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('focus_feelings', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('difficult_task', sa.Text(), nullable=True),
    sa.Column('obstacle', sa.Text(), nullable=True),
    sa.Column('if_then_plan', sa.Text(), nullable=True),
    sa.Column('ai_feedback', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('log_kind', sa.Text(), server_default=sa.text("'moment'::text"), nullable=True),
    sa.Column('moment_who', sa.Text(), nullable=True),
    sa.Column('moment_when', sa.Text(), nullable=True),
    sa.Column('moment_where', sa.Text(), nullable=True),
    sa.Column('insight', sa.Text(), nullable=True),
    sa.Column('category', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id', name='focus_logs_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='focus_logs_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('focus_logs_user_date_idx', focus_logs_table.c['user_id'], focus_logs_table.c['log_date'].desc(), unique=False, _table=focus_logs_table)
sa.Index('focus_logs_user_kind_idx', focus_logs_table.c['user_id'], focus_logs_table.c['log_kind'], unique=False, _table=focus_logs_table)
class FocusLogs(Base):
    __table__ = focus_logs_table

gratitude_entries_table = sa.Table('gratitude_entries', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('entry_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=True),
    sa.Column('item_1', sa.Text(), nullable=False),
    sa.Column('item_2', sa.Text(), nullable=False),
    sa.Column('item_3', sa.Text(), nullable=False),
    sa.Column('tag_1', sa.Text(), nullable=True),
    sa.Column('tag_2', sa.Text(), nullable=True),
    sa.Column('tag_3', sa.Text(), nullable=True),
    sa.Column('ai_feedback', sa.Text(), nullable=True),
    sa.Column('is_shared', sa.Boolean(), server_default=sa.text('true'), nullable=True),
    sa.Column('anon_name', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('target_1', sa.Text(), nullable=True),
    sa.Column('target_2', sa.Text(), nullable=True),
    sa.Column('target_3', sa.Text(), nullable=True),
    sa.Column('avatar', sa.Text(), nullable=True),
    sa.Column('use_real_name', sa.Boolean(), nullable=True),
    sa.Column('practice_type', sa.Text(), server_default=sa.text("'gratitude'::text"), nullable=True),
    sa.Column('payload', pg.JSONB(), nullable=True),
    sa.Column('moderation_status', sa.Text(), server_default=sa.text("'ok'::text"), nullable=False),
    sa.Column('moderated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('moderation_note', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id', name='gratitude_entries_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='gratitude_entries_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('gratitude_entries_practice_type_idx', gratitude_entries_table.c['practice_type'], unique=False, _table=gratitude_entries_table)
sa.Index('gratitude_entries_workshop_id_idx', sa.text("((payload ->> 'workshop_id'::text))"), unique=False, _table=gratitude_entries_table)
class GratitudeEntries(Base):
    __table__ = gratitude_entries_table

immersion_map_table = sa.Table('immersion_map', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('scene_description', sa.Text(), nullable=True),
    sa.Column('who', sa.Text(), nullable=True),
    sa.Column('what', sa.Text(), nullable=True),
    sa.Column('when_time', sa.Text(), nullable=True),
    sa.Column('where_place', sa.Text(), nullable=True),
    sa.Column('with_what', sa.Text(), nullable=True),
    sa.Column('feelings', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('why_summary', sa.Text(), nullable=True),
    sa.Column('one_sentence', sa.Text(), nullable=True),
    sa.Column('condition_tags', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id', name='immersion_map_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='immersion_map_user_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('user_id', name='immersion_map_user_id_key'),
    # Default schema is public; auth references remain explicitly qualified.
)
class ImmersionMap(Base):
    __table__ = immersion_map_table

invite_codes_table = sa.Table('invite_codes', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('code', sa.Text(), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.UniqueConstraint('code', name='invite_codes_code_key'),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='invite_codes_module_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='invite_codes_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('invite_codes_module_idx', invite_codes_table.c['module_id'], unique=False, _table=invite_codes_table)
class InviteCodes(Base):
    __table__ = invite_codes_table

likes_table = sa.Table('likes', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('entry_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('is_bot', sa.Boolean(), server_default=sa.text('false'), nullable=True),
    sa.ForeignKeyConstraint(['entry_id'], ['gratitude_entries.id'], name='likes_entry_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('entry_id', 'user_id', name='likes_entry_id_user_id_key'),
    sa.PrimaryKeyConstraint('id', name='likes_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['auth.users.id'], name='likes_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class Likes(Base):
    __table__ = likes_table

moderation_rules_table = sa.Table('moderation_rules', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('pattern', sa.Text(), nullable=False),
    sa.Column('category', sa.Text(), nullable=False),
    sa.Column('action', sa.Text(), nullable=False),
    sa.Column('normalized', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.CheckConstraint("((action = ANY (ARRAY['block'::text, 'hide'::text, 'flag'::text]))", name='moderation_rules_action_check'),
    sa.CheckConstraint("((category = ANY (ARRAY['hate'::text, 'harassment'::text, 'sexual'::text, 'violence'::text, 'spam'::text, 'self_harm_promotion'::text]))", name='moderation_rules_category_check'),
    sa.UniqueConstraint('pattern', name='moderation_rules_pattern_key'),
    sa.PrimaryKeyConstraint('id', name='moderation_rules_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
class ModerationRules(Base):
    __table__ = moderation_rules_table

morning_logs_table = sa.Table('morning_logs', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('log_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=True),
    sa.Column('today_task', sa.Text(), nullable=True),
    sa.Column('ai_suggestion', sa.Text(), nullable=True),
    sa.Column('user_confirmed', sa.Boolean(), server_default=sa.text('false'), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id', name='morning_logs_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='morning_logs_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('morning_logs_user_date_idx', morning_logs_table.c['user_id'], morning_logs_table.c['log_date'].desc(), unique=False, _table=morning_logs_table)
class MorningLogs(Base):
    __table__ = morning_logs_table

paywall_config_table = sa.Table('paywall_config', Base.metadata,
    sa.Column('id', sa.Integer(), server_default=sa.text('1'), nullable=False),
    sa.Column('founding_quota_total', sa.Integer(), server_default=sa.text('500'), nullable=False),
    sa.Column('founding_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('variant', sa.Text(), server_default=sa.text("'A'::text"), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('free_view_limit', sa.Integer(), server_default=sa.text('15'), nullable=False),
    sa.CheckConstraint('((id = 1)', name='paywall_config_id_check'),
    sa.PrimaryKeyConstraint('id', name='paywall_config_pkey'),
    sa.CheckConstraint("((variant = ANY (ARRAY['A'::text, 'B'::text]))", name='paywall_config_variant_check'),
    # Default schema is public; auth references remain explicitly qualified.
)
class PaywallConfig(Base):
    __table__ = paywall_config_table

paywall_intents_table = sa.Table('paywall_intents', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('plan_code', sa.Text(), nullable=False),
    sa.Column('variant', sa.Text(), nullable=True),
    sa.Column('source', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name='paywall_intents_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='paywall_intents_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('paywall_intents_created_idx', paywall_intents_table.c['created_at'].desc(), unique=False, _table=paywall_intents_table)
sa.Index('paywall_intents_user_idx', paywall_intents_table.c['user_id'], unique=False, _table=paywall_intents_table)
class PaywallIntents(Base):
    __table__ = paywall_intents_table

perma_scores_table = sa.Table('perma_scores', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('p_score', sa.Integer(), nullable=True),
    sa.Column('e_score', sa.Integer(), nullable=True),
    sa.Column('r_score', sa.Integer(), nullable=True),
    sa.Column('m_score', sa.Integer(), nullable=True),
    sa.Column('a_score', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('report_json', pg.JSONB(), nullable=True),
    sa.CheckConstraint('(((a_score >= 1) AND (a_score <= 5))', name='perma_scores_a_score_check'),
    sa.CheckConstraint('(((e_score >= 1) AND (e_score <= 5))', name='perma_scores_e_score_check'),
    sa.CheckConstraint('(((m_score >= 1) AND (m_score <= 5))', name='perma_scores_m_score_check'),
    sa.CheckConstraint('(((p_score >= 1) AND (p_score <= 5))', name='perma_scores_p_score_check'),
    sa.PrimaryKeyConstraint('id', name='perma_scores_pkey'),
    sa.CheckConstraint('(((r_score >= 1) AND (r_score <= 5))', name='perma_scores_r_score_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='perma_scores_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class PermaScores(Base):
    __table__ = perma_scores_table

practitioner_applications_table = sa.Table('practitioner_applications', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('title', sa.Text(), nullable=True),
    sa.Column('organization', sa.Text(), nullable=True),
    sa.Column('license_info', sa.Text(), nullable=True),
    sa.Column('motivation', sa.Text(), nullable=True),
    sa.Column('status', sa.Text(), server_default=sa.text("'pending'::text"), nullable=False),
    sa.Column('admin_note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name='practitioner_applications_pkey'),
    sa.CheckConstraint("((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))", name='practitioner_applications_status_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='practitioner_applications_user_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('user_id', name='practitioner_applications_user_id_key'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('practitioner_applications_status_idx', practitioner_applications_table.c['status'], unique=False, _table=practitioner_applications_table)
class PractitionerApplications(Base):
    __table__ = practitioner_applications_table

pricing_config_table = sa.Table('pricing_config', Base.metadata,
    sa.Column('plan_code', sa.Text(), nullable=False),
    sa.Column('period', sa.Text(), nullable=False),
    sa.Column('amount_cents', sa.Integer(), nullable=False),
    sa.Column('founding_amount_cents', sa.Integer(), nullable=True),
    sa.Column('currency', sa.Text(), server_default=sa.text("'TWD'::text"), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('sort_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("((period = ANY (ARRAY['month'::text, 'year'::text]))", name='pricing_config_period_check'),
    sa.PrimaryKeyConstraint('plan_code', name='pricing_config_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
class PricingConfig(Base):
    __table__ = pricing_config_table

pro_assessment_results_table = sa.Table('pro_assessment_results', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('answers', pg.JSONB(), nullable=False),
    sa.Column('practitioner_report', pg.JSONB(), nullable=True),
    sa.Column('client_report', pg.JSONB(), nullable=True),
    sa.Column('status', sa.Text(), server_default=sa.text("'released'::text"), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='pro_assessment_results_module_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='pro_assessment_results_pkey'),
    sa.CheckConstraint("((status = ANY (ARRAY['pending_release'::text, 'released'::text]))", name='pro_assessment_results_status_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='pro_assessment_results_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('pro_assessment_results_module_user_idx', pro_assessment_results_table.c['module_id'], pro_assessment_results_table.c['user_id'], pro_assessment_results_table.c['created_at'].desc(), unique=False, _table=pro_assessment_results_table)
class ProAssessmentResults(Base):
    __table__ = pro_assessment_results_table

pro_enrollments_table = sa.Table('pro_enrollments', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('practitioner_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('status', sa.Text(), server_default=sa.text("'active'::text"), nullable=False),
    sa.Column('share_perma', sa.Boolean(), server_default=sa.text('false'), nullable=True),
    sa.Column('consented_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('stopped_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='pro_enrollments_module_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('module_id', 'user_id', name='pro_enrollments_module_id_user_id_key'),
    sa.PrimaryKeyConstraint('id', name='pro_enrollments_pkey'),
    sa.ForeignKeyConstraint(['practitioner_id'], ['profiles.id'], name='pro_enrollments_practitioner_id_fkey', ondelete='CASCADE'),
    sa.CheckConstraint("((status = ANY (ARRAY['active'::text, 'stopped'::text]))", name='pro_enrollments_status_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='pro_enrollments_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('pro_enrollments_practitioner_idx', pro_enrollments_table.c['practitioner_id'], unique=False, _table=pro_enrollments_table)
sa.Index('pro_enrollments_user_idx', pro_enrollments_table.c['user_id'], unique=False, _table=pro_enrollments_table)
class ProEnrollments(Base):
    __table__ = pro_enrollments_table

pro_entries_table = sa.Table('pro_entries', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('answers', pg.JSONB(), nullable=False),
    sa.Column('entry_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('ai_feedback', pg.JSONB(), nullable=True),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='pro_entries_module_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='pro_entries_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='pro_entries_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('pro_entries_module_user_idx', pro_entries_table.c['module_id'], pro_entries_table.c['user_id'], pro_entries_table.c['created_at'].desc(), unique=False, _table=pro_entries_table)
class ProEntries(Base):
    __table__ = pro_entries_table

pro_module_review_log_table = sa.Table('pro_module_review_log', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('action', sa.Text(), nullable=False),
    sa.Column('actor_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('content_snapshot', pg.JSONB(), nullable=True),
    sa.Column('ai_review', pg.JSONB(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.CheckConstraint("((action = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'takedown'::text]))", name='pro_module_review_log_action_check'),
    sa.ForeignKeyConstraint(['actor_id'], ['profiles.id'], name='pro_module_review_log_actor_id_fkey'),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='pro_module_review_log_module_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='pro_module_review_log_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('pro_module_review_log_module_idx', pro_module_review_log_table.c['module_id'], pro_module_review_log_table.c['created_at'].desc(), unique=False, _table=pro_module_review_log_table)
class ProModuleReviewLog(Base):
    __table__ = pro_module_review_log_table

pro_modules_table = sa.Table('pro_modules', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('owner_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('est_minutes', sa.Integer(), nullable=True),
    sa.Column('draft_content', pg.JSONB(), nullable=True),
    sa.Column('published_content', pg.JSONB(), nullable=True),
    sa.Column('status', sa.Text(), server_default=sa.text("'draft'::text"), nullable=False),
    sa.Column('ai_review', pg.JSONB(), nullable=True),
    sa.Column('admin_note', sa.Text(), nullable=True),
    sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('kind', sa.Text(), server_default=sa.text("'practice'::text"), nullable=False),
    sa.CheckConstraint("((kind = ANY (ARRAY['practice'::text, 'diary'::text, 'assessment'::text]))", name='pro_modules_kind_check'),
    sa.ForeignKeyConstraint(['owner_id'], ['profiles.id'], name='pro_modules_owner_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='pro_modules_pkey'),
    sa.CheckConstraint("((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'archived'::text]))", name='pro_modules_status_check'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('pro_modules_kind_idx', pro_modules_table.c['kind'], unique=False, _table=pro_modules_table)
sa.Index('pro_modules_owner_idx', pro_modules_table.c['owner_id'], unique=False, _table=pro_modules_table)
sa.Index('pro_modules_status_idx', pro_modules_table.c['status'], unique=False, _table=pro_modules_table)
class ProModules(Base):
    __table__ = pro_modules_table

pro_reviews_table = sa.Table('pro_reviews', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('module_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('review_type', sa.Text(), nullable=False),
    sa.Column('period_start', sa.Date(), nullable=False),
    sa.Column('period_end', sa.Date(), nullable=False),
    sa.Column('entry_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('content', pg.JSONB(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['module_id'], ['pro_modules.id'], name='pro_reviews_module_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='pro_reviews_pkey'),
    sa.CheckConstraint("((review_type = ANY (ARRAY['overall'::text, 'weekly'::text, 'gratitude_weekly'::text, 'weekly_digest'::text]))", name='pro_reviews_review_type_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='pro_reviews_user_id_fkey', ondelete='CASCADE'),
    sa.UniqueConstraint('user_id', 'module_id', 'review_type', 'period_start', name='pro_reviews_user_id_module_id_review_type_period_start_key'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('pro_reviews_user_idx', pro_reviews_table.c['user_id'], pro_reviews_table.c['created_at'].desc(), unique=False, _table=pro_reviews_table)
class ProReviews(Base):
    __table__ = pro_reviews_table

profiles_table = sa.Table('profiles', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('name', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('avatar', sa.Text(), nullable=True),
    sa.Column('current_streak', sa.Integer(), server_default=sa.text('0'), nullable=True),
    sa.Column('perma_p_xp', sa.Integer(), server_default=sa.text('0'), nullable=True),
    sa.Column('perma_e_xp', sa.Integer(), server_default=sa.text('0'), nullable=True),
    sa.Column('perma_r_xp', sa.Integer(), server_default=sa.text('0'), nullable=True),
    sa.Column('perma_m_xp', sa.Integer(), server_default=sa.text('0'), nullable=True),
    sa.Column('perma_a_xp', sa.Integer(), server_default=sa.text('0'), nullable=True),
    sa.Column('founding_invite_shown_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('terms_accepted_version', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['id'], ['auth.users.id'], name='profiles_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='profiles_pkey'),
    # Default schema is public; auth references remain explicitly qualified.
)
class Profiles(Base):
    __table__ = profiles_table

reports_table = sa.Table('reports', Base.metadata,
    sa.Column('id', pg.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('reporter_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('target_type', sa.Text(), nullable=False),
    sa.Column('entry_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('comment_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('reported_user_id', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('reasons', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('status', sa.Text(), server_default=sa.text("'pending'::text"), nullable=False),
    sa.Column('source', sa.Text(), server_default=sa.text("'user'::text"), nullable=False),
    sa.Column('resolution', sa.Text(), nullable=True),
    sa.Column('admin_note', sa.Text(), nullable=True),
    sa.Column('reviewed_by', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['comment_id'], ['comments.id'], name='reports_comment_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['entry_id'], ['gratitude_entries.id'], name='reports_entry_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name='reports_pkey'),
    sa.ForeignKeyConstraint(['reported_user_id'], ['profiles.id'], name='reports_reported_user_id_fkey', ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reporter_id'], ['profiles.id'], name='reports_reporter_id_fkey', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reviewed_by'], ['profiles.id'], name='reports_reviewed_by_fkey'),
    sa.CheckConstraint("((source = ANY (ARRAY['user'::text, 'auto'::text]))", name='reports_source_check'),
    sa.CheckConstraint("((status = ANY (ARRAY['pending'::text, 'actioned'::text, 'dismissed'::text]))", name='reports_status_check'),
    sa.CheckConstraint("((target_type = ANY (ARRAY['entry'::text, 'comment'::text]))", name='reports_target_type_check'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('reports_created_idx', reports_table.c['created_at'].desc(), unique=False, _table=reports_table)
sa.Index('reports_status_idx', reports_table.c['status'], reports_table.c['created_at'].desc(), unique=False, _table=reports_table)
sa.Index('reports_unique_auto_comment', reports_table.c['comment_id'], unique=True, postgresql_where=sa.text("((source = 'auto'::text) AND (status = 'pending'::text) AND (comment_id IS NOT NULL))"), _table=reports_table)
sa.Index('reports_unique_auto_entry', reports_table.c['entry_id'], unique=True, postgresql_where=sa.text("((source = 'auto'::text) AND (status = 'pending'::text) AND (entry_id IS NOT NULL))"), _table=reports_table)
sa.Index('reports_unique_comment', reports_table.c['reporter_id'], reports_table.c['comment_id'], unique=True, postgresql_where=sa.text('((reporter_id IS NOT NULL) AND (comment_id IS NOT NULL))'), _table=reports_table)
sa.Index('reports_unique_entry', reports_table.c['reporter_id'], reports_table.c['entry_id'], unique=True, postgresql_where=sa.text('((reporter_id IS NOT NULL) AND (entry_id IS NOT NULL))'), _table=reports_table)
class Reports(Base):
    __table__ = reports_table

subscriptions_table = sa.Table('subscriptions', Base.metadata,
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('tier', sa.Text(), server_default=sa.text("'free'::text"), nullable=False),
    sa.Column('status', sa.Text(), server_default=sa.text("'active'::text"), nullable=False),
    sa.Column('is_founding_member', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('price_plan_code', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('granted_by', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['granted_by'], ['profiles.id'], name='subscriptions_granted_by_fkey'),
    sa.PrimaryKeyConstraint('user_id', name='subscriptions_pkey'),
    sa.CheckConstraint("((status = ANY (ARRAY['trialing'::text, 'active'::text, 'grace'::text, 'canceled'::text, 'expired'::text]))", name='subscriptions_status_check'),
    sa.CheckConstraint("((tier = ANY (ARRAY['free'::text, 'pro'::text, 'pass'::text]))", name='subscriptions_tier_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='subscriptions_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('subscriptions_founding_idx', subscriptions_table.c['is_founding_member'], unique=False, postgresql_where=sa.text('(is_founding_member = true)'), _table=subscriptions_table)
class Subscriptions(Base):
    __table__ = subscriptions_table

usage_snapshots_table = sa.Table('usage_snapshots', Base.metadata,
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True, start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cache=1, cycle=False), nullable=False),
    sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('source', sa.Text(), nullable=False),
    sa.Column('metric', sa.Text(), nullable=False),
    sa.Column('value', sa.Double(), nullable=True),
    sa.Column('unit', sa.Text(), nullable=True),
    sa.Column('limit_value', sa.Double(), nullable=True),
    sa.Column('pct', sa.Double(), nullable=True),
    sa.Column('cost_usd', sa.Double(), nullable=True),
    sa.Column('raw', pg.JSONB(), nullable=True),
    sa.PrimaryKeyConstraint('id', name='usage_snapshots_pkey'),
    sa.UniqueConstraint('captured_at', 'source', 'metric', name='usage_snapshots_unique'),
    # Default schema is public; auth references remain explicitly qualified.
)
sa.Index('usage_snapshots_source_time', usage_snapshots_table.c['source'], usage_snapshots_table.c['captured_at'].desc(), unique=False, _table=usage_snapshots_table)
class UsageSnapshots(Base):
    __table__ = usage_snapshots_table

user_intake_table = sa.Table('user_intake', Base.metadata,
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('issues', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('load_level', sa.Text(), nullable=True),
    sa.Column('goal', sa.Text(), nullable=True),
    sa.Column('tried', pg.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
    sa.Column('daily_minutes', sa.Integer(), nullable=True),
    sa.Column('format_pref', sa.Text(), nullable=True),
    sa.Column('identity', sa.Text(), nullable=True),
    sa.Column('age_band', sa.Text(), nullable=True),
    sa.Column('remind_slot', sa.Text(), nullable=True),
    sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=True),
    sa.Column('skipped', sa.Boolean(), server_default=sa.text('false'), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('user_id', name='user_intake_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='user_intake_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class UserIntake(Base):
    __table__ = user_intake_table

user_roles_table = sa.Table('user_roles', Base.metadata,
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('role', sa.Text(), nullable=False),
    sa.Column('granted_by', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['granted_by'], ['profiles.id'], name='user_roles_granted_by_fkey'),
    sa.PrimaryKeyConstraint('user_id', 'role', name='user_roles_pkey'),
    sa.CheckConstraint("((role = ANY (ARRAY['practitioner'::text, 'admin'::text]))", name='user_roles_role_check'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='user_roles_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class UserRoles(Base):
    __table__ = user_roles_table

user_suspensions_table = sa.Table('user_suspensions', Base.metadata,
    sa.Column('user_id', pg.UUID(as_uuid=True), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', pg.UUID(as_uuid=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['created_by'], ['profiles.id'], name='user_suspensions_created_by_fkey'),
    sa.PrimaryKeyConstraint('user_id', name='user_suspensions_pkey'),
    sa.ForeignKeyConstraint(['user_id'], ['profiles.id'], name='user_suspensions_user_id_fkey', ondelete='CASCADE'),
    # Default schema is public; auth references remain explicitly qualified.
)
class UserSuspensions(Base):
    __table__ = user_suspensions_table
