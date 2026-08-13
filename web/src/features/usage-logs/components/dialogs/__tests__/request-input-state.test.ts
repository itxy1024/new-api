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

import { getRequestInputDisplayState } from '../request-input-state.ts'

describe('request input details', () => {
  test('starts collapsed and hides the truncation notice for complete content', () => {
    const state = getRequestInputDisplayState(false)

    assert.deepEqual(state.defaultExpandedItems, [])
    assert.equal(state.showTruncationNotice, false)
  })

  test('shows the truncation notice when only the first 10 KB was saved', () => {
    const state = getRequestInputDisplayState(true)

    assert.deepEqual(state.defaultExpandedItems, [])
    assert.equal(state.showTruncationNotice, true)
  })
})
