import { describe, expect, it } from 'vitest'
import { aiDecide, compareAlgorithms } from './controller'
import { createInitialState, setDirection, stepGame } from '../core/engine'
import { MatchConfig } from '../core/types'

function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: 'classic',
    width: 16,
    height: 16,
    wrap: false,
    walls: [],
    snakes: [{ id: 'p1', name: 'AI', color: '#fff', spawn: { x: 5, y: 8 }, direction: 'right', length: 4, controller: 'bfs' }],
    foodCount: 1,
    foodValue: 10,
    foodGrowth: 1,
    tickMs: 100,
    goal: { type: 'none' },
    ...overrides,
  }
}

describe('AI 决策', () => {
  it('BFS / A* / 安全策略都朝食物方向移动', () => {
    for (const algo of ['bfs', 'astar', 'safe'] as const) {
      const state = createInitialState(config({ snakes: [{ id: 'p1', name: 'AI', color: '#fff', spawn: { x: 5, y: 8 }, direction: 'right', length: 4, controller: algo }] }))
      state.foods = [{ id: 1, position: { x: 8, y: 8 }, value: 10, growth: 1, kind: 'normal' }]
      const decision = aiDecide(state, 'p1', algo)
      expect(decision.direction).toBe('right')
      expect(decision.stats.found).toBe(true)
    }
  })

  it('决策永远不会 180° 反向或立即撞墙', () => {
    const state = createInitialState(config({ walls: [{ x: 6, y: 7 }, { x: 6, y: 8 }, { x: 6, y: 9 }], snakes: [{ id: 'p1', name: 'AI', color: '#fff', spawn: { x: 5, y: 8 }, direction: 'right', length: 3, controller: 'bfs' }] }))
    state.foods = [{ id: 1, position: { x: 2, y: 8 }, value: 10, growth: 1, kind: 'normal' }]
    const decision = aiDecide(state, 'p1', 'bfs')
    expect(decision.direction).not.toBe('left') // 反向
    // 任何返回方向都必须可执行（不撞墙）
    if (decision.direction) {
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[decision.direction]
      const nx = state.snakes[0].body[0].x + v[0]
      const ny = state.snakes[0].body[0].y + v[1]
      expect(state.wallSet.has(`${nx},${ny}`)).toBe(false)
    }
  })

  it('无路可走时返回可解释的失败状态', () => {
    // 食物被完全围死
    const walls: { x: number; y: number }[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        walls.push({ x: 10 + dx, y: 8 + dy })
      }
    }
    const state = createInitialState(config({ walls }))
    state.foods = [{ id: 1, position: { x: 10, y: 8 }, value: 10, growth: 1, kind: 'normal' }]
    const decision = aiDecide(state, 'p1', 'bfs')
    expect(decision.stats.found).toBe(false)
    expect(decision.stats.message).toContain('不可达')
  })

  it('目标改变后按 tick 重规划', () => {
    const state = createInitialState(config())
    state.foods = [{ id: 1, position: { x: 8, y: 8 }, value: 10, growth: 1, kind: 'normal' }]
    expect(aiDecide(state, 'p1', 'bfs').direction).toBe('right')
    state.foods = [{ id: 2, position: { x: 5, y: 5 }, value: 10, growth: 1, kind: 'normal' }]
    expect(aiDecide(state, 'p1', 'bfs').direction).toBe('up')
  })

  it('安全策略在受限空间中仍给出可执行的保命方向', () => {
    // 长蛇在狭窄通道里：食物在通道缺口另一侧
    const walls: { x: number; y: number }[] = []
    for (let y = 0; y < 16; y++) {
      if (y < 2 || y > 5) walls.push({ x: 8, y })
    }
    const body = [
      { x: 4, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 },
    ]
    const state = createInitialState(config({ walls }))
    state.snakes[0].body = body
    state.snakes[0].direction = 'right'
    state.foods = [{ id: 1, position: { x: 10, y: 3 }, value: 10, growth: 1, kind: 'normal' }]
    const decision = aiDecide(state, 'p1', 'safe')
    expect(decision.direction).not.toBeNull()
    expect(decision.direction).not.toBe('left') // 不允许 180° 反向
    expect(['food', 'tail', 'space', 'none']).toContain(decision.stats.strategy)
  })

  it('安全策略驱动的蛇在空场上 80 个 tick 内不会死亡', () => {
    let state = createInitialState(config({ width: 20, height: 20, snakes: [{ id: 'p1', name: 'AI', color: '#fff', spawn: { x: 5, y: 10 }, direction: 'right', length: 4, controller: 'safe' }] }))
    state.status = 'playing'
    for (let i = 0; i < 80 && state.status === 'playing'; i++) {
      const decision = aiDecide(state, 'p1', 'safe')
      if (decision.direction) setDirection(state, 'p1', decision.direction)
      state = stepGame(state).next
    }
    expect(state.snakes[0].alive).toBe(true)
    expect(state.snakes[0].foodEaten).toBeGreaterThan(3)
  })

  it('对战中的 AI 视玩家蛇身为威胁（不规划进玩家身体）', () => {
    const state = createInitialState(config({
      mode: 'versus-ai',
      snakes: [
        { id: 'p1', name: '玩家', color: '#0ff', spawn: { x: 7, y: 8 }, direction: 'right', length: 4, controller: 'human' },
        { id: 'p2', name: 'AI', color: '#f80', spawn: { x: 12, y: 8 }, direction: 'left', length: 3, controller: 'safe' },
      ],
    }))
    const decision = aiDecide(state, 'p2', 'safe')
    expect(decision.direction).not.toBeNull()
    // AI 的建议方向不能立即撞进玩家身体
    if (decision.direction) {
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[decision.direction]
      const nx = state.snakes[1].body[0].x + v[0]
      const ny = state.snakes[1].body[0].y + v[1]
      const inPlayerBody = state.snakes[0].body.some((c, i) => c.x === nx && c.y === ny && i < state.snakes[0].body.length - 1)
      expect(inPlayerBody).toBe(false)
    }
  })

  it('BFS vs A* 对比返回两行统计', () => {
    const state = createInitialState(config())
    const { rows, food } = compareAlgorithms(state, 'p1')
    expect(food).not.toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows[0].algorithm).toBe('bfs')
    expect(rows[1].algorithm).toBe('astar')
    expect(rows[0].found).toBe(true)
    expect(rows[1].found).toBe(true)
    expect(rows[0].pathLength).toBe(rows[1].pathLength)
    expect(rows[0].ms).toBeGreaterThanOrEqual(0)
  })
})
