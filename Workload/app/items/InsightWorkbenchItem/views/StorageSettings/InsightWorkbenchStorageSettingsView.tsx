/**
 * InsightWorkbenchStorageSettingsView.tsx
 *
 * In-workbench settings panel for OneLake persistence:
 *  - Enable/disable OneLake persistence
 *  - Select a folder path within the current item's OneLake Files/
 *  - View snapshot history per section
 *  - Compare two snapshots side-by-side
 *  - Create named snapshots ("label this version")
 *  - Trigger initial folder structure creation
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
  Tab,
  TabList,
  Text,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowCounterclockwiseRegular,
  CheckmarkCircleRegular,
  DatabaseRegular,
  ErrorCircleRegular,
  FolderOpenRegular,
  SaveRegular,
  HistoryRegular,
  ArrowSwapRegular,
} from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import {
  InsightWorkbenchStorageSettings,
  StorageSnapshotMeta,
  EntitySnapshotMeta,
} from "../../InsightWorkbenchItemDefinition";
import {
  InsightWorkbenchStorageService,
  StorageSection,
  createStorageService,
} from "../../services/InsightWorkbenchStorageService";
import { NAV_OPEN_STORAGE_HISTORY } from "../../InsightWorkbenchNavKeys";
import { FILE_FOLDER_NAME } from "../../../../clients/OneLakeStorageClient";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { InsightWorkbenchItemDefinition } from "../../InsightWorkbenchItemDefinition";
import { ItemEditorDefaultView, CentralPanelConfig } from "../../../../components/ItemEditor";
import { EnvironmentConstants } from "../../../../constants";
import { MetadataExplorerClient } from "../../../../clients/MetadataExplorerClient";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InsightWorkbenchStorageSettingsViewProps {
  workloadClient: WorkloadClientAPI;
  item: ItemWithDefinition<InsightWorkbenchItemDefinition> | undefined;
  currentDefinition: InsightWorkbenchItemDefinition;
  onStorageSettingsChange: (settings: InsightWorkbenchStorageSettings) => void;
}

// ---------------------------------------------------------------------------
// Section display names
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<StorageSection, string> = {
  metadata: "Artifact Catalog",
  semantic: "Semantic Analyzer",
  lineage: "Lineage Graph",
  reports: "Report Scanner",
  tickets: "Requirements Board",
};

const DEFAULT_ROOT = `${FILE_FOLDER_NAME}/insight-workbench-data`;
const OPEN_STORAGE_HISTORY_EVENT = "InsightWorkbench:OpenStorageHistory";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightWorkbenchStorageSettingsView({
  workloadClient,
  item,
  currentDefinition,
  onStorageSettingsChange,
}: InsightWorkbenchStorageSettingsViewProps) {
  type LoadedEntitySnapshot = { meta: EntitySnapshotMeta; content: string };

  // ── Local form state ───────────────────────────────────────────────────────
  const current = currentDefinition.oneLakeStorage;
  const [enabled, setEnabled] = useState(current?.enabled ?? false);
  const [rootFolder, setRootFolder] = useState(current?.rootFolderPath ?? DEFAULT_ROOT);
  const [autoSnapshot, setAutoSnapshot] = useState(current?.autoSnapshot !== false);
  const [maxSnapshots, setMaxSnapshots] = useState(String(current?.maxSnapshotsPerSection ?? 20));
  const [sqlEnabled, setSqlEnabled] = useState(current?.sqlWarehouse?.enabled ?? false);
  const [sqlServer, setSqlServer] = useState(current?.sqlWarehouse?.server ?? "");
  const [sqlDatabase, setSqlDatabase] = useState(current?.sqlWarehouse?.database ?? "");
  const [sqlSchema, setSqlSchema] = useState(current?.sqlWarehouse?.schema ?? "dbo");
  const [persistReportScannerToSql, setPersistReportScannerToSql] = useState(
    current?.sqlWarehouse?.persistReportScanner !== false
  );
  const [persistSnapshotsToSql, setPersistSnapshotsToSql] = useState(
    current?.sqlWarehouse?.persistSnapshots !== false
  );
  const [activeTab, setActiveTab] = useState<"config" | "history" | "compare">("config");

  // ── Snapshot history state ─────────────────────────────────────────────────
  const [selectedSection, setSelectedSection] = useState<StorageSection>("metadata");
  const [selectedEntityId, setSelectedEntityId] = useState<string>("all");
  const [snapshots, setSnapshots] = useState<StorageSnapshotMeta[]>([]);
  const [entitySnapshots, setEntitySnapshots] = useState<EntitySnapshotMeta[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // ── Version compare state ──────────────────────────────────────────────────
  const [compareSnapshotA, setCompareSnapshotA] = useState("");
  const [compareSnapshotB, setCompareSnapshotB] = useState("");
  const [compareResult, setCompareResult] = useState<{
    a: { meta: StorageSnapshotMeta; data: unknown } | undefined;
    b: { meta: StorageSnapshotMeta; data: unknown } | undefined;
  } | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // ── Entity snapshot open/compare state ───────────────────────────────────
  const [isEntityViewerOpen, setIsEntityViewerOpen] = useState(false);
  const [isEntityViewerLoading, setIsEntityViewerLoading] = useState(false);
  const [entityViewerError, setEntityViewerError] = useState<string | null>(null);
  const [entityViewerSnapshot, setEntityViewerSnapshot] = useState<LoadedEntitySnapshot | null>(null);

  const [entityCompareSnapshotA, setEntityCompareSnapshotA] = useState("");
  const [entityCompareSnapshotB, setEntityCompareSnapshotB] = useState("");
  const [isEntityCompareOpen, setIsEntityCompareOpen] = useState(false);
  const [isEntityComparing, setIsEntityComparing] = useState(false);
  const [entityCompareError, setEntityCompareError] = useState<string | null>(null);
  const [entityCompareResult, setEntityCompareResult] = useState<{
    a: LoadedEntitySnapshot | undefined;
    b: LoadedEntitySnapshot | undefined;
  } | null>(null);

  // ── Setup state ────────────────────────────────────────────────────────────
  const [isSettingUpFolders, setIsSettingUpFolders] = useState(false);
  const [setupMessage, setSetupMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isApplyingSqlSettings, setIsApplyingSqlSettings] = useState(false);
  const [isTestingSqlConnection, setIsTestingSqlConnection] = useState(false);
  const [isSettingUpSqlSchema, setIsSettingUpSqlSchema] = useState(false);
  const [isLoadingSqlScript, setIsLoadingSqlScript] = useState(false);
  const [isSqlScriptDialogOpen, setIsSqlScriptDialogOpen] = useState(false);
  const [sqlScriptContent, setSqlScriptContent] = useState("");
  const [sqlStatusMessage, setSqlStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [sqlPersistenceStatus, setSqlPersistenceStatus] = useState<{
    configured: boolean;
    backendIdentityConfigured: boolean;
    server?: string;
    database?: string;
    schema?: string;
    persistReportScanner?: boolean;
    persistSnapshots?: boolean;
    validationSucceeded?: boolean;
    message?: string;
  } | null>(null);

  const normalizedRootFolder = useMemo(
    () => (rootFolder.trim() || DEFAULT_ROOT).replace(/^\/+/, ""),
    [rootFolder]
  );
  const storagePathWebUrl = useMemo(() => {
    if (!item) return undefined;
    return `${EnvironmentConstants.OneLakeDFSBaseUrl}/${item.workspaceId}/${item.id}/${normalizedRootFolder}`;
  }, [item, normalizedRootFolder]);
  const storagePathAbfss = useMemo(() => {
    if (!item) return undefined;
    return `abfss://${item.workspaceId}@onelake.dfs.fabric.microsoft.com/${item.id}/${normalizedRootFolder}`;
  }, [item, normalizedRootFolder]);

  const entityOptions = useMemo(() => {
    const byEntity = new Map<string, { id: string; displayName: string; workspaceId: string }>();
    for (const snapshot of entitySnapshots) {
      if (!byEntity.has(snapshot.entityId)) {
        byEntity.set(snapshot.entityId, {
          id: snapshot.entityId,
          displayName: snapshot.displayName,
          workspaceId: snapshot.workspaceId,
        });
      }
    }
    return Array.from(byEntity.values()).sort(
      (left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id)
    );
  }, [entitySnapshots]);

  const filteredEntitySnapshots = useMemo(() => {
    if (selectedEntityId === "all") {
      return entitySnapshots;
    }
    return entitySnapshots.filter((snapshot) => snapshot.entityId === selectedEntityId);
  }, [entitySnapshots, selectedEntityId]);

  const metadataClient = useMemo(() => new MetadataExplorerClient(workloadClient), [workloadClient]);
  const shouldMirrorSnapshotsToSql = sqlEnabled && persistSnapshotsToSql;

  // ── One-time navigation intent from other views ──────────────────────────
  useEffect(() => {
    const applyHistoryNavigation = (payload: { section?: StorageSection } | undefined): void => {
      if (payload?.section && payload.section in SECTION_LABELS) {
        setSelectedSection(payload.section);
      }
      setActiveTab("history");
    };

    const consumePendingNavigationToken = (): void => {
      try {
        const raw = window.sessionStorage.getItem(NAV_OPEN_STORAGE_HISTORY);
        if (!raw) {
          return;
        }
        window.sessionStorage.removeItem(NAV_OPEN_STORAGE_HISTORY);
        const payload = JSON.parse(raw) as { section?: StorageSection };
        applyHistoryNavigation(payload);
      } catch {
        // Ignore malformed one-time navigation payload.
      }
    };

    const handleOpenHistoryEvent = (event: Event): void => {
      const customEvent = event as CustomEvent<{ section?: StorageSection } | undefined>;
      applyHistoryNavigation(customEvent.detail);
    };

    consumePendingNavigationToken();
    window.addEventListener(OPEN_STORAGE_HISTORY_EVENT, handleOpenHistoryEvent as EventListener);

    return () => {
      window.removeEventListener(OPEN_STORAGE_HISTORY_EVENT, handleOpenHistoryEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const loadSqlStatus = async (): Promise<void> => {
      try {
        const status = await metadataClient.getReportScannerPersistenceStatus();
        if (!disposed) {
          setSqlPersistenceStatus(status);
        }
      } catch (error) {
        if (!disposed) {
          setSqlStatusMessage({
            text: error instanceof Error ? error.message : String(error),
            isError: true,
          });
        }
      }
    };

    void loadSqlStatus();

    return () => {
      disposed = true;
    };
  }, [metadataClient]);

  // ── Build service ──────────────────────────────────────────────────────────
  const buildService = useCallback((): InsightWorkbenchStorageService | undefined => {
    if (!item) return undefined;
    const settings: InsightWorkbenchStorageSettings = {
      enabled: true,
      rootFolderPath: rootFolder,
      autoSnapshot,
      maxSnapshotsPerSection: parseInt(maxSnapshots, 10) || 20,
    };
    return createStorageService(workloadClient, item, settings);
  }, [item, rootFolder, autoSnapshot, maxSnapshots, workloadClient]);

  // ── Load snapshots when tab/section changes ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "history" && activeTab !== "compare") return;
    if (!enabled || !item) return;

    const service = buildService();
    if (!service) return;

    setIsLoadingSnapshots(true);
    Promise.all([
      service.listSnapshots(selectedSection),
      selectedSection === "semantic"
        ? service.listEntitySnapshots("tmdl")
        : selectedSection === "reports"
          ? service.listEntitySnapshots("report")
          : Promise.resolve([]),
    ])
      .then(([sectionSnapshots, rawEntitySnapshots]) => {
        setSnapshots(sectionSnapshots);
        setEntitySnapshots(rawEntitySnapshots);
      })
      .catch((err) => console.error("[StorageSettings] Failed to list snapshots", err))
      .finally(() => setIsLoadingSnapshots(false));
  }, [activeTab, selectedSection, enabled, item, buildService]);

  useEffect(() => {
    if (selectedSection !== "semantic" && selectedSection !== "reports") {
      setSelectedEntityId("all");
      return;
    }

    if (selectedEntityId !== "all" && !entityOptions.some((option) => option.id === selectedEntityId)) {
      setSelectedEntityId("all");
    }
  }, [entityOptions, selectedEntityId, selectedSection]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApplySqlSettings = useCallback(async (): Promise<void> => {
    setIsApplyingSqlSettings(true);
    setSqlStatusMessage(null);
    try {
      const result = await metadataClient.configureReportScannerPersistence({
        enabled: sqlEnabled,
        server: sqlServer.trim(),
        database: sqlDatabase.trim(),
        schema: sqlSchema.trim() || "dbo",
        persistReportScanner: persistReportScannerToSql,
        persistSnapshots: persistSnapshotsToSql,
      });
      setSqlPersistenceStatus(result);
      setSqlStatusMessage({
        text: result.message || (result.configured ? "SQL persistence configured." : "SQL persistence disabled."),
        isError: false,
      });
    } catch (error) {
      setSqlStatusMessage({
        text: error instanceof Error ? error.message : String(error),
        isError: true,
      });
    } finally {
      setIsApplyingSqlSettings(false);
    }
  }, [metadataClient, persistReportScannerToSql, persistSnapshotsToSql, sqlDatabase, sqlEnabled, sqlSchema, sqlServer]);

  const handleSaveSettings = async () => {
    const settings: InsightWorkbenchStorageSettings = {
      enabled,
      rootFolderPath: rootFolder.trim() || DEFAULT_ROOT,
      autoSnapshot,
      maxSnapshotsPerSection: parseInt(maxSnapshots, 10) || 20,
      sqlWarehouse: {
        enabled: sqlEnabled,
        server: sqlServer.trim() || undefined,
        database: sqlDatabase.trim() || undefined,
        schema: sqlSchema.trim() || undefined,
        persistReportScanner: persistReportScannerToSql,
        persistSnapshots: persistSnapshotsToSql,
      },
    };
    onStorageSettingsChange(settings);

    if (sqlEnabled || sqlPersistenceStatus?.configured) {
      await handleApplySqlSettings();
    }
  };

  const handleSetupFolders = async () => {
    const service = buildService();
    if (!service) return;

    setIsSettingUpFolders(true);
    setSetupMessage(null);
    try {
      await service.ensureFolderStructure();
      await service.ensureEntitySnapshotFolders();
      setSetupMessage({ text: "Folder structure created successfully.", isError: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSetupMessage({ text: `Failed to create folders: ${message}`, isError: true });
    } finally {
      setIsSettingUpFolders(false);
    }
  };

  const handleTestSqlConnection = useCallback(async (): Promise<void> => {
    setIsTestingSqlConnection(true);
    setSqlStatusMessage(null);
    try {
      const result = await metadataClient.testSqlPersistenceConnection();
      setSqlPersistenceStatus(result);
      setSqlStatusMessage({
        text: result.message || "SQL connection validated successfully.",
        isError: false,
      });
    } catch (error) {
      setSqlStatusMessage({
        text: error instanceof Error ? error.message : String(error),
        isError: true,
      });
    } finally {
      setIsTestingSqlConnection(false);
    }
  }, [metadataClient]);

  const handleSetupSqlSchema = useCallback(async (): Promise<void> => {
    setIsSettingUpSqlSchema(true);
    setSqlStatusMessage(null);
    try {
      const result = await metadataClient.setupSqlPersistenceSchema(sqlSchema.trim() || "dbo");
      setSqlPersistenceStatus(result);
      setSqlStatusMessage({
        text: result.message || "SQL schema setup completed.",
        isError: false,
      });
    } catch (error) {
      setSqlStatusMessage({
        text: error instanceof Error ? error.message : String(error),
        isError: true,
      });
    } finally {
      setIsSettingUpSqlSchema(false);
    }
  }, [metadataClient, sqlSchema]);

  const handleOpenSqlScript = useCallback(async (): Promise<void> => {
    setIsLoadingSqlScript(true);
    setSqlStatusMessage(null);
    try {
      const result = await metadataClient.getSqlPersistenceSchemaScript(sqlSchema.trim() || "dbo");
      setSqlScriptContent(result.script);
      setIsSqlScriptDialogOpen(true);
    } catch (error) {
      setSqlStatusMessage({
        text: error instanceof Error ? error.message : String(error),
        isError: true,
      });
    } finally {
      setIsLoadingSqlScript(false);
    }
  }, [metadataClient, sqlSchema]);

  const handleCopySqlScript = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(sqlScriptContent);
      setSqlStatusMessage({ text: "SQL setup script copied to clipboard.", isError: false });
    } catch {
      setSqlStatusMessage({ text: "Unable to copy SQL setup script.", isError: true });
    }
  }, [sqlScriptContent]);

  const handleCreateNamedSnapshot = async () => {
    const service = buildService();
    if (!service || !item) return;

    const label = snapshotLabel.trim() || undefined;
    setIsSavingSnapshot(true);
    setSnapshotMessage(null);

    try {
      // We can only snapshot section data that is in the current item definition.
      // Map section → live data from currentDefinition.
      let sectionData: Parameters<InsightWorkbenchStorageService["saveSection"]>[0] | undefined;

      switch (selectedSection) {
        case "metadata":
          sectionData = { section: "metadata", data: currentDefinition.metadataExplorer?.artifactCatalog ?? { artifacts: [] } };
          break;
        case "semantic":
          sectionData = { section: "semantic", data: currentDefinition.semanticAnalyzer ?? {} };
          break;
        case "lineage":
          sectionData = { section: "lineage", data: currentDefinition.lineageGraph ?? {} };
          break;
        case "reports":
          sectionData = { section: "reports", data: currentDefinition.reportScanner ?? {} };
          break;
        case "tickets":
          sectionData = { section: "tickets", data: currentDefinition.requirementsBoard ?? { cards: [] } };
          break;
      }

      if (sectionData) {
        const meta = await service.createSnapshot(sectionData, label);
        let sqlMirrorNote: string | undefined;
        if (shouldMirrorSnapshotsToSql) {
          const sectionDisplayName = meta.section in SECTION_LABELS
            ? SECTION_LABELS[meta.section as StorageSection]
            : "All sections";
          try {
            const result = await metadataClient.persistInsightWorkbenchSnapshot({
              snapshotId: meta.id,
              snapshotKind: "Section",
              sectionName: meta.section,
              displayName: sectionDisplayName,
              label: meta.label,
              savedAtUtc: meta.savedAtUtc,
              oneLakeFilePath: meta.filePath,
              contentFormat: "json",
              payload: JSON.stringify(sectionData.data, null, 2),
            });
            sqlMirrorNote = result.message;
          } catch (error) {
            sqlMirrorNote = ` SQL mirror skipped: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        setSnapshots((prev) => [meta, ...prev]);
        setSnapshotLabel("");
        setSnapshotMessage({
          text: `Snapshot "${meta.id.slice(0, 8)}" saved.${sqlMirrorNote ? ` ${sqlMirrorNote}` : ""}`,
          isError: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSnapshotMessage({ text: `Failed to save snapshot: ${message}`, isError: true });
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleCompare = async () => {
    if (!compareSnapshotA || !compareSnapshotB) return;
    const service = buildService();
    if (!service) return;

    setIsComparing(true);
    setCompareError(null);
    setCompareResult(null);

    try {
      const result = await service.compareSnapshots<unknown>(compareSnapshotA, compareSnapshotB);
      setCompareResult(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsComparing(false);
    }
  };

  const handleCopyStoragePath = useCallback(async (): Promise<void> => {
    const value = storagePathAbfss ?? normalizedRootFolder;
    try {
      await navigator.clipboard.writeText(value);
      setSetupMessage({ text: "Storage path copied to clipboard.", isError: false });
    } catch {
      setSetupMessage({ text: "Unable to copy storage path to clipboard.", isError: true });
    }
  }, [normalizedRootFolder, storagePathAbfss]);

  const handleOpenStoragePath = useCallback((): void => {
    if (!storagePathWebUrl) {
      setSetupMessage({ text: "Storage path is unavailable until the item is loaded.", isError: true });
      return;
    }

    try {
      window.open(storagePathWebUrl, "_blank", "noopener,noreferrer");
    } catch {
      setSetupMessage({ text: "Unable to open storage location in a new tab.", isError: true });
    }
  }, [storagePathWebUrl]);

  const handleOpenEntitySnapshot = useCallback(async (snapshotId: string) => {
    const service = buildService();
    if (!service) return;

    setIsEntityViewerOpen(true);
    setIsEntityViewerLoading(true);
    setEntityViewerError(null);
    setEntityViewerSnapshot(null);

    try {
      const loaded = await service.loadEntitySnapshotContent(snapshotId);
      if (!loaded) {
        setEntityViewerError("Snapshot content not found.");
        return;
      }
      setEntityViewerSnapshot(loaded);
    } catch (err) {
      setEntityViewerError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEntityViewerLoading(false);
    }
  }, [buildService]);

  const handleOpenEntityCompare = useCallback(async () => {
    if (!entityCompareSnapshotA || !entityCompareSnapshotB) return;
    const service = buildService();
    if (!service) return;

    setIsEntityCompareOpen(true);
    setIsEntityComparing(true);
    setEntityCompareError(null);
    setEntityCompareResult(null);

    try {
      const [a, b] = await Promise.all([
        service.loadEntitySnapshotContent(entityCompareSnapshotA),
        service.loadEntitySnapshotContent(entityCompareSnapshotB),
      ]);

      if (!a || !b) {
        setEntityCompareError("One or both snapshots could not be loaded.");
        return;
      }

      if (a.meta.entityId !== b.meta.entityId || a.meta.entityType !== b.meta.entityType) {
        setEntityCompareError("Select two snapshots from the same entity and type.");
        return;
      }

      setEntityCompareResult({ a, b });
    } catch (err) {
      setEntityCompareError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEntityComparing(false);
    }
  }, [buildService, entityCompareSnapshotA, entityCompareSnapshotB]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ItemEditorDefaultView
      center={{
        content: (
          <>
          <div style={{ padding: "16px 20px", maxWidth: 900, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DatabaseRegular fontSize={22} />
                <Text size={500} weight="semibold">OneLake Persistence</Text>
              </div>
              <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                Persist Insight Workbench data to the item's OneLake folder. Enables version snapshots and cross-session data retention.
              </Caption1>

              <TabList selectedValue={activeTab} onTabSelect={(_, d) => setActiveTab(d.value as typeof activeTab)}>
                <Tab value="config" icon={<FolderOpenRegular />}>Configuration</Tab>
                <Tab value="history" icon={<HistoryRegular />} disabled={!enabled}>
                  Snapshot History
                </Tab>
                <Tab value="compare" icon={<ArrowSwapRegular />} disabled={!enabled}>
                  Compare Versions
                </Tab>
              </TabList>

              <Divider />

              {/* ── Config tab ──────────────────────────────────────────── */}
              {activeTab === "config" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Field label="Enable OneLake persistence">
                    <Switch
                      checked={enabled}
                      onChange={(_, d) => setEnabled(d.checked)}
                      label={enabled ? "On — data will be saved to OneLake" : "Off — data lives in item definition only"}
                    />
                  </Field>

                  <Field
                    label="Root folder path (relative to item root)"
                    hint={`Must start with "${FILE_FOLDER_NAME}/". Default: ${DEFAULT_ROOT}`}
                  >
                    <Input
                      value={rootFolder}
                      onChange={(_, d) => setRootFolder(d.value)}
                      disabled={!enabled}
                      placeholder={DEFAULT_ROOT}
                      contentBefore={<FolderOpenRegular />}
                      style={{ width: 480 }}
                    />
                  </Field>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                      Storage location
                    </Caption1>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <Caption1>{storagePathWebUrl ?? normalizedRootFolder}</Caption1>
                      <Button size="small" appearance="secondary" onClick={handleOpenStoragePath}>
                        Open location
                      </Button>
                      <Button size="small" appearance="secondary" onClick={() => {
                        void handleCopyStoragePath();
                      }}>
                        Copy path
                      </Button>
                    </div>
                    {storagePathAbfss ? <Caption1>{storagePathAbfss}</Caption1> : null}
                  </div>

                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <Field label="Auto-snapshot on save">
                      <Switch
                        checked={autoSnapshot}
                        onChange={(_, d) => setAutoSnapshot(d.checked)}
                        disabled={!enabled}
                        label={autoSnapshot ? "On" : "Off"}
                      />
                    </Field>

                    <Field label="Max snapshots per section" hint="Oldest snapshots are pruned from index when limit is exceeded.">
                      <Input
                        type="number"
                        value={maxSnapshots}
                        onChange={(_, d) => setMaxSnapshots(d.value)}
                        disabled={!enabled}
                        style={{ width: 100 }}
                        min="1"
                        max="200"
                      />
                    </Field>
                  </div>

                  <Divider />

                  <Text weight="semibold" size={300}>SQL Warehouse mirror</Text>
                  <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                    Optional runtime SQL configuration for T-SQL querying and Report Scanner persistence. OneLake remains the default primary store.
                  </Caption1>

                  <Field label="Enable SQL mirror">
                    <Switch
                      checked={sqlEnabled}
                      onChange={(_, data) => setSqlEnabled(data.checked)}
                      label={sqlEnabled ? "On" : "Off"}
                    />
                  </Field>

                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <Field label="SQL server" hint="Example: xyz.database.fabric.microsoft.com">
                      <Input
                        value={sqlServer}
                        onChange={(_, data) => setSqlServer(data.value)}
                        disabled={!sqlEnabled}
                        style={{ width: 320 }}
                      />
                    </Field>
                    <Field label="Database / Warehouse name">
                      <Input
                        value={sqlDatabase}
                        onChange={(_, data) => setSqlDatabase(data.value)}
                        disabled={!sqlEnabled}
                        style={{ width: 240 }}
                      />
                    </Field>
                    <Field label="Schema hint">
                      <Input
                        value={sqlSchema}
                        onChange={(_, data) => setSqlSchema(data.value)}
                        disabled={!sqlEnabled}
                        style={{ width: 120 }}
                      />
                    </Field>
                  </div>

                  <Field label="Persist Report Scanner results to SQL">
                    <Switch
                      checked={persistReportScannerToSql}
                      onChange={(_, data) => setPersistReportScannerToSql(data.checked)}
                      disabled={!sqlEnabled}
                      label={persistReportScannerToSql ? "On" : "Off"}
                    />
                  </Field>

                  <Field label="Persist Insight Workbench snapshots to SQL">
                    <Switch
                      checked={persistSnapshotsToSql}
                      onChange={(_, data) => setPersistSnapshotsToSql(data.checked)}
                      disabled={!sqlEnabled}
                      label={persistSnapshotsToSql ? "On" : "Off"}
                    />
                  </Field>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Button
                      appearance="secondary"
                      onClick={() => {
                        void handleApplySqlSettings();
                      }}
                      disabled={isApplyingSqlSettings || (sqlEnabled && (!sqlServer.trim() || !sqlDatabase.trim()))}
                    >
                      {isApplyingSqlSettings ? "Applying SQL settings..." : "Apply SQL settings"}
                    </Button>
                    <Button
                      appearance="secondary"
                      onClick={() => {
                        void handleTestSqlConnection();
                      }}
                      disabled={isTestingSqlConnection || !sqlPersistenceStatus?.configured}
                    >
                      {isTestingSqlConnection ? "Testing SQL connection..." : "Test SQL connection"}
                    </Button>
                    <Button
                      appearance="secondary"
                      onClick={() => {
                        void handleSetupSqlSchema();
                      }}
                      disabled={isSettingUpSqlSchema || !sqlPersistenceStatus?.configured}
                    >
                      {isSettingUpSqlSchema ? "Setting up SQL schema..." : "Set up SQL schema"}
                    </Button>
                    <Button
                      appearance="secondary"
                      onClick={() => {
                        void handleOpenSqlScript();
                      }}
                      disabled={isLoadingSqlScript || (sqlEnabled && !sqlSchema.trim())}
                    >
                      {isLoadingSqlScript ? "Loading SQL script..." : "View SQL setup script"}
                    </Button>
                    {sqlPersistenceStatus ? (
                      <>
                        <Badge appearance={sqlPersistenceStatus.configured ? "filled" : "outline"}>
                          {sqlPersistenceStatus.configured ? "SQL configured" : "SQL not configured"}
                        </Badge>
                        <Badge appearance={sqlPersistenceStatus.backendIdentityConfigured ? "filled" : "outline"}>
                          {sqlPersistenceStatus.backendIdentityConfigured ? "Backend identity ready" : "Backend identity missing"}
                        </Badge>
                        <Badge appearance={sqlPersistenceStatus.persistSnapshots !== false ? "filled" : "outline"}>
                          {sqlPersistenceStatus.persistSnapshots !== false ? "Snapshot mirror on" : "Snapshot mirror off"}
                        </Badge>
                      </>
                    ) : null}
                  </div>

                  <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                    SQL setup can now be done from here: validate the connection, create the schema, or inspect/copy the exact script that will run for the selected schema.
                  </Caption1>

                  {sqlStatusMessage ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {sqlStatusMessage.isError
                        ? <ErrorCircleRegular color="var(--colorPaletteRedForeground1)" />
                        : <CheckmarkCircleRegular color="var(--colorPaletteGreenForeground1)" />}
                      <Caption1>{sqlStatusMessage.text}</Caption1>
                    </div>
                  ) : null}

                  {sqlPersistenceStatus?.message ? (
                    <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                      {sqlPersistenceStatus.message}
                    </Caption1>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Button appearance="primary" icon={<SaveRegular />} onClick={handleSaveSettings}>
                      Save settings
                    </Button>
                    {enabled && (
                      <Tooltip content="Creates all required subfolders in OneLake. Run once after choosing a folder." relationship="label">
                        <Button
                          icon={isSettingUpFolders ? <Spinner size="tiny" /> : <FolderOpenRegular />}
                          onClick={handleSetupFolders}
                          disabled={isSettingUpFolders}
                        >
                          Set up folder structure
                        </Button>
                      </Tooltip>
                    )}
                  </div>

                  {setupMessage && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {setupMessage.isError
                        ? <ErrorCircleRegular color="var(--colorPaletteRedForeground1)" />
                        : <CheckmarkCircleRegular color="var(--colorPaletteGreenForeground1)" />}
                      <Caption1>{setupMessage.text}</Caption1>
                    </div>
                  )}

                  <Divider />

                  {/* Storage layout summary */}
                  <Text weight="semibold" size={300}>Folder structure</Text>
                  <div style={{ fontFamily: "monospace", fontSize: 12, background: "var(--colorNeutralBackground3)", padding: 12, borderRadius: 6, lineHeight: 1.8 }}>
                    {(rootFolder || DEFAULT_ROOT)}<br />
                    {"  ├─ metadata/          ← Artifact catalog snapshots"}<br />
                    {"  │    └─ snapshots/"}<br />
                    {"  ├─ semantic/          ← Semantic model snapshots"}<br />
                    {"  │    └─ snapshots/"}<br />
                    {"  ├─ lineage/           ← Lineage graph snapshots"}<br />
                    {"  │    └─ snapshots/"}<br />
                    {"  ├─ reports/           ← Report scanner snapshots"}<br />
                    {"  │    └─ snapshots/"}<br />
                    {"  ├─ tickets/           ← Requirements board tickets"}<br />
                    {"  │    └─ snapshots/"}<br />
                    {"  └─ index.json         ← Snapshot metadata index"}
                  </div>

                  <Dialog open={isSqlScriptDialogOpen} onOpenChange={(_, data) => setIsSqlScriptDialogOpen(data.open)}>
                    <DialogSurface style={{ maxWidth: 960, width: "min(96vw, 960px)" }}>
                      <DialogBody>
                        <DialogTitle>SQL setup script</DialogTitle>
                        <DialogContent>
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                              This is the schema-aware setup script for the current SQL configuration. You can copy it or run Set up SQL schema to execute it from the workbench.
                            </Caption1>
                            <textarea
                              readOnly
                              value={sqlScriptContent}
                              style={{
                                width: "100%",
                                minHeight: 420,
                                fontFamily: "Consolas, 'Courier New', monospace",
                                fontSize: 12,
                                lineHeight: 1.5,
                                padding: 12,
                                borderRadius: 6,
                                border: "1px solid var(--colorNeutralStroke1)",
                                background: "var(--colorNeutralBackground3)",
                                color: "var(--colorNeutralForeground1)",
                              }}
                            />
                          </div>
                        </DialogContent>
                        <DialogActions>
                          <Button appearance="secondary" onClick={() => { void handleCopySqlScript(); }}>
                            Copy script
                          </Button>
                          <Button appearance="primary" onClick={() => setIsSqlScriptDialogOpen(false)}>
                            Close
                          </Button>
                        </DialogActions>
                      </DialogBody>
                    </DialogSurface>
                  </Dialog>
                </div>
              )}

              {/* ── History tab ─────────────────────────────────────────── */}
              {activeTab === "history" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <Field label="Section">
                      <Select
                        value={selectedSection}
                        onChange={(_, d) => setSelectedSection(d.value as StorageSection)}
                        style={{ width: 200 }}
                      >
                        {(Object.keys(SECTION_LABELS) as StorageSection[]).map((s) => (
                          <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                        ))}
                      </Select>
                    </Field>

                    {(selectedSection === "semantic" || selectedSection === "reports") && (
                      <Field label="Entity">
                        <Select
                          value={selectedEntityId}
                          onChange={(_, d) => setSelectedEntityId(d.value)}
                          style={{ width: 260 }}
                        >
                          <option value="all">All entities</option>
                          {entityOptions.map((option) => (
                            <option key={`entity-option-${option.id}`} value={option.id}>
                              {`${option.displayName} (${option.workspaceId})`}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    <Field label="Snapshot label (optional)">
                      <Input
                        value={snapshotLabel}
                        onChange={(_, d) => setSnapshotLabel(d.value)}
                        placeholder="e.g. Before Q2 migration"
                        style={{ width: 240 }}
                      />
                    </Field>

                    <Button
                      appearance="primary"
                      icon={isSavingSnapshot ? <Spinner size="tiny" /> : <SaveRegular />}
                      onClick={handleCreateNamedSnapshot}
                      disabled={isSavingSnapshot}
                    >
                      Save snapshot
                    </Button>

                    <Button
                      icon={<ArrowCounterclockwiseRegular />}
                      onClick={() => {
                        const service = buildService();
                        if (!service) return;
                        setIsLoadingSnapshots(true);
                        Promise.all([
                          service.listSnapshots(selectedSection),
                          selectedSection === "semantic"
                            ? service.listEntitySnapshots("tmdl")
                            : selectedSection === "reports"
                              ? service.listEntitySnapshots("report")
                              : Promise.resolve([]),
                        ])
                          .then(([sectionSnapshots, rawEntitySnapshots]) => {
                            setSnapshots(sectionSnapshots);
                            setEntitySnapshots(rawEntitySnapshots);
                          })
                          .finally(() => setIsLoadingSnapshots(false));
                      }}
                    >
                      Refresh
                    </Button>
                  </div>

                  {snapshotMessage && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {snapshotMessage.isError
                        ? <ErrorCircleRegular color="var(--colorPaletteRedForeground1)" />
                        : <CheckmarkCircleRegular color="var(--colorPaletteGreenForeground1)" />}
                      <Caption1>{snapshotMessage.text}</Caption1>
                    </div>
                  )}

                  {isLoadingSnapshots ? (
                    <Spinner label="Loading snapshots..." />
                  ) : snapshots.length === 0 && entitySnapshots.length === 0 ? (
                    <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                      No snapshots found for {SECTION_LABELS[selectedSection]}. Enable auto-snapshot or save one manually above.
                    </Caption1>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <SnapshotTable snapshots={snapshots} onSelectForCompare={(id, slot) => {
                        if (slot === "a") setCompareSnapshotA(id);
                        else setCompareSnapshotB(id);
                      }} />

                      {(selectedSection === "semantic" || selectedSection === "reports") && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <Text weight="semibold">
                            {selectedSection === "semantic" ? "Saved TMDL snapshots" : "Saved report JSON snapshots"}
                          </Text>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <Field label="Snapshot A">
                              <Select
                                value={entityCompareSnapshotA}
                                onChange={(_, data) => setEntityCompareSnapshotA(data.value)}
                                style={{ width: 260 }}
                              >
                                <option value="">Select snapshot A</option>
                                {filteredEntitySnapshots.map((snapshot) => (
                                  <option key={`entity-a-${snapshot.id}`} value={snapshot.id}>
                                    {snapshot.displayName} - {new Date(snapshot.savedAtUtc).toLocaleString()}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Snapshot B">
                              <Select
                                value={entityCompareSnapshotB}
                                onChange={(_, data) => setEntityCompareSnapshotB(data.value)}
                                style={{ width: 260 }}
                              >
                                <option value="">Select snapshot B</option>
                                {filteredEntitySnapshots.map((snapshot) => (
                                  <option key={`entity-b-${snapshot.id}`} value={snapshot.id}>
                                    {snapshot.displayName} - {new Date(snapshot.savedAtUtc).toLocaleString()}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Button
                              appearance="secondary"
                              icon={isEntityComparing ? <Spinner size="tiny" /> : <ArrowSwapRegular />}
                              disabled={isEntityComparing || !entityCompareSnapshotA || !entityCompareSnapshotB}
                              onClick={handleOpenEntityCompare}
                            >
                              Open comparison window
                            </Button>
                          </div>
                          {filteredEntitySnapshots.length === 0 ? (
                            <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                              No raw {selectedSection === "semantic" ? "TMDL" : "report JSON"} snapshots found for the selected entity.
                            </Caption1>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {filteredEntitySnapshots.map((snapshot) => (
                                <div
                                  key={snapshot.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    padding: 12,
                                    border: "1px solid var(--colorNeutralStroke2)",
                                    borderRadius: 8,
                                  }}
                                >
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <Text weight="medium">{snapshot.displayName}</Text>
                                    <Caption1>{snapshot.label || snapshot.id}</Caption1>
                                    <Caption1>{new Date(snapshot.savedAtUtc).toLocaleString()}</Caption1>
                                    <Caption1>{snapshot.filePath}</Caption1>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                    <Badge appearance="outline">{snapshot.entityType === "tmdl" ? "TMDL" : "JSON"}</Badge>
                                    <Button
                                      size="small"
                                      onClick={(): void => {
                                        void handleOpenEntitySnapshot(snapshot.id);
                                      }}
                                    >
                                      Open
                                    </Button>
                                    <div style={{ display: "flex", gap: 4 }}>
                                      <Button
                                        size="small"
                                        onClick={() => setEntityCompareSnapshotA(snapshot.id)}
                                      >
                                        Use as A
                                      </Button>
                                      <Button
                                        size="small"
                                        onClick={() => setEntityCompareSnapshotB(snapshot.id)}
                                      >
                                        Use as B
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Compare tab ─────────────────────────────────────────── */}
              {activeTab === "compare" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <Field label="Snapshot A (baseline)">
                      <Input
                        value={compareSnapshotA}
                        onChange={(_, d) => setCompareSnapshotA(d.value)}
                        placeholder="Snapshot ID"
                        style={{ width: 260 }}
                      />
                    </Field>
                    <Field label="Snapshot B (comparison)">
                      <Input
                        value={compareSnapshotB}
                        onChange={(_, d) => setCompareSnapshotB(d.value)}
                        placeholder="Snapshot ID"
                        style={{ width: 260 }}
                      />
                    </Field>
                    <Button
                      appearance="primary"
                      icon={isComparing ? <Spinner size="tiny" /> : <ArrowSwapRegular />}
                      onClick={handleCompare}
                      disabled={isComparing || !compareSnapshotA || !compareSnapshotB}
                    >
                      Compare
                    </Button>
                  </div>

                  <Caption1 style={{ color: "var(--colorNeutralForeground3)" }}>
                    Tip: Select snapshot IDs from the History tab using "Use as A" / "Use as B".
                  </Caption1>

                  {compareError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ErrorCircleRegular color="var(--colorPaletteRedForeground1)" />
                      <Caption1>{compareError}</Caption1>
                    </div>
                  )}

                  {compareResult && (
                    <SnapshotDiff resultA={compareResult.a} resultB={compareResult.b} />
                  )}
                </div>
              )}
            </div>
            <Dialog open={isEntityViewerOpen} onOpenChange={(_, data) => setIsEntityViewerOpen(data.open)}>
              <DialogSurface style={{ maxWidth: 980, width: "min(96vw, 980px)" }}>
                <DialogBody>
                  <DialogTitle>Entity snapshot content</DialogTitle>
                  <DialogContent>
                    {isEntityViewerLoading ? (
                      <Spinner label="Loading snapshot content..." />
                    ) : entityViewerError ? (
                      <Caption1 style={{ color: "var(--colorPaletteRedForeground1)" }}>{entityViewerError}</Caption1>
                    ) : entityViewerSnapshot ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <Text weight="semibold">{entityViewerSnapshot.meta.displayName}</Text>
                        <Caption1>{entityViewerSnapshot.meta.label || entityViewerSnapshot.meta.id}</Caption1>
                        <Caption1>{new Date(entityViewerSnapshot.meta.savedAtUtc).toLocaleString()}</Caption1>
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: 12,
                            lineHeight: 1.5,
                            background: "var(--colorNeutralBackground3)",
                            borderRadius: 8,
                            padding: 12,
                            maxHeight: "65vh",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {entityViewerSnapshot.content}
                        </div>
                      </div>
                    ) : (
                      <Caption1>Snapshot content is unavailable.</Caption1>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <Button appearance="primary" onClick={() => setIsEntityViewerOpen(false)}>Close</Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>

            <Dialog open={isEntityCompareOpen} onOpenChange={(_, data) => setIsEntityCompareOpen(data.open)}>
              <DialogSurface style={{ maxWidth: 1200, width: "min(96vw, 1200px)" }}>
                <DialogBody>
                  <DialogTitle>Entity snapshot comparison</DialogTitle>
                  <DialogContent>
                    {isEntityComparing ? (
                      <Spinner label="Comparing snapshots..." />
                    ) : entityCompareError ? (
                      <Caption1 style={{ color: "var(--colorPaletteRedForeground1)" }}>{entityCompareError}</Caption1>
                    ) : entityCompareResult ? (
                      <EntitySnapshotDiff resultA={entityCompareResult.a} resultB={entityCompareResult.b} />
                    ) : (
                      <Caption1>Select two snapshots and run compare.</Caption1>
                    )}
                  </DialogContent>
                  <DialogActions>
                    <Button appearance="primary" onClick={() => setIsEntityCompareOpen(false)}>Close</Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
            </>
        ),
      } satisfies CentralPanelConfig}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SnapshotTableProps {
  snapshots: StorageSnapshotMeta[];
  onSelectForCompare: (id: string, slot: "a" | "b") => void;
}

function SnapshotTable({ snapshots, onSelectForCompare }: SnapshotTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--colorNeutralStroke1)" }}>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Date</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Label</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>ID</th>
            <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid var(--colorNeutralBackground3)" }}>
              <td style={{ padding: "6px 8px" }}>
                <Caption1>{new Date(s.savedAtUtc).toLocaleString()}</Caption1>
              </td>
              <td style={{ padding: "6px 8px" }}>
                {s.label ? (
                  <Badge appearance="tint" color="informative">{s.label}</Badge>
                ) : (
                  <Caption1 style={{ color: "var(--colorNeutralForeground4)" }}>auto</Caption1>
                )}
              </td>
              <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11 }}>
                {s.id.slice(0, 12)}…
              </td>
              <td style={{ padding: "6px 8px" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <Tooltip content="Use as baseline (A) for comparison" relationship="label">
                    <Button size="small" onClick={() => onSelectForCompare(s.id, "a")}>Use as A</Button>
                  </Tooltip>
                  <Tooltip content="Use as comparison (B)" relationship="label">
                    <Button size="small" onClick={() => onSelectForCompare(s.id, "b")}>Use as B</Button>
                  </Tooltip>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SnapshotDiffProps {
  resultA: { meta: StorageSnapshotMeta; data: unknown } | undefined;
  resultB: { meta: StorageSnapshotMeta; data: unknown } | undefined;
}

function SnapshotDiff({ resultA, resultB }: SnapshotDiffProps) {
  const renderJson = (data: unknown) => JSON.stringify(data, null, 2);

  const computeLineDiff = (textA: string, textB: string) => {
    const linesA = textA.split("\n");
    const linesB = textB.split("\n");
    const maxLen = Math.max(linesA.length, linesB.length);
    const rows: { lineA: string | null; lineB: string | null; changed: boolean }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const la = linesA[i] ?? null;
      const lb = linesB[i] ?? null;
      rows.push({ lineA: la, lineB: lb, changed: la !== lb });
    }

    return rows;
  };

  if (!resultA && !resultB) {
    return <Caption1>Both snapshots could not be loaded.</Caption1>;
  }

  const textA = resultA ? renderJson(resultA.data) : "(not found)";
  const textB = resultB ? renderJson(resultB.data) : "(not found)";
  const diff = computeLineDiff(textA, textB);

  const changedCount = diff.filter((r) => r.changed).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Text weight="semibold">Diff result</Text>
        <Badge appearance="tint" color={changedCount === 0 ? "success" : "warning"}>
          {changedCount === 0 ? "No differences" : `${changedCount} changed line(s)`}
        </Badge>
      </div>

      <div style={{ display: "flex", gap: 4, fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
        <span>A: {resultA ? new Date(resultA.meta.savedAtUtc).toLocaleString() : "—"}</span>
        <span style={{ margin: "0 8px" }}>|</span>
        <span>B: {resultB ? new Date(resultB.meta.savedAtUtc).toLocaleString() : "—"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, overflowX: "auto" }}>
        {/* Side A */}
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            A — {resultA?.meta.label ?? resultA?.meta.id.slice(0, 10) ?? "—"}
          </Text>
          <div style={{
            fontFamily: "monospace", fontSize: 11, background: "var(--colorNeutralBackground3)",
            borderRadius: 4, padding: 8, overflowY: "auto", maxHeight: 500, whiteSpace: "pre",
          }}>
            {diff.map((row, i) => (
              <div key={i} style={{ background: row.changed ? "var(--colorPaletteYellowBackground2)" : undefined }}>
                {row.lineA ?? " "}
              </div>
            ))}
          </div>
        </div>

        {/* Side B */}
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            B — {resultB?.meta.label ?? resultB?.meta.id.slice(0, 10) ?? "—"}
          </Text>
          <div style={{
            fontFamily: "monospace", fontSize: 11, background: "var(--colorNeutralBackground3)",
            borderRadius: 4, padding: 8, overflowY: "auto", maxHeight: 500, whiteSpace: "pre",
          }}>
            {diff.map((row, i) => (
              <div key={i} style={{ background: row.changed ? "var(--colorPaletteYellowBackground2)" : undefined }}>
                {row.lineB ?? " "}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface EntitySnapshotDiffProps {
  resultA: { meta: EntitySnapshotMeta; content: string } | undefined;
  resultB: { meta: EntitySnapshotMeta; content: string } | undefined;
}

function EntitySnapshotDiff({ resultA, resultB }: EntitySnapshotDiffProps) {
  const computeLineDiff = (textA: string, textB: string) => {
    const linesA = textA.split("\n");
    const linesB = textB.split("\n");
    const maxLen = Math.max(linesA.length, linesB.length);
    const rows: { lineA: string | null; lineB: string | null; changed: boolean }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const lineA = linesA[i] ?? null;
      const lineB = linesB[i] ?? null;
      rows.push({ lineA, lineB, changed: lineA !== lineB });
    }

    return rows;
  };

  if (!resultA || !resultB) {
    return <Caption1>One or both snapshots could not be loaded.</Caption1>;
  }

  const diff = computeLineDiff(resultA.content, resultB.content);
  const changedCount = diff.filter((row) => row.changed).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Text weight="semibold">Raw content diff</Text>
        <Badge appearance="tint" color={changedCount === 0 ? "success" : "warning"}>
          {changedCount === 0 ? "No differences" : `${changedCount} changed line(s)`}
        </Badge>
      </div>

      <div style={{ display: "flex", gap: 4, fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
        <span>A: {resultA.meta.displayName} ({new Date(resultA.meta.savedAtUtc).toLocaleString()})</span>
        <span style={{ margin: "0 8px" }}>|</span>
        <span>B: {resultB.meta.displayName} ({new Date(resultB.meta.savedAtUtc).toLocaleString()})</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, overflowX: "auto" }}>
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            A - {resultA.meta.label ?? resultA.meta.id.slice(0, 10)}
          </Text>
          <div style={{
            fontFamily: "monospace", fontSize: 11, background: "var(--colorNeutralBackground3)",
            borderRadius: 4, padding: 8, overflowY: "auto", maxHeight: 520, whiteSpace: "pre",
          }}>
            {diff.map((row, index) => (
              <div key={`entity-a-${index}`} style={{ background: row.changed ? "var(--colorPaletteYellowBackground2)" : undefined }}>
                {row.lineA ?? " "}
              </div>
            ))}
          </div>
        </div>

        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            B - {resultB.meta.label ?? resultB.meta.id.slice(0, 10)}
          </Text>
          <div style={{
            fontFamily: "monospace", fontSize: 11, background: "var(--colorNeutralBackground3)",
            borderRadius: 4, padding: 8, overflowY: "auto", maxHeight: 520, whiteSpace: "pre",
          }}>
            {diff.map((row, index) => (
              <div key={`entity-b-${index}`} style={{ background: row.changed ? "var(--colorPaletteYellowBackground2)" : undefined }}>
                {row.lineB ?? " "}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
