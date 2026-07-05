import { DIMENSION_CONFIGS, DIMENSION_ORDER } from './types'
import { useLanguage } from '../../lib/i18n/context'

interface Props {
  onStart: () => void
  onSkip: () => void
}

const DOT_COLOR: Record<string, string> = {
  P: '#E26D5C',
  E: '#5C95FF',
  R: '#D6FFB7',
  M: '#292F56',
  A: '#FFDDB9',
}

export default function LandingPage({ onStart, onSkip }: Props) {
  const { t } = useLanguage()
  return (
    <div
      className="screen-enter"
      style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}
    >
      {/* PSY by PSY top logo */}
      <div style={{ padding: '20px 24px 6px', display: 'flex', justifyContent: 'center' }}>
        <img
          src="/assets/psy-by-psy-logo.png"
          alt="PSY by PSY"
          style={{ height: 64, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* InMind wordmark + subtitle */}
      <div style={{ padding: '4px 24px 0', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 54,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: -1.8,
            fontFamily: 'Inter, "Noto Sans TC", sans-serif',
            color: '#151515',
          }}
        >
          InMind
        </h1>
        <span
          style={{
            fontSize: 13,
            color: '#959595',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {t('心理健康的 InBody')}
        </span>
      </div>

      {/* Big headline */}
      <div style={{ padding: '26px 24px 0', textAlign: 'center' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 32,
            lineHeight: 1.25,
            fontWeight: 900,
            letterSpacing: -0.6,
            color: '#151515',
          }}
        >
          {t('你的')}<span style={{ color: '#E26D5C' }}>{t('幸福')}</span>{t('指數有多高？')}
        </h2>
        <p style={{ margin: '10px 0 0', fontSize: 18, lineHeight: 1.5, color: '#151515', fontWeight: 700 }}>
          {t('測出你的隱藏心理優勢')}
        </p>
      </div>

      {/* Brain-lifter mascot */}
      <div style={{ position: 'relative', padding: '18px 0 0', display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: '48%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 240,
            height: 240,
            borderRadius: '50%',
            background: 'radial-gradient(circle,#FFDDB944 0%,#FFDDB900 65%)',
            filter: 'blur(8px)',
            zIndex: 0,
          }}
        />
        <img
          src="/assets/brain-lifter.png"
          alt={t('心理健身房吉祥物：舉啞鈴的腦')}
          style={{
            width: 220,
            height: 220,
            objectFit: 'contain',
            position: 'relative',
            zIndex: 1,
            filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.12))',
          }}
        />
      </div>

      {/* CTA：開始測驗（實心）／跳過測驗（白底），並排讓兩個選擇同樣清楚可見 */}
      <div style={{ padding: '20px 24px 8px', display: 'flex', gap: 12 }}>
        <button
          onClick={onStart}
          style={{
            flex: 1.3,
            height: 64,
            borderRadius: 99,
            background: '#292F56',
            color: '#fff',
            border: 'none',
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 2,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow:
              '0 12px 28px -10px rgba(41,47,86,.55), inset 0 0 0 2px rgba(255,255,255,.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {t('開始測驗')}
        </button>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            height: 64,
            borderRadius: 99,
            background: '#fff',
            color: '#292F56',
            border: '2px solid #E4E4E4',
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 1,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {t('跳過測驗')}
        </button>
      </div>

      {/* PERMA list intro line */}
      <div style={{ padding: '14px 24px 6px', color: '#6A6A6A', fontSize: 13, fontWeight: 500 }}>
        {t('測量心理學上的')}{' '}
        <strong style={{ color: '#151515', fontWeight: 700 }}>PERMA</strong>{t(' 五大幸福指數：')}
      </div>

      {/* PERMA list */}
      <div style={{ padding: '4px 20px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {DIMENSION_ORDER.map((key, i) => {
            const cfg = DIMENSION_CONFIGS[key]
            const color = DOT_COLOR[key]
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#fff',
                  border: '1px solid #EFEFEF',
                  borderRadius: 14,
                  gridColumn: i === 4 ? '1 / -1' : 'auto',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Inter',
                    fontWeight: 800,
                    fontSize: 14,
                    color: key === 'R' || key === 'A' ? '#151515' : '#fff',
                  }}
                >
                  {key}
                </div>
                <div style={{ lineHeight: 1.1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#151515' }}>{t(cfg.label)}</div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#959595',
                      fontFamily: 'Inter',
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {cfg.sublabel}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div
        style={{
          padding: '4px 24px 28px',
          textAlign: 'center',
          fontSize: 11,
          color: '#959595',
          fontFamily: 'Inter',
          letterSpacing: 0.3,
        }}
      >
        {t('約 5 分鐘 · 5 題開放問答 · 全程匿名')}
      </div>
    </div>
  )
}
