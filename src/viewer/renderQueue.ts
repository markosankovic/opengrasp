export type RenderJob = (signal: AbortSignal) => Promise<void>

/**
 * Runs page renders one at a time, in this order (SPEC.md §4.7): visible pages top to bottom,
 * then pages below the viewport, then pages above it, nearest first.
 */
export class RenderQueue {
  private pending = new Map<number, RenderJob>()
  private running: { page: number; controller: AbortController } | null = null
  private first = 1
  private last = 1

  setVisibleRange(first: number, last: number): void {
    this.first = first
    this.last = last
  }

  schedule(page: number, job: RenderJob): void {
    this.cancel(page)
    this.pending.set(page, job)
    this.pump()
  }

  cancel(page: number): void {
    this.pending.delete(page)
    if (this.running?.page === page) this.running.controller.abort()
  }

  private priority(page: number): number {
    if (page >= this.first && page <= this.last) return page - this.first
    if (page > this.last) return 1000 + (page - this.last) * 2
    return 1001 + (this.first - page) * 2
  }

  private pump(): void {
    if (this.running || this.pending.size === 0) return
    let next = 0
    let best = Infinity
    for (const page of this.pending.keys()) {
      const p = this.priority(page)
      if (p < best) {
        best = p
        next = page
      }
    }
    const job = this.pending.get(next)!
    this.pending.delete(next)
    const controller = new AbortController()
    this.running = { page: next, controller }
    job(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(`Rendering page ${next} failed`, error)
      })
      .finally(() => {
        this.running = null
        this.pump()
      })
  }
}
