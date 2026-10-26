import { describe, expect, it } from 'vitest'
import { createInitialState, resetGame, setDirection, stepGame, transitionStatus, createSnakeBody } from './engine'
import { Direction, MatchConfig, SnakeState, keyOf } from './types'

export function baseConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: 'classic',
    width: 12,
    height: 12,
    wrap: false,
    walls: [],
    snakes: [
      { id: 'p1', name: 'P1', color: '#fff', spawn: { x: 5, y: 6 }, direction: 'right', length: 3, controller: 'human' },
    ],
    foodCount: 1,
    foodValue: 10,
    foodGrowth: 1,
    tickMs: 100,
    goal: { type: 'none' },
    ...overrides,
  }
}

export function play(state: ReturnType<typeof createInitialState>, tickMs = 100): ReturnType<typeof stepGame>['next'] {
  state.status = 'playing'
  return stepGame(state).next
}

/** 把蛇摆到指定身体（头在前），便于构造碰撞场景 */
function placeSnake(state: ReturnType<typeof createInitialState>, snakeId: string, body: { x: number; y: number }[], direction: Direction, pendingGrowth = 0): SnakeState {
  const snake = state.snakes.find((s) => s.id === snakeId)!
  snake.body = body.map((p) => ({ ...p }))
  snake.direction = direction
  snake.queue = []
  snake.pendingGrowth = pendingGrowth
  return snake
}

describe('基础移动', () => {
  it('每个逻辑 tick 前进一格', () => {
    const state = createInitialState(baseConfig())
    const next = play(state)
    expect(next.snakes[0].body[0]).toEqual({ x: 6, y: 6 })
    expect(next.tick).toBe(1)
    expect(next.elapsedMs).toBe(100)
  })

  it('禁止 180° 反向：直接反向被拒绝', () => {
    const state = createInitialState(baseConfig())
    expect(setDirection(state, 'p1', 'left')).toBe(false)
    const next = play(state)
    expect(next.snakes[0].direction).toBe('right')
    expect(next.snakes[0].body[0]).toEqual({ x: 6, y: 6 })
  })

  it('输入队列：每个 tick 至多采纳一次转向，快速多键依次生效', () => {
    const state = createInitialState(baseConfig())
    expect(setDirection(state, 'p1', 'up')).toBe(true)
    expect(setDirection(state, 'p1', 'down')).toBe(false) // 与队尾 up 相反
    expect(setDirection(state, 'p1', 'left')).toBe(true) // up -> left 合法
    let next = play(state)
    expect(next.snakes[0].body[0]).toEqual({ x: 5, y: 5 }) // 先 up
    next = play(next)
    expect(next.snakes[0].body[0]).toEqual({ x: 4, y: 5 }) // 再 left
  })

  it('暂停状态不推进', () => {
    const state = createInitialState(baseConfig())
    state.status = 'paused'
    const { next, events } = stepGame(state)
    expect(next).toBe(state)
    expect(events).toHaveLength(0)
    expect(next.tick).toBe(0)
  })

  it('重置游戏完全回到初始状态', () => {
    let state = createInitialState(baseConfig())
    state.status = 'playing'
    state = stepGame(state).next
    const fresh = resetGame(state)
    expect(fresh.tick).toBe(0)
    expect(fresh.snakes[0].body.length).toBe(3)
    expect(fresh.status).toBe('ready')
  })
})

describe('食物与增长', () => {
  it('食物只生成在空闲可达格上', () => {
    const config = baseConfig({ walls: [{ x: 0, y: 0 }, { x: 1, y: 0 }] })
    const state = createInitialState(config)
    expect(state.foods).toHaveLength(1)
    const foodKey = keyOf(state.foods[0].position)
    expect(['0,0', '1,0']).not.toContain(foodKey)
    for (const cell of state.snakes[0].body) expect(foodKey).not.toBe(keyOf(cell))
  })

  it('吃到食物加 10 分并增长一格', () => {
    const state = createInitialState(baseConfig())
    state.foods = [{ id: 1, position: { x: 8, y: 6 }, value: 10, growth: 1, kind: 'normal' }]
    state.status = 'playing'
    let next = stepGame(state).next
    next = stepGame(next).next
    next = stepGame(next).next
    expect(next.snakes[0].score).toBe(10)
    expect(next.snakes[0].body.length).toBe(4) // 3 + 1 增长
    expect(next.foods).toHaveLength(1) // 补充了新食物
    expect(next.foods[0].position).not.toEqual({ x: 8, y: 6 })
  })

  it('进入本 tick 将腾出的尾部格子不会死亡', () => {
    const state = createInitialState(baseConfig())
    // 环形蛇：头 (5,5)，尾巴 (5,4) 在头顶方向
    placeSnake(state, 'p1', [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ], 'right')
    setDirection(state, 'p1', 'down') // 头进入尾格
    const next = play(state)
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].body.length).toBe(4)
    expect(next.status).toBe('playing')
  })

  it('正在增长时尾格不腾出，进入尾格判死亡', () => {
    const state = createInitialState(baseConfig())
    placeSnake(state, 'p1', [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
    ], 'right', 1) // pendingGrowth = 1
    setDirection(state, 'p1', 'down')
    const next = play(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.status).toBe('lost')
  })
})

