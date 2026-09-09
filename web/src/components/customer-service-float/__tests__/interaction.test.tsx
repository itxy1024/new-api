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

  test('只有鼠标划入时显示气泡，关闭二维码后保持隐藏', () => {
    render(<CustomerServiceFloat />)

    const button = screen.getByRole('button', {
      name: 'Open customer support QR code',
    })
    const bubble = document.querySelector<HTMLElement>(
      '[data-customer-service-bubble="true"]'
    )
    expect(bubble).not.toBeNull()

    expect(bubble).toHaveClass('opacity-0')
    fireEvent.mouseEnter(button)
    expect(bubble).toHaveClass('opacity-100')

    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(bubble).toHaveClass('opacity-0')
  })

  test('窗口尺寸变化时保持右下边距并恢复原位置', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1920,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 1080,
    })

    render(<CustomerServiceFloat />)
    const button = screen.getByRole('button', {
      name: 'Open customer support QR code',
    })
    const container = button.parentElement?.parentElement

    const initialLeft = Number.parseFloat(container?.style.left ?? '0')
    const initialTop = Number.parseFloat(container?.style.top ?? '0')
    const rightOffset = window.innerWidth - 58 - initialLeft
    const bottomOffset = window.innerHeight - 58 - initialTop
    expect(rightOffset).toBeGreaterThanOrEqual(52)
    expect(rightOffset).toBeLessThanOrEqual(62)
    expect(bottomOffset).toBeGreaterThanOrEqual(72)
    expect(bottomOffset).toBeLessThanOrEqual(82)

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1200,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 700,
    })
    fireEvent(window, new Event('resize'))
    expect(Number.parseFloat(container?.style.left ?? '0')).toBe(
      window.innerWidth - 58 - rightOffset
    )
    expect(Number.parseFloat(container?.style.top ?? '0')).toBe(
      window.innerHeight - 58 - bottomOffset
    )

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1920,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 1080,
    })
    fireEvent(window, new Event('resize'))
    expect(Number.parseFloat(container?.style.left ?? '0')).toBe(
      window.innerWidth - 58 - rightOffset
    )
    expect(Number.parseFloat(container?.style.top ?? '0')).toBe(
      window.innerHeight - 58 - bottomOffset
    )
  })
})
