import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { DEFAULT_PARAMS } from '../../types'
import { DEFAULT_SETTINGS } from '../apiProfiles'
import { callImageApi } from '../api'
import { setNewApiSelection } from '../newApiSelection'

describe('NewAPI 图片请求', () => {
  afterEach(() => {
    setNewApiSelection(null)
    vi.restoreAllMocks()
  })

  it('始终使用当前选择的 Key、模型和分组构造请求体', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: [{ b64_json: 'aW1hZ2U=' }] },
    } as never)
    setNewApiSelection({
      keyId: 17,
      model: 'vendor-image-model',
      group: 'premium',
    })

    await callImageApi({
      settings: {
        ...DEFAULT_SETTINGS,
        activeProfileId: 'newapi',
        baseUrl: '/api/creative',
        apiKey: '17',
        model: 'vendor-image-model',
        profiles: [
          {
            ...DEFAULT_SETTINGS.profiles[0],
            id: 'newapi',
            name: 'NewAPI',
            baseUrl: '/api/creative',
            apiKey: '17',
            model: 'vendor-image-model',
            provider: 'openai',
            apiMode: 'images',
          },
        ],
      },
      prompt: 'a test image',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toBe('/api/creative/images')
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      key_id: 17,
      model: 'vendor-image-model',
      group: 'premium',
    })
  })
})
