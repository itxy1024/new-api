/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { useSidebarData } from '@/hooks/use-sidebar-data'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ImageLogs } from '..'
import type { ImageLog, ImageLogFilters } from '../api'
import { ImageLogImages } from '../components/image-log-images'

const entry: ImageLog = {
  id: 9,
  user_id: 31,
  token_id: 17,
  client_task_id: 'task-9',
  provider_task_id: '',
  model: 'gpt-image',
  group: 'premium',
  prompt: 'lighthouse '.repeat(80),
  request_params: '{"size":"1024x1024"}',
  status: 'completed',
  elapsed_ms: 1234,
  error_message: '',
  created_at: '2026-11-12 15:30:00',
  finished_at: '2026-11-12 15:30:02',
  assets: [],
}

function setUser(role: number, read: boolean): void {
  useAuthStore.getState().auth.setUser({
    id: 2,
    username: 'admin',
    role,
    permissions: { admin_permissions: { image_log: { read } } },
  })
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ImageLogs />
    </QueryClientProvider>
  )
  return { ...view, client }
}

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  vi.unstubAllGlobals()
})

it.each([
  [1, true, false],
  [10, false, false],
  [10, true, true],
  [100, false, true],
])('角色 %s 授权 %s 时菜单可见性为 %s', (role, read, visible) => {
  setUser(role, read)
  const { result } = renderHook(() => useSidebarData())
  const items = result.current.navGroups.flatMap((group) => group.items)
  expect(
    items.some((item) => 'url' in item && item.url === '/usage-logs/image')
  ).toBe(visible)
  if (visible) {
    const audit = items.findIndex(
      (item) => 'url' in item && item.url === '/usage-logs/audit'
    )
    expect(items[audit + 1]).toMatchObject({ url: '/usage-logs/image' })
  }
})

it('无权限直接打开页面时拒绝显示且不请求日志', () => {
  setUser(10, false)
  const request = vi.spyOn(api, 'get')
  renderPage()
  expect(screen.getByText('Permission denied')).toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()
})

it('开发模式重新挂载时重新加载记录，不复用已取消的请求', async () => {
  setUser(10, true)
  const previousAdapter = api.defaults.adapter
  api.defaults.adapter = async (config) => ({
    data: { success: true, data: { items: [entry], total: 1 } },
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
  })
  try {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <ImageLogs />
        </QueryClientProvider>
      </StrictMode>
    )
    expect(await screen.findByText('gpt-image')).toBeInTheDocument()
    expect(
      screen.queryByText('Failed to load image generation logs')
    ).not.toBeInTheDocument()
  } finally {
    api.defaults.adapter = previousAdapter
  }
})

it('翻页请求服务端下一页，搜索时回到第一页并传递筛选参数', async () => {
  setUser(10, true)
  const request = vi
    .spyOn(api, 'get')
    .mockImplementation(async (_url, config) => ({
      data: {
        success: true,
        data: {
          items: [
            {
              ...entry,
              model:
                (config?.params as ImageLogFilters | undefined)?.p === 2
                  ? 'page-two'
                  : 'page-one',
            },
          ],
          total: 22,
        },
      },
    }))
  renderPage()
  await screen.findByText('page-one')
  await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
  await screen.findByText('page-two')
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'User ID' }),
    '38'
  )
  await userEvent.click(screen.getByRole('button', { name: /^Search$/ }))
  await screen.findByText('page-one')
  expect(request).toHaveBeenCalledWith(
    '/api/image-logs',
    expect.objectContaining({
      params: expect.objectContaining({ p: 1, page_size: 20, user_id: '38' }),
    })
  )
})

it('获授权后展示记录和参数详情，撤权后移除数据与缓存', async () => {
  setUser(10, true)
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [entry], total: 1 } },
  })
  const view = renderPage()
  await screen.findByText('gpt-image')
  expect(screen.getByText('No images')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Details' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('1024x1024')
  act(() => setUser(10, false))
  await screen.findByText('Permission denied')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(view.client.getQueriesData({ queryKey: ['image-logs'] })).toEqual([])
})

it('图片、文件大小与分辨率独立成列，多张产物按顺序显示，耗时使用秒', async () => {
  setUser(10, true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/image-logs') return { data: new Blob(['image']) }
    return {
      data: {
        success: true,
        data: {
          items: [
            {
              ...entry,
              elapsed_ms: 37864,
              assets: [
                {
                  id: 1,
                  content_url: '/api/image-logs/9/assets/1/content',
                  width: 1024,
                  height: 768,
                  byte_size: 2048,
                  mime_type: 'image/png',
                },
                {
                  id: 2,
                  content_url: '/api/image-logs/9/assets/2/content',
                  width: 512,
                  height: 512,
                  byte_size: 1048576,
                  mime_type: 'image/png',
                },
              ],
            },
          ],
          total: 1,
        },
      },
    }
  })
  renderPage()
  const row = await screen.findByRole('row', { name: /gpt-image/ })
  const headers = screen
    .getAllByRole('columnheader')
    .map((header) => header.textContent)
  const cells = within(row).getAllByRole('cell')
  expect(headers).toContain('File size')
  expect(headers).toContain('Resolution')
  const imageCell = cells[headers.indexOf('Images')]
  expect(
    within(imageCell).getAllByRole('button', { name: 'Preview image' })
  ).toHaveLength(2)
  expect(imageCell).not.toHaveTextContent('KB')
  expect(cells[headers.indexOf('File size')].textContent).toBe('2.0 KB1.0 MB')
  expect(cells[headers.indexOf('Resolution')].textContent).toBe(
    '1024 × 768512 × 512'
  )
  expect(cells[headers.indexOf('Elapsed time')]).toHaveTextContent('37.86 s')
})

