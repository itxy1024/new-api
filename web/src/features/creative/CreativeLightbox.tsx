import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type CreativeLightboxProps = {
  src: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  currentIndex?: number
  total?: number
}
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export function CreativeLightbox(props: CreativeLightboxProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)
  const positionRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{
    x: number
    y: number
    baseX: number
    baseY: number
  } | null>(null)
  const [renderVersion, setRenderVersion] = useState(0)
  const rerender = useCallback(() => setRenderVersion((value) => value + 1), [])
  const apply = useCallback(
    (scale: number, x: number, y: number) => {
      scaleRef.current = clamp(scale, 1, 10)
      positionRef.current = scaleRef.current === 1 ? { x: 0, y: 0 } : { x, y }
      rerender()
    },
    [rerender]
  )

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
      if (event.key === 'ArrowLeft') props.onPrev?.()
      if (event.key === 'ArrowRight') props.onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [props])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = scaleRef.current
      const next = clamp(current * (event.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 10)
      const rect = element.getBoundingClientRect()
      const mx = event.clientX - rect.left - rect.width / 2
      const my = event.clientY - rect.top - rect.height / 2
      const ratio = next / current
      apply(
        next,
        mx - ratio * (mx - positionRef.current.x),
        my - ratio * (my - positionRef.current.y)
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [apply])

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || scaleRef.current <= 1) return
    event.preventDefault()
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      baseX: positionRef.current.x,
      baseY: positionRef.current.y,
    }
  }
  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    apply(
      scaleRef.current,
      dragRef.current.baseX + event.clientX - dragRef.current.x,
      dragRef.current.baseY + event.clientY - dragRef.current.y
    )
  }
  function handleMouseUp() {
    dragRef.current = null
  }
  function handleDoubleClick(event: React.MouseEvent<HTMLImageElement>) {
    event.stopPropagation()
    if (scaleRef.current > 1) {
      apply(1, 0, 0)
      return
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    apply(
      3,
      -(event.clientX - rect.left - rect.width / 2) * 2,
      -(event.clientY - rect.top - rect.height / 2) * 2
    )
  }

  const scale = scaleRef.current
  const position = positionRef.current
  return (
    <div
      ref={containerRef}
      className='fixed inset-0 z-[80] flex items-center justify-center select-none'
      style={{ cursor: scale > 1 ? 'grab' : 'pointer' }}
      onClick={props.onClose}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className='animate-fade-in absolute inset-0 bg-black/35 backdrop-blur-md dark:bg-black/70' />
      <div
        className='animate-zoom-in relative'
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className='relative flex items-center justify-center'
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: dragRef.current ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          <img
            src={props.src}
            alt={t('Generated result')}
            onDoubleClick={handleDoubleClick}
            onDragStart={(event) => event.preventDefault()}
            className='max-h-[75vh] max-w-[90vw] rounded-lg object-contain shadow-2xl'
          />
        </div>
      </div>
      <button
        type='button'
        onClick={(event) => {
          event.stopPropagation()
          props.onClose()
        }}
        className='absolute top-5 right-5 rounded-full bg-white/90 px-3 py-2 text-xl text-gray-700 shadow-lg'
        aria-label={t('Close')}
      >
        ×
      </button>
      {props.total && props.total > 1 && (
        <>
          <button
            type='button'
            onClick={(event) => {
              event.stopPropagation()
              props.onPrev?.()
            }}
            className='absolute left-4 rounded-full bg-white/80 px-3 py-2 text-2xl'
            aria-label={t('Previous')}
          >
            ‹
          </button>
          <button
            type='button'
            onClick={(event) => {
              event.stopPropagation()
              props.onNext?.()
            }}
            className='absolute right-4 rounded-full bg-white/80 px-3 py-2 text-2xl'
            aria-label={t('Next')}
          >
            ›
          </button>
          <span className='absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-sm shadow'>
            {(props.currentIndex ?? 0) + 1} / {props.total}
          </span>
        </>
      )}
      {scale > 1 && (
        <span className='absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-xs shadow'>
          {Math.round(scale * 100)}%
        </span>
      )}
      <span className='sr-only'>{renderVersion}</span>
    </div>
  )
}
