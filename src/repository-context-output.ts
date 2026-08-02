import * as z from "zod/v4";

export const repositoryContextOutputSchema = z.object({
  state: z.enum(["available", "unavailable"]),
  basis: z.literal("current_worktree"),
  refreshedAt: z.string(),
  branch: z.string().optional(),
  head: z.string().optional(),
  fingerprint: z.string().optional(),
  dirty: z.object({
    total: z.number(),
    returned: z.number(),
    truncated: z.boolean(),
    files: z.array(z.object({
      path: z.string(),
      previousPath: z.string().optional(),
      operation: z.enum(["untracked", "added", "modified", "deleted", "renamed"]),
      binary: z.boolean(),
    })),
  }),
  manifest: z.object({
    path: z.literal("package.json"),
    scriptNames: z.array(z.string()),
    truncated: z.boolean(),
  }).optional(),
  message: z.string().optional(),
});
