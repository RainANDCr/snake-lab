import { useEffect } from 'react'
import { MapData } from '../game/maps/validation'
import { THEME_COLORS, ThemeName } from '../styles/themes'
import { drawMapPreview } from './draw'
import { GameCanvas } from './GameCanvas'

interface BoardPreviewProps {
  map: Pick<MapData, 'width' | 'height' | 'walls' | 'spawns'>
  themeName?: ThemeName
  className?: string
}

export function BoardPreview({ map, themeName = 'neon', className }: BoardPreviewProps) {
  return (
    <GameCanvas
      className={`board-preview ${className ?? ''}`}
      repaintKey={`${map.width}x${map.height}:${map.walls.length}:${Object.keys(map.spawns).join()}`}
      onPaint={(ctx, w, h) => {
        drawMapPreview(ctx, map.walls, map.width, map.height, w, h, THEME_COLORS[themeName], map.spawns)
      }}
    />
  )
}

/** 键盘方向输入：返回按下的方向，父组件决定路由给哪条蛇 */
export type DirectionKeyHandler = (dir: 'up' | 'down' | 'left' | 'right') => void

const KEY_DIRS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

export function useDirectionKeys(handler: DirectionKeyHandler, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      const dir = KEY_DIRS[e.code]
      if (dir) {
        e.preventDefault()
        handler(dir)
      }
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [handler, enabled])
}
