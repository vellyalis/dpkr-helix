import { asc, desc, eq } from "drizzle-orm";
import { openDatabase, type DatabaseHandle } from "../db/client.js";
import {
  registeredProjects,
  type RegisteredProjectRow,
} from "../db/schema.js";
import type {
  NewRegisteredProject,
  ProjectPatch,
  ProjectPermissionPreset,
  ProjectSource,
  ProjectWorkspaceMode,
  RegisteredProject,
} from "./project-types.js";

export interface ProjectStore {
  create(input: NewRegisteredProject): RegisteredProject;
  update(id: string, patch: ProjectPatch, timestamp?: string): RegisteredProject;
  getById(id: string): RegisteredProject | undefined;
  getBySlug(slug: string): RegisteredProject | undefined;
  getByRootKey(rootKey: string): RegisteredProject | undefined;
  list(): RegisteredProject[];
  remove(id: string): boolean;
  touchOpened(id: string, timestamp?: string): void;
  close?(): void;
}

export class ProjectStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Project store operation failed: ${operation}`, { cause });
    this.name = "ProjectStoreError";
  }
}

export class SqliteProjectStore implements ProjectStore {
  private readonly database: DatabaseHandle;

  constructor(stateDir: string) {
    this.database = openDatabase(stateDir);
  }

  create(input: NewRegisteredProject): RegisteredProject {
    return this.run("create", () => {
      this.database.db.insert(registeredProjects).values({
        id: input.id,
        slug: input.slug,
        name: input.name,
        root: input.root,
        rootKey: input.rootKey,
        permissionPreset: input.permissionPreset,
        defaultMode: input.defaultMode,
        pinned: input.pinned,
        source: input.source,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        lastOpenedAt: input.lastOpenedAt ?? null,
      }).run();
      return { ...input };
    });
  }

  update(id: string, patch: ProjectPatch, timestamp = new Date().toISOString()): RegisteredProject {
    return this.run("update", () => {
      const current = this.getById(id);
      if (!current) throw new Error(`Unknown registered project: ${id}`);

      const updated: RegisteredProject = {
        ...current,
        ...patch,
        updatedAt: timestamp,
      };

      this.database.db
        .update(registeredProjects)
        .set({
          slug: updated.slug,
          name: updated.name,
          permissionPreset: updated.permissionPreset,
          defaultMode: updated.defaultMode,
          pinned: updated.pinned,
          updatedAt: updated.updatedAt,
        })
        .where(eq(registeredProjects.id, id))
        .run();

      return updated;
    });
  }

  getById(id: string): RegisteredProject | undefined {
    return this.run("getById", () => {
      const row = this.database.db
        .select()
        .from(registeredProjects)
        .where(eq(registeredProjects.id, id))
        .get();
      return row ? rowToRegisteredProject(row) : undefined;
    });
  }

  getBySlug(slug: string): RegisteredProject | undefined {
    return this.run("getBySlug", () => {
      const row = this.database.db
        .select()
        .from(registeredProjects)
        .where(eq(registeredProjects.slug, slug))
        .get();
      return row ? rowToRegisteredProject(row) : undefined;
    });
  }

  getByRootKey(rootKey: string): RegisteredProject | undefined {
    return this.run("getByRootKey", () => {
      const row = this.database.db
        .select()
        .from(registeredProjects)
        .where(eq(registeredProjects.rootKey, rootKey))
        .get();
      return row ? rowToRegisteredProject(row) : undefined;
    });
  }

  list(): RegisteredProject[] {
    return this.run("list", () =>
      this.database.db
        .select()
        .from(registeredProjects)
        .orderBy(
          desc(registeredProjects.pinned),
          desc(registeredProjects.lastOpenedAt),
          asc(registeredProjects.name),
        )
        .all()
        .map(rowToRegisteredProject),
    );
  }

  remove(id: string): boolean {
    return this.run("remove", () => {
      const result = this.database.db
        .delete(registeredProjects)
        .where(eq(registeredProjects.id, id))
        .run();
      return result.changes > 0;
    });
  }

  touchOpened(id: string, timestamp = new Date().toISOString()): void {
    this.run("touchOpened", () => {
      this.database.db
        .update(registeredProjects)
        .set({ lastOpenedAt: timestamp })
        .where(eq(registeredProjects.id, id))
        .run();
    });
  }

  close(): void {
    this.database.close();
  }

  private run<T>(operation: string, action: () => T): T {
    try {
      return action();
    } catch (error) {
      if (error instanceof ProjectStoreError) throw error;
      throw new ProjectStoreError(operation, error);
    }
  }
}

export function createProjectStore(stateDir: string): ProjectStore {
  return new SqliteProjectStore(stateDir);
}

function rowToRegisteredProject(row: RegisteredProjectRow): RegisteredProject {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    root: row.root,
    rootKey: row.rootKey,
    permissionPreset: readPermissionPreset(row.permissionPreset),
    defaultMode: readWorkspaceMode(row.defaultMode),
    pinned: row.pinned,
    source: readProjectSource(row.source),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastOpenedAt: row.lastOpenedAt ?? undefined,
  };
}

function readPermissionPreset(value: string): ProjectPermissionPreset {
  if (value === "inspect" || value === "design" || value === "develop") return value;
  throw new Error("Invalid stored project permission preset");
}

function readWorkspaceMode(value: string): ProjectWorkspaceMode {
  if (value === "checkout" || value === "worktree") return value;
  throw new Error("Invalid stored project workspace mode");
}

function readProjectSource(value: string): ProjectSource {
  if (value === "manual" || value === "discovered") return value;
  throw new Error("Invalid stored project source");
}
