type Variant = 'next' | 'done' | 'plain'

interface PrimaryCtaProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: Variant
  type?: 'button' | 'submit'
}

export function PrimaryCta({
  children,
  onClick,
  disabled = false,
  variant = 'next',
  type = 'button',
}: PrimaryCtaProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-16 w-full items-center justify-center gap-3 rounded-full text-base font-extrabold tracking-[0.2em] transition active:scale-[0.98] ${
        disabled
          ? 'cursor-not-allowed bg-primary-soft text-foreground/40'
          : 'bg-gradient-primary text-primary-foreground shadow-soft'
      }`}
    >
      <span>{children}</span>
      {variant === 'next' && <ArrowRightIcon />}
      {variant === 'done' && <CheckIcon />}
    </button>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
