import type { ToolDefinition, ToolRegistry } from './contracts.js';

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  private key(name: string, version?: string): string {
    return version ? `${name}@${version}` : name;
  }

  register(tool: ToolDefinition<unknown, unknown>): void {
    if (tool.riskClass === 4) {
      throw new Error(`Tool ${tool.name} is Class 4 (restricted) and cannot be registered`);
    }
    this.tools.set(this.key(tool.name, tool.version), tool);
  }

  unregister(name: string, version?: string): void {
    if (version) {
      this.tools.delete(this.key(name, version));
      return;
    }
    for (const [k, t] of this.tools) {
      if (t.name === name) this.tools.delete(k);
    }
  }

  get(name: string, version?: string): ToolDefinition<unknown, unknown> | null {
    if (version) return this.tools.get(this.key(name, version)) ?? null;
    // latest by insertion order: find last registered with name
    let found: ToolDefinition<unknown, unknown> | null = null;
    for (const t of this.tools.values()) {
      if (t.name === name) found = t;
    }
    return found;
  }

  list(): ToolDefinition<unknown, unknown>[] {
    return [...this.tools.values()];
  }
}

