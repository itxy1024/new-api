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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { expect, it } from 'vitest'

import { DataTableFacetedFilter } from '../faceted-filter'

it('keeps dynamic option labels unchanged while translating static labels', async () => {
  const user = userEvent.setup()
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    resources: {
      zh: {
        translation: {
          image: '张',
          'All Groups': '全部分组',
        },
      },
    },
  })

  render(
    <I18nextProvider i18n={i18n}>
      <DataTableFacetedFilter
        title='分组'
        options={[
          { label: 'All Groups', value: 'all' },
          { label: 'image', value: 'image', translate: false },
        ]}
      />
    </I18nextProvider>
  )

  await user.click(screen.getByRole('button', { name: '分组' }))

  expect(screen.getByRole('option', { name: '全部分组' })).toBeVisible()
  expect(screen.getByRole('option', { name: 'image' })).toBeVisible()
  expect(screen.queryByText('张')).not.toBeInTheDocument()
})
