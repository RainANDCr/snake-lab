/**
 * 完美 AI：哈密顿回路。
 * 在无内部障碍的棋盘上构造覆盖全部格子的单一回路；蛇身沿回路排布时严格跟随回路永不死亡，
 * 并在远离尾巴时允许安全捷径加速觅食。数学保证：只要蛇长 < 棋盘格数就不会失败。
 * 有墙 / 棋盘宽高均为奇数 / 蛇身未对齐回路时返回 null，调用方回退安全策略。
 */
import { DIR_VECTORS, Direction, Position, SnakeState, keyOf } from '../core/types'
import { deltaToDirection } from './pathfinding'

export interface HamiltonCycle {
  order: Position[]
  indexOf: Map<string, number>
  width: number
  height: number
}

/** 构造哈密顿回路：要求宽度或高度至少一个为偶数，否则回路不存在 */
export function buildHamiltonCycle(width: number, height: number): HamiltonCycle | null {
  if (width >= 2 && width % 2 === 0) return columnCycle(width, height)
  if (height >= 2 && height % 2 === 0) {
    const transposed = columnCycle(height, width)
    if (!transposed) return null
    const indexOf = new Map<string, number>()
    const order = transposed.order.map((p) => ({ x: p.y, y: p.x }))
    order.forEach((p, i) => indexOf.set(keyOf(p), i))
    return { width, height, order, indexOf }
  }
  return null
}

/** 宽度为偶数：第 0 列作回归通道，其余列蛇形上下穿行，最后沿第 0 行回到起点 */
function columnCycle(w: number, h: number): HamiltonCycle {
  const order: Position[] = []
  for (let y = 0; y < h; y++) order.push({ x: 0, y })
  for (let c = 1; c < w; c++) {
    if (c % 2 === 1) {
      for (let y = h - 1; y >= 1; y--) order.push({ x: c, y })
    } else {
      for (let y = 1; y < h; y++) order.push({ x: c, y })
    }
  }
  order.push({ x: w - 1, y: 0 })
  for (let x = w - 2; x >= 1; x--) order.push({ x, y: 0 })
  const indexOf = new Map<string, number>()
  order.forEach((p, i) => indexOf.set(keyOf(p), i))
  return { order, indexOf, width: w, height: h }
}

const cycleCache = new Map<string, HamiltonCycle | null>()

export function getCachedCycle(width: number, height: number): HamiltonCycle | null {
  const key = `${width}x${height}`
  if (!cycleCache.has(key)) cycleCache.set(key, buildHamiltonCycle(width, height))
  return cycleCache.get(key) ?? null
}

function cycleDistance(from: number, to: number, n: number): number {
  return (((to - from) % n) + n) % n
}

/** 校验蛇身是否沿回路连续排布（完美 AI 的安全前提） */
export function isBodyAligned(cycle: HamiltonCycle, body: Position[]): boolean {
  const n = cycle.order.length
  const headIdx = cycle.indexOf.get(keyOf(body[0]))
  if (headIdx == null) return false
  for (let i = 1; i < body.length; i++) {
    const idx = cycle.indexOf.get(keyOf(body[i]))
    if (idx == null) return false
    if (idx !== ((((headIdx - i) % n) + n) % n)) return false
  }
  return true
}

/**
 * 完美 AI 决策。返回 null 表示回路策略当前不可用（有墙/尺寸不合/安全条件不满足），调用方回退安全策略。
 *
 * 安全判据（通用形式）：头部沿回路前进，身体第 k 格将在 len-k tick 后被尾部腾出；
 * 只要头部沿回路再次到达该格所需时间 > 腾出时间，就不会自撞。
 * 该条件对「捷径后身体不再严格沿回路排布」的情形依然成立——捷径只会把路径索引向前跳跃，
 * 证明：路径索引严格单调递增 mod n，任何路径格第二次被访问都在整整一圈之后（n > 蛇长）。
 */
