import assert from "node:assert/strict";
import { openAiConversationScopeId } from "./request-meta.js";

assert.equal(openAiConversationScopeId(undefined), undefined);
assert.equal(openAiConversationScopeId({}), undefined);
assert.equal(openAiConversationScopeId({ "openai/session": "" }), undefined);
assert.equal(openAiConversationScopeId({ "openai/session": 42 }), undefined);
assert.equal(
  openAiConversationScopeId({
    "openai/session": "conversation-opaque-id",
    unrelated: "ignored",
  }),
  "conversation-opaque-id",
);
