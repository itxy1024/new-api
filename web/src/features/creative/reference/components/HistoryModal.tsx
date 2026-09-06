import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'

import { useTooltip } from '../hooks/useTooltip'
import {
  getAgentConversationTaskIds,
  getConversationSearchText,
} from '../lib/agentConversationState'
import { removeMultipleTasks, useStore } from '../store'
import type { AgentConversation } from '../types'
import { CloseIcon, EditIcon, TrashIcon } from './icons'
import ViewportTooltip from './ViewportTooltip'

function HistoryActionButton({
  tooltip,
  className,
  disabled = false,
  onClick,
  onMouseDown,
  children,
}: {
  tooltip: string
  className: string
  disabled?: boolean
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onMouseDown?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  const tooltipState = useTooltip()

  return (
    <span className='relative inline-flex' {...tooltipState.handlers}>
      <button
        type='button'
        className={className}
        disabled={disabled}
        aria-label={tooltip}
        onClick={(e) => {
          tooltipState.dismiss()
          onClick?.(e)
        }}
        onMouseDown={(e) => {
          tooltipState.dismiss()
          onMouseDown?.(e)
        }}
      >
        {children}
      </button>
      <ViewportTooltip
        visible={tooltipState.visible}
        className='whitespace-nowrap'
      >
        {tooltip}
      </ViewportTooltip>
    </span>
  )
}

function formatTime(value: number) {
  const date = new Date(value)
  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const dayOfWeek = now.getDay() || 7
  const startOfWeek = startOfToday - (dayOfWeek - 1) * 24 * 60 * 60 * 1000
  const time = date.getTime()
  if (time >= startOfToday) return '今天'
  if (time >= startOfYesterday) return '昨天'
  if (time >= startOfWeek) return '本周'
  return '更早'
}

function formatDetailTime(value: number) {
  const date = new Date(value)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    ...(sameYear ? {} : { year: 'numeric' }),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return formatter.format(date).replace(/\//g, '-')
}

type HistoryModalProps = {
  onClose: () => void
  ignoreOutsideClickRef?: RefObject<HTMLElement | null>
}

export default function HistoryModal({
  onClose,
  ignoreOutsideClickRef,
}: HistoryModalProps) {
  const conversations = useStore((s) => s.agentConversations)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const setActiveConversationId = useStore(
    (s) => s.setActiveAgentConversationId
  )
  const renameConversation = useStore((s) => s.renameAgentConversation)
  const deleteConversation = useStore((s) => s.deleteAgentConversation)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const confirmDialogOpen = useStore((s) => Boolean(s.confirmDialog))
  const setAppMode = useStore((s) => s.setAppMode)
  const tasks = useStore((s) => s.tasks)
  const agentGeneratingTitleIds = useStore((s) => s.agentGeneratingTitleIds)
  const editingId = useStore((s) => s.agentEditingConversationId)
  const setEditingId = useStore((s) => s.setAgentEditingConversationId)

  const [editingTitle, setEditingTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (editingId) {
      const convo = conversations.find((c) => c.id === editingId)
      if (convo) setEditingTitle(convo.title)
    }
  }, [editingId, conversations])

  useEffect(() => {
    return () => {
      setEditingId(null)
    }
  }, [setEditingId])

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  )

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return sortedConversations
    return sortedConversations.filter((conversation) =>
      getConversationSearchText(conversation).includes(query)
    )
  }, [searchQuery, sortedConversations])

  const handleSelect = (id: string) => {
    if (editingId) return
    setAppMode('agent')
    setActiveConversationId(id)
    onClose()
  }

  const startRename = (
    e: React.MouseEvent,
    id: string,
    currentTitle: string
  ) => {
    e.stopPropagation()
    if (agentGeneratingTitleIds[id]) return
    setEditingId(id)
    setEditingTitle(currentTitle)
  }

  const confirmRename = () => {
    if (
      editingId &&
      editingTitle.trim() &&
      !agentGeneratingTitleIds[editingId]
    ) {
      renameConversation(editingId, editingTitle.trim())
    }
    setEditingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingId(null)
    }
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const targetConversation =
      conversations.find((item) => item.id === id) ?? null
    const relatedTaskIds = getAgentConversationTaskIds(
      targetConversation,
      tasks
    )
    const relatedTaskIdSet = new Set(relatedTaskIds)
    const generatedImageCount = new Set(
      tasks
        .filter((task) => relatedTaskIdSet.has(task.id))
        .flatMap((task) => task.outputImages || [])
    ).size

    setConfirmDialog({
      title: '删除对话',
      message: '确定要删除这个 Agent 对话吗？',
      checkbox:
        relatedTaskIds.length > 0
          ? {
              label:
                generatedImageCount > 0
                  ? `同时删除对话中生成的图片（${generatedImageCount} 张）和关联任务`
                  : `同时删除对话关联任务（${relatedTaskIds.length} 个）`,
              tone: 'danger',
            }
          : undefined,
      action: async (deleteGeneratedImages = false) => {
        if (deleteGeneratedImages && relatedTaskIds.length > 0)
          await removeMultipleTasks(relatedTaskIds)
        deleteConversation(id)
        if (conversations.length <= 1) {
          onClose()
        }
      },
    })
  }

  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleInteract = (e: MouseEvent | TouchEvent) => {
      if (confirmDialogOpen) return
      if (ignoreOutsideClickRef?.current?.contains(e.target as Node)) return
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleInteract, { capture: true })
    document.addEventListener('touchstart', handleInteract, { capture: true })
    return () => {
      document.removeEventListener('mousedown', handleInteract, {
        capture: true,
      })
      document.removeEventListener('touchstart', handleInteract, {
        capture: true,
      })
    }
  }, [confirmDialogOpen, ignoreOutsideClickRef, onClose])

  // Group by time
  const groups: Record<string, AgentConversation[]> = {}
  for (const c of filteredConversations) {
    const timeLabel = formatTime(c.updatedAt)
    if (!groups[timeLabel]) groups[timeLabel] = []
    groups[timeLabel].push(c)
  }

  return (
    <div
      ref={modalRef}
      className='animate-dropdown-down absolute top-12 left-0 z-50 flex max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 shadow-2xl sm:w-96 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-gray-200'
    >
      <div className='flex shrink-0 items-center justify-between border-b border-gray-200 p-3 dark:border-white/10'>
        <input
          type='text'
          placeholder='搜索聊天...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='flex-1 border-none bg-transparent px-2 text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-white'
        />
        <HistoryActionButton
          tooltip='关闭'
          onClick={onClose}
          className='rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'
        >
          <CloseIcon className='h-4 w-4' />
        </HistoryActionButton>
      </div>
      <div className='flex-1 space-y-1 overflow-y-auto overscroll-contain p-2'>
        {filteredConversations.length === 0 && (
          <div className='px-3 py-8 text-center text-sm text-gray-500'>
            没有找到匹配的聊天
          </div>
        )}

        {Object.entries(groups).map(([label, items]) => (
          <div key={label}>
            <div className='mt-4 mb-1 px-3 text-xs font-medium text-gray-500'>
              {label}
            </div>
            {items.map((c) => (
              <div
                key={c.id}
                className='group flex h-14 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 transition-colors hover:bg-gray-100 dark:hover:bg-white/5'
                onClick={() => handleSelect(c.id)}
              >
                <div className='flex min-w-0 flex-1 items-center gap-3'>
                  <svg
                    className='h-4 w-4 shrink-0 opacity-80'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
                    />
                  </svg>
                  {editingId === c.id ? (
                    <input
                      type='text'
                      className='h-7 min-w-0 flex-1 rounded border border-blue-400/50 bg-white px-1.5 py-0 text-sm leading-7 text-gray-900 shadow-sm outline-none focus:border-blue-500 dark:border-white/20 dark:bg-black/20 dark:text-white dark:focus:border-white/40'
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      onBlur={confirmRename}
                    />
                  ) : (
                    <div className='min-w-0 flex-1'>
                      <div
                        className={`truncate text-sm ${c.id === activeConversationId ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
                      >
                        {c.title}
                      </div>
                      <div className='mt-0.5 hidden text-[11px] leading-none text-gray-500 sm:block'>
                        {formatDetailTime(c.updatedAt)}
                      </div>
                    </div>
                  )}
                </div>
                <div
                  className={`flex shrink-0 items-center justify-end gap-1 overflow-hidden transition-all duration-150 ${editingId === c.id ? 'w-7 opacity-100' : 'w-0 opacity-0 group-focus-within:w-16 group-focus-within:opacity-100 group-hover:w-16 group-hover:opacity-100'}`}
                >
                  {editingId === c.id ? (
                    <HistoryActionButton
                      tooltip='确认'
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        confirmRename()
                      }}
                      className='rounded-md p-1.5 text-green-500 transition-colors hover:bg-gray-200 hover:text-green-600 dark:text-green-400 dark:hover:bg-white/10 dark:hover:text-green-300'
                    >
                      <svg
                        className='h-4 w-4'
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
                    </HistoryActionButton>
                  ) : (
                    <>
                      <HistoryActionButton
                        tooltip='重命名'
                        onClick={(e) => startRename(e, c.id, c.title)}
                        className='rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent disabled:hover:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white dark:disabled:text-gray-600 dark:disabled:hover:text-gray-600'
                        disabled={Boolean(agentGeneratingTitleIds[c.id])}
                      >
                        <EditIcon className='h-3.5 w-3.5' />
                      </HistoryActionButton>
                      <HistoryActionButton
                        tooltip='删除'
                        onClick={(e) => handleDelete(e, c.id)}
                        className='rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-red-500 dark:hover:bg-white/10 dark:hover:text-red-400'
                      >
                        <TrashIcon className='h-3.5 w-3.5' />
                      </HistoryActionButton>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
