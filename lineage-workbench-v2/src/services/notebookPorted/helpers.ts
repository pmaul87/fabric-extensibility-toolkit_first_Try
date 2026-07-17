import { createHash } from "crypto";
import type { TableRow } from "./types";

export function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === "nan") return undefined;
  return normalized;
}

export function lower(value: unknown): string | undefined {
  const normalized = text(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

export function key(parts: unknown[]): string {
  return parts.map((part) => text(part) || "").join("|");
}

export function hashId(prefix: string, parts: unknown[]): string {
  const digest = createHash("sha1").update(key(parts), "utf-8").digest("hex").slice(0, 20);
  return `${prefix}:${digest}`;
}

export function rowText(row: TableRow, ...candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const val = text(row[candidate]);
    if (val) return val;
  }
  return undefined;
}

export function getRows(tables: Record<string, TableRow[]>, tableName: string): TableRow[] {
  return Array.isArray(tables[tableName]) ? tables[tableName] : [];
}

export function normalizeEntityType(value: unknown): string {
  const raw = lower(value) || "unknown";
  if (raw === "semanticmodel") return "semantic_model";
  if (raw === "dataflowgen2") return "dataflow";
  if (raw === "mirroredwarehouse") return "warehouse";
  return raw;
}

export function dedupeById<T extends { [k: string]: unknown }>(rows: T[], idKey: keyof T): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = text(row[idKey]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
