/**
 * Snake Lab 统一规则引擎。
 * 纯函数式 stepGame：一次 tick 完成「采集输入 → 移动意图 → 食物/增长 → 同步碰撞 → 应用状态 → 事件」。
 * 所有模式（经典/无尽/极速/对战/关卡/自定义）共用同一引擎，仅配置不同。
 */
import {
  CellKey,
  DIR_VECTORS,
  DeathCause,
  Direction,
  FoodItem,
  GameEvent,
  GameState,
  MatchConfig,
  OPPOSITE,
  Position,
  PowerupItem,
  PowerupKind,
  SnakeState,
  keyOf,
} from './types'

/** LCG 确定性随机数：状态内嵌，可序列化、可复现 */
function nextRandom(state: GameState): number {
  state.rngSeed = (Math.imul(state.rngSeed, 1664525) + 1013904223) >>> 0
  return state.rngSeed / 4294967296
}

export function createSnakeBody(spawn: Position, direction: Direction, length: number): Position[] {
  const back = DIR_VECTORS[OPPOSITE[direction]]
  const body: Position[] = []
  for (let i = 0; i < length; i++) {
    body.push({ x: spawn.x + back.x * i, y: spawn.y + back.y * i })
  }
  return body
}

export function createInitialState(config: MatchConfig): GameState {
  const snakes: SnakeState[] = config.snakes.map((init) => {
    const body = createSnakeBody(init.spawn, init.direction, init.length)
    if (config.wrap) {
      // 穿墙模式：出生身体向后延伸可能越过边界，回绕到场内坐标
      for (const p of body) {
        p.x = ((p.x % config.width) + config.width) % config.width
        p.y = ((p.y % config.height) + config.height) % config.height
      }
    }
    return {
      id: init.id,
      name: init.name,
      color: init.color,
      headColor: init.headColor ?? init.color,
      body,
      direction: init.direction,
      queue: [],
      pendingGrowth: 0,
      alive: true,
      score: 0,
      foodEaten: 0,
      controller: init.controller,
      shield: 0,
      speedMult: 1,
      speedTicks: 0,
      scoreMult: 1,
      scoreTicks: 0,
      accumulator: 1,
    }
  })
  const state: GameState = {
    config,
    wallSet: new Set(config.walls.map(keyOf)),
    status: 'ready',
    tick: 0,
    elapsedMs: 0,
    snakes,
    foods: [],
    powerups: [],
    nextItemId: 1,
    rngSeed: 0x2f6e2b1,
    effectiveTickMs: config.tickMs,
    result: null,
  }
  for (let i = 0; i < config.foodCount; i++) spawnFood(state)
  return state
}

export function resetGame(prev: GameState): GameState {
  return createInitialState(prev.config)
}

/** 玩家输入：校验 180° 反向，队列容量 2，每 tick 至多消费一次 */
export function setDirection(state: GameState, snakeId: string, dir: Direction): boolean {
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (!snake || !snake.alive) return false
  const last = snake.queue.length > 0 ? snake.queue[snake.queue.length - 1] : snake.direction
  if (dir === last || dir === OPPOSITE[last]) return false
  if (snake.queue.length >= 2) return false
  snake.queue.push(dir)
  return true
}

export function clearInputQueue(state: GameState, snakeId: string): void {
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (snake) snake.queue = []
}

/** 深拷贝状态（棋盘很小，代价可忽略），保证 stepGame 纯函数语义 */
function cloneState(s: GameState): GameState {
  return {
    config: s.config,
    wallSet: s.wallSet,
    status: s.status,
    tick: s.tick,
    elapsedMs: s.elapsedMs,
    snakes: s.snakes.map((sn) => ({
      ...sn,
      body: sn.body.map((p) => ({ ...p })),
      queue: [...sn.queue],
    })),
    foods: s.foods.map((f) => ({ ...f, position: { ...f.position } })),
    powerups: s.powerups.map((p) => ({ ...p, position: { ...p.position } })),
    nextItemId: s.nextItemId,
    rngSeed: s.rngSeed,
    effectiveTickMs: s.effectiveTickMs,
    result: s.result ? { ...s.result } : null,
  }
}

