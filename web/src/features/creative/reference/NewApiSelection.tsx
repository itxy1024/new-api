/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 * 这里只保留 NewAPI 的 Key 和模型选择，不在浏览器保存或展示真实厂商密钥。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '@/lib/api'
import { getBuildRevision } from '@/lib/build-metadata'

import { CloseIcon } from './components/icons'
import Select from './components/Select'
import { useCloseOnEscape } from './hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from './hooks/usePreventBackgroundScroll'
import { setNewApiSelection } from './lib/newApiSelection'
import { useStore } from './store'

type KeyOption = { id: number; name?: string; status?: number }
type ModelOption = { id: string; group?: string }

function getKeyLabel(item: KeyOption): string {
  return item.name?.trim() || '未命名 Key'
}

function getModelValue(item: ModelOption): string {
  return item.group ? `${item.group}\x00${item.id}` : item.id
}

function getModelLabel(item: ModelOption): string {
  return item.id
}

export default function NewApiSelection() {
  const showSettings = useStore((state) => state.showSettings)
  const setShowSettings = useStore((state) => state.setShowSettings)
  const setSettings = useStore((state) => state.setSettings)
  const [keys, setKeys] = useState<KeyOption[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [keyId, setKeyId] = useState('')
  const [model, setModel] = useState('')
  const [group, setGroup] = useState('')
  const lastProfileSignature = useRef('')
  const modelLoadingKeyId = useRef<string | null>(null)
  const appVersion = getBuildRevision().replace(/^rv\./, '')

  const selectedKey = useMemo(
    () => keys.find((item) => String(item.id) === keyId),
    [keyId, keys]
  )
  const selectedModelValue = group ? `${group}\x00${model}` : model

  useCloseOnEscape(showSettings, () => setShowSettings(false))
  usePreventBackgroundScroll(showSettings)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await api.get('/api/token/', {
          params: { p: 1, size: 100 },
        })
        if (!active) return
        const raw = response.data?.data?.items ?? response.data?.data ?? []
        const next = (Array.isArray(raw) ? raw : []).filter(
          (item: KeyOption) => Number(item.status) === 1
        )
        setKeys(next)
        const saved = window.localStorage.getItem('newapi-creative-key-id')
        setKeyId(
          saved && next.some((item) => String(item.id) === saved)
            ? saved
            : String(next[0]?.id ?? '')
        )
      } catch {
        if (active) useStore.getState().showToast('加载 API Key 失败', 'error')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!keyId) {
      setModels([])
      setModel('')
      setGroup('')
      setNewApiSelection(null)
      return
    }

    window.localStorage.setItem('newapi-creative-key-id', keyId)
    modelLoadingKeyId.current = keyId
    setNewApiSelection(null)
    // Key 切换后立即锁定 NewAPI 配置，模型加载期间禁止沿用旧的默认配置。
    const currentSettings = useStore.getState().settings
    const existingProfile = currentSettings.profiles.find(
      (profile) => profile.id === 'newapi'
    )
    const baseProfile = existingProfile ?? currentSettings.profiles[0]
    const pendingProfile = {
      ...baseProfile,
      id: 'newapi',
      name: 'NewAPI',
      provider: 'openai' as const,
      baseUrl: '/api/creative',
      apiKey: keyId,
      model: '',
      apiMode: 'images' as const,
      codexCli: false,
      apiProxy: false,
    }
    useStore.getState().setSettings({
      ...currentSettings,
      profiles: existingProfile
        ? currentSettings.profiles.map((profile) =>
            profile.id === 'newapi' ? pendingProfile : profile
          )
        : [...currentSettings.profiles, pendingProfile],
      activeProfileId: 'newapi',
      baseUrl: '/api/creative',
      apiKey: keyId,
      model: '',
      apiMode: 'images',
    })
    let active = true
    setModels([])
    setModel('')
    setGroup('')

    void (async () => {
      try {
        const response = await api.get('/api/creative/models', {
          params: { key_id: keyId },
        })
        if (!active) return
        const raw = response.data?.data ?? []
        const next = (Array.isArray(raw) ? raw : [])
          .map(
            (item: string | { id?: string; name?: string; group?: string }) =>
              typeof item === 'string'
                ? { id: item }
                : { id: item.id ?? item.name ?? '', group: item.group }
          )
          .filter((item): item is ModelOption => Boolean(item.id?.trim()))
        const savedModel =
          window.localStorage.getItem('newapi-creative-model') ?? ''
        const savedGroup =
          window.localStorage.getItem('newapi-creative-group') ?? ''
        const selected =
          next.find(
            (item) =>
              item.id === savedModel && (item.group ?? '') === savedGroup
          ) ?? next[0]
        modelLoadingKeyId.current = null
        setModels(next)
        setModel(selected?.id ?? '')
        setGroup(selected?.group ?? '')
      } catch {
        if (!active) return
        setModels([])
        setModel('')
        setGroup('')
        useStore.getState().showToast('加载创作模型失败', 'error')
      }
    })()

    return () => {
      active = false
    }
  }, [keyId])

  useEffect(() => {
    if (modelLoadingKeyId.current === keyId) return
    const profileSignature = `${keyId}\x00${model}\x00${group}`
    if (lastProfileSignature.current === profileSignature) return
    lastProfileSignature.current = profileSignature

    const parsedKeyId = Number(keyId)
    if (Number.isInteger(parsedKeyId) && parsedKeyId > 0 && model) {
      window.localStorage.setItem('newapi-creative-model', model)
      window.localStorage.setItem('newapi-creative-group', group)
      setNewApiSelection({ keyId: parsedKeyId, model, group })
    } else {
      setNewApiSelection(null)
      // Key 或模型仍在异步加载时，不要将空模型写回参考项目设置。
      return
    }

    // 使用当前 store 快照读取配置，避免把整个 settings 对象作为依赖。
    // setSettings 会返回新的 settings 对象，依赖它会在每次写入后再次触发本 effect。
    const currentProfile = useStore
      .getState()
      .settings.profiles?.find((profile) => profile.id === 'newapi')
    if (
      currentProfile?.id === 'newapi' &&
      currentProfile.apiKey === keyId &&
      currentProfile.model === model &&
      currentProfile.baseUrl === '/api/creative'
    ) {
      return
    }

    const profile = currentProfile ?? {
      id: 'newapi',
      name: 'NewAPI',
      provider: 'openai' as const,
      baseUrl: '',
      apiKey: '',
      model: '',
      timeout: 600,
      apiMode: 'images' as const,
      codexCli: false,
      apiProxy: false,
      transparentBackgroundMethod: 'api' as const,
    }
    const latestSettings = useStore.getState().settings
    const nextProfile = {
      ...profile,
      id: 'newapi',
      name: 'NewAPI',
      apiKey: keyId,
      model,
      provider: 'openai' as const,
      baseUrl: '/api/creative',
      apiMode: 'images' as const,
      codexCli: false,
      apiProxy: false,
    }
    const nextProfiles = latestSettings.profiles.some(
      (item) => item.id === 'newapi'
    )
      ? latestSettings.profiles.map((item) =>
          item.id === 'newapi' ? nextProfile : item
        )
      : [...latestSettings.profiles, nextProfile]
    setSettings({
      ...latestSettings,
      profiles: nextProfiles,
      activeProfileId: 'newapi',
      apiKey: keyId,
      model,
      baseUrl: '/api/creative',
      apiMode: 'images',
    })
  }, [group, keyId, model, setSettings])

  if (!showSettings) return null

  return createPortal(
    <div
      data-no-drag-select
      className='fixed inset-0 z-[100] flex items-center justify-center p-4'
      onClick={() => setShowSettings(false)}
    >
      <div className='animate-overlay-in absolute inset-0 bg-black/30 backdrop-blur-sm' />
      <div
        className='animate-modal-in relative z-10 flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 sm:h-[600px] dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10'
        onClick={(event) => event.stopPropagation()}
      >
        <div className='flex shrink-0 items-center justify-between border-b border-gray-100 p-5 dark:border-white/[0.08]'>
          <h3 className='flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100'>
            <svg
              className='h-5 w-5 text-blue-500'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.608-2.296.07-2.572-1.065a1.724 1.724 0 000-3.35c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
              />
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
              />
            </svg>
            设置
          </h3>
          <div className='flex items-center gap-3'>
            <span className='font-mono text-sm text-gray-400 select-none dark:text-gray-500'>
              v{appVersion}
            </span>
            <button
              type='button'
              onClick={() => setShowSettings(false)}
              className='rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200'
              aria-label='关闭'
            >
              <CloseIcon className='h-5 w-5' />
            </button>
          </div>
        </div>

        <div className='flex min-h-0 flex-1 flex-col sm:flex-row'>
          <div className='w-full shrink-0 border-b border-gray-100 bg-gray-50/50 sm:w-48 sm:border-r sm:border-b-0 dark:border-white/[0.08] dark:bg-white/[0.02]'>
            <nav className='p-3'>
              <div className='flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-blue-600 shadow-sm dark:bg-white/[0.08] dark:text-blue-400'>
                <svg
                  className='h-4 w-4'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                  aria-hidden='true'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z'
                  />
                </svg>
                API 配置
              </div>
            </nav>
          </div>

          <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <div className='flex-1 overflow-y-auto p-5 sm:p-6'>
              <div className='max-w-2xl space-y-5'>
                <div>
                  <h4 className='text-base font-semibold text-gray-800 dark:text-gray-100'>
                    NewAPI 创作配置
                  </h4>
                  <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                    选择当前账户的 Key 和可用模型
                  </p>
                </div>

                <label className='block text-sm'>
                  <span className='mb-2 block text-gray-600 dark:text-gray-300'>
                    API Key
                  </span>
                  <Select
                    value={keyId}
                    onChange={(value) => {
                      setKeyId(String(value))
                      setModel('')
                      setGroup('')
                    }}
                    options={keys.map((item) => ({
                      value: String(item.id),
                      label: getKeyLabel(item),
                    }))}
                    disabled={!keys.length}
                    showValueTooltips={false}
                    className='w-full rounded-xl border border-gray-200/60 bg-white/50 px-3 py-3 text-sm shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]'
                  />
                  {!selectedKey && (
                    <span className='mt-1.5 block text-xs text-amber-600 dark:text-amber-400'>
                      当前账户没有可用的 Key
                    </span>
                  )}
                </label>

                <label className='block text-sm'>
                  <span className='mb-2 block text-gray-600 dark:text-gray-300'>
                    模型
                  </span>
                  <Select
                    value={selectedModelValue}
                    onChange={(value) => {
                      const next = String(value)
                      const selected = models.find(
                        (item) => getModelValue(item) === next
                      )
                      setModel(selected?.id ?? next.split('\x00').pop() ?? '')
                      setGroup(selected?.group ?? '')
                    }}
                    options={models.map((item) => ({
                      value: getModelValue(item),
                      label: getModelLabel(item),
                    }))}
                    disabled={!models.length}
                    showValueTooltips={false}
                    className='w-full rounded-xl border border-gray-200/60 bg-white/50 px-3 py-3 text-sm shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]'
                  />
                  {!models.length && keyId && (
                    <span className='mt-1.5 block text-xs text-gray-500 dark:text-gray-400'>
                      此 Key 暂无可用模型
                    </span>
                  )}
                </label>
              </div>
            </div>

            <div className='flex shrink-0 justify-end border-t border-gray-100 p-4 sm:p-5 dark:border-white/[0.08]'>
              <button
                type='button'
                onClick={() => setShowSettings(false)}
                className='rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200'
                disabled={!keyId || !model}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
