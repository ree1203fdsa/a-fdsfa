import { useNavigate } from 'react-router-dom'
import { Button, ScreenHeader } from '@/components/ui'

/** Shown for screens that are not built yet, so no button pretends to work. */
export default function ComingSoon({ title, icon }: { title: string; icon: string }) {
  const nav = useNavigate()
  return (
    <div className="bg-arena min-h-full">
      <ScreenHeader title={title} sub="COMING SOON" />
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <span className="animate-float text-7xl grayscale-[0.3]">{icon}</span>
        <p className="font-display text-3xl tracking-wide">아직 만드는 중이에요</p>
        <p className="text-dim">"{title}" 화면은 곧 열려요. 지금은 사용할 수 없어요.</p>
        <Button variant="secondary" onClick={() => nav('/')}>로비로 돌아가기</Button>
      </div>
    </div>
  )
}