describe('碰撞与失败', () => {
  it('撞墙死亡', () => {
    const state = createInitialState(baseConfig({ snakes: [{ id: 'p1', name: 'P1', color: '#fff', spawn: { x: 10, y: 6 }, direction: 'right', length: 3, controller: 'human' }] }))
    let next = play(state)
    expect(next.snakes[0].alive).toBe(true)
    next = stepGame(next).next
    expect(next.snakes[0].alive).toBe(false)
    expect(next.status).toBe('lost')
    expect(next.result?.reason).toBe('died')
  })

  it('撞障碍物死亡', () => {
    const state = createInitialState(baseConfig({ walls: [{ x: 6, y: 6 }] }))
    placeSnake(state, 'p1', [
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 3, y: 6 },
    ], 'right')
    const next = play(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.snakes[0].deathCause).toBe('wall')
  })

  it('撞自己身体死亡', () => {
    const state = createInitialState(baseConfig())
    // 长蛇绕圈，头前方是自己身体中段
    placeSnake(state, 'p1', [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ], 'right')
    // 头向下 → (5,6) 是身体（且不是尾格 (6,5)）
    setDirection(state, 'p1', 'down')
    const next = play(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.status).toBe('lost')
  })

  it('无尽模式穿墙：从对侧出现', () => {
    const state = createInitialState(baseConfig({ wrap: true, snakes: [{ id: 'p1', name: 'P1', color: '#fff', spawn: { x: 10, y: 6 }, direction: 'right', length: 3, controller: 'human' }] }))
    state.snakes[0].body = [
      { x: 10, y: 6 },
      { x: 9, y: 6 },
      { x: 8, y: 6 },
    ]
    let next = play(state)
    expect(next.snakes[0].body[0]).toEqual({ x: 11, y: 6 })
    next = stepGame(next).next
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].body[0]).toEqual({ x: 0, y: 6 })
  })
})

describe('极速模式', () => {
  it('达到分数阈值后逻辑步长缩短且不低于下限', () => {
    const state = createInitialState(
      baseConfig({
        mode: 'speed',
        tickMs: 100,
        speedRamp: { everyScore: 50, decreaseMs: 10, minTickMs: 70 },
      }),
    )
    state.status = 'playing'
    state.snakes[0].score = 120 // level 2 → 100 - 20 = 80
    const { next, events } = stepGame(state)
    expect(next.effectiveTickMs).toBe(80)
    expect(events.some((e) => e.type === 'speed_up')).toBe(true)
    // 下限：在克隆后的新状态上继续提分
    next.snakes[0].score = 10000
    const final = stepGame(next).next
    expect(final.effectiveTickMs).toBe(70)
  })
})

