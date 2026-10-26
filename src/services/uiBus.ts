/** 轻量 UI 事件总线：成就解锁 Toast 等跨组件通知 */
export interface Toast {
  id: number
  title: string
  message: string
  kind: 'achievement' | 'info' | 'error'
}

type Listener = (toast: Toast) => void

let nextId = 1
const listeners = new Set<Listener>()

export const uiBus = {
  onToast(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  push(toast: Omit<Toast, 'id'>): void {
    const t: Toast = { ...toast, id: nextId++ }
    for (const l of listeners) l(t)
  },
}
