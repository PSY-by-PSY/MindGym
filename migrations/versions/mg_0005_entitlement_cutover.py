"""canonical entitlement cutover for is_pro and get_my_entitlements

Revision ID: mg_0005_entitlement_cutover
Revises: mg_0004_billing_lifecycle
Create Date: 2026-09-28 16:00:00.000000
"""

from alembic import op

revision = "mg_0005_entitlement_cutover"
down_revision = "mg_0004_billing_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update is_pro(uid) to read canonical entitlement from billing.subscriptions and public.subscriptions
    op.execute("""
      CREATE OR REPLACE FUNCTION public.is_pro(uid uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, billing AS $function$
        SELECT uid IS NOT NULL AND (
          EXISTS (
            SELECT 1 FROM billing.subscriptions
            WHERE user_id = uid
              AND status IN ('active', 'grace', 'cancel_scheduled')
              AND (current_period_ends_at IS NULL OR current_period_ends_at > clock_timestamp())
          )
          OR EXISTS (
            SELECT 1 FROM public.subscriptions
            WHERE user_id = uid
              AND (
                is_founding_member = true
                OR (tier IN ('pro', 'pass') AND status IN ('trialing', 'active', 'grace') AND (expires_at IS NULL OR expires_at > clock_timestamp()))
              )
          )
        );
      $function$;
    """)

    # 2. Update get_my_entitlements() to guarantee tier matches is_pro
    op.execute("""
      CREATE OR REPLACE FUNCTION public.get_my_entitlements() RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, billing AS $function$
      DECLARE
        uid          uuid := auth.uid();
        v_tier       text := 'free';
        v_status     text := 'active';
        v_founding   boolean := false;
        v_expires    timestamptz;
        v_pro        boolean;
        v_limit      integer;
        v_used       integer;
        v_perma_used integer;
      BEGIN
        IF uid IS NULL THEN
          RETURN jsonb_build_object('tier', 'anonymous', 'is_pro', false);
        END IF;

        SELECT s.tier, s.status, s.is_founding_member, s.expires_at
          INTO v_tier, v_status, v_founding, v_expires
        FROM public.subscriptions s WHERE s.user_id = uid;
        IF NOT FOUND THEN
          v_tier := 'free'; v_status := 'active'; v_founding := false;
        END IF;

        v_pro  := is_pro(uid);
        v_tier := CASE WHEN v_pro THEN 'pro' ELSE 'free' END;
        v_limit := -1;
        v_used  := weekly_analysis_used(uid);

        SELECT count(*)::int INTO v_perma_used FROM perma_scores WHERE user_id = uid;

        RETURN jsonb_build_object(
          'tier',               v_tier,
          'status',             v_status,
          'is_pro',             v_pro,
          'is_founding_member', v_founding,
          'expires_at',         v_expires,
          'weekly_analysis', jsonb_build_object(
            'period',       CASE WHEN v_pro THEN 'week' ELSE 'month' END,
            'period_start', weekly_analysis_period_start(uid),
            'unlimited',    true,
            'limit',        v_limit,
            'used',         v_used,
            'remaining',    -1
          ),
          'community', jsonb_build_object(
            'unlimited',             v_pro,
            'unlocked',              community_unlocked(uid),
            'contributed_this_week', EXISTS (
              SELECT 1 FROM gratitude_entries
              WHERE user_id = uid AND is_shared = true AND created_at >= date_trunc('week', now())
            ),
            'free_view_limit', COALESCE((SELECT free_view_limit FROM paywall_config WHERE id = 1), 15)
          ),
          'baseline_assessment', jsonb_build_object(
            'used',          v_perma_used,
            'can_retake',    true
          ),
          'can_view_trends', v_pro,
          'can_view_growth_comparison', v_pro
        );
      END; $function$;
    """)


def downgrade() -> None:
    # Revert is_pro(uid) to legacy static true
    op.execute("""
      CREATE OR REPLACE FUNCTION public.is_pro(uid uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
        SELECT uid IS NOT NULL
      $function$;
    """)
