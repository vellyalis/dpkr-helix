import assert from "node:assert/strict";
import {
  bootstrapSession,
  getCsrfToken,
  getOperationEvents,
  getOperationRunDetail,
  getOperationRuns,
  getOperationSnapshot,
  getProjectGitStatus,
  scanProjects,
  getStatus,
  stopOperationRun,
} from "./api.js";

interface FetchCall {
  input: string;
  init?: RequestInit;
}

const originalFetch = globalThis.fetch;
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
const originalHistory = Object.getOwnPropertyDescriptor(globalThis, "history");
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

const fetchCalls: FetchCall[] = [];
const responses: Response[] = [];
const stored = new Map<string, string>();
const replacedUrls: string[] = [];
const locationState = {
  hash: "#token=dashboard-secret",
  pathname: "/dashboard",
  search: "?view=projects",
};

Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: locationState,
});
Object.defineProperty(globalThis, "history", {
  configurable: true,
  value: {
    replaceState(_data: unknown, _unused: string, url?: string | URL | null) {
      replacedUrls.push(String(url));
    },
  },
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem(key: string) {
      return stored.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      stored.set(key, value);
    },
    removeItem(key: string) {
      stored.delete(key);
    },
  },
});
globalThis.fetch = async (input, init) => {
  fetchCalls.push({ input: String(input), init });
  const response = responses.shift();
  if (!response) throw new Error("Unexpected fetch call.");
  return response;
};

try {
  responses.push(ok({ csrfToken: "csrf-initial" }));
  await bootstrapSession();
  assert.equal(getCsrfToken(), "csrf-initial");
  assert.equal(stored.get("devspace.dashboard.bootstrap-token"), "dashboard-secret");
  assert.deepEqual(replacedUrls, ["/dashboard?view=projects"]);
  assert.deepEqual(body(fetchCalls[0]), { token: "dashboard-secret" });

  locationState.hash = "";
  responses.push(ok({ csrfToken: "csrf-cookie" }));
  await bootstrapSession();
  assert.equal(getCsrfToken(), "csrf-cookie");
  assert.equal(fetchCalls[1]?.input, "/api/session");
  assert.equal(fetchCalls[1]?.init?.method, "GET");

  responses.push(error(401, "UNAUTHORIZED", "Unauthorized"));
  responses.push(ok({ csrfToken: "csrf-restarted" }));
  await bootstrapSession();
  assert.equal(getCsrfToken(), "csrf-restarted");
  assert.equal(fetchCalls[2]?.input, "/api/session");
  assert.deepEqual(body(fetchCalls[3]), { token: "dashboard-secret" });

  responses.push(ok({
    mcp: { localUrl: "http://127.0.0.1:7676/mcp", publicHost: "example.test" },
    dashboard: { enabled: true, url: "http://127.0.0.1:7677/" },
    allowedRoots: [],
    providers: [],
    providerSummary: "subagents disabled",
  }));
  await getStatus();
  assert.equal(new Headers(fetchCalls[4]?.init?.headers).get("x-devspace-csrf"), "csrf-restarted");

  responses.push(error(401, "UNAUTHORIZED", "Unauthorized"));
  responses.push(ok({ csrfToken: "csrf-request-recovery" }));
  responses.push(ok({ candidates: [], truncated: false }));
  await scanProjects();
  assert.equal(fetchCalls[5]?.input, "/api/projects/scan");
  assert.equal(fetchCalls[6]?.input, "/api/session");
  assert.equal(fetchCalls[7]?.input, "/api/projects/scan");
  assert.equal(new Headers(fetchCalls[7]?.init?.headers).get("x-devspace-csrf"), "csrf-request-recovery");
  assert.equal(fetchCalls.filter((call) => call.input === "/api/projects/scan").length, 2);

  responses.push(ok({ status: { branch: "main", dirtyCount: 2 } }));
  assert.deepEqual(await getProjectGitStatus("project/id"), { branch: "main", dirtyCount: 2 });
  assert.equal(fetchCalls[8]?.input, "/api/projects/project%2Fid/git-status");

  responses.push(ok({ runs: [{ id: "op_1" }], cursor: 12 }));
  assert.deepEqual(await getOperationRuns("project/id"), [{ id: "op_1" }]);
  assert.equal(fetchCalls[9]?.input, "/api/operations/runs?projectId=project%2Fid");

  responses.push(ok({ runs: [{ id: "op_2" }], cursor: 13 }));
  assert.deepEqual(await getOperationSnapshot(), {
    runs: [{ id: "op_2" }],
    cursor: 13,
  });
  assert.equal(fetchCalls[10]?.input, "/api/operations/runs");

  responses.push(ok({ run: { id: "op/1" }, evidence: [], cursor: 13 }));
  assert.deepEqual(await getOperationRunDetail("op/1"), {
    run: { id: "op/1" },
    evidence: [],
    cursor: 13,
  });
  assert.equal(fetchCalls[11]?.input, "/api/operations/runs/op%2F1");

  responses.push(ok({
    events: [],
    afterSequence: 4,
    nextSequence: 4,
    historyTruncated: false,
    requiresSnapshot: false,
  }));
  assert.equal((await getOperationEvents("op/1", 4)).nextSequence, 4);
  assert.equal(fetchCalls[12]?.input, "/api/operations/runs/op%2F1/events?after=4&limit=1000");

  responses.push(ok({
    stopRequested: true,
    run: { id: "op/1", state: "stopping" },
    message: "Stop ends the active worker. It does not revert repository changes.",
  }, 202));
  assert.equal((await stopOperationRun("op/1")).stopRequested, true);
  assert.equal(fetchCalls[13]?.input, "/api/operations/runs/op%2F1/stop");
  assert.equal(fetchCalls[13]?.init?.method, "POST");
  assert.deepEqual(body(fetchCalls[13]), {});

  responses.push(error(401, "UNAUTHORIZED", "Unauthorized"));
  responses.push(error(401, "UNAUTHORIZED", "Unauthorized"));
  await bootstrapSession();
  assert.equal(stored.size, 0);
  assert.equal(getCsrfToken(), undefined);
} finally {
  globalThis.fetch = originalFetch;
  restoreGlobal("location", originalLocation);
  restoreGlobal("history", originalHistory);
  restoreGlobal("sessionStorage", originalSessionStorage);
}

console.log("dashboard api tests passed");

function ok(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function body(call: FetchCall | undefined): unknown {
  assert.ok(call?.init?.body);
  return JSON.parse(String(call.init.body));
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, name);
  }
}
