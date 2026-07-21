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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ApiKey } from '../../types'
import { buildQuickGroupUpdatePayload } from '../api-key-form'

const apiKey: ApiKey = {
  id: 7,
  name: 'production',
  key: 'masked',
  status: 1,
  remain_quota: 123,
  used_quota: 456,
  unlimited_quota: false,
  expired_time: 1_800_000_000,
  created_time: 1,
  accessed_time: 2,
  group: 'default',
  groups: ['default', 'backup'],
  group_aggregation_enabled: true,
  cross_group_retry: true,
  model_limits_enabled: true,
  model_limits: 'gpt-5.6',
  allow_ips: '127.0.0.1',
}

describe('API key quick group update payload', () => {
  test('switches to one selected group without overwriting other settings', () => {
    const payload = buildQuickGroupUpdatePayload(apiKey, 'vip')

    assert.deepEqual(payload, {
      id: 7,
      name: 'production',
      remain_quota: 123,
      expired_time: 1_800_000_000,
      unlimited_quota: false,
      model_limits_enabled: true,
      model_limits: 'gpt-5.6',
      allow_ips: '127.0.0.1',
      group: 'vip',
      groups: ['vip'],
      group_aggregation_enabled: false,
      cross_group_retry: false,
    })
  })

  test('keeps cross-group retry when switching to the auto group', () => {
    const payload = buildQuickGroupUpdatePayload(apiKey, 'auto')

    assert.equal(payload.cross_group_retry, true)
  })
})
