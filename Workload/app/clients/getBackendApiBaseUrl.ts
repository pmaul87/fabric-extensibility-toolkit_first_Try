export function getBackendApiBaseUrl(): string {
  const configuredBaseUrl = (process.env.BACKEND_URL || "").trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return `${window.location.protocol}//${window.location.host}`;
}