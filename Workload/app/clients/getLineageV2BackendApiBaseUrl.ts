export function getLineageV2BackendApiBaseUrl(): string {
  const configuredBaseUrl = (process.env.LINEAGE_V2_BACKEND_URL || process.env.BACKEND_URL || "").trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return `${window.location.protocol}//${window.location.host}`;
}