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
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSidebarData } from '../use-sidebar-data'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('useSidebarData', () => {
  it('将图片和视频入口放在创作中心二级菜单中', () => {
    const { result } = renderHook(() => useSidebarData())
    const creativeGroup = result.current.navGroups.find(
      (group) => group.id === 'creative'
    )

    expect(creativeGroup?.items).toHaveLength(1)
    expect(creativeGroup?.items[0]).toMatchObject({
      title: 'Creation Center',
      items: [
        { title: 'AI Image Generation', url: '/creative/image' },
        { title: 'Video Generation', url: '/creative/video' },
      ],
    })
  })

  it('将智商雷达放在常规菜单末尾', () => {
    const { result } = renderHook(() => useSidebarData())
    const generalGroup = result.current.navGroups.find(
      (group) => group.id === 'general'
    )

    expect(generalGroup?.items.at(-1)).toMatchObject({
      title: 'IQ Radar',
      url: '/iq-radar',
    })
  })
})
