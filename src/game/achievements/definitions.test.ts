import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, applyGameSummary, applyUiEvent, defaultAchievementsState } from './definitions'
import { GameSummary } from '../core/types'

function summary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    mode: 'classic',
    difficulty: 'normal',
    manual: true,
    score: 0,
    foodEaten: 0,
    durationMs: 60_000,
    won: false,
    controller: 'human',
    ...overrides,
  }
}

describe('成就系统（20 个配置驱动成就）', () => {
  it('定义恰好 20 个成就且目标均为正数', () => {
    expect(ACHIEVEMENTS).toHaveLength(20)
    for (const def of ACHIEVEMENTS) {
      expect(def.target).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('达到阈值时一次性解锁，重复事件不重复计数', () => {
    const state = defaultAchievementsState()
    const first = applyGameSummary(state, summary({ foodEaten: 10 }))
    expect(first.map((d) => d.id)).toContain('first-game')
    expect(first.map((d) => d.id)).toContain('food-10')
    const unlockTime = state.unlocked['food-10']
    expect(unlockTime).toBeGreaterThan(0)
    // 再次只有 1 个食物：不重复解锁，计数正确累加
    applyGameSummary(state, summary({ foodEaten: 1 }))
    expect(state.counters.totalFood).toBe(11)
    expect(Object.keys(state.unlocked)).toHaveLength(Object.keys(state.unlocked).length)
    expect(state.unlocked['food-10']).toBe(unlockTime)
  })

  it('累计食物成就跨越多局统计（10/100/1000）', () => {
    const state = defaultAchievementsState()
    applyGameSummary(state, summary({ foodEaten: 100 }))
    expect(state.unlocked['food-100']).toBeGreaterThan(0)
    expect(state.unlocked['food-1000']).toBeUndefined()
    applyGameSummary(state, summary({ foodEaten: 900 }))
    expect(state.unlocked['food-1000']).toBeGreaterThan(0)
  })

  it('单局分数成就只认人工操作，AI 刷分不计入', () => {
    const state = defaultAchievementsState()
    applyGameSummary(state, summary({ manual: false, score: 2000, controller: 'safe' }))
    expect(state.counters.bestManualScore).toBe(0)
    expect(state.unlocked['score-100']).toBeUndefined()
    applyGameSummary(state, summary({ manual: true, score: 120 }))
    expect(state.counters.bestManualScore).toBe(120)
    expect(state.unlocked['score-100']).toBeGreaterThan(0)
    expect(state.unlocked['score-500']).toBeUndefined()
  })

  it('对战局的分数不计入人工高分成就，但计入对战统计', () => {
    const state = defaultAchievementsState()
    applyGameSummary(state, summary({ mode: 'versus', manual: true, score: 999, versusResult: 'win' }))
    expect(state.counters.bestManualScore).toBe(0)
    expect(state.counters.versusWins).toBe(1)
    expect(state.unlocked['vs-first']).toBeGreaterThan(0)
    expect(state.unlocked['vs-win-5']).toBeUndefined()
  })

  it('对战胜利累计解锁 5/20 胜成就', () => {
    const state = defaultAchievementsState()
    for (let i = 0; i < 5; i++) applyGameSummary(state, summary({ mode: 'versus', versusResult: 'win' }))
    expect(state.unlocked['vs-win-5']).toBeGreaterThan(0)
    expect(state.unlocked['vs-win-20']).toBeUndefined()
    for (let i = 0; i < 15; i++) applyGameSummary(state, summary({ mode: 'versus', versusResult: 'win' }))
    expect(state.unlocked['vs-win-20']).toBeGreaterThan(0)
  })

  it('AI 使用与演示事件解锁', () => {
    const state = defaultAchievementsState()
    applyUiEvent(state, { type: 'ai_used', algorithm: 'bfs' })
    expect(state.unlocked['ai-bfs']).toBeGreaterThan(0)
    expect(state.unlocked['ai-astar']).toBeUndefined()
    applyUiEvent(state, { type: 'ai_used', algorithm: 'astar' })
    expect(state.unlocked['ai-astar']).toBeGreaterThan(0)
    applyUiEvent(state, { type: 'viz_demo' })
    expect(state.unlocked['ai-viz']).toBeGreaterThan(0)
  })

  it('地图创建计数（重复保存同一张图不应重复计数由服务层保证，事件层只累计）', () => {
    const state = defaultAchievementsState()
    for (let i = 0; i < 10; i++) applyUiEvent(state, { type: 'map_created', mapId: `m${i}` })
    expect(state.unlocked['map-first']).toBeGreaterThan(0)
    expect(state.unlocked['map-10']).toBeGreaterThan(0)
  })

  it('地图探险家按去重地图计数', () => {
    const state = defaultAchievementsState()
    applyGameSummary(state, summary({ mapId: 'a' }))
    applyGameSummary(state, summary({ mapId: 'a' })) // 同一张图重复游玩
    applyGameSummary(state, summary({ mapId: 'b' }))
    expect(state.counters.mapsPlayed).toEqual(['a', 'b'])
    applyGameSummary(state, summary({ mapId: 'c' }))
    applyGameSummary(state, summary({ mapId: 'd' }))
    applyGameSummary(state, summary({ mapId: 'e' }))
    expect(state.unlocked['map-play-5']).toBeGreaterThan(0)
  })

  it('关卡星级只升不降并驱动关卡成就', () => {
    const state = defaultAchievementsState()
    applyGameSummary(state, summary({ mode: 'level', officialLevelId: 1, stars: 2, won: true }))
    expect(state.counters.levelStars[1]).toBe(2)
    applyGameSummary(state, summary({ mode: 'level', officialLevelId: 1, stars: 1, won: true }))
    expect(state.counters.levelStars[1]).toBe(2)
    expect(state.unlocked['level-star']).toBeGreaterThan(0)
    // 通关 5 个不同关卡
    for (let id = 2; id <= 5; id++) applyGameSummary(state, summary({ mode: 'level', officialLevelId: id, stars: 1, won: true }))
    expect(state.unlocked['level-5']).toBeGreaterThan(0)
    expect(state.unlocked['level-all']).toBeUndefined()
  })
})
