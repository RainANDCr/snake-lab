/**
 * AI 控制器：BFS / A* 直接寻路到食物；「安全策略」在寻路之上做可存活性检查
 * （吃食物后的未来状态模拟 + 洪泛连通区域检查），必要时尾随自己的尾巴保命。
 *
 * 明确限制：复杂动态地图中没有任何算法能保证永不死亡；无路可走时返回可解释的失败状态。
 */
import { freeCells, reachableFreeCells } from '../core/engine'
import { Direction, GameState, keyOf, Position } from '../core/types'
import { GridCtx, SearchResult, astarSearch, bfsSearch, deltaToDirection, floodCount } from './pathfinding'

export type Algorithm = 'bfs' | 'astar' | 'safe'

export type AiStrategy = 'food' | 'tail' | 'space' | 'none'

export interface AiStats {
  algorithm: Algorithm
  explored: number
  pathLength: number
  ms: number
  strategy: AiStrategy
  found: boolean
  message: string
}

export interface AiViz {
  explored: Position[]
  frontier: Position[]
  path: Position[]
}

export interface AiDecision {
  direction: Direction | null
  stats: AiStats
  viz: AiViz
}

/** 构建 AI 规划用的阻挡集合：墙 + 所有蛇身（含尸体）；各家蛇的「本 tick 将腾出的尾格」豁免 */
function buildBlocked(state: GameState, snakeId: string): { blocked: Set<string>; ownTail: Position | null } {
  const blocked = new Set<string>(state.wallSet)
  let ownTail: Position | null = null
  for (const s of state.snakes) {
    for (let i = 0; i < s.body.length; i++) {
      const isTail = i === s.body.length - 1
      if (isTail && s.alive && s.pendingGrowth === 0) {
        // 尾格即将腾出（不增长时），规划时豁免
        if (s.id === snakeId) ownTail = s.body[i]
        continue
      }
      blocked.add(keyOf(s.body[i]))
    }
  }
  return { blocked, ownTail }
}

function nearestFood(state: GameState, head: Position): Position | null {
  let best: Position | null = null
  let bestD = Infinity
  for (const f of state.foods) {
    const d = Math.abs(f.position.x - head.x) + Math.abs(f.position.y - head.y)
    if (d < bestD) {
      bestD = d
      best = f.position
    }
  }
  return best
}

function runSearch(algorithm: Algorithm, ctx: GridCtx, head: Position, food: Position): SearchResult {
  return algorithm === 'bfs' ? bfsSearch(ctx, head, [food]) : astarSearch(ctx, head, food)
}

/** 模拟沿路径吃到食物后的蛇身，检查新头部的洪泛可达空间是否足够 */
function simulateSafe(ctx: GridCtx, body: Position[], path: Position[], growth: number, minLength: number): boolean {
  const simBody: Position[] = [{ ...path[0] }, ...body.map((p) => ({ ...p }))]
  const keep = simBody.length + growth - 1 // 吃到后长度（head 替换）
  // 新头部视角的阻挡：模拟身体（尾部继续可让出，做保守静态近似：不豁免）
  const blocked = new Set<string>(ctx.blocked)
  for (let i = 0; i < Math.min(simBody.length, keep); i++) blocked.add(keyOf(simBody[i]))
  blocked.delete(keyOf(path[0])) // 新头自身不构成阻挡，从它的邻域评估未来空间
  const area = floodCount({ ...ctx, blocked }, path[0])
  return area >= minLength
}

function safeNeighborMove(
  state: GameState,
  ctx: GridCtx,
  head: Position,
  snakeId: string,
): { direction: Direction | null; viz: AiViz } {
  const candidates: { dir: Direction; pos: Position; area: number }[] = []
  const { width, height, wrap } = state.config
  for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d]
    let nx = head.x + v[0]
    let ny = head.y + v[1]
    if (wrap) {
      nx = (nx + width) % width
      ny = (ny + height) % height
    } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    const k = `${nx},${ny}`
    if (ctx.blocked.has(k)) continue
    const area = floodCount(ctx, { x: nx, y: ny })
    candidates.push({ dir: d, pos: { x: nx, y: ny }, area })
  }
  if (candidates.length === 0) return { direction: null, viz: { explored: [], frontier: [], path: [] } }
  candidates.sort((a, b) => b.area - a.area)
  return {
    direction: candidates[0].dir,
    viz: { explored: candidates.map((c) => c.pos), frontier: [], path: [candidates[0].pos] },
  }
}

