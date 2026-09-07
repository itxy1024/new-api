/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 * 这里只保留 NewAPI 的 Key 和模型选择，不在浏览器保存或展示真实厂商密钥。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ModelGroupSelector } from '@/components/model-group-selector'
import { api } from '@/lib/api'
import {
  getSystemName,
  useSystemConfigStore,
} from '@/stores/system-config-store'

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
  const setSettings = useStore((state) => state.setSettings)
  const configuredSystemName = useSystemConfigStore(
    (state) => state.config.systemName
  )
  const relayName = configuredSystemName.trim() || 'New API'
  const { t } = useTranslation()
  const [keys, setKeys] = useState<KeyOption[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [keyId, setKeyId] = useState('')
  const [model, setModel] = useState('')
  const [group, setGroup] = useState('')
  const lastProfileSignature = useRef('')
  const modelLoadingKeyId = useRef<string | null>(null)

  const selectedModelValue = group ? `${group}\x00${model}` : model
  const keyGroups = useMemo(
    () =>
      keys.map((item) => ({
        value: String(item.id),
        label: getKeyLabel(item),
      })),
    [keys]
  )
  const modelOptions = useMemo(
    () =>
      models.map((item) => ({
        value: getModelValue(item),
        label: getModelLabel(item),
      })),
    [models]
  )

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
      name: getSystemName().trim() || 'New API',
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
    // Key 变化时先清空旧选项，防止模型接口返回前继续提交上一把 Key 的模型。
    // oxlint-disable-next-line react/set-state-in-effect
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
      name: relayName,
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
  }, [group, keyId, model, relayName, setSettings])

  return (
    <div
      data-newapi-selection
      className='contents'
      aria-label={t('Select an API key')}
    >
      <label className='col-span-2 flex min-w-0 flex-col gap-0.5'>
        <span className='ml-1 text-gray-400 dark:text-gray-500'>
          {t('Model')}
        </span>
        <ModelGroupSelector
          selectedModel={selectedModelValue}
          models={modelOptions}
          onModelChange={(value) => {
            const selected = models.find(
              (item) => getModelValue(item) === value
            )
            if (!selected) return
            setModel(selected.id)
            setGroup(selected.group ?? '')
          }}
          selectedGroup={keyId}
          groups={keyGroups}
          onGroupChange={(value) => {
            if (value !== keyId) {
              setKeyId(value)
              setModel('')
              setGroup('')
            }
          }}
          disabled={!keys.length || !keyId}
          className='h-[30px] w-full max-w-none justify-start rounded-xl border-gray-200/60 bg-white/50 px-3 text-xs dark:border-white/[0.08] dark:bg-white/[0.03]'
        />
      </label>
    </div>
  )
}
