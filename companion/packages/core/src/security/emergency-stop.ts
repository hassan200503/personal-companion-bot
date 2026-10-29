export class EmergencyStop {
  private readonly controllers = new Set<AbortController>();
  private stopped = false;

  arm(controller: AbortController): () => void {
    if (this.stopped) {
      controller.abort(new Error('emergency_stop'));
      return () => undefined;
    }

    this.controllers.add(controller);
    return () => {
      this.controllers.delete(controller);
    };
  }

  stopAll(reason: string = 'emergency_stop'): number {
    this.stopped = true;
    const count = this.controllers.size;
    for (const controller of this.controllers) {
      try {
        controller.abort(new Error(reason));
      } catch {
        // Aborting must not throw in the stop path.
      }
    }
    this.controllers.clear();
    return count;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  reset(): void {
    this.stopped = false;
    this.controllers.clear();
  }
}
