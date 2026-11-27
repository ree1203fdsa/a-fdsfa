import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, cx, Empty, ErrorBox, IconButton, Loading, ScreenHeader } from '@/components/ui'
import { api } from '@/lib/api'

interface Noti { id: number; type: string; title: string; body: string; data: Record<string, unknown>; read: boolean; createdAt: string }

const ICON: Record<string, string> = {
  FRIEND_REQUEST: '👋', FRIEND_ACCEPT: '🤝', INVITE: '📨', ROOM_INVITE: '🚪', LEVEL_UP: '🎉', MISSION_DONE: '🎯', REWARD: '🪙',
  EVENT: '🎊', UPDATE: '🆕', NOTICE: '📢', SECURITY: '🔒', PURCHASE: '🛒', MAIL: '📮',
}
const LINK: Record<string, string> = {
  FRIEND_REQUEST: '/friends', FRIEND_ACCEPT: '/friends', MISSION_DONE: '/missions', MAIL: '/mail', SECURITY: '/settings?tab=account', PURCHASE: '/shop',
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

export default function NotificationsPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ unread: number; notifications: Noti[] }>('/notifications') })

  // Opening the list marks everything as read (after a short delay so the new dots are visible).
  useEffect(() => {
    if (!q.data?.unread) return
    const t = setTimeout(() => {
      void api.post('/notifications/read', {}).then(() => qc.invalidateQueries({ queryKey: ['home'] }))
    }, 1500)
    return () => clearTimeout(t)
  }, [q.data?.unread, qc])

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="알림" sub="NOTIFICATIONS" right={<Button size="sm" variant="secondary" onClick={() => nav('/mail')}>📮 우편함</Button>} />
      <div className="mx-auto max-w-2xl space-y-2 p-4">
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : !q.data!.notifications.length ? (
          <Empty icon="🔔" title="알림이 없어요" />
        ) : (
          q.data!.notifications.map((n) => (
            <div key={n.id} className={cx('panel cut-lg flex items-start gap-3 p-3', !n.read && '!border-accent/60')}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xl">{ICON[n.type] ?? '🔔'}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => LINK[n.type] && nav(LINK[n.type])}>
                <p className="font-bold">{!n.read && <span className="mr-1 inline-block size-2 rounded-full bg-red align-middle" />}{n.title}</p>
                {n.body && <p className="text-sm text-dim">{n.body}</p>}
                <p className="mt-0.5 text-xs text-faint">{timeAgo(n.createdAt)}</p>
              </button>
              <IconButton
                label="알림 지우기" className="!size-8 text-sm"
                onClick={async () => {
                  await api.del(`/notifications/${n.id}`)
                  void q.refetch()
                }}
              >
                ✕
              </IconButton>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
