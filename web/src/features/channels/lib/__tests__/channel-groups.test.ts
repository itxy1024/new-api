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

import { formatGroupsString, mergeChannelGroupOptions } from '../channel-utils'

describe('channel quick group selection', () => {
  test('keeps custom current groups available without duplicating global groups', () => {
    const groups = mergeChannelGroupOptions(
      ['default', 'vip'],
      ['vip', 'custom']
    )

    assert.deepEqual(groups, ['default', 'vip', 'custom'])
  })

  test('formats all selected groups for a partial channel update', () => {
    assert.equal(formatGroupsString(['default', 'vip']), 'default,vip')
  })
})