it('未知分辨率和没有产物时显示占位，耗时零值仍以秒显示', async () => {
  setUser(10, true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/image-logs') return { data: new Blob(['image']) }
    return {
      data: {
        success: true,
        data: {
          items: [
            {
              ...entry,
              elapsed_ms: 0,
              assets: [
                {
                  id: 1,
                  content_url: '/api/image-logs/9/assets/1/content',
                  width: 0,
                  height: 0,
                  byte_size: 0,
                  mime_type: 'image/png',
                },
              ],
            },
            { ...entry, id: 10, model: 'empty-output' },
          ],
          total: 2,
        },
      },
    }
  })
  renderPage()
  const headers = screen
    .getAllByRole('columnheader')
    .map((header) => header.textContent)
  const cells = within(
    await screen.findByRole('row', { name: /gpt-image/ })
  ).getAllByRole('cell')
  expect(cells[headers.indexOf('Resolution')]).toHaveTextContent('-')
  expect(cells[headers.indexOf('File size')]).toHaveTextContent('0 B')
  expect(cells[headers.indexOf('Elapsed time')]).toHaveTextContent('0 s')
  const empty = within(
    screen.getByRole('row', { name: /empty-output/ })
  ).getAllByRole('cell')
  expect(empty[headers.indexOf('Resolution')]).toHaveTextContent('-')
  expect(empty[headers.indexOf('File size')]).toHaveTextContent('-')
})

it('提示词摘要悬停时展示包含末尾内容和换行的完整文本', async () => {
  setUser(10, true)
  const prompt = `${'长提示词 '.repeat(180)}\n末尾完整内容`
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [{ ...entry, prompt }], total: 1 } },
  })
  renderPage()
  const summary = await screen.findByText(prompt, {
    exact: true,
    normalizer: (text) => text,
  })
  await userEvent.hover(summary)
  await waitFor(() =>
    expect(
      screen.getAllByText(prompt, { exact: true, normalizer: (text) => text })
    ).toHaveLength(2)
  )
  const expanded = screen
    .getAllByText(prompt, { exact: true, normalizer: (text) => text })
    .find((element) => element !== summary)
  expect(expanded).toBeVisible()
  expect(expanded?.textContent).toBe(prompt)
})

it('服务端撤权返回 403 时清除菜单、旧数据和预览', async () => {
  setUser(10, true)
  const request = vi.spyOn(api, 'get').mockResolvedValueOnce({
    data: { success: true, data: { items: [entry], total: 1 } },
  })
  const view = renderPage()
  await screen.findByText('gpt-image')
  request.mockRejectedValue(
    new AxiosError('forbidden', undefined, undefined, undefined, {
      status: 403,
    } as never)
  )
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: ['image-logs'] })
  })
  await screen.findByText('Permission denied')
  expect(screen.queryByText('gpt-image')).not.toBeInTheDocument()
  expect(
    useAuthStore.getState().auth.user?.permissions?.admin_permissions?.image_log
      ?.read
  ).toBe(false)
})

it('空列表和加载失败分别显示空状态与重试入口', async () => {
  setUser(10, true)
  const request = vi.spyOn(api, 'get').mockResolvedValueOnce({
    data: { success: true, data: { items: [], total: 0 } },
  })
  const view = renderPage()
  await screen.findByText('No records')
  request.mockRejectedValue(new Error('offline'))
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: ['image-logs'] })
  })
  expect(
    await screen.findByRole('button', { name: 'Retry' })
  ).toBeInTheDocument()
})

it('图片通过认证 API 加载，点击放大、Esc 关闭，卸载释放 Blob', async () => {
  const create = vi.fn(() => 'blob:image-log')
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    }
  )
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: new Blob(['image'], { type: 'image/png' }) })
  const view = render(
    <ImageLogImages
      assets={[
        {
          id: 1,
          content_url: '/api/image-logs/9/assets/1/content',
          width: 1024,
          height: 1024,
          byte_size: 2048,
          mime_type: 'image/png',
        },
      ]}
      onAccessDenied={vi.fn()}
    />
  )
  const preview = await screen.findByRole('button', { name: 'Preview image' })
  await waitFor(() => expect(preview).toBeEnabled())
  expect(request).toHaveBeenCalledWith(
    '/api/image-logs/9/assets/1/content',
    expect.objectContaining({ responseType: 'blob' })
  )
  expect(screen.queryByText('2.0 KB')).not.toBeInTheDocument()
  await userEvent.click(preview)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('1024 × 1024 · 2.0 KB')
  expect(dialog.querySelector('img')).toHaveAttribute('src', 'blob:image-log')
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:image-log')
})

it('图片加载失败允许重试，图片接口 403 通知页面撤权', async () => {
  const denied = vi.fn()
  vi.spyOn(api, 'get').mockRejectedValue(
    new AxiosError('forbidden', undefined, undefined, undefined, {
      status: 403,
    } as never)
  )
  render(
    <ImageLogImages
      assets={[
        {
          id: 1,
          content_url: '/api/image-logs/9/assets/1/content',
          width: 0,
          height: 0,
          byte_size: 0,
          mime_type: 'image/png',
        },
      ]}
      onAccessDenied={denied}
    />
  )
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(denied).toHaveBeenCalled()
})
