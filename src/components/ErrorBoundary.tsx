import { Component, type ReactNode } from 'react'

const RELOAD_KEY = 'cw_chunk_reload'

/**
 * Shows a friendly screen instead of a blank page when rendering crashes. If a page's code
 * chunk failed to load (e.g. the server restarted or a new version was deployed), reload once.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message)
    let reloaded = false
    try {
      reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'
      if (chunk && !reloaded) sessionStorage.setItem(RELOAD_KEY, '1')
    } catch { /* storage blocked */ }
    if (chunk && !reloaded) window.location.reload()
  }

  componentDidMount() {
    setTimeout(() => {
      try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* ignore */ }
    }, 5000)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="bg-arena flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <span className="text-6xl">😵</span>
        <p className="font-display text-2xl">화면을 불러오지 못했어요</p>
        <p className="max-w-sm text-sm text-white/75">서버가 잠시 꺼져 있었거나 새 버전이 올라왔을 수 있어요. 다시 불러와 주세요.</p>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="gloss rounded-2xl bg-gradient-to-b from-accent-2 to-accent px-6 py-3 font-display text-ink">다시 불러오기</button>
          <button onClick={() => { window.location.href = '/' }} className="gloss rounded-2xl bg-gradient-to-b from-[#3a43a8] to-panel-2 px-6 py-3 font-display">로비로</button>
        </div>
        <p className="font-num text-xs text-white/40">{this.state.error.message.slice(0, 120)}</p>
      </div>
    )
  }
}
