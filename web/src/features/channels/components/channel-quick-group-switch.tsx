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
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { GroupBadge } from '@/components/group-badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { updateChannel } from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  channelsQueryKeys,
  formatGroupsString,
  mergeChannelGroupOptions,
  parseGroupsList,
} from '../lib'
import type { Channel } from '../types'

type ChannelQuickGroupSwitchProps = {
  channel: Channel
  availableGroups: string[]
}

export function ChannelQuickGroupSwitch(props: ChannelQuickGroupSwitchProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const currentGroups = parseGroupsList(props.channel.group)
  const [pendingGroups, setPendingGroups] = useState(currentGroups)
  const groupOptions = mergeChannelGroupOptions(
    props.availableGroups,
    currentGroups
  )

  const handleSelect = (group: string) => {
    setPendingGroups((groups) => {
      if (groups.includes(group)) {
        return groups.filter((item) => item !== group)
      }
      return [...groups, group]
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setPendingGroups(currentGroups)
    setOpen(nextOpen)
  }

  const handleSave = async () => {
    if (isUpdating || pendingGroups.length === 0) return

    setIsUpdating(true)
    try {
      const result = await updateChannel(props.channel.id, {
        group: formatGroupsString(pendingGroups),
      })
      if (!result.success) {
        toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        return
      }
      toast.success(t(SUCCESS_MESSAGES.UPDATED))
      setOpen(false)
      await queryClient.invalidateQueries({
        queryKey: channelsQueryKeys.lists(),
      })
    } catch {
      toast.error(t(ERROR_MESSAGES.UPDATE_FAILED))
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className='flex min-w-0 items-center gap-1.5'>
      <div className='flex min-w-0 items-center gap-1 overflow-hidden'>
        {currentGroups.slice(0, 1).map((group) => (
          <GroupBadge key={group} group={group} size='sm' />
        ))}
        {currentGroups.length > 1 && (
          <span className='text-muted-foreground text-xs tabular-nums'>
            +{currentGroups.length - 1}
          </span>
        )}
      </div>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              size='sm'
              role='combobox'
              aria-expanded={open}
              aria-label={t('Choose Group')}
              disabled={isUpdating || groupOptions.length === 0}
              className='text-muted-foreground h-7 shrink-0 gap-1 px-1.5 text-xs font-normal'
            />
          }
        >
          {isUpdating ? (
            <Loader2 className='size-3.5 animate-spin' />
          ) : (
            <>
              <span>{t('Choose Group')}</span>
              <ChevronsUpDown className='size-3.5 opacity-60' />
            </>
          )}
        </PopoverTrigger>
        <PopoverContent
          align='start'
          className='w-80 overflow-hidden p-0'
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Command>
            {pendingGroups.length > 0 && (
              <div className='border-border flex flex-wrap gap-1.5 border-b p-2'>
                {pendingGroups.map((group) => (
                  <span
                    key={group}
                    className='bg-muted flex min-w-0 items-center gap-1 rounded-md py-0.5 pr-0.5 pl-1.5'
                  >
                    <GroupBadge group={group} size='sm' />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      aria-label={`${t('Remove group')}: ${group}`}
                      onClick={() => handleSelect(group)}
                      className='size-5'
                    >
                      <X className='size-3' />
                    </Button>
                  </span>
                ))}
              </div>
            )}
            <CommandInput placeholder={t('Search groups...')} />
            <CommandList className='max-h-80'>
              <CommandEmpty>{t('No group found.')}</CommandEmpty>
              <CommandGroup>
                {groupOptions.map((group) => (
                  <CommandItem
                    key={group}
                    value={group}
                    onSelect={() => handleSelect(group)}
                    className='gap-2 px-2.5 py-2.5'
                  >
                    <Check
                      className={cn(
                        'size-4',
                        pendingGroups.includes(group)
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <GroupBadge group={group} size='sm' />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className='border-border flex justify-end gap-2 border-t p-2'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setOpen(false)}
                disabled={isUpdating}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='button'
                size='sm'
                onClick={() => void handleSave()}
                disabled={isUpdating || pendingGroups.length === 0}
              >
                {isUpdating && <Loader2 className='size-3.5 animate-spin' />}
                {t('Save changes')}
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
