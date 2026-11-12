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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface ImageLogAsset {
  id: number
  content_url: string
  mime_type: string
  byte_size: number
  width: number
  height: number
}

export interface ImageLog {
  id: number
  user_id: number
  token_id: number
  client_task_id: string
  provider_task_id: string
  model: string
  group: string
  prompt: string
  request_params: string
  status: string
  elapsed_ms: number
  error_message: string
  created_at: string
  finished_at: string | null
  assets: ImageLogAsset[]
}

export interface ImageLogFilters {
  p: number
  page_size: number
  user_id?: string
  model?: string
  prompt?: string
  status?: string
  start?: string
  end?: string
}

export async function getImageLogs(
  params: ImageLogFilters,
  signal?: AbortSignal
): Promise<{ items: ImageLog[]; total: number }> {
  const response = await api.get<{
    success: boolean
    message?: string
    data: { items: ImageLog[]; total: number }
  }>('/api/image-logs', { params, signal, disableDuplicate: true })
  return requireServerSuccess(response.data).data
}
