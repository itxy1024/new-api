import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadImageEntriesAsZip, downloadImageIds } from '../downloadImages'

const imageCache = vi.hoisted(() => ({
  ensureImageCached: vi.fn(),
}))

vi.mock('../imageCache', () => imageCache)

interface DownloadClick {
  href: string
  download: string
  target: string
  rel: string
}

describe('downloadImages', () => {
  const clicks: DownloadClick[] = []

  beforeEach(() => {
    clicks.length = 0
    imageCache.ensureImageCached.mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        clicks.push({
          href: this.href,
          download: this.download,
          target: this.target,
          rel: this.rel,
        })
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('远程 OSS 图片直接交给浏览器下载且不发起跨域 fetch', async () => {
    const imageUrl =
      'https://bucket.oss-cn-shanghai.aliyuncs.com/creative/image-1.png'

    await expect(downloadImageIds([imageUrl], 'task-1')).resolves.toEqual({
      successCount: 1,
      failCount: 0,
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(clicks).toEqual([
      {
        href: imageUrl,
        download: 'task-1.png',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ])
  })

  it('本地缓存图片仍通过 Blob 下载', async () => {
    vi.useFakeTimers()
    const blob = new Blob(['image'], { type: 'image/webp' })
    imageCache.ensureImageCached.mockResolvedValue(
      'data:image/webp;base64,eA=='
    )
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
    } as unknown as Response)
    const createObjectURL = vi.fn().mockReturnValue('blob:local-image')
    const revokeObjectURL = vi.fn()
    const NativeURL = URL
    class MockURL extends NativeURL {}
    MockURL.createObjectURL = createObjectURL
    MockURL.revokeObjectURL = revokeObjectURL
    vi.stubGlobal('URL', MockURL)

    await expect(downloadImageIds(['cached-image'], 'task-2')).resolves.toEqual(
      {
        successCount: 1,
        failCount: 0,
      }
    )

    expect(fetch).toHaveBeenCalledWith('data:image/webp;base64,eA==')
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicks[0]).toMatchObject({
      href: 'blob:local-image',
      download: 'task-2.webp',
      target: '',
    })
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-image')
  })

  it('远程图片批量压缩下载降级为逐张直链下载', async () => {
    const first = 'https://oss.example.com/creative/first.png'
    const second = 'https://oss.example.com/creative/second.jpg'

    await expect(
      downloadImageEntriesAsZip(
        [
          { imageId: first, fileNameBase: 'first' },
          { imageId: second, fileNameBase: 'second' },
        ],
        'task-images'
      )
    ).resolves.toEqual({ successCount: 2, failCount: 0 })

    expect(fetch).not.toHaveBeenCalled()
    expect(clicks.map(({ href, download }) => ({ href, download }))).toEqual([
      { href: first, download: 'first.png' },
      { href: second, download: 'second.jpg' },
    ])
  })
})
