import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { type Privacy, PRIVACY_OPTIONS, privacyToFields, privacyFromFields } from '../lib/privacy'
import { workshopIdFromPayload, formatWorkshopLabel } from '../lib/workshop'
import {
  REPORT_REASONS,
  submitReport,
  blockUser,
  fetchBlockedIds,
  type ReportTargetType,
} from '../lib/communityModeration'
import { usePullToRefresh, PULL_THRESHOLD } from '../lib/pullToRefresh'
import { hardRefresh } from '../lib/refresh'
import wordCloudImg from '../assets/WordCloud.jpg'

type GratitudeEntry = {
  id: string
  user_id: string | null
  anon_name: string | null
  use_real_name: boolean | null
  is_shared: boolean | null
  item_1: string | null
  item_2: string | null
  item_3: string | null
  entry_date: string | null
  avatar: string | null
  current_streak: number | null
  target_1: string | null
  target_2: string | null
  target_3: string | null
  practice_type: string | null
  payload: PracticePayload | null
}

// 各練習客製貼文版型的結構化資料（存在 gratitude_entries.payload jsonb）。
// 未來每種練習可定義自己的形狀；以 v 區分變體。
type PracticePayload = {
  v?: string
  // 過程目標覺察
  event?: string
  who?: string
  when?: string
  where?: string
  insight?: string
  situation?: string
  suggestion?: string
  // 找尋真實自我（v='authentic_self'）
  top_work?: string
  top_life?: string
  work_reason?: string
  life_reason?: string
  narrative?: string
  // 生命最後一天（v='last_day'）
  description?: string
  stream?: string
  friend?: string
  family?: string
  world?: string
  farewell?: string
  action?: string
  // 工作坊歸屬（規格 [2]）：以日期分組（YYYYMMDD）或歷史標籤
  workshop_id?: string
  // WOOP 目標實踐地圖（v='woop'）
  wish?: string
  outcome?: string
  obstacle?: string
  plan?: string
  [k: string]: unknown
}

type Comment = {
  id: string
  user_id?: string | null
  anon_name: string | null
  content: string
  created_at: string
  parent_id?: string | null
}

type LikeInfo = { count: number; liked: boolean }

type GratitudeTargetTag = {
  item: number
  target: 'others' | 'self' | 'environment' | 'experience' | 'custom'
  label: string
}

const TARGET_CONFIG: Record<GratitudeTargetTag['target'], { emoji: string; color: string }> = {
  others:      { emoji: '👥', color: 'bg-tile-peach text-foreground' },
  self:        { emoji: '🙋', color: 'bg-tile-mint text-foreground' },
  environment: { emoji: '🌳', color: 'bg-tile-blue text-foreground' },
  experience:  { emoji: '✨', color: 'bg-tile-pink text-foreground' },
  custom:      { emoji: '🏷️', color: 'bg-muted text-muted-foreground' },
}

const TARGET_LABELS: Record<GratitudeTargetTag['target'], string> = {
  others:      '身邊他人',
  self:        '自己',
  environment: '環境',
  experience:  '體驗',
  custom:      '自訂',
}

// 標籤直接由貼文本身的 target_1~3 欄位產生（儲存時由 AI 標記寫入），
// 同類別去重後回傳。
function tagsFromEntry(entry: GratitudeEntry): GratitudeTargetTag[] {
  const seen = new Set<string>()
  const tags: GratitudeTargetTag[] = []
  ;[entry.target_1, entry.target_2, entry.target_3].forEach((t, i) => {
    if (!t || seen.has(t)) return
    if (!(t in TARGET_LABELS)) return
    seen.add(t)
    const code = t as GratitudeTargetTag['target']
    tags.push({ item: i + 1, target: code, label: TARGET_LABELS[code] })
  })
  return tags
}

function normalizeStreak(row: Record<string, unknown>): number | null {
  const p = row.profiles
  const profile = Array.isArray(p) ? p[0] : p
  const cs = (profile as { current_streak?: number } | null)?.current_streak
  return typeof cs === 'number' ? cs : null
}

function normalizeEntry(row: unknown): GratitudeEntry {
  const r = row as Record<string, unknown>
  return { ...r, current_streak: normalizeStreak(r) } as unknown as GratitudeEntry
}

// 無限捲動每批筆數（規格：往下滑時後端一包一包回傳，避免首屏一次載入過多）。
const PAGE_SIZE = 5        // 社群動態每批
const MY_PAGE_SIZE = 6     // 我的貼文每批（一次約 5~7 則）

// 純欄位（payload／streak 都不依賴）— 一定查得到，當作最後保底。
const ENTRY_COLS = 'id, user_id, anon_name, use_real_name, is_shared, item_1, item_2, item_3, entry_date, avatar, target_1, target_2, target_3, practice_type'
// +payload（客製版型結構化資料）；payload 欄位未建立（migration 未跑）時退回上面那層
const ENTRY_COLS_PAYLOAD = `${ENTRY_COLS}, payload`
// +profiles(current_streak)；streak 欄位不存在時再退回
const ENTRY_COLS_WITH_STREAK = `${ENTRY_COLS_PAYLOAD}, profiles(current_streak)`

// 依序嘗試 streak+payload → payload → 純欄位：任何欄位/ join 不存在都自動降級，
// 確保動態牆永遠載得出來（payload migration 未跑時 process_goal 貼文以條列退回顯示）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runWithColFallback(build: (cols: string) => any): Promise<GratitudeEntry[]> {
  for (const cols of [ENTRY_COLS_WITH_STREAK, ENTRY_COLS_PAYLOAD, ENTRY_COLS]) {
    const { data, error } = await build(cols)
    if (!error) return ((data as unknown[]) ?? []).map(normalizeEntry)
  }
  return []
}

// 工作坊練習類型（規格 [1][2]：工作坊貼文獨立成區塊）。
const WORKSHOP_PRACTICE_TYPES = ['workshop_authentic_self', 'workshop_last_day', 'workshop_woop']

// 「社群動態」排除工作坊貼文（它們聚合在「工作坊貼文」分頁）。practice_type 為 null
// 的感恩日記要保留，因此用 OR：是 null 或不在工作坊類型清單內。
const NON_WORKSHOP_OR = `practice_type.is.null,practice_type.not.in.(${WORKSHOP_PRACTICE_TYPES.join(',')})`

async function selectSharedEntries(limit: number, excludeUserId?: string | null) {
  return runWithColFallback((cols) => {
    let q = supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('is_shared', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (excludeUserId) q = q.neq('user_id', excludeUserId)
    return q
  })
}

// 社群動態一批（最新在前；排除工作坊貼文）。range 為含端點的 [offset, offset+limit-1]。
async function fetchCommunityPage(offset: number, limit: number): Promise<GratitudeEntry[]> {
  return runWithColFallback((cols) =>
    supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('is_shared', true)
      .or(NON_WORKSHOP_OR)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
  )
}

// 取得使用者本人的「感恩地圖」— 各感恩對象類別的累積次數。
// 推薦貼文會以此為基準，計算每篇貼文與使用者偏好的相關度。
async function fetchUserGratitudeMap(userId: string | null): Promise<Record<string, number>> {
  if (!userId) return {}
  const { data } = await supabase
    .from('gratitude_entries')
    .select('target_1, target_2, target_3')
    .eq('user_id', userId)
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    for (const val of [row.target_1, row.target_2, row.target_3]) {
      if (val) counts[val] = (counts[val] ?? 0) + 1
    }
  }
  return counts
}

// 「我的貼文」一批（最新在前）。range 為含端點的 [offset, offset+limit-1]。
async function fetchMyPage(userId: string, offset: number, limit: number): Promise<GratitudeEntry[]> {
  return runWithColFallback((cols) =>
    supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
  )
}

// 使用者自己的工作坊貼文（全部、不分頁）：決定哪些工作坊區塊可見、並補進工作坊池
// （含僅限本人的舊資料）。一個使用者的工作坊貼文不多，全取無妨。
async function fetchMyWorkshopEntries(userId: string): Promise<GratitudeEntry[]> {
  return runWithColFallback((cols) =>
    supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('user_id', userId)
      .in('practice_type', WORKSHOP_PRACTICE_TYPES)
      .order('created_at', { ascending: false }),
  )
}

// 工作坊貼文（規格 [1]）：撈所有已分享的工作坊貼文，供「工作坊貼文」分頁分組成區塊。
// 動態牆只取最新 60 篇可能漏掉較舊的工作坊貼文，因此另外查詢。
async function fetchWorkshopEntries(): Promise<GratitudeEntry[]> {
  return runWithColFallback((cols) =>
    supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('is_shared', true)
      .in('practice_type', WORKSHOP_PRACTICE_TYPES)
      .order('created_at', { ascending: false })
      .limit(300),
  )
}

async function fetchModalEntry(userId: string | null): Promise<GratitudeEntry | null> {
  const rows = await selectSharedEntries(50, userId)
  if (rows.length === 0) return null
  return rows[Math.floor(Math.random() * rows.length)]
}