/** 所有不可通行格：墙壁 + 全部蛇身（含尸体）+ 食物 + 道具 */
function occupiedCells(state: GameState): Set<CellKey> {
  const occ = new Set<CellKey>(state.wallSet)
  for (const s of state.snakes) for (const c of s.body) occ.add(keyOf(c))
  for (const f of state.foods) occ.add(keyOf(f.position))
  for (const p of state.powerups) occ.add(keyOf(p.position))
  return occ
}

/** 全部空闲格（不含墙/蛇/食物/道具） */
export function freeCells(state: GameState): Position[] {
  const occ = occupiedCells(state)
  const out: Position[] = []
  for (let y = 0; y < state.config.height; y++) {
    for (let x = 0; x < state.config.width; x++) {
      if (!occ.has(`${x},${y}`)) out.push({ x, y })
    }
  }
  return out
}

/**
 * 从所有存活蛇头做泛洪填充，返回「可达的空闲格」。
 * 食物只生成在这些格子上，保证不会出现吃不到的食物。
 */
export function reachableFreeCells(state: GameState): Position[] {
  const occ = occupiedCells(state)
  const heads = state.snakes.filter((s) => s.alive).map((s) => s.body[0])
  if (heads.length === 0) {
    // 无存活蛇（初始布点阶段）：退化为全部空闲格
    return freeCells(state)
  }
  const seen = new Set<CellKey>()
  const queue: Position[] = [...heads]
  for (const h of heads) seen.add(keyOf(h))
  const { width, height, wrap } = state.config
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const d of Object.values(DIR_VECTORS)) {
      let nx = cur.x + d.x
      let ny = cur.y + d.y
      if (wrap) {
        nx = (nx + width) % width
        ny = (ny + height) % height
      } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue
      }
      const k = `${nx},${ny}`
      if (seen.has(k) || occ.has(k)) continue
      seen.add(k)
      queue.push({ x: nx, y: ny })
    }
  }
  // 头本身被占用，从候选中排除
  const out: Position[] = []
  for (const k of seen) {
    if (!occ.has(k)) {
      const [x, y] = k.split(',')
      out.push({ x: Number(x), y: Number(y) })
    }
  }
  return out
}

/** 生成一个食物；无合法位置时返回 false（棋盘已满） */
function spawnFood(state: GameState): boolean {
  const candidates = reachableFreeCells(state)
  if (candidates.length === 0) return false
  const cfg = state.config
  const special = cfg.specialFood && nextRandom(state) < cfg.specialFood.chance
  const idx = Math.floor(nextRandom(state) * candidates.length) % candidates.length
  const pos = candidates[idx]
  const item: FoodItem = special
    ? {
        id: state.nextItemId++,
        position: pos,
        value: cfg.specialFood!.value,
        growth: cfg.specialFood!.growth,
        kind: 'special',
      }
    : { id: state.nextItemId++, position: pos, value: cfg.foodValue, growth: cfg.foodGrowth, kind: 'normal' }
  state.foods.push(item)
  return true
}

function spawnPowerup(state: GameState, kind: PowerupKind): boolean {
  const candidates = reachableFreeCells(state)
  if (candidates.length === 0) return false
  const idx = Math.floor(nextRandom(state) * candidates.length) % candidates.length
  const item: PowerupItem = { id: state.nextItemId++, position: candidates[idx], kind }
  state.powerups.push(item)
  return true
}

const POWERUP_POOL: PowerupKind[] = ['speed', 'slow', 'double', 'shield']

interface MoveIntent {
  snake: SnakeState
  head: Position
  wallHit: boolean
}

/**
 * 碰撞占用集合：
 * - 静止蛇、护盾停留蛇、死亡蛇：全身占用
 * - 将移动且不增长的蛇：尾格将腾出，可进入
 */
function buildOccupancy(
  state: GameState,
  moverIds: Set<string>,
  stayers: Set<string>,
  dead: Set<string>,
  grows: Map<string, boolean>,
): Set<CellKey> {
  const occ = new Set<CellKey>(state.wallSet)
  for (const s of state.snakes) {
    if (!s.alive) {
      for (const c of s.body) occ.add(keyOf(c))
      continue
    }
    const isMover = moverIds.has(s.id)
    const vacateTail = isMover && !stayers.has(s.id) && !dead.has(s.id) && s.pendingGrowth === 0 && !grows.get(s.id)
    const cells = vacateTail ? s.body.slice(0, s.body.length - 1) : s.body
    for (const c of cells) occ.add(keyOf(c))
  }
  return occ
}

