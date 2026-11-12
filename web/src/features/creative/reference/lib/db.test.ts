import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}))

import { DEFAULT_PARAMS, type TaskRecord } from '../types'
import * as db from './db'
import * as indexedDbBackend from './dbIndexedDb'
import * as imageBlob from './imageBlob'

describe('db 门面（网页版）', () => {
  afterEach(() => vi.restoreAllMocks())

  it('底层存取全部使用 IndexedDB 实现', () => {
    const exports = new Map(Object.entries(db))
    for (const [name, fn] of Object.entries(indexedDbBackend)) {
      if (name === 'getAllTasks') continue
      expect(exports.get(name), name).toBe(fn)
    }
  })

  it('读取旧任务时补全 GIF 帧参数', async () => {
    const oldParams = {
      ...DEFAULT_PARAMS,
      complexity: undefined,
      frame_count: null,
      frame_duration_ms: 120,
    }
    vi.spyOn(indexedDbBackend, 'getAllTasks').mockResolvedValue([
      { id: 'old', params: oldParams } as unknown as TaskRecord,
    ])

    const [task] = await db.getAllTasks()
    expect(task.params).toMatchObject({
      complexity: 'auto',
      frame_count: 9,
      frame_duration_ms: 120,
    })
  })

  it.each([
    { id: 'blob', blob: new Blob([new Uint8Array(2048)]) },
    { id: 'legacy', dataUrl: 'data:image/png;base64,AQIDBA==' },
    { id: 'saved', byteSize: 4096, dataUrl: 'invalid' },
  ])('读取 $id 原图元数据时恢复实际字节数', async (record) => {
    vi.spyOn(imageBlob, 'getStoredImageRecord').mockResolvedValue(record)
    const expected = { blob: 2048, legacy: 4, saved: 4096 }
    expect((await db.getImageMeta(record.id))?.byteSize).toBe(
      expected[record.id as keyof typeof expected]
    )
  })

  it('旧图片内容无效时仍返回尺寸，不伪造文件大小', async () => {
    vi.spyOn(imageBlob, 'getStoredImageRecord').mockResolvedValue({
      id: 'broken',
      dataUrl: 'invalid',
      width: 1024,
      height: 768,
    })
    expect(await db.getImageMeta('broken')).toMatchObject({
      width: 1024,
      height: 768,
    })
    expect((await db.getImageMeta('broken'))?.byteSize).toBeUndefined()
  })
})
