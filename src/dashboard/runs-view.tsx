import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type UIEvent,
} from "react";
import { PatchDiff } from "@pierre/diffs/react";
import type { ProjectView } from "../projects/project-types.js";
import type {
  RepositoryDiffSummary,
  RepositoryFileDiff,
} from "../operations/repository-diff.js";
import type {
  StoredOperationEvent,
  StoredOperationRun,
} from "../operations/operation-store.js";
import {
  getOperationEvents,
  getOperationRepositoryDiff,
  getOperationRepositoryFileDiff,
  getOperationRunDetail,
  openOperationStream,
  stopOperationRun,
  type DashboardOperationDetail,
} from "./api.js";
import {
  agentOutputAvailable,
  agentOutputFromEvents,
  agentResultStateLabel,
  countTerminalMatches,
  evidenceChecklist,
  filterRuns,
  formatRunDuration,
  groupActivityEvents,
  highlightTerminalSegments,
  isLiveRunState,
  nextActionForRun,
  RUN_QUEUE_ORDER,
  relatedRunIds,
  runGroup,
  runPresentation,
  shortRunId,
  sortRunsForRail,
  stoppableRelatedRun,
  summarizeRuns,
  terminalEntriesFromEvents,
  topLevelRuns,
  type AgentOutputProjection,
  type EvidenceChecklistItem,
  type RunFilters,
  type RunGroup,
  type TerminalAnsiColor,
  type TerminalEntry,
  type TerminalTextStyle,
} from "./runs-screen.js";
import { isTypingTarget } from "./overlay-focus.js";

interface RunsViewProps {
  runs: StoredOperationRun[];
  projects: ProjectView[];
  cursor: number;
  ready: boolean;
  onRefresh(): Promise<void>;
  run(action: () => Promise<void>): Promise<void>;
}

type StreamStatus = "connecting" | "live" | "reconnecting" | "snapshot";
type RunViewTab = "activity" | "terminal" | "diff" | "agent" | "evidence";

const EMPTY_FILTERS: RunFilters = {
  projectId: "",
  source: "",
  kind: "",
  state: "",
  assuranceStage: "",
  timeRange: "",
};

const RUN_QUEUE_META: Record<RunGroup, {
  code: string;
  label: string;
  tone: "now" | "action" | "review" | "standby" | "archive";
}> = {
  Now: { code: "01", label: "NOW", tone: "now" },
  Action: { code: "02", label: "ACTION", tone: "action" },
  Review: { code: "03", label: "REVIEW", tone: "review" },
  Standby: { code: "04", label: "STANDBY", tone: "standby" },
  Archive: { code: "05", label: "ARCHIVE", tone: "archive" },
};

const TERMINAL_COLORS: Record<TerminalAnsiColor, string> = {
  black: "var(--ds-ansi-black)",
  red: "var(--ds-ansi-red)",
  green: "var(--ds-ansi-green)",
  yellow: "var(--ds-ansi-yellow)",
  blue: "var(--ds-ansi-blue)",
  magenta: "var(--ds-ansi-magenta)",
  cyan: "var(--ds-ansi-cyan)",
  white: "var(--ds-ansi-white)",
  "bright-black": "var(--ds-ansi-bright-black)",
  "bright-red": "var(--ds-ansi-bright-red)",
  "bright-green": "var(--ds-ansi-bright-green)",
  "bright-yellow": "var(--ds-ansi-bright-yellow)",
  "bright-blue": "var(--ds-ansi-bright-blue)",
  "bright-magenta": "var(--ds-ansi-bright-magenta)",
  "bright-cyan": "var(--ds-ansi-bright-cyan)",
  "bright-white": "var(--ds-ansi-bright-white)",
};

