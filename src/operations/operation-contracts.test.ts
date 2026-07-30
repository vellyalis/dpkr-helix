import type {
  OperationEvent,
  OperationEventPayloadMap,
  OperationEventType,
  OperationRun,
} from "./operation-contracts.js";

const requiredEventTypes = [
  "run.created",
  "run.state_changed",
  "workspace.opened",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "file.read",
  "file.changed",
  "process.started",
  "process.output",
  "process.exited",
  "agent.status_changed",
  "agent.message",
  "agent.result_available",
  "verification.started",
  "verification.completed",
  "review.finding",
  "review.completed",
  "project_state.updated",
  "warning",
  "failure",
] as const satisfies readonly OperationEventType[];

type MissingEventType = Exclude<OperationEventType, (typeof requiredEventTypes)[number]>;
type UnexpectedEventType = Exclude<(typeof requiredEventTypes)[number], OperationEventType>;
const eventTypeCoverage: [MissingEventType, UnexpectedEventType] extends [never, never]
  ? true
  : never = true;

const resultAvailableRun = {
  id: "run_local_agent_1",
  kind: "local_agent",
  source: "codex",
  sourceRunId: "agt_12345678",
  title: "Focused task",
  state: "completed",
  assuranceStage: "result_available",
  startedAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:01:00.000Z",
  finishedAt: "2026-07-29T00:01:00.000Z",
  stoppable: false,
} satisfies OperationRun;

const safeAgentResult = {
  runId: resultAvailableRun.id,
  sequence: 4,
  type: "agent.result_available",
  timestamp: resultAvailableRun.updatedAt,
  level: "info",
  summary: "Agent result is available for independent verification.",
  payload: {
    agentId: resultAvailableRun.sourceRunId,
    text: "Focused result",
    truncated: false,
  },
} satisfies OperationEvent<"agent.result_available">;

const processOutputPayload = {
  stream: "combined",
  text: "bounded, redacted output",
  truncated: false,
} satisfies OperationEventPayloadMap["process.output"];

void eventTypeCoverage;
void safeAgentResult;
void processOutputPayload;

console.log(`operation contract fixtures passed (${requiredEventTypes.length} event types)`);
