import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MAX_POINTS_TOTAL, PALETTE, PAPERS, TOOLS, WEAPON_INFO, WEAPON_TYPES, type ToolInfo, type WeaponType } from '@shared/constants'
import { checkWeaponName } from '@shared/text'
import type { Stroke } from '@shared/weapon'
import { Button, Confirm, cx, IconButton, Loading, Modal, Pill } from '@/components/ui'
import { DrawingCanvas, type View } from '@/draw/DrawingCanvas'
import { renderPng } from '@/draw/render'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import ConvertStep from './ConvertStep'

interface Owned {
  items: { itemId: string; equipped: boolean }[]
  papers: { id: string; name: string; unlockLevel: number; unlocked: boolean }[]
  level: number
}
interface DraftSummary { id: number; name: string; type: string | null; paperId: string; previewPng: string; updatedAt: string }

const UNDO_WINDOW_MS = 10_000
const AUTOSAVE_KEY = (uid: number) => `cw_workshop_${uid}`

type TypeChoice = WeaponType | 'auto'

export default function WorkshopPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const user = useAuth((s) => s.user)!
  const owned = useQuery({ queryKey: ['owned'], queryFn: () => api.get<Owned>('/weapons/owned') })

  const [step, setStep] = useState<'draw' | 'convert'>('draw')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redo, setRedo] = useState<Stroke[]>([])
  const drawnAt = useRef<number[]>([])
  const [undoSpent, setUndoSpent] = useState(false)
  const [toolId, setToolId] = useState('ballpoint')
  const [color, setColor] = useState('#111111')
  const [widths, setWidths] = useState<Record<string, number>>(() => Object.fromEntries(TOOLS.map((t) => [t.id, t.defaultWidth])))
  const [paperId, setPaperId] = useState('white')
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<TypeChoice>('auto')
  const [draftId, setDraftId] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [restore, setRestore] = useState<{ strokes: Stroke[]; paperId: string; name: string } | null>(null)
  const [lockedTool, setLockedTool] = useState<ToolInfo | null>(null)

  const ownedIds = useMemo(() => new Set(owned.data?.items.map((i) => i.itemId) ?? ['tool_ballpoint']), [owned.data])
  const hasEraser = ownedIds.has('tool_eraser')
  const tool = TOOLS.find((t) => t.id === toolId)!
  const width = widths[toolId]
  const totalPoints = strokes.reduce((s, st) => s + st.p.length / 3, 0)

  // Restore an unsaved drawing after refresh, or load a draft from ?draft=
  useEffect(() => {
    const d = params.get('draft')
    if (d) {
      void loadDraft(Number(d))
      return
    }
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY(user.id))
      if (raw) {
        const saved = JSON.parse(raw) as { strokes: Stroke[]; paperId: string; name: string }
        if (saved.strokes?.length) setRestore(saved)
      }
    } catch { /* ignore broken autosave */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (strokes.length) localStorage.setItem(AUTOSAVE_KEY(user.id), JSON.stringify({ strokes, paperId, name }))
        else localStorage.removeItem(AUTOSAVE_KEY(user.id))
      } catch { /* storage full or blocked */ }
    }, 500)
    return () => clearTimeout(t)
  }, [strokes, paperId, name, user.id])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (strokes.length && step === 'draw') e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [strokes.length, step])

  const addStroke = useCallback((s: Stroke) => {
    if (totalPoints + s.p.length / 3 > MAX_POINTS_TOTAL) {
      toast.error('그림이 너무 복잡해요. 더 그리려면 일부를 지워 주세요.')
      return
    }
    sfx.draw()
    setStrokes((prev) => [...prev, s])
    drawnAt.current = [...drawnAt.current, Date.now()]
    setRedo([])
    setUndoSpent(false)
  }, [totalPoints])

  // Without an eraser, undo is only a quick "oops": the last stroke, within 10 seconds, once.
  const canUndo = strokes.length > 0 && (hasEraser || (!undoSpent && Date.now() - (drawnAt.current[drawnAt.current.length - 1] ?? 0) < UNDO_WINDOW_MS))
  const [, force] = useState(0)
  useEffect(() => {
    if (hasEraser || !strokes.length || undoSpent) return
    const left = UNDO_WINDOW_MS - (Date.now() - (drawnAt.current[drawnAt.current.length - 1] ?? 0))
    if (left <= 0) return
    const t = setTimeout(() => force((n) => n + 1), left + 20)
    return () => clearTimeout(t)
  }, [strokes, hasEraser, undoSpent])

  function undo() {
    if (!canUndo) {
      toast.info(hasEraser ? '되돌릴 선이 없어요.' : '일반 볼펜 선은 지울 수 없어요. 방금(10초 안에) 그린 선 하나만 되돌릴 수 있어요. 지우개는 상점에서 살 수 있어요!')
      return
    }
    setRedo((r) => [...r, strokes[strokes.length - 1]])
    setStrokes((s) => s.slice(0, -1))
    drawnAt.current = drawnAt.current.slice(0, -1)
    if (!hasEraser) setUndoSpent(true)
  }
  function doRedo() {
    if (!redo.length) return
    const s = redo[redo.length - 1]
    setRedo((r) => r.slice(0, -1))
    setStrokes((prev) => [...prev, s])
    drawnAt.current = [...drawnAt.current, Date.now()]
    setUndoSpent(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step !== 'draw' || e.target instanceof HTMLInputElement) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        doRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function selectTool(t: ToolInfo) {
    if (!ownedIds.has(t.itemId)) {
      setLockedTool(t)
      return
    }
    sfx.click()
    setToolId(t.id)
    setPanMode(false)
  }

  async function loadDraft(id: number) {
    try {
      const r = await api.get<{ draft: { id: number; name: string; type: string | null; paperId: string; strokes: Stroke[] } }>(`/drafts/${id}`)
      setStrokes(r.draft.strokes)
      drawnAt.current = r.draft.strokes.map(() => 0)
      setRedo([])
      setPaperId(r.draft.paperId)
      setName(r.draft.name)
      setType((r.draft.type as WeaponType) ?? 'auto')
      setDraftId(r.draft.id)
      setShowDrafts(false)
      toast.success('저장한 그림을 불러왔어요.')
    } catch (e) {
      toast.error('그림을 불러오지 못했어요. ' + errorMessage(e))
    }
  }

  async function saveDraft() {
    if (!strokes.length) return toast.info('먼저 그림을 그려 주세요.')
    setSavingDraft(true)
    try {
      const r = await api.post<{ id: number }>('/drafts', {
        id: draftId ?? undefined, name: name.trim(), type: type === 'auto' ? null : type, strokes, paperId, previewPng: renderPng(strokes, paperId, 160),
      })
      setDraftId(r.id)
      sfx.success()
      toast.success('그림을 저장했어요. 언제든 불러올 수 있어요.')
      void qc.invalidateQueries({ queryKey: ['drafts'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSavingDraft(false)
    }
  }

  function clearAll() {
    setStrokes([])
    setRedo([])
    drawnAt.current = []
    setDraftId(null)
    setConfirmClear(false)
    toast.info('종이를 새로 꺼냈어요.')
  }

  function startConvert() {
    if (!strokes.some((s) => s.t !== 'eraser')) return toast.info('먼저 무기를 그려 주세요!')
    const e = name.trim() ? checkWeaponName(name) : null
    if (e) return toast.error(e)
    setStep('convert')
  }

  if (owned.isLoading) return <div className="bg-arena h-[100dvh]"><Loading text="제작소 준비 중..." /></div>

  if (step === 'convert')
    return (
      <ConvertStep
        strokes={strokes}
        paperId={paperId}
        initialName={name}
        initialType={type}
        onBack={() => setStep('draw')}
        onStored={() => {
          try { localStorage.removeItem(AUTOSAVE_KEY(user.id)) } catch { /* ignore */ }
          if (draftId) void api.del(`/drafts/${draftId}`).catch(() => {})
        }}
        onSaved={() => {
          setStrokes([])
          setRedo([])
          drawnAt.current = []
          setDraftId(null)
          setName('')
          setType('auto')
          setStep('draw')
        }}
      />
    )

  return (
    <div className="bg-arena flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-white/10 bg-ink/40 px-3 py-2 backdrop-blur">
        <IconButton label="로비로" onClick={() => nav('/')}>←</IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-tight">🖌️ 무기 제작소</h1>
          <p className="truncate text-xs text-dim">마음껏 그린 다음 "3D로 변환"을 눌러 보세요!</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShowDrafts(true)}>📂 불러오기</Button>
        <Button size="sm" variant="secondary" loading={savingDraft} onClick={saveDraft}>💾 그림 저장</Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── tools ── */}
        <aside className="order-2 flex shrink-0 flex-col gap-3 overflow-y-auto border-white/10 bg-ink/30 p-3 scrollbar-thin lg:order-1 lg:w-64 lg:border-r">
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-dim">그림 도구</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible">
              {TOOLS.map((t) => {
                const have = ownedIds.has(t.itemId)
                return (
                  <button
                    key={t.id}
                    onClick={() => selectTool(t)}
                    title={t.desc}
                    className={cx(
                      'relative flex shrink-0 items-center gap-1.5 rounded-xl border-2 px-2 py-1.5 text-left text-sm font-bold transition',
                      toolId === t.id ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5 hover:bg-white/10',
                      !have && 'opacity-55',
                    )}
                  >
                    <ToolIcon id={t.id} />
                    <span className="truncate">{t.name}</span>
                    {!have && <span className="ml-auto text-xs">🔒</span>}
                  </button>
                )
              })}
            </div>
            {!hasEraser && <p className="mt-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-dim">✏️ 일반 볼펜 선은 지울 수 없어요. 지우개(400코인)를 사면 지울 수 있어요.</p>}
          </section>

          {tool.id !== 'eraser' && !['rainbow', 'gold', 'legendary'].includes(tool.render) && (
            <section>
              <h3 className="mb-1.5 text-xs font-bold text-dim">색상</h3>
              <div className="grid grid-cols-8 gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`색상 ${c}`}
                    className={cx('aspect-square rounded-lg border-2 transition', color === c ? 'scale-110 border-accent' : 'border-white/20')}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-dim">
                직접 고르기
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent" />
              </label>
            </section>
          )}

          <section>
            <h3 className="mb-1 flex justify-between text-xs font-bold text-dim">선 굵기 <span className="font-num text-text">{width}</span></h3>
            <input
              type="range" min={tool.minWidth} max={tool.maxWidth} step={1} value={width}
              onChange={(e) => setWidths({ ...widths, [toolId]: Number(e.target.value) })} className="w-full"
            />
          </section>

          <section className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="secondary" onClick={undo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">↶ 취소</Button>
            <Button size="sm" variant="secondary" onClick={doRedo} disabled={!redo.length} title="다시 실행 (Ctrl+Y)">↷ 다시</Button>
            <Button size="sm" variant="danger" onClick={() => strokes.length && setConfirmClear(true)} disabled={!strokes.length}>새 종이</Button>
          </section>
          <p className="text-center font-num text-[11px] text-faint">선 {strokes.length}개 · 점 {totalPoints.toLocaleString()} / {MAX_POINTS_TOTAL.toLocaleString()}</p>
        </aside>

        {/* ── paper ── */}
        <main className="relative order-1 min-h-[52vh] flex-1 lg:order-2 lg:min-h-0">
          <DrawingCanvas
            strokes={strokes} paperId={paperId} tool={tool} color={color} width={width}
            panMode={panMode} view={view} onView={setView} onStroke={addStroke}
          />
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-ink/70 p-1 backdrop-blur">
            <IconButton label="축소" onClick={() => setView({ ...view, zoom: Math.max(0.5, view.zoom / 1.25) })}>－</IconButton>
            <button onClick={() => setView({ zoom: 1, x: 0, y: 0 })} className="w-14 font-num text-sm font-bold" title="원래 크기로">{Math.round(view.zoom * 100)}%</button>
            <IconButton label="확대" onClick={() => setView({ ...view, zoom: Math.min(5, view.zoom * 1.25) })}>＋</IconButton>
            <IconButton label="종이 이동" className={panMode ? '!border-accent !bg-accent/30' : ''} onClick={() => setPanMode(!panMode)}>✋</IconButton>
          </div>
          <p className="pointer-events-none absolute left-3 top-3 hidden rounded-lg bg-ink/60 px-2 py-1 text-[11px] text-dim lg:block">
            휠: 확대/축소 · 스페이스+드래그: 이동 · Ctrl+Z: 취소
          </p>
        </main>

        {/* ── weapon info ── */}
        <aside className="order-3 flex shrink-0 flex-col gap-3 overflow-y-auto border-white/10 bg-ink/30 p-3 scrollbar-thin lg:w-72 lg:border-l">
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-dim">무기 이름</h3>
            <input
              value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="이름을 지어 주세요 (나중에 정해도 돼요)"
              className="h-11 w-full rounded-xl border-2 border-white/15 bg-black/30 px-3 text-sm outline-none focus:border-accent"
            />
          </section>
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-dim">무기 종류</h3>
            <select
              value={type} onChange={(e) => setType(e.target.value as TypeChoice)}
              className="h-11 w-full rounded-xl border-2 border-white/15 bg-black/30 px-3 text-sm outline-none focus:border-accent"
            >
              <option value="auto" className="bg-panel">🤖 자동 추천 (그림을 보고 골라 줘요)</option>
              {WEAPON_TYPES.map((t) => <option key={t} value={t} className="bg-panel">{WEAPON_INFO[t].emoji} {WEAPON_INFO[t].name}</option>)}
            </select>
            {type !== 'auto' && <p className="mt-1 text-xs text-dim">{WEAPON_INFO[type].desc}</p>}
          </section>
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-dim">종이 <span className="font-normal">(레벨이 오르면 새 종이가 열려요)</span></h3>
            <div className="grid grid-cols-3 gap-1.5">
              {PAPERS.map((p) => {
                const unlocked = p.unlockLevel <= user.level
                return (
                  <button
                    key={p.id}
                    disabled={!unlocked}
                    onClick={() => setPaperId(p.id)}
                    title={unlocked ? p.name : `레벨 ${p.unlockLevel}에 열려요`}
                    className={cx('relative overflow-hidden rounded-lg border-2 text-[10px] font-bold', paperId === p.id ? 'border-accent' : 'border-white/15', !unlocked && 'cursor-not-allowed')}
                  >
                    <span className="block h-9" style={{ background: p.bg }} />
                    <span className="block truncate bg-ink/70 px-1 py-0.5">{p.name}</span>
                    {!unlocked && <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs">🔒 Lv.{p.unlockLevel}</span>}
                  </button>
                )
              })}
            </div>
          </section>
          <div className="mt-auto space-y-2 pt-2">
            <Button size="lg" className="w-full" onClick={startConvert}>🪄 3D로 변환</Button>
            <Button variant="secondary" className="w-full" onClick={() => nav('/inventory')}>🎒 보관함으로 이동</Button>
          </div>
        </aside>
      </div>

      <Confirm
        open={confirmClear} title="새 종이로 바꿀까요?" danger confirmText="새 종이"
        message="지금 그린 그림이 모두 사라져요. 저장하지 않은 그림은 되돌릴 수 없어요."
        onCancel={() => setConfirmClear(false)} onConfirm={clearAll}
      />
      <Confirm
        open={restore !== null} title="그리던 그림이 있어요" confirmText="이어서 그리기" cancelText="새로 그리기"
        message="지난번에 저장하지 않고 나간 그림이 있어요. 이어서 그릴까요?"
        onCancel={() => {
          setRestore(null)
          try { localStorage.removeItem(AUTOSAVE_KEY(user.id)) } catch { /* ignore */ }
        }}
        onConfirm={() => {
          if (restore) {
            setStrokes(restore.strokes)
            drawnAt.current = restore.strokes.map(() => 0)
            setPaperId(PAPERS.some((p) => p.id === restore.paperId && p.unlockLevel <= user.level) ? restore.paperId : 'white')
            setName(restore.name ?? '')
          }
          setRestore(null)
        }}
      />
      <Modal open={lockedTool !== null} onClose={() => setLockedTool(null)} title={`🔒 ${lockedTool?.name}`}>
        <p className="mb-2 text-dim">{lockedTool?.desc}</p>
        <p className="mb-5">상점에서 <b className="font-num text-accent">🪙 {lockedTool?.price.toLocaleString()}</b> 코인으로 살 수 있어요. (보유: {user.coins.toLocaleString()})</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setLockedTool(null)}>닫기</Button>
          <Button className="flex-1" onClick={() => nav('/shop?tab=tools')}>상점으로</Button>
        </div>
      </Modal>
      <DraftsModal open={showDrafts} onClose={() => setShowDrafts(false)} onLoad={loadDraft} />
    </div>
  )
}

function ToolIcon({ id }: { id: string }) {
  const icons: Record<string, string> = {
    ballpoint: '🖊️', eraser: '🧽', pencil: '✏️', marker: '🖍️', highlighter: '🖌️', brush: '🖌️', rainbow: '🌈', neon: '💡', gold: '✨', legendary: '🌟',
  }
  return <span className="text-lg">{icons[id] ?? '🖊️'}</span>
}

function DraftsModal({ open, onClose, onLoad }: { open: boolean; onClose: () => void; onLoad: (id: number) => void }) {
  const qc = useQueryClient()
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api.get<{ drafts: DraftSummary[]; max: number }>('/drafts'), enabled: open })
  const [del, setDel] = useState<DraftSummary | null>(null)
  return (
    <Modal open={open} onClose={onClose} title="📂 저장한 그림" wide>
      {drafts.isError ? (
        <p className="text-bad">그림 목록을 불러오지 못했어요.</p>
      ) : !drafts.data ? (
        <Loading />
      ) : !drafts.data.drafts.length ? (
        <p className="py-8 text-center text-dim">아직 저장한 그림이 없어요. 그리다가 "그림 저장"을 눌러 보세요.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-dim">{drafts.data!.drafts.length} / {drafts.data!.max}개 저장됨</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {drafts.data!.drafts.map((d) => (
              <div key={d.id} className="overflow-hidden rounded-xl border-2 border-white/10 bg-white/5">
                <button onClick={() => onLoad(d.id)} className="block w-full">
                  {d.previewPng ? <img src={d.previewPng} alt="" className="aspect-square w-full bg-white object-contain" /> : <div className="aspect-square bg-white/10" />}
                </button>
                <div className="flex items-center gap-1 p-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{d.name || '이름 없음'}</span>
                  {d.type && <Pill className="bg-white/10 text-text">{WEAPON_INFO[d.type as WeaponType]?.name}</Pill>}
                  <button onClick={() => setDel(d)} className="px-1 text-bad" aria-label="삭제">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Confirm
        open={del !== null} title="그림을 지울까요?" danger confirmText="지우기"
        message={`"${del?.name || '이름 없음'}" 그림을 지우면 다시 되돌릴 수 없어요.`}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return
          try {
            await api.del(`/drafts/${del.id}`)
            void qc.invalidateQueries({ queryKey: ['drafts'] })
          } catch (e) {
            toast.error(errorMessage(e))
          }
          setDel(null)
        }}
      />
    </Modal>
  )
}