async function fetchSupporting(
  entries: GratitudeEntry[],
  userId: string | null,
): Promise<{
  likes: Record<string, LikeInfo>
  comments: Record<string, Comment[]>
  commentLikes: Record<string, LikeInfo>
  tags: Record<string, GratitudeTargetTag[]>
}> {
  const entryIds = entries.map((e) => e.id)

  const tags: Record<string, GratitudeTargetTag[]> = {}
  for (const entry of entries) {
    tags[entry.id] = tagsFromEntry(entry)
  }

  const [likesRes, commentsRes] = await Promise.all([
    supabase.from('likes').select('entry_id, user_id').in('entry_id', entryIds),
    supabase
      .from('comments')
      .select('id, entry_id, user_id, anon_name, content, created_at, parent_id')
      .in('entry_id', entryIds)
      .order('created_at', { ascending: true }),
  ])

  const allLikes = likesRes.data ?? []
  const likes: Record<string, LikeInfo> = {}
  for (const entryId of entryIds) {
    const entryLikes = allLikes.filter((l) => l.entry_id === entryId)
    likes[entryId] = {
      count: entryLikes.length,
      liked: userId ? entryLikes.some((l) => l.user_id === userId) : false,
    }
  }

  const allComments = (commentsRes.data ?? []) as (Comment & { entry_id: string })[]
  const comments: Record<string, Comment[]> = {}
  for (const entryId of entryIds) {
    comments[entryId] = allComments
      .filter((c) => c.entry_id === entryId)
      .map(({ id, user_id, anon_name, content, created_at, parent_id }) => ({ id, user_id, anon_name, content, created_at, parent_id }))
  }

  // 留言愛心改為從 comment_likes 表載入（過去是純前端 state，重整就歸零）
  const commentLikes: Record<string, LikeInfo> = {}
  const commentIds = allComments.map((c) => c.id)
  if (commentIds.length > 0) {
    const { data } = await supabase
      .from('comment_likes')
      .select('comment_id, user_id')
      .in('comment_id', commentIds)
    const rows = data ?? []
    for (const commentId of commentIds) {
      const cLikes = rows.filter((l) => l.comment_id === commentId)
      commentLikes[commentId] = {
        count: cLikes.length,
        liked: userId ? cLikes.some((l) => l.user_id === userId) : false,
      }
    }
  }

  return { likes, comments, commentLikes, tags }
}

export const Route = createFileRoute('/app/community')({
  validateSearch: (search: Record<string, unknown>): { showEntry?: number; focus?: string; workshop?: string } => {
    const raw = search.showEntry
    const out: { showEntry?: number; focus?: string; workshop?: string } = {}
    if (raw === 1 || raw === '1') out.showEntry = 1
    if (typeof search.focus === 'string' && search.focus) out.focus = search.focus
    if (typeof search.workshop === 'string' && search.workshop) out.workshop = search.workshop
    return out
  },
  loader: async () => {
    // 只載第一批社群動態（其餘往下滑再向後端要）。
    const [entries, workshopEntriesRaw, sessionRes] = await Promise.all([
      fetchCommunityPage(0, PAGE_SIZE),
      fetchWorkshopEntries(),
      supabase.auth.getSession(),
    ])

    const session = sessionRes.data.session
    const userId = session?.user.id ?? null

    // myEntries 只載第一批（往下滑再要）；myWorkshopEntries 全取，供工作坊區塊判斷。
    const [myEntries, myWorkshopEntries, profileRes, modalEntry, userMap, blocked] = await Promise.all([
      userId ? fetchMyPage(userId, 0, MY_PAGE_SIZE) : Promise.resolve([] as GratitudeEntry[]),
      userId ? fetchMyWorkshopEntries(userId) : Promise.resolve([] as GratitudeEntry[]),
      userId
        ? supabase.from('profiles').select('name').eq('id', userId).single()
        : Promise.resolve({ data: null }),
      fetchModalEntry(userId),
      fetchUserGratitudeMap(userId),
      fetchBlockedIds(userId),
    ])

    const communityHasMore = entries.length === PAGE_SIZE
    const myHasMore = myEntries.length === MY_PAGE_SIZE

    // 過濾掉已封鎖使用者的工作坊貼文與每日 modal（社群動態/我的貼文在 render 時才濾）
    const visibleWorkshop = workshopEntriesRaw.filter((e) => !e.user_id || !blocked.has(e.user_id))
    const visibleModal =
      modalEntry && modalEntry.user_id && blocked.has(modalEntry.user_id) ? null : modalEntry
    const blockedIds = [...blocked]

    // Combine unique entries from all feeds for a single supporting data fetch
    const entrySet = new Map<string, GratitudeEntry>()
    entries.forEach((e) => entrySet.set(e.id, e))
    visibleWorkshop.forEach((e) => { if (!entrySet.has(e.id)) entrySet.set(e.id, e) })
    myEntries.forEach((e) => { if (!entrySet.has(e.id)) entrySet.set(e.id, e) })
    myWorkshopEntries.forEach((e) => { if (!entrySet.has(e.id)) entrySet.set(e.id, e) })
    const allForSupport = [...entrySet.values()]

    const anonName = (profileRes.data?.name ?? null) as string | null

    if (allForSupport.length === 0) {
      return {
        entries,
        workshopEntries: visibleWorkshop,
        myEntries,
        myWorkshopEntries,
        communityHasMore,
        myHasMore,
        likes: {} as Record<string, LikeInfo>,
        comments: {} as Record<string, Comment[]>,
        commentLikes: {} as Record<string, LikeInfo>,
        tags: {} as Record<string, GratitudeTargetTag[]>,
        anonName,
        userId,
        modalEntry: null as GratitudeEntry | null,
        userMap: {} as Record<string, number>,
        blockedIds,
      }
    }

    const supporting = await fetchSupporting(allForSupport, userId)

    // 濾掉已封鎖使用者的留言（含巢狀回覆）
    if (blocked.size > 0) {
      for (const key of Object.keys(supporting.comments)) {
        supporting.comments[key] = supporting.comments[key].filter(
          (c) => !c.user_id || !blocked.has(c.user_id),
        )
      }
    }

    return {
      entries,
      workshopEntries: visibleWorkshop,
      myEntries,
      myWorkshopEntries,
      communityHasMore,
      myHasMore,
      ...supporting,
      anonName,
      userId,
      modalEntry: visibleModal,
      userMap,
      blockedIds,
    }
  },
  pendingComponent: LoadingState,
  component: CommunityPage,
})

type FeedMode = 'community' | 'workshop' | 'my'
// 「社群貼文」的排序（規格 [1]）：最相關 / 最新；預設最新。
type CommunitySort = 'relevant' | 'latest'

