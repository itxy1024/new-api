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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'

import {
  DetailRow,
  DetailSection,
} from '../../components/dialogs/log-detail-layout'
import type { ImageLog } from '../api'

export function ImageLogDetails(props: {
  entry: ImageLog
  onClose: () => void
}) {
  const { t } = useTranslation()
  const entry = props.entry
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('Details')}
    >
      <div className='space-y-4'>
        <DetailSection label={t('Basic Information')}>
          <DetailRow label={t('ID')} value={entry.id} />
          <DetailRow label={t('User ID')} value={entry.user_id} />
          <DetailRow label={t('Token ID')} value={entry.token_id} />
          <DetailRow label={t('Model')} value={entry.model} />
          <DetailRow label={t('Group')} value={entry.group} />
          <DetailRow label={t('Task ID')} value={entry.client_task_id} />
          <DetailRow
            label={t('Provider Task ID')}
            value={entry.provider_task_id || '-'}
          />
          <DetailRow label={t('Created At')} value={entry.created_at} />
          <DetailRow
            label={t('Finished At')}
            value={entry.finished_at || '-'}
          />
        </DetailSection>
        <DetailSection label={t('Prompt')}>
          <CopyButton value={entry.prompt} />
          <p className='max-h-64 overflow-auto text-sm break-all whitespace-pre-wrap'>
            {entry.prompt || '-'}
          </p>
        </DetailSection>
        <DetailSection label={t('Request Parameters')}>
          <CopyButton value={entry.request_params} />
          <pre className='max-h-64 overflow-auto text-xs break-all whitespace-pre-wrap'>
            {entry.request_params || '-'}
          </pre>
        </DetailSection>
        {entry.error_message && (
          <DetailSection label={t('Error Message')} variant='danger'>
            <p className='text-sm break-all whitespace-pre-wrap'>
              {entry.error_message}
            </p>
          </DetailSection>
        )}
      </div>
    </Dialog>
  )
}
