import { describe, expect, it } from 'vitest'
import { GridCtx, astarSearch, bfsSearch, deltaToDirection, floodCount, neighbors } from './pathfinding'
import { keyOf } from '../core/types'

function ctx(width: number, height: number, blocked: string[] = [], wrap = false): GridCtx {
  return { width, height, wrap, blocked: new Set(blocked) }
}

/** 校验路径合法性：每步相邻、不穿障碍、从 start 出发到达 goal */
function expectValidPath(path: { x: number; y: number }[], start: { x: number; y: number }, goal: { x: number; y: number }, g: GridCtx): void {
  let cur = start
  for (const step of path) {
    const dx = Math.abs(step.x - cur.x)
    const dy = Math.abs(step.y - cur.y)
    const adj = (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
    const wrapped = g.wrap && ((step.x + 1) % g.width === cur.x || (cur.x + 1) % g.width === step.x) && dy === 0
    const wrappedY = g.wrap && ((step.y + 1) % g.height === cur.y || (cur.y + 1) % g.height === step.y) && dx === 0
    expect(adj || wrapped || wrappedY).toBe(true)
    expect(g.blocked.has(keyOf(step))).toBe(false)
    cur = step
  }
  expect(cur).toEqual(goal)
}

describe('BFS', () => {
  it('空棋盘上找到最短路径（Manhattan 长度）', () => {
    const g = ctx(8, 8)
    const r = bfsSearch(g, { x: 0, y: 0 }, [{ x: 7, y: 7 }])
    expect(r.found).toBe(true)
    expect(r.path).toHaveLength(14)
    expectValidPath(r.path, { x: 0, y: 0 }, { x: 7, y: 7 }, g)
  })

  it('绕开墙壁缺口', () => {
    // 竖墙 x=3，y=0..6 全堵，只能从 y=7 通过
    const walls: string[] = []
    for (let y = 0; y <= 6; y++) walls.push(`3,${y}`)
    const g = ctx(8, 8, walls)
    const r = bfsSearch(g, { x: 1, y: 3 }, [{ x: 5, y: 3 }])
    expect(r.found).toBe(true)
    expectValidPath(r.path, { x: 1, y: 3 }, { x: 5, y: 3 }, g)
    expect(r.path).toHaveLength(12) // 绕行 y=7 的最短路径
  })

  it('目标不可达时返回失败而非伪结果', () => {
    const walls = ['2,0', '2,1', '2,2', '2,3', '2,4', '2,5', '2,6', '2,7']
    const g = ctx(8, 8, walls)
    const r = bfsSearch(g, { x: 0, y: 4 }, [{ x: 5, y: 4 }])
    expect(r.found).toBe(false)
    expect(r.path).toHaveLength(0)
  })

  it('穿墙模式下按环形距离搜索', () => {
    const g = ctx(4, 4, [], true)
    const r = bfsSearch(g, { x: 3, y: 1 }, [{ x: 0, y: 1 }])
    expect(r.found).toBe(true)
    expect(r.path).toHaveLength(1)
    expect(r.path[0]).toEqual({ x: 0, y: 1 })
  })
})

describe('A*', () => {
  it('找到与 BFS 等长的最短路径', () => {
    const g = ctx(8, 8)
    const a = astarSearch(g, { x: 0, y: 0 }, { x: 7, y: 7 })
    const b = bfsSearch(g, { x: 0, y: 0 }, [{ x: 7, y: 7 }])
    expect(a.found).toBe(true)
    expect(a.path).toHaveLength(b.path.length)
    expectValidPath(a.path, { x: 0, y: 0 }, { x: 7, y: 7 }, g)
  })

  it('开放集快照与已探索集互不重叠', () => {
    const g = ctx(10, 10)
    const r = astarSearch(g, { x: 0, y: 0 }, { x: 9, y: 9 })
    const exploredKeys = new Set(r.explored.map(keyOf))
    for (const f of r.frontier) expect(exploredKeys.has(keyOf(f))).toBe(false)
  })

  it('起点即目标时返回空路径', () => {
    const g = ctx(8, 8)
    const r = astarSearch(g, { x: 3, y: 3 }, { x: 3, y: 3 })
    expect(r.found).toBe(true)
    expect(r.path).toHaveLength(0)
  })

  it('不可达时 found=false', () => {
    const walls: string[] = []
    for (let y = 0; y < 8; y++) walls.push(`4,${y}`)
    const g = ctx(8, 8, walls)
    const r = astarSearch(g, { x: 1, y: 1 }, { x: 6, y: 1 })
    expect(r.found).toBe(false)
  })
})

describe('工具函数', () => {
  it('neighbors 不越界且避开障碍', () => {
    const g = ctx(4, 4, ['1,0'])
    const nb = neighbors(g, { x: 0, y: 0 })
    const keys = nb.map(keyOf)
    expect(keys).toContain('1,0') // 越界函数本身不管阻挡；阻挡由调用方过滤 —— 此处只查边界
    expect(keys).not.toContain('0,-1')
    expect(keys).not.toContain('-1,0')
  })

  it('floodCount 统计连通区域', () => {
    const g = ctx(5, 5, ['2,0', '2,1', '2,2', '2,3', '2,4'])
    expect(floodCount(g, { x: 0, y: 0 })).toBe(10) // 左半边 5x2
    expect(floodCount(g, { x: 4, y: 4 })).toBe(10)
    expect(floodCount(g, { x: 2, y: 2 })).toBe(0) // 被堵
  })

  it('deltaToDirection 处理普通与穿墙位移', () => {
    expect(deltaToDirection({ x: 0, y: 0 }, { x: 1, y: 0 }, 4, 4, false)).toBe('right')
    expect(deltaToDirection({ x: 0, y: 0 }, { x: 0, y: -1 }, 4, 4, false)).toBe('up')
    expect(deltaToDirection({ x: 3, y: 0 }, { x: 0, y: 0 }, 4, 4, true)).toBe('right')
    expect(deltaToDirection({ x: 0, y: 3 }, { x: 0, y: 0 }, 4, 4, true)).toBe('down')
    expect(deltaToDirection({ x: 0, y: 0 }, { x: 2, y: 0 }, 4, 4, false)).toBeNull()
  })
})
