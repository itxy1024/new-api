import { useTranslation } from 'react-i18next'

import type { AppSettings } from '../../types'

interface BasicSettingsTabProps {
  draft: AppSettings
  commitSettings: (nextDraft: AppSettings) => void
}

export default function BasicSettingsTab({
  draft,
  commitSettings,
}: BasicSettingsTabProps) {
  const { t } = useTranslation()

  return (
    <div className='space-y-4'>
      <div className='block'>
        <label
          className='mb-1 block text-sm text-gray-600 dark:text-gray-300'
          htmlFor='creative-default-image-model-keyword'
        >
          {t('Default image model keyword')}
        </label>
        <input
          id='creative-default-image-model-keyword'
          value={draft.defaultImageModelKeyword}
          onChange={(event) =>
            commitSettings({
              ...draft,
              defaultImageModelKeyword: event.target.value,
            })
          }
          className='w-full rounded-xl border border-gray-200/60 bg-white/50 px-3 py-2 text-sm text-gray-700 shadow-sm transition outline-none hover:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]'
          placeholder={t('For example, image')}
          autoComplete='off'
        />
        <p
          data-selectable-text
          className='mt-1.5 text-xs text-gray-500 dark:text-gray-500'
        >
          {t(
            'When the model name contains this keyword, it can be selected automatically on page load.'
          )}
        </p>
      </div>
    </div>
  )
}
