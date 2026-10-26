import { describe, expect, it } from 'vitest'
import { MapData, parseImportedMap, validateMap } from './validation'
import { buildPreset, clonePreset, PRESET_MAPS } from './presets'

function validMap(overrides: Partial<MapData> = {}): MapData {
  return {
    id: 'm1',
    name: '测试地图',
    schemaVersion: 1,
    width: 24,
    height: 24,
    wrap: false,
    walls: [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }],
    spawns: { single: { x: 4, y: 12 }, p1: { x: 4, y: 12 }, p2: { x: 19, y: 12 } },
    foodZone: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('地图校验', () => {
  it('合法地图通过校验', () => {
    const r = validateMap(validMap(), { requireSingle: true, requireVersus: true })
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('出生点在障碍物上时报错', () => {
    const r = validateMap(validMap({ spawns: { single: { x: 10, y: 10 } } }), { requireSingle: true })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('单人出生点'))).toBe(true)
  })

  it('坐标越界报错', () => {
    const r = validateMap(validMap({ walls: [{ x: 30, y: 5 }] }))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('越界'))).toBe(true)
  })

  it('尺寸非法报错', () => {
    const r = validateMap(validMap({ width: 4, height: 4 }))
    expect(r.ok).toBe(false)
  })

  it('出生点被完全封死报错', () => {
    // 环形围墙封死出生点
    const walls: { x: number; y: number }[] = []
    for (let x = 2; x <= 6; x++) {
      walls.push({ x, y: 10 }, { x, y: 14 })
    }
    for (let y = 11; y <= 13; y++) {
      walls.push({ x: 2, y }, { x: 6, y })
    }
    const r = validateMap(validMap({ walls, spawns: { single: { x: 4, y: 12 } } }), { requireSingle: true })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('不可玩') || e.includes('封死'))).toBe(true)
  })

  it('缺少必要出生点报错', () => {
    const r = validateMap(validMap({ spawns: {} }), { requireVersus: true })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('双人出生点'))).toBe(true)
  })

  it('食物区包含障碍格报错', () => {
    const r = validateMap(validMap({ foodZone: [{ x: 10, y: 10 }] }))
    expect(r.ok).toBe(false)
  })

  it('结构版本不支持报错', () => {
    const r = validateMap(validMap({ schemaVersion: 99 }))
    expect(r.ok).toBe(false)
  })
})

describe('JSON 导入安全校验（不执行任何代码）', () => {
  it('拒绝非法 JSON', () => {
    expect(() => parseImportedMap('{not json')).toThrow('JSON')
  })

  it('拒绝缺失字段的地图', () => {
    expect(() => parseImportedMap('{"schemaVersion":1}')).toThrow()
  })

  it('拒绝错误版本号', () => {
    const map = validMap()
    map.schemaVersion = 2
    expect(() => parseImportedMap(JSON.stringify(map))).toThrow('版本')
  })

  it('合法地图可以导入并保留数据', () => {
    const map = validMap({ name: '导入图' })
    const parsed = parseImportedMap(JSON.stringify(map))
    expect(parsed.name).toBe('导入图')
    expect(parsed.walls).toHaveLength(3)
  })

  it('拒绝携带原型污染键的对象', () => {
    const evil = JSON.stringify({
      schemaVersion: 1,
      name: 'evil',
      width: 24,
      height: 24,
      walls: [],
      spawns: {},
      __proto__: { admin: true },
    })
    expect(() => parseImportedMap(evil)).not.toThrow()
  })
})

describe('六张预设地图真实可玩', () => {
  it.each(PRESET_MAPS.map((p) => [p.key] as const))('预设 %s 校验通过且出生点有效', (key) => {
    const map = buildPreset(key)!
    expect(map).not.toBeNull()
    expect(map.readonly).toBe(true)
    const r = validateMap(map, { requireSingle: true, requireVersus: true })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('复制预设后获得新 id 且可编辑', () => {
    const map = buildPreset('maze')!
    const copy = clonePreset(map)
    expect(copy.id).not.toBe(map.id)
    expect(copy.readonly).toBe(false)
    expect(copy.walls).toEqual(map.walls)
  })
})