// 計算單篇貼文與使用者感恩地圖的相關度：
// 貼文每個類別標籤，加上使用者該類別在自身感恩地圖中的占比。
// 使用者越常感恩的類別，含該類別的貼文分數越高。
function relevanceScore(
  tags: GratitudeTargetTag[],
  userMap: Record<string, number>,
  total: number,
): number {
  if (total === 0) return 0
  let score = 0
  for (const tag of tags) {
    score += (userMap[tag.target] ?? 0) / total
  }
  return score
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${y} / ${m} / ${d}`
}

const AVATAR_OPTIONS = [
  { code: 'star',      emoji: '🌟', tile: 'bg-tile-peach' },
  { code: 'blossom',   emoji: '🌸', tile: 'bg-tile-pink' },
  { code: 'leaf',      emoji: '🌿', tile: 'bg-tile-mint' },
  { code: 'sun',       emoji: '☀️', tile: 'bg-tile-blue' },
  { code: 'butterfly', emoji: '🦋', tile: 'bg-tile-pink' },
  { code: 'wave',      emoji: '🌊', tile: 'bg-tile-blue' },
]

function isPhotoAvatar(code: string | null | undefined): boolean {
  return !!code && (code.startsWith('data:image') || code.startsWith('http'))
}

function avatarFor(
  seed: string | null,
  index: number,
  avatarCode?: string | null,
): { emoji: string; tile: string; photoUrl?: string } {
  if (isPhotoAvatar(avatarCode)) {
    return { emoji: '', tile: '', photoUrl: avatarCode as string }
  }
  if (avatarCode) {
    const opt = AVATAR_OPTIONS.find((a) => a.code === avatarCode)
    if (opt) return { emoji: opt.emoji, tile: opt.tile }
  }
  if (!seed) return { emoji: AVATAR_OPTIONS[index % AVATAR_OPTIONS.length].emoji, tile: AVATAR_OPTIONS[index % AVATAR_OPTIONS.length].tile }
  const sum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const idx = sum % AVATAR_OPTIONS.length
  return { emoji: AVATAR_OPTIONS[idx].emoji, tile: AVATAR_OPTIONS[idx].tile }
}

function Header() {
  return (
    <header className="mb-1">
      <h1 className="text-[25px] font-black tracking-[0.03em] text-foreground">健身房動態</h1>
      <p className="font-en mt-1 text-sm font-medium tracking-[0.02em] text-muted-foreground">PSY by PSY Feed</p>
      <p className="mt-3.5 text-xl font-bold tracking-[0.03em] text-muted-foreground">大家今天感謝了什麼？</p>
    </header>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-md px-5 pt-4">
      <Header />
      <div className="mt-4 flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-[22px] bg-primary-soft" />
        ))}
      </div>
    </div>
  )
}

// 往下滑載入下一批時的提示。
function LoadMoreHint() {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      載入更多…
    </div>
  )
}

const LS_KEY = 'community_last_shown'

function useWelcomeModal(hasEntry: boolean, forceShow: boolean) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hasEntry) return
    // 條件一：完成練習導向（?showEntry=1）— 一律顯示
    if (forceShow) {
      setOpen(true)
      return
    }
    // 條件二：每日首次進入社群 tab
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LS_KEY) !== today) {
      localStorage.setItem(LS_KEY, today)
      setOpen(true)
    }
  }, [hasEntry, forceShow])

  return { open, close: () => setOpen(false) }
}

function DailyModal({
  entry,
  onClose,
  entryId,
  userId,
  anonName,
  onCommentAdded,
  onBlock,
}: {
  entry: GratitudeEntry
  onClose: () => void
  entryId: string
  userId: string | null
  anonName: string | null
  onCommentAdded: (c: Comment) => void
  onBlock: (blockedUserId: string) => void
}) {
  const avatar = avatarFor(entry.anon_name, 0, entry.avatar)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [like, setLike] = useState<LikeInfo>({ count: 0, liked: false })
  const [liking, setLiking] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  // 檢舉貼文成功或封鎖作者後直接關閉 modal
  const { openReport, openBlock, sheets } = useModeration({
    userId,
    onBlock: (id) => { onBlock(id); onClose() },
    onReported: () => onClose(),
  })

  // 載入這篇貼文目前的按讚狀態（讓 modal 內可直接按讚）
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('likes').select('user_id').eq('entry_id', entryId)
      if (cancelled) return
      const rows = data ?? []
      setLike({
        count: rows.length,
        liked: userId ? rows.some((r) => r.user_id === userId) : false,
      })
    })()
    return () => { cancelled = true }
  }, [entryId, userId])

  async function toggleLike() {
    if (!userId || liking) return
    setLiking(true)
    if (like.liked) {
      setLike({ count: like.count - 1, liked: false })
      await supabase.from('likes').delete().eq('entry_id', entryId).eq('user_id', userId)
    } else {
      setLike({ count: like.count + 1, liked: true })
      await supabase.from('likes').insert({ entry_id: entryId, user_id: userId })
    }
    setLiking(false)
  }

  async function submitComment() {
    const content = commentText.trim()
    if (!content || !userId || submitting) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ entry_id: entryId, user_id: userId, anon_name: anonName, content })
      .select('id, user_id, anon_name, content, created_at')
      .single()
    if (!error && data) {
      onCommentAdded(data as Comment)
      setCommentText('')
      setSentCount((c) => c + 1)
    }
    setSubmitting(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitComment()
    }
  }

  return (
    // 背景點擊不關閉：使用者必須按右上角的叉叉才能離開。
    // paddingBottom = --keyboard-height：鍵盤彈出時底部讓出空間，flex 置中往上移。
    // max-h 同步縮減：讓 overflow-y-auto 在 modal 內可向上捲到留言框。
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      style={{ paddingBottom: 'var(--keyboard-height, 0px)' }}
    >
      <div
        className="relative w-full max-w-sm animate-fade-up overflow-y-auto rounded-3xl bg-card p-6 shadow-soft"
        style={{ maxHeight: 'calc(90vh - var(--keyboard-height, 0px))' }}
      >
        {/* 右上角關閉叉叉 */}
        <button
          onClick={onClose}
          aria-label="關閉"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted-foreground transition hover:bg-muted active:scale-90"
        >
          ✕
        </button>

        <p className="mb-4 text-center text-sm font-medium text-muted-foreground">
          今日社群動態
        </p>

        <div className="flex items-center gap-3">
          {avatar.photoUrl ? (
            <img
              src={avatar.photoUrl}
              alt="頭像"
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div className={`flex h-11 w-11 items-center justify-center rounded-full text-lg ${avatar.tile}`}>
              {avatar.emoji}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold text-foreground">
              {entry.anon_name ?? '匿名使用者'}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(entry.entry_date)}</p>
          </div>
          {userId && entry.user_id && entry.user_id !== userId && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowMenu((p) => !p)}
                aria-label="檢舉或封鎖"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
              >
                <span className="text-xl font-bold leading-none tracking-widest">···</span>
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-9 z-20 min-w-[184px] rounded-2xl border border-border bg-card p-2 shadow-soft">
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        openReport({ type: 'entry', entryId, reportedUserId: entry.user_id })
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm font-semibold text-foreground transition hover:bg-muted"
                    >
                      <span className="text-base leading-none">🚩</span>檢舉貼文
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        openBlock({ userId: entry.user_id as string, label: entry.anon_name ?? '這位使用者' })
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-muted"
                    >
                      <span className="text-base leading-none">🚫</span>封鎖此使用者
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <PracticeBody entry={entry} />

        {/* 直接按讚 */}
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
          <button
            onClick={toggleLike}
            disabled={!userId || liking}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition
              ${like.liked ? 'bg-tile-pink text-foreground' : 'text-muted-foreground hover:bg-muted'}
              ${!userId ? 'cursor-default opacity-50' : ''}`}
          >
            <span className={`text-base leading-none transition-transform ${liking ? 'scale-110' : ''}`}>
              {like.liked ? '❤️' : '🤍'}
            </span>
            <span>{like.count > 0 ? like.count : '按讚'}</span>
          </button>
        </div>

        {/* 直接留言（不需要先按任何按鈕） */}
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">留下你的鼓勵 💬</p>
          {userId ? (
            <>
              {sentCount > 0 && (
                <p className="text-xs font-semibold text-primary">
                  已送出 {sentCount} 則留言，謝謝你的鼓勵 🎉
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="留下鼓勵的話… (Enter 送出)"
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || submitting}
                  className="shrink-0 rounded-2xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
                >
                  送出
                </button>
              </div>
            </>
          ) : (
            <p className="text-center text-xs text-muted-foreground">請先登入才能留言</p>
          )}
        </div>
      </div>

      {sheets}
    </div>
  )
}

