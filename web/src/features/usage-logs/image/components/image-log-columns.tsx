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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { TruncatedCell } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatByteSize } from '@/features/creative/reference/lib/mediaMetadata'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { ImageLog } from '../api'
import { ImageLogImages } from './image-log-images'

export function useImageLogColumns(
  onDetails: (entry: ImageLog) => void,
  onAccessDenied: () => void
): ColumnDef<ImageLog>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return useMemo<ColumnDef<ImageLog>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        size: 180,
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        accessorKey: 'user_id',
        header: t('User ID'),
        size: 80,
        meta: { label: t('User ID') },
      },
      {
        accessorKey: 'model',
        header: t('Model'),
        size: 150,
        cell: ({ row }) => (
          <TruncatedCell className='max-w-44'>
            {row.original.model}
          </TruncatedCell>
        ),
        meta: { label: t('Model') },
      },
      {
        accessorKey: 'group',
        header: t('Group'),
        size: 90,
        meta: { label: t('Group') },
      },
      {
        accessorKey: 'prompt',
        header: t('Prompt'),
        size: 200,
        cell: ({ row }) => (
          <TruncatedCell
            className='max-w-60'
            contentClassName='line-clamp-2 whitespace-normal break-all'
            tooltipContent={row.original.prompt}
            tooltipClassName='block max-h-[60dvh] w-[min(32rem,calc(100vw-2rem))] max-w-none overflow-y-auto whitespace-pre-wrap text-left'
            tabIndex={0}
          >
            {row.original.prompt}
          </TruncatedCell>
        ),
        meta: { label: t('Prompt') },
      },
      {
        id: 'images',
        header: t('Images'),
        size: 80,
        cell: ({ row }) => (
          <ImageLogImages
            assets={row.original.assets}
            onAccessDenied={onAccessDenied}
          />
        ),
        meta: { label: t('Images') },
      },
      {
        id: 'file_size',
        header: t('File size'),
        size: 100,
        cell: ({ row }) => (
          <div className='flex flex-col gap-2'>
            {row.original.assets.length === 0
              ? '-'
              : row.original.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className='flex items-center whitespace-nowrap sm:min-h-14'
                  >
                    {formatByteSize(asset.byte_size)}
                  </div>
                ))}
          </div>
        ),
        meta: { label: t('File size') },
      },
      {
        id: 'resolution',
        header: t('Resolution'),
        size: 130,
        cell: ({ row }) => (
          <div className='flex flex-col gap-2'>
            {row.original.assets.length === 0
              ? '-'
              : row.original.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className='flex items-center whitespace-nowrap sm:min-h-14'
                  >
                    {asset.width > 0 && asset.height > 0
                      ? `${asset.width} × ${asset.height}`
                      : '-'}
                  </div>
                ))}
          </div>
        ),
        meta: { label: t('Resolution') },
      },
      {
        accessorKey: 'elapsed_ms',
        header: t('Elapsed time'),
        size: 100,
        cell: ({ row }) =>
          `${formatNumber(row.original.elapsed_ms / 1000, locale)} ${t('s')}`,
        meta: { label: t('Elapsed time') },
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        size: 90,
        cell: ({ row }) => {
          const status = row.original.status
          if (status === 'completed') {
            return (
              <StatusBadge
                label={t('Completed')}
                variant='success'
                copyable={false}
              />
            )
          }
          if (status === 'failed') {
            return (
              <StatusBadge
                label={t('Failed')}
                variant='danger'
                copyable={false}
              />
            )
          }
          return (
            <StatusBadge
              label={t('Processing')}
              variant='warning'
              copyable={false}
            />
          )
        },
        meta: { label: t('Status') },
      },
      {
        id: 'actions',
        header: t('Actions'),
        size: 80,
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => onDetails(row.original)}
          >
            {t('Details')}
          </Button>
        ),
        meta: { label: t('Actions') },
      },
    ],
    [t, locale, onAccessDenied, onDetails]
  )
}
