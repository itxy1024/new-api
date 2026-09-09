/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ModelGroupSelector } from '@/components/model-group-selector'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  setNewApiSelection: vi.fn(),
  setSettings: vi.fn(),
  settings: {
    profiles: [
      {
        id: 'default',
        name: 'Default',
        provider: 'openai',
        baseUrl: '',
        apiKey: '',
        model: '',
        timeout: 600,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
        transparentBackgroundMethod: 'api',
      },
    ],
    activeProfileId: 'default',
    baseUrl: '',
    apiKey: '',
    model: '',
    apiMode: 'images',
  },
}))

vi.mock('@/lib/api', () => ({ api: { get: mocks.apiGet } }))

vi.mock('../lib/newApiSelection', () => ({
  setNewApiSelection: mocks.setNewApiSelection,
}))

vi.mock('../store', () => {
  const state = {
    settings: mocks.settings,
    setSettings: mocks.setSettings,
    showToast: vi.fn(),
  }
  const useStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state }
  )
  return { useStore }
})

vi.mock('@/components/model-group-selector', () => ({
  ModelGroupSelector: (props: ComponentProps<typeof ModelGroupSelector>) => (
    <div>
      <output data-testid='selected-key'>{props.selectedGroup}</output>
      <output data-testid='selected-model'>{props.selectedModel}</output>
      <output data-testid='selector-disabled'>{String(props.disabled)}</output>
      <output data-testid='visible-models'>
        {props.models.map((model) => model.label).join(',')}
      </output>
      {props.groups.map((group) => (
        <button
          key={group.value}
          onClick={() => props.onGroupChange(group.value)}
          type='button'
        >
          {group.label}
        </button>
      ))}
      {props.models.map((model) => (
        <button
          key={model.value}
          onClick={() => props.onModelChange(model.value)}
          type='button'
        >
          {model.label}
        </button>
      ))}
    </div>
  ),
}))

const { default: NewApiSelection } = await import('../NewApiSelection')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

