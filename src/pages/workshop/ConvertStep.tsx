import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Group } from 'three'
import { WEAPON_INFO, WEAPON_TYPES, type WeaponType } from '@shared/constants'
import { checkWeaponName } from '@shared/text'
import { computeStats, type ModelParams, type Stroke, type WeaponFeatures } from '@shared/weapon'
import { PhoneSaveHint } from '@/components/PhoneSave'
import { SpecialBox, StatBars } from '@/components/StatBars'
import { Button, cx, IconButton, Modal, Pill, Spinner } from '@/components/ui'
import { renderPng } from '@/draw/render'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { downloadGlb, sendGlbToPhone } from '@/three/exportGlb'
import WeaponView from '@/three/WeaponView'

interface Analysis {
  features: WeaponFeatures
  recommended: WeaponType
  confidence: number
  modelParams: ModelParams
}
interface AiSuggestion {
  type: WeaponType
  confidence: number
  name: string | null
  handle: 'top' | 'bottom' | 'left' | 'right' | 'unknown'
  description: string
  ms: number
}
type AiState = { status: 'running' } | { status: 'done'; s: AiSuggestion } | { status: 'none'; reason: string } | { status: 'skipped' }

const STEPS = ['외곽선 분석', '주요 형태 추출', '무기 구조 분석', '손잡이와 날 구분', '무기 유형 분류', '크기와 비율 분석', '기본 모델 선택', '색상과 패턴 적용', '3D 모델 생성', '미리보기 표시']

// Direction of the handle in canvas coordinates (y grows downward).
const HANDLE_DIR: Record<string, number> = { bottom: Math.PI / 2, top: -Math.PI / 2, left: Math.PI, right: 0 }

/** Turns the drawing 180° if the local AI is sure the handle is on the other end. */
function applyAiHandle(p: ModelParams, ai: AiSuggestion | null): ModelParams {
  if (!ai || ai.handle === 'unknown' || ai.confidence < 0.5) return p
  const ruleHead = -Math.PI / 2 - p.angle
  const aiHead = HANDLE_DIR[ai.handle] + Math.PI
  if (Math.cos(ruleHead - aiHead) < -0.3) {
    let a = p.angle + Math.PI
    a = Math.atan2(Math.sin(a), Math.cos(a))
    return { ...p, angle: a }
  }
  return p
}

