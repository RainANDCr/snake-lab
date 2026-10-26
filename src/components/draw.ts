/**
 * Canvas 游戏渲染：按逻辑网格绘制棋盘/墙/食物/蛇/道具/AI 可视化图层。
 * 渲染与模拟逻辑分离；按 devicePixelRatio 高清绘制；动画仅装饰性，不影响碰撞。
 */
import { GameState, Position, keyOf } from '../game/core/types'
import { AiViz } from '../game/ai/controller'
import { ThemeColors } from '../styles/themes'

export interface DrawOptions {
  theme: ThemeColors
  /** AI 可视化图层 */
  viz?: AiViz | null
  showExplored?: boolean
  showFrontier?: boolean
  showPath?: boolean
  /** 像素主题的直角风格 */
  pixelStyle?: boolean
  /** 减少动态效果 */
  reducedMotion?: boolean
}

export interface Layout {
  cell: number
  offsetX: number
  offsetY: number
}

export function computeLayout(cssWidth: number, cssHeight: number, width: number, height: number): Layout {
  const cell = Math.max(4, Math.floor(Math.min(cssWidth / width, cssHeight / height)))
  const offsetX = Math.floor((cssWidth - cell * width) / 2)
  const offsetY = Math.floor((cssHeight - cell * height) / 2)
  return { cell, offsetX, offsetY }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

const EYES: Record<string, [number, number][]> = {
  up: [
    [0.3, 0.3],
    [0.7, 0.3],
  ],
  down: [
    [0.3, 0.7],
    [0.7, 0.7],
  ],
  left: [
    [0.3, 0.3],
    [0.3, 0.7],
  ],
  right: [
    [0.7, 0.3],
    [0.7, 0.7],
  ],
}

function drawSnake(ctx: CanvasRenderingContext2D, state: GameState, snakeIndex: number, layout: Layout, opts: DrawOptions): void {
  const { cell, offsetX, offsetY } = layout
  const snake = state.snakes[snakeIndex]
  const t = opts.theme
  const bodyColor = snake.alive ? snake.color : t.deadSnake
  const headColor = snake.alive ? snake.headColor : t.deadSnake
  const r = opts.pixelStyle ? 0 : Math.max(2, cell * 0.24)
  const inset = cell > 10 ? 1.5 : 0.5
  // 身体（尾到头绘制，头在最上层）
  for (let i = snake.body.length - 1; i >= 1; i--) {
    const p = snake.body[i]
    const x = offsetX + p.x * cell
    const y = offsetY + p.y * cell
    ctx.fillStyle = bodyColor
    if (opts.pixelStyle) {
      ctx.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2)
    } else {
      ctx.globalAlpha = i === snake.body.length - 1 ? 0.72 : 0.92
      roundRectPath(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, r)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  // 头
  const head = snake.body[0]
  const hx = offsetX + head.x * cell
  const hy = offsetY + head.y * cell
  ctx.fillStyle = headColor
  if (opts.pixelStyle) {
    ctx.fillRect(hx, hy, cell, cell)
  } else {
    roundRectPath(ctx, hx + 0.5, hy + 0.5, cell - 1, cell - 1, r)
    ctx.fill()
  }
  // 眼睛
  if (snake.alive && cell >= 8) {
    ctx.fillStyle = '#0b1020'
    for (const [ex, ey] of EYES[snake.direction]) {
      const dotR = Math.max(1, cell * 0.08)
      ctx.beginPath()
      ctx.arc(hx + ex * cell, hy + ey * cell, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 护盾光环
  if (snake.alive && snake.shield > 0 && !opts.pixelStyle) {
    ctx.strokeStyle = opts.theme.powerups.shield
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.85
    roundRectPath(ctx, hx - 1, hy - 1, cell + 2, cell + 2, r + 1)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cssWidth: number,
  cssHeight: number,
  timeMs: number,
  opts: DrawOptions,
): void {
  const { width, height, wrap } = state.config
  const layout = computeLayout(cssWidth, cssHeight, width, height)
  const { cell, offsetX, offsetY } = layout
  const t = opts.theme

  ctx.clearRect(0, 0, cssWidth, cssHeight)
  // 棋盘底
  ctx.fillStyle = t.boardBg
  ctx.fillRect(offsetX, offsetY, cell * width, cell * height)
  // 网格
  ctx.strokeStyle = t.gridLine
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 1; x < width; x++) {
    ctx.moveTo(offsetX + x * cell + 0.5, offsetY)
    ctx.lineTo(offsetX + x * cell + 0.5, offsetY + height * cell)
  }
  for (let y = 1; y < height; y++) {
    ctx.moveTo(offsetX, offsetY + y * cell + 0.5)
    ctx.lineTo(offsetX + width * cell, offsetY + y * cell + 0.5)
  }
  ctx.stroke()
  // 穿墙模式虚线边框提示
  if (wrap) {
    ctx.strokeStyle = t.path
    ctx.setLineDash([6, 4])
    ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, cell * width - 1, cell * height - 1)
    ctx.setLineDash([])
  }

  // AI 可视化图层
  const viz = opts.viz
  if (viz) {
    const drawCells = (cells: Position[], color: string): void => {
      ctx.fillStyle = color
      for (const p of cells) {
        if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue
        ctx.fillRect(offsetX + p.x * cell + 1, offsetY + p.y * cell + 1, cell - 2, cell - 2)
      }
    }
    if (opts.showExplored !== false) drawCells(viz.explored, t.explored)
    if (opts.showFrontier !== false) drawCells(viz.frontier, t.frontier)
    if (opts.showPath !== false && viz.path.length > 0) {
      ctx.strokeStyle = t.path
      ctx.lineWidth = Math.max(2, cell * 0.18)
      ctx.setLineDash([cell * 0.4, cell * 0.3])
      ctx.beginPath()
      const head = state.snakes[0]?.body[0]
      if (head) ctx.moveTo(offsetX + head.x * cell + cell / 2, offsetY + head.y * cell + cell / 2)
      for (const p of viz.path) {
        ctx.lineTo(offsetX + p.x * cell + cell / 2, offsetY + p.y * cell + cell / 2)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 墙
  ctx.fillStyle = t.wall
  ctx.strokeStyle = t.wallStroke
  ctx.lineWidth = 1
  for (const wall of state.config.walls) {
    const x = offsetX + wall.x * cell
    const y = offsetY + wall.y * cell
    if (opts.pixelStyle) {
      ctx.fillRect(x, y, cell, cell)
    } else {
      roundRectPath(ctx, x + 1, y + 1, cell - 2, cell - 2, Math.max(2, cell * 0.16))
      ctx.fill()
      ctx.stroke()
    }
  }

  // 食物（呼吸动画）
  const breath = opts.reducedMotion ? 0 : Math.sin(timeMs / 300) * 0.5 + 0.5
  for (const food of state.foods) {
    const cx = offsetX + food.position.x * cell + cell / 2
    const cy = offsetY + food.position.y * cell + cell / 2
    const base = cell * (food.kind === 'special' ? 0.38 : 0.3)
    const radius = base * (0.88 + breath * 0.24)
    if (!opts.pixelStyle) {
      ctx.shadowColor = food.kind === 'special' ? t.specialFood : t.foodGlow
      ctx.shadowBlur = 8 + breath * 6
    }
    ctx.fillStyle = food.kind === 'special' ? t.specialFood : t.food
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 道具
  const glyphs: Record<string, string> = { speed: '⚡', slow: '🐢', double: '×2', shield: '🛡' }
  for (const p of state.powerups) {
    const x = offsetX + p.position.x * cell
    const y = offsetY + p.position.y * cell
    ctx.fillStyle = t.powerups[p.kind] ?? '#fff'
    if (opts.pixelStyle) {
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
    } else {
      roundRectPath(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, Math.max(2, cell * 0.2))
      ctx.fill()
    }
    if (cell >= 14) {
      ctx.fillStyle = '#0b1020'
      ctx.font = `bold ${Math.floor(cell * 0.5)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(glyphs[p.kind] ?? '?', x + cell / 2, y + cell / 2 + 1)
    }
  }

  // 蛇
  for (let i = 0; i < state.snakes.length; i++) {
    drawSnake(ctx, state, i, layout, opts)
  }
}

/** 静态地图预览（关卡/编辑器列表用） */
export function drawMapPreview(
  ctx: CanvasRenderingContext2D,
  walls: Position[],
  width: number,
  height: number,
  cssWidth: number,
  cssHeight: number,
  theme: ThemeColors,
  spawns?: { single?: Position; p1?: Position; p2?: Position },
): void {
  const layout = computeLayout(cssWidth, cssHeight, width, height)
  const { cell, offsetX, offsetY } = layout
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = theme.boardBg
  ctx.fillRect(offsetX, offsetY, cell * width, cell * height)
  ctx.fillStyle = theme.wall
  for (const w of walls) {
    ctx.fillRect(offsetX + w.x * cell, offsetY + w.y * cell, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5))
  }
  if (spawns) {
    const dot = (p: Position | undefined, color: string): void => {
      if (!p) return
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(offsetX + p.x * cell + cell / 2, offsetY + p.y * cell + cell / 2, Math.max(1.5, cell * 0.32), 0, Math.PI * 2)
      ctx.fill()
    }
    dot(spawns.p1, '#22d3ee')
    dot(spawns.p2, '#fb923c')
    dot(spawns.single, '#34d399')
  }
  ctx.strokeStyle = theme.gridLine
  ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, cell * width - 1, cell * height - 1)
}

export { keyOf }
