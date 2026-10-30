export interface SchedulerJob {
  id: string;
  intervalMs: number;
  run: () => Promise<void> | void;
  enabled?: boolean;
}

export interface Scheduler {
  register(job: SchedulerJob): void;
  unregister(id: string): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
  runOnce(id: string): Promise<void>;
}

export class DefaultScheduler implements Scheduler {
  private readonly jobs = new Map<string, SchedulerJob>();
  private timers = new Map<string, NodeJS.Timeout>();
  private running = false;

  register(job: SchedulerJob): void {
    this.jobs.set(job.id, job);
    if (this.running && (job.enabled ?? true)) this.schedule(job);
  }

  unregister(id: string): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    this.jobs.delete(id);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const job of this.jobs.values()) {
      if (job.enabled ?? true) this.schedule(job);
    }
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  async runOnce(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) throw new Error('unknown_job');
    await job.run();
  }

  private schedule(job: SchedulerJob): void {
    const tick = async () => {
      try {
        await job.run();
      } catch {
        // swallow; scheduler must not crash
      }
      if (this.running && this.jobs.has(job.id)) {
        const t = setTimeout(tick, job.intervalMs);
        this.timers.set(job.id, t);
      }
    };
    const t = setTimeout(tick, job.intervalMs);
    this.timers.set(job.id, t);
  }
}

export interface ReflectionLoopOptions {
  maxIterations: number;
  maxDurationMs: number;
  /**
   * Optional per-tick work. Return false to stop early as 'completed'.
   * Keep this local, bounded, and free of network or unbounded writes.
   */
  onIteration?: (i: number) => Promise<boolean | void> | (boolean | void);
}

/**
 * Bounded background consolidation loop.
 * Caps iterations and wall time so reflection cannot run away.
 * Default body is a safe no-op; callers may supply onIteration for light
 * owner-model note merge or similar local consolidation.
 */
export class BoundedReflectionLoop {
  constructor(private readonly options: ReflectionLoopOptions) {}

  async run(): Promise<{ iterations: number; stoppedReason: 'completed' | 'max_iterations' | 'timeout' | 'cancelled' }> {
    const start = Date.now();
    let iterations = 0;
    for (let i = 0; i < this.options.maxIterations; i++) {
      if (Date.now() - start > this.options.maxDurationMs) {
        return { iterations, stoppedReason: 'timeout' };
      }
      iterations = i + 1;
      // Safe default: tick without side effects when onIteration is omitted.
      let cont: boolean | void = true;
      if (this.options.onIteration) {
        cont = await this.options.onIteration(i);
      }
      if (cont === false) {
        return { iterations, stoppedReason: 'completed' };
      }
    }
    return { iterations, stoppedReason: 'max_iterations' };
  }
}