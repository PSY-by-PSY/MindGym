import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Status = 'idle' | 'recording' | 'transcribing' | 'error'

interface Props {
  /** Called with recognised text; the caller decides how to append it. */
  onTranscript: (text: string) => void
  /** Dimension accent colour, used for the idle-state hover/active accent. */
  accent: string
}

const BAR_COUNT = 5
const IDLE_LEVELS = new Array(BAR_COUNT).fill(0.16)

// Voice input is for short questionnaire answers — cap each clip so the
// feature stays a dictation tool and can't be used to transcribe long audio.
const MAX_RECORDING_SEC = 120

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

// Whisper accepts webm/mp4/m4a; pick the first the browser can record.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

const SUPPORTED =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined'

function pickMimeType(): string {
  for (const c of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export default function VoiceInput({ onTranscript, accent }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [levels, setLevels] = useState<number[]>(IDLE_LEVELS)
  const [elapsed, setElapsed] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const meterRef = useRef<number | null>(null)
  const elapsedRef = useRef<number | null>(null)
  const recordStartRef = useRef<number>(0)
  const mimeRef = useRef<string>('')

  const stopTimers = useCallback(() => {
    if (meterRef.current != null) {
      clearInterval(meterRef.current)
      meterRef.current = null
    }
    if (elapsedRef.current != null) {
      clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
  }, [])

  const releaseAudio = useCallback(() => {
    stopTimers()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const ctx = audioCtxRef.current
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
  }, [stopTimers])

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => releaseAudio, [releaseAudio])

  function sampleWaveform() {
    const analyser = analyserRef.current
    if (!analyser) return
    const bins = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(bins)
    const per = Math.floor(bins.length / BAR_COUNT) || 1
    const next: number[] = []
    for (let b = 0; b < BAR_COUNT; b++) {
      let sum = 0
      for (let i = 0; i < per; i++) sum += bins[b * per + i]
      const avg = sum / per / 255
      next.push(Math.max(0.16, Math.min(1, avg * 1.7)))
    }
    setLevels(next)
  }

  async function uploadForTranscription(blob: Blob, mime: string) {
    const ext = mime.includes('mp4') ? 'mp4' : 'webm'
    const form = new FormData()
    form.append('audio', blob, `recording.${ext}`)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 60_000)
    try {
      // 與其他 API 呼叫一致：未設定 VITE_API_URL 時退回本機後端
      const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
      // 帶上登入 token（後端會驗證，避免匿名流量消耗 OpenAI 額度）
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${baseUrl}/api/transcribe`, {
        method: 'POST',
        body: form,
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const text: string = (data.text ?? '').trim()
      if (!text) {
        setErrorMsg('沒有辨識到內容，請靠近麥克風再試一次。')
        setStatus('error')
        return
      }
      onTranscript(text)
      setStatus('idle')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('辨識逾時，請檢查網路後重試。')
      } else {
        setErrorMsg(err instanceof Error ? err.message : '辨識失敗，請重試。')
      }
      setStatus('error')
    } finally {
      window.clearTimeout(timeout)
    }
  }

  function handleStop() {
    releaseAudio()
    const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
    chunksRef.current = []
    if (blob.size === 0) {
      setErrorMsg('沒有錄到聲音，請重試。')
      setStatus('error')
      return
    }
    setStatus('transcribing')
    void uploadForTranscription(blob, mimeRef.current || 'audio/webm')
  }

  async function startRecording() {
    setErrorMsg('')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setErrorMsg('麥克風尚未授權。請點擊網址列左側的圖示開啟麥克風權限後再試。')
      } else if (name === 'NotFoundError') {
        setErrorMsg('找不到麥克風裝置，請確認麥克風已連接。')
      } else {
        setErrorMsg('無法啟用麥克風，請重試。')
      }
      setStatus('error')
      return
    }
    streamRef.current = stream

    const mime = pickMimeType()
    mimeRef.current = mime
    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch {
      recorder = new MediaRecorder(stream)
    }
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = handleStop

    // Live amplitude meter (best-effort — recording still works without it).
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      analyserRef.current = analyser
      meterRef.current = window.setInterval(sampleWaveform, 80)
    } catch {
      /* meter is optional */
    }

    recorder.start() // full recording, single upload on stop

    recordStartRef.current = Date.now()
    setElapsed(0)
    elapsedRef.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - recordStartRef.current) / 1000)
      setElapsed(sec)
      if (sec >= MAX_RECORDING_SEC) stopRecording() // auto-stop at the cap
    }, 250)

    setStatus('recording')
  }

  function stopRecording() {
    stopTimers()
    setLevels(IDLE_LEVELS)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop() // fires onstop -> handleStop
    } else {
      handleStop()
    }
  }

  function handleClick() {
    if (status === 'idle') void startRecording()
    else if (status === 'recording') stopRecording()
    else if (status === 'error') {
      setErrorMsg('')
      setStatus('idle')
    }
  }

  if (!SUPPORTED) return null

  const recording = status === 'recording'
  const transcribing = status === 'transcribing'
  const error = status === 'error'

  const label =
    recording ? '錄音中…' : transcribing ? '辨識中…' : error ? '辨識失敗，請重試' : '語音輸入'
  const ariaLabel =
    recording ? '停止錄音' : transcribing ? '辨識中，請稍候' : error ? '重試語音輸入' : '開始語音輸入'

  const danger = recording || error
  const borderColor = danger ? '#E26D5C' : '#D8D8D8'
  const bg = danger ? '#FDECEA' : '#fff'
  const fg = danger ? '#C0392B' : transcribing ? '#959595' : '#5A5A5A'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={transcribing}
        aria-label={ariaLabel}
        aria-pressed={recording}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 36,
          padding: '7px 14px',
          borderRadius: 99,
          border: `1.5px solid ${borderColor}`,
          background: bg,
          color: fg,
          fontFamily: 'inherit',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: transcribing ? 'default' : 'pointer',
          transition: 'border-color .25s, background .25s, color .25s',
        }}
      >
        {/* ── leading icon ── */}
        {recording ? (
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#E26D5C',
              animation: 'voicePulse 1.2s ease-in-out infinite',
            }}
          />
        ) : transcribing ? (
          <span
            aria-hidden="true"
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              border: '2px solid #E0E0E0',
              borderTopColor: '#959595',
              animation: 'voiceSpin 0.7s linear infinite',
            }}
          />
        ) : error ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="6" fill="none" stroke="#C0392B" strokeWidth="1.4" />
            <path
              d="M7 3.6 V7.6 M7 9.4 V10.1"
              stroke="#C0392B"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="14" height="15" viewBox="0 0 14 15" fill="none" aria-hidden="true">
            <rect x="4.5" y="1" width="5" height="8.5" rx="2.5" fill={accent} />
            <path
              d="M2 7.2 a5 5 0 0 0 10 0 M7 12.2 V14 M4.5 14 H9.5"
              stroke="#5A5A5A"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}

        <span aria-live="polite">{label}</span>

        {/* ── live waveform while recording ── */}
        {recording && (
          <span
            aria-hidden="true"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, height: 18, marginLeft: 2 }}
          >
            {levels.map((lvl, i) => (
              <span
                key={i}
                style={{
                  width: 3,
                  height: `${Math.round(lvl * 18)}px`,
                  minHeight: 3,
                  borderRadius: 2,
                  background: '#E26D5C',
                  transition: 'height .08s linear',
                }}
              />
            ))}
          </span>
        )}

        {recording && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#C0392B',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTime(elapsed)} / {formatTime(MAX_RECORDING_SEC)}
          </span>
        )}
      </button>

      {error && errorMsg && (
        <span style={{ fontSize: 11, lineHeight: 1.5, color: '#C0392B', paddingLeft: 2 }}>
          {errorMsg}
        </span>
      )}
    </div>
  )
}
