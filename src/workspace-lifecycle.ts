import type {
  WorkspaceConversationBinding,
  WorkspaceSession,
} from "./workspace-store.js";

export const DEFAULT_WORKSPACE_ARCHIVE_AFTER_DAYS = 7;

export interface WorkspaceArchiveCandidate {
  id: string;
  lastUsedAt: string;
}

export interface WorkspaceLifecycleSummary {
  archiveAfterDays: number;
  totalSessions: number;
  activeSessions: number;
  archivedSessions: number;
  checkoutSessions: number;
  worktreeSessions: number;
  distinctRoots: number;
  boundSessions: number;
  protectedSessions: number;
  ephemeralSessions: number;
  eligibleForArchive: number;
  createdLast24Hours: number;
  createdLast7Days: number;
  oldestLastUsedAt?: string;
  newestLastUsedAt?: string;
}

export interface WorkspaceLifecycleAnalysis {
  summary: WorkspaceLifecycleSummary;
  archiveCandidates: WorkspaceArchiveCandidate[];
}

export function analyzeWorkspaceLifecycle(input: {
  sessions: readonly WorkspaceSession[];
  bindings: readonly WorkspaceConversationBinding[];
  protectedWorkspaceIds?: ReadonlySet<string>;
  now?: number;
  archiveAfterDays?: number;
}): WorkspaceLifecycleAnalysis {
  const now = input.now ?? Date.now();
  const archiveAfterDays = Math.max(
    1,
    Math.floor(input.archiveAfterDays ?? DEFAULT_WORKSPACE_ARCHIVE_AFTER_DAYS),
  );
  const archiveBefore = now - archiveAfterDays * 24 * 60 * 60 * 1_000;
  const boundWorkspaceIds = new Set(input.bindings.map((binding) => binding.workspaceSessionId));
  const protectedWorkspaceIds = input.protectedWorkspaceIds ?? new Set<string>();
  const archiveCandidates: WorkspaceArchiveCandidate[] = [];
  const roots = new Set<string>();
  let oldestLastUsedAt: string | undefined;
  let newestLastUsedAt: string | undefined;
  let activeSessions = 0;
  let archivedSessions = 0;
  let checkoutSessions = 0;
  let worktreeSessions = 0;
  let boundSessions = 0;
  let protectedSessions = 0;
  let ephemeralSessions = 0;
  let createdLast24Hours = 0;
  let createdLast7Days = 0;

  for (const session of input.sessions) {
    roots.add(workspaceRootKey(session.root));
    if (session.status === "active") activeSessions += 1;
    else if (session.status === "archived") archivedSessions += 1;
    if (session.mode === "worktree") worktreeSessions += 1;
    else checkoutSessions += 1;
    if (boundWorkspaceIds.has(session.id)) boundSessions += 1;
    if (protectedWorkspaceIds.has(session.id)) protectedSessions += 1;
    if (isEphemeralWorkspaceRoot(session.root)) ephemeralSessions += 1;

    const createdAt = Date.parse(session.createdAt);
    if (Number.isFinite(createdAt)) {
      if (createdAt >= now - 24 * 60 * 60 * 1_000) createdLast24Hours += 1;
      if (createdAt >= now - 7 * 24 * 60 * 60 * 1_000) createdLast7Days += 1;
    }
    const lastUsedAt = Date.parse(session.lastUsedAt);
    if (Number.isFinite(lastUsedAt)) {
      if (!oldestLastUsedAt || session.lastUsedAt < oldestLastUsedAt) {
        oldestLastUsedAt = session.lastUsedAt;
      }
      if (!newestLastUsedAt || session.lastUsedAt > newestLastUsedAt) {
        newestLastUsedAt = session.lastUsedAt;
      }
    }

    if (
      session.status === "active"
      && session.mode === "checkout"
      && Number.isFinite(lastUsedAt)
      && lastUsedAt < archiveBefore
      && !boundWorkspaceIds.has(session.id)
      && !protectedWorkspaceIds.has(session.id)
    ) {
      archiveCandidates.push({ id: session.id, lastUsedAt: session.lastUsedAt });
    }
  }

  return {
    summary: {
      archiveAfterDays,
      totalSessions: input.sessions.length,
      activeSessions,
      archivedSessions,
      checkoutSessions,
      worktreeSessions,
      distinctRoots: roots.size,
      boundSessions,
      protectedSessions,
      ephemeralSessions,
      eligibleForArchive: archiveCandidates.length,
      createdLast24Hours,
      createdLast7Days,
      oldestLastUsedAt,
      newestLastUsedAt,
    },
    archiveCandidates,
  };
}

function workspaceRootKey(root: string): string {
  return process.platform === "win32"
    ? root.toLocaleLowerCase("en-US")
    : root;
}

function isEphemeralWorkspaceRoot(root: string): boolean {
  return /(?:^|[\\/])(?:\.tmp|temp)(?:[\\/]|$)/i.test(root);
}
