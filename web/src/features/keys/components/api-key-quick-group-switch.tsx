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
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { GroupBadge } from '@/components/group-badge'
import { StatusBadge } from '@/components/status-badge'
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

import { updateApiKey } from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import { buildQuickGroupUpdatePayload } from '../lib/api-key-form'
import type { ApiKey } from '../types'
import type { ApiKeyGroupOption } from './api-key-group-combobox'
import { useApiKeys } from './api-keys-provider'

type ApiKeyQuickGroupSwitchProps = {
  apiKey: ApiKey
  options: ApiKeyGroupOption[]
}

export function ApiKeyQuickGroupSwitch(props: ApiKeyQuickGroupSwitchProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useApiKeys()
  const [open, setOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const currentGroups = props.apiKey.groups.length
    ? props.apiKey.groups
    : [props.apiKey.group]
  const visibleGroups = currentGroups.filter((group): group is string =>
    Boolean(group)
  )
  const [pendingGroups, setPendingGroups] = useState(visibleGroups)
  const currentRatio = props.options.find(
    (option) => option.value === visibleGroups[0]
  )?.ratio

  const saveGroups = async (groups: string[]) => {
    if (isUpdating || groups.length === 0) return

    if (
      !props.apiKey.group_aggregation_enabled &&
      groups[0] === props.apiKey.group
    ) {
      setOpen(false)
      return
    }

    setIsUpdating(true)
    try {
      const result = await updateApiKey(
        buildQuickGroupUpdatePayload(props.apiKey, groups)
      )
      if (!result.success) {
        toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        return
      }
      toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
      setOpen(false)
      triggerRefresh()
    } catch {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSelect = (group: string) => {
    if (!props.apiKey.group_aggregation_enabled) {
      void saveGroups([group])
      return
    }

    if (group === 'auto') {
      setPendingGroups(['auto'])
      return
    }

    setPendingGroups((groups) => {
      const groupsWithoutAuto = groups.filter((item) => item !== 'auto')
      if (groupsWithoutAuto.includes(group)) {
        return groupsWithoutAuto.filter((item) => item !== group)
      }
      return [...groupsWithoutAuto, group]
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setPendingGroups(visibleGroups)
    setOpen(nextOpen)
  }

  return (
    <div className='flex min-w-0 items-center gap-1.5'>
      <div className='flex min-w-0 items-center gap-1 overflow-hidden'>
        {visibleGroups.slice(0, 1).map((group) => (
          <GroupBadge
            key={group}
            group={group}
            ratio={typeof currentRatio === 'number' ? currentRatio : undefined}
            size='sm'
          />
        ))}
        {visibleGroups.length > 1 && (
          <span className='text-muted-foreground text-xs tabular-nums'>
            +{visibleGroups.length - 1}
          </span>
        )}
        {props.apiKey.group === 'auto' && props.apiKey.cross_group_retry && (
          <StatusBadge
            label={t('Cross-group')}
            variant='info'
            copyable={false}
          />
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
              disabled={isUpdating || props.options.length === 0}
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
            {props.apiKey.group_aggregation_enabled &&
              pendingGroups.length > 0 && (
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
                {props.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.desc || ''} ${option.ratio ?? ''}`}
                    onSelect={() => handleSelect(option.value)}
                    className='items-start gap-2 px-2.5 py-2.5'
                  >
                    <Check
                      className={cn(
                        'mt-0.5 size-4',
                        (props.apiKey.group_aggregation_enabled
                          ? pendingGroups
                          : currentGroups
                        ).includes(option.value)
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-center justify-between gap-2'>
                        <GroupBadge
                          group={option.label}
                          ratio={
                            typeof option.ratio === 'number'
                              ? option.ratio
                              : undefined
                          }
                          size='sm'
                        />
                      </span>
                      {option.desc && option.desc !== option.label && (
                        <span className='text-muted-foreground mt-1 block truncate text-xs'>
                          {option.desc}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {props.apiKey.group_aggregation_enabled && (
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
                  onClick={() => void saveGroups(pendingGroups)}
                  disabled={isUpdating || pendingGroups.length === 0}
                >
                  {isUpdating && <Loader2 className='size-3.5 animate-spin' />}
                  {t('Save changes')}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
