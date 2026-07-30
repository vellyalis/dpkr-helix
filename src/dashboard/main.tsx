import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  bootstrapSession,
  getAgents,
  getCsrfToken,
  getOperationSnapshot,
  getProjectGitStatus,
  getProjects,
  getStatus,
  type DashboardStatus,
} from "./api.js";
import type { LocalAgentRecord } from "../local-agent-store.js";
import type { StoredOperationRun } from "../operations/operation-store.js";
import type { ProjectView } from "../projects/project-types.js";
import {
  ProjectsView,
  type ProjectsDrawerState,
} from "./projects-view.js";
import type { ProjectGitStatus } from "./projects-screen.js";
import { AgentsView } from "./agents-view.js";
import { RunsView } from "./runs-view.js";
import { SystemView } from "./system-view.js";
import {
  DASHBOARD_DESTINATIONS,
  dashboardDestinationFromHash,
  dashboardDestinationHref,
  type DashboardDestination,
  type DashboardTheme,
} from "./shell.js";
import brandIconUrl from "../ui/dpkr-helix-icon.png";
import brandIconLightUrl from "../ui/dpkr-helix-icon-light.png";
import "./styles.css";

function Dashboard(): React.JSX.Element {
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [runs, setRuns] = useState<StoredOperationRun[]>([]);
  const [operationCursor, setOperationCursor] = useState(0);
  const [gitStatuses, setGitStatuses] = useState<Record<string, ProjectGitStatus>>({});
  const [agents, setAgents] = useState<LocalAgentRecord[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [projectsDrawer, setProjectsDrawer] = useState<ProjectsDrawerState>(null);
  const projectsDrawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [scanRequest, setScanRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [destination, setDestination] = useState<DashboardDestination>(() =>
    dashboardDestinationFromHash(location.hash)
  );
  const [theme, setTheme] = useState<DashboardTheme>("system");

  useEffect(() => {
    const updateDestination = (): void => {
      setDestination(dashboardDestinationFromHash(location.hash));
    };
    addEventListener("hashchange", updateDestination);
    return () => removeEventListener("hashchange", updateDestination);
  }, []);

  useEffect(() => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
      return;
    }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function refresh(projectId = selectedProjectId): Promise<void> {
    setError(null);
    const [nextStatus, nextProjects, operationSnapshot] = await Promise.all([
      getStatus(),
      getProjects(),
      getOperationSnapshot(),
    ]);
    let nextAgents: LocalAgentRecord[] = [];
    try {
      nextAgents = await getAgents(projectId);
      setAgentError(null);
    } catch (agentLoadError) {
      setAgentError(agentLoadError instanceof Error ? agentLoadError.message : "Agent sessions unavailable.");
    }
    const nextGitStatuses = await Promise.all(nextProjects.map(async (project) => {
      try {
        return [project.id, await getProjectGitStatus(project.id)] as const;
      } catch {
        return [project.id, { stale: true }] as const;
      }
    }));
    setStatus(nextStatus);
    setProjects(nextProjects);
    setRuns(operationSnapshot.runs);
    setOperationCursor(operationSnapshot.cursor);
    setGitStatuses(Object.fromEntries(nextGitStatuses));
    setAgents(nextAgents);
  }

  async function selectProject(projectId: string | undefined): Promise<void> {
    setSelectedProjectId(projectId);
    try {
      setAgents(await getAgents(projectId));
      setAgentError(null);
    } catch (agentLoadError) {
      setAgents([]);
      setAgentError(agentLoadError instanceof Error ? agentLoadError.message : "Agent sessions unavailable.");
    }
  }

  function changeProjectsDrawer(
    drawer: ProjectsDrawerState,
    returnFocus?: HTMLElement,
  ): void {
    if (drawer && returnFocus) {
      projectsDrawerReturnFocusRef.current = returnFocus;
    }
    setProjectsDrawer(drawer);
  }

  useEffect(() => {
    void (async () => {
      try {
        await bootstrapSession();
        if (!getCsrfToken()) {
          setError("Open the dashboard with `devspace dashboard` to create a local admin session.");
          return;
        }
        await refresh();
        if (!location.hash.startsWith("#/")) {
          history.replaceState(null, "", `${location.pathname}${location.search}#/projects`);
          setDestination("projects");
        }
        setReady(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Dashboard unavailable.");
      }
    })();
  }, []);

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      setError(null);
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    }
  }

  return (
    <div className="app-shell">
      <aside className="primary-nav">
        <div className="product-identity">
          <img className="product-mark product-mark-light" src={brandIconLightUrl} alt="" aria-hidden="true" />
          <img className="product-mark product-mark-dark" src={brandIconUrl} alt="" aria-hidden="true" />
          <div>
            <strong>dpkr helix</strong>
            <span>Control Center</span>
          </div>
        </div>
        <nav aria-label="Primary">
          {DASHBOARD_DESTINATIONS.map((item) => (
            <a
              key={item.id}
              href={dashboardDestinationHref(item.id)}
              className={destination === item.id ? "active" : undefined}
              aria-current={destination === item.id ? "page" : undefined}
            >
              <span className="nav-marker" aria-hidden="true" />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="global-status" aria-label="Dashboard connection status">
          <span className={`connection-dot ${ready ? "connected" : error ? "disconnected" : "connecting"}`} aria-hidden="true" />
          <div>
            <strong>{ready ? "Connected" : error ? "Disconnected" : "Connecting"}</strong>
            <span>{status ? "MCP service available" : "Local dashboard"}</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="page-header">
          <div>
            <h1>{destinationLabel(destination)}</h1>
            <p>{destinationSummary(destination, status)}</p>
          </div>
          <div className="page-actions">
            {destination === "projects" ? <>
              <button
                type="button"
                className="button secondary"
                disabled={!ready}
                onClick={(event) => {
                  changeProjectsDrawer({ kind: "add" }, event.currentTarget);
                  setScanRequest((request) => request + 1);
                }}
              >
                Scan allowed roots
              </button>
              <button
                type="button"
                className="button"
                disabled={!ready}
                onClick={(event) => {
                  changeProjectsDrawer({ kind: "add" }, event.currentTarget);
                }}
              >
                Add project
              </button>
              <button type="button" className="button secondary" onClick={() => void run(() => refresh())}>
                Refresh
              </button>
            </> : destination === "runs" ? (
              <button type="button" className="button secondary" onClick={() => void run(() => refresh())}>
                Refresh
              </button>
            ) : (
              <button type="button" className="button secondary" onClick={() => void run(() => refresh())}>
                Refresh
              </button>
            )}
          </div>
        </header>
        <main className="dashboard" id="main-content">
          {error ? <div className="notice error" role="alert">{error}</div> : null}
          {destination === "projects" ? (
            <ProjectsView
              status={status}
              projects={projects}
              runs={runs}
              gitStatuses={gitStatuses}
              agents={agents}
              selectedProjectId={selectedProjectId}
              ready={ready}
              drawer={projectsDrawer}
              drawerReturnFocus={projectsDrawerReturnFocusRef.current}
              scanRequest={scanRequest}
              onDrawerChange={changeProjectsDrawer}
              onSelectProject={selectProject}
              onRefresh={refresh}
              run={run}
            />
          ) : destination === "runs" ? (
            <RunsView
              runs={runs}
              projects={projects}
              cursor={operationCursor}
              ready={ready}
              onRefresh={refresh}
              run={run}
            />
          ) : destination === "agents" ? (
            <>
              {agentError ? (
                <div className="notice error" role="alert">
                  Agent sessions could not be loaded. Existing provider diagnostics remain available; refresh safely to retry.
                </div>
              ) : null}
              <AgentsView
                status={status}
                sessions={agents}
                runs={runs}
                projects={projects}
                ready={ready}
              />
            </>
          ) : (
            <SystemView status={status} ready={ready} theme={theme} onThemeChange={setTheme} />
          )}
        </main>
      </div>
    </div>
  );
}

function destinationLabel(destination: DashboardDestination): string {
  return DASHBOARD_DESTINATIONS.find((item) => item.id === destination)?.label ?? "Projects";
}

function destinationSummary(destination: DashboardDestination, status: DashboardStatus | null): string {
  if (destination === "projects") {
    return status ? "Manage registered projects and local agent sessions." : "Loading local project state.";
  }
  if (destination === "runs") return "Action queues for current and retained operations.";
  if (destination === "agents") return "Inspect local agent providers and sessions.";
  return "Inspect the local service and security boundary.";
}

createRoot(document.querySelector("#root")!).render(<Dashboard />);
