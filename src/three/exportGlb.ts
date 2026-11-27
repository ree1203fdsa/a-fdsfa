import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { Object3D } from 'three'
import { api } from '@/lib/api'

async function toGlb(object: Object3D): Promise<ArrayBuffer> {
  return (await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true })) as ArrayBuffer
}

/**
 * Exports the weapon as binary glTF (.glb) and downloads it. Opened in the phone's
 * browser (e.g. Galaxy S22 Chrome), this lands in the phone's Download folder.
 */
export async function downloadGlb(object: Object3D, name: string) {
  const buf = await toGlb(object)
  const blob = new Blob([buf], { type: 'model/gltf-binary' })
  const safe = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'weapon'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `컬러워즈_${safe}.glb`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return blob.size
}

export interface PhoneSendResult {
  enabled: boolean
  delivered?: boolean
  queued?: boolean
  phonePath?: string
  bytes?: number
}

/** Sends the saved weapon's .glb to the S22 through the server (queued if the phone is offline). */
export async function sendGlbToPhone(object: Object3D, weaponId: number) {
  const buf = new Uint8Array(await toGlb(object))
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return api.post<PhoneSendResult>('/phone/send', { weaponId, glb: btoa(bin) })
}
