import type { DashboardStatus } from "./api.js";

export type SystemHealth = "healthy" | "warning" | "unavailable";

export function systemHealth(status: DashboardStatus): SystemHealth {
  if (!status.storage.database.available) return "unavailable";
  if (
    !status.security.dashboardLoopback
    || status.security.publicAdminRoutes !== "absent"
    || status.allowedRootStatus.some((root) => !root.available)
    || status.providers.some((provider) => !provider.available)
    || (status.storage.retention?.truncatedRuns ?? 0) > 0
  ) {
    return "warning";
  }
  return "healthy";
}

export function formatSanitizedDiagnostics(status: DashboardStatus): string {
  const availableProviders = status.providers.filter((provider) => provider.available).length;
  const cooldownProviders = status.providers.filter((provider) => provider.state === "cooldown").length;
  const unavailableProviders = status.providers.length - availableProviders - cooldownProviders;
  const rootsAvailable = status.allowedRootStatus.filter((root) => root.available).length;
  const retention = status.storage.retention;
  return [
    `dpkr helix ${status.service.version}`,
    `MCP local: ${status.mcp.localUrl}`,
    `Public host: ${status.mcp.publicHost}`,
    `Dashboard local: ${status.dashboard.url}`,
    `Dashboard boundary: ${status.security.dashboardLoopback ? "loopback" : "not loopback"}`,
    `Public admin routes: ${status.security.publicAdminRoutes}`,
    `Session: ${status.security.dashboardSession}`,
    `Allowed roots: ${rootsAvailable}/${status.allowedRootStatus.length} available`,
    `Providers: ${availableProviders} available, ${cooldownProviders} cooldown, ${unavailableProviders} unavailable`,
    `Database: ${status.storage.database.available ? "available" : "unavailable"} (${status.storage.database.path})`,
    `Schema: ${status.storage.database.schemaVersion ?? "unknown"}/${status.storage.database.latestSchemaVersion}`,
    retention
      ? `Retention: ${retention.retainedRuns}/${retention.completedRunRetention} runs, ${retention.truncatedRuns} truncated`
      : "Retention: unavailable",
    status.storage.workspaces
      ? `Workspaces: ${status.storage.workspaces.activeSessions} active, ${status.storage.workspaces.archivedSessions} archived, ${status.storage.workspaces.eligibleForArchive} eligible`
      : "Workspaces: unavailable",
    "Project mutations: local dashboard only",
    "Next check: run `devspace doctor` for command-line diagnostics.",
  ].join("\n");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KiB`;
  return `${Math.round(bytes / (1_024 * 1_024))} MiB`;
}
