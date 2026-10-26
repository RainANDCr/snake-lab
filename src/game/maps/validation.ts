/** 地图数据模型与校验（含 JSON 导入导出安全校验） */
import { Position } from '../core/types'

export const MAP_SCHEMA_VERSION = 1
export const MAP_MAX_SIZE = 48
export const MAP_MIN_SIZE = 8

export interface MapData {
  id: string
  name: string
  schemaVersion: number
  width: number
  height: number
  wrap: boolean
  walls: Position[]
  spawns: {
    single?: Position
    p1?: Position
    p2?: Position
  }
  /** 食物允许生成区域；null 表示全部空闲格 */
  foodZone: Position[] | null
  createdAt: number
  updatedAt: number
  /** 预设地图只读，复制后才能修改 */
  readonly?: boolean
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

function isPosition(p: unknown): p is Position {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as Position).x === 'number' &&
    Number.isInteger((p as Position).x) &&
    typeof (p as Position).y === 'number' &&
    Number.isInteger((p as Position).y)
  )
}

function inBounds(p: Position, w: number, h: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < w && p.y < h
}

function floodReachable(width: number, height: number, wrap: boolean, blocked: Set<string>, start: Position): Set<string> {
  if (blocked.has(`${start.x},${start.y}`) || !inBounds(start, width, height)) return new Set()
  const seen = new Set<string>([`${start.x},${start.y}`])
  const queue: Position[] = [start]
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const [dx, dy] of dirs) {
      let nx = cur.x + dx
      let ny = cur.y + dy
      if (wrap) {
        nx = (nx + width) % width
        ny = (ny + height) % height
      } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const k = `${nx},${ny}`
      if (seen.has(k) || blocked.has(k)) continue
      seen.add(k)
      queue.push({ x: nx, y: ny })
    }
  }
  return seen
}

export function wallKeySet(map: MapData): Set<string> {
  return new Set(map.walls.map((w) => `${w.x},${w.y}`))
}

/**
 * 校验地图：结构合法性、坐标范围、出生点、连通性（出生可达区域占比）与食物空间。
 * 允许有设计意义的封闭布局，但必须保证出生点有效且有可生成食物的连通空间。
 */