export default function ConvertStep({ strokes, paperId, initialName, initialType, onBack, onStored, onSaved }: {
  strokes: Stroke[]; paperId: string; initialName: string; initialType: WeaponType | 'auto'
  onBack: () => void; onStored: () => void; onSaved: () => void
}) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const refresh = useAuth((s) => s.refresh)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ai, setAi] = useState<AiState>({ status: 'running' })
  const [type, setType] = useState<WeaponType | null>(initialType === 'auto' ? null : initialType)
  const [params, setParams] = useState<ModelParams | null>(null)
  const [built, setBuilt] = useState(false)
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ id: number; tutorialCoins: number; discovered: string[] } | null>(null)
  const [needPick, setNeedPick] = useState(false)
  const [phoneState, setPhoneState] = useState<{ status: 'idle' | 'sending' | 'delivered' | 'queued' | 'failed' | 'off'; path?: string; error?: string }>({ status: 'idle' })
  const groupRef = useRef<Group | null>(null)
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const thumb = useMemo(() => renderPng(strokes, paperId, 200), [strokes, paperId])

  useEffect(() => {
    let alive = true
    api.post<Analysis>('/weapons/analyze', { strokes, paperId })
      .then((r) => alive && setAnalysis(r))
      .catch((e) => alive && setError(errorMessage(e)))
    // 320px keeps the local vision model at ~8s on this PC's integrated GPU (448px took ~50s).
    const image = renderPng(strokes, null, 320)
    api.post<{ suggestion: AiSuggestion | null; available: boolean }>('/weapons/ai', { image })
      .then((r) => {
        if (!alive) return
        setAi((cur) => cur.status === 'skipped' ? cur : r.suggestion ? { status: 'done', s: r.suggestion } : { status: 'none', reason: r.available ? 'AI가 무기를 알아보지 못했어요.' : '로컬 AI(Ollama)가 꺼져 있어요.' })
      })
      .catch((e) => alive && setAi((cur) => (cur.status === 'skipped' ? cur : { status: 'none', reason: errorMessage(e) })))
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [strokes, paperId])

  const aiResult = ai.status === 'done' ? ai.s : null
  const aiSettled = ai.status !== 'running'

  // Pick the type once both analyses are in (or the AI was skipped).
  useEffect(() => {
    if (!analysis || !aiSettled || params) return
    let chosen = type
    if (!chosen) {
      if (aiResult && aiResult.confidence >= 0.5) chosen = aiResult.type
      else if (analysis.confidence >= 0.35) chosen = analysis.recommended
    }
    if (!chosen) {
      setNeedPick(true)
      return
    }
    setType(chosen)
    setParams(applyAiHandle(analysis.modelParams, aiResult))
    if (!name.trim() && aiResult?.name) setName(aiResult.name)
  }, [analysis, aiSettled, aiResult, type, params, name])

  const stats = useMemo(() => (analysis && type && params ? computeStats(type, analysis.features, params.thickness) : null), [analysis, type, params])
  const onBuilt = useCallback((g: Group | null) => {
    groupRef.current = g
    setBuilt(Boolean(g))
  }, [])

  const doneSteps = !analysis ? 0 : !type || !params ? 6 : !built ? 8 : 10

  async function save() {
    if (!type || !params) return
    const finalName = name.trim() || `나의 ${WEAPON_INFO[type].name}`
    const e = checkWeaponName(finalName)
    if (e) return toast.error(e)
    setSaving(true)
    try {
      const r = await api.post<{ weapon: { id: number }; tutorialCoins: number; discovered: string[] }>('/weapons', {
        name: finalName, type, strokes, paperId, previewPng: renderPng(strokes, paperId, 256), modelParams: params,
      })
      sfx.success()
      onStored()
      setSaved({ id: r.weapon.id, tutorialCoins: r.tutorialCoins, discovered: r.discovered })
      void sendPhone(r.weapon.id)
      void refresh()
      void qc.invalidateQueries({ queryKey: ['weapons'] })
      void qc.invalidateQueries({ queryKey: ['home'] })
    } catch (err) {
      sfx.error()
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // Every saved weapon is also copied to the S22 automatically (queued on the server if the phone is offline).
  async function sendPhone(weaponId: number) {
    if (!groupRef.current) return
    setPhoneState({ status: 'sending' })
    try {
      const r = await sendGlbToPhone(groupRef.current, weaponId)
      if (!r.enabled) setPhoneState({ status: 'off' })
      else setPhoneState({ status: r.delivered ? 'delivered' : 'queued', path: r.phonePath })
    } catch (e) {
      setPhoneState({ status: 'failed', error: errorMessage(e) })
    }
  }

  async function savePhone() {
    if (!groupRef.current) return
    try {
      const bytes = await downloadGlb(groupRef.current, name.trim() || (type ? WEAPON_INFO[type].name : 'weapon'))
      toast.success(`3D 파일(.glb, ${(bytes / 1024).toFixed(0)}KB)을 저장했어요.`)
    } catch (e) {
      toast.error('3D 파일을 만들지 못했어요. ' + errorMessage(e))
    }
  }

  // ── analysis screen ──
  if (!params || !type || !analysis) {
    return (
      <div className="bg-arena flex min-h-[100dvh] flex-col items-center justify-center gap-5 p-4">
        <h1 className="text-outline font-display text-4xl">🔍 무기 분석 중</h1>
        <div className="grid w-full max-w-4xl gap-4 md:grid-cols-[220px_1fr_1fr]">
          <div className="panel cut-lg flex flex-col items-center gap-2 p-3">
            <img src={thumb} alt="내 그림" className="aspect-square w-full rounded-xl" />
            <p className="text-xs text-dim">내가 그린 그림</p>
          </div>
          <div className="panel cut-lg p-4">
            <h3 className="mb-2 font-display text-lg">🧮 분석 과정</h3>
            <ol className="space-y-1">
              {STEPS.map((s, i) => (
                <li key={s} className={cx('flex items-center gap-2 text-sm', i < doneSteps ? 'text-text' : 'text-faint')}>
                  <span className={cx('grid size-5 place-items-center rounded-full text-[11px] font-bold', i < doneSteps ? 'bg-ok text-white' : i === doneSteps && !error ? 'bg-accent/30' : 'bg-white/10')}>
                    {i < doneSteps ? '✓' : i === doneSteps && !error && !needPick ? <Spinner small /> : i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            {analysis && (
              <p className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-dim">
                규칙 분석 결과: <b className="text-text">{WEAPON_INFO[analysis.recommended].emoji} {WEAPON_INFO[analysis.recommended].name}</b> (확신도 {Math.round(analysis.confidence * 100)}%)
              </p>
            )}
          </div>
          <div className="panel cut-lg p-4">
            <h3 className="mb-2 font-display text-lg">🤖 로컬 AI 분석</h3>
            {ai.status === 'running' && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm"><Spinner small /> 이 컴퓨터의 AI가 그림을 보는 중... <span className="font-num text-dim">{elapsed}초</span></p>
                <p className="text-xs text-dim">보통 10초 정도 걸려요. 처음 한 번은 AI를 깨우느라 더 오래 걸릴 수 있어요.</p>
                <Button size="sm" variant="secondary" disabled={!analysis} onClick={() => setAi({ status: 'skipped' })}>AI 기다리지 않고 진행</Button>
              </div>
            )}
            {ai.status === 'done' && (
              <div className="space-y-1 text-sm">
                <p>AI 판단: <b className="font-display text-lg text-accent-2">{WEAPON_INFO[ai.s.type].emoji} {WEAPON_INFO[ai.s.type].name}</b></p>
                <p className="text-dim">확신도 {Math.round(ai.s.confidence * 100)}% · {(ai.s.ms / 1000).toFixed(1)}초</p>
                {ai.s.name && <p>추천 이름: <b>{ai.s.name}</b></p>}
                {ai.s.description && <p className="text-dim">"{ai.s.description}"</p>}
              </div>
            )}
            {ai.status === 'none' && <p className="text-sm text-dim">⚠️ {ai.reason}<br />규칙 분석 결과로 진행해요.</p>}
            {ai.status === 'skipped' && <p className="text-sm text-dim">AI 분석을 건너뛰었어요.</p>}
          </div>
        </div>
        {error && (
          <div className="flex flex-col items-center gap-3">
            <p className="rounded-xl bg-bad/20 px-4 py-2 text-bad">{error}</p>
            <Button variant="secondary" onClick={onBack}>다시 그리러 가기</Button>
          </div>
        )}
        {needPick && (
          <div className="panel cut-lg w-full max-w-4xl p-4">
            <p className="mb-3 font-bold">🤔 그림이 어떤 무기인지 확실하지 않아요. 무기 종류를 직접 골라 주세요!</p>
            <TypePicker value={null} onChange={(t) => {
              setType(t)
              setNeedPick(false)
            }} />
          </div>
        )}
        {!error && !needPick && <Button variant="ghost" onClick={onBack}>← 그림으로 돌아가기</Button>}
      </div>
    )
  }

  // ── 3D preview ──
  return (
    <div className="bg-arena flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-white/10 bg-ink/40 px-3 py-2 backdrop-blur">
        <IconButton label="다시 그리기" onClick={onBack}>←</IconButton>
        <h1 className="flex-1 font-display text-2xl">✨ 3D 무기 완성!</h1>
        {aiResult && <Pill className="bg-violet text-white">🤖 로컬 AI 분석</Pill>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[45vh] flex-1">
          <WeaponView strokes={strokes} paperId={paperId} type={type} params={params} onBuilt={onBuilt} className="absolute inset-0" />
          <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-dim">드래그해서 돌려 보고, 휠이나 두 손가락으로 확대해 보세요</p>
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-white/10 bg-ink/30 p-4 scrollbar-thin lg:w-[24rem] lg:border-l">
          <input
            value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder={`나의 ${WEAPON_INFO[type].name}`}
            className="h-12 w-full rounded-xl border-2 border-white/15 bg-black/30 px-3 font-display text-xl outline-none focus:border-accent"
          />
          <div>
            <p className="mb-1 text-xs font-bold text-dim">무기 종류 (바꾸면 능력치가 달라져요)</p>
            <TypePicker value={type} onChange={setType} compact />
          </div>
          {stats && <StatBars stats={stats} />}
          <SpecialBox type={type} />
          <details className="rounded-xl bg-white/5 p-3">
            <summary className="cursor-pointer text-sm font-bold">🛠️ 모양 보정하기</summary>
            <div className="mt-3 space-y-3 text-sm">
              <Slider label="회전" value={Math.round((params.angle * 180) / Math.PI)} min={-180} max={180} unit="°" onChange={(v) => setParams({ ...params, angle: (v * Math.PI) / 180 })} />
              <Slider label="두께" value={Math.round(params.thickness * 100)} min={50} max={150} unit="%" onChange={(v) => setParams({ ...params, thickness: v / 100 })} />
              <Slider label="크기" value={Math.round(params.scale * 100)} min={70} max={130} unit="%" onChange={(v) => setParams({ ...params, scale: v / 100 })} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setParams({ ...params, flip: !params.flip })}>↔ 좌우 뒤집기</Button>
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setParams({ ...params, angle: Math.atan2(Math.sin(params.angle + Math.PI), Math.cos(params.angle + Math.PI)) })}>↕ 위아래 바꾸기</Button>
              </div>
              <p className="text-xs text-dim">두께가 두꺼우면 방어력과 무게가 늘고 속도는 줄어요. 크기는 겉모습만 바꿔요.</p>
            </div>
          </details>
          <div className="mt-auto space-y-2 pt-2">
            <Button size="lg" className="w-full" loading={saving} disabled={!built} onClick={save}>🎒 보관함에 추가</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onBack}>✏️ 다시 그리기</Button>
              <Button variant="blue" disabled={!built} onClick={savePhone}>📱 휴대폰에 저장</Button>
            </div>
            <PhoneSaveHint path="/inventory" />
          </div>
        </aside>
      </div>

      <Modal open={saved !== null} onClose={() => {}} title="🎉 무기를 보관함에 넣었어요!">
        <div className="space-y-2">
          <p><b className="font-display text-lg text-accent-2">{name.trim() || `나의 ${WEAPON_INFO[type].name}`}</b> 완성!</p>
          {saved?.tutorialCoins ? <p className="rounded-lg bg-accent/20 px-3 py-2 font-bold">🪙 첫 무기 보상 {saved.tutorialCoins}코인을 받았어요!</p> : null}
          {saved?.discovered.length ? <p className="rounded-lg bg-violet/20 px-3 py-2 text-sm">📖 도감에 새 무기가 등록됐어요!</p> : null}
        </div>
        {phoneState.status !== 'off' && phoneState.status !== 'idle' && (
          <p className={cx('mt-3 rounded-lg px-3 py-2 text-sm', phoneState.status === 'delivered' ? 'bg-ok/20' : phoneState.status === 'failed' ? 'bg-bad/20' : 'bg-white/5')}>
            {phoneState.status === 'sending' && '📲 S22에 3D 파일 저장 중...'}
            {phoneState.status === 'delivered' && <>📲 S22에 저장됐어요!<br /><span className="text-xs text-dim">{phoneState.path}</span></>}
            {phoneState.status === 'queued' && '📲 S22가 연결돼 있지 않아서 컴퓨터에 보관했어요. 연결되면 자동으로 보내요.'}
            {phoneState.status === 'failed' && `📲 S22 저장 실패: ${phoneState.error}`}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => onSaved()}>하나 더 만들기</Button>
          <Button onClick={() => nav('/inventory')}>보관함 보기</Button>
        </div>
      </Modal>
    </div>
  )
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs font-bold text-dim">{label}<span className="font-num text-text">{value}{unit}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  )
}

function TypePicker({ value, onChange, compact }: { value: WeaponType | null; onChange: (t: WeaponType) => void; compact?: boolean }) {
  return (
    <div className={cx('grid gap-1.5', compact ? 'grid-cols-5' : 'grid-cols-4 sm:grid-cols-7')}>
      {WEAPON_TYPES.map((t) => (
        <button
          key={t}
          onClick={() => {
            sfx.click()
            onChange(t)
          }}
          title={WEAPON_INFO[t].desc}
          className={cx('flex flex-col items-center rounded-xl border-2 px-1 py-1.5 text-[11px] font-bold transition', value === t ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5 hover:bg-white/10')}
        >
          <span className="text-xl">{WEAPON_INFO[t].emoji}</span>
          {WEAPON_INFO[t].name}
        </button>
      ))}
    </div>
  )
}
