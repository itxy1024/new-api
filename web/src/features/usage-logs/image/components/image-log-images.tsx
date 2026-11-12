/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { isAxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { formatByteSize } from '@/features/creative/reference/lib/mediaMetadata'
import { api } from '@/lib/api'

import type { ImageLogAsset } from '../api'

export function ImageLogImages(props: {
  assets: ImageLogAsset[]
  onAccessDenied: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex flex-wrap gap-2'>
      {props.assets.length === 0 ? (
        <span className='text-muted-foreground'>{t('No images')}</span>
      ) : (
        props.assets.map((asset) => (
          <ImageLogThumbnail
            key={asset.id}
            asset={asset}
            onAccessDenied={props.onAccessDenied}
          />
        ))
      )}
    </div>
  )
}

function ImageLogThumbnail(props: {
  asset: ImageLogAsset
  onAccessDenied: () => void
}) {
  const { t } = useTranslation()
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const contentURL = props.asset.content_url
  const onAccessDenied = props.onAccessDenied
  useEffect(() => {
    const controller = new AbortController()
    let objectURL = ''
    setSrc('')
    setFailed(false)
    // 统一通过 API 实例携带认证头，Blob 地址仅在本组件存活期间保留。
    void api
      .get<Blob>(contentURL, {
        responseType: 'blob',
        signal: controller.signal,
        disableDuplicate: true,
      })
      .then((response) => {
        if (controller.signal.aborted) return
        objectURL = URL.createObjectURL(response.data)
        setSrc(objectURL)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFailed(true)
        if (isAxiosError(error) && error.response?.status === 403) {
          onAccessDenied()
        }
      })
    return () => {
      controller.abort()
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [contentURL, onAccessDenied, attempt])

  return (
    <div className='space-y-1'>
      <Button
        variant='outline'
        className='h-14 w-14 overflow-hidden p-0'
        disabled={!src && !failed}
        aria-label={failed ? t('Retry') : t('Preview image')}
        onClick={() =>
          failed ? setAttempt((value) => value + 1) : setOpen(true)
        }
      >
        {src && !failed ? (
          <img
            src={src}
            alt={t('Generated image')}
            className='h-full w-full object-cover'
            loading='lazy'
            onError={() => setFailed(true)}
          />
        ) : (
          <span className='text-[10px]'>
            {failed ? t('Retry') : t('Loading...')}
          </span>
        )}
      </Button>
      <div className='text-muted-foreground text-[10px]'>
        {formatByteSize(props.asset.byte_size)}
      </div>
      {open && (
        <Dialog
          open
          onOpenChange={setOpen}
          title={t('Preview image')}
          description={`${props.asset.width} × ${props.asset.height} · ${formatByteSize(props.asset.byte_size)}`}
          contentClassName='sm:max-w-5xl'
        >
          <img
            src={src}
            alt={t('Generated image')}
            className='max-h-[75dvh] w-full object-contain'
          />
        </Dialog>
      )}
    </div>
  )
}
