import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'

import {
  calculateImageSize,
  findPresetForSize,
  normalizeImageSize,
  parseRatio,
  parseSize,
  type PresetRatio,
  type SizeTier,
} from './size'

type SizePickerModalProps = {
  currentSize: string
  mode: 'image' | 'video'
  onSelect: (size: string) => void
  onClose: () => void
}
const TIERS: SizeTier[] = ['1K', '2K', '4K']
const RATIOS: Array<{ label: PresetRatio; value: PresetRatio }> = [
  { label: '1:1', value: '1:1' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '21:9', value: '21:9' },
]
type Panel = 'auto' | 'ratio' | 'resolution'

function getPanelLabel(panel: Panel, translate: (key: string) => string) {
  if (panel === 'auto') return translate('Auto')
  if (panel === 'ratio') return translate('By aspect ratio')
  return translate('Custom height')
}

export function SizePickerModal(props: SizePickerModalProps) {
  const { t } = useTranslation()
  const modalRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<Panel>(() => {
    if (props.currentSize === 'auto' || !props.currentSize) return 'auto'
    if (findPresetForSize(props.currentSize)) return 'ratio'
    return 'resolution'
  })
  const preset = findPresetForSize(props.currentSize)
  const parsed = parseSize(props.currentSize)
  const [tier, setTier] = useState<SizeTier>(preset?.tier ?? '1K')
  const [ratio, setRatio] = useState<PresetRatio | 'custom'>(
    preset?.ratio ?? '1:1'
  )
  const [customRatio, setCustomRatio] = useState('16:9')
  const [width, setWidth] = useState(parsed?.width ?? '1024')
  const [height, setHeight] = useState(parsed?.height ?? '1024')

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const activeRatio = ratio === 'custom' ? customRatio : ratio
  const validCustomRatio =
    ratio !== 'custom' || Boolean(parseRatio(customRatio))
  const previewSize = useMemo(() => {
    if (panel === 'auto') return 'auto'
    if (panel === 'ratio') return calculateImageSize(tier, activeRatio) || ''
    const w = Number.parseInt(width, 10)
    const h = Number.parseInt(height, 10)
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
      ? normalizeImageSize(`${w}x${h}`)
      : ''
  }, [activeRatio, height, panel, tier, width])
  const isClamped =
    panel === 'resolution' && previewSize !== `${width}x${height}`

  function handleBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) props.onClose()
  }

  return (
    <div
      className='fixed inset-0 z-[70] flex items-center justify-center p-4'
      onMouseDown={handleBackdrop}
    >
      <div className='animate-overlay-in absolute inset-0 bg-black/30 backdrop-blur-sm' />
      <div
        ref={modalRef}
        className='animate-modal-in relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10'
      >
        <div className='mb-5 flex items-start justify-between gap-4'>
          <div>
            <h3 className='text-base font-semibold text-gray-800 dark:text-gray-100'>
              {t('Set image size')}
            </h3>
            <p className='mt-1 text-xs text-gray-400 dark:text-gray-500'>
              {t('Current')}: {props.currentSize || 'auto'}
            </p>
          </div>
          <button
            type='button'
            onClick={props.onClose}
            className='rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600'
            aria-label={t('Close')}
          >
            <svg
              className='size-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>
        <div className='space-y-6'>
          <div className='flex rounded-xl bg-gray-100/80 p-1 dark:bg-white/[0.04]'>
            {(['auto', 'ratio', 'resolution'] as Panel[]).map((item) => (
              <button
                key={item}
                type='button'
                onClick={() => setPanel(item)}
                className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${panel === item ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              >
                {getPanelLabel(item, t)}
              </button>
            ))}
          </div>
          <div className='h-[380px] max-h-[55vh] overflow-y-auto pr-1'>
            {panel === 'auto' && (
              <div className='flex h-full items-center justify-center pt-8 pb-4 text-center'>
                <div>
                  <div className='mb-4 inline-flex size-16 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10'>
                    <svg
                      className='size-8'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M13 10V3L4 14h7v7l9-11h-7z'
                      />
                    </svg>
                  </div>
                  <h4 className='text-sm font-medium'>{t('Auto size')}</h4>
                  <p className='mt-2 text-xs leading-relaxed text-gray-400'>
                    {t('The model decides the output size.')}
                    <br />
                    {t('No resolution parameter is sent.')}
                  </p>
                </div>
              </div>
            )}
            {panel === 'ratio' && (
              <div className='space-y-5'>
                <section>
                  <div className='mb-2 text-xs font-medium text-gray-400'>
                    {t('Base resolution')}
                  </div>
                  <div className='grid grid-cols-3 gap-2'>
                    {TIERS.map((item) => (
                      <button
                        key={item}
                        type='button'
                        onClick={() => setTier(item)}
                        className={`rounded-xl border px-3 py-2 text-sm transition ${tier === item ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-500/10' : 'border-gray-200/70 bg-white/60 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300'}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
                <section>
                  <div className='mb-2 text-xs font-medium text-gray-400'>
                    {t('Aspect ratio')}
                  </div>
                  <div className='grid grid-cols-4 gap-2'>
                    {RATIOS.map((item) => {
                      const [w, h] = item.value.split(':').map(Number)
                      const horizontal = w >= h
                      return (
                        <button
                          key={item.value}
                          type='button'
                          onClick={() => setRatio(item.value)}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm ${ratio === item.value ? 'border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-500/10' : 'border-gray-200/70 bg-white/60 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300'}`}
                        >
                          <span className='flex size-5 items-center justify-center'>
                            <span
                              className='border-[1.5px] border-current opacity-60'
                              style={{
                                width: horizontal
                                  ? '100%'
                                  : `${(w / h) * 100}%`,
                                height: horizontal
                                  ? `${(h / w) * 100}%`
                                  : '100%',
                              }}
                            />
                          </span>
                          <span className='text-xs'>{item.label}</span>
                        </button>
                      )
                    })}
                    <button
                      type='button'
                      onClick={() => setRatio('custom')}
                      className={`col-span-4 rounded-xl border px-3 py-2 text-sm ${ratio === 'custom' ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-200/70 bg-white/60 text-gray-600'}`}
                    >
                      {t('Custom ratio')}
                    </button>
                  </div>
                </section>
                {ratio === 'custom' && (
                  <label className='block text-xs'>
                    <span className='mb-2 block font-medium text-gray-400'>
                      {t('Enter custom ratio')}
                    </span>
                    <Input
                      value={customRatio}
                      onChange={(event) => setCustomRatio(event.target.value)}
                      placeholder='5:4 / 2.39:1'
                      className={validCustomRatio ? '' : 'border-red-300'}
                    />
                  </label>
                )}
              </div>
            )}
            {panel === 'resolution' && (
              <div className='space-y-5'>
                <div className='text-xs font-medium text-gray-400'>
                  {t('Enter pixel dimensions')}
                </div>
                <div className='flex items-center gap-4'>
                  <label className='flex-1 text-xs'>
                    <span className='mb-1.5 block text-gray-500'>
                      {t('Width')}
                    </span>
                    <Input
                      type='number'
                      value={width}
                      onChange={(event) => setWidth(event.target.value)}
                    />
                  </label>
                  <span className='mt-5 text-gray-300'>×</span>
                  <label className='flex-1 text-xs'>
                    <span className='mb-1.5 block text-gray-500'>
                      {t('Height')}
                    </span>
                    <Input
                      type='number'
                      value={height}
                      onChange={(event) => setHeight(event.target.value)}
                    />
                  </label>
                </div>
                <div className='rounded-xl border border-gray-200/80 bg-gray-50/80 p-3 text-xs text-gray-600 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-gray-400'>
                  <div className='flex items-start gap-2'>
                    <svg
                      className='mt-0.5 size-4 shrink-0 text-blue-500'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                      />
                    </svg>
                    <span>
                      {t(
                        'Unsupported dimensions are normalized automatically.'
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className='rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]'>
            <div className='text-xs text-gray-400'>{t('Using')}</div>
            <div className='mt-1 flex items-center gap-2'>
              <span className='font-mono text-lg font-semibold text-gray-800 dark:text-gray-100'>
                {previewSize || t('Invalid size')}
              </span>
              {isClamped && (
                <span className='text-xs text-amber-500'>{t('Adjusted')}</span>
              )}
            </div>
          </div>
        </div>
        <div className='mt-5 flex gap-2'>
          <button
            type='button'
            onClick={props.onClose}
            className='flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300'
          >
            {t('Cancel')}
          </button>
          <button
            type='button'
            disabled={!previewSize || !validCustomRatio}
            onClick={() => {
              if (previewSize) props.onSelect(previewSize)
              props.onClose()
            }}
            className='flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
