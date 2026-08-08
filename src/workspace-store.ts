import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { openDatabase, type DatabaseHandle } from "./db/client.js";
import {
  workspaceConversationBindings,
  workspaceSessions,
  type WorkspaceConversationBindingRow,
  type WorkspaceSessionRow,
} from "./db/schema.js";
import { resolve } from "node:path";
import { isPathInsideRoot } from "./roots.js";

export type WorkspaceMode = "checkout" | "worktree";

export interface WorkspaceSession {
  id: string;
  root: string;
  projectId?: string;
  status: string;
  mode: WorkspaceMode;
  sourceRoot?: string;
  baseRef?: string;
  baseSha?: string;
  managed: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export interface WorkspaceConversationBinding {
  conversationScopeId: string;
  targetKey: string;
  workspaceSessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface WorkspaceStore {
  createSession(input: {
    id: string;
    root: string;
    projectId?: string;
    mode?: WorkspaceMode;
    sourceRoot?: string;
    baseRef?: string;
    baseSha?: string;
    managed?: boolean;
  }): WorkspaceSession;
  getSession(id: string): WorkspaceSession | undefined;
  findSessionByRoot(root: string): WorkspaceSession | undefined;
  listSessions(): WorkspaceSession[];
  touchSession(id: string): void;
  archiveSessions(candidates: readonly { id: string; lastUsedAt: string }[]): number;
  getConversationBinding(
    conversationScopeId: string,
    targetKey: string,
  ): WorkspaceConversationBinding | undefined;
  setConversationBinding(input: {
    conversationScopeId: string;
    targetKey: string;
    workspaceSessionId: string;
  }): WorkspaceConversationBinding;
  touchConversationBinding(conversationScopeId: string, targetKey: string): void;
  deleteConversationBinding(conversationScopeId: string, targetKey: string): void;
  listConversationBindings(): WorkspaceConversationBinding[];
  close?(): void;
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  private readonly database: DatabaseHandle;

  constructor(stateDir: string) {
    this.database = openDatabase(stateDir);
  }

  createSession(input: {
    id: string;
    root: string;
    projectId?: string;
    mode?: WorkspaceMode;
    sourceRoot?: string;
    baseRef?: string;
    baseSha?: string;
    managed?: boolean;
  }): WorkspaceSession {
    const now = new Date().toISOString();
    const session: WorkspaceSession = {
      id: input.id,
      root: input.root,
      projectId: input.projectId,
      status: "active",
      mode: input.mode ?? "checkout",
      sourceRoot: input.sourceRoot,
      baseRef: input.baseRef,
      baseSha: input.baseSha,
      managed: input.managed ?? false,
      createdAt: now,
      lastUsedAt: now,
    };

    this.database.db
      .insert(workspaceSessions)
      .values({
        id: session.id,
        root: session.root,
        projectId: session.projectId ?? null,
        status: session.status,
        mode: session.mode,
        sourceRoot: session.sourceRoot ?? null,
        baseRef: session.baseRef ?? null,
        baseSha: session.baseSha ?? null,
        managed: String(session.managed),
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      })
      .run();

    return session;
  }

  getSession(id: string): WorkspaceSession | undefined {
    const row = this.database.db
      .select()
      .from(workspaceSessions)
      .where(eq(workspaceSessions.id, id))
      .get();

    return row ? rowToWorkspaceSession(row) : undefined;
  }

  findSessionByRoot(root: string): WorkspaceSession | undefined {
    const resolvedRoot = resolve(root);
    const rows = this.database.db
      .select()
      .from(workspaceSessions)
      .orderBy(desc(workspaceSessions.lastUsedAt))
      .all();
    const row = rows.find((candidate) =>
      candidate.status === "active" && sameWorkspaceRoot(candidate.root, resolvedRoot)
    ) ?? rows.find((candidate) => sameWorkspaceRoot(candidate.root, resolvedRoot));

    return row ? rowToWorkspaceSession(row) : undefined;
  }

  listSessions(): WorkspaceSession[] {
    return this.database.db
      .select()
      .from(workspaceSessions)
      .orderBy(desc(workspaceSessions.lastUsedAt))
      .all()
      .map(rowToWorkspaceSession);
  }

  touchSession(id: string): void {
    this.database.db
      .update(workspaceSessions)
      .set({ status: "active", lastUsedAt: new Date().toISOString() })
      .where(eq(workspaceSessions.id, id))
      .run();
  }

  archiveSessions(candidates: readonly { id: string; lastUsedAt: string }[]): number {
    if (candidates.length === 0) return 0;
    const update = this.database.sqlite.prepare(`
      update workspace_sessions
      set status = 'archived'
      where id = ?
        and status = 'active'
        and mode = 'checkout'
        and last_used_at = ?
        and not exists (
          select 1 from workspace_conversation_bindings
          where workspace_session_id = workspace_sessions.id
        )
        and not exists (
          select 1 from operation_runs
          where workspace_id = workspace_sessions.id
            and state in ('queued', 'running', 'blocked', 'stopping')
        )
        and not exists (
          select 1 from local_agent_sessions
          where workspace_id = workspace_sessions.id
            and status in ('starting', 'running')
            and coalesce(disposition, '') != 'needs_input'
        )
    `);
    const archive = this.database.sqlite.transaction(() => {
      let archived = 0;
      for (const candidate of candidates) {
        archived += update.run(candidate.id, candidate.lastUsedAt).changes;
      }
      return archived;
    });
    return archive.immediate();
  }

  getConversationBinding(
    conversationScopeId: string,
    targetKey: string,
  ): WorkspaceConversationBinding | undefined {
    const storedScopeId = workspaceConversationScopeStorageKey(conversationScopeId);
    const row = this.database.db
      .select()
      .from(workspaceConversationBindings)
      .where(
        and(
          eq(workspaceConversationBindings.conversationScopeId, storedScopeId),
          eq(workspaceConversationBindings.targetKey, targetKey),
        ),
      )
      .get();

    return row ? rowToWorkspaceConversationBinding(row) : undefined;
  }

  setConversationBinding(input: {
    conversationScopeId: string;
    targetKey: string;
    workspaceSessionId: string;
  }): WorkspaceConversationBinding {
    const now = new Date().toISOString();
    const storedScopeId = workspaceConversationScopeStorageKey(input.conversationScopeId);
    const row = this.database.db
      .insert(workspaceConversationBindings)
      .values({
        conversationScopeId: storedScopeId,
        targetKey: input.targetKey,
        workspaceSessionId: input.workspaceSessionId,
        createdAt: now,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          workspaceConversationBindings.conversationScopeId,
          workspaceConversationBindings.targetKey,
        ],
        set: {
          workspaceSessionId: input.workspaceSessionId,
          lastUsedAt: now,
        },
      })
      .returning()
      .get();

    if (!row) {
      throw new Error("Conversation workspace binding upsert returned no row.");
    }

    return rowToWorkspaceConversationBinding(row);
  }

  touchConversationBinding(conversationScopeId: string, targetKey: string): void {
    const storedScopeId = workspaceConversationScopeStorageKey(conversationScopeId);
    this.database.db
      .update(workspaceConversationBindings)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(
        and(
          eq(workspaceConversationBindings.conversationScopeId, storedScopeId),
          eq(workspaceConversationBindings.targetKey, targetKey),
        ),
      )
      .run();
  }

  deleteConversationBinding(conversationScopeId: string, targetKey: string): void {
    const storedScopeId = workspaceConversationScopeStorageKey(conversationScopeId);
    this.database.db
      .delete(workspaceConversationBindings)
      .where(
        and(
          eq(workspaceConversationBindings.conversationScopeId, storedScopeId),
          eq(workspaceConversationBindings.targetKey, targetKey),
        ),
      )
      .run();
  }

  listConversationBindings(): WorkspaceConversationBinding[] {
    return this.database.db
      .select()
      .from(workspaceConversationBindings)
      .orderBy(desc(workspaceConversationBindings.lastUsedAt))
      .all()
      .map(rowToWorkspaceConversationBinding);
  }

  close(): void {
    this.database.close();
  }

}

export function createWorkspaceStore(stateDir: string): WorkspaceStore {
  return new SqliteWorkspaceStore(stateDir);
}

export function workspaceConversationScopeStorageKey(
  conversationScopeId: string,
): string {
  return `sha256:${createHash("sha256").update(conversationScopeId).digest("hex")}`;
}

function sameWorkspaceRoot(first: string, second: string): boolean {
  return isPathInsideRoot(first, second) && isPathInsideRoot(second, first);
}

function rowToWorkspaceSession(row: WorkspaceSessionRow): WorkspaceSession {
  return {
    id: row.id,
    root: row.root,
    projectId: row.projectId ?? undefined,
    status: row.status,
    mode: row.mode === "worktree" ? "worktree" : "checkout",
    sourceRoot: row.sourceRoot ?? undefined,
    baseRef: row.baseRef ?? undefined,
    baseSha: row.baseSha ?? undefined,
    managed: row.managed === "true",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

function rowToWorkspaceConversationBinding(
  row: WorkspaceConversationBindingRow,
): WorkspaceConversationBinding {
  return {
    conversationScopeId: row.conversationScopeId,
    targetKey: row.targetKey,
    workspaceSessionId: row.workspaceSessionId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}
