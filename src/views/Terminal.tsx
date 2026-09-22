import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Terminal as TermIcon, Info } from 'lucide-react'
import { Panel } from '@/components/ui'
import { ipc, isDesktop } from '@/lib/ipc'
import { listen } from '@tauri-apps/api/event'

const SESSION_ID = 'main'

export default function TerminalView() {
  const [searchParams] = useSearchParams()
  const cwdParam = searchParams.get('cwd') ?? undefined
  const nameParam = searchParams.get('name')

  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!isDesktop || !hostRef.current) return
    const host = hostRef.current

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      theme: {
        background: '#00000000',
        foreground: '#cfd7ea',
        cursor: '#5b8cff',
        cursorAccent: '#0b0e16',
        selectionBackground: 'rgba(91,140,255,0.28)',
        black: '#0b0e16', red: '#f2607a', green: '#48d6a5', yellow: '#f0b45f',
        blue: '#5b8cff', magenta: '#a479ff', cyan: '#62c7e8', white: '#cfd7ea',
        brightBlack: '#5b6478', brightRed: '#ff7b93', brightGreen: '#63e6b8',
        brightYellow: '#ffc978', brightBlue: '#7ea6ff', brightMagenta: '#b899ff',
        brightCyan: '#89d8f1', brightWhite: '#eef2fb',
      },
      allowTransparency: true,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    // Defer initial fit one frame so container has layout.
    requestAnimationFrame(() => {
      try { fit.fit() } catch { /* noop */ }
      ipc
        .ptyOpen(SESSION_ID, term.cols, term.rows, cwdParam)
        .catch((e) => term.writeln(`\x1b[31mFailed to open shell: ${e}\x1b[0m`))
    })

    const onData = term.onData((data) => {
      ipc.ptyWrite(SESSION_ID, data).catch(() => {})
    })

    const unlisten: Array<() => void> = []
    listen<string>(`pty://data/${SESSION_ID}`, (evt) => {
      term.write(evt.payload)
    }).then((u) => unlisten.push(u))
    listen(`pty://exit/${SESSION_ID}`, () => {
      term.writeln('\r\n\x1b[33m[process exited]\x1b[0m')
    }).then((u) => unlisten.push(u))

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        ipc.ptyResize(SESSION_ID, term.cols, term.rows).catch(() => {})
      } catch { /* noop */ }
    })
    ro.observe(host)

    const onKey = (e: KeyboardEvent) => {
      // Let Cmd/Ctrl+C copy when there is a selection; otherwise send through.
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
          e.preventDefault()
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          ipc.ptyWrite(SESSION_ID, text).catch(() => {})
        })
        e.preventDefault()
      }
    }
    host.addEventListener('keydown', onKey)

    return () => {
      host.removeEventListener('keydown', onKey)
      ro.disconnect()
      onData.dispose()
      unlisten.forEach((u) => u())
      ipc.ptyClose(SESSION_ID).catch(() => {})
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [cwdParam])

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Terminal</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-400">
            {isDesktop ? 'Native shell · full PTY access' : 'Browser preview'}
            {nameParam && (
              <>
                <span className="text-ink-600">·</span>
                <span className="font-mono text-ink-300">{nameParam}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {isDesktop ? (
        <div className="term-shell flex-1">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      ) : (
        <Panel className="flex flex-1 flex-col items-center justify-center text-center">
          <TermIcon className="mb-3 h-8 w-8 text-ink-500" />
          <div className="text-sm text-ink-200">The terminal is only available in the desktop build.</div>
          <div className="mt-2 flex items-center gap-2 text-2xs text-ink-500">
            <Info className="h-3.5 w-3.5" />
            <span>Run <code className="font-mono text-ink-300">pnpm tauri:dev</code> to launch DevOS natively.</span>
          </div>
        </Panel>
      )}
    </div>
  )
}
