import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Ref,
  type ReactNode,
} from "react";
import type { LocalAgentRecord } from "../local-agent-store.js";
import type { OperationRun } from "../operations/operation-contracts.js";
import type { ProjectResumeSnapshot } from "../project-resume.js";
import type { DiscoveryCandidate } from "../projects/project-discovery.js";
import type { ProjectView } from "../projects/project-types.js";
import {
  chooseFolder,
  forgetProject,
  getProjectResume,
  registerProject,
  scanProjects,
  updateProject,
  type DashboardStatus,
} from "./api.js";
import {
  filterAndSortProjectRecords,
  isActiveRunState,
  isWithinRoot,
  type ProjectGitStatus,
  type ProjectScreenFilters,
  type ProjectScreenRecord,
} from "./projects-screen.js";
import {
  isTypingTarget,
  useCompactLayout,
  useFocusTrap,
} from "./overlay-focus.js";

export type ProjectsDrawerState =
  | { kind: "add" }
  | { kind: "edit"; projectId: string }
  | null;

interface ProjectsViewProps {
  status: DashboardStatus | null;
  projects: ProjectView[];
  runs: OperationRun[];
  gitStatuses: Record<string, ProjectGitStatus>;
  agents: LocalAgentRecord[];
  selectedProjectId?: string;
  ready: boolean;
  drawer: ProjectsDrawerState;
  drawerReturnFocus: HTMLElement | null;
  scanRequest: number;
  onDrawerChange(drawer: ProjectsDrawerState, returnFocus?: HTMLElement): void;
  onSelectProject(projectId: string | undefined): Promise<void>;
  onRefresh(): Promise<void>;
  run(action: () => Promise<void>): Promise<void>;
}

const EMPTY_FILTERS: ProjectScreenFilters = {
  search: "",
  availability: "",
  permissionPreset: "",
  defaultMode: "",
  activeWork: "",
  allowedRoot: "",
};

