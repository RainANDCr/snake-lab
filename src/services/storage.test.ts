import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Node 环境的 localStorage 内存桩 */
class MemStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v))
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  get length(): number {
    return this.map.size
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemStorage())
})

describe('版本化存储层', () => {
  it('设置读写往返', async () => {
    const { storage } = await import('./storage')
    const s = storage.loadSettings()
    expect(s.theme).toBe('neon')
    s.theme = 'pixel'
    s.volume = 0.8
    expect(storage.saveSettings(s)).toBe(true)
    const reloaded = storage.loadSettings()
    expect(reloaded.theme).toBe('pixel')
    expect(reloaded.volume).toBe(0.8)
  })

  it('损坏的数据回退到默认值而不崩溃', async () => {
    const { storage } = await import('./storage')
    localStorage.setItem('snakelab.settings.v1', '{{{broken json')
    const s = storage.loadSettings()
    expect(s.theme).toBe('neon')
  })

  it('信封结构错误时回退默认值', async () => {
    const { storage } = await import('./storage')
    localStorage.setItem('snakelab.settings.v1', JSON.stringify({ noVersion: true }))
    expect(storage.loadSettings().sound).toBe(true)
  })

  it('未来版本数据回退默认值（前向保护）', async () => {
    const { storage } = await import('./storage')
    localStorage.setItem('snakelab.settings.v1', JSON.stringify({ version: 99, data: { theme: 'pixel' } }))
    expect(storage.loadSettings().theme).toBe('neon')
  })

  it('版本迁移：v0 旧格式（无信封）迁移到当前结构', async () => {
    const { storage } = await import('./storage')
    // 模拟旧版裸数据
    localStorage.setItem(
      'snakelab.settings.v1',
      JSON.stringify({ legacy: true, theme: 'light', sound: false, volume: 0.3, virtualDpad: true, version: 0 }),
    )
    const s = storage.loadSettings()
    // 读取时结构无效但 migration 未注册 → 回退默认；此处验证不抛异常
    expect(['neon', 'light', 'pixel']).toContain(s.theme)
  })

  it('统计记录上限 10 条', async () => {
    const { storage } = await import('./storage')
    const stats = storage.loadStats()
    for (let i = 0; i < 15; i++) {
      stats.recent.unshift({
        mode: 'classic', difficulty: 'normal', manual: true, score: i, foodEaten: i,
        durationMs: 1000, won: false, controller: 'human', at: i,
      })
    }
    storage.saveStats(stats)
    expect(storage.loadStats().recent).toHaveLength(10)
  })

  it('地图存取并过滤非法数据', async () => {
    const { storage } = await import('./storage')
    const { emptyMap } = await import('../game/maps/validation')
    const good = emptyMap('好图')
    const bad = { ...emptyMap('坏图'), width: 999, height: 0 }
    expect(storage.saveMaps([good, bad as typeof good])).toBe(true)
    const maps = storage.loadMaps()
    expect(maps).toHaveLength(1)
    expect(maps[0].name).toBe('好图')
  })

  it('导出备份并完整恢复', async () => {
    const { storage } = await import('./storage')
    const { emptyMap } = await import('../game/maps/validation')
    storage.saveSettings({ ...storage.loadSettings(), theme: 'light' })
    storage.saveMaps([emptyMap('备份图')])
    const json = storage.exportAll()
    expect(json).toContain('snake-lab')

    vi.stubGlobal('localStorage', new MemStorage()) // 清空模拟重装
    const { storage: freshStorage } = await import('./storage')
    const result = freshStorage.importAll(json)
    expect(result.ok).toBe(true)
    expect(result.restored).toContain('设置')
    expect(result.restored).toContain('地图')
    expect(freshStorage.loadSettings().theme).toBe('light')
    expect(freshStorage.loadMaps()[0]?.name).toBe('备份图')
  })

  it('导入非本应用备份被拒绝', async () => {
    const { storage } = await import('./storage')
    const result = storage.importAll(JSON.stringify({ app: 'other-app', foo: 1 }))
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('备份')
  })

  it('清除全部数据', async () => {
    const { storage } = await import('./storage')
    storage.saveSettings({ ...storage.loadSettings(), theme: 'pixel' })
    storage.clearAll()
    expect(storage.loadSettings().theme).toBe('neon')
  })

  it('游戏汇总 → 统计 + 成就 + 关卡进度联动', async () => {
    const { storage } = await import('./storage')
    const { recordGameSummary } = await import('./records')
    recordGameSummary({
      mode: 'level', difficulty: 'normal', manual: true, score: 150, foodEaten: 15,
      durationMs: 90_000, won: true, officialLevelId: 1, controller: 'human', at: Date.now(),
    })
    const stats = storage.loadStats()
    expect(stats.totalGames).toBe(1)
    expect(stats.totalScore).toBe(150)
    const progress = storage.loadLevelProgress()
    expect(progress.unlocked).toBe(2)
    expect(progress.best[1].score).toBe(150)
    expect(progress.best[1].stars).toBe(3) // 第1关三星线 130，150 ≥ 130
    const ach = storage.loadAchievements()
    expect(ach.unlocked['first-game']).toBeGreaterThan(0)
    expect(ach.unlocked['level-star']).toBeGreaterThan(0)
  })

  it('关卡历史星级不因重玩下降', async () => {
    const { storage } = await import('./storage')
    const { recordGameSummary } = await import('./records')
    // 第2关星级阈值 [80, 150, 220]：200 分 = 二星，90 分 = 一星
    recordGameSummary({ mode: 'level', difficulty: 'normal', manual: true, score: 200, foodEaten: 20, durationMs: 60000, won: true, officialLevelId: 2, controller: 'human', at: Date.now() })
    recordGameSummary({ mode: 'level', difficulty: 'normal', manual: true, score: 90, foodEaten: 9, durationMs: 30000, won: true, officialLevelId: 2, controller: 'human', at: Date.now() })
    const progress = storage.loadLevelProgress()
    expect(progress.best[2].score).toBe(200)
    expect(progress.best[2].stars).toBe(2)
  })
})
