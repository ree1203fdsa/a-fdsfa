const BANNED = [
  '씨발', '시발', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새', '새끼', '지랄', '미친놈', '미친년', '닥쳐', '꺼져', '엿먹',
  '느금', '니애미', '애미', '애비', '섹스', '야동', 'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'nigger', 'sex',
]
const RESERVED = ['admin', 'administrator', '운영자', '관리자', 'gm', 'colorwars', '컬러워즈']

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s._\-*!@#$%^&()0-9]/g, '')
}

export function containsBanned(s: string): boolean {
  const n = normalize(s)
  return BANNED.some((w) => n.includes(w))
}

export function filterChat(s: string): string {
  let out = s
  for (const w of BANNED) {
    const re = new RegExp(w.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s._\\-*]*'), 'gi')
    out = out.replace(re, (m) => '♡'.repeat(Math.min(4, m.length)))
  }
  return out
}

export const USERNAME_RE = /^[a-z0-9_]{4,16}$/
export const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,10}$/

export function checkNickname(nick: string): string | null {
  if (!NICKNAME_RE.test(nick)) return '닉네임은 2~10자의 한글, 영문, 숫자, _만 쓸 수 있어요.'
  if (containsBanned(nick)) return '사용할 수 없는 단어가 들어 있어요.'
  if (RESERVED.some((r) => normalize(nick).includes(r))) return '운영자로 오해할 수 있는 닉네임은 쓸 수 없어요.'
  return null
}

export function checkUsername(id: string): string | null {
  if (!USERNAME_RE.test(id)) return '아이디는 4~16자의 영문 소문자, 숫자, _만 쓸 수 있어요.'
  if (RESERVED.some((r) => id.includes(r))) return '사용할 수 없는 아이디예요.'
  return null
}

export function checkPassword(pw: string, username = ''): string | null {
  if (pw.length < 8 || pw.length > 64) return '비밀번호는 8~64자로 만들어 주세요.'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return '비밀번호에는 영문과 숫자가 모두 들어가야 해요.'
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return '비밀번호에 아이디를 넣을 수 없어요.'
  return null
}

export function checkWeaponName(name: string): string | null {
  const t = name.trim()
  if (t.length < 1 || t.length > 16) return '무기 이름은 1~16자로 지어 주세요.'
  if (containsBanned(t)) return '사용할 수 없는 단어가 들어 있어요.'
  return null
}
