/** 地图编辑器的撤销/重做历史栈（有限深度） */
export interface EditorSnapshot {
  walls: string[]
  foodZone: string[] | null
  spawns: {
    single?: { x: number; y: number }
    p1?: { x: number; y: number }
    p2?: { x: number; y: number }
  }
}

export class EditorHistory {
  private undoStack: EditorSnapshot[] = []
  private redoStack: EditorSnapshot[] = []

  constructor(
    private readonly capture: () => EditorSnapshot,
    private readonly restore: (s: EditorSnapshot) => void,
    private readonly maxDepth = 50,
  ) {}

  /** 在执行一次修改前调用：记录当前状态 */
  commit(): void {
    this.undoStack.push(this.capture())
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift()
    this.redoStack = []
  }

  undo(): boolean {
    const snap = this.undoStack.pop()
    if (!snap) return false
    this.redoStack.push(this.capture())
    this.restore(snap)
    return true
  }

  redo(): boolean {
    const snap = this.redoStack.pop()
    if (!snap) return false
    this.undoStack.push(this.capture())
    this.restore(snap)
    return true
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
