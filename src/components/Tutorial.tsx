import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, cx, Modal } from '@/components/ui'

const SLIDES = [
  ['👋', '컬러워즈에 오신 것을 환영합니다!', '직접 그린 그림이 진짜 3D 무기가 되는 게임이에요. 레드팀과 블루팀으로 나뉘어 대결해요.'],
  ['🎮', '기본 조작', 'PC: W A S D로 이동, 스페이스로 점프, Shift로 달리기, 마우스 왼쪽으로 공격, 오른쪽으로 방어, Q로 특수 기술.\n휴대폰: 왼쪽 조이스틱으로 이동, 오른쪽 버튼으로 공격해요.'],
  ['🖌️', '무기 그리기', '무기 제작소에서 펜으로 무기를 그려요. 처음 주는 일반 볼펜은 지울 수 없으니 천천히 그려요! (지우개는 상점에서 살 수 있어요)'],
  ['🪄', '3D 무기로 변환', '"3D로 변환"을 누르면 이 컴퓨터의 AI가 그림을 보고 무기 종류를 알아내서 3D 무기로 만들어요. 모양에 따라 능력치가 달라져요.'],
  ['🎒', '무기 보관함', '만든 무기는 보관함에 모여요. 전투에 쓸 무기를 장착하고, 이름을 바꾸거나 복제할 수 있어요.'],
  ['👫', '친구와 대전', '"플레이 → 친구와 플레이"에서 방을 만들고 6자리 방 코드를 친구에게 알려 주세요. 최대 4명이 2대2로 싸워요.'],
  ['🤖', 'AI와 대전', '친구가 없어도 괜찮아요! AI와 쉬움부터 전설까지 5단계 난이도로 연습할 수 있어요.'],
  ['🪙', '상점과 코인', '전투, 미션, 출석으로 코인을 모아 새 펜, 꾸미기 아이템, 보관함 확장을 살 수 있어요.'],
  ['🏆', '첫 무기를 만들어 볼까요?', '첫 무기를 완성해서 보관함에 넣으면 튜토리얼 보상 300코인을 드려요!'],
] as const

export function TutorialModal({ open, onClose, rewardPending }: { open: boolean; onClose: () => void; rewardPending: boolean }) {
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const [icon, title, body] = SLIDES[i]
  return (
    <Modal open={open} onClose={onClose} title={`튜토리얼 ${i + 1}/${SLIDES.length}`}>
      <div className="flex min-h-56 flex-col items-center gap-3 text-center">
        <span key={i} className="animate-pop-in text-7xl">{icon}</span>
        <p className="font-display text-2xl">{title}</p>
        <p className="whitespace-pre-line text-dim">{body}</p>
        {last && !rewardPending && <p className="text-xs text-faint">이미 튜토리얼 보상을 받았어요.</p>}
      </div>
      <div className="my-4 flex justify-center gap-1.5">
        {SLIDES.map((_, k) => <span key={k} className={cx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-accent' : 'w-2 bg-white/25')} />)}
      </div>
      <div className="flex gap-2">
        {i > 0 ? <Button variant="secondary" className="flex-1" onClick={() => setI(i - 1)}>이전</Button> : <Button variant="ghost" className="flex-1" onClick={onClose}>건너뛰기</Button>}
        {last ? (
          <Button className="flex-1" onClick={() => { onClose(); nav('/workshop') }}>🖌️ 첫 무기 만들기</Button>
        ) : (
          <Button className="flex-1" onClick={() => setI(i + 1)}>다음</Button>
        )}
      </div>
    </Modal>
  )
}
