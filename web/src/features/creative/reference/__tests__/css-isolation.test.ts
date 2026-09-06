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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const referenceStyles = readFileSync(
  resolve(process.cwd(), 'src/features/creative/reference/index.css'),
  'utf8'
)

describe('创作中心样式隔离', () => {
  it('不在异步样式块中注入全局 Tailwind 层', () => {
    expect(referenceStyles).not.toMatch(
      /@tailwind\s+(base|components|utilities)/
    )
  })
})
