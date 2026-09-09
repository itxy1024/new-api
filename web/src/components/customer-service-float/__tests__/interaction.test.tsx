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
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { CustomerServiceFloat } from '../../customer-service-float'

describe('客服悬浮球', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  test('点击悬浮球时打开客服二维码弹窗', () => {
    render(<CustomerServiceFloat />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Open customer support QR code' })
    )

    expect(
      screen.getByRole('heading', { name: 'Scan to contact support' })
    ).toBeVisible()
    expect(screen.getByRole('img', { name: 'Customer support QR code' })).toHaveAttribute(
      'src',
      'https://lebozntc-test-oss.oss-cn-shanghai.aliyuncs.com/codex/16.png'
    )
  })

  test('窗口尺寸变化时保持右下边距并恢复原位置', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1920,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1080,
    })

    render(<CustomerServiceFloat />)
    const button = screen.getByRole('button', {
      name: 'Open customer support QR code',
    })
    const container = button.parentElement?.parentElement

    expect(container).toHaveStyle({ left: '1800px', top: '970px' })

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 700,
    })
    fireEvent(window, new Event('resize'))
    expect(container).toHaveStyle({ left: '1080px', top: '590px' })

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1920,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1080,
    })
    fireEvent(window, new Event('resize'))
    expect(container).toHaveStyle({ left: '1800px', top: '970px' })
  })
})
