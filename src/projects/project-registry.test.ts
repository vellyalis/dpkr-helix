import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "../db/client.js";
import {
  canonicalizeProjectRoot,
  createProjectRootKey,
  isProjectRootKeyInsidePath,
  ProjectPathError,
  ProjectRegistry,
  ProjectRegistryError,
  ProjectSelectorError,
} from "./project-registry.js";
import {
  ProjectStoreError,
  SqliteProjectStore,
  type ProjectStore,
} from "./project-store.js";

const root = await mkdtemp(join(tmpdir(), "devspace-project-registry-test-"));
const allowedRoot = join(root, "allowed");
const outsideRoot = join(root, "outside");
const stateDir = join(root, "state");

try {
  await mkdir(allowedRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  const firstRoot = join(allowedRoot, "team-a", "project");
  const secondRoot = join(allowedRoot, "team-b", "project");
  const firstSubdir = join(firstRoot, "src");
  const missingRoot = join(allowedRoot, "missing-project");
  const forgottenRoot = join(allowedRoot, "forget-me");
  const racedRoot = join(allowedRoot, "concurrent-project");
  await mkdir(firstSubdir, { recursive: true });
  await mkdir(secondRoot, { recursive: true });
  await mkdir(missingRoot, { recursive: true });
  await mkdir(forgottenRoot, { recursive: true });
  await mkdir(racedRoot, { recursive: true });

  let idSequence = 0;
  const store = new SqliteProjectStore(stateDir);
  const registry = new ProjectRegistry(store, [allowedRoot], {
    now: () => "2026-07-28T00:00:00.000Z",
    createId: () => `prj_test_${++idSequence}`,
  });

  const first = await registry.register({
    path: firstRoot,
    permissionPreset: "design",
    defaultMode: "worktree",
    pinned: true,
    source: "discovered",
  });
  assert.equal(first.id, "prj_test_1");
  assert.equal(first.slug, "project");
  assert.equal(first.name, "project");
  assert.equal(first.permissionPreset, "design");
  assert.equal(first.defaultMode, "worktree");
  assert.equal(first.pinned, true);
  assert.equal(first.source, "discovered");
  assert.equal(first.availability, "available");

  const duplicate = await registry.register({
    path: join(firstRoot, "."),
    name: "Ignored duplicate metadata",
  });
  assert.equal(duplicate.id, first.id);
  assert.equal(duplicate.name, first.name);
  assert.equal((await registry.list()).length, 1);

  const racedRegistry = new ProjectRegistry(failAfterCreateOnce(store), [allowedRoot], {
    createId: () => "prj_concurrent",
  });
  const raced = await racedRegistry.register({ path: racedRoot });
  assert.equal(raced.id, "prj_concurrent");
  assert.equal(registry.getById(raced.id)?.root, raced.root);

  const renamed = await registry.update(first.id, { name: "Shared Name" });
  assert.equal(renamed.id, first.id);
  assert.equal(renamed.root, first.root);
  assert.equal(renamed.slug, first.slug);
  assert.equal(renamed.name, "Shared Name");

  const second = await registry.register({ path: secondRoot });
  assert.equal(second.slug, "project-2");
  await registry.update(second.id, { name: "shared name" });
  assert.equal(registry.resolveSelector(first.id).id, first.id);
  assert.equal(registry.resolveSelector(second.slug).id, second.id);
  assert.throws(
    () => registry.resolveSelector("SHARED NAME"),
    (error: unknown) =>
      error instanceof ProjectSelectorError
      && error.code === "PROJECT_AMBIGUOUS"
      && error.candidates.length === 2,
  );
  assert.throws(
    () => registry.resolveSelector("missing"),
    (error: unknown) =>
      error instanceof ProjectSelectorError && error.code === "PROJECT_NOT_FOUND",
  );
  await assert.rejects(
    () => registry.update(second.id, { slug: first.slug }),
    (error: unknown) =>
      error instanceof ProjectRegistryError && error.code === "PROJECT_SLUG_CONFLICT",
  );

  const missing = await registry.register({ path: missingRoot, name: "Missing Later" });
  await rm(missingRoot, { recursive: true, force: true });
  const missingView = (await registry.list()).find((project) => project.id === missing.id);
  assert.equal(missingView?.availability, "missing");
  assert.equal(registry.getById(missing.id)?.id, missing.id);

  const restrictedRegistry = new ProjectRegistry(store, [outsideRoot]);
  assert.equal((await restrictedRegistry.getViewById(first.id))?.availability, "not_allowed");

  const narrowedRegistry = new ProjectRegistry(store, [firstSubdir]);
  assert.equal(await narrowedRegistry.findByPath(firstSubdir), undefined);

  await assert.rejects(
    () => registry.register({ path: outsideRoot }),
    (error: unknown) =>
      error instanceof ProjectPathError && error.code === "PROJECT_PATH_NOT_ALLOWED",
  );
  await assert.rejects(
    () => registry.register({ path: join(allowedRoot, "does-not-exist") }),
    (error: unknown) =>
      error instanceof ProjectPathError && error.code === "PROJECT_PATH_MISSING",
  );
  const filePath = join(allowedRoot, "not-a-directory.txt");
  await writeFile(filePath, "not a project\n");
  await assert.rejects(
    () => registry.register({ path: filePath }),
    (error: unknown) =>
      error instanceof ProjectPathError && error.code === "PROJECT_PATH_NOT_DIRECTORY",
  );

  const allowedAbsolute = resolve(allowedRoot);
  const outsideAbsolute = resolve(outsideRoot);
  const linkAbsolute = resolve(join(allowedRoot, "outside-link"));
  await assert.rejects(
    () =>
      canonicalizeProjectRoot(linkAbsolute, [allowedAbsolute], {
        ops: {
          stat: async () => ({ isDirectory: () => true }),
          realpath: async (path) => {
            if (path === linkAbsolute) return outsideAbsolute;
            if (path === allowedAbsolute) return allowedAbsolute;
            return path;
          },
        },
      }),
    (error: unknown) =>
      error instanceof ProjectPathError && error.code === "PROJECT_PATH_NOT_ALLOWED",
  );

  assert.equal(
    createProjectRootKey("C:\\Users\\Developer\\Repo\\.", "win32"),
    createProjectRootKey("c:\\users\\developer\\repo", "win32"),
  );
  assert.equal(
    isProjectRootKeyInsidePath(
      createProjectRootKey("C:\\Users\\Developer\\Repo", "win32"),
      createProjectRootKey("c:\\users\\developer\\repo", "win32"),
      "win32",
    ),
    true,
  );
  assert.equal(
    isProjectRootKeyInsidePath(
      createProjectRootKey("C:\\Users\\Developer\\Repo", "win32"),
      createProjectRootKey("c:\\users\\developer\\repo\\src", "win32"),
      "win32",
    ),
    true,
  );
  assert.equal(
    isProjectRootKeyInsidePath(
      createProjectRootKey("C:\\Users\\Developer\\Repo", "win32"),
      createProjectRootKey("c:\\users\\developer\\repo-tools", "win32"),
      "win32",
    ),
    false,
  );
  assert.equal(
    isProjectRootKeyInsidePath(
      createProjectRootKey("C:\\", "win32"),
      createProjectRootKey("c:\\repo", "win32"),
      "win32",
    ),
    true,
  );
  assert.equal(
    isProjectRootKeyInsidePath(
      createProjectRootKey("/", "linux"),
      createProjectRootKey("/repo", "linux"),
      "linux",
    ),
    true,
  );

  const forgotten = await registry.register({ path: forgottenRoot });
  assert.equal(registry.forget(forgotten.id), true);
  assert.equal((await stat(forgottenRoot)).isDirectory(), true);
  assert.equal(registry.getById(forgotten.id), undefined);

  store.close();
  const reopenedStore = new SqliteProjectStore(stateDir);
  const reopenedRegistry = new ProjectRegistry(reopenedStore, [allowedRoot]);
  assert.equal(reopenedRegistry.getById(first.id)?.root, first.root);
  assert.equal(reopenedRegistry.getById(second.id)?.slug, second.slug);
  assert.equal((await reopenedRegistry.getViewById(missing.id))?.availability, "missing");
  reopenedStore.close();

  const corruptStateDir = join(root, "corrupt-state");
  const corruptStore = new SqliteProjectStore(corruptStateDir);
  const corruptRegistry = new ProjectRegistry(corruptStore, [allowedRoot], {
    createId: () => "prj_corrupt",
  });
  await corruptRegistry.register({ path: forgottenRoot });
  corruptStore.close();
  const corruptSqlite = new Database(databasePath(corruptStateDir));
  corruptSqlite
    .prepare("update registered_projects set permission_preset = ? where id = ?")
    .run("unexpected", "prj_corrupt");
  corruptSqlite.close();
  const failClosedStore = new SqliteProjectStore(corruptStateDir);
  assert.throws(
    () => failClosedStore.getById("prj_corrupt"),
    (error: unknown) =>
      error instanceof ProjectStoreError
      && error.message === "Project store operation failed: getById",
  );
  failClosedStore.close();
} finally {
  await rm(root, { recursive: true, force: true });
}

function failAfterCreateOnce(store: ProjectStore): ProjectStore {
  let shouldFail = true;
  return {
    create(input) {
      const created = store.create(input);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Simulated concurrent insert completion");
      }
      return created;
    },
    update: (id, patch, timestamp) => store.update(id, patch, timestamp),
    getById: (id) => store.getById(id),
    getBySlug: (slug) => store.getBySlug(slug),
    getByRootKey: (rootKey) => store.getByRootKey(rootKey),
    list: () => store.list(),
    remove: (id) => store.remove(id),
    touchOpened: (id, timestamp) => store.touchOpened(id, timestamp),
  };
}
