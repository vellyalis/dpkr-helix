import assert from "node:assert/strict";
import type { DashboardStatus } from "./api.js";
import {
  formatBytes,
  formatSanitizedDiagnostics,
  systemHealth,
} from "./system-screen.js";

const status: DashboardStatus = {
  mcp: { localUrl: "http://127.0.0.1:7676/mcp", publicHost: "example.test" },
  dashboard: { enabled: true, url: "http://127.0.0.1:7677/" },
  allowedRoots: ["C:\\secret\\allowed"],
  allowedRootStatus: [{ path: "C:\\secret\\allowed", available: true }],
  discovery: { maxDepth: 4, maxDirectories: 5_000, timeoutMs: 10_000 },
  providers: [{ name: "codex", available: true, profileCount: 2 }],
  providerSummary: "available: codex",
  service: { version: "1.0.4", uptimeSeconds: 90 },
  security: {
    dashboardLoopback: true,
    publicAdminRoutes: "absent",
    dashboardSession: "authenticated",
    projectMutations: "local_only",
  },
  storage: {
    database: {
      available: true,
      path: "~/.local/share/devspace/devspace.sqlite",
      schemaVersion: 6,
      migrationCount: 6,
      latestSchemaVersion: 6,
    },
    retention: {
      maxEventsPerRun: 1_000,
      maxPayloadBytesPerRun: 4 * 1_024 * 1_024,
      completedRunRetention: 200,
      detailedCompletedRunRetention: 50,
      retainedRuns: 12,
      truncatedRuns: 0,
    },
  },
};

assert.equal(systemHealth(status), "healthy");
assert.equal(systemHealth({
  ...status,
  providers: [{ name: "codex", available: false, reason: "package not found", profileCount: 2 }],
}), "warning");
assert.equal(systemHealth({
  ...status,
  storage: {
    ...status.storage,
    database: { ...status.storage.database, available: false },
  },
}), "unavailable");

const diagnostics = formatSanitizedDiagnostics(status);
assert.match(diagnostics, /dpkr helix 1\.0\.4/);
assert.match(diagnostics, /Allowed roots: 1\/1 available/);
assert.doesNotMatch(diagnostics, /C:\\secret/);
assert.doesNotMatch(diagnostics, /token|cookie|environment/i);
assert.equal(formatBytes(4 * 1_024 * 1_024), "4 MiB");

console.log("dashboard system screen tests passed");
