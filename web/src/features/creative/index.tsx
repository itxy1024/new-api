import {
  Download,
  Loader2,
  Maximize2,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Video as VideoIcon,
} from 'lucide-react'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/* oxlint-disable promise/no-callback-in-promise */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
type ApiKeyOption = { id: number; name: string; key: string; status: number }
type StoredMedia = {
  id: string
  kind: Mode
  url: string
  createdAt: number
  blob?: Blob
}

const DB_NAME = 'newapi-creative'
const STORE_NAME = 'media'

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadMedia(kind: Mode): Promise<StoredMedia[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await openMediaDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const items = (request.result as StoredMedia[])
        .filter((item) => item.kind === kind)
        .sort((a, b) => b.createdAt - a.createdAt)
      resolve(
        items.map((item) =>
          item.blob ? { ...item, url: URL.createObjectURL(item.blob) } : item
        )
      )
    }
    request.onerror = () => reject(request.error)
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
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
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
  if (item.url) return item.url
  return item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''
}

function getKeyLabel(item: ApiKeyOption): string {
  const name = item.name?.trim()
  const maskedKey = item.key?.trim()
  if (name && maskedKey) return `${name} · ${maskedKey}`
  return name || maskedKey || 'API Key'
}

export function CreativePage({ mode }: { mode: Mode }) {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<ApiKeyOption[]>([])
  const [keyId, setKeyId] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(mode === 'image' ? '1024x1024' : '16:9')
  const [seconds, setSeconds] = useState('5')
  const [advanced, setAdvanced] = useState('')
  const [inputImage, setInputImage] = useState('')
  const [results, setResults] = useState<StoredMedia[]>([])
  const [busy, setBusy] = useState(false)
  const selectedKey = useMemo(
    () => keys.find((item) => String(item.id) === keyId),
    [keys, keyId]
  )

  useEffect(() => {
    api
      .get('/api/token/', { params: { p: 1, size: 100 } })
      .then((response) => {
        const rawItems = response.data?.data?.items ?? response.data?.data ?? []
        const next = (Array.isArray(rawItems) ? rawItems : []) as ApiKeyOption[]
        const enabled = next.filter((item) => Number(item.status) === 1)
        setKeys(enabled)
        setKeyId((current) =>
          current && enabled.some((item) => String(item.id) === current)
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
      return
    }
    let active = true
    setModels([])
    setModel('')
    api
      .get('/api/creative/models', { params: { key_id: keyId } })
      .then((response) => {
        if (!active) return
        const next = Array.isArray(response.data?.data)
          ? (response.data.data as Array<string | { id?: string }>)
              .map((item) => (typeof item === 'string' ? item : item.id || ''))
              .filter(Boolean)
          : []
        setModels(next)
        setModel((current) =>
          current && next.includes(current) ? current : next[0] || ''
        )
      })
      .catch(() => {
        if (active) toast.error(t('Failed to load creative models'))
      })
    return () => {
      active = false
    }
  }, [keyId, t])

  useEffect(() => {
    loadMedia(mode)
      .then(setResults)
      .catch(() => undefined)
  }, [mode])

  const title =
    mode === 'image' ? t('AI Image Generation') : t('Video Generation')
  const canSubmit = Boolean(keyId && model && prompt.trim() && !busy)
  const helper = useMemo(
    () =>
      mode === 'image'
        ? t('Describe the image you want to create.')
        : t('Describe the scene, motion, and style you want to create.'),
    [mode, t]
  )

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      const metadata = advanced.trim() ? JSON.parse(advanced) : {}
      if (mode === 'image') {
        const response = await api.post('/api/creative/images', {
          key_id: Number(keyId),
          model,
          prompt,
          size,
          ...metadata,
        })
        const items = Array.isArray(response.data?.data)
          ? response.data.data
          : []
        const media = items
          .map((item: { url?: string; b64_json?: string }) => ({
            id: crypto.randomUUID(),
            kind: mode,
            url: normalizeImageUrl(item),
            createdAt: Date.now(),
          }))
          .filter((item: StoredMedia) => item.url)
        const cached = await Promise.all(media.map(cacheMedia))
        setResults((current) => [...cached, ...current])
      } else {
        const payload: Record<string, unknown> = {
          key_id: Number(keyId),
          model,
          prompt,
          size,
          seconds: Number(seconds),
          metadata,
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
      let message = t('Generation failed')
      if (error instanceof SyntaxError) message = t('Advanced JSON is invalid')
      else if (error instanceof Error) message = error.message
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function pollVideo(taskId: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await api.get(
        `/api/creative/videos/${encodeURIComponent(taskId)}`,
        { disableDuplicate: true }
      )
      const task = response.data?.data || response.data
      const status = String(task?.status || '').toLowerCase()
      if (['succeeded', 'success', 'completed'].includes(status)) {
        const url = `/api/creative/videos/${encodeURIComponent(taskId)}/content`
        const item = {
          id: taskId,
          kind: 'video' as const,
          url,
          createdAt: Date.now(),
        }
        const cached = await cacheMedia(item)
        setResults((current) => [cached, ...current])
        return
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(task?.error?.message || t('Video generation failed'))
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
    throw new Error(t('Video generation timed out'))
  }

  return (
    <Main className='bg-muted/20 min-h-full p-3 md:p-6'>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-5'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div className='flex items-center gap-3'>
            {mode === 'image' ? (
              <div className='bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl'>
                <Sparkles className='size-6' aria-hidden='true' />
              </div>
            ) : (
              <div className='bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl'>
                <VideoIcon className='size-6' aria-hidden='true' />
              </div>
            )}
            <div>
              <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
              <p className='text-muted-foreground text-sm'>
                {t('Powered by your selected NewAPI API key')}
              </p>
            </div>
          </div>
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <span className='bg-background rounded-full border px-3 py-1.5'>
              {selectedKey ? getKeyLabel(selectedKey) : t('Select an API key')}
            </span>
            <span className='bg-background rounded-full border px-3 py-1.5'>
              {models.length} {t('Model')}
            </span>
          </div>
        </div>
        <Card>
          <CardHeader className='border-b'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle>{t('Create')}</CardTitle>
                <p className='text-muted-foreground mt-1 text-xs'>{helper}</p>
              </div>
              <Settings2
                className='text-muted-foreground size-5'
                aria-hidden='true'
              />
            </div>
          </CardHeader>
          <CardContent className='grid gap-5 pt-1'>
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='grid gap-2 text-sm'>
                <span>{t('API Key')}</span>
                <Select
                  value={keyId}
                  onValueChange={(value) => {
                    if (value == null) return
                    setKeyId(String(value))
                    setModels([])
                    setModel('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select an API key')}>
                      {(value: string | null) => {
                        const item = keys.find(
                          (candidate) => String(candidate.id) === String(value)
                        )
                        return item ? getKeyLabel(item) : t('Select an API key')
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {keys.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {getKeyLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className='grid gap-2 text-sm'>
                <span>{t('Model')}</span>
                <Select
                  key={`model-${keyId}`}
                  value={model}
                  onValueChange={(value) => setModel(String(value))}
                >
                  <SelectTrigger disabled={!models.length}>
                    <SelectValue placeholder={t('Select a model')}>
                      {(value: string | null) => value || t('Select a model')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className='grid gap-2 text-sm'>
              <span>{t('Prompt')}</span>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={helper}
                rows={6}
                className='min-h-36 resize-y text-base'
              />
            </label>
            <div className='grid gap-4 md:grid-cols-3'>
              <label className='grid gap-2 text-sm'>
                <span>{mode === 'image' ? t('Size') : t('Aspect ratio')}</span>
                <Input
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                />
              </label>
              {mode === 'video' && (
                <label className='grid gap-2 text-sm'>
                  <span>{t('Duration (seconds)')}</span>
                  <Input
                    type='number'
                    min={1}
                    max={60}
                    value={seconds}
                    onChange={(event) => setSeconds(event.target.value)}
                  />
                </label>
              )}
              {mode === 'video' && (
                <label className='grid gap-2 text-sm'>
                  <span>{t('Input image URL')}</span>
                  <Input
                    value={inputImage}
                    onChange={(event) => setInputImage(event.target.value)}
                    placeholder='https://...'
                  />
                </label>
              )}
            </div>
            <label className='grid gap-2 text-sm'>
              <span>{t('Advanced JSON')}</span>
              <Textarea
                value={advanced}
                onChange={(event) => setAdvanced(event.target.value)}
                placeholder='{"quality":"high"}'
                rows={3}
              />
            </label>
            <Button
              className='h-10 w-full md:w-fit md:min-w-40'
              onClick={submit}
              disabled={!canSubmit}
            >
              {busy ? (
                <Loader2
                  className='mr-2 size-4 animate-spin'
                  aria-hidden='true'
                />
              ) : (
                <Upload className='mr-2 size-4' aria-hidden='true' />
              )}
              {busy ? t('Generating...') : t('Generate')}
            </Button>
          </CardContent>
        </Card>
        <section className='grid gap-3'>
          <div className='flex items-center justify-between'>
            <h2 className='text-lg font-semibold'>{t('Recent results')}</h2>
            {results.length > 0 && (
              <Button variant='ghost' size='sm' onClick={() => setResults([])}>
                <Trash2 className='mr-2 size-4' aria-hidden='true' />
                {t('Clear')}
              </Button>
            )}
          </div>
          {results.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('Your generated results will appear here.')}
            </p>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {results.map((item) => (
                <Card key={item.id} className='group overflow-hidden'>
                  <CardContent className='p-0'>
                    <div className='bg-muted relative overflow-hidden'>
                      {item.kind === 'image' ? (
                        <img
                          src={item.url}
                          alt={t('Generated result')}
                          className='aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]'
                          loading='lazy'
                        />
                      ) : (
                        <video
                          src={item.url}
                          controls
                          className='aspect-video w-full bg-black'
                        />
                      )}
                      <div className='pointer-events-none absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                        <span className='bg-background/90 rounded-md p-1.5 shadow'>
                          <Maximize2 className='size-3.5' aria-hidden='true' />
                        </span>
                        <a
                          href={item.url}
                          download
                          className='bg-background/90 pointer-events-auto rounded-md p-1.5 shadow'
                          aria-label={t('Download')}
                        >
                          <Download className='size-3.5' aria-hidden='true' />
                        </a>
                      </div>
                    </div>
                    <div className='text-muted-foreground flex items-center justify-between px-3 py-2 text-xs'>
                      <span>
                        {item.kind === 'image' ? t('Image') : t('Video')}
                      </span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </Main>
  )
}
