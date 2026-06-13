import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { type Privacy, PRIVACY_OPTIONS, privacyToFields, privacyFromFields } from '../lib/privacy'
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
}

type Comment = {
  id: string
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

const FEED_POOL_SIZE = 60
const PAGE_SIZE = 5

const ENTRY_COLS = 'id, user_id, anon_name, use_real_name, is_shared, item_1, item_2, item_3, entry_date, avatar, target_1, target_2, target_3'
// 帶 profiles(current_streak) 的查詢；若 streak 欄位不存在會退回純貼文查詢
const ENTRY_COLS_WITH_STREAK = `${ENTRY_COLS}, profiles(current_streak)`

// 查詢已分享貼文，盡力帶上 streak；若 join 失敗（例如 profiles 缺 current_streak 欄位）
// 則退回不帶 streak 的查詢，確保貼文一定能顯示。
async function selectSharedEntries(limit: number, excludeUserId?: string | null) {
  const build = (cols: string) => {
    let q = supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('is_shared', true)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (excludeUserId) q = q.neq('user_id', excludeUserId)
    return q
  }

  const withStreak = await build(ENTRY_COLS_WITH_STREAK)
  if (!withStreak.error) return (withStreak.data ?? []).map(normalizeEntry)

  const plain = await build(ENTRY_COLS)
  return (plain.data ?? []).map(normalizeEntry)
}

// 從近期已分享的貼文中取回（最新在前，最多 FEED_POOL_SIZE 篇）
async function fetchLatestEntries() {
  return selectSharedEntries(FEED_POOL_SIZE)
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

async function fetchMyEntries(userId: string): Promise<GratitudeEntry[]> {
  const build = (cols: string) =>
    supabase
      .from('gratitude_entries')
      .select(cols)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

  const withStreak = await build(ENTRY_COLS_WITH_STREAK)
  if (!withStreak.error) return (withStreak.data ?? []).map(normalizeEntry)

  const plain = await build(ENTRY_COLS)
  return (plain.data ?? []).map(normalizeEntry)
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
      .select('id, entry_id, anon_name, content, created_at, parent_id')
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
      .map(({ id, anon_name, content, created_at, parent_id }) => ({ id, anon_name, content, created_at, parent_id }))
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
  validateSearch: (search: Record<string, unknown>): { showEntry?: number } => {
    const raw = search.showEntry
    return raw === 1 || raw === '1' ? { showEntry: 1 } : {}
  },
  loader: async () => {
    const [entries, sessionRes] = await Promise.all([
      fetchLatestEntries(),
      supabase.auth.getSession(),
    ])

    const session = sessionRes.data.session
    const userId = session?.user.id ?? null

    const [myEntries, profileRes, modalEntry, userMap] = await Promise.all([
      userId ? fetchMyEntries(userId) : Promise.resolve([] as GratitudeEntry[]),
      userId
        ? supabase.from('profiles').select('name').eq('id', userId).single()
        : Promise.resolve({ data: null }),
      fetchModalEntry(userId),
      fetchUserGratitudeMap(userId),
    ])

    // Combine unique entries from both feeds for a single supporting data fetch
    const entrySet = new Map<string, GratitudeEntry>()
    entries.forEach((e) => entrySet.set(e.id, e))
    myEntries.forEach((e) => { if (!entrySet.has(e.id)) entrySet.set(e.id, e) })
    const allForSupport = [...entrySet.values()]

    const anonName = (profileRes.data?.name ?? null) as string | null

    if (allForSupport.length === 0) {
      return {
        entries,
        myEntries,
        likes: {} as Record<string, LikeInfo>,
        comments: {} as Record<string, Comment[]>,
        commentLikes: {} as Record<string, LikeInfo>,
        tags: {} as Record<string, GratitudeTargetTag[]>,
        anonName,
        userId,
        modalEntry: null as GratitudeEntry | null,
        userMap: {} as Record<string, number>,
      }
    }

    const supporting = await fetchSupporting(allForSupport, userId)

    return { entries, myEntries, ...supporting, anonName, userId, modalEntry, userMap }
  },
  pendingComponent: LoadingState,
  component: CommunityPage,
})

type FeedMode = 'recommended' | 'latest' | 'my'

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
    <header className="mb-6">
      <p className="font-handwriting text-2xl text-muted-foreground">大家今天感謝了什麼？</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
        健心房動態 PSY by PSY Feed
      </h1>
    </header>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <Header />
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-3xl bg-primary-soft" />
        ))}
      </div>
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
}: {
  entry: GratitudeEntry
  onClose: () => void
  entryId: string
  userId: string | null
  anonName: string | null
  onCommentAdded: (c: Comment) => void
}) {
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]
  const avatar = avatarFor(entry.anon_name, 0, entry.avatar)
  const [mode, setMode] = useState<'view' | 'comment'>('view')
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function enterCommentMode() {
    setMode('comment')
    setTimeout(() => textareaRef.current?.focus(), 80)
  }

  async function submitComment() {
    const content = commentText.trim()
    if (!content || !userId || submitting) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ entry_id: entryId, user_id: userId, anon_name: anonName, content })
      .select('id, anon_name, content, created_at')
      .single()
    if (!error && data) {
      onCommentAdded(data as Comment)
      onClose()
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm animate-fade-up rounded-3xl bg-card p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
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
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-foreground/80">{item}</span>
            </li>
          ))}
        </ul>

        {mode === 'view' ? (
          <>
            <p className="mt-5 text-center text-sm font-semibold text-foreground">
              請給對方一些回饋吧 💬
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-2xl border border-border py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
              >
                先看看
              </button>
              <button
                onClick={enterCommentMode}
                className="flex-1 rounded-2xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90"
              >
                去留言
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            <p className="text-center text-sm font-semibold text-foreground">留下你的鼓勵 💬</p>
            {userId ? (
              <>
                <textarea
                  ref={textareaRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="留下鼓勵的話… (Enter 送出)"
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode('view')}
                    className="flex-1 rounded-2xl border border-border py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
                  >
                    返回
                  </button>
                  <button
                    onClick={submitComment}
                    disabled={!commentText.trim() || submitting}
                    className="flex-1 rounded-2xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
                  >
                    送出
                  </button>
                </div>
              </>
            ) : (
              <p className="text-center text-xs text-muted-foreground">請先登入才能留言</p>
            )}
          </div>
        )}
      </div>
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
    { value: 'recommended', label: '推薦貼文' },
    { value: 'latest', label: '最新貼文' },
    ...(userId ? [{ value: 'my' as FeedMode, label: '我的貼文' }] : []),
  ]
  return (
    <div className="mb-4 flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full bg-muted p-1 shadow-soft">
        {options.map((opt) => {
          const active = mode === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition
                ${active
                  ? 'bg-foreground text-background shadow-soft'
                  : 'text-muted-foreground hover:text-foreground'
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

function CommunityPage() {
  const loaderData = Route.useLoaderData()
  const { showEntry } = Route.useSearch()
  const modalEntry = loaderData.modalEntry
  const { open, close } = useWelcomeModal(!!modalEntry, showEntry === 1)

  const [allEntries] = useState<GratitudeEntry[]>(loaderData.entries)
  const [myEntries] = useState<GratitudeEntry[]>(loaderData.myEntries ?? [])
  const [likes, setLikes] = useState<Record<string, LikeInfo>>(loaderData.likes)
  const [comments, setComments] = useState<Record<string, Comment[]>>(loaderData.comments)
  const [commentLikes, setCommentLikes] = useState<Record<string, LikeInfo>>(loaderData.commentLikes)
  const [tags] = useState<Record<string, GratitudeTargetTag[]>>(loaderData.tags)
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [myDisplayCount, setMyDisplayCount] = useState(PAGE_SIZE)
  const [mode, setMode] = useState<FeedMode>('recommended')
  const sentinelRef = useRef<HTMLDivElement>(null)
  const mySentinelRef = useRef<HTMLDivElement>(null)

  const userId = loaderData.userId ?? null
  const anonName = loaderData.anonName
  const userMap = loaderData.userMap ?? {}

  const mapTotal = useMemo(
    () => Object.values(userMap).reduce((s, v) => s + v, 0),
    [userMap],
  )

  const orderedEntries = useMemo(() => {
    if (mode === 'latest' || mapTotal === 0) return allEntries
    return allEntries
      .map((entry, i) => ({
        entry,
        i,
        score: relevanceScore(tags[entry.id] ?? [], userMap, mapTotal),
      }))
      .sort((a, b) => (b.score - a.score) || (a.i - b.i))
      .map((x) => x.entry)
  }, [mode, allEntries, tags, userMap, mapTotal])

  // 切換模式時回到頁首批次
  useEffect(() => {
    setDisplayCount(PAGE_SIZE)
    setMyDisplayCount(PAGE_SIZE)
  }, [mode])

  const hasMore = displayCount < orderedEntries.length
  const visibleEntries = orderedEntries.slice(0, displayCount)
  const myHasMore = myDisplayCount < myEntries.length
  const visibleMyEntries = myEntries.slice(0, myDisplayCount)

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0].isIntersecting) {
          setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, orderedEntries.length))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, orderedEntries.length])

  useEffect(() => {
    if (!mySentinelRef.current || !myHasMore) return
    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0].isIntersecting) {
          setMyDisplayCount((prev) => Math.min(prev + PAGE_SIZE, myEntries.length))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(mySentinelRef.current)
    return () => observer.disconnect()
  }, [myHasMore, myEntries.length])

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

  return (
    <>
      {open && modalEntry && (
        <DailyModal
          entry={modalEntry}
          onClose={close}
          entryId={modalEntry.id}
          userId={userId}
          anonName={anonName}
          onCommentAdded={(c) => handleCommentAdded(modalEntry.id, c)}
        />
      )}

      <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 pb-16 md:px-10">
        <Header />

        <div className="mb-6 rounded-3xl bg-card px-6 pb-6 pt-5 shadow-soft">
          <p className="mb-1 text-sm font-semibold text-foreground">感恩文字雲</p>
          <img src={wordCloudImg} alt="感恩文字雲" className="w-full rounded-2xl" />
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
                      isOwn={true}
                      onLikeChange={(info) => handleLikeChange(entry.id, info)}
                      onCommentAdded={(c) => handleCommentAdded(entry.id, c)}
                      onCommentLikeChange={handleCommentLikeChange}
                    />
                  ))}
                </div>
                <div ref={mySentinelRef} className="h-4" />
                {!myHasMore && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    已經看完所有打卡紀錄囉！
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {allEntries.length === 0 ? (
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
                      onLikeChange={(info) => handleLikeChange(entry.id, info)}
                      onCommentAdded={(c) => handleCommentAdded(entry.id, c)}
                      onCommentLikeChange={handleCommentLikeChange}
                    />
                  ))}
                </div>
                <div ref={sentinelRef} className="h-4" />
                {!hasMore && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    已經看完所有打卡紀錄囉！
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
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
  onLikeChange,
  onCommentAdded,
  onCommentLikeChange,
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
  onLikeChange: (info: LikeInfo) => void
  onCommentAdded: (c: Comment) => void
  onCommentLikeChange: (commentId: string, info: LikeInfo) => void
}) {
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]
  const [localAnonName, setLocalAnonName] = useState<string | null>(entry.anon_name)
  const [localPrivacy, setLocalPrivacy] = useState<Privacy>(
    privacyFromFields({ is_shared: entry.is_shared, use_real_name: entry.use_real_name }),
  )
  const [showMenu, setShowMenu] = useState(false)
  const avatar = avatarFor(localAnonName, index, entry.avatar)
  const [showComments, setShowComments] = useState(false)
  const [liking, setLiking] = useState(false)

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

  const topLevelComments = comments.filter((c) => !c.parent_id)
  const repliesFor = (parentId: string) => comments.filter((c) => c.parent_id === parentId)

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
      .select('id, anon_name, content, created_at, parent_id')
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
      .select('id, anon_name, content, created_at')
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

  return (
    <article className="rounded-3xl bg-card p-5 shadow-soft">
      {/* Header */}
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
            {localAnonName ?? '匿名使用者'}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{formatDate(entry.entry_date)}</p>
            {entry.current_streak != null && entry.current_streak > 0 && (
              <span className="text-xs font-semibold text-orange-500">🔥 連續 {entry.current_streak} 天</span>
            )}
            {isOwn && localPrivacy === 'private' && (
              <span className="text-xs font-semibold text-muted-foreground">🔒 僅限本人</span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-tile-mint px-3 py-1 text-[11px] font-bold text-foreground">
          感恩日記
        </span>
        {isOwn && (
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
      </div>

      {/* Items */}
      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-foreground/80">{item}</span>
          </li>
        ))}
      </ul>

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
      <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
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
          <span>{comments.length > 0 ? `${comments.length} 則留言` : '留言'}</span>
        </button>
      </div>

      {/* Comment section */}
      {showComments && (
        <div className="mt-3 flex flex-col gap-2">
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
    </article>
  )
}
