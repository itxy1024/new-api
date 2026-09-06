import { createPortal } from 'react-dom'

import type { ApiProfile } from '../../types'
import { Checkbox } from '../Checkbox'
import { CloseIcon, CopyIcon } from '../icons'

export interface CopyImportUrlOptions {
  useNewApiAddress: boolean
  useNewApiKey: boolean
  useNewApiModel: boolean
}

interface ProfileImportUrlModalProps {
  profile: ApiProfile
  options: CopyImportUrlOptions
  onOptionsChange: (patch: Partial<CopyImportUrlOptions>) => void
  onCopy: (includeApiKey: boolean) => void
  onClose: () => void
}

export default function ProfileImportUrlModal({
  profile,
  options,
  onOptionsChange,
  onCopy,
  onClose,
}: ProfileImportUrlModalProps) {
  return createPortal(
    <div
      data-no-drag-select
      className='fixed inset-0 z-[110] flex items-center justify-center p-4'
      onClick={onClose}
    >
      <div className='animate-overlay-in absolute inset-0 bg-black/20 backdrop-blur-md dark:bg-black/40' />
      <div
        className='animate-confirm-in relative z-10 w-full max-w-sm rounded-3xl border border-white/50 bg-white/90 p-6 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/90 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10'
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type='button'
          onClick={onClose}
          className='absolute top-4 right-4 shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200'
          aria-label='关闭'
        >
          <CloseIcon className='h-5 w-5' />
        </button>

        <h3 className='mb-3 flex items-start gap-2.5 pr-8 text-base leading-snug font-bold text-gray-800 dark:text-gray-100'>
          <CopyIcon className='mt-0.5 h-5 w-5 shrink-0 text-blue-500' />
          <span>复制导入配置「{profile.name}」的 URL</span>
        </h3>
        <div className='mb-5 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400'>
          是否包含 API Key？如果选择「不包含」，可额外配置是否使用 New API
          变量。
        </div>

        <div className='mb-6 rounded-2xl bg-gray-50/80 p-4 ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/5'>
          <div className='mb-3.5 text-[13px] font-bold text-gray-700 dark:text-gray-300'>
            New API 变量配置
          </div>
          <div className='space-y-3'>
            <Checkbox
              checked={options.useNewApiAddress}
              onChange={(checked) =>
                onOptionsChange({ useNewApiAddress: checked })
              }
              label={
                <>
                  使用{' '}
                  <code className='mx-0.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-700 dark:bg-white/[0.08] dark:text-gray-200'>
                    {'{address}'}
                  </code>{' '}
                  (不含 /v1)
                </>
              }
            />
            <Checkbox
              checked={options.useNewApiKey}
              onChange={(checked) => onOptionsChange({ useNewApiKey: checked })}
              label={
                <>
                  使用{' '}
                  <code className='mx-0.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-700 dark:bg-white/[0.08] dark:text-gray-200'>
                    {'{key}'}
                  </code>
                </>
              }
            />
            <Checkbox
              checked={options.useNewApiModel}
              onChange={(checked) =>
                onOptionsChange({ useNewApiModel: checked })
              }
              label={
                <>
                  使用{' '}
                  <code className='mx-0.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-700 dark:bg-white/[0.08] dark:text-gray-200'>
                    {'{model}'}
                  </code>
                </>
              }
            />
          </div>
        </div>

        <div className='flex gap-2'>
          <button
            onClick={() => onCopy(false)}
            className='flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.06]'
          >
            不包含
          </button>
          <button
            onClick={() => onCopy(true)}
            className='flex-1 rounded-xl bg-blue-500 py-2 text-sm font-medium text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-600'
          >
            包含 API Key
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
