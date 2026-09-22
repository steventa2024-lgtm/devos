import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './index'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  /** Footer area, typically buttons. */
  footer?: ReactNode
  /** Dialog body width class. Defaults to a medium width. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** If true, clicking the backdrop does not close the dialog. */
  persistent?: boolean
  children: ReactNode
}

const widths = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  persistent = false,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape to close + focus the first focusable element on open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)

    // Defer focus one frame so the modal is mounted.
    const id = requestAnimationFrame(() => {
      const root = panelRef.current
      if (!root) return
      const target = root.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-modal-close])',
      )
      target?.focus()
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(id)
    }
  }, [open, onClose])

  // Prevent body scroll while open.
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="cmdk-overlay fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (persistent) return
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'cmdk-panel flex w-full flex-col overflow-hidden rounded-2xl animate-slide-down',
          widths[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-base font-semibold text-ink-100">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-xs text-ink-400">{description}</p>
              )}
            </div>
            <IconButton label="Close" data-modal-close onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto scroll-thin px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-black/20 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
