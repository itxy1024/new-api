import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../lib/apiProfiles'
import { setNewApiSelection } from '../lib/newApiSelection'
import { submitTask, useStore } from '../store'
import { DEFAULT_PARAMS } from '../types'

const mocks = vi.hoisted(() => ({
  callImageApi: vi.fn(),
  putTask: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  callImageApi: mocks.callImageApi,
}))

vi.mock('../lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/db')>()),
  putTask: mocks.putTask,
}))

describe('NewAPI 独立任务提交', () => {
  beforeEach(() => {
    mocks.callImageApi.mockReset().mockReturnValue(new Promise(() => {}))
    mocks.putTask.mockReset().mockResolvedValue('task-key')
    const profile = {
      ...DEFAULT_SETTINGS.profiles[0],
      id: 'newapi',
      name: 'NewAPI',
      provider: 'openai' as const,
      baseUrl: '/api/creative',
      apiKey: '17',
      model: 'vendor-image-model',
      apiMode: 'images' as const,
    }
    useStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        activeProfileId: profile.id,
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        profiles: [profile],
      },
      prompt: '生成三张独立图片',
      params: { ...DEFAULT_PARAMS, n: 3 },
      inputImages: [],
      maskDraft: null,
      tasks: [],
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
    })
    setNewApiSelection({
      keyId: 17,
      model: profile.model,
      group: 'premium',
    })
  })

  afterEach(() => {
    setNewApiSelection(null)
    useStore.setState({ tasks: [], prompt: '', params: { ...DEFAULT_PARAMS } })
    vi.clearAllMocks()
  })

  it('数量为三时立即显示三个运行中任务并分别请求后端', async () => {
    await submitTask()

    const tasks = useStore.getState().tasks
    expect(tasks).toHaveLength(3)
    expect(new Set(tasks.map((task) => task.id))).toHaveProperty('size', 3)
    expect(tasks.every((task) => task.status === 'running')).toBe(true)
    expect(tasks.every((task) => task.params.n === 1)).toBe(true)
    expect(mocks.putTask).toHaveBeenCalledTimes(3)
    expect(mocks.callImageApi).toHaveBeenCalledTimes(3)
    expect(
      mocks.callImageApi.mock.calls.map((call) => call[0].clientTaskId)
    ).toEqual(expect.arrayContaining(tasks.map((task) => task.id)))
    expect(
      mocks.callImageApi.mock.calls.every((call) => call[0].params.n === 1)
    ).toBe(true)
  })
})
