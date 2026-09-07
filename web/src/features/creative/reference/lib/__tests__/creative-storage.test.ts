import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CreativeGenerationRecord } from '../creativeStorage'

const apiMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: apiMocks,
}))

const {
  creativeGenerationToTask,
  deleteCreativeGenerationByClientTaskId,
  listCreativeImageGenerations,
} = await import('../creativeStorage')

const generation: CreativeGenerationRecord = {
  id: 91,
  client_task_id: 'browser-task-91',
  token_id: 17,
  provider_task_id: '',
  media_type: 'image',
  model: 'gpt-image-1',
  group: 'premium',
  prompt: 'draw a lighthouse',
  request_params: JSON.stringify({
    size: '1536x1024',
    quality: 'high',
    output_format: 'webp',
    output_compression: 80,
    n: 1,
  }),
  status: 'completed',
  elapsed_ms: 4200,
  error_message: '',
  created_at: 100,
  finished_at: 105,
  assets: [
    {
      id: 12,
      asset_key: 'image-1',
      content_url: '/api/creative/generations/91/assets/12/content',
      mime_type: 'image/webp',
      byte_size: 2048,
      width: 1536,
      height: 1024,
      duration_ms: 0,
    },
  ],
}

describe('创作结果持久化接口', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('将当前用户的服务端图片记录还原为画廊任务', () => {
    const task = creativeGenerationToTask(
      generation,
      ['indexed-db-image-id'],
      '小鱼中转站'
    )

    expect(task).toMatchObject({
      id: 'browser-task-91',
      apiProfileId: 'newapi',
      apiProfileName: '小鱼中转站',
      apiModel: 'gpt-image-1',
      newApiKeyId: 17,
      newApiGroup: 'premium',
      outputImages: ['indexed-db-image-id'],
      status: 'done',
      elapsed: 4200,
      params: {
        size: '1536x1024',
        quality: 'high',
        output_format: 'webp',
        output_compression: 80,
        n: 1,
      },
    })
    expect(task.actualParamsByImage?.['indexed-db-image-id']).toEqual({
      size: '1536x1024',
    })
  })

  it('只查询图片记录并限制恢复数量', async () => {
    apiMocks.get.mockResolvedValue({ data: { data: [generation] } })

    await expect(listCreativeImageGenerations()).resolves.toEqual([generation])
    expect(apiMocks.get).toHaveBeenCalledWith('/api/creative/generations', {
      params: { media_type: 'image', limit: 100 },
      skipErrorHandler: true,
    })
  })

  it('服务端已没有记录时仍允许清理本地任务', async () => {
    apiMocks.delete.mockRejectedValue({ response: { status: 404 } })

    await expect(
      deleteCreativeGenerationByClientTaskId('browser/task 91')
    ).resolves.toBeUndefined()
    expect(apiMocks.delete).toHaveBeenCalledWith(
      '/api/creative/generations/client/browser%2Ftask%2091',
      { skipErrorHandler: true }
    )
  })
})
