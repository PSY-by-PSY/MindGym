import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type GratitudeEntry = {
  id: string
  anon_name: string | null
  item_1: string | null
  item_2: string | null
  item_3: string | null
  entry_date: string | null
}

type Comment = {
  id: string
  anon_name: string | null
  content: string
  created_at: string
}

type LikeInfo = { count: number; liked: boolean }

type KeywordTag = {
  word: string
  category: '感受' | '事件' | '對象' | '其他'
}

const TAG_COLORS: Record<KeywordTag['category'], string> = {
  感受: 'bg-tile-pink text-foreground',
  事件: 'bg-tile-blue text-foreground',
  對象: 'bg-tile-peach text-foreground',
  其他: 'bg-muted text-muted-foreground',
}

async function fetchEntriesPage(offset: number) {
  return supabase
    .from('gratitude_entries')
    .select('id, anon_name, item_1, item_2, item_3, entry_date')
    .eq('is_shared', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + 3)
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

async function fetchKeywordTags(entries: GratitudeEntry[]): Promise<Record<string, KeywordTag[]>> {
  try {
    const res = await fetch(`${API_URL}/api/extract-keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map((e) => ({
          id: e.id,
          item_1: e.item_1,
          item_2: e.item_2,
          item_3: e.item_3,
        })),
      }),
    })
    if (!res.ok) return {}
    const data = await res.json()
    return (data.tags as Record<string, KeywordTag[]>) ?? {}
  } catch {
    return {}
  }
}

async function fetchSupporting(
  entries: GratitudeEntry[],
  userId: string | null,
): Promise<{
  likes: Record<string, LikeInfo>
  comments: Record<string, Comment[]>
  tags: Record<string, KeywordTag[]>
}> {
  const entryIds = entries.map((e) => e.id)

  const [likesRes, commentsRes, tags] = await Promise.all([
    supabase.from('likes').select('entry_id, user_id').in('entry_id', entryIds),
    supabase
      .from('comments')
      .select('id, entry_id, anon_name, content, created_at')
      .in('entry_id', entryIds)
      .order('created_at', { ascending: true }),
    fetchKeywordTags(entries),
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
      .map(({ id, anon_name, content, created_at }) => ({ id, anon_name, content, created_at }))
  }

  return { likes, comments, tags }
}

export const Route = createFileRoute('/app/community')({
  loader: async () => {
    const [entriesRes, sessionRes] = await Promise.all([
      fetchEntriesPage(0),
      supabase.auth.getSession(),
    ])

    const entries = (entriesRes.data ?? []) as GratitudeEntry[]
    const session = sessionRes.data.session
    const userId = session?.user.id ?? null

    if (entries.length === 0) {
      return {
        entries,
        likes: {} as Record<string, LikeInfo>,
        comments: {} as Record<string, Comment[]>,
        tags: {} as Record<string, KeywordTag[]>,
        anonName: null,
        userId,
      }
    }

    const [supporting, profileRes] = await Promise.all([
      fetchSupporting(entries, userId),
      userId
        ? supabase.from('profiles').select('name').eq('id', userId).single()
        : Promise.resolve({ data: null }),
    ])

    const anonName = (profileRes.data?.name ?? null) as string | null

    return { entries, ...supporting, anonName, userId }
  },
  pendingComponent: LoadingState,
  component: CommunityPage,
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${y} / ${m} / ${d}`
}

const AVATARS = [
  { emoji: '🌟', tile: 'bg-tile-peach' },
  { emoji: '🌿', tile: 'bg-tile-mint' },
  { emoji: '🌸', tile: 'bg-tile-pink' },
  { emoji: '☁️', tile: 'bg-tile-blue' },
]

function avatarFor(seed: string | null, index: number) {
  if (!seed) return AVATARS[index % AVATARS.length]
  const sum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATARS[sum % AVATARS.length]
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`h-5 w-5 text-muted-foreground transition-transform ${spinning ? 'animate-spin' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  )
}

function Header({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void
  refreshing: boolean
}) {
  return (
    <header className="mb-6 flex items-start justify-between">
      <div>
        <p className="font-handwriting text-2xl text-muted-foreground">健身房動態</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-foreground md:text-3xl">
          大家今天感謝了什麼？
        </h1>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="重整"
        className="mt-1 flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-muted disabled:opacity-50"
      >
        <RefreshIcon spinning={refreshing} />
      </button>
    </header>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 md:px-10">
      <Header onRefresh={() => {}} refreshing={false} />
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-3xl bg-primary-soft" />
        ))}
      </div>
    </div>
  )
}

const LS_KEY = 'community_last_visited'

function useDailyModal(hasEntries: boolean) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hasEntries) return
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LS_KEY) !== today) {
      localStorage.setItem(LS_KEY, today)
      setOpen(true)
    }
  }, [hasEntries])

  return { open, close: () => setOpen(false) }
}

function DailyModal({ entry, onClose }: { entry: GratitudeEntry; onClose: () => void }) {
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]
  const avatar = avatarFor(entry.anon_name, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
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
          <div className={`flex h-11 w-11 items-center justify-center rounded-full text-lg ${avatar.tile}`}>
            {avatar.emoji}
          </div>
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
            onClick={onClose}
            className="flex-1 rounded-2xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90"
          >
            去留言
          </button>
        </div>
      </div>
    </div>
  )
}

function CommunityPage() {
  const loaderData = Route.useLoaderData()
  const { open, close } = useDailyModal(loaderData.entries.length > 0)

  const [entries, setEntries] = useState<GratitudeEntry[]>(loaderData.entries)
  const [likes, setLikes] = useState<Record<string, LikeInfo>>(loaderData.likes)
  const [comments, setComments] = useState<Record<string, Comment[]>>(loaderData.comments)
  const [tags, setTags] = useState<Record<string, KeywordTag[]>>(loaderData.tags)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(0)

  const userId = loaderData.userId ?? null
  const anonName = loaderData.anonName

  async function refreshEntries() {
    if (refreshing) return
    setRefreshing(true)

    try {
      const nextPage = page + 1
      let res = await fetchEntriesPage(nextPage * 4)
      let newEntries = (res.data ?? []) as GratitudeEntry[]
      let newPage = nextPage

      if (newEntries.length === 0 && nextPage > 0) {
        res = await fetchEntriesPage(0)
        newEntries = (res.data ?? []) as GratitudeEntry[]
        newPage = 0
      }

      if (newEntries.length === 0) return

      const supporting = await fetchSupporting(newEntries, userId)

      setEntries(newEntries)
      setLikes(supporting.likes)
      setComments(supporting.comments)
      setTags(supporting.tags)
      setPage(newPage)
    } finally {
      setRefreshing(false)
    }
  }

  function handleLikeChange(entryId: string, newInfo: LikeInfo) {
    setLikes((prev) => ({ ...prev, [entryId]: newInfo }))
  }

  function handleCommentAdded(entryId: string, comment: Comment) {
    setComments((prev) => ({
      ...prev,
      [entryId]: [...(prev[entryId] ?? []), comment],
    }))
  }

  return (
    <>
      {open && <DailyModal entry={entries[0]} onClose={close} />}

      <div className="animate-fade-up mx-auto max-w-3xl px-6 pt-10 md:px-10">
        <Header onRefresh={refreshEntries} refreshing={refreshing} />

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-card py-16 text-muted-foreground shadow-soft">
            <span className="text-4xl">💫</span>
            <p className="mt-3 text-sm font-medium">還沒有人分享，快去寫感恩日記吧！</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((entry, i) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                index={i}
                likeInfo={likes[entry.id] ?? { count: 0, liked: false }}
                comments={comments[entry.id] ?? []}
                tags={tags[entry.id] ?? []}
                userId={userId}
                anonName={anonName}
                onLikeChange={(info) => handleLikeChange(entry.id, info)}
                onCommentAdded={(c) => handleCommentAdded(entry.id, c)}
              />
            ))}
          </div>
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
  tags,
  userId,
  anonName,
  onLikeChange,
  onCommentAdded,
}: {
  entry: GratitudeEntry
  index: number
  likeInfo: LikeInfo
  comments: Comment[]
  tags: KeywordTag[]
  userId: string | null
  anonName: string | null
  onLikeChange: (info: LikeInfo) => void
  onCommentAdded: (c: Comment) => void
}) {
  const items = [entry.item_1, entry.item_2, entry.item_3].filter(Boolean) as string[]
  const avatar = avatarFor(entry.anon_name, index)
  const [showComments, setShowComments] = useState(false)
  const [liking, setLiking] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
        <div className={`flex h-11 w-11 items-center justify-center rounded-full text-lg ${avatar.tile}`}>
          {avatar.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-foreground">
            {entry.anon_name ?? '匿名使用者'}
          </p>
          <p className="text-xs text-muted-foreground">{formatDate(entry.entry_date)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-tile-mint px-3 py-1 text-[11px] font-bold text-foreground">
          感恩日記
        </span>
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

      {/* Keyword tags */}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TAG_COLORS[tag.category]}`}
            >
              {tag.word}
            </span>
          ))}
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
          {comments.length > 0 && (
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 rounded-2xl bg-muted px-3.5 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tile-blue text-xs font-bold text-foreground">
                    {(c.anon_name ?? '匿')[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {c.anon_name ?? '匿名使用者'}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-foreground/80">{c.content}</p>
                  </div>
                </li>
              ))}
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