function FeedModeToggle({
  mode,
  onChange,
  userId,
}: {
  mode: FeedMode
  onChange: (m: FeedMode) => void
  userId: string | null
}) {
  const options: { value: FeedMode; label: string }[] = [
    { value: 'community', label: '社群貼文' },
    { value: 'workshop', label: '工作坊貼文' },
    ...(userId ? [{ value: 'my' as FeedMode, label: '我的貼文' }] : []),
  ]
  return (
    <div className="mb-4 flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full bg-[rgba(241,193,102,0.45)] p-1.5">
        {options.map((opt) => {
          const active = mode === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`rounded-full px-4 py-2 text-sm font-bold tracking-[0.03em] transition
                ${active
                  ? 'bg-foreground text-cream'
                  : 'text-foreground/80 hover:text-foreground'
                }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 「社群貼文」排序下拉（規格 [1]）：最相關 / 最新；預設最新。
function CommunitySortSelect({
  sort,
  onChange,
}: {
  sort: CommunitySort
  onChange: (s: CommunitySort) => void
}) {
  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      <span className="text-xs font-semibold text-muted-foreground">排序</span>
      <div className="relative">
        <select
          value={sort}
          onChange={(e) => onChange(e.target.value as CommunitySort)}
          className="appearance-none rounded-full bg-card py-1.5 pl-4 pr-9 text-sm font-bold text-foreground shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="latest">最新</option>
          <option value="relevant">最相關</option>
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
      </div>
    </div>
  )
}

// 工作坊區塊 id → 顯示用標籤（取貼文 payload.workshop_id；缺漏退回歷史工作坊）。
function workshopIdOfEntry(entry: GratitudeEntry): string {
  return workshopIdFromPayload(entry.payload?.workshop_id)
}

// 把新一批貼文接在後面，並以 id 去重（新貼文插入導致 offset 漂移時不會重複顯示）。
function mergeEntries(prev: GratitudeEntry[], next: GratitudeEntry[]): GratitudeEntry[] {
  const seen = new Set(prev.map((e) => e.id))
  return [...prev, ...next.filter((e) => !seen.has(e.id))]
}

function CommunityPage() {
  const loaderData = Route.useLoaderData()
  const { showEntry, focus, workshop } = Route.useSearch()
  const modalEntry = loaderData.modalEntry
  // 從通知或工作坊發佈導引進來（帶 focus / workshop）時不再彈出每日動態 modal
  const { open, close } = useWelcomeModal(!!modalEntry && !focus && !workshop, showEntry === 1)

  // 社群動態 / 我的貼文：往下滑時一批批向後端要（規格 1、2）。
  const [communityFeed, setCommunityFeed] = useState<GratitudeEntry[]>(loaderData.entries)
  const [communityHasMore, setCommunityHasMore] = useState<boolean>(loaderData.communityHasMore ?? false)
  const [communityLoading, setCommunityLoading] = useState(false)
  const [myEntries, setMyEntries] = useState<GratitudeEntry[]>(loaderData.myEntries ?? [])
  const [myHasMore, setMyHasMore] = useState<boolean>(loaderData.myHasMore ?? false)
  const [myLoading, setMyLoading] = useState(false)
  const [workshopEntries] = useState<GratitudeEntry[]>(loaderData.workshopEntries ?? [])
  const [myWorkshopEntries] = useState<GratitudeEntry[]>(loaderData.myWorkshopEntries ?? [])
  const [blockedIds, setBlockedIds] = useState<Set<string>>(
    () => new Set(loaderData.blockedIds ?? []),
  )
  const [likes, setLikes] = useState<Record<string, LikeInfo>>(loaderData.likes)
  const [comments, setComments] = useState<Record<string, Comment[]>>(loaderData.comments)
  const [commentLikes, setCommentLikes] = useState<Record<string, LikeInfo>>(loaderData.commentLikes)
  const [tags, setTags] = useState<Record<string, GratitudeTargetTag[]>>(loaderData.tags)
  const [mode, setMode] = useState<FeedMode>('community')
  const [communitySort, setCommunitySort] = useState<CommunitySort>('latest')
  const [selectedWorkshop, setSelectedWorkshop] = useState<string | null>(workshop ?? null)
  const [showScrollEnd, setShowScrollEnd] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const mySentinelRef = useRef<HTMLDivElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  // 後端分頁游標：以「已向後端取得的原始筆數」為 offset，避免封鎖/去重造成漂移。
  const communityOffset = useRef<number>(loaderData.entries.length)
  const myOffset = useRef<number>((loaderData.myEntries ?? []).length)
  const communityLoadingRef = useRef(false)
  const myLoadingRef = useRef(false)

  const userId = loaderData.userId ?? null
  const anonName = loaderData.anonName
  const userMap = useMemo(() => loaderData.userMap ?? {}, [loaderData.userMap])

  // 下拉重整（規格 [3]）：在頁面頂端往下拉超過門檻 → 硬重整（與頂部重整鈕一致）。
  const { pull, refreshing } = usePullToRefresh(hardRefresh)

  // 把一批新貼文的互動資料（愛心/留言/標籤）併進現有 state；已存在的鍵保留現值
  // （避免覆蓋使用者本回合的樂觀更新）。
  const mergeSupporting = useCallback(
    (s: {
      likes: Record<string, LikeInfo>
      comments: Record<string, Comment[]>
      commentLikes: Record<string, LikeInfo>
      tags: Record<string, GratitudeTargetTag[]>
    }) => {
      setLikes((p) => ({ ...s.likes, ...p }))
      setComments((p) => ({ ...s.comments, ...p }))
      setCommentLikes((p) => ({ ...s.commentLikes, ...p }))
      setTags((p) => ({ ...s.tags, ...p }))
    },
    [],
  )

  const loadMoreCommunity = useCallback(async () => {
    if (communityLoadingRef.current || !communityHasMore) return
    communityLoadingRef.current = true
    setCommunityLoading(true)
    try {
      const next = await fetchCommunityPage(communityOffset.current, PAGE_SIZE)
      communityOffset.current += next.length
      if (next.length > 0) {
        const support = await fetchSupporting(next, userId)
        mergeSupporting(support)
        setCommunityFeed((prev) => mergeEntries(prev, next))
      }
      setCommunityHasMore(next.length === PAGE_SIZE)
    } catch (e) {
      console.error('[community loadMore]', e)
    } finally {
      communityLoadingRef.current = false
      setCommunityLoading(false)
    }
  }, [communityHasMore, userId, mergeSupporting])

  const loadMoreMy = useCallback(async () => {
    if (myLoadingRef.current || !myHasMore || !userId) return
    myLoadingRef.current = true
    setMyLoading(true)
    try {
      const next = await fetchMyPage(userId, myOffset.current, MY_PAGE_SIZE)
      myOffset.current += next.length
      if (next.length > 0) {
        const support = await fetchSupporting(next, userId)
        mergeSupporting(support)
        setMyEntries((prev) => mergeEntries(prev, next))
      }
      setMyHasMore(next.length === MY_PAGE_SIZE)
    } catch (e) {
      console.error('[my loadMore]', e)
    } finally {
      myLoadingRef.current = false
      setMyLoading(false)
    }
  }, [myHasMore, userId, mergeSupporting])

  const mapTotal = useMemo(
    () => Object.values(userMap).reduce((s, v) => s + v, 0),
    [userMap],
  )

  // 社群動態已在後端排除工作坊貼文。'latest' 直接用後端順序；'relevant' 在已載入的
  // 範圍內依感恩地圖相關度重排（往下滑載入更多後會一併重排）。
  const orderedEntries = useMemo(() => {
    if (communitySort === 'latest' || mapTotal === 0) return communityFeed
    return communityFeed
      .map((entry, i) => ({
        entry,
        i,
        score: relevanceScore(tags[entry.id] ?? [], userMap, mapTotal),
      }))
      .sort((a, b) => (b.score - a.score) || (a.i - b.i))
      .map((x) => x.entry)
  }, [communitySort, communityFeed, tags, userMap, mapTotal])

  // 我參與（發過文）的工作坊 id —— 規格 [4]：只有發過文的成員看得到該區塊。
  // 用全量的 myWorkshopEntries（非分頁 myEntries），避免漏掉較舊的工作坊貼文。
  const myWorkshopIds = useMemo(() => {
    const s = new Set<string>()
    for (const e of myWorkshopEntries) s.add(workshopIdOfEntry(e))
    return s
  }, [myWorkshopEntries])

  // 工作坊貼文池：公開工作坊貼文 + 自己的工作坊貼文（含僅限本人；去重）。
  const workshopPool = useMemo(() => {
    const map = new Map<string, GratitudeEntry>()
    workshopEntries.forEach((e) => map.set(e.id, e))
    myWorkshopEntries.forEach((e) => { if (!map.has(e.id)) map.set(e.id, e) })
    return [...map.values()]
  }, [workshopEntries, myWorkshopEntries])

  // 分組成區塊，只保留「我發過文」的工作坊（規格 [4]）。
  const workshopBlocks = useMemo(() => {
    const groups = new Map<string, GratitudeEntry[]>()
    for (const e of workshopPool) {
      const id = workshopIdOfEntry(e)
      if (!myWorkshopIds.has(id)) continue
      if (!groups.has(id)) groups.set(id, [])
      groups.get(id)!.push(e)
    }
    return [...groups.entries()]
      .map(([id, entries]) => ({ id, entries }))
      .sort((a, b) => {
        const an = /^\d{8}$/.test(a.id)
        const bn = /^\d{8}$/.test(b.id)
        if (an && bn) return b.id.localeCompare(a.id) // 日期新到舊
        if (an) return -1
        if (bn) return 1
        return a.id.localeCompare(b.id) // 歷史標籤排最後
      })
  }, [workshopPool, myWorkshopIds])

  const selectedWorkshopEntries = useMemo(() => {
    if (!selectedWorkshop) return []
    return workshopPool
      .filter((e) => workshopIdOfEntry(e) === selectedWorkshop)
      .filter((e) => !e.user_id || !blockedIds.has(e.user_id))
  }, [workshopPool, selectedWorkshop, blockedIds])

  // 工作坊發佈導引（規格 [3]）：帶 ?workshop= 進來 → 切到工作坊分頁並開啟該區塊。
  useEffect(() => {
    if (!workshop) return
    setMode('workshop')
    setSelectedWorkshop(workshop)
  }, [workshop])

  // 從通知點進來（帶 focus 但非工作坊導引）：切到「我的貼文」。若目標貼文還沒載入，
  // 持續往後端取下一批，直到出現或沒有更多（effect 會隨 myEntries 更新重跑）。
  useEffect(() => {
    if (!focus || workshop) return
    setMode('my')
    if (!myEntries.some((e) => e.id === focus) && myHasMore && !myLoadingRef.current) {
      void loadMoreMy()
    }
  }, [focus, workshop, myEntries, myHasMore, loadMoreMy])

  // 切換工作坊區塊時重置「看完所有貼文」提示
  useEffect(() => {
    setShowScrollEnd(false)
  }, [selectedWorkshop, mode])

  // 規格 [3]：在工作坊區塊內滑到底部 → 彈出「看完所有貼文」Modal。
  useEffect(() => {
    if (mode !== 'workshop' || !selectedWorkshop || selectedWorkshopEntries.length === 0) return
    const el = scrollEndRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (es) => { if (es[0].isIntersecting) setShowScrollEnd(true) },
      { rootMargin: '0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode, selectedWorkshop, selectedWorkshopEntries.length])

  const visibleEntries = orderedEntries.filter((e) => !e.user_id || !blockedIds.has(e.user_id))
  const visibleMyEntries = myEntries

  // 社群動態：sentinel 進入視窗 → 向後端要下一批。依賴 feed 長度與 mode：每批載入後
  // 重新訂閱，若 sentinel 仍在視窗內會再次觸發（避免畫面很高時一次只載一批就停住）。
  useEffect(() => {
    const el = sentinelRef.current
    if (mode !== 'community' || !el || !communityHasMore) return
    const observer = new IntersectionObserver(
      (es) => { if (es[0].isIntersecting) void loadMoreCommunity() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode, communityHasMore, communityFeed.length, loadMoreCommunity])

  // 我的貼文：sentinel 進入視窗 → 向後端要下一批。
  useEffect(() => {
    const el = mySentinelRef.current
    if (mode !== 'my' || !el || !myHasMore) return
    const observer = new IntersectionObserver(
      (es) => { if (es[0].isIntersecting) void loadMoreMy() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode, myHasMore, myEntries.length, loadMoreMy])

  function handleLikeChange(entryId: string, newInfo: LikeInfo) {
    setLikes((prev) => ({ ...prev, [entryId]: newInfo }))
  }

  function handleCommentAdded(entryId: string, comment: Comment) {
    setComments((prev) => ({
      ...prev,
      [entryId]: [...(prev[entryId] ?? []), comment],
    }))
  }

  function handleCommentLikeChange(commentId: string, info: LikeInfo) {
    setCommentLikes((prev) => ({ ...prev, [commentId]: info }))
  }

  // 封鎖成功後即時把對方加入過濾名單：其貼文/留言立刻從畫面消失
  function handleBlocked(blockedUserId: string) {
    setBlockedIds((prev) => {
      const next = new Set(prev)
      next.add(blockedUserId)
      return next
    })
  }

  return (
    <>
      {/* 下拉重整指示器（規格 [3]）：固定在頂部 header 下方，隨下拉距離淡入。 */}
      {pull > 0 && (
        <div
          className="pointer-events-none fixed left-0 right-0 z-40 flex items-end justify-center overflow-hidden"
          style={{
            top: 'calc(env(safe-area-inset-top) + 3.5rem)',
            height: `${pull}px`,
            opacity: Math.min(1, pull / PULL_THRESHOLD),
          }}
        >
          <div className="flex items-center gap-2 pb-1 text-xs font-semibold text-muted-foreground">
            <span
              className={`h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-primary ${refreshing ? 'animate-spin' : ''}`}
              style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}
            />
            {refreshing ? '更新中…' : pull >= PULL_THRESHOLD ? '放開以重整' : '下拉重整'}
          </div>
        </div>
      )}

      {open && modalEntry && (
        <DailyModal
          entry={modalEntry}
          onClose={close}
          entryId={modalEntry.id}
          userId={userId}
          anonName={anonName}
          onCommentAdded={(c) => handleCommentAdded(modalEntry.id, c)}
          onBlock={handleBlocked}
        />
      )}

      <div className="animate-fade-up mx-auto max-w-md px-5 pt-4 pb-8">
        <Header />

        <div
          className="relative mb-5 mt-3.5 h-[188px] overflow-hidden rounded-[22px]"
          style={{ background: 'radial-gradient(circle at 50% 45%, #f3e7cf 0%, #ece0c8 55%, #FEFAF0 100%)' }}
        >
          <img
            src={wordCloudImg}
            alt="感恩文字雲"
            className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-multiply"
          />
          <span className="absolute left-[14%] top-[30%] text-[21px] font-bold text-[#876B5F]">公園</span>
          <span className="absolute left-[34%] top-[20%] text-[25px] font-black text-[#71744F]">狗狗</span>
          <span className="absolute left-[30%] top-[42%] text-[19px] font-bold text-[#b79858]">開心</span>
          <span className="absolute right-[18%] top-[24%] text-[25px] font-black text-[#a13a1e]">好吃</span>
          <span className="absolute left-[20%] top-[62%] text-[21px] font-bold text-[#876B5F]">論文</span>
          <span className="absolute right-[30%] top-[56%] text-[27px] font-black text-[#88B8CE] [text-shadow:0_0_14px_rgba(136,184,206,0.7)]">心情</span>
          <span className="absolute right-[16%] top-[64%] text-[22px] font-extrabold text-[#d18197]">伴侶</span>
        </div>

        <FeedModeToggle mode={mode} onChange={setMode} userId={userId} />

        {mode === 'my' ? (
          <>
            {myEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-center text-muted-foreground shadow-soft">
                <span className="text-4xl">🏋️</span>
                <p className="mt-3 text-sm font-medium">還沒有打卡紀錄，快按下訓練中心，開始第一次訓練！</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  {visibleMyEntries.map((entry, i) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      index={i}
                      likeInfo={likes[entry.id] ?? { count: 0, liked: false }}
                      comments={comments[entry.id] ?? []}
                      commentLikes={commentLikes}
                      tags={tags[entry.id] ?? []}
                      userId={userId}
                      anonName={anonName}
                      autoFocus={focus === entry.id}
                      isOwn={true}
                      blockedIds={blockedIds}
                      onLikeChange={(info) => handleLikeChange(entry.id, info)}
                      onCommentAdded={(c) => handleCommentAdded(entry.id, c)}
                      onCommentLikeChange={handleCommentLikeChange}
                      onBlock={handleBlocked}
                    />
                  ))}
                </div>
                <div ref={mySentinelRef} className="h-4" />
                {myLoading && <LoadMoreHint />}
                {!myHasMore && !myLoading && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    已經看完所有打卡紀錄囉！
                  </p>
                )}
              </>
            )}
          </>
        ) : mode === 'workshop' ? (
          <WorkshopTab
            userId={userId}
            blocks={workshopBlocks}
            selectedWorkshop={selectedWorkshop}
            onSelect={setSelectedWorkshop}
            selectedEntries={selectedWorkshopEntries}
            scrollEndRef={scrollEndRef}
            likes={likes}
            comments={comments}
            commentLikes={commentLikes}
            tags={tags}
            anonName={anonName}
            blockedIds={blockedIds}
            focus={focus}
            onLikeChange={handleLikeChange}
            onCommentAdded={handleCommentAdded}
            onCommentLikeChange={handleCommentLikeChange}
            onBlock={handleBlocked}
          />
        ) : (
          <>
            <CommunitySortSelect sort={communitySort} onChange={setCommunitySort} />
            {orderedEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-muted-foreground shadow-soft">
                <span className="text-4xl">💫</span>
                <p className="mt-3 text-sm font-medium">還沒有人分享，快去寫感恩日記吧！</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  {visibleEntries.map((entry, i) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      index={i}
                      likeInfo={likes[entry.id] ?? { count: 0, liked: false }}
                      comments={comments[entry.id] ?? []}
                      commentLikes={commentLikes}
                      tags={tags[entry.id] ?? []}
                      userId={userId}
                      anonName={anonName}
                      isOwn={entry.user_id === userId && userId !== null}
                      blockedIds={blockedIds}
                      onLikeChange={(info) => handleLikeChange(entry.id, info)}
                      onCommentAdded={(c) => handleCommentAdded(entry.id, c)}
                      onCommentLikeChange={handleCommentLikeChange}
                      onBlock={handleBlocked}
                    />
                  ))}
                </div>
                <div ref={sentinelRef} className="h-4" />
                {communityLoading && <LoadMoreHint />}
                {!communityHasMore && !communityLoading && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    已經看完所有打卡紀錄囉！
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showScrollEnd && <ScrollEndModal onClose={() => setShowScrollEnd(false)} />}
    </>
  )
}

// 規格 [3]：在工作坊區塊滑到底部彈出，提醒回到原本頁面繼續活動。
function ScrollEndModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-fade-up rounded-3xl bg-card p-6 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-3xl">
          ✅
        </div>
        <p className="text-base font-extrabold leading-relaxed text-foreground">
          看完所有貼文囉！
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          請回到原本的頁面繼續進行活動。
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-gradient-primary text-base font-extrabold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.98]"
        >
          我知道了
        </button>
      </div>
    </div>
  )
}

// 「工作坊貼文」分頁：未選區塊→區塊列表；選了→該工作坊的貼文列表（規格 [1][3][4]）。
function WorkshopTab({
  userId,
  blocks,
  selectedWorkshop,
  onSelect,
  selectedEntries,
  scrollEndRef,
  likes,
  comments,
  commentLikes,
  tags,
  anonName,
  blockedIds,
  focus,
  onLikeChange,
  onCommentAdded,
  onCommentLikeChange,
  onBlock,
}: {
  userId: string | null
  blocks: { id: string; entries: GratitudeEntry[] }[]
  selectedWorkshop: string | null
  onSelect: (id: string | null) => void
  selectedEntries: GratitudeEntry[]
  scrollEndRef: React.RefObject<HTMLDivElement>
  likes: Record<string, LikeInfo>
  comments: Record<string, Comment[]>
  commentLikes: Record<string, LikeInfo>
  tags: Record<string, GratitudeTargetTag[]>
  anonName: string | null
  blockedIds: Set<string>
  focus?: string
  onLikeChange: (entryId: string, info: LikeInfo) => void
  onCommentAdded: (entryId: string, c: Comment) => void
  onCommentLikeChange: (commentId: string, info: LikeInfo) => void
  onBlock: (blockedUserId: string) => void
}) {
  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-center text-muted-foreground shadow-soft">
        <span className="text-4xl">🔒</span>
        <p className="mt-3 text-sm font-medium">請先登入，並完成工作坊練習後，即可在此看到你參加過的工作坊貼文。</p>
      </div>
    )
  }

  // 已選區塊 → 顯示該工作坊的貼文列表
  if (selectedWorkshop) {
    return (
      <>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mb-3 flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-sm font-bold text-foreground/70 shadow-soft transition active:scale-[0.97]"
        >
          ← 工作坊列表
        </button>
        <h2 className="mb-4 text-lg font-extrabold text-foreground">
          {formatWorkshopLabel(selectedWorkshop)}
        </h2>

        {selectedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-center text-muted-foreground shadow-soft">
            <span className="text-4xl">📝</span>
            <p className="mt-3 text-sm font-medium">這個工作坊還沒有公開的貼文。</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {selectedEntries.map((entry, i) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  index={i}
                  likeInfo={likes[entry.id] ?? { count: 0, liked: false }}
                  comments={comments[entry.id] ?? []}
                  commentLikes={commentLikes}
                  tags={tags[entry.id] ?? []}
                  userId={userId}
                  anonName={anonName}
                  autoFocus={focus === entry.id}
                  isOwn={entry.user_id === userId}
                  blockedIds={blockedIds}
                  onLikeChange={(info) => onLikeChange(entry.id, info)}
                  onCommentAdded={(c) => onCommentAdded(entry.id, c)}
                  onCommentLikeChange={onCommentLikeChange}
                  onBlock={onBlock}
                />
              ))}
            </div>
            <div ref={scrollEndRef} className="h-4" />
            <p className="py-8 text-center text-sm text-muted-foreground">
              已經看完所有貼文囉！
            </p>
          </>
        )}
      </>
    )
  }

  // 未選區塊 → 區塊列表
  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-center text-muted-foreground shadow-soft">
        <span className="text-4xl">🪧</span>
        <p className="mt-3 text-sm font-medium">完成並發佈工作坊練習後，這裡會出現你參加過的工作坊。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onSelect(b.id)}
          className="flex items-center gap-4 rounded-3xl bg-card p-5 text-left shadow-soft transition active:scale-[0.98]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
            🪐
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-extrabold text-foreground">
              {formatWorkshopLabel(b.id)}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{b.entries.length} 則貼文</span>
          </span>
          <span className="shrink-0 text-muted-foreground">›</span>
        </button>
      ))}
    </div>
  )
}

// 貼文右上角的版型小標籤（文字＋底色），依練習來源切換。
function practiceTag(practiceType: string | null): { label: string; tile: string } {
  switch (practiceType) {
    case 'process_goal':
      return { label: '過程目標覺察', tile: 'bg-tile-blue' }
    case 'workshop_authentic_self':
      return { label: '找尋真實自我', tile: 'bg-tile-pink' }
    case 'workshop_last_day':
      return { label: '生命最後一天', tile: 'bg-tile-peach' }
    case 'workshop_woop':
      return { label: 'WOOP 目標實踐地圖', tile: 'bg-tile-lemon' }
    default:
      return { label: '感恩日記', tile: 'bg-tile-mint' }
  }
}

// ── 貼文主體（依練習類型客製版型） ──────────────────────────────────────
// 感恩日記＝三項條列（編號泡泡）；過程目標覺察＝事件／人時地／AI 回饋；
// 找尋真實自我＝工作/生活最重要事件＋自我敘事；生命最後一天＝希望被記得的樣子＋行動；
// WOOP＝願望／結果／阻礙＋If-Then 執行計畫。
// 未來新練習：在 PracticeBody 增加一個分支 + 對應的 Body 元件即可。
function PracticeBody({ entry }: { entry: GratitudeEntry }) {
  if (entry.practice_type === 'process_goal' && entry.payload) {
    return <ProcessGoalBody payload={entry.payload} />
  }
  if (entry.practice_type === 'workshop_authentic_self' && entry.payload) {
    return <AuthenticSelfBody payload={entry.payload} />
  }
  if (entry.practice_type === 'workshop_last_day' && entry.payload) {
    return <LastDayBody payload={entry.payload} />
  }
  if (entry.practice_type === 'workshop_woop' && entry.payload) {
    return <WoopBody payload={entry.payload} />
  }
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="relative ml-1.5 flex gap-2 rounded-xl bg-cream py-3.5 pl-[18px] pr-4">
          <span className="absolute -left-3 top-1/2 h-[15px] w-[26px] -translate-y-1/2 -rotate-[8deg] rounded-[50%] border-4 border-[#6b4a36] border-t-[#46291c] bg-transparent" />
          <span className="shrink-0 text-[15px] font-extrabold text-foreground">{i + 1}.</span>
          <span className="text-[15px] leading-[1.55] text-foreground-soft">{item}</span>
        </li>
      ))}
    </ul>
  )
}

function PgFieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted px-3.5 py-3">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{value}</p>
    </div>
  )
}

function PgAiBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gradient-soft px-3.5 py-3">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{value}</p>
    </div>
  )
}

function ProcessGoalBody({ payload }: { payload: PracticePayload }) {
  // 【提升專注錦囊】：困境 + AI 錦囊
  if (payload.v === 'boost') {
    return (
      <div className="mt-4 flex flex-col gap-2">
        {payload.situation && <PgFieldBlock label="我遇到的困境" value={payload.situation} />}
        {payload.suggestion && <PgAiBlock label="AI 專注錦囊" value={payload.suggestion} />}
      </div>
    )
  }
  // 【專注時刻記錄】：最讓我感到專注的（事）＋ 我通常在這樣的條件下完成（人/時/地）＋ AI 回饋
  const conditions = [
    { emoji: '👤', k: '人', v: payload.who },
    { emoji: '🕐', k: '時', v: payload.when },
    { emoji: '📍', k: '地', v: payload.where },
  ].filter((c) => c.v && String(c.v).trim())
  return (
    <div className="mt-4 flex flex-col gap-2">
      {payload.event && <PgFieldBlock label="最讓我感到專注的" value={payload.event} />}
      {conditions.length > 0 && (
        <div className="rounded-2xl bg-muted px-3.5 py-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            我通常在這樣的條件下完成
          </p>
          <div className="flex flex-col gap-1.5">
            {conditions.map((c) => (
              <div key={c.k} className="flex items-baseline gap-2">
                <span className="shrink-0 text-xs font-bold text-foreground/70">{c.emoji} {c.k}</span>
                <span className="text-sm leading-relaxed text-foreground/85">{String(c.v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {payload.insight && <PgAiBlock label="AI 回饋" value={payload.insight} />}
    </div>
  )
}

// 找尋真實自我：工作／生活最重要的事件（含背後原因）+ 自我敘事（亮色強調）。
function AuthenticSelfBody({ payload }: { payload: PracticePayload }) {
  const topWork = (payload.top_work ?? '').trim()
  const topLife = (payload.top_life ?? '').trim()
  const workReason = (payload.work_reason ?? '').trim()
  const lifeReason = (payload.life_reason ?? '').trim()
  const narrative = (payload.narrative ?? '').trim()
  const compose = (event: string, reason: string) =>
    reason ? `${event}\n原因：${reason}` : event
  return (
    <div className="mt-4 flex flex-col gap-2">
      {topWork && <PgFieldBlock label="工作中最重要的事件" value={compose(topWork, workReason)} />}
      {topLife && <PgFieldBlock label="生活中最重要的事件" value={compose(topLife, lifeReason)} />}
      {narrative && <PgAiBlock label="我的自我敘事" value={narrative} />}
    </div>
  )
}

// 生命最後一天：希望被記得的樣子（自我告別敘事）+ 接下來一個月的行動（亮色強調）。
function LastDayBody({ payload }: { payload: PracticePayload }) {
  // 新版：farewell（自我告別敘事）；舊版：description（被記得的樣子）。
  const farewell = (payload.farewell ?? '').trim()
  const description = (payload.description ?? '').trim()
  const action = (payload.action ?? '').trim()
  return (
    <div className="mt-4 flex flex-col gap-2">
      {farewell ? (
        <PgFieldBlock label="我希望被記得的樣子" value={farewell} />
      ) : (
        description && <PgFieldBlock label="我希望被記得的樣子" value={`一個「${description}」的人`} />
      )}
      {action && <PgAiBlock label="接下來一個月，我想要" value={action} />}
    </div>
  )
}

// WOOP 目標實踐地圖：願望／結果／阻礙 + If-Then 執行計畫（亮色強調）。
function WoopBody({ payload }: { payload: PracticePayload }) {
  const wish = (payload.wish ?? '').trim()
  const outcome = (payload.outcome ?? '').trim()
  const obstacle = (payload.obstacle ?? '').trim()
  const plan = (payload.plan ?? '').trim()
  const ifThen = obstacle && plan ? `如果${obstacle}，那麼我就${plan}。` : plan
  return (
    <div className="mt-4 flex flex-col gap-2">
      {wish && <PgFieldBlock label="W・設定目標" value={wish} />}
      {outcome && <PgFieldBlock label="O・看見結果" value={outcome} />}
      {obstacle && <PgFieldBlock label="O・覺察阻礙" value={obstacle} />}
      {ifThen && <PgAiBlock label="P・If-Then 執行計畫" value={ifThen} />}
    </div>
  )
}

// ── 檢舉 / 封鎖（社群安全，App Store 1.2 UGC 要求）共用元件 ──────────────────

type ReportState = {
  type: ReportTargetType
  entryId?: string | null
  commentId?: string | null
  reportedUserId: string | null
}

// 檢舉底部 sheet：多選原因 + 選填備註。比照 AvatarPicker 的 bottom-sheet 樣式。
function ReportSheet({
  targetLabel,
  submitting,
  errored,
  onSubmit,
  onClose,
}: {
  targetLabel: string
  submitting: boolean
  errored: boolean
  onSubmit: (reasons: string[], note: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const canSubmit = selected.size > 0 && !submitting

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-md rounded-t-3xl bg-card px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-base font-extrabold text-foreground">檢舉這則{targetLabel}</p>
          <button onClick={onClose} aria-label="關閉" className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          請選擇檢舉原因（可複選），我們會盡快審核。系統不會通知對方。
        </p>

        <div className="flex flex-col gap-2">
          {REPORT_REASONS.map((r) => {
            const active = selected.has(r.code)
            return (
              <button
                key={r.code}
                onClick={() => toggle(r.code)}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                <span>{r.label}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  }`}
                >
                  {active ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="補充說明（選填）"
          rows={2}
          className="mt-3 w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />

        {errored && <p className="mt-2 text-xs font-semibold text-red-500">送出失敗，請稍後再試。</p>}

        <button
          onClick={() => canSubmit && onSubmit([...selected], note)}
          disabled={!canSubmit}
          className="mt-4 w-full rounded-full bg-gradient-primary py-3.5 text-sm font-extrabold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? '送出中…' : '送出檢舉'}
        </button>
      </div>
    </div>
  )
}

// 封鎖確認 sheet。
function ConfirmBlock({
  label,
  submitting,
  errored,
  onConfirm,
  onClose,
}: {
  label: string
  submitting: boolean
  errored: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-md rounded-t-3xl bg-card px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-extrabold text-foreground">封鎖 {label}？</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          封鎖後，你將不會再看到這位使用者的貼文與留言。你可以隨時到「個人檔案」解除封鎖。
        </p>
        {errored && <p className="mt-2 text-xs font-semibold text-red-500">封鎖失敗，請稍後再試。</p>}
        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border bg-background py-3 text-sm font-bold text-foreground transition hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 rounded-full bg-red-500 py-3 text-sm font-extrabold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '封鎖中…' : '封鎖'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 檢舉 / 封鎖的共用狀態與 DB 寫入。回傳開啟器與要渲染的 sheets。
// onReported：檢舉成功後通知呼叫端做樂觀隱藏；onBlock：封鎖成功後把對方加入過濾名單。
function useModeration({
  userId,
  onBlock,
  onReported,
}: {
  userId: string | null
  onBlock: (blockedUserId: string) => void
  onReported: (target: ReportState) => void
}) {
  const [reportTarget, setReportTarget] = useState<ReportState | null>(null)
  const [blockTarget, setBlockTarget] = useState<{ userId: string; label: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errored, setErrored] = useState(false)

  function openReport(t: ReportState) {
    setErrored(false)
    setReportTarget(t)
  }
  function openBlock(t: { userId: string; label: string }) {
    setErrored(false)
    setBlockTarget(t)
  }
  function closeAll() {
    setReportTarget(null)
    setBlockTarget(null)
    setErrored(false)
  }

  async function doReport(reasons: string[], note: string) {
    if (!userId || !reportTarget) return
    setSubmitting(true)
    setErrored(false)
    const ok = await submitReport({
      reporterId: userId,
      targetType: reportTarget.type,
      entryId: reportTarget.entryId,
      commentId: reportTarget.commentId,
      reportedUserId: reportTarget.reportedUserId,
      reasons,
      note,
    })
    setSubmitting(false)
    if (ok) {
      onReported(reportTarget)
      setReportTarget(null)
    } else {
      setErrored(true)
    }
  }

  async function doBlock() {
    if (!userId || !blockTarget) return
    setSubmitting(true)
    setErrored(false)
    const ok = await blockUser(userId, blockTarget.userId, blockTarget.label)
    setSubmitting(false)
    if (ok) {
      onBlock(blockTarget.userId)
      setBlockTarget(null)
    } else {
      setErrored(true)
    }
  }

  const sheets = (
    <>
      {reportTarget && (
        <ReportSheet
          targetLabel={reportTarget.type === 'entry' ? '貼文' : '留言'}
          submitting={submitting}
          errored={errored}
          onSubmit={doReport}
          onClose={closeAll}
        />
      )}
      {blockTarget && (
        <ConfirmBlock
          label={blockTarget.label}
          submitting={submitting}
          errored={errored}
          onConfirm={doBlock}
          onClose={closeAll}
        />
      )}
    </>
  )

  return { openReport, openBlock, sheets }
}

function EntryCard({
  entry,
  index,
  likeInfo,
  comments,
  commentLikes,
  tags,
  userId,
  anonName,
  isOwn,
  blockedIds,
  autoFocus = false,
  onLikeChange,
  onCommentAdded,
  onCommentLikeChange,
  onBlock,
}: {
  entry: GratitudeEntry
  index: number
  likeInfo: LikeInfo
  comments: Comment[]
  commentLikes: Record<string, LikeInfo>
  tags: GratitudeTargetTag[]
  userId: string | null
  anonName: string | null
  isOwn: boolean
  blockedIds: Set<string>
  autoFocus?: boolean
  onLikeChange: (info: LikeInfo) => void
  onCommentAdded: (c: Comment) => void
  onCommentLikeChange: (commentId: string, info: LikeInfo) => void
  onBlock: (blockedUserId: string) => void
}) {
  const articleRef = useRef<HTMLElement>(null)
  // 工作坊貼文不顯示「隱私／匿名分享」選單（規格 [4]）：工作坊貼文是隨工作坊發佈，
  // 不需要切換公開／匿名／實名。他人貼文的檢舉／封鎖選單仍保留（App Store UGC 要求）。
  const isWorkshopEntry = WORKSHOP_PRACTICE_TYPES.includes(entry.practice_type ?? '')
  const [localAnonName, setLocalAnonName] = useState<string | null>(entry.anon_name)
  const [localPrivacy, setLocalPrivacy] = useState<Privacy>(
    privacyFromFields({ is_shared: entry.is_shared, use_real_name: entry.use_real_name }),
  )
  const [showMenu, setShowMenu] = useState(false)
  const avatar = avatarFor(localAnonName, index, entry.avatar)
  const [showComments, setShowComments] = useState(false)
  const [liking, setLiking] = useState(false)

  // 檢舉 / 封鎖（非本人貼文與留言）
  const [openCommentMenu, setOpenCommentMenu] = useState<string | null>(null)
  const [postReported, setPostReported] = useState(false)
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(new Set())
  const [commentReportDone, setCommentReportDone] = useState(false)
  const { openReport, openBlock, sheets } = useModeration({
    userId,
    onBlock,
    onReported: (t) => {
      if (t.type === 'entry') {
        setPostReported(true)
      } else if (t.commentId) {
        setHiddenCommentIds((prev) => new Set(prev).add(t.commentId as string))
        setCommentReportDone(true)
      }
    },
  })

  // 從通知點進來：自動展開留言並捲動到這篇貼文
  useEffect(() => {
    if (!autoFocus) return
    setShowComments(true)
    const t = setTimeout(() => {
      articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => clearTimeout(t)
  }, [autoFocus])

  async function changePrivacy(next: Privacy) {
    if (next === localPrivacy) {
      setShowMenu(false)
      return
    }
    const fields = privacyToFields(next)
    const newAnonName = fields.use_real_name ? anonName : (localAnonName ?? anonName)
    setLocalPrivacy(next)
    setLocalAnonName(newAnonName)
    setShowMenu(false)
    await supabase
      .from('gratitude_entries')
      .update({ is_shared: fields.is_shared, use_real_name: fields.use_real_name, anon_name: newAnonName })
      .eq('id', entry.id)
  }
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [likingComment, setLikingComment] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  // 過濾掉已封鎖使用者的留言、以及本人剛檢舉而樂觀隱藏的留言
  const visibleComments = comments.filter(
    (c) => (!c.user_id || !blockedIds.has(c.user_id)) && !hiddenCommentIds.has(c.id),
  )
  const topLevelComments = visibleComments.filter((c) => !c.parent_id)
  const repliesFor = (parentId: string) => visibleComments.filter((c) => c.parent_id === parentId)

  // 留言愛心：寫入 comment_likes 表並樂觀更新 UI（過去是純前端 state，重整就歸零）
  async function toggleCommentLike(commentId: string) {
    if (!userId || likingComment) return
    setLikingComment(commentId)
    const current = commentLikes[commentId] ?? { count: 0, liked: false }
    const liked = !current.liked
    onCommentLikeChange(commentId, {
      count: current.count + (liked ? 1 : -1),
      liked,
    })
    if (liked) {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId })
    } else {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId)
    }
    setLikingComment(null)
  }

  async function submitReply() {
    const content = replyText.trim()
    if (!content || !userId || !replyingTo || submitting) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ entry_id: entry.id, user_id: userId, anon_name: anonName, content, parent_id: replyingTo })
      .select('id, user_id, anon_name, content, created_at, parent_id')
      .single()
    if (!error && data) {
      onCommentAdded(data as Comment)
      setReplyText('')
      setReplyingTo(null)
    }
    setSubmitting(false)
  }

  function handleReplyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitReply()
    }
  }

  function startReplying(commentId: string) {
    setReplyingTo(commentId)
    setReplyText('')
    setTimeout(() => replyInputRef.current?.focus(), 80)
  }

  async function toggleLike() {
    if (!userId || liking) return
    setLiking(true)
    if (likeInfo.liked) {
      await supabase
        .from('likes')
        .delete()
        .eq('entry_id', entry.id)
        .eq('user_id', userId)
      onLikeChange({ count: likeInfo.count - 1, liked: false })
    } else {
      await supabase.from('likes').insert({ entry_id: entry.id, user_id: userId })
      onLikeChange({ count: likeInfo.count + 1, liked: true })
    }
    setLiking(false)
  }

  function openComments() {
    setShowComments(true)
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function submitComment() {
    const content = commentText.trim()
    if (!content || !userId || submitting) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ entry_id: entry.id, user_id: userId, anon_name: anonName, content })
      .select('id, user_id, anon_name, content, created_at')
      .single()
    if (!error && data) {
      onCommentAdded(data as Comment)
      setCommentText('')
    }
    setSubmitting(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitComment()
    }
  }

  // 檢舉貼文後，樂觀地以確認卡取代原貼文
  if (postReported) {
    return (
      <article className="rounded-3xl bg-card p-6 text-center shadow-soft">
        <p className="text-sm font-extrabold text-foreground">✅ 已收到你的檢舉</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          我們會盡快審核，感謝你協助維護社群。
        </p>
      </article>
    )
  }

  return (
    <article
      ref={articleRef}
      className={`rounded-[22px] p-[18px] transition ${
        autoFocus ? 'ring-2 ring-primary' : ''
      }`}
      style={{ background: index % 2 === 0 ? 'rgba(136,184,206,0.55)' : 'rgba(185,176,120,0.5)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {avatar.photoUrl ? (
          <img
            src={avatar.photoUrl}
            alt="頭像"
            className="h-[54px] w-[54px] rounded-full object-cover"
          />
        ) : (
          <div className={`flex h-[54px] w-[54px] items-center justify-center rounded-full text-xl ${avatar.tile}`}>
            {avatar.emoji}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[21px] font-black tracking-[0.03em] text-foreground">
            {localAnonName ?? '匿名使用者'}
          </p>
          <div className="flex items-center gap-2">
            <p className="font-en text-sm font-semibold text-muted-foreground">{formatDate(entry.entry_date)}</p>
            {entry.current_streak != null && entry.current_streak > 0 && (
              <span className="text-xs font-semibold text-orange-500">🔥 連續 {entry.current_streak} 天</span>
            )}
            {isOwn && localPrivacy === 'private' && (
              <span className="text-xs font-semibold text-muted-foreground">🔒 僅限本人</span>
            )}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[#876B5F] bg-cream px-2.5 py-1 text-[13px] font-bold text-foreground">
          <i className="h-2 w-2 rounded-full bg-[#71744F]" />
          {practiceTag(entry.practice_type).label}
        </span>
        {isOwn && !isWorkshopEntry && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
              aria-label="更多選項"
            >
              <span className="text-xl font-bold leading-none tracking-widest">···</span>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-9 z-20 min-w-[208px] rounded-2xl border border-border bg-card p-2 shadow-soft">
                  <p className="px-2 pb-1 pt-1 text-xs font-bold text-muted-foreground">隱私設定</p>
                  {PRIVACY_OPTIONS.map((opt) => {
                    const active = localPrivacy === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => changePrivacy(opt.value)}
                        aria-pressed={active}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
                          active ? 'bg-primary/10' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="text-base leading-none">{opt.emoji}</span>
                        <span className="flex-1">
                          <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {opt.hint}
                          </span>
                        </span>
                        {active && <span className="text-primary">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {!isOwn && userId && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
              aria-label="檢舉或封鎖"
            >
              <span className="text-xl font-bold leading-none tracking-widest">···</span>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-9 z-20 min-w-[184px] rounded-2xl border border-border bg-card p-2 shadow-soft">
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      openReport({ type: 'entry', entryId: entry.id, reportedUserId: entry.user_id })
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm font-semibold text-foreground transition hover:bg-muted"
                  >
                    <span className="text-base leading-none">🚩</span>檢舉貼文
                  </button>
                  {entry.user_id && (
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        openBlock({ userId: entry.user_id as string, label: localAnonName ?? '這位使用者' })
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm font-semibold text-red-500 transition hover:bg-muted"
                    >
                      <span className="text-base leading-none">🚫</span>封鎖此使用者
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body（依練習類型客製版型） */}
      <PracticeBody entry={entry} />

      {/* Gratitude target tags */}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => {
            const cfg = TARGET_CONFIG[tag.target] ?? TARGET_CONFIG.custom
            return (
              <span
                key={i}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}
              >
                {cfg.emoji} {tag.label}
              </span>
            )
          })}
        </div>
      )}

      {/* Action bar */}
      <div className="mt-4 flex items-center gap-3 border-t border-[rgba(84,41,22,0.18)] pt-3">
        <button
          onClick={toggleLike}
          disabled={!userId || liking}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition
            ${likeInfo.liked
              ? 'bg-tile-pink text-foreground'
              : 'text-muted-foreground hover:bg-muted'
            }
            ${!userId ? 'cursor-default opacity-50' : ''}`}
        >
          <span className={`text-base leading-none transition-transform ${liking ? 'scale-110' : ''}`}>
            {likeInfo.liked ? '❤️' : '🤍'}
          </span>
          <span>{likeInfo.count > 0 ? likeInfo.count : ''}</span>
        </button>

        <button
          onClick={() => (showComments ? setShowComments(false) : openComments())}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
        >
          <span className="text-base leading-none">💬</span>
          <span>{visibleComments.length > 0 ? `${visibleComments.length} 則留言` : '留言'}</span>
        </button>
      </div>

      {/* Comment section */}
      {showComments && (
        <div className="mt-3 flex flex-col gap-2">
          {commentReportDone && (
            <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-primary">
              ✅ 已收到你的留言檢舉，我們會盡快審核。
            </p>
          )}
          {topLevelComments.length > 0 && (
            <ul className="flex flex-col gap-2">
              {topLevelComments.map((c) => {
                const replies = repliesFor(c.id)
                const cLike = commentLikes[c.id] ?? { count: 0, liked: false }
                return (
                  <li key={c.id}>
                    {/* Top-level comment */}
                    <div className="flex items-start gap-2.5 rounded-2xl bg-muted px-3.5 py-2.5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tile-blue text-xs font-bold text-foreground">
                        {(c.anon_name ?? '匿')[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          {c.anon_name ?? '匿名使用者'}
                        </p>
                        <p className="mt-0.5 text-sm leading-relaxed text-foreground/80">{c.content}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-start pt-0.5">
                        <button
                          onClick={() => toggleCommentLike(c.id)}
                          disabled={!userId || likingComment === c.id}
                          className={`flex items-center gap-0.5 text-[11px] text-muted-foreground transition hover:text-foreground ${!userId ? 'cursor-default opacity-50' : ''}`}
                        >
                          <span className="text-sm leading-none">{cLike.liked ? '❤️' : '🤍'}</span>
                          {cLike.count > 0 && <span>{cLike.count}</span>}
                        </button>
                        {userId && (
                          <button
                            onClick={() => (replyingTo === c.id ? setReplyingTo(null) : startReplying(c.id))}
                            className="text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
                          >
                            回覆
                          </button>
                        )}
                        {userId && c.user_id !== userId && (
                          <div className="relative">
                            <button
                              onClick={() => setOpenCommentMenu(openCommentMenu === c.id ? null : c.id)}
                              aria-label="檢舉或封鎖留言"
                              className="px-0.5 text-[13px] font-bold leading-none text-muted-foreground transition hover:text-foreground"
                            >
                              ⋯
                            </button>
                            {openCommentMenu === c.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenCommentMenu(null)} />
                                <div className="absolute right-0 top-5 z-20 min-w-[160px] rounded-2xl border border-border bg-card p-2 shadow-soft">
                                  <button
                                    onClick={() => {
                                      setOpenCommentMenu(null)
                                      openReport({ type: 'comment', commentId: c.id, reportedUserId: c.user_id ?? null })
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-foreground transition hover:bg-muted"
                                  >
                                    🚩 檢舉留言
                                  </button>
                                  {c.user_id && (
                                    <button
                                      onClick={() => {
                                        setOpenCommentMenu(null)
                                        openBlock({ userId: c.user_id as string, label: c.anon_name ?? '這位使用者' })
                                      }}
                                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-red-500 transition hover:bg-muted"
                                    >
                                      🚫 封鎖此使用者
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Nested replies */}
                    {replies.length > 0 && (
                      <ul className="ml-8 mt-1 flex flex-col gap-1">
                        {replies.map((r) => {
                          const rLike = commentLikes[r.id] ?? { count: 0, liked: false }
                          return (
                            <li key={r.id} className="flex items-start gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tile-mint text-[10px] font-bold text-foreground">
                                {(r.anon_name ?? '匿')[0]}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold text-muted-foreground">
                                  {r.anon_name ?? '匿名使用者'}
                                </p>
                                <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{r.content}</p>
                              </div>
                              <button
                                onClick={() => toggleCommentLike(r.id)}
                                disabled={!userId || likingComment === r.id}
                                className={`flex shrink-0 items-center gap-0.5 self-start pt-0.5 text-[11px] text-muted-foreground transition hover:text-foreground ${!userId ? 'cursor-default opacity-50' : ''}`}
                              >
                                <span className="text-xs leading-none">{rLike.liked ? '❤️' : '🤍'}</span>
                                {rLike.count > 0 && <span>{rLike.count}</span>}
                              </button>
                              {userId && r.user_id !== userId && (
                                <div className="relative shrink-0 self-start pt-0.5">
                                  <button
                                    onClick={() => setOpenCommentMenu(openCommentMenu === r.id ? null : r.id)}
                                    aria-label="檢舉或封鎖留言"
                                    className="px-0.5 text-[13px] font-bold leading-none text-muted-foreground transition hover:text-foreground"
                                  >
                                    ⋯
                                  </button>
                                  {openCommentMenu === r.id && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setOpenCommentMenu(null)} />
                                      <div className="absolute right-0 top-5 z-20 min-w-[160px] rounded-2xl border border-border bg-card p-2 shadow-soft">
                                        <button
                                          onClick={() => {
                                            setOpenCommentMenu(null)
                                            openReport({ type: 'comment', commentId: r.id, reportedUserId: r.user_id ?? null })
                                          }}
                                          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-foreground transition hover:bg-muted"
                                        >
                                          🚩 檢舉留言
                                        </button>
                                        {r.user_id && (
                                          <button
                                            onClick={() => {
                                              setOpenCommentMenu(null)
                                              openBlock({ userId: r.user_id as string, label: r.anon_name ?? '這位使用者' })
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-red-500 transition hover:bg-muted"
                                          >
                                            🚫 封鎖此使用者
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {/* Reply input */}
                    {replyingTo === c.id && userId && (
                      <div className="ml-8 mt-1 flex items-end gap-2">
                        <textarea
                          ref={replyInputRef}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={handleReplyKeyDown}
                          placeholder={`回覆 ${c.anon_name ?? '匿名使用者'}… (Enter 送出)`}
                          rows={1}
                          className="flex-1 resize-none rounded-2xl border border-primary bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                        <button
                          onClick={submitReply}
                          disabled={!replyText.trim() || submitting}
                          className="shrink-0 rounded-2xl bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
                        >
                          送出
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {userId ? (
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="留下鼓勵的話… (Enter 送出)"
                rows={1}
                className="flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || submitting}
                className="shrink-0 rounded-2xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
              >
                送出
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">請先登入才能留言</p>
          )}
        </div>
      )}

      {sheets}
    </article>
  )
}
