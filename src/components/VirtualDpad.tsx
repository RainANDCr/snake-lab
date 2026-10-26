import { Direction } from '../game/core/types'
import { audio } from '../services/audio'

/** 可选虚拟方向键（触屏备用方案） */
export function VirtualDpad({ onDirection, color }: { onDirection: (d: Direction) => void; color?: string }) {
  const press = (d: Direction) => () => {
    audio.unlock()
    audio.click()
    onDirection(d)
  }
  return (
    <div className="dpad" style={color ? ({ '--dpad-color': color } as React.CSSProperties) : undefined}>
      <button className="dpad-btn dpad-up" onPointerDown={press('up')} aria-label="上">
        ▲
      </button>
      <button className="dpad-btn dpad-left" onPointerDown={press('left')} aria-label="左">
        ◀
      </button>
      <button className="dpad-btn dpad-right" onPointerDown={press('right')} aria-label="右">
        ▶
      </button>
      <button className="dpad-btn dpad-down" onPointerDown={press('down')} aria-label="下">
        ▼
      </button>
    </div>
  )
}
