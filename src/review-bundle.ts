import { Buffer } from "node:buffer";
import * as z from "zod/v4";
import type {
  EvidenceState,
  OperationEvidence,
  VerificationType,
} from "./operations/operation-contracts.js";
import type { RepositoryContext } from "./operations/repository-diff.js";
import type {
  ReviewChangesResult,
  ReviewFile,
  ReviewSummary,
} from "./review-checkpoints.js";

const MAX_MODEL_PATCH_BYTES = 128 * 1_024;
const MAX_MODEL_REVIEW_FILES = 200;
const VERIFICATION_TYPES: readonly VerificationType[] = [
  "typecheck",
  "tests",
  "build",
  "review",
  "goal_state",
];

export type VerificationFreshness =
  | "fresh"
  | "stale"
  | "unknown_legacy"
  | "failed"
  | "running"
  | "missing";

export interface ReviewVerificationItem {
  type: VerificationType;
  state: EvidenceState;
  timestamp?: string;
  basisFingerprint?: string;
  freshness: VerificationFreshness;
}

export interface ReviewBundle {
  basis: "turn_since_last_shown";
  currentFingerprint?: string;
  turnChanges: {
    summary: ReviewSummary;
    files: ReviewFile[];
    filesTotal: number;
    filesReturned: number;
    filesTruncated: boolean;
    patch: string;
    patchBytes: number;
    patchTotalBytes: number;
    patchTruncated: boolean;
  };
  workspaceChanges: RepositoryContext["dirty"] & {
    state: RepositoryContext["state"];
    basis: "current_worktree_against_head";
    branch?: string;
    message?: string;
  };
  verification: {
    agentId?: string;
    items: ReviewVerificationItem[];
    message?: string;
  };
}

const reviewSummaryOutputSchema = z.object({
  files: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  removals: z.number().int().nonnegative(),
});

const reviewFileOutputSchema = z.object({
  path: z.string(),
  previousPath: z.string().optional(),
  type: z.enum(["change", "rename-pure", "rename-changed", "new", "deleted"]),
  additions: z.number().int().nonnegative(),
  removals: z.number().int().nonnegative(),
  binary: z.boolean(),
});

export const reviewBundleOutputSchema = z.object({
  basis: z.literal("turn_since_last_shown"),
  currentFingerprint: z.string().optional(),
  turnChanges: z.object({
    summary: reviewSummaryOutputSchema,
    files: z.array(reviewFileOutputSchema),
    filesTotal: z.number().int().nonnegative(),
    filesReturned: z.number().int().nonnegative(),
    filesTruncated: z.boolean(),
    patch: z.string(),
    patchBytes: z.number().int().nonnegative(),
    patchTotalBytes: z.number().int().nonnegative(),
    patchTruncated: z.boolean(),
  }),
  workspaceChanges: z.object({
    state: z.enum(["available", "unavailable"]),
    basis: z.literal("current_worktree_against_head"),
    branch: z.string().optional(),
    total: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    truncated: z.boolean(),
    files: z.array(z.object({
      path: z.string(),
      previousPath: z.string().optional(),
      operation: z.enum(["untracked", "added", "modified", "deleted", "renamed"]),
      binary: z.boolean(),
    })),
    message: z.string().optional(),
  }),
  verification: z.object({
    agentId: z.string().optional(),
    items: z.array(z.object({
      type: z.enum(["typecheck", "tests", "build", "review", "goal_state"]),
      state: z.enum(["not_run", "running", "passed", "failed", "not_applicable"]),
      timestamp: z.string().optional(),
      basisFingerprint: z.string().optional(),
      freshness: z.enum([
        "fresh",
        "stale",
        "unknown_legacy",
        "failed",
        "running",
        "missing",
      ]),
    })),
    message: z.string().optional(),
  }),
});

export function createReviewBundle(input: {
  review: ReviewChangesResult;
  repositoryContext: RepositoryContext;
  agentId?: string;
  evidence?: OperationEvidence[];
  evidenceMessage?: string;
}): ReviewBundle {
  const patch = boundUtf8(input.review.patch, MAX_MODEL_PATCH_BYTES);
  const files = input.review.files.slice(0, MAX_MODEL_REVIEW_FILES);
  const currentFingerprint = input.repositoryContext.state === "available"
    ? input.repositoryContext.fingerprint
    : undefined;

  return {
    basis: "turn_since_last_shown",
    currentFingerprint,
    turnChanges: {
      summary: input.review.summary,
      files,
      filesTotal: input.review.files.length,
      filesReturned: files.length,
      filesTruncated: files.length < input.review.files.length,
      patch: patch.value,
      patchBytes: patch.returnedBytes,
      patchTotalBytes: patch.totalBytes,
      patchTruncated: patch.truncated,
    },
    workspaceChanges: {
      state: input.repositoryContext.state,
      basis: "current_worktree_against_head",
      branch: input.repositoryContext.branch,
      ...input.repositoryContext.dirty,
      message: input.repositoryContext.message,
    },
    verification: {
      agentId: input.agentId,
      items: input.agentId
        ? verificationItems(input.evidence ?? [], currentFingerprint)
        : [],
      message: input.evidenceMessage,
    },
  };
}

export function formatReviewBundleForPrompt(bundle: ReviewBundle): string {
  return `Review bundle: ${JSON.stringify(bundle)}`;
}

function verificationItems(
  evidence: OperationEvidence[],
  currentFingerprint: string | undefined,
): ReviewVerificationItem[] {
  const byType = new Map(evidence.map((item) => [item.type, item]));
  return VERIFICATION_TYPES.map((type) => {
    const item = byType.get(type);
    return {
      type,
      state: item?.state ?? "not_run",
      timestamp: item?.timestamp,
      basisFingerprint: item?.basisFingerprint,
      freshness: evidenceFreshness(item, currentFingerprint),
    };
  });
}

function evidenceFreshness(
  evidence: OperationEvidence | undefined,
  currentFingerprint: string | undefined,
): VerificationFreshness {
  if (!evidence || evidence.state === "not_run" || evidence.state === "not_applicable") {
    return "missing";
  }
  if (evidence.state === "running") return "running";
  if (evidence.state === "failed") return "failed";
  if (!evidence.basisFingerprint || !currentFingerprint) return "unknown_legacy";
  return evidence.basisFingerprint === currentFingerprint ? "fresh" : "stale";
}

function boundUtf8(
  value: string,
  maximumBytes: number,
): { value: string; returnedBytes: number; totalBytes: number; truncated: boolean } {
  const totalBytes = Buffer.byteLength(value, "utf8");
  if (totalBytes <= maximumBytes) {
    return { value, returnedBytes: totalBytes, totalBytes, truncated: false };
  }

  let bounded = "";
  let returnedBytes = 0;
  for (const character of Array.from(value)) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (returnedBytes + bytes > maximumBytes) break;
    bounded += character;
    returnedBytes += bytes;
  }
  return { value: bounded, returnedBytes, totalBytes, truncated: true };
}
