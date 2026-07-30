import assert from "node:assert/strict";
import { dashboardUrl } from "./browser-open.js";

const target = dashboardUrl("127.0.0.1", 7677, "secret-token-value");
assert.equal(target.url, "http://127.0.0.1:7677/#token=secret-token-value");
assert.equal(target.sanitizedUrl, "http://127.0.0.1:7677/#token=<redacted>");
assert.doesNotMatch(target.sanitizedUrl, /secret-token-value/);
