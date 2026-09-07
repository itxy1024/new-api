/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 * 这里只保留 NewAPI 的 Key 和模型选择，不在浏览器保存或展示真实厂商密钥。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ModelGroupSelector } from '@/components/model-group-selector'
import { api } from '@/lib/api'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { setNewApiSelection } from './lib/newApiSelection'
import { useStore } from './store'

type KeyOption = {
  group?: string
  groups?: string[]
  id: number
  name?: string
  status?: number
}
type ModelOption = { id: string; group?: string }

const KEY_PAGE_SIZE = 100
const DEFAULT_IMAGE_MODEL = 'gpt-image-2'
const MODEL_SCAN_CONCURRENCY = 4

const UNAVAILABLE_KEY_ERRORS = new Set([
  'creative key is not available',
  'creative key is disabled',
  'creative key quota is exhausted',
  'creative key is expired',
  'creative key group is not available for this user',
  'creative key group is no longer available',
])

function getKeyLabel(item: KeyOption): string {
  return item.name?.trim() || '未命名 Key'
}

function isKeyGroupUsable(
  item: KeyOption,
  usableGroups: Set<string> | null
): boolean {
  if (!usableGroups) return true

  let groups: string[] = []
  if (Array.isArray(item.groups)) {
    groups = item.groups
  } else if (item.group) {
    groups = [item.group]
  }
  if (groups.length === 0) return true
  return groups.some((group) => usableGroups.has(group.trim()))
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

function isUnavailableCreativeKeyError(error: unknown): boolean {
  const message = (
    error as {
      response?: { data?: { error?: { message?: unknown } } }
    }
  )?.response?.data?.error?.message
  return typeof message === 'string' && UNAVAILABLE_KEY_ERRORS.has(message)
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
  const modelRequestsByKeyRef = useRef(
    new Map<string, Promise<ModelOption[]>>()
  )
  const selectedKeyIdRef = useRef('')
  const userInteractedRef = useRef(false)

  const loadModelsForKey = useCallback((requestedKeyId: string) => {
    const cached = modelsByKeyRef.current.get(requestedKeyId)
    if (cached) return Promise.resolve(cached)

    const pending = modelRequestsByKeyRef.current.get(requestedKeyId)
    if (pending) return pending

    const request = api
      .get('/api/creative/models', {
        params: { key_id: requestedKeyId },
        skipErrorHandler: true,
      })
      .then((response) => {
        const next = normalizeModelOptions(response.data?.data)
        modelsByKeyRef.current.set(requestedKeyId, next)
        return next
      })
      .finally(() => {
        if (modelRequestsByKeyRef.current.get(requestedKeyId) === request) {
          modelRequestsByKeyRef.current.delete(requestedKeyId)
        }
      })
    modelRequestsByKeyRef.current.set(requestedKeyId, request)
    return request
  }, [])

  const removeUnavailableKey = useCallback((unavailableKeyId: string) => {
    modelsByKeyRef.current.delete(unavailableKeyId)
    setKeys((current) =>
      current.filter((item) => String(item.id) !== unavailableKeyId)
    )
    if (selectedKeyIdRef.current !== unavailableKeyId) return

    selectedKeyIdRef.current = ''
    setKeyId('')
    setModels([])
    setModel('')
    setGroup('')
  }, [])

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
    userInteractedRef.current = false
    selectedKeyIdRef.current = ''
    modelsByKeyRef.current.clear()
    modelRequestsByKeyRef.current.clear()
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
        const allKeys = [...firstItems, ...remainingItems]
        const hasExplicitGroups = allKeys.some(
          (item) =>
            Boolean(item.group?.trim()) ||
            (Array.isArray(item.groups) && item.groups.length > 0)
        )
        const usableGroupsResponse = hasExplicitGroups
          ? await api
              .get('/api/user/self/groups', { skipErrorHandler: true })
              .catch(() => null)
          : null
        const usableGroupsData = usableGroupsResponse?.data?.data
        const usableGroups =
          usableGroupsData &&
          typeof usableGroupsData === 'object' &&
          !Array.isArray(usableGroupsData)
            ? new Set(Object.keys(usableGroupsData))
            : null
        const next = allKeys.filter(
          (item: KeyOption) =>
            Number(item.status) === 1 && isKeyGroupUsable(item, usableGroups)
        )
        setKeys(next)

        const modelResults = Array.from(
          { length: next.length },
          (): ModelOption[] | undefined => undefined
        )
        const settled = Array.from({ length: next.length }, () => false)
        let scanIndex = 0
        let nextDefaultCandidate = 0
        let defaultApplied = false

        const applyDefaultWhenReady = () => {
          if (defaultApplied || userInteractedRef.current || !active) return

          while (settled[nextDefaultCandidate]) {
            const defaultModel = modelResults[nextDefaultCandidate]?.find(
              (item) => item.id === DEFAULT_IMAGE_MODEL
            )
            if (defaultModel) {
              const defaultKeyId = String(next[nextDefaultCandidate].id)
              defaultApplied = true
              selectedKeyIdRef.current = defaultKeyId
              setKeyId(defaultKeyId)
              setModels(modelResults[nextDefaultCandidate] ?? [])
              setModel(defaultModel.id)
              setGroup(defaultModel.group ?? '')
              return
            }
            nextDefaultCandidate += 1
          }
        }

        const scanModels = async () => {
          while (active) {
            const currentIndex = scanIndex
            scanIndex += 1
            if (currentIndex >= next.length) return

            const currentKeyId = String(next[currentIndex].id)
            try {
              modelResults[currentIndex] = await loadModelsForKey(currentKeyId)
              if (modelResults[currentIndex]?.length === 0) {
                removeUnavailableKey(currentKeyId)
              }
            } catch (error) {
              modelResults[currentIndex] = []
              if (active && isUnavailableCreativeKeyError(error)) {
                removeUnavailableKey(currentKeyId)
              }
            }
            settled[currentIndex] = true
            applyDefaultWhenReady()
          }
        }

        await Promise.all(
          Array.from(
            { length: Math.min(MODEL_SCAN_CONCURRENCY, next.length) },
            scanModels
          )
        )
      } catch {
        if (active) useStore.getState().showToast('加载 API Key 失败', 'error')
      }
    })()
    return () => {
      active = false
    }
  }, [loadModelsForKey, removeUnavailableKey])

  useEffect(() => {
    if (!keyId) return

    const cached = modelsByKeyRef.current.get(keyId)
    if (cached) {
      setModels(cached)
      return
    }

    let active = true
    void (async () => {
      try {
        const next = await loadModelsForKey(keyId)
        if (!active || selectedKeyIdRef.current !== keyId) return
        setModels(next)
      } catch (error) {
        if (!active) return
        if (isUnavailableCreativeKeyError(error)) {
          removeUnavailableKey(keyId)
          return
        }
        setModels([])
        setModel('')
        setGroup('')
        useStore.getState().showToast('加载创作模型失败', 'error')
      }
    })()

    return () => {
      active = false
    }
  }, [keyId, loadModelsForKey, removeUnavailableKey])

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
            userInteractedRef.current = true
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
              userInteractedRef.current = true
              selectedKeyIdRef.current = value
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