export function RunsView(props: RunsViewProps): React.JSX.Element {
  const [filters, setFilters] = useState<RunFilters>(EMPTY_FILTERS);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    runIdFromHash(location.hash),
  );
  const [detail, setDetail] = useState<DashboardOperationDetail | null>(null);
  const [events, setEvents] = useState<StoredOperationEvent[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [activeTab, setActiveTab] = useState<RunViewTab>("activity");
  const [following, setFollowing] = useState(true);
  const [terminalWrap, setTerminalWrap] = useState(false);
  const [terminalQuery, setTerminalQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const terminalSearchRef = useRef<HTMLInputElement>(null);
  const terminalSearchPending = useRef(false);
  const [relatedHistoryTruncated, setRelatedHistoryTruncated] = useState(false);
  const [repositoryDiff, setRepositoryDiff] =
    useState<RepositoryDiffSummary | null>(null);
  const [repositoryDiffError, setRepositoryDiffError] = useState<string | null>(null);
  const [repositoryDiffLoading, setRepositoryDiffLoading] = useState(false);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | undefined>();
  const [repositoryFileDiff, setRepositoryFileDiff] =
    useState<RepositoryFileDiff | null>(null);
  const [repositoryFileDiffLoading, setRepositoryFileDiffLoading] = useState(false);
  const [diffRefreshEpoch, setDiffRefreshEpoch] = useState(0);
  const activityRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const agentOutputRef = useRef<HTMLDivElement>(null);

  const visibleRootRuns = useMemo(() => topLevelRuns(props.runs), [props.runs]);
  const summary = useMemo(() => summarizeRuns(visibleRootRuns), [visibleRootRuns]);
  const visibleRuns = useMemo(
    () => sortRunsForRail(filterRuns(visibleRootRuns, filters)),
    [filters, visibleRootRuns],
  );
  const groupedRuns = useMemo(() => RUN_QUEUE_ORDER.map((group) => ({
    group,
    runs: visibleRuns.filter((run) => runGroup(run) === group),
  })).filter(({ runs }) => runs.length > 0), [visibleRuns]);
  const activity = useMemo(() => groupActivityEvents(events), [events]);
  const terminalEntries = useMemo(() => terminalEntriesFromEvents(events), [events]);
  const terminalMatchCount = useMemo(
    () => countTerminalMatches(terminalEntries, terminalQuery),
    [terminalEntries, terminalQuery],
  );
  const agentOutput = useMemo(() => agentOutputFromEvents(events), [events]);
  const evidenceItems = useMemo(
    () => evidenceChecklist(detail?.evidence ?? []),
    [detail?.evidence],
  );

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent): void => {
      if (
        event.key !== "/"
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isTypingTarget(event.target)
      ) return;
      event.preventDefault();
      if (terminalSearchRef.current) {
        terminalSearchRef.current.focus();
        return;
      }
      terminalSearchPending.current = true;
      setActiveTab("terminal");
    };
    addEventListener("keydown", handleSearchShortcut);
    return () => removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (activeTab !== "terminal" || !terminalSearchPending.current) return;
    terminalSearchPending.current = false;
    terminalSearchRef.current?.focus();
  }, [activeTab]);
  const projectNames = useMemo(
    () => new Map(props.projects.map((project) => [project.id, project.name])),
    [props.projects],
  );
  const selectedRun = detail?.run
    ?? props.runs.find((run) => run.id === selectedRunId);
  const selectedRelatedRunIds = useMemo(
    () => relatedRunIds(props.runs, selectedRunId),
    [props.runs, selectedRunId],
  );
  const stopTargetRun = useMemo(
    () => stoppableRelatedRun(props.runs, selectedRunId),
    [props.runs, selectedRunId],
  );
  const relatedRunKey = selectedRelatedRunIds.join("\u0000");
  const agentTabAvailable = agentOutputAvailable(selectedRun, agentOutput);
  const historyTruncated = relatedHistoryTruncated
    || selectedRelatedRunIds.some((runId) =>
      props.runs.find((run) => run.id === runId)?.historyTruncated === true
    );

  useEffect(() => {
    if (!selectedRun) return;
    setActiveTab(defaultRunTab(selectedRun));
  }, [selectedRun?.id]);

  useEffect(() => {
    if (visibleRuns.some((run) => run.id === selectedRunId)) return;
    const nextRunId = visibleRuns[0]?.id;
    setSelectedRunId(nextRunId);
    setDetail(null);
    setEvents([]);
    if (nextRunId) {
      const nextRun = visibleRuns.find((run) => run.id === nextRunId);
      setActiveTab(defaultRunTab(nextRun));
      replaceRunHash(nextRunId);
    }
  }, [selectedRunId, visibleRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      setEvents([]);
      setRelatedHistoryTruncated(false);
      setRepositoryDiff(null);
      setSelectedDiffPath(undefined);
      setRepositoryFileDiff(null);
      return;
    }
    let current = true;
    setLoadingDetail(true);
    setLoadError(null);
    void loadRelatedOperationSnapshot(
      selectedRunId,
      selectedRelatedRunIds,
    ).then((snapshot) => {
      if (!current) return;
      setDetail(snapshot.detail);
      setEvents(snapshot.events);
      setRelatedHistoryTruncated(snapshot.historyTruncated);
      setLoadingDetail(false);
      setFollowing(true);
      setCopyStatus("");
    }).catch((error: unknown) => {
      if (!current) return;
      setLoadError(error instanceof Error ? error.message : "Run detail unavailable.");
      setLoadingDetail(false);
    });
    return () => {
      current = false;
    };
  }, [relatedRunKey, selectedRunId]);

  useEffect(() => {
    if (activeTab !== "diff" || !selectedRunId) return;
    let current = true;
    setRepositoryDiffLoading(true);
    setRepositoryDiffError(null);
    void getOperationRepositoryDiff(selectedRunId).then((summary) => {
      if (!current) return;
      setRepositoryDiff(summary);
      setSelectedDiffPath((selected) =>
        summary.files.some(({ path }) => path === selected)
          ? selected
          : summary.files[0]?.path
      );
      setRepositoryDiffLoading(false);
    }).catch((error: unknown) => {
      if (!current) return;
      setRepositoryDiff(null);
      setSelectedDiffPath(undefined);
      setRepositoryFileDiff(null);
      setRepositoryDiffError(
        error instanceof Error ? error.message : "Repository diff unavailable.",
      );
      setRepositoryDiffLoading(false);
    });
    return () => {
      current = false;
    };
  }, [activeTab, diffRefreshEpoch, selectedRunId]);

  useEffect(() => {
    if (activeTab !== "diff" || !selectedRunId || !selectedDiffPath) {
      setRepositoryFileDiff(null);
      return;
    }
    let current = true;
    setRepositoryFileDiffLoading(true);
    setRepositoryFileDiff(null);
    void getOperationRepositoryFileDiff(
      selectedRunId,
      selectedDiffPath,
    ).then((fileDiff) => {
      if (!current) return;
      setRepositoryFileDiff(fileDiff);
      setRepositoryFileDiffLoading(false);
    }).catch((error: unknown) => {
      if (!current) return;
      setRepositoryFileDiff({
        state: "unavailable",
        refreshedAt: new Date().toISOString(),
        message: error instanceof Error
          ? error.message
          : "Selected file diff unavailable.",
      });
      setRepositoryFileDiffLoading(false);
    });
    return () => {
      current = false;
    };
  }, [activeTab, selectedDiffPath, selectedRunId, diffRefreshEpoch]);

  useEffect(() => {
    if (!props.ready) return;
    let resetRetryTimer: ReturnType<typeof setTimeout> | undefined;
    const recoverFromReset = async (): Promise<void> => {
      setLoadingDetail(true);
      setLoadError(null);
      try {
        await props.onRefresh();
        if (selectedRunId) {
          const snapshot = await loadRelatedOperationSnapshot(
            selectedRunId,
            selectedRelatedRunIds,
          );
          setDetail(snapshot.detail);
          setEvents(snapshot.events);
          setRelatedHistoryTruncated(snapshot.historyTruncated);
          setFollowing(true);
        }
        setStreamEpoch((epoch) => epoch + 1);
      } catch (error) {
        setLoadError(error instanceof Error
          ? error.message
          : "Run detail unavailable.");
        resetRetryTimer = setTimeout(() => {
          void props.run(recoverFromReset);
        }, 2_000);
      } finally {
        setLoadingDetail(false);
      }
    };
    setStreamStatus("connecting");
    const closeStream = openOperationStream(props.cursor, {
      onEvent(event) {
        const refreshRun = eventRefreshesRunSnapshot(event);
        if (selectedRelatedRunIds.includes(event.runId)) {
          if (
            event.type === "file.changed"
            || event.type === "run.state_changed"
          ) {
            setDiffRefreshEpoch((epoch) => epoch + 1);
          }
          setEvents((current) => {
            if (current.some(({ cursor }) => cursor === event.cursor)) return current;
            return mergeOperationEvents([...current, event]);
          });
          setDetail((current) => {
            if (event.runId !== selectedRunId) return current;
            if (!current || event.type !== "run.state_changed") return current;
            return {
              ...current,
              run: {
                ...current.run,
                state: event.payload.state,
                assuranceStage: event.payload.assuranceStage,
                updatedAt: event.timestamp,
                latestSequence: Math.max(current.run.latestSequence, event.sequence),
              },
            };
          });
          if (refreshRun) {
            void getOperationRunDetail(event.runId).then((nextDetail) => {
              setDetail((current) => current?.run.id === event.runId ? nextDetail : current);
            }).catch(() => {
              // The event remains visible even if the additive detail refresh races retention.
            });
          }
        }
        if (refreshRun) {
          void props.run(props.onRefresh);
        }
      },
      onState(state) {
        if (state.kind === "ready") {
          setStreamStatus("live");
          return;
        }
        setStreamStatus("snapshot");
        void props.run(recoverFromReset);
      },
      onDisconnect() {
        setStreamStatus("reconnecting");
      },
    });
    return () => {
      closeStream();
      if (resetRetryTimer !== undefined) clearTimeout(resetRetryTimer);
    };
  }, [props.cursor, props.ready, relatedRunKey, selectedRunId, streamEpoch]);

  useEffect(() => {
    if (activeTab === "agent" && !agentTabAvailable) {
      setActiveTab("activity");
    }
  }, [activeTab, agentTabAvailable]);

  useEffect(() => {
    if (!following) return;
    const target = activeTab === "activity"
      ? activityRef.current
      : activeTab === "terminal"
        ? terminalRef.current
        : activeTab === "agent"
          ? agentOutputRef.current
          : null;
    target?.scrollTo({
      top: target.scrollHeight,
      behavior: "auto",
    });
  }, [activeTab, activity, agentOutput, following, terminalEntries]);

  function selectRun(runId: string): void {
    setSelectedRunId(runId);
    setDetail(null);
    setEvents([]);
    setRelatedHistoryTruncated(false);
    setRepositoryDiff(null);
    setRepositoryDiffError(null);
    setSelectedDiffPath(undefined);
    setRepositoryFileDiff(null);
    setActiveTab(defaultRunTab(props.runs.find((run) => run.id === runId)));
    setFollowing(true);
    setCopyStatus("");
    replaceRunHash(runId);
  }

  function observeProjectionScroll(event: UIEvent<HTMLDivElement>): void {
    const element = event.currentTarget;
    const nearEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    if (nearEnd !== following) setFollowing(nearEnd);
  }

  function selectTab(tab: RunViewTab): void {
    setActiveTab(tab);
    setFollowing(true);
    setCopyStatus("");
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        ?? [],
    );
    const current = tabs.indexOf(event.currentTarget);
    if (current < 0 || tabs.length === 0) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  async function copyTerminalSelection(): Promise<void> {
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? "";
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    const selectionInsideTerminal =
      selectedText.length > 0
      && terminalRef.current !== null
      && anchorNode !== null
      && anchorNode !== undefined
      && focusNode !== null
      && focusNode !== undefined
      && terminalRef.current.contains(anchorNode)
      && terminalRef.current.contains(focusNode);
    if (!selectionInsideTerminal) {
      setCopyStatus("Select terminal text to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopyStatus("Selection copied.");
    } catch {
      setCopyStatus("Copy was unavailable. Use the browser copy command.");
    }
  }

  async function requestStop(): Promise<void> {
    if (!detail || !stopTargetRun) return;
    const accepted = confirm(
      "Stop ends the active worker. It does not revert repository changes.",
    );
    if (!accepted) return;
    await props.run(async () => {
      await stopOperationRun(stopTargetRun.id);
      await props.onRefresh();
      setDetail(await getOperationRunDetail(detail.run.id));
    });
  }

  return (
    <section className="runs-screen" aria-label="Runs and live activity">
      <RunSummary summary={summary} />
      <RunFiltersBar
        filters={filters}
        projects={props.projects}
        runs={visibleRootRuns}
        onChange={setFilters}
      />

      {props.runs.length === 0 ? (
        <div className="panel runs-empty">
          <span className="empty-orbit" aria-hidden="true" />
          <p className="eyebrow">Operation history</p>
          <h2>No runs recorded yet</h2>
          <p>Runs appear here when dpkr helix handles MCP tools, process sessions, or local-agent work. No separate run launcher is required.</p>
        </div>
      ) : visibleRuns.length === 0 ? (
        <div className="panel empty-state">
          <h3>No runs match these filters</h3>
          <p>Clear one or more filters to return to the retained operation history.</p>
          <button type="button" className="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="runs-cockpit">
          <aside className="run-rail panel" aria-label="Run action queues">
            <header>
              <div>
                <p className="eyebrow">Retained operations</p>
                <h2>{visibleRuns.length} runs</h2>
              </div>
              <StreamBadge status={streamStatus} />
            </header>
            <div className="run-rail-list">
              {groupedRuns.map(({ group, runs }) => (
                <section className={`run-group queue-${RUN_QUEUE_META[group].tone}`} key={group}>
                  <h3>
                    <span><code>{RUN_QUEUE_META[group].code}</code>{RUN_QUEUE_META[group].label}</span>
                    <b>{runs.length}</b>
                  </h3>
                  {runs.map((run) => (
                    <RunRailItem
                      key={run.id}
                      run={run}
                      projectName={run.projectId ? projectNames.get(run.projectId) : undefined}
                      selected={run.id === selectedRunId}
                      onSelect={() => selectRun(run.id)}
                    />
                  ))}
                </section>
              ))}
            </div>
          </aside>

          <article className="run-stage">
            {loadError ? <div className="notice error" role="alert">{loadError}</div> : null}
            {selectedRun ? (
              <>
                <RunStageHeader
                  run={selectedRun}
                  projectName={selectedRun.projectId
                    ? projectNames.get(selectedRun.projectId)
                    : undefined}
                  streamStatus={streamStatus}
                  stopAvailable={stopTargetRun !== undefined}
                  onStop={() => void requestStop()}
                />
                <div className="activity-toolbar">
                  <div className="run-tabs" role="tablist" aria-label="Run detail views">
                    <button
                      type="button"
                      role="tab"
                      id="run-tab-activity"
                      aria-controls="run-panel-activity"
                      aria-selected={activeTab === "activity"}
                      tabIndex={activeTab === "activity" ? 0 : -1}
                      onClick={() => selectTab("activity")}
                      onKeyDown={handleTabKeyDown}
                    >
                      Activity
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="run-tab-terminal"
                      aria-controls="run-panel-terminal"
                      aria-selected={activeTab === "terminal"}
                      tabIndex={activeTab === "terminal" ? 0 : -1}
                      onClick={() => selectTab("terminal")}
                      onKeyDown={handleTabKeyDown}
                    >
                      {isMcpSessionRun(selectedRun)
                        ? "ChatGPT · MCP live"
                        : selectedRun.kind === "process_session"
                          ? "Live terminal"
                          : "Terminal"}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="run-tab-diff"
                      aria-controls="run-panel-diff"
                      aria-selected={activeTab === "diff"}
                      tabIndex={activeTab === "diff" ? 0 : -1}
                      onClick={() => selectTab("diff")}
                      onKeyDown={handleTabKeyDown}
                    >
                      Diff
                    </button>
                    {agentTabAvailable ? (
                      <button
                        type="button"
                        role="tab"
                        id="run-tab-agent"
                        aria-controls="run-panel-agent"
                        aria-selected={activeTab === "agent"}
                        tabIndex={activeTab === "agent" ? 0 : -1}
                        onClick={() => selectTab("agent")}
                        onKeyDown={handleTabKeyDown}
                      >
                        Agent output
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="tab"
                      id="run-tab-evidence"
                      aria-controls="run-panel-evidence"
                      aria-selected={activeTab === "evidence"}
                      tabIndex={activeTab === "evidence" ? 0 : -1}
                      onClick={() => selectTab("evidence")}
                      onKeyDown={handleTabKeyDown}
                    >
                      Evidence
                    </button>
                  </div>
                  <div className="projection-status">
                    <span>{projectionSummary(
                      activeTab,
                      events.length,
                      activity.length,
                      terminalEntries.length,
                      agentOutput,
                      repositoryDiff,
                      evidenceItems,
                    )}</span>
                    {activeTab === "terminal" ? (
                      <button
                        type="button"
                        className="secondary follow-live"
                        aria-pressed={following}
                        onClick={() => setFollowing((current) => !current)}
                      >
                        {following ? "Following live" : "Follow live"}
                      </button>
                    ) : (
                      activeTab === "activity" || activeTab === "agent"
                    ) && !following ? (
                      <button
                        type="button"
                        className="secondary follow-live"
                        onClick={() => setFollowing(true)}
                      >
                        Follow live
                      </button>
                    ) : activeTab === "activity" || activeTab === "agent"
                      ? <span className="following-label">Following live</span>
                      : null}
                  </div>
                </div>
                {historyTruncated ? (
                  <div className="stream-marker warning">
                    Earlier output or activity is outside the retained history window.
                  </div>
                ) : null}
                {streamStatus !== "live" ? (
                  <div className={`stream-marker ${streamStatus}`}>
                    {streamMessage(streamStatus)}
                  </div>
                ) : null}
                {activeTab === "activity" ? (
                  <div
                    className="activity-feed"
                    id="run-panel-activity"
                    role="tabpanel"
                    aria-labelledby="run-tab-activity"
                    ref={activityRef}
                    onScroll={observeProjectionScroll}
                    aria-busy={loadingDetail}
                  >
                    {loadingDetail ? <ActivitySkeleton /> : null}
                    {!loadingDetail && activity.length === 0 ? (
                      <div className="activity-empty">
                        <span aria-hidden="true" />
                        <p>No retained activity events for this run.</p>
                      </div>
                    ) : null}
                    {activity.map((group) => (
                      <ActivityRow key={group.event.cursor} group={group} />
                    ))}
                  </div>
                ) : null}
                {activeTab === "terminal" ? (
                  <TerminalOutput
                    entries={terminalEntries}
                    loading={loadingDetail}
                    query={terminalQuery}
                    matchCount={terminalMatchCount}
                    wrap={terminalWrap}
                    copyStatus={copyStatus}
                    outputRef={terminalRef}
                    searchRef={terminalSearchRef}
                    onQueryChange={setTerminalQuery}
                    onWrapChange={setTerminalWrap}
                    onCopySelection={() => void copyTerminalSelection()}
                    onScroll={observeProjectionScroll}
                  />
                ) : null}
                {activeTab === "diff" ? (
                  <RepositoryDiffPanel
                    summary={repositoryDiff}
                    summaryError={repositoryDiffError}
                    summaryLoading={repositoryDiffLoading}
                    selectedPath={selectedDiffPath}
                    fileDiff={repositoryFileDiff}
                    fileDiffLoading={repositoryFileDiffLoading}
                    onSelectPath={setSelectedDiffPath}
                    onRefresh={() => setDiffRefreshEpoch((epoch) => epoch + 1)}
                  />
                ) : null}
                {activeTab === "agent" ? (
                  <AgentOutput
                    projection={agentOutput}
                    run={selectedRun}
                    outputRef={agentOutputRef}
                    onScroll={observeProjectionScroll}
                  />
                ) : null}
                {activeTab === "evidence" ? (
                  <EvidencePanel
                    run={selectedRun}
                    items={evidenceItems}
                  />
                ) : null}
              </>
            ) : null}
          </article>

        </div>
      )}
    </section>
  );
}

function RunSummary(props: {
  summary: ReturnType<typeof summarizeRuns>;
}): React.JSX.Element {
  const items = [
    [RUN_QUEUE_META.Now, props.summary.now],
    [RUN_QUEUE_META.Action, props.summary.action],
    [RUN_QUEUE_META.Review, props.summary.review],
    [RUN_QUEUE_META.Standby, props.summary.standby],
    [RUN_QUEUE_META.Archive, props.summary.archive],
  ] as const;
  return (
    <div className="run-summary-grid" aria-label="Action queue summary">
      {items.map(([queue, value]) => (
        <div className={`run-summary-card queue-${queue.tone}`} key={queue.label}>
          <span><small>{queue.code}</small>{queue.label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function RunFiltersBar(props: {
  filters: RunFilters;
  projects: ProjectView[];
  runs: StoredOperationRun[];
  onChange(filters: RunFilters): void;
}): React.JSX.Element {
  const options = {
    source: [...new Set(props.runs.map((run) => run.source))].sort(),
    kind: [...new Set(props.runs.map((run) => run.kind))].sort(),
    state: [...new Set(props.runs.map((run) => run.state))].sort(),
    assuranceStage: [...new Set(props.runs.map((run) => run.assuranceStage))].sort(),
  };
  function select<K extends keyof RunFilters>(key: K, value: RunFilters[K]): void {
    props.onChange({ ...props.filters, [key]: value });
  }
  return (
    <div className="runs-filterbar" aria-label="Run filters">
      <CompactSelect
        label="Project"
        value={props.filters.projectId}
        options={props.projects.map(({ id, name }) => [id, name])}
        onChange={(value) => select("projectId", value)}
      />
      <CompactSelect
        label="Source"
        value={props.filters.source}
        options={options.source.map((value) => [value, value])}
        onChange={(value) => select("source", value)}
      />
      <CompactSelect
        label="Kind"
        value={props.filters.kind}
        options={options.kind.map((value) => [value, humanize(value)])}
        onChange={(value) => select("kind", value)}
      />
      <CompactSelect
        label="State"
        value={props.filters.state}
        options={options.state.map((value) => [value, humanize(value)])}
        onChange={(value) => select("state", value)}
      />
      <CompactSelect
        label="Assurance"
        value={props.filters.assuranceStage}
        options={options.assuranceStage.map((value) => [value, humanize(value)])}
        onChange={(value) => select("assuranceStage", value)}
      />
      <CompactSelect
        label="Updated"
        value={props.filters.timeRange}
        options={[
          ["hour", "Last hour"],
          ["day", "Last 24 hours"],
          ["week", "Last 7 days"],
        ]}
        onChange={(value) => select("timeRange", value as RunFilters["timeRange"])}
      />
    </div>
  );
}

function CompactSelect(props: {
  label: string;
  value: string;
  options: string[][];
  onChange(value: string): void;
}): React.JSX.Element {
  return (
    <label className="run-filter">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">All</option>
        {props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function RunRailItem(props: {
  run: StoredOperationRun;
  projectName?: string;
  selected: boolean;
  onSelect(): void;
}): React.JSX.Element {
  const presentation = runPresentation(props.run.state, props.run.assuranceStage);
  return (
    <button
      type="button"
      className={`run-rail-item ${presentation.tone} ${props.selected ? "selected" : ""}`}
      aria-pressed={props.selected}
      onClick={props.onSelect}
    >
      <span className="run-state-glyph" aria-hidden="true" />
      <span className="run-rail-copy">
        <strong>{props.run.title}</strong>
        <small>{props.projectName ?? props.run.projectId ?? "Unscoped"} · {humanize(props.run.kind)}</small>
        <span className="run-rail-foot">
          <span>{presentation.label}</span>
          <time dateTime={props.run.updatedAt}>{formatRelativeTime(props.run.updatedAt)}</time>
        </span>
      </span>
    </button>
  );
}

function RunStageHeader(props: {
  run: StoredOperationRun;
  projectName?: string;
  streamStatus: StreamStatus;
  stopAvailable: boolean;
  onStop(): void;
}): React.JSX.Element {
  const presentation = runPresentation(props.run.state, props.run.assuranceStage);
  const queue = RUN_QUEUE_META[runGroup(props.run)];
  return (
    <header className="run-stage-header">
      <div className="run-stage-statusline">
        <span className={`run-queue-label queue-${queue.tone}`}>
          <b>{queue.code}</b>
          {queue.label}
        </span>
        <span className={`run-status-label ${presentation.tone}`}>
          <span aria-hidden="true" />
          {presentation.label}
        </span>
        <code>{shortRunId(props.run.id)}</code>
        <span className={`live-word ${props.streamStatus === "live" ? "connected" : ""}`}>
          {props.streamStatus === "live" ? "Live stream" : "Snapshot"}
        </span>
      </div>
      <div className="run-title-row">
        <div>
          <p className="eyebrow">{props.projectName ?? props.run.projectId ?? "Unscoped operation"}</p>
          <h2>{props.run.title}</h2>
        </div>
        {props.stopAvailable ? (
          <button type="button" className="danger" onClick={props.onStop}>
            Stop active worker
          </button>
        ) : null}
      </div>
      <p className="current-action">
        <span><b>{queue.code}</b>Next action</span>
        <strong>{nextActionForRun(props.run)}</strong>
      </p>
      <div className="run-meta-strip">
        <span><small>Source</small>{props.run.source}</span>
        <span><small>Workspace</small>{props.run.workspaceId ? shortRunId(props.run.workspaceId) : "None"}</span>
        <span><small>Phase</small>{props.run.phase ?? "—"}</span>
        <span><small>Duration</small>{formatRunDuration(props.run)}</span>
      </div>
      {props.stopAvailable ? (
        <p className="stop-explainer">Stop ends the active worker. It does not revert repository changes.</p>
      ) : null}
    </header>
  );
}

function ActivityRow(props: {
  group: ReturnType<typeof groupActivityEvents>[number];
}): React.JSX.Element {
  const { event, count, firstSequence, lastSequence } = props.group;
  return (
    <article className={`activity-row level-${event.level}`}>
      <div className="activity-sequence" aria-hidden="true">
        <span />
      </div>
      <div className="activity-main">
        <div className="activity-heading">
          <div>
            <span className="event-type">{eventLabel(event.type)}</span>
            <strong>{event.summary}</strong>
          </div>
          <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
        </div>
        <div className="activity-source">
          <code>#{count > 1 ? `${firstSequence}–${lastSequence}` : event.sequence}</code>
          {count > 1 ? <span>{count} consecutive output events</span> : null}
          <span>{humanize(event.level)}</span>
        </div>
        <details>
          <summary>Details</summary>
          <pre>{eventDetails(event)}</pre>
        </details>
      </div>
    </article>
  );
}

function TerminalOutput(props: {
  entries: TerminalEntry[];
  loading: boolean;
  query: string;
  matchCount: number;
  wrap: boolean;
  copyStatus: string;
  outputRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  onQueryChange(value: string): void;
  onWrapChange(value: boolean): void;
  onCopySelection(): void;
  onScroll(event: UIEvent<HTMLDivElement>): void;
}): React.JSX.Element {
  const truncated = props.entries.some((entry) => entry.truncated);
  return (
    <section
      className="terminal-projection"
      id="run-panel-terminal"
      role="tabpanel"
      aria-labelledby="run-tab-terminal"
    >
      <div className="projection-toolbar terminal-toolbar">
        <div className="terminal-live-label" aria-live="polite">
          <span aria-hidden="true" />
          <strong>Live output</strong>
          <small>{props.entries.length} retained chunks</small>
        </div>
        <label>
          <span>Search output</span>
          <input
            ref={props.searchRef}
            type="search"
            value={props.query}
            placeholder="Find retained text"
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          />
        </label>
        <span className="match-count" aria-live="polite">
          {props.query.trim() ? `${props.matchCount} matches` : "Search retained output"}
        </span>
        <button
          type="button"
          className="secondary compact-control"
          aria-pressed={props.wrap}
          onClick={() => props.onWrapChange(!props.wrap)}
        >
          Wrap {props.wrap ? "on" : "off"}
        </button>
        <button
          type="button"
          className="secondary compact-control"
          onClick={props.onCopySelection}
        >
          Copy selection
        </button>
        <span className="copy-status" role="status">{props.copyStatus}</span>
      </div>
      {truncated ? (
        <div className="output-truncation" role="note">
          One or more process chunks were truncated before storage.
        </div>
      ) : null}
      <div
        className={`terminal-viewer ${props.wrap ? "wrap" : ""}`}
        ref={props.outputRef}
        onScroll={props.onScroll}
        aria-busy={props.loading}
        tabIndex={0}
      >
        {props.loading ? <ActivitySkeleton /> : null}
        {!props.loading && props.entries.length === 0 ? (
          <div className="terminal-empty">
            <strong>No terminal stream</strong>
            <span>The selected run has no retained canonical process output.</span>
          </div>
        ) : null}
        {props.entries.map((entry) => (
          <div
            className={`terminal-entry stream-${entry.stream}`}
            key={entry.cursor}
            data-sequence={entry.sequence}
          >
            <span className="terminal-stream-label">{entry.stream}</span>
            <pre>
              {highlightTerminalSegments(entry.segments, props.query).map((segment, index) => (
                <span
                  className={segment.matched ? "terminal-match" : undefined}
                  style={terminalTextStyle(segment.style)}
                  key={`${entry.cursor}-${index}`}
                >
                  {segment.text}
                </span>
              ))}
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentOutput(props: {
  projection: AgentOutputProjection;
  run: StoredOperationRun;
  outputRef: RefObject<HTMLDivElement | null>;
  onScroll(event: UIEvent<HTMLDivElement>): void;
}): React.JSX.Element {
  return (
    <section
      className="agent-output-projection"
      id="run-panel-agent"
      role="tabpanel"
      aria-labelledby="run-tab-agent"
    >
      <header className="agent-output-identity">
        <div>
          <span>Provider</span>
          <strong>{humanize(props.run.source)}</strong>
        </div>
        <div>
          <span>Agent session</span>
          <code>{props.projection.agentId ?? props.run.sourceRunId ?? "Unavailable"}</code>
        </div>
        <div>
          <span>Result state</span>
          <strong>{agentResultStateLabel(props.run, props.projection)}</strong>
        </div>
      </header>
      {props.projection.truncated ? (
        <div className="output-truncation" role="note">
          One or more provider messages were truncated before storage.
        </div>
      ) : null}
      {props.run.state === "failed" ? (
        <div className="provider-failure" role="alert">
          <strong>Provider run failed</strong>
          <span>{props.run.failureSummary
            ?? "No raw provider error was retained in the operation stream."}</span>
        </div>
      ) : null}
      <div
        className="agent-output-feed"
        ref={props.outputRef}
        onScroll={props.onScroll}
        tabIndex={0}
      >
        {props.projection.messages.map((message) => (
          <article className="agent-message" key={message.cursor}>
            <header>
              <strong>Assistant message</strong>
              <time dateTime={message.timestamp}>{formatTimestamp(message.timestamp)}</time>
            </header>
            <pre>{message.text}</pre>
          </article>
        ))}
        {props.projection.finalResponse ? (
          <article className="agent-result">
            <header>
              <div>
                <span className="agent-result-label">Agent result</span>
                <strong>Verification is separate</strong>
              </div>
              <time dateTime={props.projection.finalResponse.timestamp}>
                {formatTimestamp(props.projection.finalResponse.timestamp)}
              </time>
            </header>
            <pre>{props.projection.finalResponse.text}</pre>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function RepositoryDiffPanel(props: {
  summary: RepositoryDiffSummary | null;
  summaryError: string | null;
  summaryLoading: boolean;
  selectedPath: string | undefined;
  fileDiff: RepositoryFileDiff | null;
  fileDiffLoading: boolean;
  onSelectPath(path: string): void;
  onRefresh(): void;
}): React.JSX.Element {
  const summary = props.summary;
  return (
    <section
      className="repository-diff"
      id="run-panel-diff"
      role="tabpanel"
      aria-labelledby="run-tab-diff"
      aria-busy={props.summaryLoading || props.fileDiffLoading}
    >
      <header className="repository-diff-header">
        <div>
          <strong>Current repository changes</strong>
          <span>Working tree against HEAD · repository evidence, not provider text</span>
        </div>
        <button
          type="button"
          className="secondary compact-control"
          onClick={props.onRefresh}
          disabled={props.summaryLoading}
        >
          Refresh
        </button>
      </header>
      {props.summaryError ? (
        <div className="repository-unavailable" role="alert">
          <strong>Repository unavailable</strong>
          <span>{props.summaryError}</span>
        </div>
      ) : null}
      {summary?.state === "unavailable" ? (
        <div className="repository-unavailable" role="status">
          <strong>Repository unavailable</strong>
          <span>{summary.message ?? "Current repository state could not be read."}</span>
        </div>
      ) : null}
      {summary?.state === "available" ? (
        <>
          <div className="repository-diff-summary">
            <span>{summary.files.length} changed {summary.files.length === 1 ? "file" : "files"}</span>
            <b className="diff-additions">+{summary.additions}</b>
            <b className="diff-removals">−{summary.removals}</b>
            <code>{summary.branch ?? "detached HEAD"}</code>
            {summary.statsIncomplete ? (
              <small>Totals exclude files whose line statistics are unavailable.</small>
            ) : null}
          </div>
          {summary.files.length === 0 ? (
            <div className="repository-diff-empty">
              <strong>Working tree clean</strong>
              <span>No repository changes are present relative to HEAD.</span>
            </div>
          ) : (
            <div className="repository-diff-layout">
              <nav className="repository-file-rail" aria-label="Changed repository files">
                {summary.files.map((file) => (
                  <button
                    type="button"
                    className={file.path === props.selectedPath ? "selected" : undefined}
                    aria-current={file.path === props.selectedPath ? "true" : undefined}
                    onClick={() => props.onSelectPath(file.path)}
                    key={`${file.previousPath ?? ""}->${file.path}`}
                  >
                    <span className={`file-operation ${file.operation}`}>
                      {repositoryOperationCode(file.operation)}
                    </span>
                    <span>
                      <code>{file.path}</code>
                      {file.previousPath ? <small>from {file.previousPath}</small> : null}
                    </span>
                    <span className="file-stats">
                      {file.additions === undefined ? "—" : `+${file.additions}`}
                      {" / "}
                      {file.removals === undefined ? "—" : `−${file.removals}`}
                    </span>
                  </button>
                ))}
              </nav>
              <div className="repository-file-diff">
                {props.fileDiffLoading ? <ActivitySkeleton /> : null}
                {!props.fileDiffLoading && props.fileDiff?.state === "unavailable" ? (
                  <div className="repository-unavailable" role="status">
                    <strong>File diff unavailable</strong>
                    <span>{props.fileDiff.message
                      ?? "The selected repository diff could not be rendered."}</span>
                  </div>
                ) : null}
                {!props.fileDiffLoading
                  && props.fileDiff?.state === "available"
                  && props.fileDiff.patch ? (
                    <PatchDiff
                      patch={props.fileDiff.patch}
                      options={{
                        theme: { light: "pierre-light", dark: "pierre-dark" },
                        themeType: "system",
                        diffStyle: "unified",
                        diffIndicators: "bars",
                        hunkSeparators: "line-info",
                        lineDiffType: "word-alt",
                        overflow: "scroll",
                        collapsedContextThreshold: 4,
                        expansionLineCount: 20,
                        stickyHeader: false,
                        disableFileHeader: false,
                      }}
                    />
                  ) : null}
                {!props.fileDiffLoading
                  && props.fileDiff?.state === "available"
                  && !props.fileDiff.patch ? (
                    <div className="repository-diff-empty">
                      <strong>No textual patch</strong>
                      <span>The repository reports this change without a renderable text diff.</span>
                    </div>
                  ) : null}
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function EvidencePanel(props: {
  run: StoredOperationRun;
  items: EvidenceChecklistItem[];
}): React.JSX.Element {
  const overall = runPresentation(props.run.state, props.run.assuranceStage);
  return (
    <section
      className="expanded-evidence"
      id="run-panel-evidence"
      role="tabpanel"
      aria-labelledby="run-tab-evidence"
    >
      <header>
        <div>
          <span>Overall assurance</span>
          <strong className={`status-${overall.tone}`}>{overall.label}</strong>
        </div>
        <p>Only explicit command, review, and Project State evidence changes assurance.</p>
      </header>
      <div className="expanded-evidence-list">
        {props.items.map((item) => (
          <article className={`evidence-card state-${item.state}`} key={item.type}>
            <header>
              <span className={`evidence-state ${item.state}`} aria-hidden="true" />
              <div>
                <strong>{item.type === "goal_state"
                  ? "Goal / Project State"
                  : humanize(item.type)}</strong>
                <span>{humanize(item.state)}</span>
              </div>
            </header>
            <dl>
              <div>
                <dt>Result</dt>
                <dd>{item.summary ?? "No explicit result summary retained."}</dd>
              </div>
              <div>
                <dt>Origin</dt>
                <dd>{item.sourceLabel}</dd>
              </div>
              <div>
                <dt>Timestamp</dt>
                <dd>{item.timestamp ? formatTimestamp(item.timestamp) : "Not recorded"}</dd>
              </div>
            </dl>
            {item.missingRequirement ? (
              <p className="evidence-gap">{item.missingRequirement}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function terminalTextStyle(style: TerminalTextStyle): CSSProperties {
  let color = style.foreground ? TERMINAL_COLORS[style.foreground] : undefined;
  let backgroundColor = style.background ? TERMINAL_COLORS[style.background] : undefined;
  if (style.inverse) {
    [color, backgroundColor] = [
      backgroundColor ?? "var(--ds-terminal-bg)",
      color ?? "var(--ds-terminal-text)",
    ];
  }
  return {
    color,
    backgroundColor,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textDecoration: style.underline ? "underline" : undefined,
    opacity: style.dim ? 0.68 : undefined,
  };
}

function projectionSummary(
  tab: RunViewTab,
  eventCount: number,
  activityCount: number,
  terminalCount: number,
  agentOutput: AgentOutputProjection,
  repositoryDiff: RepositoryDiffSummary | null,
  evidence: EvidenceChecklistItem[],
): string {
  if (tab === "activity") return `${eventCount} events / ${activityCount} groups`;
  if (tab === "terminal") return `${terminalCount} retained chunks`;
  if (tab === "diff") {
    return repositoryDiff?.state === "available"
      ? `${repositoryDiff.files.length} current repository changes`
      : "Repository state";
  }
  if (tab === "evidence") {
    return `${evidence.filter(({ state }) => state === "passed").length} / ${
      evidence.length
    } passed`;
  }
  return `${
    agentOutput.messages.length + (agentOutput.finalResponse ? 1 : 0)
  } retained messages`;
}

function repositoryOperationCode(
  operation: RepositoryDiffSummary["files"][number]["operation"],
): string {
  return {
    untracked: "?",
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
  }[operation];
}

function StreamBadge(props: { status: StreamStatus }): React.JSX.Element {
  return (
    <span className={`stream-badge ${props.status}`} aria-live="polite">
      <span aria-hidden="true" />
      {props.status === "live" ? "Live" : humanize(props.status)}
    </span>
  );
}

function ActivitySkeleton(): React.JSX.Element {
  return (
    <div className="activity-skeleton" aria-label="Loading activity">
      <span /><span /><span />
    </div>
  );
}

function streamMessage(status: StreamStatus): string {
  if (status === "connecting") return "Connecting to the durable operation stream.";
  if (status === "reconnecting") return "Live stream disconnected. The retained snapshot remains available while reconnecting.";
  if (status === "snapshot") return "Stream history changed. Refreshing from the latest durable snapshot.";
  return "";
}

function runIdFromHash(hash: string): string | undefined {
  const match = /^#\/runs\/(.+)$/i.exec(hash);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function replaceRunHash(runId: string): void {
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#/runs/${encodeURIComponent(runId)}`,
  );
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function formatRelativeTime(timestamp: string): string {
  const seconds = Math.round((Date.parse(timestamp) - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function formatTimestamp(timestamp: string): string {
  const value = new Date(timestamp);
  if (!Number.isFinite(value.getTime())) return timestamp;
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isMcpSessionRun(
  run: StoredOperationRun | undefined,
): boolean {
  return run?.kind === "mcp_tool"
    && run.source === "mcp"
    && run.sourceRunId?.startsWith("mcp-session:") === true;
}

function defaultRunTab(
  run: StoredOperationRun | undefined,
): RunViewTab {
  return run?.kind === "process_session" || isMcpSessionRun(run)
    ? "terminal"
    : "activity";
}

async function loadRelatedOperationSnapshot(
  selectedRunId: string,
  relatedRunIds: string[],
): Promise<{
  detail: DashboardOperationDetail;
  events: StoredOperationEvent[];
  historyTruncated: boolean;
}> {
  const [detail, eventPages] = await Promise.all([
    getOperationRunDetail(selectedRunId),
    Promise.all(relatedRunIds.map((runId) => getOperationEvents(runId))),
  ]);
  return {
    detail,
    events: mergeOperationEvents(eventPages.flatMap((page) => page.events)),
    historyTruncated: eventPages.some((page) => page.historyTruncated),
  };
}

function mergeOperationEvents(
  events: StoredOperationEvent[],
): StoredOperationEvent[] {
  const byCursor = new Map<number, StoredOperationEvent>();
  for (const event of events) byCursor.set(event.cursor, event);
  return [...byCursor.values()].sort((left, right) => left.cursor - right.cursor);
}

function eventLabel(type: StoredOperationEvent["type"]): string {
  const [owner, action] = type.split(".");
  return `${humanize(owner ?? type)} · ${humanize(action ?? "")}`;
}

function eventDetails(event: StoredOperationEvent): string {
  if (event.type === "process.output") return event.payload.text;
  if (event.type === "agent.message" || event.type === "agent.result_available") return event.payload.text;
  if (event.type === "agent.input_required") return event.payload.question;
  return JSON.stringify(event.payload, null, 2);
}

function eventRefreshesRunSnapshot(event: StoredOperationEvent): boolean {
  return event.type === "run.created"
    || event.type === "run.state_changed"
    || event.type === "tool.started"
    || event.type === "tool.completed"
    || event.type === "tool.failed"
    || event.type === "process.started"
    || event.type === "process.exited"
    || event.type === "agent.status_changed"
    || event.type === "agent.result_available" || event.type === "agent.input_required"
    || event.type === "verification.started"
    || event.type === "verification.completed";
}