describe('图片生成页的模型分组选择', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.apiGet.mockReset()
    mocks.setNewApiSelection.mockReset()
    mocks.setSettings.mockReset()
    mocks.apiGet.mockImplementation(
      (url: string, config?: { params?: { key_id?: string } }) => {
        if (url === '/api/user/self/groups') {
          return Promise.resolve({
            data: { data: { default: { desc: '默认分组', ratio: 1 } } },
          })
        }
        if (url === '/api/token/') {
          return Promise.resolve({
            data: {
              data: {
                items: [
                  { id: 7, name: '绘图 Key', status: 1 },
                  { id: 8, name: '备用 Key', status: 1 },
                ],
              },
            },
          })
        }
        const keyId = String(config?.params?.key_id)
        return Promise.resolve({
          data: {
            data:
              keyId === '8'
                ? [{ id: 'image-backup', group: 'backup' }]
                : [{ id: 'image-default', group: 'default' }],
          },
        })
      }
    )
  })

  afterEach(cleanup)

  test('遍历全部 Key 后默认选择第一个模型名称包含 image 的 Key 和模型', async () => {
    mocks.apiGet.mockImplementation(
      (url: string, config?: { params?: { key_id?: string; p?: number } }) => {
        if (url === '/api/token/') {
          if (config?.params?.p === 2) {
            return Promise.resolve({
              data: {
                data: {
                  items: [{ id: 8, name: '备用 Key', status: 1 }],
                  total: 101,
                },
              },
            })
          }
          return Promise.resolve({
            data: {
              data: {
                items: [{ id: 7, name: '绘图 Key', status: 1 }],
                total: 101,
              },
            },
          })
        }
        const keyId = String(config?.params?.key_id)
        return Promise.resolve({
          data: {
            data:
              keyId === '8'
                ? [{ id: 'vendor-image-v2', group: 'image' }]
                : [{ id: 'text-default', group: 'default' }],
          },
        })
      }
    )

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-key')).toHaveTextContent('8')
      expect(screen.getByTestId('selected-model')).toHaveTextContent(
        'image\x00vendor-image-v2'
      )
    })
    expect(screen.getByTestId('visible-models')).toHaveTextContent(
      'vendor-image-v2'
    )
    expect(mocks.setNewApiSelection).toHaveBeenCalledWith({
      keyId: 8,
      model: 'vendor-image-v2',
      group: 'image',
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/token/', {
      params: { p: 2, size: 100 },
    })
  })

  test('多个 Key 都有名称包含 image 的模型时按 Key 原始顺序选择第一个', async () => {
    mocks.apiGet.mockImplementation(
      (url: string, config?: { params?: { key_id?: string } }) => {
        if (url === '/api/token/') {
          return Promise.resolve({
            data: {
              data: {
                items: [
                  { id: 7, name: '绘图 Key', status: 1 },
                  { id: 8, name: '备用 Key', status: 1 },
                ],
                total: 2,
              },
            },
          })
        }
        return Promise.resolve({
          data: {
            data: [
              {
                id:
                  String(config?.params?.key_id) === '7'
                    ? 'VENDOR-IMAGE-A'
                    : 'vendor-image-b',
                group: String(config?.params?.key_id),
              },
            ],
          },
        })
      }
    )

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-key')).toHaveTextContent('7')
      expect(screen.getByTestId('selected-model')).toHaveTextContent(
        '7\x00VENDOR-IMAGE-A'
      )
    })
  })

  test('没有名称包含 image 的模型时保持空选择，并允许手动选择 Key 和模型', async () => {
    mocks.apiGet.mockImplementation(
      (url: string, config?: { params?: { key_id?: string } }) => {
        if (url === '/api/token/') {
          return Promise.resolve({
            data: {
              data: {
                items: [
                  { id: 7, name: '绘图 Key', status: 1 },
                  { id: 8, name: '备用 Key', status: 1 },
                ],
              },
            },
          })
        }
        const keyId = String(config?.params?.key_id)
        return Promise.resolve({
          data: {
            data: [
              {
                id: keyId === '8' ? 'vision-backup' : 'vision-default',
                group: keyId === '8' ? 'backup' : 'default',
              },
            ],
          },
        })
      }
    )

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '绘图 Key' })).toBeEnabled()
    })
    expect(screen.getByTestId('selected-key')).toBeEmptyDOMElement()
    expect(screen.getByTestId('selected-model')).toBeEmptyDOMElement()
    expect(screen.getByTestId('selector-disabled')).toHaveTextContent('false')
    expect(mocks.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        activeProfileId: 'newapi',
        apiKey: '',
        model: '',
      })
    )

    fireEvent.click(screen.getByRole('button', { name: '绘图 Key' }))

    await waitFor(() => {
      expect(screen.getByTestId('selected-key')).toHaveTextContent('7')
      expect(screen.getByTestId('visible-models')).toHaveTextContent(
        'vision-default'
      )
    })
    expect(screen.getByTestId('selected-model')).toBeEmptyDOMElement()

    fireEvent.click(screen.getByRole('button', { name: 'vision-default' }))

    await waitFor(() => {
      expect(mocks.setNewApiSelection).toHaveBeenCalledWith({
        keyId: 7,
        model: 'vision-default',
        group: 'default',
      })
    })
  })

  test('Key 列表返回后立即可选，不等待后台模型扫描完成', async () => {
    const pendingModels = deferred<{ data: { data: ModelOptionFixture[] } }>()
    mocks.apiGet.mockImplementation((url: string) =>
      url === '/api/token/'
        ? Promise.resolve({
            data: {
              data: {
                items: [{ id: 7, name: '绘图 Key', status: 1 }],
                total: 1,
              },
            },
          })
        : pendingModels.promise
    )

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '绘图 Key' })).toBeEnabled()
    })
    expect(screen.getByTestId('selected-key')).toBeEmptyDOMElement()

    pendingModels.resolve({ data: { data: [] } })
  })

  test('后台默认扫描最多同时请求四个 Key 的模型', async () => {
    const pendingRequests: Array<ReturnType<typeof deferred<ModelResponse>>> =
      []
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/api/token/') {
        return Promise.resolve({
          data: {
            data: {
              items: Array.from({ length: 6 }, (_, index) => ({
                id: index + 1,
                name: `Key ${index + 1}`,
                status: 1,
              })),
              total: 6,
            },
          },
        })
      }
      const request = deferred<ModelResponse>()
      pendingRequests.push(request)
      return request.promise
    })

    render(<NewApiSelection />)

    await waitFor(() => expect(pendingRequests).toHaveLength(4))
    pendingRequests[0].resolve({ data: { data: [] } })
    await waitFor(() => expect(pendingRequests).toHaveLength(5))

    for (const request of pendingRequests) {
      request.resolve({ data: { data: [] } })
    }
  })

  test('用户手动选择后不被迟到的默认模型扫描覆盖', async () => {
    const key7Models = deferred<ModelResponse>()
    const key8Models = deferred<ModelResponse>()
    mocks.apiGet.mockImplementation(
      (url: string, config?: { params?: { key_id?: string } }) => {
        if (url === '/api/token/') {
          return Promise.resolve({
            data: {
              data: {
                items: [
                  { id: 7, name: '绘图 Key', status: 1 },
                  { id: 8, name: '备用 Key', status: 1 },
                ],
                total: 2,
              },
            },
          })
        }
        return String(config?.params?.key_id) === '7'
          ? key7Models.promise
          : key8Models.promise
      }
    )

    render(<NewApiSelection />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '备用 Key' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: '备用 Key' }))
    key8Models.resolve({
      data: { data: [{ id: 'image-backup', group: 'backup' }] },
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'image-backup' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'image-backup' }))

    key7Models.resolve({
      data: { data: [{ id: 'gpt-image-2', group: 'image' }] },
    })
    await waitFor(() => {
      expect(screen.getByTestId('selected-key')).toHaveTextContent('8')
      expect(screen.getByTestId('selected-model')).toHaveTextContent(
        'backup\x00image-backup'
      )
    })
  })

  test('模型接口确认 Key 分组不可用时从选择器移除该 Key', async () => {
    mocks.apiGet.mockImplementation(
      (url: string, config?: { params?: { key_id?: string } }) => {
        if (url === '/api/token/') {
          return Promise.resolve({
            data: {
              data: {
                items: [
                  { id: 7, name: '失效 Key', status: 1 },
                  { id: 8, name: '可用 Key', status: 1 },
                ],
                total: 2,
              },
            },
          })
        }
        if (String(config?.params?.key_id) === '7') {
          return Promise.reject({
            response: {
              data: {
                error: {
                  message: 'creative key group is not available for this user',
                },
              },
            },
          })
        }
        return Promise.resolve({
          data: { data: [{ id: 'image-default', group: 'default' }] },
        })
      }
    )

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: '失效 Key' })
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '可用 Key' })).toBeEnabled()
  })

  test('不展示也不请求当前账号不可用分组对应的 Key', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/api/user/self/groups') {
        return Promise.resolve({
          data: { data: { default: { desc: '默认分组', ratio: 1 } } },
        })
      }
      if (url === '/api/token/') {
        return Promise.resolve({
          data: {
            data: {
              items: [
                {
                  group: 'retired',
                  groups: ['retired'],
                  id: 7,
                  name: '失效分组 Key',
                  status: 1,
                },
                {
                  group: 'default',
                  groups: ['default'],
                  id: 8,
                  name: '可用 Key',
                  status: 1,
                },
              ],
              total: 2,
            },
          },
        })
      }
      return Promise.resolve({
        data: { data: [{ id: 'image-default', group: 'default' }] },
      })
    })

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '可用 Key' })).toBeEnabled()
    })
    expect(
      screen.queryByRole('button', { name: '失效分组 Key' })
    ).not.toBeInTheDocument()
    expect(mocks.apiGet).not.toHaveBeenCalledWith(
      '/api/creative/models',
      expect.objectContaining({ params: { key_id: '7' } })
    )
  })
})

type ModelOptionFixture = { id: string; group?: string }
type ModelResponse = { data: { data: ModelOptionFixture[] } }
