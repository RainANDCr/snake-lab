import { describe, expect, it } from 'vitest'
import { createInitialState, setDirection, stepGame } from './engine'
import { MatchConfig, keyOf } from './types'

function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: 'classic',
    width: 14,
    height: 14,
    wrap: false,
    walls: [],
    snakes: [{ id: 'p1', name: 'P1', color: '#fff', spawn: { x: 5, y: 7 }, direction: 'right', length: 3, controller: 'human' }],
    foodCount: 1,
    foodValue: 10,
    foodGrowth: 1,
    tickMs: 100,
    goal: { type: 'none' },
    ...overrides,
  }
}

function play(state: ReturnType<typeof createInitialState>): ReturnType<typeof stepGame>['next'] {
  state.status = 'playing'
  return stepGame(state).next
}

function placeFood(state: ReturnType<typeof createInitialState>, kind: 'golden' | 'haste' | 'shrink' | 'ghost', x: number, y: number): void {
  const values = { golden: { v: 30, g: 2 }, haste: { v: 15, g: 1 }, shrink: { v: 20, g: 0 }, ghost: { v: 15, g: 1 } }
  state.foods = [{ id: 99, position: { x, y }, value: values[kind].v, growth: values[kind].g, kind }]
}

describe('特殊食物系统', () => {
  it('foodRules：生成的食物按概率落在五种类型中', () => {
    const state = createInitialState(config({ foodRules: { goldenChance: 0.3, powerChance: 0.3 }, foodCount: 8 }))
    const kinds = new Set(state.foods.map((f) => f.kind))
    expect(state.foods).toHaveLength(8)
    expect(kinds.size).toBeGreaterThanOrEqual(2) // 8 个食物应出现多种类型
    for (const f of state.foods) {
      expect(['normal', 'golden', 'haste', 'shrink', 'ghost']).toContain(f.kind)
      if (f.kind === 'golden') expect(f.value).toBe(30)
      if (f.kind === 'shrink') expect(f.growth).toBe(0)
    }
  })

  it('无 foodRules 时只生成普通食物', () => {
    const state = createInitialState(config({ foodCount: 6 }))
    expect(state.foods.every((f) => f.kind === 'normal')).toBe(true)
  })

  it('黄金果：30 分 + 长 2 格（分两个 tick 完成）', () => {
    const state = createInitialState(config())
    placeFood(state, 'golden', 8, 7)
    let next = play(state)
    next = play(next)
    next = play(next)
    expect(next.snakes[0].score).toBe(30)
    expect(next.snakes[0].body.length).toBe(4) // 吃下当 tick 先长 1
    next = play(next)
    expect(next.snakes[0].body.length).toBe(5) // 第二段增长
  })

  it('加速果：1.4 倍速持续约 45 tick', () => {
    const state = createInitialState(config())
    placeFood(state, 'haste', 6, 7)
    const next = play(state)
    expect(next.snakes[0].speedMult).toBe(1.4)
    expect(next.snakes[0].speedTicks).toBe(44) // 45 设置后当 tick 衰减一次
  })

  it('缩短果：立即剪掉 3 节且不再生长', () => {
    const state = createInitialState(config())
    state.snakes[0].body = [
      { x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 },
      { x: 2, y: 8 }, { x: 3, y: 8 }, { x: 4, y: 8 }, { x: 5, y: 8 },
    ]
    placeFood(state, 'shrink', 6, 7)
    const next = play(state)
    // 吃到后：头进 1 节 + 正常尾移，再剪 3 节 → 8 + 1 - 1 - 3 = 5
    expect(next.snakes[0].body.length).toBe(5)
    expect(next.snakes[0].score).toBe(20)
    // 不应继续变长
    const after = stepGame(next).next
    expect(after.snakes[0].body.length).toBe(5)
  })

  it('缩短果不会把蛇剪到 3 节以下', () => {
    const state = createInitialState(config())
    placeFood(state, 'shrink', 6, 7)
    const next = play(state)
    expect(next.snakes[0].body.length).toBe(3)
    expect(next.snakes[0].alive).toBe(true)
  })

  it('幽灵形态：可以穿过自己的身体（墙壁仍致命）', () => {
    const state = createInitialState(config())
    // 头 (6,7) 向上，排队右转：新头 (7,7) 是身体中段（非尾格）
    state.snakes[0].body = [
      { x: 6, y: 7 }, { x: 6, y: 8 }, { x: 6, y: 9 }, { x: 7, y: 9 },
      { x: 7, y: 8 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 6 },
    ]
    state.snakes[0].direction = 'up'
    state.snakes[0].queue = ['right']
    state.snakes[0].ghostTicks = 10
    const next = play(state)
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].body[0]).toEqual({ x: 7, y: 7 })
    expect(next.snakes[0].ghostTicks).toBe(9)
  })

  it('幽灵形态过期后恢复正常碰撞', () => {
    const state = createInitialState(config())
    // 环形身体：幽灵穿过 (7,7) 后，下一格 (8,7) 是身体中段（非尾格）
    state.snakes[0].body = [
      { x: 6, y: 7 }, { x: 6, y: 8 }, { x: 6, y: 9 }, { x: 7, y: 9 },
      { x: 7, y: 8 }, { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 6 },
      { x: 9, y: 6 }, { x: 9, y: 7 },
    ]
    state.snakes[0].direction = 'up'
    state.snakes[0].queue = ['right']
    state.snakes[0].ghostTicks = 1
    const next = play(state) // 移动时仍为幽灵 → 穿过身体存活，随后衰减为 0
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].ghostTicks).toBe(0)
    const final = stepGame(next).next
    expect(final.snakes[0].alive).toBe(false) // 幽灵已过期，撞自己身体
  })

  it('幽灵不能穿墙', () => {
    const state = createInitialState(config())
    state.snakes[0].body = [{ x: 13, y: 7 }, { x: 12, y: 7 }, { x: 11, y: 7 }]
    state.snakes[0].ghostTicks = 10
    const next = play(state)
    expect(next.snakes[0].alive).toBe(false)
  })

  it('全局得分倍率与道具倍率叠乘', () => {
    const state = createInitialState(config({ scoreMultiplier: 2 }))
    state.foods = [{ id: 1, position: { x: 6, y: 7 }, value: 10, growth: 1, kind: 'normal' }]
    state.snakes[0].scoreMult = 2
    const next = play(state)
    expect(next.snakes[0].score).toBe(40) // 10 × 2(道具) × 2(全局)
  })

  it('种子化：相同 seed 的两局食物序列完全一致，不同 seed 不同', () => {
    const build = (seed: number): string => {
      const state = createInitialState(config({ seed, foodRules: { goldenChance: 0.2, powerChance: 0.2 }, width: 20, height: 20 }))
      state.status = 'playing'
      let cur = state
      for (let i = 0; i < 30; i++) cur = stepGame(cur).next
      return JSON.stringify({ foods: cur.foods, seed: cur.rngSeed })
    }
    expect(build(12345)).toBe(build(12345))
    expect(build(12345)).not.toBe(build(999))
  })
})

