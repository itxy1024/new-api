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

vi.mock('../components/Select', () => ({
  default: (props: {
    ariaLabel?: string
    disabled?: boolean
    onChange: (value: string) => void
    options: Array<{ label: string; value: string }>
    value: string
  }) => (
    <select
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
      value={props.value}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

vi.mock('@/components/model-group-selector', () => ({
  ModelGroupSelector: (props: ComponentProps<typeof ModelGroupSelector>) => (
    <div>
      <output data-testid='selected-model'>{props.selectedModel}</output>
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
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/api/token/') {
        return Promise.resolve({
          data: { data: { items: [{ id: 7, name: '绘图 Key', status: 1 }] } },
        })
      }
      return Promise.resolve({
        data: {
          data: [
            { id: 'image-default', group: 'default' },
            { id: 'image-vip', group: 'vip' },
          ],
        },
      })
    })
  })

  afterEach(cleanup)

  test('切换分组时展示该组模型并自动选择首个模型', async () => {
    render(<NewApiSelection selectClass='' />)

    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent(
        'default\x00image-default'
      )
    })
    expect(screen.getByTestId('visible-models')).toHaveTextContent(
      'image-default'
    )

    fireEvent.click(screen.getByRole('button', { name: 'vip' }))

    expect(screen.getByTestId('selected-model')).toHaveTextContent(
      'vip\x00image-vip'
    )
    expect(screen.getByTestId('visible-models')).toHaveTextContent('image-vip')
    expect(screen.getByTestId('visible-models')).not.toHaveTextContent(
      'image-default'
    )
  })
})
