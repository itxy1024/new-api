import type {
  AgentConversation,
  AgentInputDraft,
  AppMode,
  AppSettings,
  FavoriteCollection,
  InputImage,
  MaskDraft,
  TaskParams,
} from '../types'
import { normalizeAgentConversations } from './agentConversationState'
import {
  getPersistableAgentConversations,
  stripPersistedAgentConversations,
} from './agentResponseState'
import { normalizeSettings } from './apiProfiles'
import {
  ensureDefaultFavoriteCollection,
  normalizeFavoriteCollections,
  resolveDefaultFavoriteCollectionId,
} from './favoriteState'
import {
  cleanStaleAgentInputDrafts,
  getPersistableAgentInputDrafts,
  normalizeAgentInputDraft,
  normalizeAgentInputDrafts,
  normalizeAgentInputDraftsByKey,
} from './inputDraftState'

export interface PersistedAppState {
  settings: AppSettings
  previousPresetConfig?: Pick<
    AppSettings,
    'customProviders' | 'profiles'
  > | null
  dismissedPresetProfileIds?: string[]
  dismissedPresetProviderIds?: string[]
  params?: TaskParams
  prompt?: string
  inputImages?: InputImage[]
  dismissedCodexCliPrompts: string[]
  appMode: AppMode
  galleryInputDraft?: AgentInputDraft | null
  agentConversations?: AgentConversation[]
  activeAgentConversationId: string | null
  agentInputDrafts: Record<string, AgentInputDraft>
  agentSidebarCollapsed: boolean
  agentAssetTab: 'references' | 'outputs'
  agentAssetPanelCollapsed: boolean
  favoriteCollections: FavoriteCollection[]
  defaultFavoriteCollectionId: string | null
  supportPromptDismissed: boolean
  supportPromptOpen: boolean
  supportPromptSkippedForImportedData: boolean
}

type PersistedStateSource = Omit<
  PersistedAppState,
  'prompt' | 'inputImages' | 'agentConversations'
> & {
  prompt: string
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
  agentConversations: AgentConversation[]
}

type PersistedStateFallback = Pick<
  PersistedAppState,
  | 'settings'
  | 'dismissedPresetProfileIds'
  | 'dismissedPresetProviderIds'
  | 'dismissedCodexCliPrompts'
  | 'favoriteCollections'
  | 'defaultFavoriteCollectionId'
> & {
  params: TaskParams
  agentConversations: AgentConversation[]
}

export type NormalizedPersistedAppState = PersistedAppState & {
  previousPresetConfig: Pick<AppSettings, 'customProviders' | 'profiles'> | null
  dismissedPresetProfileIds: string[]
  dismissedPresetProviderIds: string[]
  params: TaskParams
  prompt: string
  inputImages: InputImage[]
  galleryInputDraft: AgentInputDraft | null
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
  agentConversations: AgentConversation[]
}

export interface PersistedStateMergePlan {
  state: NormalizedPersistedAppState
  hasLegacyAgentConversations: boolean
  shouldMigrateAgentConversations: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  return value.filter((item): item is string => typeof item === 'string')
}

export function createPersistedState(
  state: PersistedStateSource,
  includeLegacyAgentConversations = false
): PersistedAppState {
  const settings = normalizeSettings(state.settings)
  return {
    settings,
    previousPresetConfig: state.previousPresetConfig ?? null,
    dismissedPresetProfileIds: state.dismissedPresetProfileIds ?? [],
    dismissedPresetProviderIds: state.dismissedPresetProviderIds ?? [],
    dismissedCodexCliPrompts: state.dismissedCodexCliPrompts,
    appMode: state.appMode,
    ...(includeLegacyAgentConversations
      ? {
          agentConversations: getPersistableAgentConversations(
            state.agentConversations
          ),
        }
      : {}),
    activeAgentConversationId: state.activeAgentConversationId,
    agentInputDrafts: settings.persistInputOnRestart
      ? getPersistableAgentInputDrafts(state)
      : {},
    agentSidebarCollapsed: state.agentSidebarCollapsed,
    agentAssetTab: state.agentAssetTab,
    agentAssetPanelCollapsed: state.agentAssetPanelCollapsed,
    favoriteCollections: state.favoriteCollections,
    defaultFavoriteCollectionId: state.defaultFavoriteCollectionId,
    supportPromptDismissed: state.supportPromptDismissed,
    supportPromptOpen: state.supportPromptOpen,
    supportPromptSkippedForImportedData:
      state.supportPromptSkippedForImportedData,
  }
}

export function migratePersistedState(
  persistedState: unknown,
  _version?: number
): unknown {
  if (!isRecord(persistedState)) return persistedState
  return {
    ...persistedState,
    agentConversations: stripPersistedAgentConversations(
      persistedState.agentConversations
    ),
  }
}

