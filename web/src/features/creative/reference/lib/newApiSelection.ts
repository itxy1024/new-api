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

const NEW_API_SELECTION_STORAGE_KEY = 'creative:new-api-selection:v1'

let selection: NewApiSelection | null = null
const listeners = new Set<() => void>()

export function getStoredNewApiSelection(): NewApiSelection | null {
  try {
    const value = window.localStorage.getItem(NEW_API_SELECTION_STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<NewApiSelection>
    if (
      !Number.isInteger(parsed.keyId) ||
      Number(parsed.keyId) <= 0 ||
      typeof parsed.model !== 'string' ||
      !parsed.model.trim() ||
      typeof parsed.group !== 'string'
    ) {
      return null
    }
    return {
      keyId: Number(parsed.keyId),
      model: parsed.model,
      group: parsed.group,
    }
  } catch {
    return null
  }
}

export function saveNewApiSelection(next: NewApiSelection) {
  try {
    window.localStorage.setItem(
      NEW_API_SELECTION_STORAGE_KEY,
      JSON.stringify(next)
    )
  } catch {
    // 隐私模式或浏览器禁用本地存储时，仅保留当前页面内存状态。
  }
}

export function clearStoredNewApiSelection() {
  try {
    window.localStorage.removeItem(NEW_API_SELECTION_STORAGE_KEY)
  } catch {
    // 浏览器禁用本地存储时无需额外处理。
  }
}

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
