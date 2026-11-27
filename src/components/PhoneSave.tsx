import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

const isPhone = () => /Android|iPhone|iPad/i.test(navigator.userAgent)

/** Explains how to get the .glb onto the Galaxy S22: open the game on the phone via QR, then save there. */
export function PhoneSaveHint({ path }: { path: string }) {
  const lan = useQuery({ queryKey: ['lan'], queryFn: () => api.get<{ ips: string[]; port: number }>('/lan'), enabled: !isPhone(), staleTime: Infinity })
  const [qr, setQr] = useState<string | null>(null)
  const url = lan.data?.ips[0] ? `http://${lan.data.ips[0]}:${lan.data.port}${path}` : null

  useEffect(() => {
    if (!url) return
    void QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: '#141a4a', light: '#ffffff' } }).then(setQr)
  }, [url])

  if (isPhone()) return <p className="text-xs text-dim">버튼을 누르면 이 휴대폰의 <b>다운로드</b> 폴더에 .glb 파일로 저장돼요.</p>
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
      {qr ? <img src={qr} alt="휴대폰으로 열기 QR 코드" className="size-24 rounded-lg" /> : <div className="size-24 animate-pulse rounded-lg bg-white/10" />}
      <div className="text-xs text-dim">
        <p className="mb-1 font-bold text-text">📱 S22에 저장하려면</p>
        <p>1. 같은 와이파이에서 S22 카메라로 QR을 찍어 게임을 열어요.</p>
        <p>2. 로그인 후 이 무기에서 "휴대폰에 저장"을 누르면 S22 다운로드 폴더에 저장돼요.</p>
        {url && <p className="mt-1 break-all font-num text-[11px] text-faint">{url}</p>}
        {lan.data && !lan.data.ips.length && <p className="mt-1 text-bad">이 컴퓨터의 와이파이 주소를 찾지 못했어요.</p>}
      </div>
    </div>
  )
}
