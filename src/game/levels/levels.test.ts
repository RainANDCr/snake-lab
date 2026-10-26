import { describe, expect, it } from 'vitest'
import { CHAPTERS, LEVELS, getLevel, levelToConfig, starsForScore } from './levels'
import { createInitialState, createSnakeBody, freeCells, reachableFreeCells } from '../core/engine'
import { keyOf } from '../core/types'

describe('15 个官方关卡配置合法性', () => {
  it('共 15 关，分 3 章每章 5 关，ID 连续唯一', () => {
    expect(LEVELS).toHaveLength(15)
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(15)
    for (const chapter of CHAPTERS) {
      expect(LEVELS.filter((l) => l.chapter === chapter.id)).toHaveLength(5)
    }
  })

  it.each(LEVELS.map((l) => [l.id, l.name] as const))('第 %i 关「%s」可启动：出生/身体/食物空间全部合法', (id) => {
    const def = getLevel(id)!
    const config = levelToConfig(def, 'normal')
    const state = createInitialState(config)
    // 初始身体全部在场内且不与障碍重叠
    const wallKeys = new Set(def.walls.map(keyOf))
    for (const cell of createSnakeBody(def.spawn, def.direction, def.initialLength)) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.x).toBeLessThan(def.width)
      expect(cell.y).toBeLessThan(def.height)
      expect(wallKeys.has(keyOf(cell))).toBe(false)
    }
    // 初始食物成功生成（证明存在从出生点可达的食物空间）
    expect(state.foods).toHaveLength(config.foodCount)
    // 可达空间至少占空闲格的 25%，保证地图真实可玩
    const reach = reachableFreeCells(state).length
    const free = freeCells(state).length
    expect(reach).toBeGreaterThanOrEqual(Math.floor(free * 0.25))
    expect(free).toBeGreaterThan(30)
  })

  it('星级阈值严格升序且不超过目标可达范围', () => {
    for (const def of LEVELS) {
      const [s1, s2, s3] = def.stars
      expect(s1).toBeLessThan(s2)
      expect(s2).toBeLessThan(s3)
      expect(s1).toBeGreaterThan(0)
      // 通关目标分数不应高于三星线（能通关至少一星）
      if (def.goal.type === 'score') {
        expect(def.goal.value).toBeLessThanOrEqual(def.stars[2])
        expect(def.goal.value).toBeGreaterThanOrEqual(def.stars[0])
      }
    }
  })

  it('关卡解锁链：完成第 n 关解锁第 n+1 关', () => {
    // 由 recordGameSummary 逻辑保证：这里验证关卡 id 连续使解锁链完整
    for (let i = 1; i <= 15; i++) expect(getLevel(i)?.id).toBe(i)
  })

  it('starsForScore 按阈值评级', () => {
    const def = getLevel(1)!
    expect(starsForScore(def, 0)).toBe(0)
    expect(starsForScore(def, def.stars[0])).toBe(1)
    expect(starsForScore(def, def.stars[1])).toBe(2)
    expect(starsForScore(def, def.stars[2])).toBe(3)
  })
})
