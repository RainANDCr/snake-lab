import { describe, expect, it } from 'vitest'
import { buildHamiltonCycle, getCachedCycle, isBodyAligned, perfectDirection, pickAlignedSpawn } from './hamilton'
import { aiDecide } from './controller'
import { createInitialState, setDirection, stepGame } from '../core/engine'
import { MatchConfig, SnakeState, keyOf } from '../core/types'

function fakeSnake(body: { x: number; y: number }[]): SnakeState {
  return { body: body.map((p) => ({ ...p })), ghostTicks: 0, pendingGrowth: 0 } as unknown as SnakeState
}

describe('哈密顿回路构造', () => {
  it.each([
    [24, 24], [16, 16], [20, 12], [6, 4], [2, 5], [5, 6],
  ])('%ix%i 回路覆盖全部格子且相邻闭合', (w, h) => {
    const cycle = buildHamiltonCycle(w, h)
    expect(cycle).not.toBeNull()
    expect(cycle!.order).toHaveLength(w * h)
    const seen = new Set<string>()
    for (const p of cycle!.order) {
      expect(seen.has(keyOf(p))).toBe(false)
      seen.add(keyOf(p))
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(w)
      expect(p.y).toBeLessThan(h)
    }
    // 相邻且首尾闭合
    for (let i = 0; i < cycle!.order.length; i++) {
      const a = cycle!.order[i]
      const b = cycle!.order[(i + 1) % cycle!.order.length]
      const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      expect(dist, `序号 ${i} 处不相邻`).toBe(1)
    }
  })

  it('宽高均为奇数时回路不存在', () => {
    expect(buildHamiltonCycle(5, 5)).toBeNull()
    expect(buildHamiltonCycle(7, 3)).toBeNull()
  })
})

describe('完美 AI', () => {
  function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
    return {
      mode: 'custom',
      width: 20,
      height: 20,
      wrap: false,
      walls: [],
      snakes: [{ id: 'p1', name: 'AI', color: '#fff', spawn: { x: 5, y: 10 }, direction: 'right', length: 4, controller: 'perfect' }],
      foodCount: 1,
      foodValue: 10,
      foodGrowth: 1,
      tickMs: 100,
      goal: { type: 'none' },
      ...overrides,
    }
  }

  it('200 个 tick 内数学上不会死亡（空场 + 对齐出生）', () => {
    const cycle = getCachedCycle(20, 20)!
    const aligned = pickAlignedSpawn(cycle, 4, new Set())
    expect(aligned).not.toBeNull()
    const cfg = config()
    cfg.snakes[0] = { ...cfg.snakes[0], spawn: aligned!.spawn, direction: aligned!.direction, bodyCells: aligned!.bodyCells }
    let state = createInitialState(cfg)
    state.status = 'playing'
    for (let i = 0; i < 200 && state.status === 'playing'; i++) {
      const dir = perfectDirection(state.wallSet, 20, 20, state.snakes[0], state.foods.map((f) => f.position))
      expect(dir, `第 ${i} tick 完美 AI 失效`).not.toBeNull()
      setDirection(state, 'p1', dir!)
      state = stepGame(state).next
    }
    expect(state.snakes[0].alive).toBe(true)
    expect(state.snakes[0].foodEaten).toBeGreaterThan(3)
  })

  it('安全判据：回路下一格被身体中段占据时回退 null，对齐身体正常决策', () => {
    const cycle = getCachedCycle(20, 20)!
    const body = [cycle.order[100], cycle.order[99], cycle.order[98], cycle.order[97]]
    // 不安全构造：回路下一格 (order[101]) 被身体占据且来不及腾出
    const unsafe = [cycle.order[100], cycle.order[101], cycle.order[102], cycle.order[105]]
    expect(perfectDirection(new Set(), 20, 20, fakeSnake(unsafe), [])).toBeNull()
    // 对齐身体通过校验并可决策
    expect(isBodyAligned(cycle, body)).toBe(true)
    expect(perfectDirection(new Set(), 20, 20, fakeSnake(body), [{ ...cycle.order[150] }])).not.toBeNull()
  })

  it('对齐出生点不与已占用格冲突', () => {
    const cycle = getCachedCycle(20, 20)!
    const occupied = new Set([keyOf(cycle.order[50]), keyOf(cycle.order[51]), keyOf(cycle.order[52])])
    const aligned = pickAlignedSpawn(cycle, 4, occupied)
    expect(aligned).not.toBeNull()
    for (const c of aligned!.bodyCells) expect(occupied.has(keyOf(c))).toBe(false)
  })

  it('aiDecide perfect：空场跟随回路，有墙回退安全策略', () => {
    const cfg = config()
    const cycle = getCachedCycle(20, 20)!
    const aligned = pickAlignedSpawn(cycle, 4, new Set())!
    cfg.snakes[0] = { ...cfg.snakes[0], spawn: aligned.spawn, direction: aligned.direction, bodyCells: aligned.bodyCells }
    const state = createInitialState(cfg)
    state.foods = [{ id: 1, position: { ...cycle.order[(cycle.indexOf.get(keyOf(aligned.spawn))! + 10) % 400] }, value: 10, growth: 1, kind: 'normal' }]
    const decision = aiDecide(state, 'p1', 'perfect')
    expect(decision.direction).not.toBeNull()
    expect(decision.stats.message).toContain('哈密顿')

    const walled = createInitialState(config({ walls: [{ x: 0, y: 0 }] }))
    const d2 = aiDecide(walled, 'p1', 'perfect')
    expect(d2.stats.message).toContain('回路不可用')
  })
})
