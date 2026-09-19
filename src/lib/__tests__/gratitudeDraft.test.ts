import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../test/memoryStorage'
import {
  RESUME_WINDOW_MS,
  clearGratitudeDraft,
  gratitudeDraftKey,
  hasContent,
  loadGratitudeDraft,
  markAutoSaved,
  saveGratitudeDraft,
  takeAutoSavedNotice,
  type GratitudeDraft,
} from '../gratitudeDraft'

const draft: GratitudeDraft = {
  stage: 'SUMMARY',
  difficulty: 'advanced',
  items: { item_1: '今天的陽光', item_2: '', item_3: '' },
  entryDate: '2026-09-19',
  privacy: 'private',
}

describe('感恩日記草稿', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0))
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
  })

  it('匿名與登入使用者使用不同 key', () => {
    expect(gratitudeDraftKey(undefined)).toBe('gratitude-draft:anon')
    expect(gratitudeDraftKey('user-1')).toBe('gratitude-draft:user-1')
  })

  it('只有空白的內容視為沒有內容', () => {
    expect(hasContent({ item_1: ' ', item_2: '', item_3: '\n' })).toBe(false)
    expect(hasContent(draft.items)).toBe(true)
  })

  it('可以儲存並載入有效草稿', () => {
    saveGratitudeDraft('draft', draft)

    expect(loadGratitudeDraft('draft')).toMatchObject({ draft, isStale: false })
  })

  it('超過續寫時間的草稿會標記為 stale', () => {
    saveGratitudeDraft('draft', draft)
    vi.advanceTimersByTime(RESUME_WINDOW_MS + 1)

    expect(loadGratitudeDraft('draft')?.isStale).toBe(true)
  })

  it('儲存空草稿時會移除舊資料', () => {
    saveGratitudeDraft('draft', draft)
    saveGratitudeDraft('draft', {
      ...draft,
      items: { item_1: '', item_2: '', item_3: '' },
    })

    expect(loadGratitudeDraft('draft')).toBeNull()
  })

  it('損壞的 JSON 不會讓頁面拋錯', () => {
    localStorage.setItem('draft', '{broken')

    expect(loadGratitudeDraft('draft')).toBeNull()
  })

  it('自動存檔通知只會被讀取一次', () => {
    markAutoSaved('user-1', '2026-09-19')

    expect(takeAutoSavedNotice('user-1')).toBe('2026-09-19')
    expect(takeAutoSavedNotice('user-1')).toBeNull()
  })

  it('可以清除草稿', () => {
    saveGratitudeDraft('draft', draft)
    clearGratitudeDraft('draft')

    expect(loadGratitudeDraft('draft')).toBeNull()
  })
})