export function normalizePersistedState(
  persistedState: unknown,
  fallback: PersistedStateFallback,
  now = Date.now()
): PersistedStateMergePlan | null {
  if (!isRecord(persistedState)) return null

  const settings = normalizeSettings(
    persistedState.settings ?? fallback.settings
  )
  const previousPresetConfig =
    isRecord(persistedState.previousPresetConfig) &&
    Array.isArray(persistedState.previousPresetConfig.profiles)
      ? (() => {
          const normalized = normalizeSettings(
            persistedState.previousPresetConfig
          )
          return {
            customProviders: normalized.customProviders,
            profiles: persistedState.previousPresetConfig.profiles.length
              ? normalized.profiles
              : [],
          }
        })()
      : null
  const hasLegacyAgentConversations = Array.isArray(
    persistedState.agentConversations
  )
  const agentConversations = hasLegacyAgentConversations
    ? normalizeAgentConversations(persistedState.agentConversations)
    : fallback.agentConversations
  const activeAgentConversationId =
    typeof persistedState.activeAgentConversationId === 'string' &&
    (!hasLegacyAgentConversations ||
      agentConversations.some(
        (conversation) =>
          conversation.id === persistedState.activeAgentConversationId
      ))
      ? persistedState.activeAgentConversationId
      : (agentConversations[0]?.id ?? null)
  const appMode = persistedState.appMode === 'agent' ? 'agent' : 'gallery'
  let normalizedAgentInputDrafts: Record<string, AgentInputDraft> = {}
  if (settings.persistInputOnRestart) {
    normalizedAgentInputDrafts = hasLegacyAgentConversations
      ? normalizeAgentInputDrafts(
          persistedState.agentInputDrafts,
          agentConversations
        )
      : normalizeAgentInputDraftsByKey(persistedState.agentInputDrafts)
  }
  const cleanedAgentInputDrafts = cleanStaleAgentInputDrafts(
    normalizedAgentInputDrafts,
    activeAgentConversationId,
    now
  )
  const agentInputDrafts =
    appMode === 'agent' &&
    activeAgentConversationId &&
    !cleanedAgentInputDrafts[activeAgentConversationId] &&
    settings.persistInputOnRestart &&
    typeof persistedState.prompt === 'string'
      ? {
          ...cleanedAgentInputDrafts,
          [activeAgentConversationId]: normalizeAgentInputDraft(
            {
              prompt: persistedState.prompt,
              inputImages: persistedState.inputImages,
              maskDraft: null,
              maskEditorImageId: null,
            },
            now
          ),
        }
      : cleanedAgentInputDrafts
  const restoredAgentDraft =
    settings.persistInputOnRestart &&
    appMode === 'agent' &&
    activeAgentConversationId
      ? (agentInputDrafts[activeAgentConversationId] ?? null)
      : null
  const favoriteCollections = Array.isArray(persistedState.favoriteCollections)
    ? ensureDefaultFavoriteCollection(
        normalizeFavoriteCollections(persistedState.favoriteCollections, now),
        now
      )
    : fallback.favoriteCollections
  const preferredDefaultFavoriteCollectionId =
    persistedState.defaultFavoriteCollectionId === null ||
    typeof persistedState.defaultFavoriteCollectionId === 'string'
      ? persistedState.defaultFavoriteCollectionId
      : fallback.defaultFavoriteCollectionId

  return {
    state: {
      settings,
      previousPresetConfig,
      dismissedPresetProfileIds: normalizeStringArray(
        persistedState.dismissedPresetProfileIds,
        fallback.dismissedPresetProfileIds ?? []
      ),
      dismissedPresetProviderIds: normalizeStringArray(
        persistedState.dismissedPresetProviderIds,
        fallback.dismissedPresetProviderIds ?? []
      ),
      params: { ...fallback.params },
      dismissedCodexCliPrompts: normalizeStringArray(
        persistedState.dismissedCodexCliPrompts,
        fallback.dismissedCodexCliPrompts
      ),
      appMode,
      galleryInputDraft: null,
      agentConversations,
      activeAgentConversationId,
      agentInputDrafts,
      agentSidebarCollapsed: Boolean(persistedState.agentSidebarCollapsed),
      agentAssetTab:
        persistedState.agentAssetTab === 'references'
          ? 'references'
          : 'outputs',
      agentAssetPanelCollapsed: Boolean(
        persistedState.agentAssetPanelCollapsed
      ),
      favoriteCollections,
      defaultFavoriteCollectionId: resolveDefaultFavoriteCollectionId(
        favoriteCollections,
        preferredDefaultFavoriteCollectionId
      ),
      supportPromptDismissed: Boolean(persistedState.supportPromptDismissed),
      supportPromptOpen: Boolean(persistedState.supportPromptOpen),
      supportPromptSkippedForImportedData: Boolean(
        persistedState.supportPromptSkippedForImportedData
      ),
      prompt: restoredAgentDraft ? restoredAgentDraft.prompt : '',
      inputImages: restoredAgentDraft ? restoredAgentDraft.inputImages : [],
      maskDraft: restoredAgentDraft ? restoredAgentDraft.maskDraft : null,
      maskEditorImageId: restoredAgentDraft
        ? restoredAgentDraft.maskEditorImageId
        : null,
    },
    hasLegacyAgentConversations,
    shouldMigrateAgentConversations:
      hasLegacyAgentConversations && agentConversations.length > 0,
  }
}

export function mergePersistedAgentConversations(
  stored: AgentConversation[],
  legacy: AgentConversation[]
) {
  const merged = new Map<string, AgentConversation>()
  for (const conversation of stored) merged.set(conversation.id, conversation)
  for (const conversation of legacy) {
    const existing = merged.get(conversation.id)
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      merged.set(conversation.id, conversation)
    }
  }
  return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt)
}
