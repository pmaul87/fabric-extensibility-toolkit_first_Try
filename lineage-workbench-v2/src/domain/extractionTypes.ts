import { z } from "zod";
import type { GraphSnapshot } from "../contracts/lineageSnapshot";

export const CreateExtractionRequestSchema = z.object({
  workspaceIds: z.array(z.string().min(1)).min(1),
  artifactTypes: z.array(z.string().min(1)).default([]),
  lakehouseId: z.string().min(1).optional(),
  options: z
    .object({
      graphScope: z.enum(["focused", "full"]).default("focused"),
      graphNodeLimit: z.number().int().positive().max(5000).default(500),
      inputTables: z.record(z.array(z.record(z.unknown()))).optional(),
      inputTableSetId: z.string().min(1).optional(),
      nativeSeedTables: z.record(z.array(z.record(z.unknown()))).optional(),
      nativeCollection: z
        .object({
          enabled: z.boolean().default(false),
          fabricApiBaseUrl: z.string().url().optional(),
          fabricAccessToken: z.string().min(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type CreateExtractionRequest = z.infer<typeof CreateExtractionRequestSchema>;

export type ExtractionRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface ExtractionRun {
  id: string;
  createdAtUtc: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
  status: ExtractionRunStatus;
  progressPercent: number;
  workspaceIds: string[];
  artifactTypes: string[];
  lakehouseId?: string;
  warningMessages: string[];
  errorMessage?: string;
  result?: GraphSnapshot;
}
