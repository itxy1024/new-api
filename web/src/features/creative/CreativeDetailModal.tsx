import { Copy, Download, Edit3, Star, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

type CreativeDetailItem = {
  id: string
  kind: 'image' | 'video'
  url: string
  createdAt: number
  model?: string
  prompt?: string
  size?: string
  favorite?: boolean
}

type CreativeDetailModalProps = {
  item: CreativeDetailItem
  onClose: () => void
  onPreview: () => void
  onReuse: () => void
  onEdit: () => void
  onDelete: () => void
  onFavorite: () => void
}

export function CreativeDetailModal(props: CreativeDetailModalProps) {
  const { t } = useTranslation()
  const prompt = props.item.prompt || t('No prompt')
  const copy = async (value: string, message: string) => {
    await navigator.clipboard?.writeText(value)
    toast.success(t(message))
  }
  const download = () => {
    const link = document.createElement('a')
    link.href = props.item.url
    link.download = `${props.item.kind}-${props.item.id}`
    link.click()
  }

  return (
    <div
      className='fixed inset-0 z-[75] flex items-center justify-center p-4'
      onClick={props.onClose}
    >
      <div className='absolute inset-0 bg-black/20 backdrop-blur-md dark:bg-black/50' />
      <div
        className='relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/95 shadow-2xl md:flex-row dark:border-white/[0.08] dark:bg-gray-900/95'
        onClick={(event) => event.stopPropagation()}
      >
        <div className='relative flex min-h-[18rem] items-center justify-center bg-gray-100 md:w-1/2 dark:bg-black/20'>
          {props.item.kind === 'image' ? (
            <button
              type='button'
              className='size-full cursor-zoom-in p-4'
              onClick={props.onPreview}
            >
              <img
                src={props.item.url}
                alt={t('Generated result')}
                className='size-full max-h-[75vh] object-contain'
              />
            </button>
          ) : (
            <video
              src={props.item.url}
              controls
              className='max-h-[75vh] max-w-full object-contain'
            />
          )}
          <button
            type='button'
            onClick={download}
            className='absolute top-4 right-4 rounded-lg bg-black/55 p-2 text-white hover:bg-black/70'
            aria-label={t('Download')}
          >
            <Download className='size-4' />
          </button>
        </div>
        <div className='flex min-h-[18rem] flex-1 flex-col overflow-y-auto p-6'>
          <button
            type='button'
            onClick={props.onClose}
            className='absolute top-4 right-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
            aria-label={t('Close')}
          >
            <X className='size-5' />
          </button>
          <div className='flex-1'>
            <div className='mb-2 flex items-center gap-2 text-xs font-medium tracking-wider text-gray-400 uppercase'>
              <span>{t('Input content')}</span>
              <button
                type='button'
                onClick={() => void copy(prompt, 'Copied')}
                className='rounded p-1 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                aria-label={t('Copy')}
              >
                <Copy className='size-4' />
              </button>
            </div>
            <p className='mb-6 text-sm leading-6 whitespace-pre-wrap text-gray-700 dark:text-gray-200'>
              {prompt}
            </p>
            <h3 className='mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase'>
              {t('Parameter configuration')}
            </h3>
            <div className='grid grid-cols-2 gap-2 text-xs'>
              {[
                [t('Source'), 'NewAPI'],
                [t('Model'), props.item.model || '-'],
                [t('Size'), props.item.size || 'auto'],
                [t('Quality'), 'auto'],
                [t('Format'), props.item.kind === 'image' ? 'png' : 'mp4'],
                [t('Transparent background'), 'false'],
                [t('Moderation'), 'auto'],
                [t('Quantity'), '1'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className='rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]'
                >
                  <div className='text-gray-400'>{label}</div>
                  <div className='mt-1 font-medium text-gray-700 dark:text-gray-200'>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div className='mt-5 text-xs text-gray-400'>
              {t('Created at')}{' '}
              {new Date(props.item.createdAt).toLocaleString()}
            </div>
          </div>
          <div className='mt-6 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-white/[0.08]'>
            <button
              type='button'
              onClick={props.onReuse}
              className='flex items-center gap-1.5 rounded-xl bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10'
            >
              <Copy className='size-4' />
              {t('Reuse configuration')}
            </button>
            <button
              type='button'
              onClick={props.onEdit}
              className='flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-100 dark:bg-green-500/10'
            >
              <Edit3 className='size-4' />
              {t('Edit output')}
            </button>
            <button
              type='button'
              onClick={props.onDelete}
              className='flex items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-500/10'
            >
              <Trash2 className='size-4' />
              {t('Delete task')}
            </button>
            <button
              type='button'
              onClick={props.onFavorite}
              className={`rounded-xl px-3 py-2 ${props.item.favorite ? 'bg-amber-50 text-amber-500' : 'bg-gray-50 text-gray-400'} hover:bg-amber-50`}
              aria-label={t('Favorites')}
            >
              <Star
                className={`size-5 ${props.item.favorite ? 'fill-current' : ''}`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
