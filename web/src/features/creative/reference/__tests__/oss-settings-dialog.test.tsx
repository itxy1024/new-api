import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  testConfig: vi.fn(),
  updateConfig: vi.fn(),
  success: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.success },
}))

vi.mock('../lib/creativeStorage', () => ({
  getCreativeStorageConfig: mocks.getConfig,
  testCreativeStorageConfig: mocks.testConfig,
  updateCreativeStorageConfig: mocks.updateConfig,
}))

const { default: OssSettingsDialog } =
  await import('../components/OssSettingsDialog')

describe('OSS 设置弹窗', () => {
  let initialKeyword = ''

  beforeEach(() => {
    initialKeyword = useStore.getState().settings.defaultImageModelKeyword
    mocks.getConfig.mockResolvedValue({
      enabled: true,
      endpoint: 'https://oss.example.com',
      bucket: 'creative-assets',
      region: 'cn-test-1',
      prefix: 'newapi',
      path_style: false,
      presign_ttl_seconds: 900,
      access_key_configured: true,
      secret_key_configured: true,
    })
    mocks.testConfig.mockResolvedValue(undefined)
    mocks.updateConfig.mockResolvedValue(undefined)
  })

  afterEach(() => {
    useStore.getState().setSettings({
      defaultImageModelKeyword: initialKeyword,
    })
    cleanup()
    vi.clearAllMocks()
  })

  it('不回显密钥，并使用当前表单测试和保存配置', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<OssSettingsDialog open onOpenChange={onOpenChange} />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible()
    const storageNavigation = screen.getByRole('navigation', {
      name: 'Settings',
    })
    expect(storageNavigation).toHaveClass('sm:w-48')
    expect(
      screen.getByRole('button', { name: 'Basic settings' })
    ).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Test connection' })
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })
    const keywordInput = screen.getByLabelText('Default image model keyword')
    await user.clear(keywordInput)
    await user.type(keywordInput, 'vision')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1))
    expect(useStore.getState().settings.defaultImageModelKeyword).toBe('vision')
    expect(mocks.updateConfig).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith('Saved successfully')
    const storageButton = screen.getByRole('button', {
      name: 'Storage management',
    })
    expect(storageButton).not.toHaveAttribute('aria-current', 'page')
    await user.click(storageButton)
    expect(storageButton).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('button', { name: 'Test connection' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Storage management' })
    ).toBeVisible()

    const endpoint = await screen.findByLabelText('Endpoint')
    expect(screen.getByLabelText('Access Key')).toHaveValue('')
    expect(screen.getByLabelText('Secret Key')).toHaveValue('')
    expect(
      screen.queryByLabelText('Presigned URL validity (seconds)')
    ).not.toBeInTheDocument()

    await user.clear(endpoint)
    await user.type(endpoint, 'https://new-oss.example.com')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    await waitFor(() => {
      expect(mocks.testConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://new-oss.example.com',
          access_key: '',
          secret_key: '',
          path_style: false,
        })
      )
    })

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(mocks.updateConfig).toHaveBeenCalledTimes(1)
      expect(mocks.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          bucket: 'creative-assets',
          region: 'cn-test-1',
        })
      )
      expect(onOpenChange).not.toHaveBeenCalled()
    })
  })
})
