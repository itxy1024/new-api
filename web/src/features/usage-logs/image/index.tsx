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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Combobox } from '@/components/ui/combobox'
import { canReadImageLogs } from '@/lib/admin-permissions'
import dayjs from '@/lib/dayjs'
import { useAuthStore } from '@/stores/auth-store'

import { CompactDateTimeRangePicker } from '../components/compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from '../components/logs-filter-toolbar'
import { getImageLogs, type ImageLog, type ImageLogFilters } from './api'
import { useImageLogColumns } from './components/image-log-columns'
import { ImageLogDetails } from './components/image-log-details'

const EMPTY_LOGS: ImageLog[] = []

export function ImageLogs() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const queryClient = useQueryClient()
  const allowed = canReadImageLogs(user)
  const userId = user?.id
  useEffect(() => {
    if (!allowed) {
      void queryClient
        .cancelQueries({ queryKey: ['image-logs', userId] })
        .then(() =>
          queryClient.removeQueries({ queryKey: ['image-logs', userId] })
        )
    }
  }, [allowed, queryClient, userId])
  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Image Generation Logs')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {allowed ? (
          <ImageLogViewer key={user?.id} />
        ) : (
          <ErrorState title={t('Permission denied')} />
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function ImageLogViewer() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ImageLogFilters>({
    p: 1,
    page_size: 20,
  })
  const [draft, setDraft] = useState<Partial<ImageLogFilters>>({})
  const [detail, setDetail] = useState<ImageLog | null>(null)
  const [denied, setDenied] = useState(false)
  const query = useQuery({
    queryKey: ['image-logs', userId, filters],
    queryFn: ({ signal }) => getImageLogs(filters, signal),
    retry: false,
    enabled: !denied,
  })
  const onAccessDenied = useCallback(() => {
    setDenied(true)
    setDetail(null)
    void queryClient
      .cancelQueries({ queryKey: ['image-logs', userId] })
      .then(() =>
        queryClient.removeQueries({ queryKey: ['image-logs', userId] })
      )
    const current = useAuthStore.getState().auth.user
    if (current && current.id === userId) {
      useAuthStore.getState().auth.setUser({
        ...current,
        permissions: {
          ...current.permissions,
          admin_permissions: {
            ...current.permissions?.admin_permissions,
            image_log: { read: false },
          },
        },
      })
    }
  }, [queryClient, userId])
  useEffect(() => {
    if (isAxiosError(query.error) && query.error.response?.status === 403) {
      onAccessDenied()
    }
  }, [query.error, onAccessDenied])

  const columns = useImageLogColumns(setDetail, onAccessDenied)
  const { table } = useDataTable({
    columns,
    data:
      query.isError || denied ? EMPTY_LOGS : (query.data?.items ?? EMPTY_LOGS),
    totalCount: query.isError || denied ? 0 : (query.data?.total ?? 0),
    getRowId: (entry) => String(entry.id),
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    onPaginationChange: (updater) =>
      setFilters((previous) => {
        const current = {
          pageIndex: previous.p - 1,
          pageSize: previous.page_size,
        }
        const next = typeof updater === 'function' ? updater(current) : updater
        return {
          ...previous,
          p: next.pageSize === previous.page_size ? next.pageIndex + 1 : 1,
          page_size: next.pageSize,
        }
      }),
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })
  const invalidRange = !!draft.start && !!draft.end && draft.start > draft.end
  if (denied) return <ErrorState title={t('Permission denied')} />
  return (
    <div className='flex h-full min-h-0 flex-col gap-2'>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        emptyTitle={
          query.isError
            ? t('Failed to load image generation logs')
            : t('No records')
        }
        paginationInFooter
        className='h-auto min-h-0 flex-1'
        applyHeaderSize
        getColumnClassName={() => 'py-2'}
        toolbar={
          <div className='space-y-2'>
            <LogsFilterToolbar
              table={table}
              hasActiveFilters={Object.values(draft).some(Boolean)}
              searchLoading={query.isFetching}
              onReset={() => {
                setDraft({})
                setFilters({ p: 1, page_size: filters.page_size })
              }}
              onSearch={() => {
                if (invalidRange) return
                const next = { ...draft, p: 1, page_size: filters.page_size }
                setFilters(next)
                void queryClient.invalidateQueries({
                  queryKey: ['image-logs', userId, next],
                  exact: true,
                })
              }}
              primaryFilters={
                <>
                  <LogsFilterInput
                    aria-label={t('User ID')}
                    placeholder={t('User ID')}
                    type='number'
                    min={1}
                    value={draft.user_id ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, user_id: event.target.value })
                    }
                  />
                  <LogsFilterInput
                    aria-label={t('Model')}
                    placeholder={t('Model')}
                    value={draft.model ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, model: event.target.value })
                    }
                  />
                  <LogsFilterInput
                    aria-label={t('Prompt')}
                    placeholder={t('Prompt')}
                    value={draft.prompt ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, prompt: event.target.value })
                    }
                  />
                  <Combobox
                    value={draft.status || 'all'}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        status: value === 'all' || value === null ? '' : value,
                      })
                    }
                    aria-label={t('Status')}
                    options={[
                      { value: 'all', label: t('All') },
                      { value: 'completed', label: t('Completed') },
                      { value: 'processing', label: t('Processing') },
                      { value: 'failed', label: t('Failed') },
                    ]}
                    placeholder={t('Status')}
                  />
                  <LogsFilterField wide>
                    <CompactDateTimeRangePicker
                      start={
                        draft.start ? dayjs(draft.start).toDate() : undefined
                      }
                      end={draft.end ? dayjs(draft.end).toDate() : undefined}
                      onChange={(range) =>
                        setDraft({
                          ...draft,
                          start: range.start
                            ? dayjs(range.start).format('YYYY-MM-DD HH:mm:ss')
                            : undefined,
                          end: range.end
                            ? dayjs(range.end).format('YYYY-MM-DD HH:mm:ss')
                            : undefined,
                        })
                      }
                    />
                  </LogsFilterField>
                </>
              }
            />
            {invalidRange && (
              <p role='alert' className='text-destructive text-sm'>
                {t('End time must be after start time')}
              </p>
            )}
            {query.isError && (
              <ErrorState
                title={t('Failed to load image generation logs')}
                onRetry={() => void query.refetch()}
              />
            )}
          </div>
        }
      />
      {detail && !query.isError && (
        <ImageLogDetails entry={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
