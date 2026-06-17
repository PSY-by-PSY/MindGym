// 站內通知：只在「有人按讚使用者的貼文」或「有人留言」時產生。
// 資料直接由 likes / comments 表針對使用者本人的貼文即時推導，不需新增資料表。
// 已讀狀態以 localStorage 記錄「上次查看時間」，比對貼文互動時間決定未讀數。
import { supabase } from './supabase'

export type NotificationItem = {
  id: string
  type: 'like' | 'comment'
  entryId: string
  createdAt: string
  title: string
  snippet: string
}

function snippetOf(text: string | null | undefined, n = 18): string {
  if (!text) return ''
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

export async function fetchNotifications(userId: string): Promise<NotificationItem[]> {
  const { data: myEntries } = await supabase
    .from('gratitude_entries')
    .select('id, item_1')
    .eq('user_id', userId)

  const entries = myEntries ?? []
  if (entries.length === 0) return []

  const ids = entries.map((e) => e.id as string)
  const snippetById: Record<string, string> = {}
  for (const e of entries) snippetById[e.id as string] = snippetOf(e.item_1 as string | null, 14)

  const [likesRes, commentsRes] = await Promise.all([
    supabase
      .from('likes')
      .select('id, entry_id, created_at')
      .in('entry_id', ids)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('comments')
      .select('id, entry_id, created_at, content, anon_name, user_id')
      .in('entry_id', ids)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const items: NotificationItem[] = []

  for (const l of likesRes.data ?? []) {
    items.push({
      id: `like_${l.id}`,
      type: 'like',
      entryId: l.entry_id as string,
      createdAt: l.created_at as string,
      title: '有人為你的感恩貼文按讚 ❤️',
      snippet: snippetById[l.entry_id as string] ?? '',
    })
  }

  for (const c of commentsRes.data ?? []) {
    if (c.user_id === userId) continue // 不通知自己留言給自己
    items.push({
      id: `comment_${c.id}`,
      type: 'comment',
      entryId: c.entry_id as string,
      createdAt: c.created_at as string,
      title: `${c.anon_name ?? '有人'} 留言：${snippetOf(c.content as string, 20)}`,
      snippet: snippetById[c.entry_id as string] ?? '',
    })
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return items.slice(0, 30)
}

const EPOCH = '1970-01-01T00:00:00.000Z'

function lastSeenKey(userId: string): string {
  return `notif_last_seen_${userId}`
}

export function getLastSeen(userId: string): string {
  try {
    return localStorage.getItem(lastSeenKey(userId)) ?? EPOCH
  } catch {
    return EPOCH
  }
}

export function setLastSeen(userId: string, iso: string): void {
  try {
    localStorage.setItem(lastSeenKey(userId), iso)
  } catch {
    // 忽略寫入失敗
  }
}
