/*
 * Copyright (c) 2026 CookSleep
 *
 * 本文件基于 gpt_image_playground（MIT License）改编。
 * NewAPI 仅替换认证、Key/模型选择和生成接口，画廊交互保持原项目结构。
 */

export type NewApiSelection = {
  keyId: number
  model: string
  group: string
}

let selection: NewApiSelection | null = null
const listeners = new Set<() => void>()

export function setNewApiSelection(next: NewApiSelection | null) {
  selection = next
  for (const listener of listeners) listener()
}

export function getNewApiSelection(): NewApiSelection | null {
  return selection
}

/** 让输入栏在选择器异步加载/切换后立即刷新提交状态。 */
export function subscribeNewApiSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
