import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import * as z from "zod/v4";
import { OperationEventBus } from "./operation-event-bus.js";
import { OperationRunService } from "./operation-run-service.js";
import { OperationStore } from "./operation-store.js";
import {
  attachMcpToolResultProjection,
  currentMcpOperationRunId,
  installMcpToolOperationProjection,
  McpToolOperationProjector,
} from "./mcp-tool-operation-projector.js";
import { ProcessSessionOperationProjector } from "./process-session-projector.js";

const stateDir = await mkdtemp(join(tmpdir(), "devspace-mcp-projector-test-"));
const store = new OperationStore(stateDir);
const bus = new OperationEventBus();
const createdRunIds: string[] = [];
bus.subscribe((event) => {
  if (event.type === "run.created") createdRunIds.push(event.runId);
});
const times = [
  "2026-07-29T03:00:00.000Z",
  "2026-07-29T03:00:01.000Z",
  "2026-07-29T03:00:02.000Z",
  "2026-07-29T03:00:03.000Z",
  "2026-07-29T03:00:04.000Z",
  "2026-07-29T03:00:05.000Z",
  "2026-07-29T03:00:06.000Z",
  "2026-07-29T03:00:07.000Z",
  "2026-07-29T03:00:08.000Z",
  "2026-07-29T03:00:09.000Z",
];
const service = new OperationRunService(store, {
  eventBus: bus,
  now: () => times.shift() ?? "2026-07-29T03:01:00.000Z",
});
let nowMs = 100;
const projector = new McpToolOperationProjector(service, {
  resolveWorkspace: (workspaceId) =>
    workspaceId === "ws_known"
      ? { workspaceId, projectId: "prj_known" }
      : undefined,
  now: () => times.shift() ?? "2026-07-29T03:01:00.000Z",
  nowMs: () => nowMs++,
});
const server = new McpServer({ name: "projection-test", version: "1.0.0" });
installMcpToolOperationProjection(server, projector);

registerAppTool(
  server,
  "write_fixture",
  {
    inputSchema: {
      workspaceId: z.string(),
      content: z.string(),
    },
    outputSchema: {
      result: z.string(),
    },
    _meta: {},
  },
  async () =>
    attachMcpToolResultProjection({
      content: [{ type: "text", text: "written" }],
      structuredContent: { result: "written" },
    }, {
      fileChanges: [{
        relativePath: "src/fixture.ts",
        operation: "update",
      }],
    }),
);

registerAppTool(
  server,
  "failure_fixture",
  {
    inputSchema: { workspaceId: z.string() },
    _meta: {},
  },
  async () => ({
    isError: true,
    content: [{ type: "text", text: "Bearer must-not-be-persisted" }],
  }),
);

