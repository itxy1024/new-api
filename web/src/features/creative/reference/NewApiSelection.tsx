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
import { useSystemConfigStore } from '@/stores/system-config-store'

import { setNewApiSelection } from './lib/newApiSelection'
import { useStore } from './store'

type KeyOption = { id: number; name?: string; status?: number }
type ModelOption = { id: string; group?: string }

const KEY_PAGE_SIZE = 100
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'

function getKeyLabel(item: KeyOption): string {
  return item.name?.trim() || '未命名 Key'
}

function getModelValue(item: ModelOption): string {
  return item.group ? `${item.group}\x00${item.id}` : item.id
}

function getModelLabel(item: ModelOption): string {
  return item.id
}

function normalizeModelOptions(raw: unknown): ModelOption[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item: string | { id?: string; name?: string; group?: string }) =>
      typeof item === 'string'
        ? { id: item }
        : { id: item.id ?? item.name ?? '', group: item.group }
    )
    .filter((item): item is ModelOption => Boolean(item.id?.trim()))
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
  const modelsByKeyRef = useRef(new Map<string, ModelOption[]>())

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
    setNewApiSelection(null)
    void (async () => {
      try {
        const firstResponse = await api.get('/api/token/', {
          params: { p: 1, size: KEY_PAGE_SIZE },
        })
        const firstData = firstResponse.data?.data ?? {}
        let firstItems: KeyOption[] = []
        if (Array.isArray(firstData)) {
          firstItems = firstData
        } else if (Array.isArray(firstData.items)) {
          firstItems = firstData.items
        }
        const total = Number(firstData.total ?? firstItems.length)
        const pageCount = Math.max(1, Math.ceil(total / KEY_PAGE_SIZE))
        const remainingResponses = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) =>
            api.get('/api/token/', {
              params: { p: index + 2, size: KEY_PAGE_SIZE },
            })
          )
        )
        const remainingItems = remainingResponses.flatMap((response) => {
          const data = response.data?.data ?? {}
          if (Array.isArray(data)) return data
          return Array.isArray(data.items) ? data.items : []
        })
        if (!active) return
        const next = [...firstItems, ...remainingItems].filter(
          (item: KeyOption) => Number(item.status) === 1
        )
        const modelResults = await Promise.all(
          next.map(async (item: KeyOption) => {
            try {
              const response = await api.get('/api/creative/models', {
                params: { key_id: String(item.id) },
              })
              return {
                keyId: String(item.id),
                models: normalizeModelOptions(response.data?.data),
              }
            } catch {
              return { keyId: String(item.id), models: null }
            }
          })
        )
        if (!active) return

        const modelsByKey = new Map<string, ModelOption[]>()
        for (const result of modelResults) {
          if (result.models) modelsByKey.set(result.keyId, result.models)
        }
        modelsByKeyRef.current = modelsByKey
        setKeys(next)

        const defaultResult = modelResults.find((result) =>
          result.models?.some((item) => item.id === DEFAULT_IMAGE_MODEL)
        )
        const defaultModel = defaultResult?.models?.find(
          (item) => item.id === DEFAULT_IMAGE_MODEL
        )
        if (defaultResult && defaultModel) {
          setKeyId(defaultResult.keyId)
          setModels(defaultResult.models ?? [])
          setModel(defaultModel.id)
          setGroup(defaultModel.group ?? '')
          return
        }

        setKeyId('')
        setModels([])
        setModel('')
        setGroup('')
      } catch {
        if (active) useStore.getState().showToast('加载 API Key 失败', 'error')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!keyId || modelsByKeyRef.current.has(keyId)) return

    let active = true
    void (async () => {
      try {
        const response = await api.get('/api/creative/models', {
          params: { key_id: keyId },
        })
        if (!active) return
        const next = normalizeModelOptions(response.data?.data)
        modelsByKeyRef.current.set(keyId, next)
        setModels(next)
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
    const parsedKeyId = Number(keyId)
    if (Number.isInteger(parsedKeyId) && parsedKeyId > 0 && model) {
      setNewApiSelection({ keyId: parsedKeyId, model, group })
    } else {
      setNewApiSelection(null)
    }

    const currentSettings = useStore.getState().settings
    const currentProfile = currentSettings.profiles?.find(
      (profile) => profile.id === 'newapi'
    )
    if (
      currentProfile?.id === 'newapi' &&
      currentProfile.apiKey === keyId &&
      currentProfile.model === model &&
      currentProfile.baseUrl === '/api/creative' &&
      currentProfile.name === relayName &&
      currentSettings.activeProfileId === 'newapi' &&
      currentSettings.apiKey === keyId &&
      currentSettings.model === model &&
      currentSettings.baseUrl === '/api/creative'
    ) {
      return
    }

    const profile = currentProfile ??
      currentSettings.profiles[0] ?? {
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
    const nextProfile = {
      ...profile,
      id: 'newapi',
      name: relayName,
      apiKey: keyId,
      model,
      provider: 'openai' as const,
      baseUrl: '/api/creative',
      apiMode: 'images' as const,
      codexCli: false,
      apiProxy: false,
    }
    const nextProfiles = currentSettings.profiles.some(
      (item) => item.id === 'newapi'
    )
      ? currentSettings.profiles.map((item) =>
          item.id === 'newapi' ? nextProfile : item
        )
      : [...currentSettings.profiles, nextProfile]
    setSettings({
      ...currentSettings,
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
              setModels(modelsByKeyRef.current.get(value) ?? [])
              setKeyId(value)
              setModel('')
              setGroup('')
            }
          }}
          disabled={!keys.length}
          className='h-[30px] w-full max-w-none justify-start rounded-xl border-gray-200/60 bg-white/50 px-3 text-xs dark:border-white/[0.08] dark:bg-white/[0.03]'
        />
      </label>
    </div>
  )
}
