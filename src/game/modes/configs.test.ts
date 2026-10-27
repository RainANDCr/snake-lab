import { describe, expect, it } from 'vitest'
import { buildSingleConfig, buildVersusConfig, collectSpawnCandidates, pickRandomSpawn } from './configs'
import { buildPreset, PRESET_MAPS } from '../maps/presets'
import { DIR_VECTORS, keyOf } from '../core/types'
import { createInitialState } from '../core/engine'

describe('随机出生点安全跑道', () => {
  it('全部预设 × 多次随机：出生点/身体不在墙上，且面向方向至少 2 格畅通', () => {
    for (const preset of PRESET_MAPS) {
      const map = buildPreset(preset.key)!
      for (let i = 0; i < 30; i++) {
        for (const mode of ['classic', 'endless', 'speed'] as const) {
          const config = buildSingleConfig({ mode, difficulty: 'normal', map })
          const snake = config.snakes[0]
          const wallKeys = new Set(map.walls.map(keyOf))
          const inBounds = (p: { x: number; y: number }): boolean =>
            p.x >= 0 && p.y >= 0 && p.x < config.width && p.y < config.height
          // 引擎初始身体全部在场内且不与墙重叠（穿墙模式已回绕）
          const state = createInitialState(config)
          expect(state.foods.length).toBeGreaterThan(0)
          for (const cell of state.snakes[0].body) {
            expect(inBounds(cell), `${preset.key} 身体越界`).toBe(true)
            expect(wallKeys.has(keyOf(cell)), `${preset.key} 身体在墙上`).toBe(false)
          }
          // 面向方向至少 2 格跑道（保证不会第一步就撞墙）
          const v = DIR_VECTORS[snake.direction]
          for (let step = 1; step <= 2; step++) {
            const nx = config.wrap ? (((snake.spawn.x + v.x * step) % config.width) + config.width) % config.width : snake.spawn.x + v.x * step
            const ny = config.wrap ? (((snake.spawn.y + v.y * step) % config.height) + config.height) % config.height : snake.spawn.y + v.y * step
            const inside = nx >= 0 && ny >= 0 && nx < config.width && ny < config.height
            if (config.wrap || inside) {
              expect(wallKeys.has(`${nx},${ny}`), `${preset.key} 面向前方 ${step} 格内有墙`).toBe(false)
            }
          }
        }
      }
    }
  })

  it('随机出生点分布在不同位置（非固定点）', () => {
    const map = buildPreset('cross')!
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const config = buildSingleConfig({ mode: 'classic', difficulty: 'normal', map })
      seen.add(`${config.snakes[0].spawn.x},${config.snakes[0].spawn.y},${config.snakes[0].direction}`)
    }
    expect(seen.size).toBeGreaterThan(3)
  })

  it('候选收集要求安全跑道：十字障碍图中 runway=8 仍有候选且不贴墙', () => {
    const map = buildPreset('cross')!
    const candidates = collectSpawnCandidates(map.walls, map.width, map.height, false, 3, 8)
    expect(candidates.length).toBeGreaterThan(0)
    const wallKeys = new Set(map.walls.map(keyOf))
    for (const c of candidates) {
      expect(wallKeys.has(keyOf(c.spawn))).toBe(false)
      const v = DIR_VECTORS[c.direction]
      for (let step = 1; step <= 8; step++) {
        expect(wallKeys.has(`${c.spawn.x + v.x * step},${c.spawn.y + v.y * step}`)).toBe(false)
      }
    }
  })

  it('近满墙地图也不会崩溃（兜底逻辑）', () => {
    const walls: { x: number; y: number }[] = []
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (!(x >= 5 && x <= 7 && y >= 5 && y <= 7)) walls.push({ x, y })
    const c = pickRandomSpawn(walls, 12, 12, false, 3, 8)
    expect(c.spawn.x).toBeGreaterThanOrEqual(0)
  })
})

describe('对战随机对称出生', () => {
  it('全部预设 × 多次随机：双方对称、不在墙上、跑道等长且 ≥6', () => {
    for (const preset of PRESET_MAPS) {
      const map = buildPreset(preset.key)!
      for (let i = 0; i < 20; i++) {
        const config = buildVersusConfig({ kind: 'classic', difficulty: 'normal', durationSec: 120, powerups: false, map })
        const [p1, p2] = config.snakes
        expect(p1.spawn.y).toBe(p2.spawn.y)
        expect(p1.spawn.x + p2.spawn.x).toBe(config.width - 1)
        const wallKeys = new Set(map.walls.map(keyOf))
        expect(wallKeys.has(keyOf(p1.spawn))).toBe(false)
        expect(wallKeys.has(keyOf(p2.spawn))).toBe(false)
        let run1 = 0
        while (run1 < 10 && !wallKeys.has(`${p1.spawn.x + 1 + run1},${p1.spawn.y}`)) run1 += 1
        let run2 = 0
        while (run2 < 10 && !wallKeys.has(`${p2.spawn.x - 1 - run2},${p2.spawn.y}`)) run2 += 1
        expect(run1).toBeGreaterThanOrEqual(6)
        expect(run2).toBeGreaterThanOrEqual(6)
      }
    }
  })

  it('随机行会变化（非固定行）', () => {
    const map = buildPreset('maze')!
    const rows = new Set<number>()
    for (let i = 0; i < 30; i++) {
      const config = buildVersusConfig({ kind: 'classic', difficulty: 'normal', durationSec: 120, powerups: false, map })
      rows.add(config.snakes[0].spawn.y)
    }
    expect(rows.size).toBeGreaterThan(1)
  })
})
