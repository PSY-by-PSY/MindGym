import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { useLanguage } from '../lib/i18n/context'
import { PrimaryCta } from '../components/PrimaryCta'
import { useStageBack } from '../lib/useStageBack'
import { supabase } from '../lib/supabase'
import { isoLocalDate } from '../lib/date'
import { computeUnifiedStreak } from '../lib/streak'
import { type Privacy, DEFAULT_PRIVACY, PRIVACY_OPTIONS, privacyToFields } from '../lib/privacy'
import { PermaGrowthCard } from '../components/PermaGrowthCard'
import { saveOrShareImage } from '../lib/shareImage'
import heartsBanner from '../assets/ui/hearts-banner.png'

const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function formatDate(date: Date, t: TFn): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y} / ${m} / ${d}（${t(WEEKDAY_LABELS[date.getDay()])}）`
}

// 匿名顯示名稱：故意不走 t()，理由同感恩日記（見 app.gratitude.tsx）——
// 這是寫入資料庫的資料值，不應隨畫面語言切換而改變。
const ANON_NAMES = ['溫暖的星火', '清晨的微風', '靜謐的月光', '晴天的微笑', '輕盈的雲朵']
function pickAnonName() {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]
}

export const Route = createFileRoute('/app/self-compassion')({
  component: SelfCompassionPage,
})

type Stage = 'INTRO' | 'CALM' | 'WRITING' | 'SHARE' | 'CELEBRATE'

interface SelfCompassionItems {
  awareness: string // 正念覺察：情緒與念頭
  situation: string // 共同人性：處境
  humanity: string // 共同人性：許多人都會感受到…
  toFriend: string // 自我善待：對朋友說的話
  toSelf: string // 自我善待：對自己說的話
}

const EMPTY_ITEMS: SelfCompassionItems = {
  awareness: '',
  situation: '',
  humanity: '',
  toFriend: '',
  toSelf: '',
}

// ─────────────────────────── 相似處境配對（暫用關鍵字比對的假資料，之後改為後端 AI 分類 + 真實使用者分享） ───────────────────────────

type ThemeKey = 'work' | 'relationship' | 'selfWorth' | 'health' | 'mistake' | 'general'

const THEME_KEYWORDS: Record<Exclude<ThemeKey, 'general'>, string[]> = {
  work: ['工作', '上司', '主管', '同事', '報告', '專案', '考核', '加班', '面試', '職場', '業績'],
  relationship: ['朋友', '伴侶', '男友', '女友', '另一半', '家人', '父母', '吵架', '關係', '分手', '孩子'],
  selfWorth: ['不夠好', '沒用', '否定', '自卑', '比較', '沒有價值', '不如別人'],
  health: ['身體', '生病', '健康', '睡不著', '疲累', '疲憊', '焦慮', '壓力大'],
  mistake: ['犯錯', '搞砸', '出錯', '失誤', '遲到', '忘記', '沒做好'],
}

function guessTheme(text: string): ThemeKey {
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS) as [Exclude<ThemeKey, 'general'>, string[]][]) {
    if (keywords.some((k) => text.includes(k))) return theme
  }
  return 'general'
}

function getMockShares(t: TFn): Record<ThemeKey, { anonName: string; text: string }[]> {
  return {
    work: [
      { anonName: t('溫暖的星火'), text: t('這陣子案子一直被打回票，我也一度覺得是不是自己能力不夠。後來才發現，同期幾乎每個人都經歷過這種卡關期。') },
      { anonName: t('清晨的微風'), text: t('主管的一句話讓我在意了好幾天，練習之後才慢慢明白，那份不安不是我的錯，只是暫時的。') },
    ],
    relationship: [
      { anonName: t('靜謐的月光'), text: t('跟最在乎的人吵架後，我一直在想是不是自己不夠好。後來發現，原來這種患得患失，很多人都有過。') },
      { anonName: t('晴天的微笑'), text: t('照顧家人的疲憊常常說不出口，直到看到別人寫下一樣的心情，才覺得自己沒有那麼孤單。') },
    ],
    selfWorth: [
      { anonName: t('輕盈的雲朵'), text: t('常常拿自己跟別人比較，覺得自己不夠好。練習之後發現，這種自我懷疑幾乎是每個人都會有的時刻。') },
      { anonName: t('溫暖的星火'), text: t('對自己太嚴格，是我很久以來的習慣。原來會這樣的人，不只有我一個。') },
    ],
    health: [
      { anonName: t('清晨的微風'), text: t('這陣子一直睡不好、也提不起勁，一開始覺得只有自己這麼糟。後來才知道，很多人也正在經歷類似的疲憊。') },
    ],
    mistake: [
      { anonName: t('靜謐的月光'), text: t('工作上出了一個不小的失誤，那幾天一直很自責。慢慢練習後，才發現犯錯這件事，其實誰都會遇到。') },
    ],
    general: [
      { anonName: t('晴天的微笑'), text: t('低潮的時候總覺得只有自己這樣，後來才發現，原來每個人都有屬於自己的難受時刻，只是說出來的人不多。') },
      { anonName: t('輕盈的雲朵'), text: t('願意寫下這些感受，本身就是一種勇氣。你並不孤單。') },
    ],
  }
}

type TFn = (text: string, vars?: Record<string, string | number>) => string

// ─────────────────────────── 概念介紹卡 ───────────────────────────

function getConceptCards(t: TFn) {
  return [
    {
      key: 'awareness' as const,
      title: t('看見情緒，而不被情緒淹沒'),
      tag: t('正念覺察'),
      tileClass: 'bg-tile-pink',
      body: t('邀請你如實看見自己正在經歷的情緒與念頭，但不會被它們淹沒。你可以只是留意、看見它們，不用急著評價自己，也不用急著解決。'),
    },
    {
      key: 'humanity' as const,
      title: t('看見自己並不孤單'),
      tag: t('共同人性'),
      tileClass: 'bg-tile-peach',
      body: t('遇到挫折時，我們很容易覺得「全世界只有我這麼糟」。但其實，失敗、痛苦、自我懷疑，是每個人都會經歷的事，也許內容不一樣，但每一個人在自己的生命經驗中都會經歷自己的低潮與難受，這是生而為人的共同經驗。'),
    },
    {
      key: 'kindness' as const,
      title: t('像對朋友一樣，溫柔對自己'),
      tag: t('自我善待'),
      tileClass: 'bg-tile-blue',
      body: t('面對朋友的低潮，我們常常能給出溫柔與理解；但對自己，卻經常比誰都嚴厲。邀請你把同樣的溫柔，也留一份給自己。'),
    },
  ]
}

// ─────────────────────────── PERMA 幸福力加分 ───────────────────────────

function getPermaBoosts(t: TFn) {
  return [
    {
      key: 'P',
      label: t('情緒力'),
      delta: 2,
      bar: 'bg-tile-pink',
      description: t('允許情緒存在、不加以批判，是很直接的正向情緒力練習。'),
    },
    {
      key: 'M',
      label: t('意義力'),
      delta: 4,
      bar: 'bg-tile-peach',
      description: t('練習善待自己，讓你更清楚自己看重的價值與意義。'),
    },
    {
      key: 'R',
      label: t('連結力'),
      delta: 2,
      bar: 'bg-tile-blue',
      description: t('共同人性的提醒，讓你重新感受到與他人的連結，不再感到孤單。'),
    },
  ] as const
}

// ─────────────────────────── 儲存＋分享到社群（沿用 gratitude_entries，practice_type='self_compassion'） ───────────────────────────

async function insertSelfCompassionEntry(
  items: SelfCompassionItems,
  privacy: Privacy,
  t: TFn,
): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const userId = session.user.id

  const fields = privacyToFields(privacy)
  const { data: profile } = await supabase.from('profiles').select('name, avatar').eq('id', userId).maybeSingle()
  const anonName = fields.use_real_name ? (profile?.name || pickAnonName()) : pickAnonName()

  // item_1~3 是既有 NOT NULL 欄位，用組好的完整句子當退回版內容（payload migration
  // 未跑時仍能正常顯示），結構化的原始五個欄位另外存進 payload。
  const item1 = t('此刻，我感覺到 {v}，但是我有勇氣不對它進行反應，我也不對它進行任何評價。', { v: items.awareness })
  const item2 = t('我知道，面對 {situation}，許多人都會感受到 {humanity}，而我並不是唯一有這種感受的人。', {
    situation: items.situation,
    humanity: items.humanity,
  })
  const item3 = t('我想對自己說：{v}', { v: items.toSelf })

  const baseRow: Record<string, unknown> = {
    user_id: userId,
    practice_type: 'self_compassion',
    item_1: item1,
    item_2: item2,
    item_3: item3,
    is_shared: fields.is_shared,
    use_real_name: fields.use_real_name,
    anon_name: anonName,
    avatar: profile?.avatar ?? null,
    entry_date: isoLocalDate(new Date()),
  }
  const payload = {
    v: 'self_compassion',
    awareness: items.awareness,
    situation: items.situation,
    humanity: items.humanity,
    to_friend: items.toFriend,
    to_self: items.toSelf,
  }

  const attempt = (row: Record<string, unknown>) =>
    supabase.from('gratitude_entries').insert(row).select('id').single()

  let { data, error } = await attempt({ ...baseRow, payload })
  // payload 欄位尚未建立（migration 未跑）→ 退回不含 payload 的寫入，確保練習照樣存得進去。
  if (error && (error.code === '42703' || /payload/i.test(error.message ?? ''))) {
    console.warn('[self-compassion save] payload 欄位不存在，本次以退回版寫入')
    ;({ data, error } = await attempt(baseRow))
  }
  if (error) {
    console.error('[self-compassion save]', error)
    throw error
  }

  const id = data?.id ?? null
  if (id && fields.is_shared) void supabase.rpc('schedule_bot_likes', { p_entry_id: id })

  // 連續紀錄：computeUnifiedStreak 只要 gratitude_entries 當天有任何一列就算，
  // 不篩 practice_type，所以這裡寫入後直接重算即可，不用額外碰 streak.ts。
  const streak = await computeUnifiedStreak(userId)
  await supabase.from('profiles').upsert({ id: userId, current_streak: streak }, { onConflict: 'id' })

  // 幸福經驗值真的累加進 profiles（見 supabase/perma_xp.sql 的 increment_perma_xp）。
  // 用原子的 RPC 累加，不是「先讀再寫」，避免連續操作/多裝置遺失更新。
  // migration 還沒跑時 RPC 會找不到函式，這裡吞掉錯誤、不影響主要的儲存流程。
  const boosts = getPermaBoosts(t)
  const deltaOf = (key: string) => boosts.find((b) => b.key === key)?.delta ?? 0
  const { error: xpError } = await supabase.rpc('increment_perma_xp', {
    p_user_id: userId,
    p_delta_p: deltaOf('P'),
    p_delta_e: deltaOf('E'),
    p_delta_r: deltaOf('R'),
    p_delta_m: deltaOf('M'),
    p_delta_a: deltaOf('A'),
  })
  if (xpError) console.warn('[self-compassion save] increment_perma_xp 尚未建立，本次未累加經驗值', xpError)

  return id
}

function SelfCompassionPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('INTRO')
  const [items, setItems] = useState<SelfCompassionItems>(EMPTY_ITEMS)
  const [privacy, setPrivacy] = useState<Privacy>(DEFAULT_PRIVACY)
  const [saving, setSaving] = useState(false)
  const savedEntryIdRef = useRef<string | null>(null)

  const stageBack = () => {
    if (stage === 'CALM') setStage('INTRO')
    else if (stage === 'WRITING') setStage('CALM')
    else if (stage === 'SHARE') setStage('WRITING')
    else if (stage === 'CELEBRATE') setStage('SHARE')
  }
  const triggerBack = useStageBack(stage, (s) => s === 'INTRO', stageBack)

  const onChangeItem = (key: keyof SelfCompassionItems, val: string) => {
    setItems((prev) => ({ ...prev, [key]: val }))
  }

  const allFilled = Object.values(items).every((v) => v.trim().length > 0)

  const matchedTheme = useMemo(() => guessTheme(`${items.situation} ${items.awareness}`), [items.situation, items.awareness])
  const matchedShares = useMemo(() => getMockShares(t)[matchedTheme], [t, matchedTheme])

  return (
    <div>
      {/* 音樂從 CALM 階段開始播放，掛在最外層（不隨階段切換而重新渲染／中斷）貫穿到完成頁。 */}
      {stage !== 'INTRO' && <MeditationToggle />}
      {stage === 'INTRO' && (
        <IntroStage
          onGoBack={() => navigate({ to: '/app/home' })}
          onStart={() => setStage('CALM')}
        />
      )}
      {stage === 'CALM' && (
        <CalmStage onBack={triggerBack} onNext={() => setStage('WRITING')} />
      )}
      {stage === 'WRITING' && (
        <WritingStage
          items={items}
          allFilled={allFilled}
          onChangeItem={onChangeItem}
          onBack={triggerBack}
          onNext={() => setStage('SHARE')}
        />
      )}
      {stage === 'SHARE' && (
        <ShareStage
          items={items}
          privacy={privacy}
          onChangePrivacy={setPrivacy}
          matchedShares={matchedShares}
          saving={saving}
          onBack={triggerBack}
          onNext={async () => {
            if (saving) return
            if (savedEntryIdRef.current) {
              setStage('CELEBRATE')
              return
            }
            setSaving(true)
            try {
              savedEntryIdRef.current = await insertSelfCompassionEntry(items, privacy, t)
              setStage('CELEBRATE')
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              alert(t('儲存失敗：{msg}\n\n請稍後再試一次。', { msg }))
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
      {stage === 'CELEBRATE' && (
        <CelebrateStage
          onNavigate={() => navigate({ to: '/app/community', search: { showEntry: 1 } })}
          onBack={triggerBack}
        />
      )}
    </div>
  )
}

// ─────────────────────────── INTRO ───────────────────────────

function IntroStage({ onGoBack, onStart }: { onGoBack: () => void; onStart: () => void }) {
  const { t } = useLanguage()
  const cards = getConceptCards(t)
  const permaBoosts = getPermaBoosts(t)

  return (
    <div className="animate-fade-up mx-auto max-w-md px-5 pt-4 pb-8">
      <div className="relative -mx-5 h-[170px] overflow-hidden">
        <img
          src={heartsBanner}
          alt=""
          className="pointer-events-none absolute bottom-[-10px] left-1/2 w-[430px] max-w-none -translate-x-1/2"
        />
        <button
          onClick={onGoBack}
          className="absolute left-1 top-1 z-[2] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
          aria-label={t('返回')}
        >
          <BackIcon />
        </button>
        <div className="absolute right-5 top-16 z-[2] flex h-[70px] w-[70px] flex-col items-center justify-center rounded-xl border-[3px] border-[#88B8CE] bg-cream">
          <span className="font-en text-[30px] font-bold leading-none text-foreground">5</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{t('分鐘')}</span>
        </div>
      </div>

      <h1 className="mt-3.5 text-[27px] font-black tracking-[0.03em] text-foreground">{t('自我慈悲練習')}</h1>

      <div className="mt-4 rounded-[20px] bg-gold p-4 text-[15px] leading-[1.75] text-[#5b4226]">
        {t('自我慈悲，是練習用對待好朋友的溫柔，來對待正在經歷困難的自己。這個練習包含三個核心元素，讓我們先花一點時間認識它們。')}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {cards.map((card) => (
          <div key={card.key} className="rounded-3xl bg-card p-4 shadow-soft">
            <span className={`inline-block rounded-full ${card.tileClass} px-3.5 py-1.5 text-sm font-extrabold tracking-[0.05em] text-foreground/80`}>
              {card.tag}
            </span>
            <p className="mt-2 text-base font-extrabold text-foreground">{card.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/75">{card.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {[t('依序完成三段小小書寫'), t('可以選擇要不要分享，也能選擇匿名或僅自己看得到'), t('看見與你相似處境的分享')].map((item) => (
          <div key={item} className="flex items-center gap-3 text-base text-foreground">
            <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-[#88B8CE]" />
            {item}
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {permaBoosts.map(({ key, label, delta }) => (
          <span key={key} className="mr-3">
            {label} <strong className="text-foreground">+{delta}</strong>
          </span>
        ))}
      </p>

      <div className="mt-5">
        <p className="mb-1.5 text-xs font-extrabold text-foreground">{t('相關文獻')}</p>
        <ul className="flex flex-col gap-1.5 pl-3 text-xs text-foreground/60">
          <li>
            Neff, K. D. (2023). Self-Compassion: Theory, Method, Research, and Intervention. <em>Annual Review of Psychology, 74</em>(1), 193–218. https://doi.org/10.1146/annurev-psych-032420-031047
          </li>
        </ul>
      </div>

      <button
        onClick={onStart}
        className="mt-7 flex h-[60px] w-full items-center justify-center gap-3 rounded-full bg-[#88B8CE] text-xl font-black tracking-[0.08em] text-cream shadow-[0_4px_10px_rgba(136,184,206,0.4)] transition active:scale-[0.98]"
      >
        {t('開始練習')}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9 8l4 4-4 4" />
        </svg>
      </button>
    </div>
  )
}

// ─────────────────────────── CALM（進入書寫前的靜心，播放冥想音樂） ───────────────────────────

const MEDITATION_VIDEO_ID = '1ZYbU82GVz4'

// 音源用的隱藏 iframe：瀏覽器一律阻擋「有聲音+自動播放」，只有靜音才能自動播放，
// 所以實際音訊預設靜音自動播放，圖示則預設呈現「播放中」的樣子，點擊後才真的
// 切換靜音、圖示也同步換成「已靜音」，讓使用者清楚看到自己按下去發生了什麼事
// （enablejsapi=1 讓我們能用 postMessage 送 mute/unMute 指令，不需要另外載入
// YouTube IFrame API script）。
// 掛在 SelfCompassionPage 最外層、用 fixed 定位浮在畫面右上角，不隨階段切換
// （CALM → WRITING → SHARE → CELEBRATE）重新掛載，音樂才能貫穿整個練習不中斷。
function MeditationToggle() {
  const { t } = useLanguage()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [muted, setMuted] = useState(false)

  const sendCommand = (func: 'mute' | 'unMute') => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*')
  }

  // iframe 一定要從靜音開始才能保證自動播放（瀏覽器政策），但一載入完成就立刻
  // 嘗試 unMute——緊接著使用者剛剛的點擊（開始練習／下一步），大多數瀏覽器會放行，
  // 效果上就是「預設直接有聲音播放」。若瀏覽器仍擋下（例如從未跟 YouTube 互動過的
  // 瀏覽器/無痕視窗），使用者點一次右上角這顆按鈕就能手動開聲音。
  const handleLoad = () => {
    sendCommand('unMute')
  }

  const toggleMute = () => {
    sendCommand(muted ? 'mute' : 'unMute')
    setMuted((m) => !m)
  }

  return (
    <>
      <button
        onClick={toggleMute}
        className="fixed right-5 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shadow-soft transition active:scale-90"
        aria-label={muted ? t('開啟音樂聲音') : t('關閉音樂聲音')}
      >
        {muted ? <MusicMutedIcon /> : <MusicNoteIcon />}
      </button>
      <iframe
        ref={iframeRef}
        onLoad={handleLoad}
        title={t('冥想音樂')}
        className="pointer-events-none fixed -left-[9999px] top-0"
        width="200"
        height="113"
        src={`https://www.youtube.com/embed/${MEDITATION_VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${MEDITATION_VIDEO_ID}&enablejsapi=1&controls=0`}
        allow="autoplay; encrypted-media"
      />
    </>
  )
}

function CalmStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { t } = useLanguage()

  return (
    <div className="animate-fade-up mx-auto max-w-md px-5 pt-4 pb-8">
      <button
        onClick={onBack}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
        aria-label={t('返回')}
      >
        <BackIcon />
      </button>

      <h1 className="mt-4 text-xl font-extrabold text-foreground">{t('在寫下這封信之前')}</h1>
      <div className="mt-4 flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-soft">
        <p className="text-sm leading-[1.9] text-foreground/85">
          {t('若您近期在某些時刻感覺到辛苦、難過、低落，歡迎你練習自我慈悲，一起溫柔地接住自己，練習與苦難、逆境共處。')}
        </p>
        <p className="text-sm leading-[1.9] text-foreground/85">
          {t('在開始書寫自我慈悲之前，先給自己一點安靜的時間，靜下心來，讓自己好好和這份感受待在一起。')}
        </p>
        <p className="text-sm leading-[1.9] text-foreground/85">
          {t('邀請你在腦海先想一件今天的事件。當時候發生了什麼？你怎麼了？')}
        </p>
        <p className="text-sm leading-[1.9] text-foreground/85">
          {t('不用急著評價它，也不用急著解決它，只是先陪著它。')}
        </p>
      </div>

      <div className="mt-6">
        <PrimaryCta onClick={onNext} variant="next">
          {t('下一步')}
        </PrimaryCta>
      </div>
    </div>
  )
}

function MusicNoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function MusicMutedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

// ─────────────────────────── WRITING ───────────────────────────

function TemplateBlank({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="mt-1.5 w-full resize-none rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
    />
  )
}

function WritingStage({
  items,
  allFilled,
  onChangeItem,
  onBack,
  onNext,
}: {
  items: SelfCompassionItems
  allFilled: boolean
  onChangeItem: (key: keyof SelfCompassionItems, val: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const { t } = useLanguage()

  return (
    <div className="animate-fade-up mx-auto max-w-md px-5 pt-4 pb-8">
      <button
        onClick={onBack}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
        aria-label={t('返回')}
      >
        <BackIcon />
      </button>

      <h1 className="mt-4 text-xl font-extrabold text-foreground">{t('自我慈悲書寫信')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('依序完成三段書寫，寫得越具體越好。')}</p>

      {/* 1. 正念覺察 */}
      <div className="mt-5 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary/70">{t('1・正念覺察')}</p>
        <p className="mt-1 text-sm font-bold text-foreground">{t('允許這個情緒存在，而不評價它')}</p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{t('此刻，我感覺到…（情緒與念頭）')}</p>
        <TemplateBlank
          placeholder={t('例如：焦慮、自我懷疑、有點想哭…')}
          value={items.awareness}
          onChange={(v) => onChangeItem('awareness', v)}
        />
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">
          {t('但是我有勇氣不對它進行反應，我也不對它進行任何評價。')}
        </p>
      </div>

      {/* 2. 共同人性 */}
      <div className="mt-4 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary/70">{t('2・共同人性')}</p>
        <p className="mt-1 text-sm font-bold text-foreground">{t('提醒自己並不孤單')}</p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{t('我知道，面對…（寫下你的處境）')}</p>
        <TemplateBlank
          placeholder={t('例如：這次面試沒有通過')}
          value={items.situation}
          onChange={(v) => onChangeItem('situation', v)}
        />
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{t('許多人都會感受到…')}</p>
        <TemplateBlank
          placeholder={t('例如：挫折、自我懷疑、不甘心')}
          value={items.humanity}
          onChange={(v) => onChangeItem('humanity', v)}
        />
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{t('而我並不是唯一有這種感受的人。')}</p>
      </div>

      {/* 3. 自我善待 */}
      <div className="mt-4 rounded-3xl bg-card p-4 shadow-soft">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-primary/70">{t('3・自我善待')}</p>
        <p className="mt-1 text-sm font-bold text-foreground">{t('給自己一句溫柔的話')}</p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">
          {t('如果此刻有一位朋友經歷一樣的事，我會對他說：')}
        </p>
        <TemplateBlank
          placeholder={t('例如：你已經很努力了，這不是你的錯')}
          value={items.toFriend}
          onChange={(v) => onChangeItem('toFriend', v)}
        />
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{t('現在，我也要對自己說：')}</p>
        <TemplateBlank
          placeholder={t('可以直接借用上面那句話，或換一個更貼近自己的說法')}
          value={items.toSelf}
          onChange={(v) => onChangeItem('toSelf', v)}
        />
      </div>

      <div className="mt-6">
        <PrimaryCta onClick={onNext} disabled={!allFilled} variant="done">
          {t('完成書寫')}
        </PrimaryCta>
      </div>
    </div>
  )
}

// ─────────────────────────── SHARE ───────────────────────────

function ShareStage({
  items,
  privacy,
  onChangePrivacy,
  matchedShares,
  saving,
  onBack,
  onNext,
}: {
  items: SelfCompassionItems
  privacy: Privacy
  onChangePrivacy: (v: Privacy) => void
  matchedShares: { anonName: string; text: string }[]
  saving: boolean
  onBack: () => void
  onNext: () => void
}) {
  const { t } = useLanguage()
  const shareCardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
  const date = useMemo(() => formatDate(new Date(), t), [t])

  const handleShare = async () => {
    if (!shareCardRef.current || sharing) return
    setSharing(true)
    try {
      const node = shareCardRef.current
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      // 動態載入 html-to-image，讓它從主包切出去（只有按下分享才載入）——同感恩日記做法。
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(node, {
        width: 1080,
        height: 1440,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FEFAF0',
        style: { position: 'static', left: '0', top: '0', transform: 'none', margin: '0' },
      })
      const filename = `self-compassion-${isoLocalDate(new Date())}.png`
      await saveOrShareImage(dataUrl, filename, t('我的自我慈悲書寫信'))
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[share image]', e)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-md px-5 pt-4 pb-8">
      <button
        onClick={onBack}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
        aria-label={t('返回')}
      >
        <BackIcon />
      </button>

      <h1 className="mt-4 text-xl font-extrabold text-foreground">{t('你的自我慈悲書寫信')}</h1>

      <div className="relative mt-4 overflow-hidden rounded-[28px] border border-gold-deep/25 bg-gradient-to-b from-gold/50 to-card p-5 shadow-soft">
        <QuoteMarkIcon />
        <p className="font-handwriting text-lg text-primary/70">{t('親愛的自己，')}</p>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <span className="inline-block rounded-full bg-tile-pink px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground/70">
              {t('正念覺察')}
            </span>
            <p className="mt-2 text-sm leading-[1.85]">
              <span className="text-[#A0A0A0]">{t('此刻，我感覺到 ')}</span>
              <span className="font-bold text-[#2C2C2C]">{items.awareness}</span>
              <span className="text-[#A0A0A0]">{t('，但是我有勇氣不對它進行反應，我也不對它進行任何評價。')}</span>
            </p>
          </div>
          <div>
            <span className="inline-block rounded-full bg-tile-peach px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground/70">
              {t('共同人性')}
            </span>
            <p className="mt-2 text-sm leading-[1.85]">
              <span className="text-[#A0A0A0]">{t('我知道，面對 ')}</span>
              <span className="font-bold text-[#2C2C2C]">{items.situation}</span>
              <span className="text-[#A0A0A0]">{t('，許多人都會感受到 ')}</span>
              <span className="font-bold text-[#2C2C2C]">{items.humanity}</span>
              <span className="text-[#A0A0A0]">{t('，而我並不是唯一有這種感受的人。')}</span>
            </p>
          </div>
          <div>
            <span className="inline-block rounded-full bg-tile-blue px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground/70">
              {t('自我善待')}
            </span>
            <p className="mt-2 text-sm leading-[1.85]">
              <span className="text-[#A0A0A0]">{t('如果此刻有一位朋友經歷一樣的事，我會對他說「')}</span>
              <span className="font-bold text-[#2C2C2C]">{items.toFriend}</span>
              <span className="text-[#A0A0A0]">{t('」。現在，我也要對自己說「')}</span>
              <span className="font-bold text-[#2C2C2C]">{items.toSelf}</span>
              <span className="text-[#A0A0A0]">{t('」。')}</span>
            </p>
          </div>
        </div>

        <p className="mt-5 text-right font-handwriting text-base text-primary/60">{t('— 此刻的你')}</p>
      </div>

      {/* 隱藏的分享圖（畫面外，跟感恩日記一樣的做法） */}
      <div
        ref={shareCardRef}
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0"
        style={{ width: '1080px', height: '1440px' }}
      >
        <SelfCompassionShareCard items={items} date={date} />
      </div>

      <div className="mt-5">
        <button
          onClick={handleShare}
          disabled={sharing}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-border bg-white text-sm font-extrabold tracking-[0.2em] text-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
        >
          {sharing ? t('正在生成圖片…') : isMobile ? t('分享圖片') : t('下載圖片')}
        </button>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.25em] text-[#8a6320]">{t('相似處境的分享')}</p>
        <div className="flex flex-col gap-3">
          {matchedShares.map((share, i) => (
            <div key={i} className="rounded-2xl bg-card p-3.5 shadow-soft">
              <p className="text-xs font-bold text-primary/70">{share.anonName}</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/80">{share.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-3xl bg-card px-5 py-4 shadow-soft">
        <p className="text-sm font-extrabold text-foreground">{t('隱私設定')}</p>
        <div className="mt-3 flex flex-col gap-2">
          {PRIVACY_OPTIONS.map((opt) => {
            const active = privacy === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChangePrivacy(opt.value)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  active ? 'border-primary bg-primary/10' : 'border-border bg-muted/40 hover:bg-muted'
                }`}
              >
                <span className="flex-1">
                  <span className={`block text-sm font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                    {t(opt.label)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {t(opt.hint)}
                  </span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? 'border-primary' : 'border-border'
                  }`}
                >
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <PrimaryCta onClick={onNext} disabled={saving} variant="done">
          {saving ? t('儲存中…') : t('完成')}
        </PrimaryCta>
      </div>
    </div>
  )
}

// 分享圖：inline style（非 tailwind class）——html-to-image 轉檔時比較穩定，
// 版面比照感恩日記的 ShareCard，深色文字（黑色）＝使用者手寫的內容，
// 灰色文字（#A0A0A0）＝固定的引導語模板，方便一眼看出具體寫了什麼。
function SelfCompassionShareCard({ items, date }: { items: SelfCompassionItems; date: string }) {
  const { t } = useLanguage()
  const guide = { color: '#A0A0A0' }
  const answer = { fontWeight: 800, color: '#2C2C2C' }

  return (
    <div
      style={{
        width: '1080px',
        height: '1440px',
        background: 'linear-gradient(180deg, #FEFAF0 0%, #f6efe0 55%, #efe2c9 100%)',
        padding: '76px 72px 56px',
        boxSizing: 'border-box',
        color: '#542916',
        display: 'flex',
        flexDirection: 'column',
        gap: 30,
      }}
    >
      <div>
        <div style={{ fontSize: 18, letterSpacing: 8, fontWeight: 800, color: '#88B8CE' }}>
          PSY BY PSY · SELF-COMPASSION
        </div>
        <div style={{ fontSize: 52, fontWeight: 900, marginTop: 16, lineHeight: 1.25, letterSpacing: 1 }}>
          {t('你的自我慈悲書寫信')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, opacity: 0.6, marginTop: 12 }}>{date}</div>
      </div>

      <div
        style={{
          background: '#ffffff',
          borderRadius: 40,
          padding: '48px 44px',
          display: 'flex',
          flexDirection: 'column',
          gap: 34,
          boxShadow: '0 8px 22px -10px rgba(40,24,12,0.18)',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, opacity: 0.5 }}>{t('親愛的自己，')}</div>

        <div>
          <div style={{ display: 'inline-block', background: '#f3d9df', borderRadius: 999, padding: '8px 22px', fontSize: 20, fontWeight: 800 }}>
            {t('正念覺察')}
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.7, marginTop: 16, whiteSpace: 'pre-wrap' }}>
            <span style={guide}>{t('此刻，我感覺到 ')}</span>
            <span style={answer}>{items.awareness}</span>
            <span style={guide}>{t('，但是我有勇氣不對它進行反應，我也不對它進行任何評價。')}</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'inline-block', background: '#f3e3c4', borderRadius: 999, padding: '8px 22px', fontSize: 20, fontWeight: 800 }}>
            {t('共同人性')}
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.7, marginTop: 16, whiteSpace: 'pre-wrap' }}>
            <span style={guide}>{t('我知道，面對 ')}</span>
            <span style={answer}>{items.situation}</span>
            <span style={guide}>{t('，許多人都會感受到 ')}</span>
            <span style={answer}>{items.humanity}</span>
            <span style={guide}>{t('，而我並不是唯一有這種感受的人。')}</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'inline-block', background: '#cfe2ee', borderRadius: 999, padding: '8px 22px', fontSize: 20, fontWeight: 800 }}>
            {t('自我善待')}
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.7, marginTop: 16, whiteSpace: 'pre-wrap' }}>
            <span style={guide}>{t('如果此刻有一位朋友經歷一樣的事，')}</span>
            <br />
            <span style={guide}>{t('我會對他說「')}</span>
            <span style={answer}>{items.toFriend}</span>
            <span style={guide}>{t('」。')}</span>
            <br />
            <span style={guide}>{t('現在，我也要對自己說「')}</span>
            <span style={answer}>{items.toSelf}</span>
            <span style={guide}>{t('」。')}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: 26, fontWeight: 700, opacity: 0.5, marginTop: 4 }}>
          {t('— 此刻的你')}
        </div>
      </div>

      {/* PSY by PSY logo */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <img
          src="/assets/logo-wordmark.png"
          alt="PSY by PSY"
          style={{ height: 44, objectFit: 'contain', opacity: 0.8 }}
          crossOrigin="anonymous"
        />
      </div>
    </div>
  )
}

function QuoteMarkIcon() {
  return (
    <svg
      className="pointer-events-none absolute -right-2 -top-3 h-20 w-20 text-gold-deep/20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M7.17 6C4.87 8 3.5 10.7 3.5 13.5c0 2.9 1.9 4.8 4.2 4.8 2.1 0 3.6-1.6 3.6-3.6 0-1.9-1.3-3.3-3-3.5.3-1.6 1.5-3.2 3.2-4.3L7.17 6Zm9 0c-2.3 2-3.67 4.7-3.67 7.5 0 2.9 1.9 4.8 4.2 4.8 2.1 0 3.6-1.6 3.6-3.6 0-1.9-1.3-3.3-3-3.5.3-1.6 1.5-3.2 3.2-4.3L16.17 6Z" />
    </svg>
  )
}

// ─────────────────────────── CELEBRATE ───────────────────────────

function CelebrateStage({
  onNavigate,
  onBack,
}: {
  onNavigate: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()

  return (
    <div className="animate-fade-up mx-auto flex max-w-md flex-col items-center px-5 pt-4 pb-8 text-center">
      <button
        onClick={onBack}
        className="mb-3 flex h-8 w-8 items-center justify-center self-start rounded-full border-2 border-[#542916] bg-[#FEFAF0] text-[#542916] shadow-soft transition active:scale-90"
        aria-label={t('返回')}
      >
        <BackIcon />
      </button>

      <div className="celebrate-pop mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-primary shadow-soft">
        <CelebrateCheckIcon />
      </div>
      <h2 className="mb-2 text-center text-2xl font-extrabold text-foreground">
        {t('自我慈悲練習完成！')}
      </h2>
      <p className="mb-6 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        {t('願你也記得，對自己溫柔，是一種可以持續練習的能力。')}
      </p>

      <PermaGrowthCard title={t('練習後 PERMA 加分')} items={getPermaBoosts(t)} />

      <div className="w-full">
        <PrimaryCta onClick={onNavigate} variant="done">
          {t('結束今天練習')}
        </PrimaryCta>
      </div>
    </div>
  )
}

function CelebrateCheckIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="#FEFAF0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}
