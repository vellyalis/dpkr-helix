export interface ClosableMcpTransport {
  close(): Promise<void>;
}

export interface McpSessionCloseResult {
  sessionId: string;
  error?: unknown;
}

interface McpSessionEntry<TTransport> {
  transport: TTransport;
  lastActivityAt: number;
  activeRequests: number;
}

export interface McpSessionRegistryOptions {
  now?: () => number;
}

export class McpSessionRegistry<TTransport extends ClosableMcpTransport> {
  private readonly sessions = new Map<string, McpSessionEntry<TTransport>>();
  private readonly now: () => number;

  constructor(options: McpSessionRegistryOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.sessions.size;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  register(sessionId: string, transport: TTransport): void {
    this.sessions.set(sessionId, {
      transport,
      lastActivityAt: this.now(),
      activeRequests: 0,
    });
  }

  get(sessionId: string): TTransport | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;

    entry.lastActivityAt = this.now();
    return entry.transport;
  }

  beginRequest(sessionId: string): TTransport | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;

    entry.lastActivityAt = this.now();
    entry.activeRequests += 1;
    return entry.transport;
  }

  endRequest(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.activeRequests = Math.max(0, entry.activeRequests - 1);
  }

  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  async closeIdle(idleTimeoutMs: number): Promise<McpSessionCloseResult[]> {
    const cutoff = this.now() - idleTimeoutMs;
    const idleSessions: Array<{ sessionId: string; transport: TTransport }> = [];

    for (const [sessionId, entry] of this.sessions) {
      if (entry.activeRequests > 0 || entry.lastActivityAt > cutoff) continue;

      this.sessions.delete(sessionId);
      idleSessions.push({ sessionId, transport: entry.transport });
    }

    return closeSessions(idleSessions);
  }

  async closeExcess(maxSessions: number): Promise<McpSessionCloseResult[]> {
    if (!Number.isInteger(maxSessions) || maxSessions < 1) {
      throw new Error("MCP session capacity must be a positive integer.");
    }

    const excess = this.sessions.size - maxSessions;
    if (excess <= 0) return [];

    const oldestInactive = Array.from(this.sessions, ([sessionId, entry]) => ({
      sessionId,
      transport: entry.transport,
      lastActivityAt: entry.lastActivityAt,
      activeRequests: entry.activeRequests,
    }))
      .filter((entry) => entry.activeRequests === 0)
      .sort((left, right) => left.lastActivityAt - right.lastActivityAt)
      .slice(0, excess);

    for (const entry of oldestInactive) this.sessions.delete(entry.sessionId);
    return closeSessions(oldestInactive);
  }

  async closeAll(): Promise<McpSessionCloseResult[]> {
    const sessions = Array.from(this.sessions, ([sessionId, entry]) => ({
      sessionId,
      transport: entry.transport,
    }));
    this.sessions.clear();
    return closeSessions(sessions);
  }
}

async function closeSessions<TTransport extends ClosableMcpTransport>(
  sessions: Array<{ sessionId: string; transport: TTransport }>,
): Promise<McpSessionCloseResult[]> {
  return Promise.all(
    sessions.map(async ({ sessionId, transport }) => {
      try {
        await transport.close();
        return { sessionId };
      } catch (error) {
        return { sessionId, error };
      }
    }),
  );
}
