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

describe('图片生成页的模型分组选择', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.apiGet.mockReset()
    mocks.setNewApiSelection.mockReset()
    mocks.setSettings.mockReset()
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

  test('遍历全部 Key 后默认选择第一个支持 gpt-image-2 的 Key 和模型', async () => {
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
                ? [{ id: 'gpt-image-2', group: 'image' }]
                : [{ id: 'image-default', group: 'default' }],
          },
        })
      }
    )

    render(<NewApiSelection />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-key')).toHaveTextContent('8')
      expect(screen.getByTestId('selected-model')).toHaveTextContent(
        'image\x00gpt-image-2'
      )
    })
    expect(screen.getByTestId('visible-models')).toHaveTextContent(
      'gpt-image-2'
    )
    expect(mocks.setNewApiSelection).toHaveBeenCalledWith({
      keyId: 8,
      model: 'gpt-image-2',
      group: 'image',
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/token/', {
      params: { p: 2, size: 100 },
    })
  })

  test('多个 Key 都支持 gpt-image-2 时按 Key 原始顺序选择第一个', async () => {
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
                id: 'gpt-image-2',
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
        '7\x00gpt-image-2'
      )
    })
  })

  test('没有 gpt-image-2 时保持空选择，并允许手动选择 Key 和模型', async () => {
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
        'image-default'
      )
    })
    expect(screen.getByTestId('selected-model')).toBeEmptyDOMElement()

    fireEvent.click(screen.getByRole('button', { name: 'image-default' }))

    await waitFor(() => {
      expect(mocks.setNewApiSelection).toHaveBeenCalledWith({
        keyId: 7,
        model: 'image-default',
        group: 'default',
      })
    })
  })
})
