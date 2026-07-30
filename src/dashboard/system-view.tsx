import { useState } from "react";
import type { DashboardStatus } from "./api.js";
import {
  formatBytes,
  formatSanitizedDiagnostics,
  systemHealth,
} from "./system-screen.js";
import type { DashboardTheme } from "./shell.js";

interface SystemViewProps {
  status: DashboardStatus | null;
  ready: boolean;
  theme: DashboardTheme;
  onThemeChange(theme: DashboardTheme): void;
}

export function SystemView(props: SystemViewProps): React.JSX.Element {
  const [copyMessage, setCopyMessage] = useState<string>();
  if (!props.ready || !props.status) {
    return (
      <div className="system-screen">
        <div className="system-grid" aria-label="Loading system diagnostics">
          <AppearancePanel theme={props.theme} onThemeChange={props.onThemeChange} />
          {Array.from({ length: 6 }, (_, index) => <div className="panel system-skeleton" key={index} />)}
        </div>
      </div>
    );
  }
  const { status } = props;
  const health = systemHealth(status);

  async function copyDiagnostics(): Promise<void> {
    await navigator.clipboard.writeText(formatSanitizedDiagnostics(status));
    setCopyMessage("Sanitized diagnostics copied.");
  }

  return (
    <div className="system-screen">
      <section className={`system-health ${health}`} aria-label={`System status: ${health}`}>
        <div>
          <span className="eyebrow">System status</span>
          <h2>{health === "healthy" ? "Ready for local work" : health === "warning" ? "Ready with attention needed" : "Diagnostics unavailable"}</h2>
          <p>Runtime, local-admin boundary, roots, providers, storage, and retention are reported independently.</p>
        </div>
        <StatusBadge
          state={health === "healthy" ? "success" : health === "warning" ? "warning" : "danger"}
          label={health}
        />
      </section>

      <div className="system-grid">
        <AppearancePanel theme={props.theme} onThemeChange={props.onThemeChange} />

        <DiagnosticPanel title="Service" code="SVC">
          <Definition label="Version" value={status.service.version} mono />
          <Definition label="Uptime" value={formatUptime(status.service.uptimeSeconds)} />
          <Definition label="MCP local" value={status.mcp.localUrl} mono />
          <Definition label="Public host" value={status.mcp.publicHost} mono />
          <Definition label="Dashboard local" value={status.dashboard.url} mono />
          <Definition label="Connection" value="Connected" />
        </DiagnosticPanel>

        <DiagnosticPanel title="Security boundary" code="SEC">
          <BoundaryRow
            label="Dashboard listener"
            good={status.security.dashboardLoopback}
            value={status.security.dashboardLoopback ? "Loopback only" : "Not loopback"}
          />
          <BoundaryRow
            label="Public admin routes"
            good={status.security.publicAdminRoutes === "absent"}
            value={status.security.publicAdminRoutes === "absent" ? "Absent by design" : "Unknown"}
          />
          <BoundaryRow label="Dashboard session" good value="Authenticated" />
          <BoundaryRow label="Project mutations" good value="Local dashboard only" />
          <p className="diagnostic-note">Tokens, credentials, environment values, and raw logs are excluded.</p>
        </DiagnosticPanel>

        <DiagnosticPanel title="Allowed roots" code="ROOT">
          <ul className="diagnostic-list root-diagnostic-list">
            {status.allowedRootStatus.map((root) => (
              <li key={root.path}>
                <StatusBadge state={root.available ? "success" : "danger"} label={root.available ? "Available" : "Unavailable"} />
                <code>{root.path}</code>
              </li>
            ))}
          </ul>
          <p className="diagnostic-note">
            Scan bounds: depth {status.discovery.maxDepth}, {status.discovery.maxDirectories.toLocaleString()} directories, {status.discovery.timeoutMs / 1_000}s timeout.
          </p>
          <p className="diagnostic-note">Root changes stay in the established configuration workflow.</p>
        </DiagnosticPanel>

        <DiagnosticPanel title="Providers" code="AGT">
          <ul className="diagnostic-list">
            {status.providers.map((provider) => (
              <li key={provider.name}>
                <div>
                  <strong>{provider.name}</strong>
                  <small>{provider.profileCount} configured profile{provider.profileCount === 1 ? "" : "s"}</small>
                </div>
                <StatusBadge
                  state={provider.available ? "success" : "danger"}
                  label={provider.available ? "Available" : provider.reason ?? "Unavailable"}
                />
              </li>
            ))}
          </ul>
          {status.providers.length === 0 ? <p className="diagnostic-note">Local-agent providers are disabled.</p> : null}
        </DiagnosticPanel>

        <DiagnosticPanel title="Storage and retention" code="DB">
          <BoundaryRow
            label="Database"
            good={status.storage.database.available}
            value={status.storage.database.available ? "Available" : "Unavailable"}
          />
          <Definition label="Safe path" value={status.storage.database.path} mono />
          <Definition
            label="Schema"
            value={`${status.storage.database.schemaVersion ?? "Unknown"} / ${status.storage.database.latestSchemaVersion}`}
          />
          {status.storage.retention ? <>
            <Definition label="Retained runs" value={`${status.storage.retention.retainedRuns} / ${status.storage.retention.completedRunRetention}`} />
            <Definition label="Detailed runs" value={String(status.storage.retention.detailedCompletedRunRetention)} />
            <Definition label="Events / run" value={status.storage.retention.maxEventsPerRun.toLocaleString()} />
            <Definition label="Payload / run" value={formatBytes(status.storage.retention.maxPayloadBytesPerRun)} />
            <BoundaryRow
              label="Truncation"
              good={status.storage.retention.truncatedRuns === 0}
              value={status.storage.retention.truncatedRuns === 0
                ? "No retained run is truncated"
                : `${status.storage.retention.truncatedRuns} retained run(s) truncated`}
            />
          </> : <p className="diagnostic-note">Operation retention is unavailable.</p>}
        </DiagnosticPanel>

        <DiagnosticPanel title="Diagnostics" code="COPY">
          <p className="diagnostic-copy-intro">Copy a bounded summary safe for troubleshooting. It contains no tokens, environment values, raw logs, or allowed-root paths.</p>
          <div className="diagnostic-actions">
            <button type="button" className="button" onClick={() => void copyDiagnostics()}>Copy sanitized diagnostics</button>
            <a
              className="button secondary"
              href="/api/diagnostics/troubleshooting"
              target="_blank"
              rel="noreferrer"
            >
              Open troubleshooting guide
            </a>
          </div>
          {copyMessage ? <p className="copy-status system-copy-status" role="status">{copyMessage}</p> : null}
          <pre className="diagnostic-preview">{formatSanitizedDiagnostics(status)}</pre>
        </DiagnosticPanel>
      </div>
    </div>
  );
}

