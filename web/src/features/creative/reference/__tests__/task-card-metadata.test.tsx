/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_PARAMS, type TaskRecord } from '../types'

const mocks = vi.hoisted(() => ({
  ensureImageThumbnailCached: vi.fn(),
}))

vi.mock('../lib/imageCache', () => ({
  ensureImageThumbnailCached: mocks.ensureImageThumbnailCached,
  subscribeImageThumbnail: () => () => {},
}))

vi.mock('../store', () => ({
  retryTask: vi.fn(),
  useStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      toggleTaskSelection: vi.fn(),
      settings: { alwaysShowRetryButton: false },
      openFavoritePicker: vi.fn(),
      streamPreviews: {},
    }),
}))

const { default: TaskCard } = await import('../components/TaskCard')

describe('生成结果卡片元数据', () => {
  it('刷新后直接使用任务中的图片尺寸和文件大小', () => {
    const imageURL = 'https://bucket.oss.example/creative/image-1.png'
    mocks.ensureImageThumbnailCached.mockResolvedValue({ dataUrl: imageURL })
    const task: TaskRecord = {
      id: 'task-1',
      prompt: '生成一张图片',
      params: { ...DEFAULT_PARAMS },
      apiProfileName: '小鱼API',
      inputImageIds: [],
      outputImages: [imageURL],
      outputImageMetadata: {
        [imageURL]: {
          byteSize: 1.7 * 1024 * 1024,
          width: 1024,
          height: 768,
        },
      },
      status: 'done',
      error: null,
      createdAt: 1,
      finishedAt: 51_001,
      elapsed: 51_000,
    }

    render(
      <TaskCard
        task={task}
        onReuse={vi.fn()}
        onEditOutputs={vi.fn()}
        onDelete={vi.fn()}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText('4:3')).toBeInTheDocument()
    expect(screen.getByText('1024×768')).toBeInTheDocument()
    expect(screen.getByText('1.7 MB')).toBeInTheDocument()
  })
})
