import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { DEFAULT_PARAMS } from '../../types'
import { callImageApi } from '../api'
import { DEFAULT_SETTINGS } from '../apiProfiles'
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
      clientTaskId: 'local-task-123',
      prompt: 'a test image',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toBe('/api/creative/images')
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      key_id: 17,
      client_task_id: 'local-task-123',
      model: 'vendor-image-model',
      group: 'premium',
    })
  })

  it('没有选择模型时在发送请求前终止', async () => {
    const post = vi.spyOn(api, 'post')
    setNewApiSelection(null)

    await expect(
      callImageApi({
        settings: {
          ...DEFAULT_SETTINGS,
          activeProfileId: 'newapi',
          baseUrl: '/api/creative',
          apiKey: '',
          model: '',
          profiles: [
            {
              ...DEFAULT_SETTINGS.profiles[0],
              id: 'newapi',
              name: 'NewAPI',
              baseUrl: '/api/creative',
              apiKey: '',
              model: '',
              provider: 'openai',
              apiMode: 'images',
            },
          ],
        },
        clientTaskId: 'local-task-without-model',
        prompt: 'a test image',
        params: { ...DEFAULT_PARAMS },
        inputImageDataUrls: [],
      })
    ).rejects.toThrow('请选择 API Key 和模型')
    expect(post).not.toHaveBeenCalled()
  })

  it('优先显示 NewAPI 返回的嵌套错误 message', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: {
            error: {
              code: 'upstream_text_reply',
              message: '生成的图片可能违反内容安全限制。',
            },
          },
        },
      })
    )
    setNewApiSelection({
      keyId: 17,
      model: 'vendor-image-model',
      group: 'premium',
    })

    await expect(
      callImageApi({
        settings: {
          ...DEFAULT_SETTINGS,
          activeProfileId: 'newapi',
          baseUrl: '/api/creative',
        },
        clientTaskId: 'local-task-error-message',
        prompt: 'a test image',
        params: { ...DEFAULT_PARAMS },
        inputImageDataUrls: [],
      })
    ).rejects.toThrow('生成的图片可能违反内容安全限制。')
    expect(post.mock.calls[0]?.[2]).toMatchObject({ skipErrorHandler: true })
  })

  it('没有返回 message 时保留原始错误', async () => {
    const error = new Error('Request failed with status code 400')
    vi.spyOn(api, 'post').mockRejectedValue(error)
    setNewApiSelection({
      keyId: 17,
      model: 'vendor-image-model',
      group: 'premium',
    })

    await expect(
      callImageApi({
        settings: {
          ...DEFAULT_SETTINGS,
          activeProfileId: 'newapi',
          baseUrl: '/api/creative',
        },
        clientTaskId: 'local-task-original-error',
        prompt: 'a test image',
        params: { ...DEFAULT_PARAMS },
        inputImageDataUrls: [],
      })
    ).rejects.toThrow('Request failed with status code 400')
  })
})
