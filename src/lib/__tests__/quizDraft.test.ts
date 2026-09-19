import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../../test/memoryStorage'
import { clearQuizDraft, loadQuizDraft, quizDraftKey, saveQuizDraft } from '../quizDraft'

const answers = {
  P: '正向情緒答案',
  E: '',
  R: '',
  M: '',
  A: '',
}

describe('InMind 測驗草稿', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 10, 0, 0))
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
  })

  it('匿名與登入使用者使用不同 key', () => {
    expect(quizDraftKey(undefined)).toBe('inmind-draft:anon')
    expect(quizDraftKey('user-1')).toBe('inmind-draft:user-1')
  })

  it('可以儲存並載入有效草稿', () => {
    saveQuizDraft('draft', { answers, step: 2 })

    expect(loadQuizDraft('draft')).toEqual({ answers, step: 2 })
  })

  it('步驟會限制在 0 到 4', () => {
    saveQuizDraft('draft', { answers, step: 99 })

    expect(loadQuizDraft('draft')?.step).toBe(4)
  })

  it('全空答案不恢復', () => {
    saveQuizDraft('draft', {
      answers: { P: '', E: '', R: '', M: '', A: '' },
      step: 1,
    })

    expect(loadQuizDraft('draft')).toBeNull()
  })

  it('超過七天的草稿會刪除', () => {
    saveQuizDraft('draft', { answers, step: 1 })
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1)

    expect(loadQuizDraft('draft')).toBeNull()
    expect(localStorage.getItem('draft')).toBeNull()
  })

  it('損壞的 JSON 不會讓頁面拋錯', () => {
    localStorage.setItem('draft', '{broken')

    expect(loadQuizDraft('draft')).toBeNull()
  })

  it('可以清除草稿', () => {
    saveQuizDraft('draft', { answers, step: 1 })
    clearQuizDraft('draft')

    expect(loadQuizDraft('draft')).toBeNull()
  })
})
