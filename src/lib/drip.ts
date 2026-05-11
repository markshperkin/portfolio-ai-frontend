/**
 * Drip queue: enqueue tokens, release one character every 20ms to a callback.
 * Ensures char-by-char rendering regardless of how tokens arrive.
 */
export class DripQueue {
  private queue: string[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private onChar: (char: string) => void
  private onDrain?: () => void

  constructor(onChar: (char: string) => void, onDrain?: () => void) {
    this.onChar = onChar
    this.onDrain = onDrain
  }

  enqueue(text: string) {
    for (const char of text) {
      this.queue.push(char)
    }
    if (!this.timer) {
      this.timer = setInterval(() => this._tick(), 5)
    }
  }

  private _tick() {
    if (this.queue.length === 0) {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
      this.onDrain?.()
      return
    }
    // Emit extra chars per tick when queue is large so we never fall behind
    const batch = Math.max(1, Math.ceil(this.queue.length / 80))
    for (let i = 0; i < batch && this.queue.length > 0; i++) {
      this.onChar(this.queue.shift()!)
    }
  }

  flush() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    while (this.queue.length > 0) {
      this.onChar(this.queue.shift()!)
    }
    this.onDrain?.()
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.queue = []
  }
}