describe('棋盘占满胜利', () => {
  it('棋盘被完全占满且无法生成食物时判胜', () => {
    const state = createInitialState(baseConfig({
      width: 4,
      height: 4,
      foodCount: 0,
      snakes: [{ id: 'p1', name: 'P1', color: '#fff', spawn: { x: 1, y: 0 }, direction: 'left', length: 3, controller: 'human' }],
    }))
    // 15 节蛇占满除 (0,0) 外的所有格
    state.snakes[0].body = [
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
      { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
      { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 },
    ]
    state.foods = [{ id: 1, position: { x: 0, y: 0 }, value: 10, growth: 1, kind: 'normal' }]
    state.status = 'playing'
    const next = stepGame(state).next
    expect(next.status).toBe('won')
    expect(next.result?.reason).toBe('board-full')
    expect(next.snakes[0].body).toHaveLength(16)
  })
})

describe('双人对战同步结算', () => {
  function versusConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
    return baseConfig({
      mode: 'versus',
      foodCount: 0,
      snakes: [
        { id: 'p1', name: 'P1', color: '#0ff', spawn: { x: 4, y: 6 }, direction: 'right', length: 2, controller: 'human' },
        { id: 'p2', name: 'P2', color: '#f80', spawn: { x: 7, y: 6 }, direction: 'left', length: 2, controller: 'human' },
      ],
      ...overrides,
    })
  }

  it('两蛇头进入同一格：同时判负 → 平局', () => {
    const state = createInitialState(versusConfig())
    state.snakes[0].body = [{ x: 5, y: 6 }, { x: 4, y: 6 }]
    state.snakes[1].body = [{ x: 7, y: 6 }, { x: 8, y: 6 }]
    const next = play(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.snakes[1].alive).toBe(false)
    expect(next.status).toBe('draw')
    expect(next.result?.reason).toBe('both-died')
  })

  it('两蛇头互换位置：同时判负', () => {
    const state = createInitialState(versusConfig())
    state.snakes[0].body = [{ x: 5, y: 6 }]
    state.snakes[1].body = [{ x: 6, y: 6 }]
    const next = play(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.snakes[1].alive).toBe(false)
    expect(next.status).toBe('draw')
  })

  it('一方死亡另一方存活 → 存活者获胜', () => {
    const state = createInitialState(versusConfig({ snakes: [
      { id: 'p1', name: 'P1', color: '#0ff', spawn: { x: 4, y: 6 }, direction: 'right', length: 2, controller: 'human' },
      { id: 'p2', name: 'P2', color: '#f80', spawn: { x: 10, y: 6 }, direction: 'right', length: 2, controller: 'human' },
    ] }))
    // p2 朝右墙走，两 tick 后撞墙
    const next = play(state)
    expect(next.status).toBe('playing')
    const final = stepGame(next).next
    expect(final.snakes[1].alive).toBe(false)
    expect(final.snakes[0].alive).toBe(true)
    expect(final.status).toBe('won')
    expect(final.result?.winnerIds).toEqual(['p1'])
    expect(final.result?.reason).toBe('last-standing')
  })

  it('限时积分赛：时间到按得分判定', () => {
    const state = createInitialState(versusConfig({ mode: 'versus-timed', tickMs: 100, timeLimitMs: 500, snakes: [
      { id: 'p1', name: 'P1', color: '#0ff', spawn: { x: 2, y: 2 }, direction: 'right', length: 2, controller: 'human' },
      { id: 'p2', name: 'P2', color: '#f80', spawn: { x: 9, y: 9 }, direction: 'left', length: 2, controller: 'human' },
    ] }))
    state.status = 'playing'
    state.snakes[0].score = 50
    state.snakes[1].score = 30
    let next = state
    for (let i = 0; i < 6 && next.status === 'playing'; i++) next = stepGame(next).next
    expect(next.status).toBe('won')
    expect(next.result?.winnerIds).toEqual(['p1'])
    expect(next.result?.reason).toBe('time-up')
  })

  it('限时积分赛：同分为平局', () => {
    const state = createInitialState(versusConfig({ mode: 'versus-timed', tickMs: 100, timeLimitMs: 300, snakes: [
      { id: 'p1', name: 'P1', color: '#0ff', spawn: { x: 2, y: 2 }, direction: 'right', length: 2, controller: 'human' },
      { id: 'p2', name: 'P2', color: '#f80', spawn: { x: 9, y: 9 }, direction: 'left', length: 2, controller: 'human' },
    ] }))
    state.status = 'playing'
    state.snakes[0].score = 40
    state.snakes[1].score = 40
    let next = state
    for (let i = 0; i < 5 && next.status === 'playing'; i++) next = stepGame(next).next
    expect(next.status).toBe('draw')
    expect(next.result?.reason).toBe('time-up')
  })
})