function AppearancePanel(props: {
  theme: DashboardTheme;
  onThemeChange(theme: DashboardTheme): void;
}): React.JSX.Element {
  return (
    <DiagnosticPanel title="Appearance" code="UI">
      <label className="theme-field">
        <span>Dashboard theme</span>
        <select
          value={props.theme}
          onChange={(event) => props.onThemeChange(event.target.value as DashboardTheme)}
        >
          <option value="system">Follow system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <p className="diagnostic-note">Follow system tracks the operating system preference. The explicit choices persist in this browser.</p>
    </DiagnosticPanel>
  );
}

function DiagnosticPanel(props: {
  title: string;
  code: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="panel diagnostic-panel">
      <header>
        <span>{props.code}</span>
        <h2>{props.title}</h2>
      </header>
      <div className="diagnostic-content">{props.children}</div>
    </section>
  );
}

function Definition(props: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="definition">
      <span>{props.label}</span>
      <span>{props.mono ? <code>{props.value}</code> : props.value}</span>
    </div>
  );
}

function BoundaryRow(props: { label: string; good: boolean; value: string }): React.JSX.Element {
  return (
    <div className="boundary-row">
      <span>{props.label}</span>
      <StatusBadge state={props.good ? "success" : "warning"} label={props.value} />
    </div>
  );
}

function StatusBadge(props: {
  state: "success" | "danger" | "warning";
  label: string;
}): React.JSX.Element {
  return <span className={`status-badge ${props.state}`}><span aria-hidden="true" />{props.label}</span>;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return [
    days ? `${days}d` : undefined,
    hours ? `${hours}h` : undefined,
    `${minutes}m`,
  ].filter(Boolean).join(" ");
}
