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
      this.timer = setInterval(() => this._tick(), 20)
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
    const char = this.queue.shift()!
    this.onChar(char)
  }

  flush() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    while (this.queue.length > 0) {
      this.onChar(this.queue.shift()!)
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.queue = []
  }
}
