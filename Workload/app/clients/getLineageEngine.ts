export type LineageEngineMode = "legacy" | "v2";

export function getLineageEngine(): LineageEngineMode {
  const raw = (process.env.LINEAGE_ENGINE || "").trim().toLowerCase();
  return raw === "legacy" ? "legacy" : "v2";
}
