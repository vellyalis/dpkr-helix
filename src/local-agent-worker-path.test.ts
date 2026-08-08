import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { localAgentWorkerFilePath } from "./local-agent-worker-path.js";

const workerPath = localAgentWorkerFilePath();
assert.equal(basename(workerPath), "local-agent-worker.ts");
assert.equal(existsSync(workerPath), true);
