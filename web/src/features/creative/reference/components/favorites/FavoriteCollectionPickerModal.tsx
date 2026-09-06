import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../../hooks/usePreventBackgroundScroll'
import { getTaskFavoriteCollectionIds } from '../../lib/favoriteState'
import {
  createFavoriteCollection,
  deleteFavoriteCollection,
  renameFavoriteCollection,
  updateTasksFavoriteCollections,
  useStore,
} from '../../store'
import type { FavoriteCollection } from '../../types'
import { Checkbox } from '../Checkbox'
import {
  CloseIcon,
  DragHandleIcon,
  EditIcon,
  FavoriteIcon,
  TrashIcon,
} from '../icons'
import { TooltipButton as FavoriteActionButton } from '../TooltipButton'
import { getInitialCheckedCollectionIds } from './favoriteUtils'

export function FavoriteCollectionPickerModal() {
  const taskIds = useStore((s) => s.favoritePickerTaskIds)
  const tasks = useStore((s) => s.tasks)
  const collections = useStore((s) => s.favoriteCollections)
  const defaultFavoriteCollectionId = useStore(
    (s) => s.defaultFavoriteCollectionId
  )
  const setDefaultFavoriteCollectionId = useStore(
    (s) => s.setDefaultFavoriteCollectionId
  )
  const setFavoriteCollections = useStore((s) => s.setFavoriteCollections)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const closePicker = useStore((s) => s.closeFavoritePicker)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const open = Boolean(taskIds?.length)

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragDropPosition, setDragDropPosition] = useState<
    'before' | 'after' | null
  >(null)

  const [touchDragPreview, setTouchDragPreview] = useState<{
    label: string
    x: number
    y: number
    width: number
    height: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const touchDragRef = useRef<{
    id: string
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  const selectedTasks = useMemo(
    () => tasks.filter((task) => taskIds?.includes(task.id)),
    [tasks, taskIds]
  )
  const selectableCollections = collections

  useEffect(() => {
    if (!open) return
    setCheckedIds(
      getInitialCheckedCollectionIds(selectedTasks, defaultFavoriteCollectionId)
    )
    setDraft('')
    setEditingId(null)
    setEditingName('')
  }, [defaultFavoriteCollectionId, open, selectedTasks])

  useCloseOnEscape(open, closePicker)
  usePreventBackgroundScroll(open, modalRef)

  useEffect(() => {
    if (!touchDragPreview) return

    const preventTouchScroll = (event: TouchEvent) => {
      event.preventDefault()
    }
    const listenerOptions = {
      passive: false,
      capture: true,
    } as AddEventListenerOptions
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    window.addEventListener('touchmove', preventTouchScroll, listenerOptions)

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
      window.removeEventListener(
        'touchmove',
        preventTouchScroll,
        listenerOptions
      )
    }
  }, [touchDragPreview])

  if (!open || !taskIds) return null

  const toggleChecked = (id: string, checked: boolean) => {
    setCheckedIds((current) =>
      checked
        ? Array.from(new Set([...current, id]))
        : current.filter((item) => item !== id)
    )
  }

  const handleCreate = () => {
    const collection = createFavoriteCollection(draft)
    if (!collection) return
    setCheckedIds((current) => Array.from(new Set([...current, collection.id])))
    setDraft('')
  }

  const handleConfirm = () => {
    void updateTasksFavoriteCollections(taskIds, checkedIds)
    closePicker()
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const targetElement = e.currentTarget as HTMLElement
    const rect = targetElement.getBoundingClientRect()
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'

    if (dragOverId !== targetId || dragDropPosition !== position) {
      setDragOverId(targetId)
      setDragDropPosition(position)
    }

    const scrollContainer = targetElement.closest('.custom-scrollbar')
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const scrollThreshold = 30
      if (e.clientY < containerRect.top + scrollThreshold) {
        scrollContainer.scrollTop -= 10
      } else if (e.clientY > containerRect.bottom - scrollThreshold) {
        scrollContainer.scrollTop += 10
      }
    }
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
    setDragDropPosition(null)
    setTouchDragPreview(null)
    touchDragRef.current = null
  }

  const handleTouchStart = (
    e: React.TouchEvent,
    collection: FavoriteCollection
  ) => {
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return
    const touch = e.touches[0]
    const rect = e.currentTarget.getBoundingClientRect()

    e.preventDefault()
    e.stopPropagation()
    touchDragRef.current = {
      id: collection.id,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
    }
    setDraggedId(collection.id)
    setTouchDragPreview({
      label: collection.name,
      x: touch.clientX,
      y: touch.clientY,
      width: rect.width,
      height: rect.height,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
    })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const drag = touchDragRef.current
    if (!drag) return
    const touch = e.touches[0]

    if (!drag.moved) {
      if (
        Math.abs(touch.clientX - drag.startX) > 5 ||
        Math.abs(touch.clientY - drag.startY) > 5
      ) {
        drag.moved = true
      } else {
        return
      }
    }

    e.preventDefault()
    setTouchDragPreview((current) =>
      current ? { ...current, x: touch.clientX, y: touch.clientY } : current
    )

    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const targetElement = el?.closest(
      '[data-collection-id]'
    ) as HTMLElement | null
    if (!targetElement) return

    const targetId = targetElement.getAttribute('data-collection-id')
    if (!targetId) return

    const rect = targetElement.getBoundingClientRect()
    const position =
      touch.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOverId(targetId)
    setDragDropPosition(position)

    const scrollContainer = targetElement.closest(
      '.custom-scrollbar'
    ) as HTMLElement | null
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const scrollThreshold = 30
      if (touch.clientY < containerRect.top + scrollThreshold) {
        scrollContainer.scrollTop -= 10
      } else if (touch.clientY > containerRect.bottom - scrollThreshold) {
        scrollContainer.scrollTop += 10
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const drag = touchDragRef.current
    if (!drag) return
    if (drag.moved && dragOverId && dragOverId !== drag.id) {
      e.preventDefault()
      const sourceId = drag.id
      const targetId = dragOverId

      const sourceIndex = selectableCollections.findIndex(
        (c) => c.id === sourceId
      )
      const targetIndex = selectableCollections.findIndex(
        (c) => c.id === targetId
      )
      if (sourceIndex >= 0 && targetIndex >= 0) {
        const newCollections = [...selectableCollections]
        const [removed] = newCollections.splice(sourceIndex, 1)

        let newTargetIndex = targetIndex
        if (dragDropPosition === 'after') newTargetIndex++
        if (sourceIndex < targetIndex) newTargetIndex--

        newCollections.splice(newTargetIndex, 0, removed)
        setFavoriteCollections(newCollections)
      }
    }
    handleDragEnd()
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const sourceId = draggedId || e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) return handleDragEnd()

    const sourceIndex = selectableCollections.findIndex(
      (c) => c.id === sourceId
    )
    const targetIndex = selectableCollections.findIndex(
      (c) => c.id === targetId
    )
    if (sourceIndex < 0 || targetIndex < 0) return handleDragEnd()

    const newCollections = [...selectableCollections]
    const [removed] = newCollections.splice(sourceIndex, 1)

    let newTargetIndex = targetIndex
    if (dragDropPosition === 'after') newTargetIndex++
    if (sourceIndex < targetIndex) newTargetIndex--

    newCollections.splice(newTargetIndex, 0, removed)
    setFavoriteCollections(newCollections)
    handleDragEnd()
  }

  const startRename = (e: React.MouseEvent, collection: FavoriteCollection) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingId(collection.id)
    setEditingName(collection.name)
  }

  const confirmRename = () => {
    if (editingId && editingName.trim())
      renameFavoriteCollection(editingId, editingName.trim())
    setEditingId(null)
    setEditingName('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingId(null)
      setEditingName('')
    }
  }

  const handleDelete = (
    e: React.MouseEvent,
    collection: FavoriteCollection
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (collections.length <= 1) return
    const collectionTasks = tasks.filter((t) =>
      getTaskFavoriteCollectionIds(t, defaultFavoriteCollectionId).includes(
        collection.id
      )
    )
    const imageCount = new Set(
      collectionTasks.flatMap((task) => task.outputImages || [])
    ).size
    setConfirmDialog({
      title: '删除收藏夹',
      message: `确定要删除收藏夹「${collection.name}」吗？`,
      checkbox:
        imageCount > 0
          ? {
              label: `同时删除收藏夹中的图片（${imageCount} 张）`,
              tone: 'danger',
            }
          : undefined,
      action: (deleteImages = false) => {
        void deleteFavoriteCollection(collection.id, deleteImages)
      },
    })
  }

  const handleSetDefault = (
    e: React.MouseEvent,
    collection: FavoriteCollection
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (collection.id === defaultFavoriteCollectionId) {
      setDefaultFavoriteCollectionId(null)
      return
    }
    const current = collections.find(
      (item) => item.id === defaultFavoriteCollectionId
    )
    if (!current) {
      setDefaultFavoriteCollectionId(collection.id)
      return
    }
    setConfirmDialog({
      title: '修改默认收藏夹',
      message: `确定要将默认收藏夹从「${current.name}」改为「${collection.name}」吗？`,
      action: () => setDefaultFavoriteCollectionId(collection.id),
    })
  }

  return createPortal(
    <div
      data-no-drag-select
      className='fixed inset-0 z-[105] flex items-center justify-center p-4 sm:p-0'
      onClick={closePicker}
    >
      <div className='animate-overlay-in absolute inset-0 bg-black/40 backdrop-blur-sm' />
      <div
        ref={modalRef}
        className='animate-modal-in relative z-10 flex max-h-[85vh] w-full max-w-[400px] flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/90 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='relative shrink-0 border-b border-gray-100 px-6 pt-6 pb-4 dark:border-[#333]'>
          <FavoriteActionButton
            tooltip='关闭'
            onClick={closePicker}
            wrapperClassName='absolute right-5 top-5 inline-flex'
            className='shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200'
          >
            <CloseIcon className='h-5 w-5' />
          </FavoriteActionButton>
          <h2 className='mb-2 flex items-center gap-2.5 pr-8 text-lg leading-snug font-semibold text-gray-800 dark:text-gray-100'>
            <FavoriteIcon filled className='h-5 w-5 shrink-0 text-yellow-500' />
            保存到收藏夹
          </h2>
          <p className='text-[13px] leading-relaxed text-gray-500 dark:text-gray-400'>
            取消勾选会将任务从对应的收藏夹中移除。
          </p>
        </div>
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden pt-3 pb-1'>
          <div className='mb-1.5 flex shrink-0 items-center justify-between px-6'>
            <span className='text-[13px] font-medium text-gray-500 dark:text-gray-400'>
              选择要保存的收藏夹
            </span>
            <div className='flex gap-4'>
              <button
                type='button'
                onClick={() =>
                  setCheckedIds(
                    selectableCollections.map((collection) => collection.id)
                  )
                }
                className='text-[13px] font-medium text-blue-500 transition-colors hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
              >
                全选
              </button>
              <button
                type='button'
                onClick={() => setCheckedIds([])}
                className='text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              >
                取消
              </button>
            </div>
          </div>
          <div className='custom-scrollbar relative flex-1 overflow-y-auto'>
            {selectableCollections.length === 0 ? (
              <div className='py-8 text-center text-sm text-gray-400 dark:text-gray-500'>
                暂无收藏夹
              </div>
            ) : (
              selectableCollections.map((collection) => {
                const isDefault = collection.id === defaultFavoriteCollectionId
                const canDelete = collections.length > 1
                return (
                  <div
                    key={collection.id}
                    data-collection-id={collection.id}
                    draggable={editingId !== collection.id}
                    onDragStart={(e) => handleDragStart(e, collection.id)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, collection)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleDragEnd}
                    onClick={(e) => {
                      const target = e.target as HTMLElement
                      if (
                        editingId === collection.id ||
                        target.closest('button,input,[data-drag-handle]')
                      )
                        return
                      toggleChecked(
                        collection.id,
                        !checkedIds.includes(collection.id)
                      )
                    }}
                    className={`group relative flex items-center justify-between transition-colors ${
                      draggedId === collection.id
                        ? 'bg-gray-100 opacity-40 dark:bg-white/[0.04]'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                    }`}
                    onDragOver={(e) => handleDragOver(e, collection.id)}
                    onDrop={(e) => handleDrop(e, collection.id)}
                  >
                    {dragOverId === collection.id &&
                      dragDropPosition === 'before' &&
                      draggedId !== collection.id && (
                        <div className='pointer-events-none absolute top-0 right-0 left-0 z-40 h-[2px] bg-blue-500' />
                      )}
                    {dragOverId === collection.id &&
                      dragDropPosition === 'after' &&
                      draggedId !== collection.id && (
                        <div className='pointer-events-none absolute right-0 bottom-0 left-0 z-40 h-[2px] bg-blue-500' />
                      )}
                    <div className='flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 pr-3 pl-4'>
                      <div
                        data-drag-handle
                        className='flex shrink-0 cursor-grab items-center justify-center text-gray-400 opacity-60 transition-opacity hover:opacity-100 active:cursor-grabbing dark:text-gray-500'
                        style={{ touchAction: 'none' }}
                      >
                        <DragHandleIcon className='h-3.5 w-3.5' />
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checkedIds.includes(collection.id)}
                          onChange={(checked) =>
                            toggleChecked(collection.id, checked)
                          }
                          className='shrink-0 scale-110'
                        />
                      </div>
                      {editingId === collection.id ? (
                        <input
                          type='text'
                          className='h-6 min-w-0 flex-1 rounded border border-blue-400/50 bg-white px-1.5 py-0 text-[15px] leading-6 text-gray-900 shadow-sm outline-none focus:border-blue-500 dark:border-white/20 dark:bg-black/20 dark:text-white dark:focus:border-white/40'
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={handleRenameKeyDown}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          onBlur={confirmRename}
                        />
                      ) : (
                        <span
                          className='min-w-0 flex-1 truncate text-[15px] font-medium text-gray-700 dark:text-gray-200'
                          title={collection.name}
                        >
                          {collection.name}
                        </span>
                      )}
                    </div>
                    <div
                      className={`flex shrink-0 items-center justify-end gap-2 overflow-hidden pr-4 transition-all duration-150 ${editingId === collection.id ? 'w-12' : 'w-28'}`}
                    >
                      {editingId === collection.id ? (
                        <FavoriteActionButton
                          tooltip='确认'
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            confirmRename()
                          }}
                          className='rounded-md p-1.5 text-green-500 transition-colors hover:bg-gray-200 hover:text-green-600 dark:text-green-400 dark:hover:bg-white/10 dark:hover:text-green-300'
                        >
                          <svg
                            className='h-3.5 w-3.5'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              strokeWidth={2}
                              d='M5 13l4 4L19 7'
                            />
                          </svg>
                        </FavoriteActionButton>
                      ) : (
                        <>
                          <FavoriteActionButton
                            tooltip={
                              isDefault ? '取消默认收藏夹' : '设为默认收藏夹'
                            }
                            onClick={(e) => handleSetDefault(e, collection)}
                            className={`rounded-md p-1.5 transition-colors hover:bg-gray-200 dark:hover:bg-white/10 ${isDefault ? 'text-yellow-500 dark:text-yellow-400' : 'text-gray-400 hover:text-yellow-500 dark:hover:text-yellow-400'}`}
                          >
                            <FavoriteIcon
                              filled={isDefault}
                              className='h-3.5 w-3.5'
                            />
                          </FavoriteActionButton>
                          <FavoriteActionButton
                            tooltip='重命名'
                            onClick={(e) => startRename(e, collection)}
                            className='rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white'
                          >
                            <EditIcon className='h-3.5 w-3.5' />
                          </FavoriteActionButton>
                          <FavoriteActionButton
                            tooltip={canDelete ? '删除' : '至少保留一个收藏夹'}
                            disabled={!canDelete}
                            onClick={(e) => handleDelete(e, collection)}
                            className={`rounded-md p-1.5 transition-colors hover:bg-gray-200 dark:hover:bg-white/10 ${canDelete ? 'text-gray-400 hover:text-red-500 dark:hover:text-red-400' : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}`}
                          >
                            <TrashIcon className='h-3.5 w-3.5' />
                          </FavoriteActionButton>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div className='shrink-0 border-t border-gray-200 p-6 dark:border-[#333]'>
          <div className='flex gap-3'>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreate()
              }}
              type='text'
              placeholder='新建收藏夹...'
              className='min-w-0 flex-1 rounded-xl border border-gray-300 bg-transparent px-4 py-2 text-sm transition outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:text-white dark:focus:border-white/30 dark:focus:ring-white/30'
            />
            <button
              type='button'
              onClick={handleCreate}
              disabled={!draft.trim()}
              className='inline-flex items-center justify-center rounded-xl bg-gray-200 px-5 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'
            >
              新建
            </button>
          </div>
          <div className='mt-5 flex gap-4'>
            <button
              type='button'
              onClick={closePicker}
              className='flex-1 rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.04]'
            >
              取消
            </button>
            <button
              type='button'
              onClick={handleConfirm}
              className='flex-1 rounded-xl border border-transparent bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600'
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
