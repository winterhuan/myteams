export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AgentEvent {
  type: "text" | "tool_call" | "done" | "error";
  content?: string;
  error?: string;
}

export interface AgentSessionOptions {
  memberId: string;
  engine: string;
  model?: string;
  cwd?: string;
}

export interface AgentSession {
  readonly id: string;
  prompt(messages: AgentMessage[]): AsyncIterable<AgentEvent>;
  abort(): void;
}

export interface EngineAdapter {
  readonly engine: string;
  createSession(options: AgentSessionOptions): Promise<AgentSession>;
  isAvailable(): Promise<boolean>;
}