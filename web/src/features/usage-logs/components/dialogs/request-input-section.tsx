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
import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { getRequestInputDisplayState } from './request-input-state'

interface RequestInputSectionProps {
  content: string
  truncated: boolean
}

export function RequestInputSection(props: RequestInputSectionProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const displayState = getRequestInputDisplayState(props.truncated)

  return (
    <div className='min-w-0'>
      <Accordion
        className='bg-muted/30 rounded-md border px-2.5'
        defaultValue={displayState.defaultExpandedItems}
      >
        <AccordionItem value='request-input' className='border-0'>
          <AccordionTrigger className='py-2.5 hover:no-underline'>
            <span className='flex min-w-0 items-center gap-2'>
              <span>{t('Request Input')}</span>
              {props.truncated && (
                <Badge variant='outline'>{t('Truncated')}</Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className='pb-2.5'>
            {displayState.showTruncationNotice && (
              <p className='text-muted-foreground mb-2 text-xs'>
                {t('Only the first 10 KB was saved.')}
              </p>
            )}
            <div className='bg-background relative min-w-0 overflow-hidden rounded-md border p-2.5'>
              <Button
                variant='ghost'
                size='icon-xs'
                className='absolute top-1.5 right-1.5'
                onClick={() => copyToClipboard(props.content)}
                title={t('Copy to clipboard')}
                aria-label={t('Copy to clipboard')}
              >
                {copiedText === props.content ? <Check /> : <Copy />}
              </Button>
              <pre className='max-h-80 min-w-0 overflow-auto pr-6 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap sm:wrap-break-word'>
                {props.content}
              </pre>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
