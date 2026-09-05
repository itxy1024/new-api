/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
at your option any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/* oxlint-disable promise/no-callback-in-promise */
import { Link } from '@tanstack/react-router'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  HelpCircle,
  Loader2,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

type Mode = 'image' | 'video'
type ApiKeyOption = { id: number; name?: string; status: number }
type CreativeModel = { id: string; group?: string }
type StoredMedia = {
  id: string
  kind: Mode
  url: string
  createdAt: number
  model?: string
  prompt?: string
  size?: string
  blob?: Blob
  favorite?: boolean
}

const DB_NAME = 'newapi-creative'
const STORE_NAME = 'media'

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.addEventListener('upgradeneeded', () =>
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    )
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

async function loadMedia(kind: Mode): Promise<StoredMedia[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await openMediaDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
    request.addEventListener('success', () => {
      const items = (request.result as StoredMedia[])
        .filter((item) => item.kind === kind)
        .sort((a, b) => b.createdAt - a.createdAt)
      resolve(
        items.map((item) =>
          item.blob ? { ...item, url: URL.createObjectURL(item.blob) } : item
        )
      )
    })
    request.addEventListener('error', () => reject(request.error))
  })
}

async function saveMedia(item: StoredMedia): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openMediaDb()
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readwrite')
      .objectStore(STORE_NAME)
      .put(item)
    request.addEventListener('success', () => resolve())
    request.addEventListener('error', () => reject(request.error))
  })
}

async function cacheMedia(item: StoredMedia): Promise<StoredMedia> {
  try {
    const response = await fetch(item.url, { credentials: 'include' })
    if (!response.ok) return item
    const blob = await response.blob()
    await saveMedia({ ...item, blob })
    return { ...item, url: URL.createObjectURL(blob), blob }
  } catch {
    await saveMedia(item)
    return item
  }
}

function normalizeImageUrl(item: { url?: string; b64_json?: string }): string {
  return (
    item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
  )
}
function keyLabel(item: ApiKeyOption): string {
  return item.name?.trim() || 'API Key'
}
function chip(text: string) {
  return (
    <span className='bg-muted/70 text-muted-foreground inline-flex items-center rounded-md px-2 py-1 text-[11px] whitespace-nowrap'>
      {text}
    </span>
  )
}

