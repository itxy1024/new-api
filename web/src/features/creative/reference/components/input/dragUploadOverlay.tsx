export default function DragUploadOverlay({
  visible,
  atImageLimit,
  maxImages,
}: {
  visible: boolean
  atImageLimit: boolean
  maxImages: number
}) {
  if (!visible) return null

  return (
    <div className='pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/60 backdrop-blur-md dark:bg-gray-900/60'>
      <div className='flex flex-col items-center gap-4 rounded-3xl p-8'>
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed ${
            atImageLimit
              ? 'border-red-300 bg-red-50 dark:bg-red-500/10'
              : 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
          }`}
        >
          {atImageLimit ? (
            <svg
              className='h-10 w-10 text-red-400'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={1.5}
                d='M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
              />
            </svg>
          ) : (
            <svg
              className='h-10 w-10 text-blue-500'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={1.5}
                d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
              />
            </svg>
          )}
        </div>
        <div className='text-center'>
          {atImageLimit ? (
            <>
              <p className='text-lg font-semibold text-red-500'>
                已达上限 {maxImages} 张
              </p>
              <p className='mt-1 text-sm text-gray-400'>
                请先移除部分参考图后再添加
              </p>
            </>
          ) : (
            <>
              <p className='text-lg font-semibold text-gray-700 dark:text-gray-200'>
                释放以上传图片
              </p>
              <p className='mt-1 text-sm text-gray-400'>
                支持 JPG、PNG、WebP 等格式
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
