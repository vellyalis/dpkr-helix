import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  AccessDeniedError,
  assertAllowedPath,
  assertCanonicalAllowedPath,
  expandHomePath,
  isSameCanonicalPath,
  resolveAllowedPath,
} from "./roots.js";

const home = homedir();

assert.equal(expandHomePath("~"), home);
assert.equal(expandHomePath("~/personal/devspace"), resolve(home, "personal", "devspace"));
assert.equal(expandHomePath("~user/project"), "~user/project");
assert.equal(expandHomePath("$HOME/project"), "$HOME/project");

assert.equal(
  assertAllowedPath("~/personal/devspace", [join(home, "personal")]),
  resolve(home, "personal", "devspace"),
);

assert.equal(
  assertAllowedPath("~/personal/devspace", ["~/personal"]),
  resolve(home, "personal", "devspace"),
);

assert.equal(
  resolveAllowedPath("~/file.txt", "/workspace", ["/workspace"]),
  resolve("/workspace", "~/file.txt"),
);

if (process.platform === "win32") {
  assert.throws(
    () => assertAllowedPath("C:\\Users\\Administrator", ["G:\\Projects\\Dev\\Github\\devspace"]),
    /Path is outside allowed roots/,
  );
}

const physicalRoot = await mkdtemp(join(tmpdir(), "devspace-roots-test-"));
const outsideRoot = await mkdtemp(join(tmpdir(), "devspace-roots-outside-test-"));
const aliasRoot = `${physicalRoot}-alias`;
const nestedRoot = join(physicalRoot, "nested");
const escapeRoot = join(physicalRoot, "escape");
await mkdir(nestedRoot);
await symlink(physicalRoot, aliasRoot, process.platform === "win32" ? "junction" : "dir");
await symlink(outsideRoot, escapeRoot, process.platform === "win32" ? "junction" : "dir");
try {
  assert.equal(isSameCanonicalPath(physicalRoot, aliasRoot), true);
  assert.equal(isSameCanonicalPath(physicalRoot, outsideRoot), false);
  assert.equal(
    await assertCanonicalAllowedPath(await realpath(nestedRoot), [aliasRoot]),
    join(aliasRoot, "nested"),
  );
  assert.equal(
    await assertCanonicalAllowedPath(
      join(await realpath(physicalRoot), "missing"),
      [aliasRoot],
    ),
    join(aliasRoot, "missing"),
  );
  await assert.rejects(
    () => assertCanonicalAllowedPath(escapeRoot, [physicalRoot]),
    AccessDeniedError,
  );
  await assert.rejects(
    () => assertCanonicalAllowedPath(join(escapeRoot, "missing"), [physicalRoot]),
    AccessDeniedError,
  );
  await assert.rejects(
    () => assertCanonicalAllowedPath(`${physicalRoot}-missing`, [aliasRoot]),
    AccessDeniedError,
  );
} finally {
  await rm(aliasRoot, { force: true });
  await rm(physicalRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
}
