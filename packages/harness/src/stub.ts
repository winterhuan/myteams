import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  AgentMessage,
  AgentSession,
  AgentSessionOptions,
  EngineAdapter,
} from "./types.ts";

export class StubAdapter implements EngineAdapter {
  readonly engine = "stub";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async createSession(options: AgentSessionOptions): Promise<AgentSession> {
    const id = randomUUID();
    let aborted = false;

    return {
      id,
      abort() {
        aborted = true;
      },
      async *prompt(messages: AgentMessage[]): AsyncIterable<AgentEvent> {
        if (aborted) {
          yield { type: "error", error: "aborted" };
          return;
        }
        const last = messages.at(-1)?.content ?? "";
        yield {
          type: "text",
          content: `[stub:${options.memberId}] Acknowledged (${last.length} chars). Phase 1 uses stub until Pi RPC is wired.`,
        };
        yield { type: "done" };
      },
    };
  }
}