export function validateMap(map: MapData, opts?: { requireSingle?: boolean; requireVersus?: boolean }): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof map !== 'object' || map === null) {
    return { ok: false, errors: ['地图数据不是合法对象'], warnings }
  }
  if (map.schemaVersion !== MAP_SCHEMA_VERSION) {
    errors.push(`地图结构版本不支持（期望 ${MAP_SCHEMA_VERSION}，实际 ${map.schemaVersion}）`)
  }
  const w = map.width
  const h = map.height
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < MAP_MIN_SIZE || h < MAP_MIN_SIZE || w > MAP_MAX_SIZE || h > MAP_MAX_SIZE) {
    errors.push(`地图尺寸必须在 ${MAP_MIN_SIZE}～${MAP_MAX_SIZE} 之间（实际 ${w}×${h}）`)
  }
  if (errors.length > 0) return { ok: false, errors, warnings }

  if (!Array.isArray(map.walls)) {
    errors.push('障碍物数据必须是数组')
  } else {
    const seen = new Set<string>()
    for (const wall of map.walls) {
      if (!isPosition(wall)) {
        errors.push('障碍物坐标格式不合法')
        break
      }
      if (!inBounds(wall, w, h)) {
        errors.push(`障碍物坐标越界 (${wall.x},${wall.y})`)
        continue
      }
      const k = `${wall.x},${wall.y}`
      if (seen.has(k)) warnings.push(`存在重复障碍物 (${wall.x},${wall.y})`)
      seen.add(k)
    }
  }

  const walls = wallKeySet(map)
  const checkSpawn = (p: Position | undefined, label: string): void => {
    if (!p) return
    if (!isPosition(p) || !inBounds(p, w, h)) {
      errors.push(`${label}坐标越界`)
      return
    }
    if (walls.has(`${p.x},${p.y}`)) errors.push(`${label}位于障碍物上`)
  }
  checkSpawn(map.spawns?.single, '单人出生点')
  checkSpawn(map.spawns?.p1, '玩家一生日点')
  checkSpawn(map.spawns?.p2, '玩家二出生点')

  if (opts?.requireSingle && !map.spawns?.single) errors.push('缺少单人出生点')
  if (opts?.requireVersus && (!map.spawns?.p1 || !map.spawns?.p2)) errors.push('缺少双人出生点')

  if (map.foodZone != null) {
    if (!Array.isArray(map.foodZone)) {
      errors.push('食物生成区域必须是数组或 null')
    } else {
      for (const p of map.foodZone) {
        if (!isPosition(p) || !inBounds(p, w, h)) {
          errors.push('食物生成区域坐标越界')
          break
        }
        if (walls.has(`${p.x},${p.y}`)) {
          errors.push(`食物生成区域包含障碍格 (${p.x},${p.y})`)
          break
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings }

  // 连通性检查：从出生点泛洪，可达空闲区域必须足够
  const blocked = wallKeySet(map)
  const spawn = map.spawns?.single ?? map.spawns?.p1 ?? map.spawns?.p2
  if (spawn) {
    const reach = floodReachable(w, h, map.wrap, blocked, spawn)
    const freeTotal = w * h - blocked.size
    if (reach.size === 0) {
      errors.push('出生点被完全封死，无可用空间')
    } else {
      if (reach.size < Math.max(10, freeTotal * 0.25)) {
        errors.push(`出生点可达区域过小（${reach.size} 格），地图不可玩`)
      }
      if (map.foodZone && map.foodZone.length > 0) {
        const zoneReachable = map.foodZone.some((p) => reach.has(`${p.x},${p.y}`))
        if (!zoneReachable) errors.push('食物生成区域与出生点不连通')
      }
      if (reach.size < freeTotal) {
        warnings.push(`有 ${freeTotal - reach.size} 格空闲区域从出生点不可达，食物不会生成在那里`)
      }
    }
  } else {
    warnings.push('地图未设置出生点，游玩时将自动选择安全出生位置')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function createMapId(): string {
  return `map_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function emptyMap(name: string, width = 24, height = 24, wrap = false): MapData {
  const now = Date.now()
  return {
    id: createMapId(),
    name,
    schemaVersion: MAP_SCHEMA_VERSION,
    width,
    height,
    wrap,
    walls: [],
    spawns: { single: { x: 4, y: Math.floor(height / 2) }, p1: { x: 4, y: Math.floor(height / 2) }, p2: { x: width - 5, y: Math.floor(height / 2) } },
    foodZone: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 从导入的 JSON 解析地图（不执行任何代码，仅做结构与数值校验）。
 * 失败时抛出带友好信息的错误。
 */
export function parseImportedMap(json: string): MapData {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  if (typeof data !== 'object' || data === null) throw new Error('文件内容不是地图对象')
  const obj = data as Record<string, unknown>
  if (obj.schemaVersion !== MAP_SCHEMA_VERSION) {
    throw new Error(`地图结构版本不支持（期望 ${MAP_SCHEMA_VERSION}）`)
  }
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) throw new Error('地图缺少名称')
  if (typeof obj.width !== 'number' || typeof obj.height !== 'number') throw new Error('地图缺少尺寸信息')
  const raw = data as Partial<MapData>
  const map: MapData = {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : createMapId(),
    name: raw.name!.slice(0, 40),
    schemaVersion: MAP_SCHEMA_VERSION,
    width: raw.width!,
    height: raw.height!,
    wrap: raw.wrap === true,
    walls: Array.isArray(raw.walls) ? raw.walls : [],
    spawns: {
      single: isPosition(raw.spawns?.single) ? raw.spawns.single : undefined,
      p1: isPosition(raw.spawns?.p1) ? raw.spawns.p1 : undefined,
      p2: isPosition(raw.spawns?.p2) ? raw.spawns.p2 : undefined,
    },
    foodZone: Array.isArray(raw.foodZone) ? raw.foodZone : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: Date.now(),
  }
  // 限制过大文件
  if (map.width * map.height > MAP_MAX_SIZE * MAP_MAX_SIZE) throw new Error('地图尺寸过大')
  const result = validateMap(map)
  if (!result.ok) throw new Error(`地图校验失败：${result.errors[0]}`)
  return map
}
