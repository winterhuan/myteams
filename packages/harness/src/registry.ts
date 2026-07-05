import type { EngineAdapter } from "./types.ts";
import { StubAdapter } from "./stub.ts";

export class EngineRegistry {
  private readonly adapters = new Map<string, EngineAdapter>();

  constructor() {
    this.register(new StubAdapter());
  }

  register(adapter: EngineAdapter): void {
    this.adapters.set(adapter.engine, adapter);
  }

  get(engine: string): EngineAdapter | undefined {
    return this.adapters.get(engine);
  }

  async listAvailable(): Promise<string[]> {
    const available: string[] = [];
    for (const adapter of this.adapters.values()) {
      if (await adapter.isAvailable()) available.push(adapter.engine);
    }
    return available;
  }
}