function applyPowerup(state: GameState, snake: SnakeState, item: PowerupItem, events: GameEvent[], durationTicks: number): void {
  events.push({ type: 'powerup_collected', snakeId: snake.id, kind: item.kind })
  switch (item.kind) {
    case 'speed':
      snake.speedMult = 1.6
      snake.speedTicks = durationTicks
      break
    case 'slow':
      snake.speedMult = 0.65
      snake.speedTicks = durationTicks
      break
    case 'double':
      snake.scoreMult = 2
      snake.scoreTicks = durationTicks
      break
    case 'shield':
      snake.shield = Math.min(snake.shield + 1, 3)
      break
  }
}

/**
 * 推进一个逻辑 tick。状态只读入、纯输出；确定且可测试。
 * 对战采用同步结算：所有本 tick 移动的蛇同时判定，避免先后顺序天然占优。
 */
export function stepGame(prev: GameState): { next: GameState; events: GameEvent[] } {
  if (prev.status !== 'playing') return { next: prev, events: [] }
  const next = cloneState(prev)
  const events: GameEvent[] = []
  next.tick += 1
  next.elapsedMs += next.effectiveTickMs

  const { width, height, wrap } = next.config

  // 1. 采集输入：队列中至多采纳一次合法转向
  // 2. 确定本 tick 实际移动的蛇（速度倍率用累积器平滑处理）
  const movers: SnakeState[] = []
  for (const s of next.snakes) {
    if (!s.alive) continue
    s.accumulator += s.speedMult
    if (s.accumulator >= 0.999) {
      s.accumulator -= 1
      movers.push(s)
      const d = s.queue.shift()
      if (d) s.direction = d
    }
  }

  // 3. 移动意图
  const intents: MoveIntent[] = movers.map((s) => {
    const v = DIR_VECTORS[s.direction]
    const hx = s.body[0].x
    const hy = s.body[0].y
    let nx = hx + v.x
    let ny = hy + v.y
    const out = nx < 0 || ny < 0 || nx >= width || ny >= height
    if (out && wrap) {
      nx = (nx + width) % width
      ny = (ny + height) % height
    }
    return { snake: s, head: { x: nx, y: ny }, wallHit: out && !wrap }
  })

  const foodAt = new Map<string, FoodItem>()
  for (const f of next.foods) foodAt.set(keyOf(f.position), f)
  const powerupAt = new Map<string, PowerupItem>()
  for (const p of next.powerups) powerupAt.set(keyOf(p.position), p)
  const grows = new Map<string, boolean>()
  for (const it of intents) grows.set(it.snake.id, foodAt.has(keyOf(it.head)))

  // 4. 同步碰撞检测（护盾可消耗并停留原地；多轮收敛处理停留引发的连锁）
  const moverIds = new Set(intents.map((i) => i.snake.id))
  const stayers = new Set<string>()
  const dead = new Set<string>()
  const resolveFatal = (it: MoveIntent, cause: DeathCause): boolean => {
    if (it.snake.shield > 0) {
      it.snake.shield -= 1
      stayers.add(it.snake.id)
      events.push({ type: 'shield_used', snakeId: it.snake.id, cause })
      return true // 停留原地
    }
    dead.add(it.snake.id)
    return false
  }
  for (let round = 0; round < 4; round++) {
    const active = intents.filter((i) => !stayers.has(i.snake.id) && !dead.has(i.snake.id))
    if (active.length === 0) break
    const occ = buildOccupancy(next, moverIds, stayers, dead, grows)
    let changed = false
    // 蛇头同格
    const byCell = new Map<string, MoveIntent[]>()
    for (const it of active) {
      const k = keyOf(it.head)
      const list = byCell.get(k)
      if (list) list.push(it)
      else byCell.set(k, [it])
    }
    for (const [, group] of byCell) {
      if (group.length >= 2) {
        for (const it of group) {
          if (resolveFatal(it, 'head-on')) changed = true
        }
      }
    }
    // 蛇头互换位置
    for (const a of active) {
      if (dead.has(a.snake.id) || stayers.has(a.snake.id)) continue
      for (const b of active) {
        if (a === b || dead.has(b.snake.id) || stayers.has(b.snake.id)) continue
        if (keyOf(a.head) === keyOf(b.snake.body[0]) && keyOf(b.head) === keyOf(a.snake.body[0])) {
          if (resolveFatal(a, 'swap')) changed = true
          if (resolveFatal(b, 'swap')) changed = true
        }
      }
    }
    // 撞墙 / 撞身体
    for (const it of active) {
      if (dead.has(it.snake.id) || stayers.has(it.snake.id)) continue
      const fatal = it.wallHit || next.wallSet.has(keyOf(it.head)) || occ.has(keyOf(it.head))
      if (fatal) {
        const cause: DeathCause = it.wallHit || next.wallSet.has(keyOf(it.head)) ? 'wall' : 'body'
        if (resolveFatal(it, cause)) changed = true
      }
    }
    if (!changed) break
  }
  // 收敛兜底：仍有致命移动的蛇直接判负（护盾机会已给过）
  {
    const occ = buildOccupancy(next, moverIds, stayers, dead, grows)
    const active = intents.filter((i) => !stayers.has(i.snake.id) && !dead.has(i.snake.id))
    for (const it of active) {
      if (it.wallHit || next.wallSet.has(keyOf(it.head)) || occ.has(keyOf(it.head))) dead.add(it.snake.id)
      for (const b of active) {
        if (it === b) continue
        if (keyOf(it.head) === keyOf(b.snake.body[0]) && keyOf(b.head) === keyOf(it.snake.body[0])) dead.add(it.snake.id)
      }
    }
    const byCell = new Map<string, number>()
    for (const it of active) {
      const k = keyOf(it.head)
      byCell.set(k, (byCell.get(k) ?? 0) + 1)
    }
    for (const it of active) {
      if ((byCell.get(keyOf(it.head)) ?? 0) >= 2) dead.add(it.snake.id)
    }
  }
  for (const it of intents) {
    if (dead.has(it.snake.id)) {
      it.snake.alive = false
      it.snake.deathCause = it.wallHit || next.wallSet.has(keyOf(it.head)) ? 'wall' : 'body'
      events.push({ type: 'snake_died', snakeId: it.snake.id, cause: it.snake.deathCause })
    }
  }
  // 蛇头同格死亡原因修正
  {
    const byCell = new Map<string, MoveIntent[]>()
    for (const it of intents) {
      if (!dead.has(it.snake.id)) continue
      const k = keyOf(it.head)
      const list = byCell.get(k)
      if (list) list.push(it)
      else byCell.set(k, [it])
    }
    for (const [, group] of byCell) {
      if (group.length >= 2) {
        for (const it of group) it.snake.deathCause = 'head-on'
      }
    }
  }

  // 5. 应用合法移动、进食、道具
  for (const it of intents) {
    const s = it.snake
    if (!s.alive || stayers.has(s.id)) continue
    s.body.unshift({ ...it.head })
    const f = foodAt.get(keyOf(it.head))
    if (f) {
      next.foods = next.foods.filter((x) => x.id !== f.id)
      const gained = Math.round(f.value * s.scoreMult)
      s.score += gained
      s.foodEaten += 1
      s.pendingGrowth += f.growth
      events.push({ type: 'food_eaten', snakeId: s.id, score: s.score, value: f.value })
      events.push({ type: 'score_changed', snakeId: s.id, score: s.score })
    }
    const p = powerupAt.get(keyOf(it.head))
    if (p && next.config.powerups?.enabled) {
      next.powerups = next.powerups.filter((x) => x.id !== p.id)
      applyPowerup(next, s, p, events, next.config.powerups.durationTicks)
    }
    if (s.pendingGrowth > 0) s.pendingGrowth -= 1
    else s.body.pop()
  }

  // 6. 道具计时衰减
  for (const s of next.snakes) {
    if (!s.alive) continue
    if (s.speedTicks > 0) {
      s.speedTicks -= 1
      if (s.speedTicks === 0) s.speedMult = 1
    }
    if (s.scoreTicks > 0) {
      s.scoreTicks -= 1
      if (s.scoreTicks === 0) s.scoreMult = 1
    }
  }

  // 7. 补充食物
  while (next.foods.length < next.config.foodCount) {
    if (!spawnFood(next)) break
  }

  // 8. 道具生成
  if (next.config.powerups?.enabled && next.powerups.length < 2) {
    if (nextRandom(next) < next.config.powerups.chancePerTick) {
      const kind = POWERUP_POOL[Math.floor(nextRandom(next) * POWERUP_POOL.length) % POWERUP_POOL.length]
      spawnPowerup(next, kind)
      const last = next.powerups[next.powerups.length - 1]
      if (last) events.push({ type: 'powerup_spawned', kind: last.kind })
    }
  }

  // 9. 极速模式：按得分阶梯提速（降低逻辑步长）
  if (next.config.speedRamp && next.snakes.length > 0) {
    const ramp = next.config.speedRamp
    const s0 = next.snakes[0]
    const level = Math.floor(s0.score / ramp.everyScore)
    const target = Math.max(ramp.minTickMs, next.config.tickMs - level * ramp.decreaseMs)
    if (target < next.effectiveTickMs) {
      next.effectiveTickMs = target
      events.push({ type: 'speed_up', value: target })
    }
  }

  // 10. 结算胜负
  settleOutcome(next, events)

  return { next, events }
}

