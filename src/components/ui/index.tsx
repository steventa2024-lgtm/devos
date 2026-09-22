import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { X } from 'lucide-react'

/* ----------------------------------------------------------------- Button */
type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leading?: ReactNode
  trailing?: ReactNode
}

export function Button({
  variant = 'subtle', size = 'md', leading, trailing, className, children, ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
    'transition-all duration-200 ease-swift select-none ' +
    'disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap'
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-9 px-3.5 text-sm',
    lg: 'h-11 px-5 text-sm',
  }
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-accent/90 text-white hover:bg-accent shadow-[0_8px_24px_-10px_rgba(91,140,255,0.8)] border border-accent/40',
    subtle:
      'bg-white/[0.04] text-ink-100 border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14]',
    ghost:
      'bg-transparent text-ink-200 hover:bg-white/[0.06] hover:text-white border border-transparent',
    danger:
      'bg-rose/15 text-rose border border-rose/30 hover:bg-rose/25',
  }
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {leading}
      {children}
      {trailing}
    </button>
  )
}

/* ------------------------------------------------------------- IconButton */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tone?: 'default' | 'danger'
}

export function IconButton({ label, tone = 'default', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent',
        'text-ink-300 hover:text-ink-100 hover:bg-white/[0.06] hover:border-white/[0.08]',
        'transition-all duration-150 ease-swift',
        tone === 'danger' && 'hover:text-rose hover:bg-rose/10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ Input */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode
  trailing?: ReactNode
  wrapClassName?: string
}

export function Input({ leading, trailing, className, wrapClassName, ...rest }: InputProps) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/25 px-3',
        'transition-all duration-200 ease-swift',
        'focus-within:border-accent/50 focus-within:bg-black/40 focus-within:shadow-glow',
        wrapClassName,
      )}
    >
      {leading && <span className="text-ink-400">{leading}</span>}
      <input
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 outline-none',
          className,
        )}
        {...rest}
      />
      {trailing && <span className="text-ink-400">{trailing}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ Panel */
export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  accent?: boolean
  padded?: boolean
}

export function Panel({
  hover = true, accent = false, padded = true, className, children, ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        'glass',
        hover && 'glass-hover',
        accent && 'glass-accent',
        padded && 'p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ Badge */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'accent' | 'mint' | 'amber' | 'rose' | 'violet'
  children: ReactNode
  className?: string
}) {
  const tones = {
    neutral: 'bg-white/[0.05] text-ink-300 border-white/[0.08]',
    accent: 'bg-accent/12 text-accent-soft border-accent/25',
    mint: 'bg-mint/12 text-mint border-mint/25',
    amber: 'bg-amber/12 text-amber border-amber/25',
    rose: 'bg-rose/12 text-rose border-rose/25',
    violet: 'bg-violet/12 text-violet border-violet/25',
  } as const
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------- StatusDot */
export function StatusDot({
  tone = 'mint',
  pulse = false,
  className,
}: {
  tone?: 'mint' | 'amber' | 'rose' | 'accent' | 'neutral'
  pulse?: boolean
  className?: string
}) {
  const colors = {
    mint: '#48d6a5',
    amber: '#f0b45f',
    rose: '#f2607a',
    accent: '#5b8cff',
    neutral: '#7d879e',
  } as const
  return (
    <span
      className={cn('status-dot', pulse && 'status-dot--pulse', className)}
      style={{ ['--dot-color' as any]: colors[tone] }}
    />
  )
}

/* ---------------------------------------------------------------- Skeleton */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/* --------------------------------------------------------------- Progress */
export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'mint' | 'amber' | 'rose' }) {
  const tones = {
    accent: 'from-accent/70 to-accent-soft',
    mint: 'from-mint/70 to-mint',
    amber: 'from-amber/70 to-amber',
    rose: 'from-rose/70 to-rose',
  } as const
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
      <div
        className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ Toasts */
export function Toaster() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-50 flex w-[360px] flex-col gap-2">
      {toasts.map((t) => {
        const toneMap: Record<string, string> = {
          info: 'border-accent/30',
          success: 'border-mint/30',
          warn: 'border-amber/30',
          error: 'border-rose/30',
        }
        const dotMap: Record<string, 'accent' | 'mint' | 'amber' | 'rose'> = {
          info: 'accent',
          success: 'mint',
          warn: 'amber',
          error: 'rose',
        }
        return (
          <div
            key={t.id}
            className={cn(
              'glass pointer-events-auto animate-slide-up rounded-xl border-l-2 p-3.5',
              toneMap[t.tone],
            )}
          >
            <div className="flex items-start gap-3">
              <StatusDot tone={dotMap[t.tone]} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-100">{t.title}</div>
                {t.description && (
                  <div className="mt-0.5 text-xs text-ink-400">{t.description}</div>
                )}
              </div>
              <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
        )
      })}
    </div>
  )
}
