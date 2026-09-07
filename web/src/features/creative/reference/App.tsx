/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 * NewAPI 仅替换认证、Key/模型选择和生成接口，画廊交互保持原项目结构。
 */
import { useLayoutEffect } from 'react'

import { Main } from '@/components/layout'

import ConfirmDialog from './components/ConfirmDialog'
import DetailModal from './components/DetailModal'
import {
  FavoriteCollectionPickerModal,
  FavoriteCollectionsView,
  ManageCollectionsModal,
} from './components/FavoriteCollections'
import Header from './components/Header'
import ImageContextMenu from './components/ImageContextMenu'
import InputBar from './components/InputBar'
import Lightbox from './components/Lightbox'
import MaskEditorModal from './components/MaskEditorModal'
import SearchBar from './components/SearchBar'
import SupportPromptModal from './components/SupportPromptModal'
import TaskGrid from './components/TaskGrid'
import Toast from './components/Toast'
import { useGlobalClickSuppression } from './lib/clickSuppression'
import { clearInputDraftState } from './lib/inputDraftState'
import { initStore, useStore } from './store'
import { DEFAULT_PARAMS } from './types'

import './index.css'

let initialized = false

/**
 * 参考项目的完整画廊壳层。设置弹窗被移除，API 选择由 NewApiSelection 负责。
 */
export default function ReferenceCreativeApp() {
  const appMode = useStore((state) => state.appMode)
  const filterFavorite = useStore((state) => state.filterFavorite)
  const activeFavoriteCollectionId = useStore(
    (state) => state.activeFavoriteCollectionId
  )
  useGlobalClickSuppression()

  useLayoutEffect(() => {
    const resetPageInput = () => {
      useStore.getState().setAppMode('gallery')
      useStore.setState({
        ...clearInputDraftState(),
        galleryInputDraft: null,
        params: { ...DEFAULT_PARAMS },
        reusedTaskApiProfileId: null,
        reusedTaskApiProfileName: null,
        reusedTaskApiProfileMissing: false,
      })
    }

    resetPageInput()
    if (initialized) return
    initialized = true
    void initStore().then(resetPageInput)
  }, [])

  return (
    <Main className='min-h-0 overflow-y-auto p-0'>
      <div
        data-creative-reference
        className='bg-background text-foreground min-h-full'
      >
        <Header />
        {appMode === 'gallery' ? (
          <main data-home-main data-drag-select-surface className='pb-48'>
            <div className='safe-area-x mx-auto max-w-7xl'>
              <SearchBar />
              {filterFavorite && !activeFavoriteCollectionId ? (
                <FavoriteCollectionsView />
              ) : (
                <TaskGrid />
              )}
            </div>
          </main>
        ) : (
          <main className='safe-area-x mx-auto max-w-7xl pt-24 pb-48'>
            <div className='rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800'>
              Agent 模式在 NewAPI 创作中心中不可用，请切换回画廊。
            </div>
          </main>
        )}
        <InputBar />
        <DetailModal />
        <Lightbox />
        <ConfirmDialog />
        <SupportPromptModal />
        <FavoriteCollectionPickerModal />
        <ManageCollectionsModal />
        <Toast />
        <MaskEditorModal />
        <ImageContextMenu />
      </div>
    </Main>
  )
}
