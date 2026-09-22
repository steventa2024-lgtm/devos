import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}

/** Form-row wrapper: label on top, control below, optional hint or error. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="flex items-center gap-1 text-2xs font-medium uppercase tracking-widest text-ink-400">
        {label}
        {required && <span className="text-rose">*</span>}
      </label>
      {children}
      {error ? (
        <span className="text-2xs text-rose">{error}</span>
      ) : hint ? (
        <span className="text-2xs text-ink-500">{hint}</span>
      ) : null}
    </div>
  )
}

/** Native select styled to match Input. */
export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-white/[0.08] bg-black/25 px-3 pr-8',
          'text-sm text-ink-100',
          'transition-all duration-200 ease-swift',
          'focus:border-accent/50 focus:bg-black/40 focus:outline-none focus:shadow-glow',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-500"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/** Native textarea styled to match Input. */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'min-h-[100px] w-full resize-y rounded-lg border border-white/[0.08] bg-black/25 p-3',
        'text-sm text-ink-100 placeholder:text-ink-500',
        'font-mono leading-relaxed',
        'transition-all duration-200 ease-swift',
        'focus:border-accent/50 focus:bg-black/40 focus:outline-none focus:shadow-glow',
        className,
      )}
      {...rest}
    />
  )
}
