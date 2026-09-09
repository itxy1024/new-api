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
import { MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const CUSTOMER_SERVICE_QR_URL =
  'https://lebozntc-test-oss.oss-cn-shanghai.aliyuncs.com/codex/16.png'
const POSITION_STORAGE_KEY = 'customer-service-float-position-v2'
const ORB_SIZE = 58
const VIEWPORT_GUTTER = 16
const DEFAULT_RIGHT_OFFSET = 62
const DEFAULT_BOTTOM_OFFSET = 52
const EDGE_ANCHOR_THRESHOLD = 120

type Position = {
  x: number
  y: number
}

function clampPosition(position: Position): Position {
  if (typeof window === 'undefined') return position

  return {
    x: Math.min(
      Math.max(position.x, VIEWPORT_GUTTER),
      Math.max(VIEWPORT_GUTTER, window.innerWidth - ORB_SIZE - VIEWPORT_GUTTER)
    ),
    y: Math.min(
      Math.max(position.y, VIEWPORT_GUTTER),
      Math.max(
        VIEWPORT_GUTTER,
        window.innerHeight - ORB_SIZE - VIEWPORT_GUTTER
      )
    ),
  }
}

function getInitialPosition(): Position {
  if (typeof window === 'undefined') return { x: 0, y: 0 }

  try {
    const stored = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Position>
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return clampPosition({ x: parsed.x, y: parsed.y })
      }
    }
  } catch {
    // 本地存储不可用时使用默认位置。
  }

  return clampPosition({
    x: window.innerWidth - ORB_SIZE - DEFAULT_RIGHT_OFFSET,
    y: window.innerHeight - ORB_SIZE - DEFAULT_BOTTOM_OFFSET,
  })
}

export function CustomerServiceFloat() {
  const { t } = useTranslation()
  const [position, setPosition] = useState<Position>(getInitialPosition)
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const draggedRef = useRef(false)
  const positionRef = useRef(position)
  const viewportRef = useRef({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  })

  useEffect(() => {
    const handleResize = () => {
      const previousViewport = viewportRef.current
      const current = positionRef.current
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      }
      const rightOffset =
        previousViewport.width - ORB_SIZE - current.x
      const bottomOffset =
        previousViewport.height - ORB_SIZE - current.y
      const next = clampPosition({
        x:
          rightOffset <= EDGE_ANCHOR_THRESHOLD
            ? nextViewport.width - ORB_SIZE - rightOffset
            : current.x,
        y:
          bottomOffset <= EDGE_ANCHOR_THRESHOLD
            ? nextViewport.height - ORB_SIZE - bottomOffset
            : current.y,
      })

      viewportRef.current = nextViewport
      positionRef.current = next
      setPosition(next)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    positionRef.current = position
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position))
    } catch {
      // 本地存储不可用时不影响客服入口使用。
    }
  }, [position])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
    draggedRef.current = false
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) draggedRef.current = true
    const next = clampPosition({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    })
    positionRef.current = next
    setPosition(next)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      setDragging(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
  }

  const handleClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    setOpen(true)
  }

  return (
    <>
      <div
        className='customer-service-float pointer-events-none fixed z-40'
        data-dragging={dragging ? 'true' : 'false'}
        style={{ left: position.x, top: position.y }}
      >
        <div className='group relative'>
          <div
            className={cn(
              'pointer-events-none absolute right-0 bottom-[calc(100%+0.65rem)] w-[min(18rem,calc(100vw-2rem))] origin-bottom-right transition-all duration-200',
              'translate-y-1 scale-95 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100',
              dragging && 'opacity-0'
            )}
          >
            <div className='relative rounded-2xl border border-white/20 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-md'>
              <div className='flex items-start gap-3'>
                <span className='mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-200'>
                  <MessageCircle className='size-4' aria-hidden='true' />
                </span>
                <div>
                  <p className='text-sm font-semibold'>{t('Need help?')}</p>
                  <p className='mt-1 text-sm leading-6 text-white/75'>
                    {t(
                      'Support is online for integration, top-ups, and model usage.'
                    )}
                  </p>
                  <p className='mt-1 text-xs text-cyan-100/80'>
                    {t('Click the orb to view the QR code.')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button
            type='button'
            className='customer-service-orb pointer-events-auto relative flex size-[58px] touch-none cursor-grab items-center justify-center rounded-full border-0 border-white/60 shadow-[0_20px_44px_rgba(14,165,233,0.4),inset_0_-10px_22px_rgba(15,23,42,0.16)] transition-transform hover:-translate-y-1 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 active:cursor-grabbing'
            aria-label={t('Open customer support QR code')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleClick}
          >
            <span className='customer-service-wing customer-service-wing-left' />
            <span className='customer-service-wing customer-service-wing-right' />
            <span className='customer-service-spark customer-service-spark-one' />
            <span className='customer-service-spark customer-service-spark-two' />
            <span className='customer-service-face'>
              <span className='customer-service-eye customer-service-eye-left' />
              <span className='customer-service-eye customer-service-eye-right' />
              <span className='customer-service-smile' />
            </span>
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-md text-center sm:max-w-md'>
          <DialogHeader className='items-center'>
            <DialogTitle>{t('Scan to contact support')}</DialogTitle>
            <DialogDescription>
              {t('Use WeChat to scan the QR code and contact customer support.')}
            </DialogDescription>
          </DialogHeader>
          <div className='mx-auto mt-2 w-[min(19rem,calc(100vw-3rem))] rounded-2xl border bg-white p-3 shadow-sm'>
            <img
              src={CUSTOMER_SERVICE_QR_URL}
              alt={t('Customer support QR code')}
              className='aspect-square w-full rounded-2xl object-contain'
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
