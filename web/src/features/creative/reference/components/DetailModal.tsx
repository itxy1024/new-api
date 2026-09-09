import { useEffect, useState, useMemo, useRef } from 'react'

import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { useTooltip } from '../hooks/useTooltip'
import { createMaskPreviewDataUrl } from '../lib/canvasImage'
import {
  copyImageSourceToClipboard,
  copyTextToClipboard,
  getClipboardFailureMessage,
} from '../lib/clipboard'
import {
  downloadImageEntriesAsZip,
  downloadImageIds,
  getImageZipEntries,
} from '../lib/downloadImages'
import { ensureImageCached, getCachedImage } from '../lib/imageCache'
import { ActualValueBadge, DetailParamValue } from '../lib/paramDisplay'
import { replaceImageMentionsForApi } from '../lib/promptImageMentions'
import { formatImageRatio } from '../lib/size'
import { isAgentTaskPromptPending } from '../lib/taskPromptDisplay'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import {
  useStore,
  reuseConfig,
  editOutputs,
  removeTask,
  showCodexCliPrompt,
  getCodexCliPromptKey,
  retryTask,
} from '../store'
import {
  CloseIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  LinkIcon,
  TrashIcon,
} from './icons'
import ViewportTooltip from './ViewportTooltip'

export default function DetailModal() {
  const tasks = useStore((s) => s.tasks)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const openFavoritePicker = useStore((s) => s.openFavoritePicker)
  const settings = useStore((s) => s.settings)
  const dismissedCodexCliPrompts = useStore((s) => s.dismissedCodexCliPrompts)
  const streamPreviewSrc = useStore((s) =>
    detailTaskId ? s.streamPreviews[detailTaskId] || '' : ''
  )
  const streamPreviewSlots = useStore((s) =>
    detailTaskId ? s.streamPreviewSlots[detailTaskId] : undefined
  )

  const [imageIndex, setImageIndex] = useState(0)
  const [imageSrcs, setImageSrcs] = useState<Record<string, string>>({})
  const [outputPreviewSrcs, setOutputPreviewSrcs] = useState<
    Record<string, string>
  >({})
  const [imageRatios, setImageRatios] = useState<Record<string, string>>({})
  const [imageSizes, setImageSizes] = useState<Record<string, string>>({})
  const [maskPreviewSrc, setMaskPreviewSrc] = useState('')
  const [now, setNow] = useState(Date.now())
  const [showRawUrlsModal, setShowRawUrlsModal] = useState(false)
  const [showRawResponseModal, setShowRawResponseModal] = useState(false)
  const [streamPreviewLoaded, setStreamPreviewLoaded] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const rawUrlsModalRef = useRef<HTMLDivElement>(null)
  const rawResponseModalRef = useRef<HTMLDivElement>(null)

  const rawUrlsBackdropPointerDownRef = useRef(false)
  const rawResponseBackdropPointerDownRef = useRef(false)

  const copyErrorTooltip = useTooltip()
  const copyRawUrlsTooltip = useTooltip()
  const viewRawResponseTooltip = useTooltip()
  const downloadPartialImagesTooltip = useTooltip()
  const retryTooltip = useTooltip()
  const downloadImageTooltip = useTooltip()
  const downloadOriginalImageTooltip = useTooltip()
  const downloadAllTooltip = useTooltip()

  const clearTextSelection = () => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) selection.removeAllRanges()
  }

  const task = useMemo(
    () => tasks.find((t) => t.id === detailTaskId) ?? null,
    [tasks, detailTaskId]
  )
  const streamPreviewItems = useMemo(() => {
    const slotEntries = streamPreviewSlots
      ? Object.entries(streamPreviewSlots)
          .filter(([, src]) => Boolean(src))
          .sort(([a], [b]) => Number(a) - Number(b))
      : []
    const count = Math.max(
      task?.status === 'running' ? task.params.n : 0,
      slotEntries.length
        ? Math.max(...slotEntries.map(([key]) => Number(key) + 1))
        : 0,
      streamPreviewSrc ? 1 : 0
    )
    const byIndex = new Map(slotEntries.map(([key, src]) => [Number(key), src]))

    return Array.from({ length: count }, (_, index) => ({
      key: String(index),
      src: byIndex.get(index) ?? (index === 0 ? streamPreviewSrc : ''),
    }))
  }, [task?.params.n, task?.status, streamPreviewSlots, streamPreviewSrc])
  const activeStreamPreviewSrc = streamPreviewItems[imageIndex]?.src || ''

  useEffect(() => {
    setStreamPreviewLoaded(false)
  }, [activeStreamPreviewSrc, detailTaskId, imageIndex])

  useEffect(() => {
    const count =
      task?.status === 'running'
        ? streamPreviewItems.length
        : task
          ? task.outputErrors?.length
            ? Math.max(
                task.params.n,
                task.outputImages.length + task.outputErrors.length
              )
            : task.outputImages.length
          : 0
    if (count > 0 && imageIndex >= count) setImageIndex(count - 1)
  }, [imageIndex, streamPreviewItems.length, task, task?.status])

  useCloseOnEscape(Boolean(task), () => setDetailTaskId(null))
  usePreventBackgroundScroll(Boolean(task), [
    modalRef,
    rawUrlsModalRef,
    rawResponseModalRef,
  ])

  // Reset index when task changes
  useEffect(() => {
    setImageIndex(0)
  }, [detailTaskId])

  useEffect(() => {
    if (
      task?.status !== 'running' &&
      !(
        task?.status === 'error' &&
        (task.falRecoverable || task.customRecoverable)
      )
    )
      return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    setNow(Date.now())
    return () => window.clearInterval(id)
  }, [task?.customRecoverable, task?.falRecoverable, task?.status])

  // 加载所有相关图片
  useEffect(() => {
    if (!task) {
      setImageSrcs({})
      setOutputPreviewSrcs({})
      setImageRatios({})
      setImageSizes({})
      return
    }

    let cancelled = false
    const ids = [
      ...new Set([
        ...(task.inputImageIds || []),
        ...(task.maskImageId ? [task.maskImageId] : []),
      ]),
    ]
    const initial: Record<string, string> = {}
    for (const id of ids) {
      const cached = getCachedImage(id)
      if (cached) initial[id] = cached
    }
    setImageSrcs(initial)
    for (const id of ids) {
      if (initial[id]) continue
      ensureImageCached(id).then((url) => {
        if (!cancelled && url) setImageSrcs((prev) => ({ ...prev, [id]: url }))
      })
    }

    return () => {
      cancelled = true
    }
  }, [task])

  const maskTargetId = task?.maskTargetImageId || null
  const maskTargetSrc = maskTargetId ? imageSrcs[maskTargetId] || '' : ''
  const maskSrc = task?.maskImageId ? imageSrcs[task.maskImageId] || '' : ''
  const allInputImageIds = task?.inputImageIds ?? []
  const outputSlots = useMemo(() => {
    if (!task) return []
    const outputErrors = task.outputErrors ?? []
    if (outputErrors.length === 0) {
      return task.outputImages.map((imageId, outputImageIndex) => ({
        requestIndex: outputImageIndex,
        outputImageIndex,
        imageId,
        error: '',
      }))
    }

    const errorsByIndex = new Map(
      outputErrors.map((item) => [item.requestIndex, item.error])
    )
    const requestedCount = Math.max(
      task.params.n,
      task.outputImages.length + outputErrors.length
    )
    let outputImageIndex = 0
    return Array.from({ length: requestedCount }, (_, requestIndex) => {
      const error = errorsByIndex.get(requestIndex)
      if (error)
        return { requestIndex, outputImageIndex: -1, imageId: '', error }
      const imageId = task.outputImages[outputImageIndex] ?? ''
      const slot = { requestIndex, outputImageIndex, imageId, error: '' }
      outputImageIndex += 1
      return slot
    })
  }, [task])
  const currentOutputSlot = outputSlots[imageIndex]
  const currentOutputImageId = currentOutputSlot?.imageId || ''
  const currentOutputImageIndex = currentOutputSlot?.outputImageIndex ?? -1
  const currentOutputError = currentOutputSlot?.error || ''
  const currentOriginalOutputImageId =
    currentOutputImageIndex >= 0
      ? task?.transparentOriginalImages?.[currentOutputImageIndex] || ''
      : ''
  const currentOutputPreviewSrc = currentOutputImageId
    ? outputPreviewSrcs[currentOutputImageId] || ''
    : ''

  useEffect(() => {
    const outputImageIds = task?.outputImages ?? []
    if (outputImageIds.length === 0) {
      setOutputPreviewSrcs({})
      return
    }

    let cancelled = false
    const setOutputImage = (imageId: string, dataUrl: string) => {
      if (!cancelled)
        setOutputPreviewSrcs((prev) => ({ ...prev, [imageId]: dataUrl }))
    }

    for (const imageId of outputImageIds) {
      const cached = getCachedImage(imageId)
      if (cached) {
        setOutputImage(imageId, cached)
      } else {
        ensureImageCached(imageId)
          .then((dataUrl) => {
            if (dataUrl) setOutputImage(imageId, dataUrl)
          })
          .catch(() => {})
      }
    }

    return () => {
      cancelled = true
    }
  }, [task?.outputImages])

  useEffect(() => {
    let cancelled = false
    setMaskPreviewSrc('')
    if (!maskTargetSrc || !maskSrc) return

    createMaskPreviewDataUrl(maskTargetSrc, maskSrc)
      .then((url) => {
        if (!cancelled) setMaskPreviewSrc(url)
      })
      .catch(() => {
        if (!cancelled) setMaskPreviewSrc('')
      })

    return () => {
      cancelled = true
    }
  }, [maskTargetSrc, maskSrc])

  if (!task) return null

  const isAgentTask =
    task.sourceMode === 'agent' ||
    Boolean(task.agentConversationId || task.agentRoundId)
  const showPendingPrompt = isAgentTaskPromptPending(task)
  const isAgentEditTool =
    task.status === 'done' &&
    String(task.agentToolAction ?? '').toLowerCase() === 'edit'
  const showReferenceSection = allInputImageIds.length > 0 || isAgentEditTool

  const outputLen = outputSlots.length
  const currentImageMetadata = currentOutputImageId
    ? task.outputImageMetadata?.[currentOutputImageId]
    : undefined
  const persistedImageRatio =
    currentImageMetadata?.width && currentImageMetadata.height
      ? formatImageRatio(
          currentImageMetadata.width,
          currentImageMetadata.height
        )
      : ''
  const persistedImageSize =
    currentImageMetadata?.width && currentImageMetadata.height
      ? `${currentImageMetadata.width}×${currentImageMetadata.height}`
      : ''
  const currentImageRatio = currentOutputImageId
    ? imageRatios[currentOutputImageId] || persistedImageRatio
    : ''
  const currentImageSize = currentOutputImageId
    ? imageSizes[currentOutputImageId] || persistedImageSize
    : ''
  const baseActualParams = currentOutputImageId
    ? (task.actualParamsByImage?.[currentOutputImageId] ?? task.actualParams)
    : task.actualParams
  const currentActualParams =
    baseActualParams?.size || !currentImageSize
      ? baseActualParams
      : {
          ...(baseActualParams ?? {}),
          size: currentImageSize.replace('×', 'x'),
        }
  const currentRevisedPrompt = currentOutputImageId
    ? task.revisedPromptByImage?.[currentOutputImageId]?.trim()
    : ''
  // 将 @图N 等 mention 标记和透明背景追加提示词都按实际请求内容比较，
  // 避免仅由本地请求预处理导致的不一致被当作“API 改写”。
  const requestPrompt =
    task.transparentOutput && task.transparentPrompt
      ? task.transparentPrompt
      : task.prompt
  const promptSentToApi = replaceImageMentionsForApi(
    requestPrompt,
    task.inputImageIds.length
  ).trim()
  const showRevisedPrompt = Boolean(
    currentRevisedPrompt && currentRevisedPrompt !== promptSentToApi
  )
  const codexCliPromptKey = getCodexCliPromptKey(settings)
  const hasHandledPromptWarning =
    settings.codexCli || dismissedCodexCliPrompts.includes(codexCliPromptKey)
  const taskProvider = task.apiProvider
  const isOpenAiTask = (taskProvider ?? 'openai') === 'openai'
  const showPromptWarning = Boolean(
    isOpenAiTask &&
    task.apiMode === 'responses' &&
    currentOutputImageId &&
    (!currentRevisedPrompt || showRevisedPrompt) &&
    !hasHandledPromptWarning
  )
  const taskModel = task.apiModel?.trim() || '未知模型'
  const isFalReconnecting = task.status === 'error' && task.falRecoverable
  const isCustomReconnecting = task.status === 'error' && task.customRecoverable
  const rawImageUrls = task.rawImageUrls ?? []
  const streamPreviewLen = streamPreviewItems.length
  const currentStreamPreviewSrc = activeStreamPreviewSrc
  const streamPartialImageIds = task.streamPartialImageIds ?? []
  const supportsTransparentOutput =
    task.params.output_format === 'png' || task.params.output_format === 'webp'
  const transparentOutputText =
    task.transparentOutput || task.params.transparent_output ? 'true' : 'false'
  const currentTransparentOutputFailed = Boolean(
    currentOutputImageId &&
    task.transparentOutput &&
    task.transparentOriginalImages?.[currentOutputImageIndex] === ''
  )
  const outputCompressionText =
    task.params.output_compression == null
      ? '未设置'
      : String(task.params.output_compression)

  const formatTime = (ts: number | null) => {
    if (!ts) return ''
    return new Date(ts).toLocaleString('zh-CN')
  }

  const formatDuration = () => {
    if (
      task.status === 'running' ||
      isFalReconnecting ||
      isCustomReconnecting
    ) {
      const seconds = Math.max(0, Math.floor((now - task.createdAt) / 1000))
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
      const ss = String(seconds % 60).padStart(2, '0')
      return `${mm}:${ss}`
    }
    if (task.elapsed == null) return null
    const seconds = Math.floor(task.elapsed / 1000)
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const handleReuse = () => {
    reuseConfig(task)
    setDetailTaskId(null)
  }

  const handleEdit = () => {
    editOutputs(task)
    setDetailTaskId(null)
  }

  const handleDelete = () => {
    setDetailTaskId(null)
    setConfirmDialog({
      title: '删除任务',
      message:
        '确定要删除这个任务吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }

  const handleToggleFavorite = () => {
    openFavoritePicker([task.id])
  }

  const handleCopyError = async () => {
    const errorText = task.error || '生成失败'
    try {
      await copyTextToClipboard(errorText)
      showToast('完整报错已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制报错失败', err), 'error')
    }
  }

  const handleCopyPrompt = async () => {
    if (!task.prompt) return
    try {
      await copyTextToClipboard(task.prompt)
      showToast('提示词已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制提示词失败', err), 'error')
    }
  }

  const handleShowPromptWarning = () => {
    showCodexCliPrompt(
      true,
      currentRevisedPrompt
        ? '接口返回的提示词已被改写'
        : '接口没有返回官方 API 会返回的部分信息'
    )
  }

  const handleCopyInputImage = async () => {
    const imgId = allInputImageIds[0]
    const src = imgId ? imageSrcs[imgId] : ''
    if (!src) return
    try {
      await copyImageSourceToClipboard(src)
      showToast('参考图已复制', 'success')
    } catch (err) {
      console.error(err)
      showToast(getClipboardFailureMessage('复制参考图失败', err), 'error')
    }
  }

  const handleDownloadCurrentOutput = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentOutputImageId || !task) return

    try {
      const result = await downloadImageIds(
        [currentOutputImageId],
        `task-${task.id}`
      )
      if (result.successCount === 0) {
        showToast('下载失败', 'error')
      } else {
        showToast('下载成功', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
  }

  const handleDownloadCurrentOriginalOutput = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentOriginalOutputImageId || !task) return

    try {
      const result = await downloadImageIds(
        [currentOriginalOutputImageId],
        `task-${task.id}-orig`
      )
      if (result.successCount === 0) {
        showToast('下载失败', 'error')
      } else {
        showToast('原图下载成功', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
  }

  const handleDownloadAllOutputs = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!task?.outputImages?.length) return

    try {
      const fileNameBase = `task-${task.id}`
      const result = settings.zipDownloadRoutes.includes('task-detail-all')
        ? await downloadImageEntriesAsZip(
            getImageZipEntries(task.outputImages, fileNameBase),
            fileNameBase
          )
        : await downloadImageIds(task.outputImages, fileNameBase)
      if (result.successCount === 0) {
        showToast('下载失败', 'error')
      } else if (result.failCount > 0) {
        showToast(
          `部分下载失败：成功 ${result.successCount}，失败 ${result.failCount}`,
          'error'
        )
      } else {
        showToast(
          result.successCount > 1
            ? `下载成功：${result.successCount} 张图片`
            : '下载成功',
          'success'
        )
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
  }

  const handleDownloadPartialImages = async () => {
    if (!task || !streamPartialImageIds.length) return

    try {
      const fileNameBase = `task-${task.id}-partial`
      const result = settings.zipDownloadRoutes.includes('task-detail-partial')
        ? await downloadImageEntriesAsZip(
            getImageZipEntries(streamPartialImageIds, fileNameBase),
            fileNameBase
          )
        : await downloadImageIds(streamPartialImageIds, fileNameBase)
      if (result.successCount === 0) {
        showToast('下载失败', 'error')
      } else if (result.failCount > 0) {
        showToast(
          `部分下载失败：成功 ${result.successCount}，失败 ${result.failCount}`,
          'error'
        )
      } else {
        showToast(`下载成功：${result.successCount} 张中间步骤图`, 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
  }

  const handleRetry = () => {
    retryTask(task)
    setDetailTaskId(null)
  }

  return (
    <div
      data-no-drag-select
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
      onClick={() => setDetailTaskId(null)}
    >
      <div className='animate-overlay-in absolute inset-0 bg-black/20 backdrop-blur-md dark:bg-black/40' />
      <div
        ref={modalRef}
        className='animate-modal-in relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-[0_8px_40px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl md:flex-row dark:border-white/[0.08] dark:bg-gray-900/90 dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] dark:ring-white/10'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex h-14 items-center justify-end px-4 md:hidden'>
          <button
            onClick={() => setDetailTaskId(null)}
            className='rounded-full p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/[0.06]'
            aria-label='关闭'
          >
            <CloseIcon className='h-6 w-6' />
          </button>
        </div>

        {/* 左侧：图片 */}
        <div className='relative flex h-64 min-h-[16rem] w-full flex-shrink-0 items-center justify-center bg-gray-100 md:h-auto md:w-1/2 dark:bg-black/20'>
          {task.status === 'done' &&
            outputLen > 0 &&
            (currentOutputImageId || task.outputImages.length > 0) && (
              <div className='absolute top-[15px] right-3 z-20 flex items-center gap-1.5'>
                {currentOutputImageId && (
                  <div className='group relative flex'>
                    <button
                      type='button'
                      {...downloadImageTooltip.handlers}
                      onClick={(e) => {
                        downloadImageTooltip.handlers.onClick()
                        handleDownloadCurrentOutput(e)
                      }}
                      className='flex items-center justify-center rounded bg-black/50 px-1.5 py-0.5 text-white backdrop-blur-sm transition hover:bg-black/70 focus:ring-1 focus:ring-white/50 focus:outline-none'
                      aria-label='下载图片'
                    >
                      <DownloadIcon className='h-4 w-4' />
                    </button>
                    <ViewportTooltip
                      visible={downloadImageTooltip.visible}
                      className='whitespace-nowrap'
                    >
                      下载图片
                    </ViewportTooltip>
                  </div>
                )}
                {task.outputImages.length > 1 && (
                  <div className='group relative flex'>
                    <button
                      type='button'
                      {...downloadAllTooltip.handlers}
                      onClick={(e) => {
                        downloadAllTooltip.handlers.onClick()
                        handleDownloadAllOutputs(e)
                      }}
                      className='flex items-center justify-center gap-0.5 rounded bg-black/50 py-0.5 pr-2 pl-1.5 text-white backdrop-blur-sm transition hover:bg-black/70 focus:ring-1 focus:ring-white/50 focus:outline-none'
                      aria-label='下载全部'
                    >
                      <DownloadIcon className='h-4 w-4' />
                      <span className='mt-[1px] text-[9px] leading-none font-bold'>
                        ALL
                      </span>
                    </button>
                    <ViewportTooltip
                      visible={downloadAllTooltip.visible}
                      className='whitespace-nowrap'
                    >
                      下载全部
                    </ViewportTooltip>
                  </div>
                )}
              </div>
            )}
          {task.status === 'done' &&
            outputLen > 0 &&
            currentOutputPreviewSrc && (
              <>
                <img
                  src={currentOutputPreviewSrc}
                  data-image-id={currentOutputImageId}
                  className='saveable-image max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] cursor-pointer object-contain'
                  onLoad={(e) => {
                    const image = e.currentTarget
                    if (
                      currentOutputImageId &&
                      image.naturalWidth > 0 &&
                      image.naturalHeight > 0
                    ) {
                      setImageRatios((prev) => ({
                        ...prev,
                        [currentOutputImageId]: formatImageRatio(
                          image.naturalWidth,
                          image.naturalHeight
                        ),
                      }))
                      setImageSizes((prev) => ({
                        ...prev,
                        [currentOutputImageId]: `${image.naturalWidth}×${image.naturalHeight}`,
                      }))
                    }
                  }}
                  onClick={() =>
                    setLightboxImageId(currentOutputImageId, task.outputImages)
                  }
                  alt=''
                />
                <div
                  data-selectable-text
                  className='absolute top-[15px] left-4 flex items-center gap-1.5'
                >
                  {currentImageRatio && currentImageSize ? (
                    <>
                      <span className='rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-sm'>
                        {currentImageRatio}
                      </span>
                      <span className='rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white/90 backdrop-blur-sm'>
                        {currentImageSize}
                      </span>
                    </>
                  ) : (
                    formatDuration() && (
                      <span className='flex items-center gap-1 rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-sm'>
                        <svg
                          className='h-3 w-3'
                          fill='none'
                          stroke='currentColor'
                          viewBox='0 0 24 24'
                        >
                          <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                          />
                        </svg>
                        {formatDuration()}
                      </span>
                    )
                  )}
                </div>
                {outputLen > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setImageIndex((imageIndex - 1 + outputLen) % outputLen)
                      }
                      className='absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50'
                    >
                      <svg
                        className='h-5 w-5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M15 19l-7-7 7-7'
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() =>
                        setImageIndex((imageIndex + 1) % outputLen)
                      }
                      className='absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50'
                    >
                      <svg
                        className='h-5 w-5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M9 5l7 7-7 7'
                        />
                      </svg>
                    </button>
                    <span className='absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white'>
                      {imageIndex + 1} / {outputLen}
                    </span>
                  </>
                )}
                {currentOriginalOutputImageId && (
                  <div className='absolute right-4 bottom-4 z-20 flex'>
                    <button
                      type='button'
                      {...downloadOriginalImageTooltip.handlers}
                      onClick={(e) => {
                        downloadOriginalImageTooltip.handlers.onClick()
                        handleDownloadCurrentOriginalOutput(e)
                      }}
                      className='flex items-center justify-center gap-0.5 rounded bg-black/50 py-0.5 pr-2 pl-1.5 text-white backdrop-blur-sm transition hover:bg-black/70 focus:ring-1 focus:ring-white/50 focus:outline-none'
                      aria-label='下载原图'
                    >
                      <DownloadIcon className='h-4 w-4' />
                      <span className='mt-[1px] text-[9px] leading-none font-bold uppercase'>
                        orig
                      </span>
                    </button>
                    <ViewportTooltip
                      visible={downloadOriginalImageTooltip.visible}
                      className='whitespace-nowrap'
                    >
                      下载原图
                    </ViewportTooltip>
                  </div>
                )}
              </>
            )}
          {task.status === 'done' && outputLen > 0 && currentOutputError && (
            <div className='w-full max-w-md px-4 text-center'>
              <svg
                className='mx-auto mb-2 h-10 w-10 text-red-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              <p className='text-sm font-medium text-red-500'>
                第 {currentOutputSlot.requestIndex + 1} 张生成失败
              </p>
              <p
                className='mt-2 overflow-hidden text-sm leading-6 break-words whitespace-pre-line text-red-500'
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 8,
                }}
              >
                {currentOutputError}
              </p>
              {outputLen > 1 && (
                <>
                  <button
                    onClick={() =>
                      setImageIndex((imageIndex - 1 + outputLen) % outputLen)
                    }
                    className='absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50'
                  >
                    <svg
                      className='h-5 w-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M15 19l-7-7 7-7'
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setImageIndex((imageIndex + 1) % outputLen)}
                    className='absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50'
                  >
                    <svg
                      className='h-5 w-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M9 5l7 7-7 7'
                      />
                    </svg>
                  </button>
                  <span className='absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white'>
                    {imageIndex + 1} / {outputLen}
                  </span>
                </>
              )}
            </div>
          )}
          {(task.status === 'running' || isFalReconnecting) && (
            <>
              <div className='absolute top-4 left-4 flex items-center gap-1 rounded bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-sm'>
                <svg
                  className='h-3 w-3'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                  />
                </svg>
                {formatDuration()}
              </div>
              {task.status === 'running' && streamPreviewLen > 0 && (
                <>
                  {currentStreamPreviewSrc ? (
                    <img
                      src={currentStreamPreviewSrc}
                      className={`max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain ${streamPreviewLoaded ? '' : 'hidden'}`}
                      alt=''
                      onLoad={() => setStreamPreviewLoaded(true)}
                      onError={() => setStreamPreviewLoaded(false)}
                    />
                  ) : null}
                  {(!currentStreamPreviewSrc || !streamPreviewLoaded) && (
                    <svg
                      className='h-10 w-10 animate-spin text-blue-400'
                      fill='none'
                      viewBox='0 0 24 24'
                    >
                      <circle
                        className='opacity-25'
                        cx='12'
                        cy='12'
                        r='10'
                        stroke='currentColor'
                        strokeWidth='4'
                      />
                      <path
                        className='opacity-75'
                        fill='currentColor'
                        d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
                      />
                    </svg>
                  )}
                  {streamPreviewLoaded && (
                    <span className='absolute top-4 right-4 flex items-center gap-1 rounded bg-blue-500 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm'>
                      流式预览
                    </span>
                  )}
                  {streamPreviewLen > 1 && (
                    <>
                      <button
                        onClick={() =>
                          setImageIndex(
                            (imageIndex - 1 + streamPreviewLen) %
                              streamPreviewLen
                          )
                        }
                        className='absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50'
                      >
                        <svg
                          className='h-5 w-5'
                          fill='none'
                          stroke='currentColor'
                          viewBox='0 0 24 24'
                        >
                          <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M15 19l-7-7 7-7'
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() =>
                          setImageIndex((imageIndex + 1) % streamPreviewLen)
                        }
                        className='absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white transition hover:bg-black/50'
                      >
                        <svg
                          className='h-5 w-5'
                          fill='none'
                          stroke='currentColor'
                          viewBox='0 0 24 24'
                        >
                          <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M9 5l7 7-7 7'
                          />
                        </svg>
                      </button>
                      <span className='absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white'>
                        {imageIndex + 1} / {streamPreviewLen}
                      </span>
                    </>
                  )}
                </>
              )}
              {task.status === 'running' && streamPreviewLen === 0 && (
                <svg
                  className='h-10 w-10 animate-spin text-blue-400'
                  fill='none'
                  viewBox='0 0 24 24'
                >
                  <circle
                    className='opacity-25'
                    cx='12'
                    cy='12'
                    r='10'
                    stroke='currentColor'
                    strokeWidth='4'
                  />
                  <path
                    className='opacity-75'
                    fill='currentColor'
                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
                  />
                </svg>
              )}
            </>
          )}
          {task.status === 'error' && isFalReconnecting && (
            <div className='w-full max-w-md px-4 text-center'>
              <svg
                className='mx-auto mb-2 h-10 w-10 text-yellow-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                />
              </svg>
              <p className='text-sm font-medium text-yellow-500'>重连中</p>
            </div>
          )}
          {task.status === 'error' && !isFalReconnecting && (
            <div className='w-full max-w-md px-4 text-center'>
              <svg
                className='mx-auto mb-2 h-10 w-10 text-red-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              <p
                className='overflow-hidden text-sm leading-6 break-words whitespace-pre-line text-red-500'
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 10,
                }}
              >
                {task.error || '生成失败'}
              </p>
              <div className='mt-3 flex items-center justify-center gap-2'>
                <div className='group relative'>
                  <button
                    type='button'
                    {...copyErrorTooltip.handlers}
                    onClick={() => {
                      copyErrorTooltip.handlers.onClick()
                      handleCopyError()
                    }}
                    className='inline-flex items-center justify-center rounded-full border border-red-200/80 bg-white/80 px-3 py-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-400/20 dark:bg-white/[0.04] dark:hover:bg-red-500/10'
                    aria-label='复制完整报错'
                  >
                    <CopyIcon className='h-4 w-4' />
                  </button>
                  <ViewportTooltip
                    visible={copyErrorTooltip.visible}
                    className='whitespace-nowrap'
                  >
                    复制完整报错
                  </ViewportTooltip>
                </div>
                {task.rawResponsePayload && (
                  <div className='group relative'>
                    <button
                      type='button'
                      {...viewRawResponseTooltip.handlers}
                      onClick={() => {
                        dismissAllTooltips()
                        setShowRawResponseModal(true)
                      }}
                      className='inline-flex items-center justify-center rounded-full border border-purple-200/80 bg-purple-50 px-3 py-1.5 text-purple-600 transition hover:bg-purple-100 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20'
                      aria-label='查看原始响应'
                    >
                      <CodeIcon className='h-4 w-4' />
                    </button>
                    <ViewportTooltip
                      visible={viewRawResponseTooltip.visible}
                      className='whitespace-nowrap'
                    >
                      查看原始响应
                    </ViewportTooltip>
                  </div>
                )}
                {task.rawImageUrls && task.rawImageUrls.length > 0 && (
                  <div className='group relative'>
                    <button
                      type='button'
                      {...copyRawUrlsTooltip.handlers}
                      onClick={async () => {
                        if (task.rawImageUrls!.length === 1) {
                          copyRawUrlsTooltip.handlers.onClick()
                          try {
                            await copyTextToClipboard(task.rawImageUrls![0])
                            showToast('图片链接已复制', 'success')
                          } catch (err) {
                            showToast(
                              getClipboardFailureMessage('复制链接失败', err),
                              'error'
                            )
                          }
                        } else {
                          dismissAllTooltips()
                          setShowRawUrlsModal(true)
                        }
                      }}
                      className='inline-flex items-center justify-center rounded-full border border-green-200/80 bg-green-50 px-3 py-1.5 text-green-600 transition hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20'
                      aria-label='复制图片链接'
                    >
                      <LinkIcon className='h-4 w-4' />
                    </button>
                    <ViewportTooltip
                      visible={copyRawUrlsTooltip.visible}
                      className='whitespace-nowrap'
                    >
                      复制图片链接
                    </ViewportTooltip>
                  </div>
                )}
                {streamPartialImageIds.length > 0 && (
                  <div className='group relative'>
                    <button
                      type='button'
                      {...downloadPartialImagesTooltip.handlers}
                      onClick={() => {
                        downloadPartialImagesTooltip.handlers.onClick()
                        void handleDownloadPartialImages()
                      }}
                      className='inline-flex items-center justify-center rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-amber-600 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20'
                      aria-label='下载中间步骤图'
                    >
                      <DownloadIcon className='h-4 w-4' />
                    </button>
                    <ViewportTooltip
                      visible={downloadPartialImagesTooltip.visible}
                      className='whitespace-nowrap'
                    >
                      下载中间步骤图
                    </ViewportTooltip>
                  </div>
                )}
                <div className='group relative'>
                  <button
                    type='button'
                    {...retryTooltip.handlers}
                    onClick={() => {
                      retryTooltip.handlers.onClick()
                      handleRetry()
                    }}
                    className='inline-flex items-center justify-center rounded-full border border-blue-200/80 bg-white/80 px-3 py-1.5 text-blue-500 transition hover:bg-blue-50 dark:border-blue-400/20 dark:bg-white/[0.04] dark:hover:bg-blue-500/10'
                    aria-label='重试任务'
                  >
                    <svg
                      className='h-4 w-4'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth={2}
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                      />
                    </svg>
                  </button>
                  <ViewportTooltip
                    visible={retryTooltip.visible}
                    className='whitespace-nowrap'
                  >
                    重试任务
                  </ViewportTooltip>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：信息 */}
        <div className='flex w-full flex-col overflow-y-auto overscroll-contain p-5 md:w-1/2'>
          <button
            onClick={() => setDetailTaskId(null)}
            className='absolute top-3 right-3 z-10 hidden rounded-full p-1 text-gray-400 transition hover:bg-gray-100 md:block dark:hover:bg-white/[0.06]'
            aria-label='关闭'
          >
            <CloseIcon className='h-5 w-5' />
          </button>

          <div data-selectable-text className='flex-1'>
            <div className='mb-2 flex items-center gap-1.5'>
              <h3 className='text-xs font-medium tracking-wider text-gray-400 uppercase dark:text-gray-500'>
                输入内容
              </h3>
              {task.prompt && !showPendingPrompt && (
                <button
                  onClick={handleCopyPrompt}
                  className='rounded p-1 text-gray-400 transition hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06]'
                  title='复制提示词'
                >
                  <CopyIcon className='h-4 w-4' />
                </button>
              )}
              {showPromptWarning && (
                <span className='relative inline-flex'>
                  <button
                    type='button'
                    className='rounded p-1 text-amber-500 transition hover:bg-amber-50 dark:text-yellow-300 dark:hover:bg-yellow-500/10'
                    onClick={handleShowPromptWarning}
                    aria-label='提示词已被改写'
                  >
                    <svg
                      className='h-4 w-4'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'
                      />
                    </svg>
                  </button>
                </span>
              )}
            </div>
            {showPendingPrompt ? (
              <div className='mb-4 leading-relaxed'>
                <p className='text-sm text-gray-700 dark:text-gray-300'>
                  正在生成……
                </p>
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  输入内容将在响应完成时接收
                </p>
              </div>
            ) : (
              <p className='mb-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300'>
                {task.prompt || '(无提示词)'}
              </p>
            )}
            {showRevisedPrompt && currentRevisedPrompt && (
              <div className='mb-4'>
                <ActualValueBadge
                  value={currentRevisedPrompt}
                  className='max-w-full rounded px-2 py-1 text-left text-xs leading-relaxed whitespace-pre-wrap'
                />
              </div>
            )}

            {/* 参考图 */}
            {showReferenceSection && (
              <div className='mb-4'>
                <div className='mb-2 flex items-center gap-1.5'>
                  <h3 className='text-xs font-medium tracking-wider text-gray-400 uppercase dark:text-gray-500'>
                    参考图
                  </h3>
                  {allInputImageIds.length > 0 && (
                    <button
                      onClick={handleCopyInputImage}
                      className='rounded p-1 text-gray-400 transition hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06]'
                      title='复制参考图'
                    >
                      <CopyIcon className='h-4 w-4' />
                    </button>
                  )}
                </div>
                {allInputImageIds.length > 0 && (
                  <div className='flex flex-wrap gap-2'>
                    {allInputImageIds.map((imgId) => {
                      const isMaskTarget = imgId === maskTargetId
                      const displaySrc =
                        isMaskTarget && maskPreviewSrc
                          ? maskPreviewSrc
                          : imageSrcs[imgId] || ''
                      return (
                        <div
                          key={imgId}
                          className='group relative inline-block'
                        >
                          <div
                            className={`relative h-16 w-16 cursor-pointer overflow-hidden rounded-lg border transition hover:opacity-80 ${
                              isMaskTarget
                                ? 'border-2 border-blue-500 shadow-sm'
                                : 'border-gray-200 dark:border-white/[0.08]'
                            }`}
                            onClick={() =>
                              setLightboxImageId(imgId, allInputImageIds)
                            }
                          >
                            {displaySrc && (
                              <img
                                src={displaySrc}
                                data-image-id={imgId}
                                className='h-full w-full object-cover'
                                alt=''
                              />
                            )}
                            {isMaskTarget && (
                              <span className='pointer-events-none absolute top-1 left-1 z-10 rounded bg-blue-500/90 px-1.5 py-0.5 text-[8px] leading-none font-bold tracking-wider text-white backdrop-blur-sm'>
                                MASK
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {isAgentTask && (
                  <div
                    className={`${allInputImageIds.length > 0 ? 'mt-2 ' : ''}text-xs text-gray-500 dark:text-gray-400`}
                  >
                    {allInputImageIds.length > 0
                      ? '由模型自主选择，可能包含其他图片'
                      : '由模型自主选择'}
                  </div>
                )}
              </div>
            )}

            {/* 参数 */}
            <h3 className='mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase dark:text-gray-500'>
              参数配置
            </h3>
            <div className='mb-2 min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/[0.03]'>
              <span className='text-gray-400 dark:text-gray-500'>模型</span>
              <br />
              <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                <span className='font-medium text-gray-700 dark:text-gray-200'>
                  {taskModel}
                </span>
              </div>
            </div>
            <div className='mb-4 grid min-w-0 grid-cols-2 gap-2 text-xs'>
              <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                <span className='text-gray-400 dark:text-gray-500'>尺寸</span>
                <br />
                <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                  <DetailParamValue
                    task={task}
                    paramKey='size'
                    className='font-medium'
                    actualParams={currentActualParams}
                  />
                </div>
              </div>
              <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                <span className='text-gray-400 dark:text-gray-500'>质量</span>
                <br />
                <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                  <DetailParamValue
                    task={task}
                    paramKey='quality'
                    className='font-medium'
                    actualParams={currentActualParams}
                  />
                </div>
              </div>
              <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                <span className='text-gray-400 dark:text-gray-500'>格式</span>
                <br />
                <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                  <DetailParamValue
                    task={task}
                    paramKey='output_format'
                    className='font-medium'
                    actualParams={currentActualParams}
                  />
                </div>
              </div>
              {supportsTransparentOutput && (
                <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                  <span className='text-gray-400 dark:text-gray-500'>
                    透明背景
                  </span>
                  <br />
                  <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                    <span className='font-medium text-gray-700 dark:text-gray-300'>
                      {transparentOutputText}
                    </span>
                    {currentTransparentOutputFailed && (
                      <span className='ml-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] leading-none font-medium text-red-600 uppercase dark:bg-red-500/10 dark:text-red-400'>
                        failed
                      </span>
                    )}
                  </div>
                </div>
              )}
              {task.params.output_format !== 'png' && (
                <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                  <span className='text-gray-400 dark:text-gray-500'>
                    压缩率
                  </span>
                  <br />
                  <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                    <span className='font-medium text-gray-700 dark:text-gray-300'>
                      {outputCompressionText}
                    </span>
                  </div>
                </div>
              )}
              <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                <span className='text-gray-400 dark:text-gray-500'>审核</span>
                <br />
                <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                  <DetailParamValue
                    task={task}
                    paramKey='moderation'
                    className='font-medium'
                    actualParams={currentActualParams}
                  />
                </div>
              </div>
              {!isAgentTask && (
                <div className='min-w-0 overflow-hidden rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]'>
                  <span className='text-gray-400 dark:text-gray-500'>数量</span>
                  <br />
                  <div className='hide-scrollbar mask-edge-r mt-0.5 overflow-x-auto pr-2 whitespace-nowrap'>
                    <DetailParamValue
                      task={task}
                      paramKey='n'
                      className='font-medium'
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 时间 */}
            <div className='mb-4 text-xs text-gray-400 dark:text-gray-500'>
              <span>创建于 {formatTime(task.createdAt)}</span>
              {formatDuration() && <span> · 耗时 {formatDuration()}</span>}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className='grid grid-cols-4 gap-2 border-t border-gray-100 pt-4 sm:flex dark:border-white/[0.08]'>
            <button
              onClick={handleReuse}
              className='col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium whitespace-nowrap text-blue-600 transition hover:bg-blue-100 sm:flex-1 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
            >
              <svg
                className='h-4 w-4 flex-shrink-0'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6'
                />
              </svg>
              复用配置
            </button>
            <button
              onClick={handleEdit}
              disabled={!outputLen}
              className='col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-2 text-sm font-medium whitespace-nowrap text-green-600 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20'
            >
              <EditIcon className='h-4 w-4 flex-shrink-0' />
              编辑输出
            </button>
            <button
              onClick={handleDelete}
              className='col-span-3 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium whitespace-nowrap text-red-600 transition hover:bg-red-100 sm:flex-1 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20'
            >
              <TrashIcon className='h-4 w-4 flex-shrink-0' />
              删除任务
            </button>
            <button
              onClick={handleToggleFavorite}
              className={`col-span-1 flex w-full items-center justify-center rounded-xl transition sm:w-11 sm:flex-none ${
                task.isFavorite
                  ? 'bg-yellow-50 text-yellow-500 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20'
                  : 'bg-gray-50 text-gray-400 hover:bg-yellow-50 hover:text-yellow-500 dark:bg-white/[0.04] dark:hover:bg-yellow-500/10'
              }`}
              title={task.isFavorite ? '编辑收藏夹' : '收藏任务'}
            >
              <svg
                className='h-5 w-5'
                fill={task.isFavorite ? 'currentColor' : 'none'}
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showRawUrlsModal && rawImageUrls.length > 0 && (
        <div
          className='fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6'
          onPointerDown={(e) => {
            rawUrlsBackdropPointerDownRef.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (
              rawUrlsBackdropPointerDownRef.current &&
              e.target === e.currentTarget
            )
              setShowRawUrlsModal(false)
            rawUrlsBackdropPointerDownRef.current = false
          }}
        >
          <div
            ref={rawUrlsModalRef}
            className='flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]'>
              <h3 className='text-base font-semibold text-gray-900 dark:text-white'>
                原始图片链接 ({rawImageUrls.length})
              </h3>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={async () => {
                    try {
                      await copyTextToClipboard(rawImageUrls.join('\n'))
                      showToast('复制成功', 'success')
                    } catch (err) {
                      showToast(
                        getClipboardFailureMessage('复制失败', err),
                        'error'
                      )
                    }
                  }}
                  className='flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]'
                >
                  <CopyIcon className='h-3.5 w-3.5' />
                  全部复制
                </button>
                <button
                  type='button'
                  onClick={() => setShowRawUrlsModal(false)}
                  className='rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300'
                >
                  <CloseIcon className='h-5 w-5' />
                </button>
              </div>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/50 p-3 sm:p-5 dark:bg-black/20'>
              <div className='space-y-2.5'>
                {rawImageUrls.map((url, i) => (
                  <div
                    key={i}
                    className='group flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:shadow-md sm:p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]'
                  >
                    <div className='flex min-w-0 flex-1 flex-col gap-1'>
                      <div className='text-xs font-medium text-gray-400 dark:text-gray-500'>
                        图片 {i + 1}
                      </div>
                      <div
                        className='truncate text-sm text-gray-700 select-text dark:text-gray-300'
                        title={url}
                      >
                        {url}
                      </div>
                    </div>
                    <button
                      type='button'
                      onClick={async () => {
                        try {
                          await copyTextToClipboard(url)
                          showToast('复制成功', 'success')
                        } catch (err) {
                          showToast(
                            getClipboardFailureMessage('复制失败', err),
                            'error'
                          )
                        }
                      }}
                      className='flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-gray-50 p-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 sm:px-3 sm:py-1.5 dark:border-white/[0.04] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]'
                      title='复制链接'
                    >
                      <CopyIcon className='h-4 w-4 sm:h-3.5 sm:w-3.5' />
                      <span className='hidden sm:inline'>复制</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRawResponseModal && task?.rawResponsePayload && (
        <div
          className='fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6'
          onPointerDown={(e) => {
            rawResponseBackdropPointerDownRef.current =
              e.target === e.currentTarget
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (
              rawResponseBackdropPointerDownRef.current &&
              e.target === e.currentTarget
            )
              setShowRawResponseModal(false)
            rawResponseBackdropPointerDownRef.current = false
          }}
        >
          <div
            ref={rawResponseModalRef}
            className='flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]'
            onPointerDown={(e) => {
              if (!(e.target as Element).closest('[data-selectable-text]'))
                clearTextSelection()
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]'>
              <h3 className='text-base font-semibold text-gray-900 dark:text-white'>
                原始响应数据
              </h3>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={async () => {
                    try {
                      await copyTextToClipboard(task.rawResponsePayload!)
                      showToast('复制成功', 'success')
                    } catch (err) {
                      showToast(
                        getClipboardFailureMessage('复制失败', err),
                        'error'
                      )
                    }
                  }}
                  className='flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]'
                >
                  <CopyIcon className='h-3.5 w-3.5' />
                  全部复制
                </button>
                <button
                  type='button'
                  onClick={() => setShowRawResponseModal(false)}
                  className='rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300'
                >
                  <CloseIcon className='h-5 w-5' />
                </button>
              </div>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/50 p-5 dark:bg-black/20'>
              <pre
                data-selectable-text
                className='font-mono text-[11px] break-all whitespace-pre-wrap text-gray-600 select-text sm:text-xs dark:text-gray-300'
              >
                {task.rawResponsePayload.replace(
                  /"(b64_json|base64|data)":\s*"[^"]+"/g,
                  '"$1": "<base64_data>"'
                )}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
