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
          >
            {row.original.prompt}
          </TruncatedCell>
        ),
        meta: { label: t('Prompt') },
      },
      {
        id: 'images',
        header: t('Images'),
        size: 180,
        cell: ({ row }) => (
          <ImageLogImages
            assets={row.original.assets}
            onAccessDenied={onAccessDenied}
          />
        ),
        meta: { label: t('Images') },
      },
      {
        accessorKey: 'elapsed_ms',
        header: t('Elapsed time'),
        size: 100,
        cell: ({ row }) =>
          `${formatNumber(row.original.elapsed_ms, locale)} ms`,
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