export function perfectDirection(
  walls: Set<string>,
  width: number,
  height: number,
  snake: SnakeState,
  foods: Position[],
): Direction | null {
  if (walls.size > 0) return null
  const cycle = getCachedCycle(width, height)
  if (!cycle) return null
  const head = snake.body[0]
  const hi = cycle.indexOf.get(keyOf(head))
  if (hi == null) return null
  const n = cycle.order.length
  const len = snake.body.length
  if (len >= n) return null

  // 逐格安全校验：头部沿回路到达身体第 k 格的时间必须晚于其被腾出的时间
  for (let k = 1; k < len; k++) {
    const idx = cycle.indexOf.get(keyOf(snake.body[k]))
    if (idx == null) return null
    const timeToReach = cycleDistance(hi, idx, n)
    const timeToVacate = len - k + snake.pendingGrowth
    if (timeToReach <= timeToVacate) return null
  }

  // 目标：回路距离最近的食物
  let targetIdx = -1
  let foodDist = Infinity
  for (const f of foods) {
    const fi = cycle.indexOf.get(keyOf(f))
    if (fi == null) continue
    const d = cycleDistance(hi, fi, n)
    if (d < foodDist) {
      foodDist = d
      targetIdx = fi
    }
  }

  let chosen: Position | null = null
  const tailIdx = cycle.indexOf.get(keyOf(snake.body[len - 1])) ?? -1
  const distToTail = cycleDistance(hi, tailIdx, n)
  // 捷径：远离尾巴（留出余量）时才允许，且必须沿回路向前、不能越过尾巴
  if (targetIdx >= 0 && distToTail > len + 4) {
    const occupied = new Set(snake.body.map(keyOf))
    let bestProgress = 0
    for (const d of Object.values(DIR_VECTORS)) {
      const nx = head.x + d.x
      const ny = head.y + d.y
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const k = `${nx},${ny}`
      if (walls.has(k) || occupied.has(k)) continue
      const ni = cycle.indexOf.get(k)
      if (ni == null) continue
      const step = cycleDistance(hi, ni, n)
      if (step === 1) continue // 回路下一格，走默认
      if (step >= distToTail) continue // 不允许越过尾巴
      const nFood = cycleDistance(ni, targetIdx, n)
      if (nFood < foodDist) {
        const progress = foodDist - nFood
        if (progress > bestProgress) {
          bestProgress = progress
          chosen = { x: nx, y: ny }
        }
      }
    }
  }
  if (!chosen) {
    chosen = cycle.order[(hi + 1) % n]
  }
  return deltaToDirection(head, chosen, width, height, false)
}

export interface AlignedSpawn {
  bodyCells: Position[]
  spawn: Position
  direction: Direction
}

/**
 * 沿回路挑选对齐出生点：身体 = 回路上 i, i-1, …, i-len+1 的连续段。
 * occupied 为必须避开的格子；keepAway 提供需要保持曼哈顿距离的参照（对战防贴脸）。
 */
export function pickAlignedSpawn(
  cycle: HamiltonCycle,
  snakeLength: number,
  occupied: Set<string>,
  keepAway?: { cells: Position[]; dist: number },
  random: () => number = Math.random,
): AlignedSpawn | null {
  const n = cycle.order.length
  if (snakeLength >= n) return null
  const start = Math.floor(random() * n)
  for (let k = 0; k < n; k++) {
    const i = ((start + k) % n + n) % n
    const cells: Position[] = []
    let ok = true
    for (let j = 0; j < snakeLength && ok; j++) {
      const cell = cycle.order[((((i - j) % n) + n) % n)]
      cells.push(cell)
      if (occupied.has(keyOf(cell))) ok = false
    }
    if (ok && keepAway) {
      outer: for (const cell of cells) {
        for (const c of keepAway.cells) {
          if (Math.abs(cell.x - c.x) + Math.abs(cell.y - c.y) < keepAway.dist) {
            ok = false
            break outer
          }
        }
      }
    }
    if (!ok) continue
    const head = cells[0]
    const nextCell = cycle.order[(i + 1) % n]
    const direction = deltaToDirection(head, nextCell, cycle.width, cycle.height, false)
    if (!direction) continue
    return { bodyCells: cells, spawn: head, direction }
  }
  return null
}
