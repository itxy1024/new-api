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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeAll, expect, test } from 'vitest'

import type { UsageLog } from '../../data/schema'
import { DetailsDialog } from '../dialogs/details-dialog'

const queryClients: QueryClient[] = []

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    'Log Details': 'Log Details',
    Consume: 'Consume',
    'Request Input': 'Request Input',
    'Copy to clipboard': 'Copy to clipboard',
  })
})

afterEach(() => {
  cleanup()
  queryClients.splice(0).forEach((queryClient) => queryClient.clear())
})

test('shows the saved request input in root log details', async () => {
  const log: UsageLog = {
    id: 1,
    user_id: 1,
    created_at: 1,
    type: 2,
    content: '',
    username: 'root',
    token_name: 'token',
    model_name: 'gpt-test',
    quota: 1,
    prompt_tokens: 1,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 0,
    channel_name: '',
    token_id: 1,
    group: 'default',
    ip: '',
    other: JSON.stringify({
      admin_info: {
        request_input: 'saved request text',
        request_input_truncated: false,
      },
    }),
    request_id: 'req-1',
    upstream_request_id: '',
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClients.push(queryClient)

  render(
    <QueryClientProvider client={queryClient}>
      <DetailsDialog
        log={log}
        isAdmin
        isRoot
        open
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )

  const trigger = screen.getByRole('button', { name: 'Request Input' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(trigger)
  expect(screen.getByText('saved request text')).toBeVisible()
})
