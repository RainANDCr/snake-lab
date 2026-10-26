import { ForwardedRef, forwardRef, useEffect, useRef } from 'react'

/**
 * 高清自适应 Canvas：按 devicePixelRatio 设置物理像素，CSS 尺寸由容器决定。
 * 绘制由父组件的渲染循环驱动（渲染与模拟分离）。
 */
export interface GameCanvasProps {
  className?: string
  onPaint?: (ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number, timeMs: number) => void
  /** 依赖变化时触发一次重绘（静态画布用） */
  repaintKey?: string | number
}

export const GameCanvas = forwardRef<HTMLCanvasElement, GameCanvasProps>(function GameCanvas(
  { className, onPaint, repaintKey },
  ref: ForwardedRef<HTMLCanvasElement>,
) {
  const innerRef = useRef<HTMLCanvasElement | null>(null)
  const paintRef = useRef(onPaint)
  paintRef.current = onPaint

  useEffect(() => {
    const canvas = innerRef.current
    if (!canvas) return
    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      // 立即重绘一帧
      const ctx = canvas.getContext('2d')
      if (ctx && paintRef.current) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        paintRef.current(ctx, rect.width, rect.height, performance.now())
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = innerRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !paintRef.current) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintRef.current(ctx, rect.width, rect.height, performance.now())
  }, [repaintKey])

  return <canvas ref={(el) => { innerRef.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el }} className={className} />
})