registerAppTool(
  server,
  "throw_fixture",
  {
    inputSchema: { workspaceId: z.string() },
    _meta: {},
  },
  async () => {
    throw new Error("secret failure detail");
  },
);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "projection-client", version: "1.0.0" });

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const writeTool = tools.tools.find((tool) => tool.name === "write_fixture");
  assert.ok(writeTool);
  assert.deepEqual(Object.keys(writeTool.outputSchema?.properties ?? {}), ["result"]);

  const written = await client.callTool({
    name: "write_fixture",
    arguments: {
      workspaceId: "ws_known",
      content: "Bearer input-must-not-be-persisted",
    },
  });
  assert.equal(written.isError, undefined);
  assert.deepEqual(written.structuredContent, { result: "written" });

  const writeRun = store.getRun(createdRunIds[0] ?? "");
  assert.ok(writeRun);
  assert.equal(writeRun.workspaceId, "ws_known");
  assert.equal(writeRun.projectId, "prj_known");
  assert.equal(writeRun.state, "completed");
  assert.deepEqual(
    store.listEvents(writeRun.id).map((event) => event.type),
    [
      "run.created",
      "tool.started",
      "file.changed",
      "tool.completed",
      "run.state_changed",
    ],
  );
  assert.deepEqual(
    store.listEvents(writeRun.id)
      .find((event) => event.type === "file.changed")
      ?.payload,
    {
      relativePath: "src/fixture.ts",
      operation: "update",
    },
  );

  await projector.invoke(
    {
      toolName: "open_workspace",
      input: { path: "not-persisted" },
      requestId: 1,
    },
    async () => ({
      content: [{ type: "text" as const, text: "opened" }],
      structuredContent: {
        workspaceId: "ws_opened",
        project: { id: "prj_opened" },
        mode: "checkout",
      },
    }),
  );
  const openedRun = store.getRun(createdRunIds[1] ?? "");
  assert.ok(openedRun);
  assert.equal(openedRun.sourceRunId, undefined);
  assert.equal(openedRun.workspaceId, "ws_opened");
  assert.equal(openedRun.projectId, "prj_opened");
  assert.equal(
    store.listEvents(openedRun.id)
      .some((event) => event.type === "workspace.opened"),
    true,
  );

  const failed = await client.callTool({
    name: "failure_fixture",
    arguments: { workspaceId: "ws_known" },
  });
  assert.equal(failed.isError, true);
  const failureRun = store.getRun(createdRunIds[2] ?? "");
  assert.ok(failureRun);
  assert.equal(failureRun.state, "failed");
  assert.deepEqual(
    store.listEvents(failureRun.id).map((event) => event.type),
    ["run.created", "tool.started", "tool.failed", "run.state_changed"],
  );

  const thrown = await client.callTool({
    name: "throw_fixture",
    arguments: { workspaceId: "ws_known" },
  });
  assert.equal(thrown.isError, true);
  const throwRun = store.getRun(createdRunIds[3] ?? "");
  assert.ok(throwRun);
  assert.equal(throwRun.state, "failed");

  const persisted = JSON.stringify([
    ...store.listEvents(writeRun.id),
    ...store.listEvents(failureRun.id),
    ...store.listEvents(throwRun.id),
  ]);
  assert.doesNotMatch(persisted, /input-must-not-be-persisted|must-not-be-persisted|secret failure detail/);

  const frozenResult = Object.freeze({
    content: [{ type: "text" as const, text: "frozen canonical result" }],
  });
  assert.equal(
    attachMcpToolResultProjection(frozenResult, {
      fileChanges: [{
        relativePath: "ignored.txt",
        operation: "create",
      }],
    }),
    frozenResult,
  );

  const projectionTrap = new Proxy(
    { content: [{ type: "text" as const, text: "canonical result" }] },
    {
      get(target, property, receiver) {
        if (property === "structuredContent" || property === "isError") {
          throw new Error("projection trap");
        }
        return Reflect.get(target, property, receiver);
      },
    },
  ) as CallToolResult;
  assert.equal(
    await projector.invoke(
      {
        toolName: "projection_trap_fixture",
        input: { workspaceId: "ws_known" },
      },
      async () => projectionTrap,
    ),
    projectionTrap,
  );

  const sessionId = "session-fixture";
  const sessionProjector = new McpToolOperationProjector(service, {
    resolveSessionId: () => sessionId,
    resolveWorkspace: (workspaceId) => ({ workspaceId, projectId: "prj_known" }),
    findRunBySource: (kind, source, sourceRunId) =>
      store.findRunBySource(kind, source, sourceRunId),
  });
  let observedContextRunId: string | undefined;
  await sessionProjector.invoke(
    {
      toolName: "read",
      input: {
        workspaceId: "ws_known",
        path: "src/fixture.ts",
        content: "Bearer input-must-not-be-persisted",
      },
    },
    async () => {
      observedContextRunId = currentMcpOperationRunId();
      return {
        content: [{ type: "text" as const, text: "not projected" }],
      };
    },
  );
  const sessionRun = store.findRunBySource(
    "mcp_tool",
    "mcp",
    `mcp-session:${sessionId}`,
  );
  assert.ok(sessionRun);
  assert.equal(observedContextRunId, sessionRun.id);
  assert.equal(sessionRun.state, "running");
  assert.equal(sessionRun.title, "MCP client activity");
  assert.deepEqual(
    store.listEvents(sessionRun.id).map((event) => event.type),
    ["run.created", "tool.started", "file.read", "tool.completed"],
  );

  const processProjector = new ProcessSessionOperationProjector(service);
  await sessionProjector.invoke(
    {
      toolName: "exec_command",
      input: { workspaceId: "ws_known", cmd: "not persisted" },
    },
    async () => {
      processProjector.started({
        sessionId: 77,
        workspaceId: "ws_known",
        tty: false,
      });
      processProjector.output({
        sessionId: 77,
        workspaceId: "ws_known",
        stream: "stdout",
        text: "tests passed\n",
      });
      processProjector.exited({
        sessionId: 77,
        workspaceId: "ws_known",
        exitCode: 0,
        wallTimeMs: 5,
      });
      return {
        content: [{ type: "text" as const, text: "command completed" }],
      };
    },
  );
  const processRun = store.findRunBySource("process_session", "mcp", "process:77");
  assert.ok(processRun);
  assert.equal(processRun.parentRunId, sessionRun.id);

  await sessionProjector.invoke(
    {
      toolName: "read",
      input: { workspaceId: "ws_known", path: "src/.." },
    },
    async () => ({
      content: [{ type: "text" as const, text: "not projected" }],
    }),
  );
  assert.deepEqual(
    store.listEvents(sessionRun.id)
      .filter((event) => event.type === "file.read")
      .map((event) => event.payload.relativePath),
    ["src/fixture.ts"],
  );

  await sessionProjector.invoke(
    {
      toolName: "failure_fixture",
      input: { workspaceId: "ws_known" },
    },
    async () => ({
      isError: true,
      content: [{ type: "text" as const, text: "not projected" }],
    }),
  );
  assert.equal(store.getRun(sessionRun.id)?.state, "running");
  assert.equal(
    store.listEvents(sessionRun.id).some((event) => event.type === "warning"),
    true,
  );
  assert.doesNotMatch(
    JSON.stringify(store.listEvents(sessionRun.id)),
    /input-must-not-be-persisted|not persisted|not projected/,
  );

  sessionProjector.sessionClosed(sessionId);
  assert.equal(store.getRun(sessionRun.id)?.state, "completed");

  store.close();
  const unaffected = await projector.invoke(
    {
      toolName: "store_failure_fixture",
      input: { workspaceId: "ws_known" },
      requestId: "Bearer unsafe-request-id",
    },
    async () => ({
      content: [{ type: "text" as const, text: "canonical success" }],
    }),
  );
  assert.equal(unaffected.content[0]?.type, "text");
} finally {
  await client.close().catch(() => undefined);
  await server.close().catch(() => undefined);
  try {
    store.close();
  } catch {
    // The store is intentionally closed before the projection-failure proof.
  }
  await rm(stateDir, { recursive: true, force: true });
}
