import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../../../lib/apiProfiles'
import BasicSettingsTab from '../BasicSettingsTab'

describe('基础配置', () => {
  it('修改默认模型关键词时提交新的设置', () => {
    const commitSettings = vi.fn()

    render(
      <BasicSettingsTab
        draft={DEFAULT_SETTINGS}
        commitSettings={commitSettings}
      />
    )

    const input = screen.getByLabelText('Default image model keyword')
    fireEvent.change(input, { target: { value: 'vision' } })

    expect(commitSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultImageModelKeyword: 'vision' })
    )
  })
})