export function CreativePage({ mode }: { mode: Mode }) {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<ApiKeyOption[]>([])
  const [keyId, setKeyId] = useState('')
  const [models, setModels] = useState<CreativeModel[]>([])
  const [model, setModel] = useState('')
  const [modelGroup, setModelGroup] = useState('')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(mode === 'image' ? 'auto' : '16:9')
  const [seconds, setSeconds] = useState('5')
  const [inputImage, setInputImage] = useState('')
  const [quality, setQuality] = useState('auto')
  const [outputFormat, setOutputFormat] = useState('png')
  const [compression, setCompression] = useState('100')
  const [moderation, setModeration] = useState('auto')
  const [transparentBackground, setTransparentBackground] = useState('false')
  const [quantity, setQuantity] = useState('1')
  const [retries, setRetries] = useState('0')
  const [interfaceMode, setInterfaceMode] = useState<'img' | 'resp'>('img')
  const [results, setResults] = useState<StoredMedia[]>([])
  const [busy, setBusy] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const selectedKey = useMemo(
    () => keys.find((item) => String(item.id) === keyId),
    [keys, keyId]
  )
  const selectedModelValue = modelGroup ? `${modelGroup}\x00${model}` : model
  const helper =
    mode === 'image'
      ? t('Describe the image you want to create.')
      : t('Describe the scene, motion, and style you want to create.')
  const canSubmit = Boolean(keyId && model && prompt.trim() && !busy)
  const filteredResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return results.filter((item) => {
      if (showFavorites && !item.favorite) return false
      if (!query) return true
      return `${item.prompt || ''} ${item.model || ''} ${item.size || ''}`
        .toLowerCase()
        .includes(query)
    })
  }, [results, searchTerm, showFavorites])

  useEffect(() => {
    api
      .get('/api/token/', { params: { p: 1, size: 100 } })
      .then((response) => {
        const raw = response.data?.data?.items ?? response.data?.data ?? []
        const enabled = (Array.isArray(raw) ? raw : []).filter(
          (item: ApiKeyOption) => Number(item.status) === 1
        )
        setKeys(enabled)
        setKeyId((current) =>
          current &&
          enabled.some((item: ApiKeyOption) => String(item.id) === current)
            ? current
            : String(enabled[0]?.id || '')
        )
      })
      .catch(() => toast.error(t('Failed to load creative keys')))
  }, [t])

  useEffect(() => {
    if (!keyId) {
      setModels([])
      setModel('')
      setModelGroup('')
      return
    }
    let active = true
    setModels([])
    setModel('')
    setModelGroup('')
    api
      .get('/api/creative/models', { params: { key_id: keyId } })
      .then((response) => {
        if (!active) return
        const raw = response.data?.data?.data ?? response.data?.data ?? []
        const next = (Array.isArray(raw) ? raw : [])
          .map(
            (item: string | { id?: string; name?: string; group?: string }) =>
              typeof item === 'string'
                ? { id: item }
                : { id: item.id || item.name || '', group: item.group }
          )
          .filter((item: CreativeModel) => Boolean(item.id))
        setModels(next)
        setModel(next[0]?.id || '')
        setModelGroup(next[0]?.group || '')
      })
      .catch(() => active && toast.error(t('Failed to load creative models')))
    return () => {
      active = false
    }
  }, [keyId, t])

  useEffect(() => {
    loadMedia(mode)
      .then(setResults)
      .catch(() => undefined)
  }, [mode])

  async function pollVideo(taskId: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await api.get(
        `/api/creative/videos/${encodeURIComponent(taskId)}`,
        { disableDuplicate: true }
      )
      const task = response.data?.data || response.data
      const status = String(task?.status || '').toLowerCase()
      if (['succeeded', 'success', 'completed'].includes(status)) {
        const item = await cacheMedia({
          id: taskId,
          kind: 'video',
          url: `/api/creative/videos/${encodeURIComponent(taskId)}/content`,
          createdAt: Date.now(),
          model,
          prompt,
          size,
        })
        setResults((current) => [item, ...current])
        return
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(task?.error?.message || t('Video generation failed'))
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
    throw new Error(t('Video generation timed out'))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      if (mode === 'image') {
        const response = await api.post('/api/creative/images', {
          key_id: Number(keyId),
          model,
          ...(modelGroup ? { group: modelGroup } : {}),
          prompt,
          size,
          quality,
          output_format: outputFormat,
          background: transparentBackground === 'true' ? 'transparent' : 'auto',
          output_compression:
            outputFormat === 'png' ? undefined : Number(compression),
          moderation,
          n: Number(quantity),
          interface_mode: interfaceMode,
          retry_count: Number(retries),
        })
        const raw = response.data?.data
        const items = Array.isArray(raw) ? raw : raw?.data || []
        const generated = items
          .map((item: { url?: string; b64_json?: string }) => ({
            id: crypto.randomUUID(),
            kind: 'image' as const,
            url: normalizeImageUrl(item),
            createdAt: Date.now(),
            model,
            prompt,
            size,
          }))
          .filter((item: StoredMedia) => item.url)
        const cached = await Promise.all(generated.map(cacheMedia))
        setResults((current) => [...cached, ...current])
      } else {
        const payload: Record<string, unknown> = {
          key_id: Number(keyId),
          model,
          ...(modelGroup ? { group: modelGroup } : {}),
          prompt,
          size,
          seconds: Number(seconds),
          retry_count: Number(retries),
        }
        if (inputImage.trim()) payload.images = [inputImage.trim()]
        const response = await api.post('/api/creative/videos', payload)
        const taskId =
          response.data?.id || response.data?.task_id || response.data?.data?.id
        if (!taskId) throw new Error(t('The video task did not return an id'))
        await pollVideo(String(taskId))
      }
      setPrompt('')
      toast.success(t('Generation submitted'))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Generation failed')
      )
    } finally {
      setBusy(false)
    }
  }

  async function toggleFavorite(item: StoredMedia) {
    const next = { ...item, favorite: !item.favorite }
    await saveMedia(next).catch(() => undefined)
    setResults((current) =>
      current.map((result) => (result.id === item.id ? next : result))
    )
  }

  async function removeResult(item: StoredMedia) {
    if (typeof indexedDB !== 'undefined') {
      const db = await openMediaDb().catch(() => null)
      if (db) {
        await new Promise<void>((resolve) => {
          const request = db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .delete(item.id)
          request.addEventListener('complete', () => resolve())
          request.addEventListener('error', () => resolve())
        })
      }
    }
    setResults((current) => current.filter((result) => result.id !== item.id))
  }

  return (
    <Main className='min-h-full overflow-hidden bg-white p-0 dark:bg-slate-950'>
      <div className='relative min-h-[calc(100vh-4rem)] bg-white dark:bg-slate-950'>
        <header className='sticky top-0 z-30 border-b bg-white/95 backdrop-blur dark:bg-slate-950/95'>
          <div className='flex h-[4.25rem] items-center justify-between px-5 md:px-10'>
            <h1 className='text-xl font-semibold tracking-tight'>
              {t('GPT Image Playground')}
            </h1>
            <div className='flex items-center gap-2'>
              <div className='bg-muted/60 flex items-center rounded-2xl border p-1'>
                <Link
                  to='/creative/image'
                  className={`rounded-xl px-5 py-2 text-sm ${mode === 'image' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                >
                  {t('Gallery')}
                </Link>
                <button
                  type='button'
                  disabled
                  className='text-muted-foreground rounded-xl px-5 py-2 text-sm opacity-70'
                >
                  {t('Agent')}
                </button>
              </div>
              <Button variant='ghost' size='icon-sm' aria-label={t('Download')}>
                <Download className='size-5' />
              </Button>
              <Button variant='ghost' size='icon-sm' aria-label={t('Help')}>
                <HelpCircle className='size-5' />
              </Button>
              <Button variant='ghost' size='icon-sm' aria-label={t('Settings')}>
                <Settings2 className='size-5' />
              </Button>
            </div>
          </div>
        </header>
        <section className='px-5 pt-7 pb-56 md:px-10'>
          <div className='mb-5 flex gap-3'>
            <Button
              variant={showFavorites ? 'secondary' : 'outline'}
              size='icon'
              className='size-12 rounded-2xl'
              onClick={() => setShowFavorites((value) => !value)}
              aria-label={t('Favorites')}
            >
              <Star
                className={`size-5 ${showFavorites ? 'fill-current' : ''}`}
              />
            </Button>
            <Button
              variant='outline'
              className='h-12 min-w-28 justify-between rounded-2xl px-4 text-sm'
            >
              {showFavorites ? t('Favorites') : t('All')}{' '}
              <ChevronDown className='size-4' />
            </Button>
            <div className='relative min-w-0 flex-1'>
              <Search className='text-muted-foreground absolute top-1/2 left-4 size-5 -translate-y-1/2' />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('Search prompts, parameters...')}
                className='h-12 rounded-2xl pl-12 text-sm'
              />
            </div>
          </div>
          {filteredResults.length > 0 && (
            <div className='grid grid-cols-[repeat(auto-fill,minmax(31rem,32rem))] gap-4'>
              {filteredResults.map((item) => (
                <article
                  key={item.id}
                  className='group bg-background flex h-50 overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md'
                >
                  <div className='bg-muted relative h-50 w-50 min-w-50 overflow-hidden'>
                    {item.kind === 'image' ? (
                      <img
                        src={item.url}
                        alt={t('Generated result')}
                        loading='lazy'
                        className='size-full object-cover'
                      />
                    ) : (
                      <video
                        src={item.url}
                        controls
                        className='size-full bg-black object-cover'
                      />
                    )}
                    <div className='absolute top-2 left-2 flex gap-1 text-[11px] font-semibold text-white'>
                      <span className='rounded bg-black/55 px-1.5 py-0.5'>
                        {item.size || size}
                      </span>
                      <span className='rounded bg-black/55 px-1.5 py-0.5'>
                        {item.kind === 'image' ? t('Image') : t('Video')}
                      </span>
                    </div>
                    <a
                      href={item.url}
                      download
                      className='absolute right-2 bottom-2 rounded-lg bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100'
                      aria-label={t('Download')}
                    >
                      <Download className='size-4' />
                    </a>
                  </div>
                  <div className='flex min-w-0 flex-1 flex-col p-4'>
                    <div className='flex min-h-0 flex-1 items-start gap-2'>
                      <p className='line-clamp-3 min-w-0 flex-1 text-sm leading-6'>
                        {item.prompt || helper}
                      </p>
                      <div className='flex shrink-0 items-center gap-1'>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-7 px-1.5 text-xs'
                          onClick={() => {
                            void navigator.clipboard?.writeText(
                              item.prompt || ''
                            )
                            toast.success(t('Copied'))
                          }}
                        >
                          {t('Copy')}
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-7 px-1.5 text-xs'
                          onClick={() => setPrompt(item.prompt || '')}
                        >
                          {t('Expand')}
                        </Button>
                      </div>
                    </div>
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {chip(t('Uncategorized'))}
                      {chip(new Date(item.createdAt).toLocaleDateString())}
                      {chip(t('Channel'))}
                      {chip(item.model || model)}
                      {chip(item.kind === 'image' ? t('Image') : t('Video'))}
                    </div>
                    <div className='mt-2 flex items-center justify-end gap-1 border-t pt-2'>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        className={`size-7 ${item.favorite ? 'text-amber-500' : 'text-muted-foreground'}`}
                        onClick={() => void toggleFavorite(item)}
                        aria-label={t('Favorites')}
                      >
                        <Star
                          className={`size-4 ${item.favorite ? 'fill-current' : ''}`}
                        />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        className='text-muted-foreground size-7'
                        onClick={() => setPrompt(item.prompt || '')}
                        aria-label={t('Reuse')}
                      >
                        <RotateCcw className='size-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        className='text-muted-foreground size-7'
                        onClick={() => setPrompt(item.prompt || '')}
                        aria-label={t('Edit')}
                      >
                        <Pencil className='size-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        className='text-muted-foreground size-7'
                        onClick={() => void removeResult(item)}
                        aria-label={t('Delete')}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                      <Check className='ml-1 size-4 text-emerald-500' />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <div className='fixed right-3 bottom-3 left-3 z-40 mx-auto max-w-6xl md:right-8 md:bottom-5 md:left-8'>
          <div className='bg-background/95 border-border/70 overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-2xl'>
            <div className='flex items-center gap-2 border-b px-3 py-2 md:px-4'>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  mode === 'image'
                    ? t(
                        'Describe the image you want to create, or type @ to reference an image...'
                      )
                    : helper
                }
                rows={1}
                className='min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0'
              />
              <Button
                variant='ghost'
                size='icon-sm'
                onClick={() => setPrompt('')}
                aria-label={t('Clear')}
              >
                <Trash2 className='size-4' />
              </Button>
              {mode === 'video' && (
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => fileRef.current?.click()}
                  aria-label={t('Attach reference image')}
                >
                  <Paperclip className='size-4' />
                </Button>
              )}
              <Button
                size='icon'
                className='rounded-xl bg-sky-500 text-white hover:bg-sky-600'
                onClick={submit}
                disabled={!canSubmit}
                aria-label={busy ? t('Generating...') : t('Generate')}
              >
                {busy ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <ArrowUp className='size-4' />
                )}
              </Button>
            </div>
            <div className='flex flex-wrap items-end gap-2 px-3 py-3 md:px-4'>
              <label className='min-w-36 flex-1 text-xs'>
                <span className='text-muted-foreground ml-1'>
                  {t('API Key')}
                </span>
                <Select
                  value={keyId}
                  onValueChange={(value) => {
                    if (value == null) return
                    setKeyId(String(value))
                    setModels([])
                    setModel('')
                    setModelGroup('')
                  }}
                >
                  <SelectTrigger className='mt-1 h-9 w-full rounded-xl'>
                    <SelectValue placeholder={t('Select an API key')}>
                      {() =>
                        selectedKey
                          ? keyLabel(selectedKey)
                          : t('Select an API key')
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {keys.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {keyLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className='min-w-36 flex-1 text-xs'>
                <span className='text-muted-foreground ml-1'>{t('Model')}</span>
                <Select
                  key={`model-${keyId}`}
                  value={selectedModelValue}
                  onValueChange={(value) => {
                    if (value == null) return
                    const selected = models.find(
                      (item) =>
                        `${item.group || ''}\x00${item.id}` === String(value)
                    )
                    setModel(
                      selected?.id || String(value).split('\x00').pop() || ''
                    )
                    setModelGroup(selected?.group || '')
                  }}
                >
                  <SelectTrigger
                    className='mt-1 h-9 w-full rounded-xl'
                    disabled={!models.length}
                  >
                    <SelectValue placeholder={t('Select a model')}>
                      {() => model || t('Select a model')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((item) => (
                      <SelectItem
                        key={`${item.group || 'default'}-${item.id}`}
                        value={`${item.group || ''}\x00${item.id}`}
                      >
                        {item.id}
                        {item.group ? ` · ${item.group}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {mode === 'image' && (
                <label className='text-xs'>
                  <span className='text-muted-foreground ml-1'>
                    {t('Interface mode')}
                  </span>
                  <div className='bg-muted mt-1 flex h-9 items-center rounded-xl p-1'>
                    {(['img', 'resp'] as const).map((item) => (
                      <button
                        key={item}
                        type='button'
                        onClick={() => setInterfaceMode(item)}
                        className={`h-7 rounded-lg px-3 text-xs ${interfaceMode === item ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </label>
              )}
              <label className='w-24 text-xs'>
                <span className='text-muted-foreground ml-1'>
                  {mode === 'image' ? t('Size') : t('Aspect ratio')}
                </span>
                <Input
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  className='mt-1 h-9 rounded-xl'
                />
              </label>
              {mode === 'image' ? (
                <>
                  <label className='w-24 text-xs'>
                    <span className='text-muted-foreground ml-1'>
                      {t('Quality')}
                    </span>
                    <Select
                      value={quality}
                      onValueChange={(value) =>
                        value != null && setQuality(String(value))
                      }
                    >
                      <SelectTrigger className='mt-1 h-9 rounded-xl'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['auto', 'high', 'medium', 'low'].map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className='w-24 text-xs'>
                    <span className='text-muted-foreground ml-1'>
                      {t('Format')}
                    </span>
                    <Select
                      value={outputFormat}
                      onValueChange={(value) =>
                        value != null && setOutputFormat(String(value))
                      }
                    >
                      <SelectTrigger className='mt-1 h-9 rounded-xl'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['png', 'jpeg', 'webp'].map((item) => (
                          <SelectItem key={item} value={item}>
                            {item.toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className='w-28 text-xs'>
                    <span className='text-muted-foreground ml-1'>
                      {t('Transparent background')}
                    </span>
                    <Select
                      value={transparentBackground}
                      onValueChange={(value) =>
                        value != null && setTransparentBackground(String(value))
                      }
                    >
                      <SelectTrigger className='mt-1 h-9 rounded-xl'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='false'>false</SelectItem>
                        <SelectItem value='true'>true</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className='w-24 text-xs'>
                    <span className='text-muted-foreground ml-1'>
                      {t('Moderation')}
                    </span>
                    <Select
                      value={moderation}
                      onValueChange={(value) =>
                        value != null && setModeration(String(value))
                      }
                    >
                      <SelectTrigger className='mt-1 h-9 rounded-xl'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='auto'>auto</SelectItem>
                        <SelectItem value='low'>low</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className='w-20 text-xs'>
                    <span className='text-muted-foreground ml-1'>
                      {t('Quantity')}
                    </span>
                    <Input
                      type='number'
                      min={1}
                      max={10}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className='mt-1 h-9 rounded-xl'
                    />
                  </label>
                </>
              ) : (
                <label className='w-24 text-xs'>
                  <span className='text-muted-foreground ml-1'>
                    {t('Duration (seconds)')}
                  </span>
                  <Input
                    type='number'
                    min={1}
                    max={60}
                    value={seconds}
                    onChange={(event) => setSeconds(event.target.value)}
                    className='mt-1 h-9 rounded-xl'
                  />
                </label>
              )}
              <Button
                variant={showAdvanced ? 'secondary' : 'outline'}
                size='icon'
                className='h-9 w-9 rounded-xl'
                onClick={() => setShowAdvanced((value) => !value)}
                aria-label={t('Advanced options')}
              >
                <Settings2 className='size-4' />
              </Button>
              <Button
                className='h-9 rounded-xl bg-sky-500 px-5 text-white hover:bg-sky-600'
                onClick={submit}
                disabled={!canSubmit}
              >
                {busy ? (
                  <Loader2 className='mr-2 size-4 animate-spin' />
                ) : (
                  <Sparkles className='mr-2 size-4' />
                )}
                {busy ? t('Generating...') : t('Generate')}
              </Button>
            </div>
            {showAdvanced && (
              <div className='bg-muted/30 border-t px-3 py-3 md:px-4'>
                <div className='grid gap-3 sm:grid-cols-3'>
                  {mode === 'image' && (
                    <label className='text-xs'>
                      <span className='text-muted-foreground'>
                        {t('Compression')}
                      </span>
                      <Input
                        type='number'
                        min={0}
                        max={100}
                        value={compression}
                        onChange={(event) => setCompression(event.target.value)}
                        disabled={outputFormat === 'png'}
                        className='mt-1 h-9 rounded-xl'
                      />
                    </label>
                  )}
                  {mode === 'video' && (
                    <label className='text-xs sm:col-span-2'>
                      <span className='text-muted-foreground'>
                        {t('Input image URL')}
                      </span>
                      <Input
                        value={inputImage}
                        onChange={(event) => setInputImage(event.target.value)}
                        placeholder='https://...'
                        className='mt-1 h-9 rounded-xl'
                      />
                    </label>
                  )}
                  <label className='text-xs'>
                    <span className='text-muted-foreground'>
                      {t('Retries')}
                    </span>
                    <Input
                      type='number'
                      min={0}
                      max={5}
                      value={retries}
                      onChange={(event) => setRetries(event.target.value)}
                      className='mt-1 h-9 rounded-xl'
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type='file'
          accept='image/*'
          className='hidden'
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.addEventListener('load', () => {
              if (typeof reader.result === 'string') {
                setInputImage(reader.result)
              }
            })
            reader.readAsDataURL(file)
          }}
        />
      </div>
    </Main>
  )
}