export function ProjectsView(props: ProjectsViewProps): React.JSX.Element {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [resume, setResume] = useState<ProjectResumeSnapshot | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedInspectButtonRef = useRef<HTMLButtonElement>(null);

  const records = useMemo<ProjectScreenRecord[]>(() => props.projects.map((project) => ({
    project,
    gitStatus: props.gitStatuses[project.id] ?? { stale: true },
    activeRunCount: props.runs.filter(
      (run) => run.projectId === project.id && isActiveRunState(run.state),
    ).length,
  })), [props.gitStatuses, props.projects, props.runs]);
  const visibleRecords = useMemo(
    () => filterAndSortProjectRecords(records, filters),
    [filters, records],
  );
  const selectedRecord = records.find(({ project }) => project.id === props.selectedProjectId);
  const editingProjectId = props.drawer?.kind === "edit" ? props.drawer.projectId : undefined;
  const editingProject = props.projects.find((project) => project.id === editingProjectId);
  const selectedRuns = props.runs
    .filter((run) => run.projectId === props.selectedProjectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  useEffect(() => {
    let cancelled = false;
    setResume(null);
    setResumeError(null);
    if (!props.selectedProjectId) return () => { cancelled = true; };
    void getProjectResume(props.selectedProjectId)
      .then((nextResume) => {
        if (!cancelled) setResume(nextResume);
      })
      .catch((error) => {
        if (!cancelled) setResumeError(errorMessage(error));
      });
    return () => { cancelled = true; };
  }, [props.selectedProjectId, props.runs, props.agents]);

  async function closeSelectedProject(): Promise<void> {
    const returnFocus = selectedInspectButtonRef.current;
    await props.onSelectProject(undefined);
    returnFocus?.focus();
  }

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent): void => {
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
        && !props.drawer
        && props.selectedProjectId
        && !isTypingTarget(event.target)
      ) {
        void props.run(closeSelectedProject);
      }
    };
    addEventListener("keydown", focusSearch);
    return () => removeEventListener("keydown", focusSearch);
  }, [props.drawer, props.onSelectProject, props.selectedProjectId]);

  async function copyValue(label: string, value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopyMessage(`${label} copied.`);
  }

  async function forget(project: ProjectView): Promise<void> {
    if (!confirm([
      "Remove this project from dpkr helix?",
      `${project.name} — ${project.root}`,
      "",
      "Repository files will not be deleted.",
    ].join("\n"))) return;
    await forgetProject(project.id);
    await props.onSelectProject(undefined);
    await props.onRefresh();
  }

  return (
    <>
      <section className="project-filters" aria-label="Project filters">
        <label className="search-field">
          <span>Search projects</span>
          <input
            ref={searchRef}
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder="Name, slug, or path"
          />
          <kbd>/</kbd>
        </label>
        <FilterSelect
          label="Availability"
          value={filters.availability}
          onChange={(value) => setFilters({ ...filters, availability: value })}
          options={[
            ["", "Any availability"],
            ["available", "Available"],
            ["missing", "Missing"],
            ["not_allowed", "Not allowed"],
            ["invalid", "Invalid"],
          ]}
        />
        <FilterSelect
          label="Permission preset"
          value={filters.permissionPreset}
          onChange={(value) => setFilters({ ...filters, permissionPreset: value })}
          options={[
            ["", "Any preset"],
            ["inspect", "Inspect"],
            ["design", "Design"],
            ["develop", "Develop"],
          ]}
        />
        <FilterSelect
          label="Default mode"
          value={filters.defaultMode}
          onChange={(value) => setFilters({ ...filters, defaultMode: value })}
          options={[
            ["", "Any mode"],
            ["checkout", "Checkout"],
            ["worktree", "Worktree"],
          ]}
        />
        <FilterSelect
          label="Active work"
          value={filters.activeWork}
          onChange={(value) => setFilters({ ...filters, activeWork: value })}
          options={[
            ["", "Any activity"],
            ["active", "Active work"],
            ["idle", "No active work"],
          ]}
        />
        <FilterSelect
          label="Allowed root"
          value={filters.allowedRoot}
          onChange={(value) => setFilters({ ...filters, allowedRoot: value })}
          options={[
            ["", "Any allowed root"],
            ...(props.status?.allowedRoots ?? []).map((root) => [root, root] as [string, string]),
          ]}
          mono
        />
        {Object.values(filters).some(Boolean) ? (
          <button type="button" className="button quiet" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        ) : null}
      </section>

      <div className={`projects-layout ${selectedRecord ? "has-inspector" : ""}`}>
        <section className="panel projects-table-panel" aria-labelledby="projects-table-heading">
          <div className="section-heading">
            <div>
              <h2 id="projects-table-heading">Registered projects</h2>
              <p>{visibleRecords.length} of {props.projects.length} shown</p>
            </div>
          </div>
          {!props.ready ? <ProjectTableSkeleton /> : props.projects.length === 0 ? (
            <EmptyState
              title="No registered projects"
              detail="Add a repository from an allowed root to make it available to dpkr helix."
              action={(
                <button
                  type="button"
                  onClick={(event) => props.onDrawerChange({ kind: "add" }, event.currentTarget)}
                >
                  Add project
                </button>
              )}
            />
          ) : visibleRecords.length === 0 ? (
            <EmptyState
              title="No projects match these filters"
              detail="Clear or change the filters to see registered projects."
              action={<button type="button" className="button secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>}
            />
          ) : (
            <div className="data-table-scroll">
              <table className="data-table project-table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Availability</th>
                    <th scope="col" className="optional-column">Repository</th>
                    <th scope="col">Preset</th>
                    <th scope="col">Mode</th>
                    <th scope="col" className="optional-column">Active runs</th>
                    <th scope="col" className="optional-column">Last opened</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <ProjectTableRow
                      key={record.project.id}
                      record={record}
                      selected={record.project.id === props.selectedProjectId}
                      onInspect={() => void props.run(() => props.onSelectProject(record.project.id))}
                      inspectButtonRef={
                        record.project.id === props.selectedProjectId
                          ? selectedInspectButtonRef
                          : undefined
                      }
                      onEdit={(returnFocus) => {
                        props.onDrawerChange(
                          { kind: "edit", projectId: record.project.id },
                          returnFocus,
                        );
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedRecord ? (
          <ProjectInspector
            record={selectedRecord}
            agents={props.agents}
            runs={selectedRuns}
            resume={resume}
            resumeError={resumeError}
            copyMessage={copyMessage}
            onClose={() => void props.run(closeSelectedProject)}
            onCopy={(label, value) => void props.run(() => copyValue(label, value))}
            onEdit={(returnFocus) => {
              props.onDrawerChange(
                { kind: "edit", projectId: selectedRecord.project.id },
                returnFocus,
              );
            }}
            onForget={() => void props.run(() => forget(selectedRecord.project))}
          />
        ) : null}
      </div>

      {props.drawer?.kind === "add" ? (
        <AddProjectDrawer
          key="add-project"
          allowedRoots={props.status?.allowedRoots ?? []}
          scanRequest={props.scanRequest}
          returnFocus={props.drawerReturnFocus}
          onClose={() => props.onDrawerChange(null)}
          onChanged={props.onRefresh}
        />
      ) : null}
      {props.drawer?.kind === "edit" ? (
        <EditProjectDrawer
          key={editingProjectId}
          project={editingProject}
          allowedRoots={props.status?.allowedRoots ?? []}
          returnFocus={props.drawerReturnFocus}
          onClose={() => props.onDrawerChange(null)}
          onChanged={async () => {
            await props.onRefresh();
            await props.onSelectProject(editingProjectId);
          }}
        />
      ) : null}
    </>
  );
}

function ProjectTableRow(props: {
  record: ProjectScreenRecord;
  selected: boolean;
  inspectButtonRef?: Ref<HTMLButtonElement>;
  onInspect(): void;
  onEdit(returnFocus: HTMLButtonElement): void;
}): React.JSX.Element {
  const { project, gitStatus, activeRunCount } = props.record;
  return (
    <tr className={props.selected ? "selected" : undefined}>
      <td>
        <div className="project-identity-cell">
          <strong>{project.name}{project.pinned ? <span title="Pinned"> ★</span> : null}</strong>
          <span>{project.slug}</span>
          <code title={project.root}>{project.root}</code>
        </div>
      </td>
      <td>
        <StatusBadge
          state={project.availability === "available" ? "success" : "danger"}
          label={availabilityLabel(project)}
        />
      </td>
      <td className="optional-column">
        <div className="repository-cell">
          <span>{gitStatus.stale ? "Status unavailable" : gitStatus.branch ?? "Branch unknown"}</span>
          <small>
            {gitStatus.stale
              ? "Git status stale"
              : gitStatus.dirtyCount === undefined
                ? "Dirty count unknown"
                : `${gitStatus.dirtyCount} changed ${gitStatus.dirtyCount === 1 ? "file" : "files"}`}
          </small>
        </div>
      </td>
      <td><span className="value-label">{project.permissionPreset}</span></td>
      <td><span className="value-label">{project.defaultMode}</span></td>
      <td className="optional-column">
        <span className={activeRunCount > 0 ? "active-count" : "muted-value"}>
          {activeRunCount}
        </span>
      </td>
      <td className="optional-column"><span className="muted-value">{formatDate(project.lastOpenedAt)}</span></td>
      <td>
        <div className="row-actions">
          <button
            ref={props.inspectButtonRef}
            type="button"
            className="button quiet"
            onClick={props.onInspect}
          >
            Inspect
          </button>
          <button
            type="button"
            className="button quiet"
            onClick={(event) => props.onEdit(event.currentTarget)}
          >
            Edit
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProjectInspector(props: {
  record: ProjectScreenRecord;
  agents: LocalAgentRecord[];
  runs: OperationRun[];
  resume: ProjectResumeSnapshot | null;
  resumeError: string | null;
  copyMessage: string | null;
  onClose(): void;
  onCopy(label: string, value: string): void;
  onEdit(returnFocus: HTMLButtonElement): void;
  onForget(): void;
}): React.JSX.Element {
  const { project, gitStatus, activeRunCount } = props.record;
  const inspectorRef = useRef<HTMLElement>(null);
  const compact = useCompactLayout();
  useFocusTrap(inspectorRef, compact, props.onClose);
  const inspector = (
    <aside
      ref={inspectorRef}
      className="inspector project-inspector"
      role={compact ? "dialog" : undefined}
      aria-modal={compact ? true : undefined}
      aria-labelledby="project-inspector-title"
    >
      <div className="inspector-header">
        <div>
          <p className="eyebrow">Project inspector</p>
          <h2 id="project-inspector-title">{project.name}</h2>
          <span>{project.slug}</span>
        </div>
        <button type="button" className="button quiet close-button" onClick={props.onClose} aria-label="Close project inspector">×</button>
      </div>

      <InspectorSection title="Identity">
        <Definition label="Availability"><StatusBadge state={project.availability === "available" ? "success" : "danger"} label={availabilityLabel(project)} /></Definition>
        <Definition label="Project ID"><code>{project.id}</code></Definition>
        <Definition label="Canonical path"><code>{project.root}</code></Definition>
        <Definition label="Source"><span>{project.source}</span></Definition>
      </InspectorSection>
      <InspectorSection title="Defaults">
        <Definition label="Permission preset"><span>{project.permissionPreset}</span></Definition>
        <Definition label="Workspace mode"><span>{project.defaultMode}</span></Definition>
        <Definition label="Pinned"><span>{project.pinned ? "Yes" : "No"}</span></Definition>
      </InspectorSection>
      <InspectorSection title="Repository">
        <Definition label="Branch"><span>{gitStatus.stale ? "Status unavailable" : gitStatus.branch ?? "Unknown"}</span></Definition>
        <Definition label="Changed files"><span>{gitStatus.stale ? "Status stale" : gitStatus.dirtyCount ?? "Unknown"}</span></Definition>
        <Definition label="Last opened"><span>{formatDate(project.lastOpenedAt)}</span></Definition>
      </InspectorSection>
      <InspectorSection title="Current / Resume">
        {props.resumeError ? (
          <Definition label="Status"><span className="danger-text">{props.resumeError}</span></Definition>
        ) : props.resume ? <>
          <Definition label="Handoff">
            <span>{props.resume.handoff
              ? `${props.resume.handoff.status} · ${props.resume.handoff.summary}`
              : "None recorded"}</span>
          </Definition>
          <Definition label="Next action"><strong>{props.resume.nextAction}</strong></Definition>
          <Definition label="Workspace sessions">
            <span>{props.resume.workspaces.active} active · {props.resume.workspaces.archived} archived</span>
          </Definition>
          <Definition label="Latest verification">
            <span>{props.resume.verification
              ? `${props.resume.verification.stage} · ${formatDate(props.resume.verification.updatedAt)}`
              : "None retained"}</span>
          </Definition>
          <Definition label="Latest failure">
            {props.resume.latestFailure ? (
              <div className="resume-failure">
                <strong>{props.resume.latestFailure.code ?? "failure"}</strong>
                <span>{props.resume.latestFailure.summary}</span>
                {props.resume.latestFailure.retryAt
                  ? <small>Retry after {formatDate(props.resume.latestFailure.retryAt)}</small>
                  : null}
                <small>{props.resume.latestFailure.recommendedAction}</small>
              </div>
            ) : <span>None retained</span>}
          </Definition>
          <Definition label="Resume"><span>{props.resume.resumeInstruction}</span></Definition>
        </> : (
          <Definition label="Status"><span>Loading current resume state…</span></Definition>
        )}
      </InspectorSection>
      <InspectorSection title="Activity">
        <Definition label="Active runs"><span>{activeRunCount}</span></Definition>
        <Definition label="Recent runs">
          {props.runs.length ? (
            <ul className="compact-list">
              {props.runs.map((run) => <li key={run.id}><span>{run.title}</span><small>{run.state}</small></li>)}
            </ul>
          ) : <span>None recorded</span>}
        </Definition>
        <Definition label="Local-agent sessions">
          {props.agents.length ? (
            <ul className="compact-list">
              {props.agents.slice(0, 5).map((agent) => (
                <li key={agent.id}><span>{agent.profileName}</span><small>{agent.status}</small></li>
              ))}
            </ul>
          ) : <span>None recorded</span>}
        </Definition>
      </InspectorSection>

      {props.copyMessage ? <p className="copy-status" role="status">{props.copyMessage}</p> : null}
      <div className="inspector-actions">
        <button type="button" onClick={(event) => props.onEdit(event.currentTarget)}>Edit project</button>
        <button type="button" className="button secondary" onClick={() => props.onCopy("Project ID", project.id)}>Copy ID</button>
        <button type="button" className="button secondary" onClick={() => props.onCopy("Project path", project.root)}>Copy path</button>
      </div>
      <div className="destructive-actions">
        <p>Forgetting removes this registration only. Repository files will not be deleted.</p>
        <button type="button" className="danger" onClick={props.onForget}>Forget project</button>
      </div>
    </aside>
  );
  return compact ? (
    <div
      className="project-inspector-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      {inspector}
    </div>
  ) : inspector;
}

function AddProjectDrawer(props: {
  allowedRoots: string[];
  scanRequest: number;
  returnFocus: HTMLElement | null;
  onClose(): void;
  onChanged(): Promise<void>;
}): React.JSX.Element {
  const [manualPath, setManualPath] = useState("");
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanState, setScanState] = useState<"idle" | "loading" | "complete">("idle");
  const [partialReason, setPartialReason] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const handledScanRequest = useRef(0);

  const groupedCandidates = useMemo(
    () => groupCandidates(candidates, props.allowedRoots),
    [candidates, props.allowedRoots],
  );

  useEffect(() => {
    if (props.scanRequest > handledScanRequest.current) {
      handledScanRequest.current = props.scanRequest;
      void runScan();
    }
  }, [props.scanRequest]);

  async function runScan(): Promise<void> {
    setError(null);
    setScanState("loading");
    try {
      const result = await scanProjects();
      setCandidates(result.candidates);
      setSelected(new Set(result.candidates.filter((candidate) => !candidate.alreadyRegistered).map((candidate) => candidate.root)));
      setPartialReason(result.truncated ? result.reason ?? "limit reached" : undefined);
      setScanState("complete");
    } catch (scanError) {
      setError(errorMessage(scanError));
      setScanState("idle");
    }
  }

  async function addPath(path: string, source: "manual" | "discovered"): Promise<void> {
    setError(null);
    try {
      await registerProject(path, source);
      await props.onChanged();
      props.onClose();
    } catch (addError) {
      setError(errorMessage(addError));
    }
  }

  async function importSelected(): Promise<void> {
    setError(null);
    try {
      for (const candidate of candidates) {
        if (selected.has(candidate.root) && !candidate.alreadyRegistered) {
          await registerProject(candidate.root, "discovered");
        }
      }
      await props.onChanged();
      props.onClose();
    } catch (importError) {
      setError(errorMessage(importError));
    }
  }

  return (
    <Drawer title="Add project" returnFocus={props.returnFocus} onClose={props.onClose}>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <section className="drawer-section">
        <div className="drawer-section-heading">
          <div><h3>Scan allowed roots</h3><p>Find Git repositories without leaving configured roots.</p></div>
          <button type="button" className="button secondary" disabled={scanState === "loading"} onClick={() => void runScan()}>
            {scanState === "loading" ? "Scanning…" : "Scan allowed roots"}
          </button>
        </div>
        {partialReason ? (
          <div className="notice warning">Partial scan: {partialReason}. Discovered repositories remain available below.</div>
        ) : null}
        {scanState === "loading" ? <div className="scan-loading" role="status">Scanning configured roots…</div> : null}
        {scanState === "complete" && candidates.length === 0 ? <p className="empty-inline">No unregistered repositories found.</p> : null}
        {groupedCandidates.map(([root, group]) => (
          <div className="candidate-group" key={root}>
            <h4>{root}</h4>
            {group.map((candidate) => (
              <label className="candidate-row" key={candidate.root}>
                <input
                  type="checkbox"
                  checked={candidate.alreadyRegistered || selected.has(candidate.root)}
                  disabled={candidate.alreadyRegistered}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(candidate.root);
                    else next.delete(candidate.root);
                    setSelected(next);
                  }}
                />
                <span><strong>{candidate.name}</strong><code>{candidate.root}</code></span>
                <small>{candidate.alreadyRegistered ? "Already registered" : `.git ${candidate.gitMarker}`}</small>
              </label>
            ))}
          </div>
        ))}
        {candidates.some((candidate) => !candidate.alreadyRegistered) ? (
          <button type="button" disabled={selected.size === 0} onClick={() => void importSelected()}>
            Import selected ({selected.size})
          </button>
        ) : null}
      </section>

      <section className="drawer-section">
        <h3>Choose folder</h3>
        <p>Use the operating-system folder picker when it is available.</p>
        <button type="button" className="button secondary" onClick={() => void (async () => {
          try {
            const picked = await chooseFolder();
            if (picked.path) setManualPath(picked.path);
            if (!picked.supported) setError("Native picker is unavailable. Enter a path below.");
          } catch (pickerError) {
            setError(errorMessage(pickerError));
          }
        })()}>Choose folder</button>
      </section>

      <section className="drawer-section">
        <h3>Manual path</h3>
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          void addPath(manualPath, "manual");
        }}>
          <label>
            <span>Repository path</span>
            <input autoFocus value={manualPath} onChange={(event) => setManualPath(event.target.value)} placeholder="C:\path\to\repository" />
          </label>
          <button type="submit" disabled={!manualPath.trim()}>Add project</button>
        </form>
      </section>
    </Drawer>
  );
}

