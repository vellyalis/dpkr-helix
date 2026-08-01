import assert from "node:assert/strict";
import test from "node:test";
import { greetingFor } from "../src/locale/resolver.js";
import { SUPPORTED_LOCALES } from "../src/locale/supported.js";

test("resolves supported locale aliases", () => {
  assert.equal(greetingFor("en-US"), "Hello");
  assert.equal(greetingFor("fr-CA"), "Bonjour");
  assert.equal(greetingFor("fr_CA"), "Bonjour");
  assert.equal(SUPPORTED_LOCALES.includes("fr-CA"), true);
});

test("unknown locales retain the English fallback", () => {
  assert.equal(greetingFor("zz-ZZ"), "Hello");
});
