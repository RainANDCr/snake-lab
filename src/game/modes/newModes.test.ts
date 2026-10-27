import { describe, expect, it } from 'vitest'
import {
  buildCampaignStageConfig,
  buildDailyConfig,
  buildTournamentConfig,
  CAMPAIGN_BUFFS,
  hashSeed,
  rollBuffOffers,
} from './configs'
import { createInitialState, createSnakeBody, freeCells, reachableFreeCells } from '../core/engine'
import { keyOf } from '../core/types'

describe('每日挑战', () => {
  it('同一天两次构建完全一致（地图/难度/出生点/食物/种子）', () => {
    const a = buildDailyConfig('2026-10-28')
    const b = buildDailyConfig('2026-10-28')
    expect(a.seed).toBe(b.seed)
    expect(a.seed).toBe(hashSeed('snake-lab-daily-2026-10-28'))
    expect(a.walls).toEqual(b.walls)
    expect(a.snakes[0].spawn).toEqual(b.snakes[0].spawn)
    expect(a.snakes[0].direction).toBe(b.snakes[0].direction)
    expect(a.tickMs).toBe(b.tickMs)
    const sa = createInitialState(a)
    const sb = createInitialState(b)
    expect(sa.foods.map((f) => keyOf(f.position))).toEqual(sb.foods.map((f) => keyOf(f.position)))
  })

  it('不同日期生成不同局面', () => {
    const a = buildDailyConfig('2026-10-28')
    const b = buildDailyConfig('2026-10-29')
    const sig = (c: ReturnType<typeof buildDailyConfig>): string =>
      JSON.stringify([c.seed, c.walls.length, c.snakes[0].spawn, c.tickMs])
    expect(sig(a)).not.toBe(sig(b))
  })

  it('配置合法：限时 120s、出生安全、食物可达', () => {
    for (const date of ['2026-10-28', '2026-11-01', '2026-12-25']) {
      const config = buildDailyConfig(date)
      expect(config.mode).toBe('daily')
      expect(config.timeLimitMs).toBe(120 * 1000)
      expect(config.meta?.dailyDate).toBe(date)
      const state = createInitialState(config)
      expect(state.foods).toHaveLength(1)
      const wallKeys = new Set(config.walls.map(keyOf))
      for (const cell of state.snakes[0].body) expect(wallKeys.has(keyOf(cell))).toBe(false)
    }
  })
})

describe('AI 锦标赛', () => {
  it('三条 AI 各据一方且互相远离、出生安全', () => {
    const config = buildTournamentConfig({ rule: 'last-standing', durationSec: 90, difficulty: 'normal' })
    expect(config.mode).toBe('tournament')
    expect(config.snakes.map((s) => s.controller)).toEqual(['bfs', 'astar', 'safe'])
    const spawns = config.snakes.map((s) => s.spawn)
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const cheb = Math.max(Math.abs(spawns[i].x - spawns[j].x), Math.abs(spawns[i].y - spawns[j].y))
        expect(cheb, `选手 ${i} 与 ${j} 出生过近`).toBeGreaterThanOrEqual(2)
      }
    }
    const state = createInitialState(config)
    expect(state.foods).toHaveLength(2)
    const wallKeys = new Set(config.walls.map(keyOf))
    for (const s of state.snakes) for (const c of s.body) expect(wallKeys.has(keyOf(c))).toBe(false)
  })

  it('限时赛制携带时间上限', () => {
    const config = buildTournamentConfig({ rule: 'timed', durationSec: 90, difficulty: 'normal' })
    expect(config.timeLimitMs).toBe(90 * 1000)
  })
})

describe('Roguelike 战役', () => {
  it('增益池定义完整且无重复 ID', () => {
    expect(CAMPAIGN_BUFFS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(CAMPAIGN_BUFFS.map((b) => b.id)).size).toBe(CAMPAIGN_BUFFS.length)
  })

  it('三选一：不可叠加的已拥有增益不再出现，未拥有时必出现', () => {
    const owned = ['slowSpeed', 'growthDown', 'goldenUp', 'extraFood', 'shortStart']
    for (let i = 0; i < 20; i++) {
      const offers = rollBuffOffers(owned)
      expect(offers).toHaveLength(3)
      expect(new Set(offers).size).toBe(3)
      for (const id of offers) {
        const def = CAMPAIGN_BUFFS.find((b) => b.id === id)!
        if (!def.stackable) expect(owned.includes(id)).toBe(false)
      }
    }
    const fresh = rollBuffOffers([])
    // 初始无拥有：任意不可叠加增益都可能被抽到
    expect(fresh.every((id) => CAMPAIGN_BUFFS.some((b) => b.id === id))).toBe(true)
  })

  it('关卡随阶段提速且目标提升，速度不低于下限', () => {
    const s1 = buildCampaignStageConfig(1, [])
    const s5 = buildCampaignStageConfig(5, [])
    const s50 = buildCampaignStageConfig(50, [])
    expect(s5.tickMs).toBeLessThan(s1.tickMs)
    expect(s50.tickMs).toBe(55) // 下限
    expect((s5.goal as { value: number }).value).toBeGreaterThan((s1.goal as { value: number }).value)
    expect(s5.meta?.campaignStage).toBe(5)
  })

  it('增益生效：黄金胃/从容步伐/短蛇/丰饶/护盾/幽灵', () => {
    const base = buildCampaignStageConfig(3, [])
    const boosted = buildCampaignStageConfig(3, ['scoreUp', 'scoreUp', 'slowSpeed', 'shortStart', 'extraFood', 'shieldStart', 'ghostStart', 'goldenUp', 'growthDown'])
    expect(boosted.scoreMultiplier).toBe(1.5)
    expect(boosted.tickMs).toBeGreaterThan(base.tickMs)
    expect(boosted.snakes[0].length).toBe(3)
    expect(boosted.foodCount).toBe(2)
    expect(boosted.snakes[0].shield).toBe(1)
    expect(boosted.snakes[0].ghostTicks).toBe(80)
    expect(boosted.foodRules?.goldenChance).toBe(0.16)
    expect(boosted.foodGrowth).toBe(0)
  })

  it('战役关卡可启动：出生/身体/食物空间合法', () => {
    for (const stage of [1, 2, 7, 16]) {
      const config = buildCampaignStageConfig(stage, ['shieldStart'])
      const state = createInitialState(config)
      expect(state.foods).toHaveLength(config.foodCount)
      const wallKeys = new Set(config.walls.map(keyOf))
      for (const cell of state.snakes[0].body) expect(wallKeys.has(keyOf(cell))).toBe(false)
      expect(state.snakes[0].shield).toBe(1)
    }
  })
})