describe('食物生成位置合法性（含幽灵蛇）', () => {
  it('食物不生成在蛇身/食物/道具上', () => {
    const state = createInitialState(config({ foodCount: 4, foodRules: { goldenChance: 0.1, powerChance: 0.1 } }))
    const seen = new Set<string>()
    for (const f of state.foods) {
      expect(seen.has(keyOf(f.position))).toBe(false)
      seen.add(keyOf(f.position))
      for (const c of state.snakes[0].body) expect(keyOf(f.position)).not.toBe(keyOf(c))
    }
  })
})

describe('幽灵与对战的蛇头相遇', () => {
  it('幽灵蛇与非幽灵蛇同格：幽灵穿过，非幽灵判负', () => {
    const state = createInitialState(config({
      mode: 'versus',
      foodCount: 0,
      snakes: [
        { id: 'p1', name: 'A', color: '#0ff', spawn: { x: 5, y: 7 }, direction: 'right', length: 2, controller: 'human' },
        { id: 'p2', name: 'B', color: '#f80', spawn: { x: 7, y: 7 }, direction: 'left', length: 2, controller: 'human' },
      ],
    }))
    state.snakes[0].ghostTicks = 10
    state.status = 'playing'
    const next = stepGame(state).next
    // p1 幽灵穿过；p2 撞进 p1 的身体格 → 判负
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[1].alive).toBe(false)
    expect(next.status).toBe('won')
    expect(next.result?.winnerIds).toEqual(['p1'])
  })
})

describe('AI 锦标赛结算', () => {
  it('三方混战：剩一蛇时正确判胜，两蛇同 tick 死亡后幸存者获胜', () => {
    const cfg = config({
      mode: 'tournament',
      foodCount: 0,
      snakes: [
        { id: 'p1', name: 'BFS', color: '#1', spawn: { x: 4, y: 4 }, direction: 'right', length: 2, controller: 'bfs' },
        { id: 'p2', name: 'ASTAR', color: '#2', spawn: { x: 10, y: 4 }, direction: 'left', length: 2, controller: 'astar' },
        { id: 'p3', name: 'SAFE', color: '#3', spawn: { x: 7, y: 10 }, direction: 'up', length: 2, controller: 'safe' },
      ],
    })
    const state = createInitialState(cfg)
    // 让 p1/p2 迎头相撞（同格）
    state.snakes[0].body = [{ x: 6, y: 4 }, { x: 5, y: 4 }]
    state.snakes[1].body = [{ x: 8, y: 4 }, { x: 9, y: 4 }]
    state.status = 'playing'
    const next = stepGame(state).next
    expect(next.snakes[0].alive).toBe(false)
    expect(next.snakes[1].alive).toBe(false)
    expect(next.snakes[2].alive).toBe(true)
    expect(next.status).toBe('won')
    expect(next.result?.winnerIds).toEqual(['p3'])
  })
})