function EditProjectDrawer(props: {
  project?: ProjectView;
  allowedRoots: string[];
  returnFocus: HTMLElement | null;
  onClose(): void;
  onChanged(): Promise<void>;
}): React.JSX.Element | null {
  const project = props.project;
  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [permissionPreset, setPermissionPreset] = useState(project?.permissionPreset ?? "develop");
  const [defaultMode, setDefaultMode] = useState(project?.defaultMode ?? "checkout");
  const [pinned, setPinned] = useState(project?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!project) return null;
  const projectId = project.id;

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateProject(projectId, { name, slug, permissionPreset, defaultMode, pinned });
      await props.onChanged();
      props.onClose();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={`Edit ${project.name}`}
      returnFocus={props.returnFocus}
      onClose={props.onClose}
    >
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <form className="stacked-form edit-project-form" onSubmit={(event) => void save(event)}>
        <label><span>Display name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label><span>Slug</span><input value={slug} onChange={(event) => setSlug(event.target.value)} required /></label>
        <label><span>Permission preset</span>
          <select value={permissionPreset} onChange={(event) => setPermissionPreset(event.target.value as ProjectView["permissionPreset"])}>
            <option value="inspect">Inspect</option>
            <option value="design">Design</option>
            <option value="develop">Develop</option>
          </select>
        </label>
        <label><span>Default mode</span>
          <select value={defaultMode} onChange={(event) => setDefaultMode(event.target.value as ProjectView["defaultMode"])}>
            <option value="checkout">Checkout</option>
            <option value="worktree">Worktree</option>
          </select>
        </label>
        <label className="checkbox-field"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>Pin this project</span></label>
        <div className="read-only-fields">
          <Definition label="Project ID"><code>{project.id}</code></Definition>
          <Definition label="Canonical path"><code>{project.root}</code></Definition>
          <Definition label="Allowed root"><code>{props.allowedRoots.find((root) => isWithinRoot(project.root, root)) ?? "No current match"}</code></Definition>
        </div>
        <div className="drawer-actions">
          <button type="button" className="button secondary" onClick={props.onClose}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Drawer>
  );
}

