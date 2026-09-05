import { Loader2, Sparkles, Upload, Video as VideoIcon } from 'lucide-react'
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
type GroupMap = Record<string, { desc?: string; ratio?: number | string }>
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

export function CreativePage({ mode }: { mode: Mode }) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<GroupMap>({})
  const [group, setGroup] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(mode === 'image' ? '1024x1024' : '16:9')
  const [seconds, setSeconds] = useState('5')
  const [advanced, setAdvanced] = useState('')
  const [inputImage, setInputImage] = useState('')
  const [results, setResults] = useState<StoredMedia[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get('/api/user/self/groups')
      .then((response) => {
        const next = (response.data?.data || {}) as GroupMap
        setGroups(next)
        const first = Object.keys(next)[0] || ''
        setGroup((current) => (current && next[current] ? current : first))
      })
      .catch(() => toast.error(t('Failed to load creative groups')))
  }, [t])

  useEffect(() => {
    if (!group) return
    api
      .get('/api/user/models', { params: { group } })
      .then((response) => {
        const next = Array.isArray(response.data?.data)
          ? (response.data.data as string[])
          : []
        setModels(next)
        setModel((current) =>
          current && next.includes(current) ? current : next[0] || ''
        )
      })
      .catch(() => toast.error(t('Failed to load creative models')))
  }, [group, t])

  useEffect(() => {
    loadMedia(mode)
      .then(setResults)
      .catch(() => undefined)
  }, [mode])

  const title =
    mode === 'image' ? t('AI Image Generation') : t('Video Generation')
  const canSubmit = Boolean(group && model && prompt.trim() && !busy)
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
          group,
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
          group,
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
    <Main className='p-4 md:p-6'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-6'>
        <div className='flex items-center gap-3'>
          {mode === 'image' ? (
            <Sparkles className='text-primary size-6' aria-hidden='true' />
          ) : (
            <VideoIcon className='text-primary size-6' aria-hidden='true' />
          )}
          <div>
            <h1 className='text-2xl font-semibold'>{title}</h1>
            <p className='text-muted-foreground text-sm'>
              {t('Powered by your NewAPI model groups')}
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('Create')}</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4'>
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='grid gap-2 text-sm'>
                <span>{t('Group')}</span>
                <Select
                  value={group}
                  onValueChange={(value) => setGroup(String(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select a group')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(groups).map(([name, info]) => (
                      <SelectItem key={name} value={name}>
                        {name}
                        {info.desc ? ` - ${info.desc}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className='grid gap-2 text-sm'>
                <span>{t('Model')}</span>
                <Select
                  value={model}
                  onValueChange={(value) => setModel(String(value))}
                >
                  <SelectTrigger disabled={!models.length}>
                    <SelectValue placeholder={t('Select a model')} />
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
                rows={5}
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
              className='w-full md:w-fit'
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
          <h2 className='text-lg font-semibold'>{t('Recent results')}</h2>
          {results.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('Your generated results will appear here.')}
            </p>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {results.map((item) => (
                <Card key={item.id} className='overflow-hidden'>
                  <CardContent className='p-0'>
                    {item.kind === 'image' ? (
                      <img
                        src={item.url}
                        alt={t('Generated result')}
                        className='aspect-square w-full object-cover'
                        loading='lazy'
                      />
                    ) : (
                      <video
                        src={item.url}
                        controls
                        className='aspect-video w-full bg-black'
                      />
                    )}
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
