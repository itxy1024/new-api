import { zipSync } from 'fflate'

import type { TaskRecord } from '../types'
import { getNumberedFileNameBase, sanitizeFileNamePart } from './exportFileName'
import { ensureImageCached } from './imageCache'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface DownloadImagesResult {
  successCount: number
  failCount: number
}

export interface DownloadImageZipEntry {
  imageId: string
  fileNameBase?: string
}

type TaskOutputZipTask = Pick<TaskRecord, 'id' | 'createdAt' | 'outputImages'>

export { formatExportFileTime } from './exportFileName'

export async function downloadImageIds(
  imageIds: string[],
  fileNameBase = 'images'
): Promise<DownloadImagesResult> {
  if (imageIds.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const multiple = imageIds.length > 1

  for (let index = 0; index < imageIds.length; index++) {
    try {
      const source = await resolveImageSource(imageIds[index])
      const order = String(index + 1).padStart(2, '0')
      const fileName = multiple
        ? `${fileNameBase}-${order}.${getImageExtension(source)}`
        : `${fileNameBase}.${getImageExtension(source)}`
      triggerSourceDownload(source, fileName)
      successCount++
      if (multiple) await delay(100)
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  return { successCount, failCount }
}

export async function downloadImageEntriesAsZip(
  entries: DownloadImageZipEntry[],
  zipFileNameBase = 'images'
): Promise<DownloadImagesResult> {
  if (entries.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> =
    {}
  const usedNames = new Set<string>()
  const resolvedEntries: Array<{
    source: ResolvedImageSource
    fileName: string
  }> = []

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    try {
      const source = await resolveImageSource(entry.imageId)
      const order = String(index + 1).padStart(2, '0')
      const base =
        sanitizeFileNamePart(entry.fileNameBase || `image-${order}`) ||
        `image-${order}`
      const ext = getImageExtension(source)
      let fileName = `${base}.${ext}`
      let duplicateIndex = 2
      while (usedNames.has(fileName)) {
        fileName = `${base}-${String(duplicateIndex).padStart(2, '0')}.${ext}`
        duplicateIndex++
      }
      usedNames.add(fileName)
      resolvedEntries.push({ source, fileName })
      successCount++
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  if (successCount > 0) {
    if (resolvedEntries.some(({ source }) => source.remote)) {
      for (const { source, fileName } of resolvedEntries) {
        triggerSourceDownload(source, fileName)
      }
      return { successCount, failCount }
    }
    for (const { source, fileName } of resolvedEntries) {
      const blob = source.blob
      if (!blob) continue
      zipFiles[fileName] = [
        new Uint8Array(await blob.arrayBuffer()),
        { mtime: new Date() },
      ]
    }
    const zipped = zipSync(zipFiles, { level: 6 })
    const buffer = zipped.buffer.slice(
      zipped.byteOffset,
      zipped.byteOffset + zipped.byteLength
    ) as ArrayBuffer
    triggerDownload(
      new Blob([buffer], { type: 'application/zip' }),
      `${sanitizeFileNamePart(zipFileNameBase) || 'images'}.zip`
    )
  }

  return { successCount, failCount }
}

export function getTaskOutputImageZipEntries(
  tasks: TaskOutputZipTask[]
): DownloadImageZipEntry[] {
  return [...tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((task) =>
      getImageZipEntries(task.outputImages || [], `task-${task.id}`)
    )
}

export function getImageZipEntries(
  imageIds: string[],
  fileNameBase = 'image'
): DownloadImageZipEntry[] {
  return imageIds.map((imageId, index) => ({
    imageId,
    fileNameBase: getNumberedFileNameBase(fileNameBase, index, imageIds.length),
  }))
}

interface ResolvedImageSource {
  remote: boolean
  src: string
  blob?: Blob
}

async function resolveImageSource(
  imageIdOrUrl: string
): Promise<ResolvedImageSource> {
  let src = imageIdOrUrl
  if (
    !imageIdOrUrl.startsWith('data:') &&
    !imageIdOrUrl.startsWith('http://') &&
    !imageIdOrUrl.startsWith('https://')
  ) {
    src = (await ensureImageCached(imageIdOrUrl)) ?? imageIdOrUrl
  }

  if (isRemoteImageUrl(src)) return { remote: true, src }

  const res = await fetch(src)
  if (!res.ok && !src.startsWith('data:')) {
    throw new Error(`读取图片失败：${imageIdOrUrl}`)
  }
  return { remote: false, src, blob: await res.blob() }
}

function isRemoteImageUrl(src: string) {
  return /^https?:\/\//i.test(src)
}

function triggerSourceDownload(source: ResolvedImageSource, fileName: string) {
  if (source.remote) {
    triggerDirectDownload(source.src, fileName)
    return
  }
  if (!source.blob) throw new Error(`读取图片失败：${source.src}`)
  triggerDownload(source.blob, fileName)
}

function triggerDirectDownload(src: string, fileName: string) {
  const a = document.createElement('a')
  a.href = src
  a.download = fileName
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function getImageExtension(source: ResolvedImageSource): string {
  if (source.blob) return getBlobExtension(source.blob)

  try {
    const pathname = new URL(source.src).pathname
    const extension = pathname.split('.').pop()?.toLowerCase()
    if (extension && /^[a-z0-9]{2,5}$/.test(extension)) return extension
  } catch {
    // URL 格式异常时使用默认扩展名。
  }
  return 'png'
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function getBlobExtension(blob: Blob): string {
  return (
    MIME_EXTENSIONS[blob.type.toLowerCase()] ?? blob.type.split('/')[1] ?? 'png'
  )
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
