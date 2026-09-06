import { useStore } from '../store'

export default function Toast() {
  const toast = useStore((s) => s.toast)

  if (!toast) return null

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className='flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'>
            <svg
              className='h-3.5 w-3.5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2.5}
                d='M5 13l4 4L19 7'
              />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className='flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'>
            <svg
              className='h-3.5 w-3.5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2.5}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </div>
        )
      default:
        return (
          <div className='flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'>
            <svg
              className='h-3.5 w-3.5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2.5}
                d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
          </div>
        )
    }
  }

  return (
    <div className='toast-enter pointer-events-none fixed bottom-24 left-1/2 z-[120]'>
      <div className='flex w-max max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-full border border-gray-200/60 bg-white/95 px-5 py-3.5 text-sm font-medium text-gray-700 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl sm:max-w-[min(44rem,80vw)] dark:border-white/[0.08] dark:bg-gray-900/95 dark:text-gray-300 dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] dark:ring-white/10'>
        <span className='flex-shrink-0'>{getIcon()}</span>
        <span className='text-center leading-5 whitespace-pre-line'>
          {toast.message}
        </span>
      </div>
    </div>
  )
}
