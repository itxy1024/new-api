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
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

const DEFAULT_IQ_RADAR_URL = 'https://iq-radar.pages.dev/'

export function IQRadarPage() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('IQ Radar')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <iframe
          title={t('IQ Radar')}
          src={DEFAULT_IQ_RADAR_URL}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
          className='h-full min-h-[32rem] w-full border-0'
          loading='lazy'
          referrerPolicy='strict-origin-when-cross-origin'
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