function finish(next: GameState, events: GameEvent[], status: 'won' | 'lost' | 'draw', result: GameResultLike): void {
  next.status = status
  next.result = { winnerIds: result.winnerIds, reason: result.reason }
  events.push({ type: 'game_ended', reason: result.reason, winnerIds: result.winnerIds })
}

interface GameResultLike {
  winnerIds: string[]
  reason: string
}

function settleOutcome(next: GameState, events: GameEvent[]): void {
  const cfg = next.config
  const alive = next.snakes.filter((s) => s.alive)
  const isVersus = cfg.mode === 'versus' || cfg.mode === 'versus-timed' || cfg.mode === 'versus-ai'
  const s0 = next.snakes[0]

  // 棋盘被完全占满且无法生成食物 → 单人胜利 / 对比分数
  const free = freeCells(next)
  if (free.length === 0) {
    if (!isVersus) {
      finish(next, events, 'won', { winnerIds: [s0.id], reason: 'board-full' })
    } else {
      settleByScore(next, events, 'board-full')
    }
    return
  }

  if (isVersus) {
    if (alive.length === 0) {
      finish(next, events, 'draw', { winnerIds: [], reason: 'both-died' })
      return
    }
    if (alive.length === 1 && next.snakes.length > 1) {
      finish(next, events, 'won', { winnerIds: [alive[0].id], reason: 'last-standing' })
      return
    }
  } else {
    if (alive.length === 0) {
      finish(next, events, 'lost', { winnerIds: [], reason: 'died' })
      return
    }
  }

  // 目标达成（单人/关卡）
  if (!isVersus && cfg.goal.type !== 'none') {
    const g = cfg.goal
    if (g.type === 'score' && s0.score >= (g.value ?? 0)) {
      finish(next, events, 'won', { winnerIds: [s0.id], reason: 'goal-score' })
      return
    }
    if (g.type === 'food' && s0.foodEaten >= (g.value ?? 0)) {
      finish(next, events, 'won', { winnerIds: [s0.id], reason: 'goal-food' })
      return
    }
    if (g.type === 'survive' && next.elapsedMs >= (g.value ?? 0) * 1000) {
      finish(next, events, 'won', { winnerIds: [s0.id], reason: 'goal-survive' })
      return
    }
  }

  // 限时结算
  if (cfg.timeLimitMs != null && next.elapsedMs >= cfg.timeLimitMs) {
    if (isVersus) {
      settleByScore(next, events, 'time-up')
    } else {
      finish(next, events, 'lost', { winnerIds: [], reason: 'time-up' })
    }
  }
}

function settleByScore(next: GameState, events: GameEvent[], reason: string): void {
  const sorted = [...next.snakes].sort((a, b) => b.score - a.score)
  if (sorted.length >= 2 && sorted[0].score === sorted[1].score) {
    finish(next, events, 'draw', { winnerIds: [], reason })
  } else {
    finish(next, events, 'won', { winnerIds: [sorted[0].id], reason })
  }
}

/** 暂停/继续/开始等状态迁移由 UI 层调用 */
export function transitionStatus(state: GameState, status: GameState['status']): GameState {
  if (state.status === status) return state
  const next = cloneState(state)
  next.status = status
  return next
}