export function aiDecide(state: GameState, snakeId: string, algorithm: Algorithm): AiDecision {
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (!snake || !snake.alive) {
    return {
      direction: null,
      stats: { algorithm, explored: 0, pathLength: 0, ms: 0, strategy: 'none', found: false, message: '蛇不可用' },
      viz: { explored: [], frontier: [], path: [] },
    }
  }
  const head = snake.body[0]
  const { blocked, ownTail } = buildBlocked(state, snakeId)
  const ctx: GridCtx = {
    width: state.config.width,
    height: state.config.height,
    wrap: state.config.wrap,
    blocked,
  }
  const baseViz: AiViz = { explored: [], frontier: [], path: [] }

  const food = nearestFood(state, head)

  // —— BFS / A*：直接寻路到最近食物 ——
  if (algorithm !== 'safe') {
    if (!food) {
      const fallback = safeNeighborMove(state, ctx, head, snakeId)
      return {
        direction: fallback.direction,
        stats: { algorithm, explored: 0, pathLength: 0, ms: 0, strategy: 'space', found: false, message: '场上没有食物' },
        viz: fallback.viz,
      }
    }
    const r = runSearch(algorithm, ctx, head, food)
    if (r.found && r.path.length > 0) {
      const dir = deltaToDirection(head, r.path[0], ctx.width, ctx.height, ctx.wrap)
      if (dir) {
        return {
          direction: dir,
          stats: {
            algorithm,
            explored: r.explored.length,
            pathLength: r.path.length,
            ms: r.ms,
            strategy: 'food',
            found: true,
            message: '已规划到食物的路径',
          },
          viz: { explored: r.explored, frontier: r.frontier, path: r.path },
        }
      }
    }
    // 无路可走：退化为安全移动，明确报告失败而非假装成功
    const fallback = safeNeighborMove(state, ctx, head, snakeId)
    return {
      direction: fallback.direction,
      stats: {
        algorithm,
        explored: r.explored.length,
        pathLength: 0,
        ms: r.ms,
        strategy: fallback.direction ? 'space' : 'none',
        found: false,
        message: fallback.direction ? '食物不可达，执行保命移动' : '无路可走',
      },
      viz: fallback.viz,
    }
  }

  // —— 安全策略 ——
  if (food) {
    const r = astarSearch(ctx, head, food)
    if (r.found && r.path.length > 0) {
      const foodItem = state.foods.find((f) => f.position.x === food.x && f.position.y === food.y)
      const growth = foodItem ? foodItem.growth : 1
      const minLength = Math.max(snake.body.length + 4, 10)
      if (simulateSafe(ctx, snake.body, r.path, growth, minLength)) {
        const dir = deltaToDirection(head, r.path[0], ctx.width, ctx.height, ctx.wrap)
        if (dir) {
          return {
            direction: dir,
            stats: {
              algorithm,
              explored: r.explored.length,
              pathLength: r.path.length,
              ms: r.ms,
              strategy: 'food',
              found: true,
              message: '路径安全（未来空间充足）',
            },
            viz: { explored: r.explored, frontier: r.frontier, path: r.path },
          }
        }
      }
    }
    // 食物路径不安全 → 尾随自己的尾巴
    if (ownTail) {
      const tailCtx: GridCtx = { ...ctx, blocked: new Set(blocked) }
      tailCtx.blocked.delete(keyOf(ownTail))
      const tr = astarSearch(tailCtx, head, ownTail)
      if (tr.found && tr.path.length > 0) {
        const dir = deltaToDirection(head, tr.path[0], ctx.width, ctx.height, ctx.wrap)
        if (dir) {
          return {
            direction: dir,
            stats: {
              algorithm,
              explored: tr.explored.length,
              pathLength: tr.path.length,
              ms: tr.ms,
              strategy: 'tail',
              found: true,
              message: '追尾等待安全时机',
            },
            viz: { explored: tr.explored, frontier: tr.frontier, path: tr.path },
          }
        }
      }
    }
  }
  // 最后手段：选择洪泛空间最大的相邻格
  const fallback = safeNeighborMove(state, ctx, head, snakeId)
  return {
    direction: fallback.direction,
    stats: {
      algorithm,
      explored: 0,
      pathLength: 0,
      ms: 0,
      strategy: fallback.direction ? 'space' : 'none',
      found: false,
      message: fallback.direction ? '空间优先保命移动' : '无路可走',
    },
    viz: fallback.viz,
  }
}

/** BFS vs A* 对比：在同一快照上分别搜索，返回统计表 */
export interface CompareRow {
  algorithm: Algorithm
  found: boolean
  explored: number
  pathLength: number
  ms: number
}

export function compareAlgorithms(state: GameState, snakeId: string): { rows: CompareRow[]; food: Position | null } {
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (!snake) return { rows: [], food: null }
  const head = snake.body[0]
  const food = nearestFood(state, head)
  if (!food) return { rows: [], food: null }
  const { blocked } = buildBlocked(state, snakeId)
  const ctx: GridCtx = { width: state.config.width, height: state.config.height, wrap: state.config.wrap, blocked }
  const rows: CompareRow[] = []
  for (const algo of ['bfs', 'astar'] as const) {
    const r = runSearch(algo, ctx, head, food)
    rows.push({ algorithm: algo, found: r.found, explored: r.explored.length, pathLength: r.path.length, ms: r.ms })
  }
  return { rows, food }
}

/** 导出当前可达空闲格数量（供 UI 提示） */
export function reachableCellCount(state: GameState): number {
  return reachableFreeCells(state).length
}

export { freeCells }
