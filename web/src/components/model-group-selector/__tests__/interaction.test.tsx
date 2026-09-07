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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ModelGroupSelector } from '../../model-group-selector'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))

const originalScrollIntoView = Element.prototype.scrollIntoView

describe('model group selector interaction', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    if (originalScrollIntoView) {
      Element.prototype.scrollIntoView = originalScrollIntoView
    } else {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  test('切换 Key 时不会重复触发选中项滚动定位', async () => {
    const props = {
      groups: [
        { label: 'Key 1', value: '1' },
        { label: 'Key 2', value: '2' },
      ],
      models: [{ label: 'image-model', value: 'image-model' }],
      onGroupChange: vi.fn(),
      onModelChange: vi.fn(),
      selectedGroup: '1',
      selectedModel: 'image-model',
    }
    const view = render(<ModelGroupSelector {...props} />)

    fireEvent.click(screen.getByRole('combobox'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Key 2' })).toBeVisible()
    )
    const frameCountAfterOpen = vi.mocked(window.requestAnimationFrame).mock
      .calls.length

    view.rerender(<ModelGroupSelector {...props} selectedGroup='2' />)

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(
      frameCountAfterOpen
    )
  })
})