describe('道具与护盾', () => {
  it('护盾抵挡致命碰撞：停留在上一个合法位置并消耗护盾', () => {
    const state = createInitialState(baseConfig({
      powerups: { enabled: true, chancePerTick: 0, durationTicks: 40 },
      snakes: [{ id: 'p1', name: 'P1', color: '#fff', spawn: { x: 10, y: 6 }, direction: 'right', length: 3, controller: 'human' }],
    }))
    state.snakes[0].shield = 1
    state.snakes[0].body = [{ x: 11, y: 6 }, { x: 10, y: 6 }, { x: 9, y: 6 }]
    state.status = 'playing'
    const { next, events } = stepGame(state)
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].shield).toBe(0)
    expect(next.snakes[0].body[0]).toEqual({ x: 11, y: 6 }) // 未穿入墙壁
    expect(events.some((e) => e.type === 'shield_used')).toBe(true)
    expect(next.status).toBe('playing')
  })

  it('速度减半道具：蛇按累积器隔 tick 移动', () => {
    const state = createInitialState(baseConfig())
    state.snakes[0].speedMult = 0.5
    state.snakes[0].speedTicks = 10
    state.status = 'playing'
    let next = stepGame(state).next
    expect(next.snakes[0].body[0]).toEqual({ x: 6, y: 6 }) // tick1 移动（累积 1.5）
    next = stepGame(next).next
    expect(next.snakes[0].body[0]).toEqual({ x: 7, y: 6 }) // tick2 移动（累积 1.0）
    next = stepGame(next).next
    expect(next.snakes[0].body[0]).toEqual({ x: 7, y: 6 }) // tick3 不动（累积 0.5）
  })

  it('双倍积分道具生效并在到期后恢复', () => {
    const state = createInitialState(baseConfig())
    state.foods = [{ id: 1, position: { x: 7, y: 6 }, value: 10, growth: 1, kind: 'normal' }]
    state.snakes[0].scoreMult = 2
    state.snakes[0].scoreTicks = 3
    state.status = 'playing'
    let next = stepGame(state).next // tick1: 走到 (6,6)，倒计时 3→2
    next = stepGame(next).next // tick2: 吃到食物 10×2=20，倒计时 2→1
    next = stepGame(next).next // tick3: 倒计时 1→0，倍率恢复
    expect(next.snakes[0].score).toBe(20)
    expect(next.snakes[0].scoreMult).toBe(1)
  })
})

describe('确定性与目标', () => {
  it('相同种子下 20 个 tick 的状态完全一致', () => {
    const run = (): string => {
      const state = createInitialState(baseConfig({ width: 16, height: 16 }))
      state.status = 'playing'
      let cur = state
      for (let i = 0; i < 20; i++) cur = stepGame(cur).next
      return JSON.stringify({ s: cur.snakes, f: cur.foods, seed: cur.rngSeed, t: cur.tick })
    }
    expect(run()).toBe(run())
  })

  it('score 目标达成判胜', () => {
    const state = createInitialState(baseConfig({ goal: { type: 'score', value: 100 } }))
    state.snakes[0].score = 100
    const next = play(state)
    expect(next.status).toBe('won')
    expect(next.result?.reason).toBe('goal-score')
  })

  it('survive 目标到期判胜', () => {
    // 高个子场地，让盲走直线蛇在目标到期前不会撞墙
    const state = createInitialState(baseConfig({
      height: 30,
      snakes: [{ id: 'p1', name: 'P1', color: '#fff', spawn: { x: 5, y: 6 }, direction: 'down', length: 3, controller: 'human' }],
      goal: { type: 'survive', value: 2 },
    }))
    state.status = 'playing'
    let next = state
    for (let i = 0; i < 25 && next.status === 'playing'; i++) next = stepGame(next).next
    expect(next.status).toBe('won')
    expect(next.result?.reason).toBe('goal-survive')
  })

  it('限时未达标判负', () => {
    const state = createInitialState(baseConfig({ goal: { type: 'score', value: 1000 }, timeLimitMs: 300 }))
    state.status = 'playing'
    let next = state
    for (let i = 0; i < 5 && next.status === 'playing'; i++) next = stepGame(next).next
    expect(next.status).toBe('lost')
    expect(next.result?.reason).toBe('time-up')
  })

  it('createSnakeBody 生成头在前的连续身体', () => {
    const body = createSnakeBody({ x: 5, y: 5 }, 'right', 3)
    expect(body).toEqual([{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }])
  })

  it('状态迁移是纯函数', () => {
    const state = createInitialState(baseConfig())
    const paused = transitionStatus(state, 'paused')
    expect(paused.status).toBe('paused')
    expect(state.status).toBe('ready')
    expect(paused).not.toBe(state)
  })
})
