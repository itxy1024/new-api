import { dismissAllTooltips } from '../../lib/tooltipDismiss'
import type { ApiProfile, TaskParams } from '../../types'
import Select from '../Select'
import ButtonTooltip from './buttonTooltip'

interface HintTooltipState {
  visible: boolean
  show: () => void
  hide: () => void
  clearTimer: () => void
  startTouch: () => void
}

export default function InputParamsPanel({
  cols,
  params,
  setParams,
  activeProfile,
  isFalProvider,
  isFalTextToImage,
  displaySize,
  qualityOptions,
  selectClass,
  transparentOutputAvailable,
  showTransparentOutputControl,
  transparentOutputEnabled,
  transparentOutputHint,
  onTransparentOutputMenuOpenChange,
  compressionHint,
  compressionDisabled,
  outputCompressionInput,
  setOutputCompressionInput,
  commitOutputCompression,
  moderationHint,
  moderationDisabled,
  agentAutoImageCount,
  outputImageLimit,
  nInput,
  setNInputFocused,
  commitN,
  handleNInputChange,
  handleNLimitIncreaseAttempt,
  showAgentNHint,
  hideNLimitHint,
  startAgentNHintTouch,
  clearAgentNHintTouchTimer,
  nLimitHint,
  nLimitHintText,
  streamConcurrentByN,
  streamConcurrentHint,
  sizeHint,
  qualityHint,
  onOpenSizePicker,
}: {
  cols: string
  params: TaskParams
  setParams: (patch: Partial<TaskParams>) => void
  activeProfile: ApiProfile
  isFalProvider: boolean
  isFalTextToImage: boolean
  displaySize: string
  qualityOptions: Array<{ label: string; value: string }>
  selectClass: string
  transparentOutputAvailable: boolean
  showTransparentOutputControl: boolean
  transparentOutputEnabled: boolean
  transparentOutputHint: HintTooltipState
  onTransparentOutputMenuOpenChange: (open: boolean) => void
  compressionHint: HintTooltipState
  compressionDisabled: boolean
  outputCompressionInput: string
  setOutputCompressionInput: (value: string) => void
  commitOutputCompression: () => void
  moderationHint: HintTooltipState
  moderationDisabled: boolean
  agentAutoImageCount: boolean
  outputImageLimit: number
  nInput: string
  setNInputFocused: (focused: boolean) => void
  commitN: () => void
  handleNInputChange: (value: string) => void
  handleNLimitIncreaseAttempt: (preventDefault: () => void) => void
  showAgentNHint: () => void
  hideNLimitHint: () => void
  startAgentNHintTouch: () => void
  clearAgentNHintTouchTimer: () => void
  nLimitHint: HintTooltipState
  nLimitHintText: string
  streamConcurrentByN: boolean
  streamConcurrentHint: HintTooltipState
  sizeHint: HintTooltipState
  qualityHint: HintTooltipState
  onOpenSizePicker: () => void
}) {
  return (
    <div className={`grid ${cols} flex-1 gap-2 text-xs`}>
      <label
        className='relative flex flex-col gap-0.5'
        onMouseEnter={sizeHint.show}
        onMouseLeave={sizeHint.hide}
        onTouchStart={sizeHint.startTouch}
        onTouchEnd={sizeHint.clearTimer}
        onTouchCancel={sizeHint.hide}
        onClick={sizeHint.show}
      >
        <span className='ml-1 text-gray-400 dark:text-gray-500'>尺寸</span>
        <button
          type='button'
          onClick={() => {
            dismissAllTooltips()
            onOpenSizePicker()
          }}
          className='rounded-xl border border-gray-200/60 bg-white/50 px-3 py-1.5 text-left font-mono text-xs shadow-sm transition-all duration-200 hover:bg-white focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
        >
          {displaySize}
        </button>
        <ButtonTooltip
          visible={
            (isFalTextToImage || activeProfile.codexCli) && sizeHint.visible
          }
          text={
            isFalTextToImage ? (
              <>
                fal.ai 的文生图模式不支持{' '}
                <code className='rounded bg-white/10 px-1 py-0.5 font-mono'>
                  auto
                </code>{' '}
                参数
              </>
            ) : (
              'Codex CLI 不支持尺寸参数，此处设置仅基于提示词工程'
            )
          }
        />
      </label>
      <label
        className='relative flex flex-col gap-0.5'
        onMouseEnter={qualityHint.show}
        onMouseLeave={qualityHint.hide}
        onTouchStart={qualityHint.startTouch}
        onTouchEnd={qualityHint.clearTimer}
        onTouchCancel={qualityHint.hide}
        onClick={qualityHint.show}
      >
        <span className='ml-1 text-gray-400 dark:text-gray-500'>质量</span>
        <Select
          value={
            activeProfile.codexCli
              ? 'auto'
              : isFalProvider && params.quality === 'auto'
                ? 'high'
                : params.quality
          }
          onChange={(val) => {
            if (!activeProfile.codexCli)
              setParams({ quality: val as TaskParams['quality'] })
          }}
          options={qualityOptions}
          disabled={activeProfile.codexCli}
          showValueTooltips={false}
          className={
            activeProfile.codexCli
              ? 'cursor-not-allowed rounded-xl border border-gray-200/60 bg-gray-100/50 px-3 py-1.5 text-xs opacity-50 shadow-sm transition-all duration-200 dark:border-white/[0.08] dark:bg-white/[0.05]'
              : selectClass
          }
        />
        <ButtonTooltip
          visible={
            (activeProfile.codexCli || isFalProvider) && qualityHint.visible
          }
          text={
            isFalProvider ? (
              <>
                fal.ai 不支持{' '}
                <code className='rounded bg-white/10 px-1 py-0.5 font-mono'>
                  auto
                </code>{' '}
                质量参数
              </>
            ) : (
              'Codex CLI 不支持质量参数'
            )
          }
        />
      </label>
      <label className='flex flex-col gap-0.5'>
        <span className='ml-1 text-gray-400 dark:text-gray-500'>格式</span>
        <Select
          value={params.output_format}
          onChange={(val) => {
            setParams({
              output_format: val as TaskParams['output_format'],
              ...(val === 'png' ? { output_compression: null } : {}),
              ...(val === 'jpeg' ? { transparent_output: false } : {}),
            })
          }}
          options={[
            { label: 'PNG', value: 'png' },
            { label: 'JPEG', value: 'jpeg' },
            { label: 'WebP', value: 'webp' },
          ]}
          showValueTooltips={false}
          className={selectClass}
        />
      </label>
      {showTransparentOutputControl && (
        <label
          className='relative flex flex-col gap-0.5'
          onMouseEnter={transparentOutputHint.show}
          onMouseLeave={transparentOutputHint.hide}
          onTouchStart={transparentOutputHint.startTouch}
          onTouchEnd={transparentOutputHint.clearTimer}
          onTouchCancel={transparentOutputHint.hide}
          onClick={transparentOutputHint.show}
        >
          <span className='ml-1 text-gray-400 dark:text-gray-500'>
            透明背景
          </span>
          <Select
            value={transparentOutputEnabled ? 'on' : 'off'}
            onChange={(val) => {
              if (!transparentOutputAvailable) return
              setParams({
                transparent_output: val === 'on',
                ...(params.output_format === 'png'
                  ? { output_compression: null }
                  : {}),
              })
            }}
            options={[
              { label: 'false', value: 'off' },
              { label: 'true', value: 'on' },
            ]}
            showValueTooltips={false}
            className={selectClass}
            onOpenChange={onTransparentOutputMenuOpenChange}
          />
          <ButtonTooltip
            visible={transparentOutputHint.visible}
            text='实现方式可在设置的 API 配置中选择'
          />
        </label>
      )}
      {!showTransparentOutputControl && (
        <label
          className='relative flex flex-col gap-0.5'
          onMouseEnter={compressionHint.show}
          onMouseLeave={compressionHint.hide}
          onTouchStart={compressionHint.startTouch}
          onTouchEnd={compressionHint.clearTimer}
          onTouchCancel={compressionHint.hide}
          onClick={compressionHint.show}
        >
          <span className='ml-1 text-gray-400 dark:text-gray-500'>压缩率</span>
          <input
            value={outputCompressionInput}
            onChange={(e) => setOutputCompressionInput(e.target.value)}
            onBlur={commitOutputCompression}
            disabled={compressionDisabled}
            type='number'
            min={0}
            max={100}
            placeholder='0-100'
            className={`rounded-xl border border-gray-200/60 px-3 py-1.5 text-xs shadow-sm transition-all duration-200 focus:outline-none dark:border-white/[0.08] ${
              compressionDisabled
                ? 'cursor-not-allowed bg-gray-100/50 opacity-50 dark:bg-white/[0.05]'
                : 'bg-white/50 dark:bg-white/[0.03]'
            }`}
          />
          <ButtonTooltip
            visible={compressionHint.visible}
            text={
              isFalProvider
                ? 'fal.ai 不支持压缩率参数'
                : '仅 JPEG 和 WebP 支持压缩率'
            }
          />
        </label>
      )}
      <label
        className='relative flex flex-col gap-0.5'
        onMouseEnter={moderationHint.show}
        onMouseLeave={moderationHint.hide}
        onTouchStart={moderationHint.startTouch}
        onTouchEnd={moderationHint.clearTimer}
        onTouchCancel={moderationHint.hide}
        onClick={moderationHint.show}
      >
        <span className='ml-1 text-gray-400 dark:text-gray-500'>审核</span>
        <Select
          value={moderationDisabled ? 'auto' : params.moderation}
          onChange={(val) => {
            if (!moderationDisabled)
              setParams({ moderation: val as TaskParams['moderation'] })
          }}
          options={[
            { label: 'auto', value: 'auto' },
            { label: 'low', value: 'low' },
          ]}
          disabled={moderationDisabled}
          showValueTooltips={false}
          className={
            moderationDisabled
              ? 'cursor-not-allowed rounded-xl border border-gray-200/60 bg-gray-100/50 px-3 py-1.5 text-xs opacity-50 shadow-sm transition-all duration-200 dark:border-white/[0.08] dark:bg-white/[0.05]'
              : selectClass
          }
        />
        <ButtonTooltip
          visible={moderationDisabled && moderationHint.visible}
          text='fal.ai 不支持审核参数'
        />
      </label>
      <label
        className='relative flex flex-col gap-0.5'
        onMouseEnter={() => {
          showAgentNHint()
          streamConcurrentHint.show()
        }}
        onMouseLeave={() => {
          hideNLimitHint()
          streamConcurrentHint.hide()
        }}
        onTouchStart={() => {
          startAgentNHintTouch()
          streamConcurrentHint.startTouch()
        }}
        onTouchEnd={() => {
          clearAgentNHintTouchTimer()
          streamConcurrentHint.clearTimer()
        }}
        onTouchCancel={() => {
          clearAgentNHintTouchTimer()
          hideNLimitHint()
          streamConcurrentHint.hide()
        }}
        onClick={() => {
          showAgentNHint()
          streamConcurrentHint.show()
        }}
      >
        <span className='ml-1 text-gray-400 dark:text-gray-500'>数量</span>
        <input
          value={nInput}
          onChange={(e) => handleNInputChange(e.target.value)}
          onFocus={() => setNInputFocused(true)}
          onBlur={() => {
            setNInputFocused(false)
            commitN()
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              handleNLimitIncreaseAttempt(() => e.preventDefault())
            }
          }}
          onWheel={(e) => {
            if (e.deltaY < 0) {
              handleNLimitIncreaseAttempt(() => e.preventDefault())
            }
          }}
          disabled={agentAutoImageCount}
          type={agentAutoImageCount ? 'text' : 'number'}
          min={agentAutoImageCount ? undefined : 1}
          max={agentAutoImageCount ? undefined : outputImageLimit}
          className={`rounded-xl border border-gray-200/60 px-3 py-1.5 text-xs shadow-sm transition-all duration-200 focus:outline-none dark:border-white/[0.08] ${
            agentAutoImageCount
              ? 'cursor-not-allowed bg-gray-100/50 opacity-50 dark:bg-white/[0.05]'
              : 'bg-white/50 dark:bg-white/[0.03]'
          }`}
        />
        <ButtonTooltip visible={nLimitHint.visible} text={nLimitHintText} />
        <ButtonTooltip
          visible={
            streamConcurrentByN &&
            streamConcurrentHint.visible &&
            !nLimitHint.visible
          }
          text='数量大于 1 时会将多图生成拆分为并发单图'
        />
      </label>
    </div>
  )
}
