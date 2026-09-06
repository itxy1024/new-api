import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useVersionCheck } from '../hooks/useVersionCheck'
import { useStore } from '../store'
import { useFavoriteCollectionTitle } from './FavoriteCollections'
import HistoryModal from './HistoryModal'
import { EditIcon, HistoryIcon } from './icons'

export default function Header() {
  const { t } = useTranslation()
  const appMode = useStore((s) => s.appMode)
  const setAppMode = useStore((s) => s.setAppMode)
  const agentMobileHeaderVisible = useStore((s) => s.agentMobileHeaderVisible)
  const agentConversations = useStore((s) => s.agentConversations)
  const activeAgentConversationId = useStore((s) => s.activeAgentConversationId)
  const activeFavoriteCollectionId = useStore(
    (s) => s.activeFavoriteCollectionId
  )
  const activeConversation = agentConversations.find(
    (item) => item.id === activeAgentConversationId
  )
  const favoriteCollectionTitle = useFavoriteCollectionTitle()
  const showFavoriteCollectionTitle =
    appMode === 'gallery' && Boolean(activeFavoriteCollectionId)
  const { hasUpdate, latestRelease, dismiss } = useVersionCheck()
  const [hintVisible, setHintVisible] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const createConversation = useStore((s) => s.createAgentConversation)
  // NewAPI 创作中心只提供画廊模式，避免将 Key ID 当作 Agent 的 Bearer 密钥。
  const agentEnabled = false

  useEffect(() => {
    if (agentEnabled && appMode === 'agent') {
      setScrollDirection('up')
      return
    }

    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          if (currentScrollY < 20) {
            setScrollDirection('up')
          } else if (currentScrollY > lastScrollY + 10) {
            setScrollDirection('down')
          } else if (currentScrollY < lastScrollY - 10) {
            setScrollDirection('up')
          }
          lastScrollY = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [appMode])

  useEffect(() => {
    if (agentEnabled && appMode === 'agent' && !agentMobileHeaderVisible) {
      setHintVisible(true)
      const timer = setTimeout(() => {
        setHintVisible(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [appMode, agentMobileHeaderVisible])

  return (
    <>
      <header
        data-no-drag-select
        className={`safe-area-top sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur transition-transform duration-300 ease-in-out dark:border-white/[0.08] dark:bg-gray-950/80 ${agentEnabled && appMode === 'agent' && !agentMobileHeaderVisible ? '-translate-y-full sm:translate-y-0' : 'translate-y-0'}`}
      >
        <div className='safe-area-x safe-header-inner relative mx-auto flex max-w-7xl items-center justify-between'>
          <div className='flex min-w-0 flex-1 items-center gap-2 pr-2'>
            <h1 className='relative mr-2 inline-flex min-w-0 items-start'>
              <span className='truncate text-[17px] font-bold tracking-tight text-gray-800 sm:text-lg dark:text-gray-100'>
                {t('小鱼AI生图')}
              </span>
              {hasUpdate && latestRelease && (
                <a
                  href={latestRelease.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={dismiss}
                  className='animate-fade-in absolute -top-1 -right-1 translate-x-full -translate-y-1/4 rounded-[4px] border border-red-500/30 bg-red-500 px-1 py-0.5 text-[9px] leading-none font-black text-white shadow-sm transition-all hover:bg-red-600'
                  title={`新版本 ${latestRelease.tag}`}
                >
                  NEW
                </a>
              )}
            </h1>
            {agentEnabled && appMode === 'agent' && (
              <div className='relative hidden items-center gap-1 sm:flex'>
                <button
                  ref={historyButtonRef}
                  type='button'
                  onClick={() => setShowHistoryModal((visible) => !visible)}
                  className='rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.04] dark:hover:text-gray-200'
                  title='历史任务'
                >
                  <HistoryIcon className='h-5 w-5' />
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setAppMode('agent')
                    createConversation()
                  }}
                  className='rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.04] dark:hover:text-gray-200'
                  title='新对话'
                >
                  <EditIcon className='h-5 w-5' />
                </button>
                {showHistoryModal && (
                  <HistoryModal
                    onClose={() => setShowHistoryModal(false)}
                    ignoreOutsideClickRef={historyButtonRef}
                  />
                )}
              </div>
            )}
          </div>
          {agentEnabled && appMode === 'agent' && activeConversation && (
            <div className='absolute top-1/2 left-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 sm:flex'>
              <button
                type='button'
                onClick={() => {
                  setShowHistoryModal(true)
                  // Use setTimeout to ensure HistoryModal is mounted before setting editing id
                  setTimeout(() => {
                    useStore
                      .getState()
                      .setAgentEditingConversationId(activeConversation.id)
                  }, 0)
                }}
                className='truncate rounded px-2 py-1 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.04]'
              >
                {activeConversation.title || 'Agent'}
              </button>
            </div>
          )}
          {showFavoriteCollectionTitle && (
            <div className='absolute top-1/2 left-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 sm:flex'>
              <div
                className='truncate rounded px-2 py-1 text-sm font-semibold text-gray-700 dark:text-gray-300'
                title={favoriteCollectionTitle}
              >
                {favoriteCollectionTitle}
              </div>
            </div>
          )}
          {agentEnabled && (
            <div className='mr-4 hidden items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/70 p-1 sm:flex dark:border-white/[0.08] dark:bg-white/[0.04]'>
              <button
                type='button'
                onClick={() => setAppMode('gallery')}
                className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${appMode === 'gallery' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                画廊
              </button>
              <button
                type='button'
                onClick={() => setAppMode('agent')}
                className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${appMode === 'agent' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                Agent
              </button>
            </div>
          )}
        </div>
        {agentEnabled && (
          <div
            className={`safe-area-x overflow-hidden transition-all duration-300 ease-in-out sm:hidden ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 pb-0 opacity-0' : 'max-h-20 pb-2 opacity-100'}`}
          >
            <div className='mx-2 grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-gray-100/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]'>
              <button
                type='button'
                onClick={() => setAppMode('gallery')}
                className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${appMode === 'gallery' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                画廊
              </button>
              <button
                type='button'
                onClick={() => setAppMode('agent')}
                className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${appMode === 'agent' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
              >
                Agent
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hint for sliding down */}
      <div
        className={`pointer-events-none fixed top-0 right-0 left-0 z-30 flex justify-center transition-all duration-300 ease-in-out sm:hidden ${agentEnabled && appMode === 'agent' && hintVisible && !agentMobileHeaderVisible ? 'translate-y-[env(safe-area-inset-top,0px)] opacity-100' : '-translate-y-full opacity-0'}`}
      >
        <div className='rounded-b-xl bg-black/60 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm'>
          下拉展示顶栏
        </div>
      </div>
    </>
  )
}
