/** 六张真实可玩的预设地图（只读，复制后才能修改） */
import { Position } from '../core/types'
import { MapData, createMapId } from './validation'

function hLine(y: number, x1: number, x2: number): Position[] {
  const out: Position[] = []
  for (let x = x1; x <= x2; x++) out.push({ x, y })
  return out
}

function vLine(x: number, y1: number, y2: number): Position[] {
  const out: Position[] = []
  for (let y = y1; y <= y2; y++) out.push({ x, y })
  return out
}

function fillRect(x1: number, y1: number, x2: number, y2: number): Position[] {
  const out: Position[] = []
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) out.push({ x, y })
  return out
}

function makeMap(
  id: string,
  name: string,
  width: number,
  height: number,
  walls: Position[],
  opts?: { wrap?: boolean },
): MapData {
  const now = Date.now()
  return {
    id,
    name,
    schemaVersion: 1,
    width,
    height,
    wrap: opts?.wrap ?? false,
    walls,
    spawns: {
      single: { x: 4, y: Math.floor(height / 2) },
      p1: { x: 4, y: Math.floor(height / 2) },
      p2: { x: width - 5, y: Math.floor(height / 2) },
    },
    foodZone: null,
    createdAt: now,
    updatedAt: now,
    readonly: true,
  }
}

/** 空旷 */
function presetEmpty(): MapData {
  return makeMap('preset_empty', '空旷平原', 24, 24, [])
}

/** 十字障碍 */
function presetCross(): MapData {
  const walls = [...vLine(12, 4, 9), ...vLine(12, 14, 19), ...hLine(12, 4, 9), ...hLine(12, 14, 19)]
  const map = makeMap('preset_cross', '十字障碍', 24, 24, walls)
  // 横杆占据 y=12 两侧，出生点放在杆外
  map.spawns = { single: { x: 2, y: 12 }, p1: { x: 2, y: 12 }, p2: { x: 21, y: 12 } }
  return map
}

/** 蛇形迷宫 */
function presetMaze(): MapData {
  const walls = [
    // 三道横墙，左右交替留缺口，形成蛇形通道
    ...hLine(6, 2, 17),
    ...hLine(12, 7, 21),
    ...hLine(18, 2, 17),
  ]
  const map = makeMap('preset_maze', '蛇形迷宫', 24, 24, walls)
  // 顶行没有墙，出生点放在顶部安全区
  map.spawns = { single: { x: 2, y: 2 }, p1: { x: 2, y: 2 }, p2: { x: 21, y: 2 } }
  return map
}

/** 对称竞技场（适合双人对战） */
function presetArena(): MapData {
  const walls = [
    ...hLine(6, 6, 10),
    ...hLine(6, 13, 17),
    ...hLine(17, 6, 10),
    ...hLine(17, 13, 17),
    ...vLine(11, 9, 14),
    ...vLine(12, 9, 14),
  ]
  return makeMap('preset_arena', '对称竞技场', 24, 24, walls)
}

/** 环形回廊 */
function presetRing(): MapData {
  const walls = [
    // 外圈方环（留四个开口）
    ...hLine(5, 5, 9),
    ...hLine(5, 14, 18),
    ...hLine(18, 5, 9),
    ...hLine(18, 14, 18),
    ...vLine(5, 5, 9),
    ...vLine(5, 14, 18),
    ...vLine(18, 5, 9),
    ...vLine(18, 14, 18),
    // 中心柱
    ...fillRect(11, 11, 12, 12),
  ]
  return makeMap('preset_ring', '环形回廊', 24, 24, walls)
}

/** 多房间 */
function presetRooms(): MapData {
  const walls = [
    // 田字分隔，每面墙留门
    ...vLine(8, 2, 8),
    ...vLine(8, 13, 21),
    ...vLine(15, 2, 8),
    ...vLine(15, 13, 21),
    ...hLine(8, 2, 8),
    ...hLine(8, 13, 15),
    ...hLine(8, 18, 21),
    ...hLine(15, 2, 8),
    ...hLine(15, 13, 15),
    ...hLine(15, 18, 21),
  ]
  return makeMap('preset_rooms', '多房间', 24, 24, walls)
}

export interface PresetMap {
  key: string
  build: () => MapData
}

export const PRESET_MAPS: PresetMap[] = [
  { key: 'empty', build: presetEmpty },
  { key: 'cross', build: presetCross },
  { key: 'maze', build: presetMaze },
  { key: 'arena', build: presetArena },
  { key: 'ring', build: presetRing },
  { key: 'rooms', build: presetRooms },
]

export function buildPreset(key: string): MapData | null {
  const p = PRESET_MAPS.find((x) => x.key === key)
  return p ? p.build() : null
}

/** 复制预设为可编辑地图 */
export function clonePreset(source: MapData): MapData {
  return {
    ...source,
    id: createMapId(),
    name: `${source.name}·副本`,
    readonly: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
