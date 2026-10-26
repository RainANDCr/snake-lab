/**
 * 网格寻路算法：BFS 与 A*（Manhattan 启发式）。
 * 返回路径与搜索统计（已探索节点、开放集快照、真实耗时），供可视化与对比面板使用。
 * 注意：动态蛇身环境下重规划无法保证永不死亡，算法只在「当下可通行网格」上规划。
 */
import { Direction, DIR_VECTORS, Position, keyOf } from '../core/types'

export interface GridCtx {
  width: number
  height: number
  wrap: boolean
  blocked: Set<string>
}

export interface SearchResult {
  found: boolean
  /** 从起点下一步到目标的路径（含目标，不含起点） */
  path: Position[]
  explored: Position[]
  frontier: Position[]
  ms: number
}

export function neighbors(ctx: GridCtx, p: Position): Position[] {
  const out: Position[] = []
  for (const d of Object.values(DIR_VECTORS)) {
    let nx = p.x + d.x
    let ny = p.y + d.y
    if (ctx.wrap) {
      nx = (nx + ctx.width) % ctx.width
      ny = (ny + ctx.height) % ctx.height
    } else if (nx < 0 || ny < 0 || nx >= ctx.width || ny >= ctx.height) {
      continue
    }
    out.push({ x: nx, y: ny })
  }
  return out
}

function manhattan(a: Position, b: Position, ctx: GridCtx): number {
  let dx = Math.abs(a.x - b.x)
  let dy = Math.abs(a.y - b.y)
  if (ctx.wrap) {
    dx = Math.min(dx, ctx.width - dx)
    dy = Math.min(dy, ctx.height - dy)
  }
  return dx + dy
}

function reconstruct(cameFrom: Map<string, string>, goalKey: string): Position[] {
  const path: Position[] = []
  let cur: string | undefined = goalKey
  while (cur) {
    const [x, y] = cur.split(',')
    path.push({ x: Number(x), y: Number(y) })
    cur = cameFrom.get(cur)
  }
  path.reverse()
  path.shift() // 去掉起点
  return path
}

/** 多目标 BFS：返回从 start 到任一 goal 的最短路径 */
export function bfsSearch(ctx: GridCtx, start: Position, goals: Position[]): SearchResult {
  const t0 = performance.now()
  const goalSet = new Set(goals.map(keyOf))
  const result: SearchResult = { found: false, path: [], explored: [], frontier: [], ms: 0 }
  if (goalSet.has(keyOf(start))) {
    result.ms = performance.now() - t0
    return result
  }
  const visited = new Set<string>([keyOf(start)])
  const cameFrom = new Map<string, string>()
  const queue: string[] = [keyOf(start)]
  let head = 0
  while (head < queue.length) {
    const curKey = queue[head++]
    const [cx, cy] = curKey.split(',')
    const cur = { x: Number(cx), y: Number(cy) }
    result.explored.push(cur)
    for (const nb of neighbors(ctx, cur)) {
      const k = keyOf(nb)
      if (visited.has(k)) continue
      if (!goalSet.has(k) && ctx.blocked.has(k)) continue
      visited.add(k)
      cameFrom.set(k, curKey)
      if (goalSet.has(k)) {
        result.found = true
        result.path = reconstruct(cameFrom, k)
        result.ms = performance.now() - t0
        return result
      }
      queue.push(k)
    }
  }
  result.ms = performance.now() - t0
  return result
}

/** 简易二叉最小堆 */
class MinHeap {
  private items: { key: string; f: number }[] = []

  push(key: string, f: number): void {
    this.items.push({ key, f })
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent].f <= this.items[i].f) break
      ;[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]]
      i = parent
    }
  }

  pop(): { key: string; f: number } | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]
    const last = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = i * 2 + 2
        let m = i
        if (l < this.items.length && this.items[l].f < this.items[m].f) m = l
        if (r < this.items.length && this.items[r].f < this.items[m].f) m = r
        if (m === i) break
        ;[this.items[m], this.items[i]] = [this.items[i], this.items[m]]
        i = m
      }
    }
    return top
  }

  get size(): number {
    return this.items.length
  }

  snapshot(): { key: string; f: number }[] {
    return [...this.items]
  }
}

/** 单目标 A*：Manhattan 启发式（穿墙模式取环形距离） */
export function astarSearch(ctx: GridCtx, start: Position, goal: Position): SearchResult {
  const t0 = performance.now()
  const result: SearchResult = { found: false, path: [], explored: [], frontier: [], ms: 0 }
  const startKey = keyOf(start)
  const goalKey = keyOf(goal)
  if (startKey === goalKey) {
    result.found = true
    result.ms = performance.now() - t0
    return result
  }
  const gScore = new Map<string, number>([[startKey, 0]])
  const cameFrom = new Map<string, string>()
  const closed = new Set<string>()
  const open = new MinHeap()
  open.push(startKey, manhattan(start, goal, ctx))
  while (open.size > 0) {
    const cur = open.pop()!
    if (closed.has(cur.key)) continue
    closed.add(cur.key)
    const [cx, cy] = cur.key.split(',')
    const curPos = { x: Number(cx), y: Number(cy) }
    result.explored.push(curPos)
    if (cur.key === goalKey) {
      result.found = true
      result.path = reconstruct(cameFrom, goalKey)
      result.frontier = open.snapshot().filter((o) => !closed.has(o.key)).map(toPos)
      result.ms = performance.now() - t0
      return result
    }
    const g = gScore.get(cur.key) ?? 0
    for (const nb of neighbors(ctx, curPos)) {
      const k = keyOf(nb)
      if (closed.has(k)) continue
      if (k !== goalKey && ctx.blocked.has(k)) continue
      const ng = g + 1
      const old = gScore.get(k)
      if (old == null || ng < old) {
        gScore.set(k, ng)
        cameFrom.set(k, cur.key)
        open.push(k, ng + manhattan(nb, goal, ctx))
      }
    }
  }
  result.frontier = open.snapshot().filter((o) => !closed.has(o.key)).map(toPos)
  result.ms = performance.now() - t0
  return result
}

function toPos(o: { key: string; f: number }): Position {
  const [x, y] = o.key.split(',')
  return { x: Number(x), y: Number(y) }
}

/** 洪泛填充统计可达区域大小 */
export function floodCount(ctx: GridCtx, start: Position): number {
  if (ctx.blocked.has(keyOf(start))) return 0
  const seen = new Set<string>([keyOf(start)])
  const queue: Position[] = [start]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const nb of neighbors(ctx, cur)) {
      const k = keyOf(nb)
      if (seen.has(k) || ctx.blocked.has(k)) continue
      seen.add(k)
      queue.push(nb)
    }
  }
  return seen.size
}

/** 将路径第一步转为方向（支持穿墙环绕） */
export function deltaToDirection(head: Position, step: Position, width: number, height: number, wrap: boolean): Direction | null {
  let dx = step.x - head.x
  let dy = step.y - head.y
  if (wrap) {
    if (dx > 1) dx -= width
    if (dx < -1) dx += width
    if (dy > 1) dy -= height
    if (dy < -1) dy += height
  }
  if (dx === 1 && dy === 0) return 'right'
  if (dx === -1 && dy === 0) return 'left'
  if (dx === 0 && dy === 1) return 'down'
  if (dx === 0 && dy === -1) return 'up'
  return null
}