function Drawer(props: {
  title: string;
  returnFocus: HTMLElement | null;
  onClose(): void;
  children: ReactNode;
}): React.JSX.Element {
  const drawerRef = useRef<HTMLElement>(null);
  useFocusTrap(drawerRef, true, props.onClose, props.returnFocus);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header>
          <h2 id="drawer-title">{props.title}</h2>
          <button type="button" className="button quiet close-button" onClick={props.onClose} aria-label={`Close ${props.title}`}>×</button>
        </header>
        <div className="drawer-content">{props.children}</div>
      </aside>
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  options: [string, string][];
  onChange(value: string): void;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <label className={`filter-select ${props.mono ? "mono" : ""}`}>
      <span className="sr-only">{props.label}</span>
      <select aria-label={props.label} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function StatusBadge(props: { state: "success" | "danger" | "warning" | "neutral"; label: string }): React.JSX.Element {
  return <span className={`status-badge ${props.state}`}><span aria-hidden="true" />{props.label}</span>;
}

function InspectorSection(props: { title: string; children: ReactNode }): React.JSX.Element {
  return <section className="inspector-section"><h3>{props.title}</h3><dl>{props.children}</dl></section>;
}

function Definition(props: { label: string; children: ReactNode }): React.JSX.Element {
  return <div className="definition"><dt>{props.label}</dt><dd>{props.children}</dd></div>;
}

function EmptyState(props: { title: string; detail: string; action: ReactNode }): React.JSX.Element {
  return <div className="empty-state"><h3>{props.title}</h3><p>{props.detail}</p>{props.action}</div>;
}

function ProjectTableSkeleton(): React.JSX.Element {
  return (
    <div className="table-skeleton" role="status" aria-label="Loading projects">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </div>
  );
}

function availabilityLabel(project: ProjectView): string {
  if (project.availability === "available") return "Available";
  const label = project.availability.replaceAll("_", " ");
  return project.unavailableReason ? `${label}: ${project.unavailableReason}` : label;
}

function formatDate(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : date.toLocaleString();
}

function groupCandidates(
  candidates: DiscoveryCandidate[],
  allowedRoots: string[],
): [string, DiscoveryCandidate[]][] {
  const rootsBySpecificity = [...allowedRoots].sort((a, b) => b.length - a.length);
  const groups = new Map<string, DiscoveryCandidate[]>();
  for (const candidate of candidates) {
    const root = rootsBySpecificity.find((allowedRoot) => isWithinRoot(candidate.root, allowedRoot))
      ?? "Other allowed root";
    groups.set(root, [...(groups.get(root) ?? []), candidate]);
  }
  return [...groups.entries()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project action failed.";
}
