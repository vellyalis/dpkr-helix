import { useEffect, useMemo, useRef, useState } from "react";
import type { LocalAgentRecord } from "../local-agent-store.js";
import type { StoredOperationRun } from "../operations/operation-store.js";
import type { ProjectView } from "../projects/project-types.js";
import type { DashboardStatus } from "./api.js";
import {
  buildAgentScreenRecords,
  filterAgentRecords,
  summarizeAgents,
  type AgentPresentationState,
  type AgentScreenRecord,
} from "./agents-screen.js";
import {
  isTypingTarget,
  useCompactLayout,
  useFocusTrap,
} from "./overlay-focus.js";

interface AgentsViewProps {
  status: DashboardStatus | null;
  sessions: LocalAgentRecord[];
  runs: StoredOperationRun[];
  projects: ProjectView[];
  ready: boolean;
}

export function AgentsView(props: AgentsViewProps): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [copyMessage, setCopyMessage] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const inspectorReturnFocus = useRef<HTMLButtonElement>(null);
  const compact = useCompactLayout();
  const records = useMemo(
    () => buildAgentScreenRecords(props.sessions, props.runs, props.projects),
    [props.sessions, props.runs, props.projects],
  );
  const visibleRecords = useMemo(
    () => filterAgentRecords(records, search),
    [records, search],
  );
  const summary = summarizeAgents(records);
  const selected = records.find(({ session }) => session.id === selectedAgentId);
  const availableProviders = props.status?.providers.filter((provider) => provider.available).length ?? 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key === "/"
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (
        event.key === "Escape"
        && !compact
        && selectedAgentId
        && !isTypingTarget(event.target)
      ) {
        closeInspector();
      }
    };
    addEventListener("keydown", handleKeyDown);
    return () => removeEventListener("keydown", handleKeyDown);
  }, [compact, selectedAgentId]);

  async function copyId(label: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopyMessage(`${label} copied.`);
  }

  function closeInspector(): void {
    setSelectedAgentId(undefined);
    inspectorReturnFocus.current?.focus();
  }

  return (
    <div className="agents-screen">
      <section className="operations-summary agents-summary" aria-label="Agent summary">
        <Summary label="Providers available" value={`${availableProviders}/${props.status?.providers.length ?? 0}`} />
        <Summary label="Running" value={summary.running} state={summary.running ? "signal" : undefined} />
        <Summary label="Input required" value={summary.inputRequired} state={summary.inputRequired ? "review" : undefined} />
        <Summary label="Results available" value={summary.resultAvailable} state={summary.resultAvailable ? "review" : undefined} />
        <Summary label="Failed or stale" value={summary.failed + summary.stale} state={summary.failed + summary.stale ? "danger" : undefined} />
      </section>

      <section className="provider-strip" aria-labelledby="provider-strip-heading">
        <div className="section-heading">
          <div>
            <h2 id="provider-strip-heading">Providers</h2>
            <p>Availability and configured profile counts from canonical provider/profile owners</p>
          </div>
        </div>
        <div className="provider-grid">
          {(props.status?.providers ?? []).map((provider) => (
            <article className={`provider-card ${provider.state ?? (provider.available ? "available" : "unavailable")}`} key={provider.name}>
              <header>
                <strong>{provider.name}</strong>
                <StatusBadge
                  state={provider.available ? "success" : provider.state === "cooldown" ? "warning" : "danger"}
                  label={provider.available ? "Available" : provider.state === "cooldown" ? "Cooldown" : "Unavailable"}
                />
              </header>
              <p><strong>{provider.profileCount}</strong> configured profile{provider.profileCount === 1 ? "" : "s"}</p>
              {!provider.available ? (
                <small>
                  {provider.reason ?? "Provider preflight failed."}
                  {provider.retryAt ? ` Retry after ${formatTimestamp(provider.retryAt)}.` : ""}
                </small>
              ) : null}
            </article>
          ))}
          {props.ready && props.status?.providers.length === 0 ? (
            <div className="provider-empty">Local-agent providers are disabled.</div>
          ) : null}
        </div>
      </section>

      <label className="search-field agents-search">
        <span>Search sessions</span>
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Agent, provider, profile, project, or run"
        />
        <kbd>/</kbd>
      </label>

      <div className={`agents-layout ${selected ? "has-inspector" : ""}`}>
        <section className="panel agents-table-panel" aria-labelledby="agent-sessions-heading">
          <div className="section-heading">
            <div>
              <h2 id="agent-sessions-heading">Agent sessions</h2>
              <p>{visibleRecords.length} of {records.length} shown · observational</p>
            </div>
          </div>
          {!props.ready ? <AgentTableSkeleton /> : records.length === 0 ? (
            <div className="empty-state">
              <h3>No local-agent sessions</h3>
              <p>Provider status remains visible above. Sessions appear when canonical local-agent work is started.</p>
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="empty-state">
              <h3>No sessions match this search</h3>
              <button type="button" className="button secondary" onClick={() => setSearch("")}>Clear search</button>
            </div>
          ) : (
            <div className="data-table-scroll">
              <table className="data-table agent-table">
                <thead>
                  <tr>
                    <th scope="col">Session</th>
                    <th scope="col">Project / workspace</th>
                    <th scope="col">Provider / profile</th>
                    <th scope="col" className="optional-column">Model / thinking</th>
                    <th scope="col">Status</th>
                    <th scope="col">Assurance</th>
                    <th scope="col" className="optional-column">Updated</th>
                    <th scope="col">Linked run</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <tr
                      key={record.session.id}
                      className={record.session.id === selectedAgentId ? "selected" : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          onClick={(event) => {
                            inspectorReturnFocus.current = event.currentTarget;
                            setSelectedAgentId(record.session.id);
                          }}
                        >
                          {record.session.id}
                        </button>
                      </td>
                      <td>
                        <div className="agent-cell-stack">
                          <strong>{record.project?.name ?? "Unregistered workspace"}</strong>
                          <code>{record.session.workspaceId ?? workspaceLeaf(record.session.workspaceRoot)}</code>
                        </div>
                      </td>
                      <td>
                        <div className="agent-cell-stack">
                          <strong>{record.session.provider}</strong>
                          <span>{record.session.profileName}</span>
                        </div>
                      </td>
                      <td className="optional-column">
                        <div className="agent-cell-stack">
                          <span>{record.session.model ?? "Default model"}</span>
                          <small>{record.session.thinking ?? "Default thinking"}</small>
                        </div>
                      </td>
                      <td><AgentStateBadge state={record.state} /></td>
                      <td><span className="value-label">{formatAssurance(record.linkedRun?.assuranceStage)}</span></td>
                      <td className="optional-column"><time>{formatTimestamp(record.session.updatedAt)}</time></td>
                      <td>
                        {record.linkedRun ? (
                          <a href={`#/runs/${encodeURIComponent(record.linkedRun.id)}`} className="mono-link">
                            {record.linkedRun.id}
                          </a>
                        ) : <span className="muted-value">Not linked</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected ? (
          <AgentInspector
            record={selected}
            copyMessage={copyMessage}
            onCopy={copyId}
            onClose={closeInspector}
            compact={compact}
            returnFocus={inspectorReturnFocus.current}
          />
        ) : null}
      </div>
    </div>
  );
}

function AgentInspector(props: {
  record: AgentScreenRecord;
  copyMessage?: string;
  onCopy(label: string, value: string): Promise<void>;
  onClose(): void;
  compact: boolean;
  returnFocus: HTMLElement | null;
}): React.JSX.Element {
  const { session, linkedRun, project } = props.record;
  const inspectorRef = useRef<HTMLElement>(null);
  useFocusTrap(inspectorRef, props.compact, props.onClose, props.returnFocus);
  const inspector = (
    <aside
      ref={inspectorRef}
      className="inspector agent-inspector"
      aria-labelledby="agent-inspector-title"
      role={props.compact ? "dialog" : undefined}
      aria-modal={props.compact ? "true" : undefined}
    >
      <header className="inspector-header">
        <div>
          <span>Agent session</span>
          <h2 id="agent-inspector-title">{session.id}</h2>
        </div>
        <button type="button" className="button quiet close-button" aria-label="Close agent inspector" onClick={props.onClose}>×</button>
      </header>
      {props.copyMessage ? <p className="copy-status" role="status">{props.copyMessage}</p> : null}
      <section className="inspector-section">
        <h3>Identity</h3>
        <dl>
          <Definition label="Provider" value={session.provider} />
          <Definition label="Profile" value={session.profileName} />
          <Definition label="Provider session" value={session.providerSessionId ?? "Unavailable"} mono />
          <Definition label="Project" value={project?.name ?? "Unregistered workspace"} />
          <Definition label="Workspace" value={session.workspaceId ?? workspaceLeaf(session.workspaceRoot)} mono />
        </dl>
      </section>
      <section className="inspector-section">
        <h3>State and timing</h3>
        <dl>
          <Definition label="Status" value={agentStateLabel(props.record.state)} />
          <Definition label="Assurance" value={formatAssurance(linkedRun?.assuranceStage)} />
          <Definition label="Started" value={formatTimestamp(session.createdAt)} />
          <Definition label="Updated" value={formatTimestamp(session.updatedAt)} />
          <Definition label="Finished" value={linkedRun?.finishedAt ? formatTimestamp(linkedRun.finishedAt) : "Not recorded"} />
          <Definition label="Continue" value={props.record.resumable ? "Supported by canonical service" : "Unavailable"} />
        </dl>
      </section>
      <section className="inspector-section agent-response-preview">
        <h3>{session.error ? "Safe failure summary" : session.disposition === "needs_input" ? "Input required" : "Final response preview"}</h3>
        <pre>{session.error ?? session.question ?? session.latestResponse ?? "No final response recorded."}</pre>
        {session.disposition === "needs_input" && session.latestResponse ? <p>{session.latestResponse}</p> : null}
        <p>{session.disposition === "needs_input" ? "Continue this same agent session with the answer." : "Provider output is a result, not verification evidence."}</p>
      </section>
      <div className="inspector-actions">
        <button type="button" className="button secondary" onClick={() => void props.onCopy("Agent ID", session.id)}>Copy agent ID</button>
        {session.providerSessionId ? (
          <button type="button" className="button secondary" onClick={() => void props.onCopy("Provider session ID", session.providerSessionId!)}>Copy provider session</button>
        ) : null}
        {linkedRun ? <a className="button" href={`#/runs/${encodeURIComponent(linkedRun.id)}`}>Open linked run</a> : null}
      </div>
    </aside>
  );
  if (!props.compact) return inspector;
  return (
    <div className="agent-inspector-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      {inspector}
    </div>
  );
}

function Summary(props: {
  label: string;
  value: number | string;
  state?: "signal" | "review" | "danger";
}): React.JSX.Element {
  return (
    <article className={`run-summary-card ${props.state ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function AgentStateBadge({ state }: { state: AgentPresentationState }): React.JSX.Element {
  const badgeState = state === "running"
    ? "success"
    : state === "failed"
      ? "danger"
      : state === "stale" || state === "input_required"
        ? "warning"
        : "neutral";
  return <StatusBadge state={badgeState} label={agentStateLabel(state)} />;
}

function StatusBadge(props: {
  state: "success" | "danger" | "warning" | "neutral";
  label: string;
}): React.JSX.Element {
  return <span className={`status-badge ${props.state}`}><span aria-hidden="true" />{props.label}</span>;
}

function Definition(props: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="definition">
      <dt>{props.label}</dt>
      <dd>{props.mono ? <code>{props.value}</code> : props.value}</dd>
    </div>
  );
}

function AgentTableSkeleton(): React.JSX.Element {
  return <div className="table-skeleton" aria-label="Loading agent sessions">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>;
}

function agentStateLabel(state: AgentPresentationState): string {
  if (state === "result_available") return "Result available";
  if (state === "input_required") return "Input required";
  if (state === "stale") return "Stale after restart";
  return state[0]!.toUpperCase() + state.slice(1);
}

function formatAssurance(value: StoredOperationRun["assuranceStage"] | undefined): string {
  return value?.replaceAll("_", " ") ?? "Not projected";
}

function workspaceLeaf(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? "Workspace";
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
