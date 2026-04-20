import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, useHistory } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NotificationType } from "@ms-fabric/workload-client";
import { PageProps, ContextProps } from "../../App";
import {
  ItemWithDefinition,
  getWorkloadItem,
  callGetItem,
  saveWorkloadItem,
} from "../../controller/ItemCRUDController";
import { callOpenSettings } from "../../controller/SettingsController";
import { callNotificationOpen } from "../../controller/NotificationController";
import {
  ItemEditor,
  useViewNavigation,
  RegisteredNotification,
} from "../../components/ItemEditor";
import {
  InsightWorkbenchItemDefinition,
  LineageGraphState,
  MetadataArtifactCatalogState,
  ReportScannerState,
  RequirementsBoardState,
  RequirementsBoardStorageSettings,
  SemanticEntityTmdlHistoryEntry,
} from "./InsightWorkbenchItemDefinition";
import { InsightWorkbenchStorageSettings } from "./InsightWorkbenchItemDefinition";
import { VIEW, InsightWorkbenchView } from "./InsightWorkbenchViewNames";
import { createStorageService } from "./services/InsightWorkbenchStorageService";
import { InsightWorkbenchStorageSettingsView } from "./views/StorageSettings/InsightWorkbenchStorageSettingsView";
import { InsightWorkbenchItemEmptyView } from "./InsightWorkbenchItemEmptyView";
import { InsightWorkbenchItemDefaultView } from "./InsightWorkbenchItemDefaultView";
import { InsightWorkbenchItemRibbon } from "./InsightWorkbenchItemRibbon";
import { MetadataExplorerView } from "./views/MetadataExplorer/MetadataExplorerView";
import {
  SemanticAnalyzerDetailView,
  SemanticAnalyzerProvider,
  SemanticAnalyzerView,
} from "./views/SemanticAnalyzer/SemanticAnalyzerView";
import { LineageGraphView } from "./views/LineageGraph/LineageGraphView";
import { RequirementsBoardView } from "./views/RequirementsBoard/RequirementsBoardView";
import { ReportScannerView } from "./views/ReportScanner/ReportScannerView";
import { LakehouseAnalyzerView } from "./views/LakehouseAnalyzer/LakehouseAnalyzerView";
import { MetadataExplorerClient } from "../../clients/MetadataExplorerClient";
import "./InsightWorkbenchItem.scss";

// ---------------------------------------------------------------------------
// Save status
// ---------------------------------------------------------------------------
const enum SaveStatus {
  NotSaved = 'NotSaved',
  Saving = 'Saving',
  Saved = 'Saved',
}

const INITIAL_DEFINITION: InsightWorkbenchItemDefinition = {
  schemaVersion: '1.0',
  requirementsBoard: { cards: [] },
};

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function InsightWorkbenchItemEditor(props: PageProps) {
  const { workloadClient } = props;
  const pageContext = useParams<ContextProps>();
  const history = useHistory();
  const { t } = useTranslation();
  const { pathname, search } = useLocation();

  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState<ItemWithDefinition<InsightWorkbenchItemDefinition>>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.NotSaved);
  const [currentDefinition, setCurrentDefinition] =
    useState<InsightWorkbenchItemDefinition>(INITIAL_DEFINITION);
  const [viewSetter, setViewSetter] = useState<((view: string) => void) | null>(null);
  const isApplyingViewFromUrlRef = useRef(false);
  const currentWorkbenchViewRef = useRef<string | null>(null);
  const metadataClient = useMemo(() => new MetadataExplorerClient(workloadClient), [workloadClient]);

  const mirrorSnapshotToSql = useCallback(async (snapshot: {
    snapshotId: string;
    snapshotKind: "Entity";
    entityType: "tmdl" | "report";
    entityId: string;
    workspaceId: string;
    displayName: string;
    label?: string;
    savedAtUtc: string;
    oneLakeFilePath: string;
    contentFormat: "json" | "tmdl";
    payload: string;
  }): Promise<string | undefined> => {
    const sqlSettings = currentDefinition.oneLakeStorage?.sqlWarehouse;
    if (!sqlSettings?.enabled || sqlSettings.persistSnapshots === false) {
      return undefined;
    }

    try {
      const result = await metadataClient.persistInsightWorkbenchSnapshot(snapshot);
      return result.message;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[InsightWorkbench] Snapshot SQL mirror failed", {
        snapshotId: snapshot.snapshotId,
        entityType: snapshot.entityType,
        message,
      });
      return message;
    }
  }, [currentDefinition.oneLakeStorage?.sqlWarehouse, metadataClient]);

  const handleRequirementsBoardStateChange = (nextBoardState: RequirementsBoardState) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      requirementsBoard: nextBoardState,
    }));

    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleRequirementsBoardStorageSettingsChange = (nextStorageSettings: RequirementsBoardStorageSettings) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      requirementsBoardStorage: nextStorageSettings,
    }));

    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleSaveTmdlSnapshot = useCallback(async (
    tmdlContent: string,
    modelId: string,
    modelName: string,
    workspaceId: string
  ): Promise<void> => {
    if (!item) {
      return;
    }

    const storageService = createStorageService(workloadClient, item, currentDefinition.oneLakeStorage);
    if (!storageService) {
      await callNotificationOpen(
        workloadClient,
        t('InsightWorkbench_Storage_Disabled_Title', 'OneLake storage not enabled'),
        t('InsightWorkbench_Storage_Disabled_Message', 'Enable OneLake storage in Storage Settings before saving TMDL snapshots.'),
        NotificationType.Warning,
        undefined
      );
      return;
    }

    try {
      await storageService.ensureFolderStructure();
      await storageService.ensureEntitySnapshotFolders();
      const meta = await storageService.saveModelTmdlSnapshot(modelId, modelName, workspaceId, tmdlContent);
      const sqlMirrorMessage = await mirrorSnapshotToSql({
        snapshotId: meta.id,
        snapshotKind: "Entity",
        entityType: "tmdl",
        entityId: modelId,
        workspaceId,
        displayName: modelName,
        label: meta.label,
        savedAtUtc: meta.savedAtUtc,
        oneLakeFilePath: meta.filePath,
        contentFormat: "tmdl",
        payload: tmdlContent,
      });
      await callNotificationOpen(
        workloadClient,
        t('InsightWorkbench_TmdlSnapshot_Saved_Title', 'TMDL snapshot saved'),
        t('InsightWorkbench_TmdlSnapshot_Saved_Message', 'Saved snapshot {{id}} for {{name}}.', { id: meta.id.slice(0, 8), name: modelName }),
        NotificationType.Success,
        undefined
      );
      if (sqlMirrorMessage && currentDefinition.oneLakeStorage?.sqlWarehouse?.enabled) {
        await callNotificationOpen(
          workloadClient,
          t('InsightWorkbench_TmdlSnapshot_SqlMirror_Title', 'SQL mirror status'),
          sqlMirrorMessage,
          sqlMirrorMessage.toLowerCase().includes('failed') || sqlMirrorMessage.toLowerCase().includes('error')
            ? NotificationType.Warning
            : NotificationType.Success,
          undefined
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await callNotificationOpen(
        workloadClient,
        t('InsightWorkbench_TmdlSnapshot_SaveFailed_Title', 'Failed to save TMDL snapshot'),
        message,
        NotificationType.Error,
        undefined
      );
    }
  }, [currentDefinition.oneLakeStorage, item, mirrorSnapshotToSql, t, workloadClient]);

  const handleSaveReportSnapshot = useCallback(async (
    reportId: string,
    reportName: string,
    workspaceId: string,
    definitionJson: object
  ): Promise<void> => {
    if (!item) {
      return;
    }

    const storageService = createStorageService(workloadClient, item, currentDefinition.oneLakeStorage);
    if (!storageService) {
      await callNotificationOpen(
        workloadClient,
        t('InsightWorkbench_Storage_Disabled_Title', 'OneLake storage not enabled'),
        t('InsightWorkbench_Storage_Disabled_Report_Message', 'Enable OneLake storage in Storage Settings before saving report JSON snapshots.'),
        NotificationType.Warning,
        undefined
      );
      return;
    }

    try {
      await storageService.ensureFolderStructure();
      await storageService.ensureEntitySnapshotFolders();
      const meta = await storageService.saveReportSnapshot(workspaceId, reportId, reportName, definitionJson);
      const sqlMirrorMessage = await mirrorSnapshotToSql({
        snapshotId: meta.id,
        snapshotKind: "Entity",
        entityType: "report",
        entityId: reportId,
        workspaceId,
        displayName: reportName,
        label: meta.label,
        savedAtUtc: meta.savedAtUtc,
        oneLakeFilePath: meta.filePath,
        contentFormat: "json",
        payload: JSON.stringify(definitionJson, null, 2),
      });
      await callNotificationOpen(
        workloadClient,
        t('InsightWorkbench_ReportSnapshot_Saved_Title', 'Report JSON snapshot saved'),
        t('InsightWorkbench_ReportSnapshot_Saved_Message', 'Saved snapshot {{id}} for {{name}}.', { id: meta.id.slice(0, 8), name: reportName }),
        NotificationType.Success,
        undefined
      );
      if (sqlMirrorMessage && currentDefinition.oneLakeStorage?.sqlWarehouse?.enabled) {
        await callNotificationOpen(
          workloadClient,
          t('InsightWorkbench_ReportSnapshot_SqlMirror_Title', 'SQL mirror status'),
          sqlMirrorMessage,
          sqlMirrorMessage.toLowerCase().includes('failed') || sqlMirrorMessage.toLowerCase().includes('error')
            ? NotificationType.Warning
            : NotificationType.Success,
          undefined
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await callNotificationOpen(
        workloadClient,
        t('InsightWorkbench_ReportSnapshot_SaveFailed_Title', 'Failed to save report JSON snapshot'),
        message,
        NotificationType.Error,
        undefined
      );
    }
  }, [currentDefinition.oneLakeStorage, item, mirrorSnapshotToSql, t, workloadClient]);

  const handleSemanticHistoryEntriesChange = (nextHistoryEntries: SemanticEntityTmdlHistoryEntry[]) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      semanticAnalyzer: {
        ...(previous.semanticAnalyzer ?? {}),
        tmdlHistoryEntries: nextHistoryEntries,
      },
    }));

    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleMetadataArtifactCatalogChange = (nextCatalog: MetadataArtifactCatalogState) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      metadataExplorer: {
        ...(previous.metadataExplorer ?? {}),
        artifactCatalog: nextCatalog,
      },
    }));

    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleLineageGraphStateChange = (nextState: LineageGraphState) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      lineageGraph: nextState,
    }));

    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleReportScannerStateChange = (nextState: ReportScannerState) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      reportScanner: nextState,
    }));

    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleOneLakeStorageSettingsChange = (settings: InsightWorkbenchStorageSettings) => {
    setCurrentDefinition((previous) => ({
      ...previous,
      schemaVersion: previous.schemaVersion ?? '1.0',
      oneLakeStorage: settings,
    }));
    setSaveStatus(SaveStatus.NotSaved);
  };

  const saveCurrentDefinition = useCallback(async (showNotification: boolean): Promise<boolean> => {
    if (!item) {
      return false;
    }

    setSaveStatus(SaveStatus.Saving);

    const definitionToSave: InsightWorkbenchItemDefinition = {
      ...currentDefinition,
      schemaVersion: '1.0',
    };

    let successResult: unknown;
    let errorMessage = '';

    try {
      successResult = await saveWorkloadItem<InsightWorkbenchItemDefinition>(
        workloadClient,
        { ...item, definition: definitionToSave }
      );
    } catch (err: unknown) {
      errorMessage = (err as Error)?.message ?? '';
    }

    if (successResult) {
      item.definition = definitionToSave;
      setCurrentDefinition(definitionToSave);
      setSaveStatus(SaveStatus.Saved);

      if (showNotification) {
        callNotificationOpen(
          workloadClient,
          t('ItemEditor_Saved_Notification_Title'),
          t('ItemEditor_Saved_Notification_Text', { itemName: item.displayName }),
          undefined,
          undefined
        );
      }

      return true;
    }

    setSaveStatus(SaveStatus.NotSaved);
    const msg = errorMessage
      ? `${t('ItemEditor_SaveFailed_Notification_Text', { itemName: item.displayName })} ${errorMessage}.`
      : t('ItemEditor_SaveFailed_Notification_Text', { itemName: item.displayName });

    if (showNotification) {
      callNotificationOpen(workloadClient, t('ItemEditor_SaveFailed_Notification_Title'), msg, NotificationType.Error, undefined);
    } else {
      console.warn('[InsightWorkbench] Auto-save failed:', msg);
    }

    return false;
  }, [currentDefinition, item, t, workloadClient]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadDataFromUrl = useCallback(async (ctx: ContextProps, path: string): Promise<void> => {
    if (ctx.itemObjectId && item && item.id === ctx.itemObjectId) {
      return; // already loaded
    }

    setIsLoading(true);

    if (ctx.itemObjectId) {
      try {
        let loaded = await getWorkloadItem<InsightWorkbenchItemDefinition>(
          workloadClient,
          ctx.itemObjectId
        );

        if (!loaded.definition) {
          setSaveStatus(SaveStatus.NotSaved);
          loaded = { ...loaded, definition: INITIAL_DEFINITION };
        } else {
          setSaveStatus(SaveStatus.Saved);
        }

        setItem(loaded);
        setCurrentDefinition(loaded.definition);
      } catch (err) {
        console.error('[InsightWorkbench] Failed to load item:', err);
        setItem(undefined);
      }
    }

    setIsLoading(false);
  }, [item, workloadClient]);

  useEffect(() => {
    loadDataFromUrl(pageContext, pathname);
  }, [loadDataFromUrl, pageContext, pathname]);

  // ── Settings ──────────────────────────────────────────────────────────────
  const handleOpenSettings = async () => {
    if (item) {
      try {
        const res = await callGetItem(workloadClient, item.id);
        await callOpenSettings(workloadClient, res.item, 'About');
      } catch (err) {
        console.error('[InsightWorkbench] Failed to open settings:', err);
      }
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveItem(): Promise<void> {
    await saveCurrentDefinition(true);
  }

  // Auto-save item definition after edits so users don't need to click Save every time.
  useEffect(() => {
    let autoSaveTimer: number | undefined;

    if (!isLoading && item && saveStatus === SaveStatus.NotSaved) {
      autoSaveTimer = window.setTimeout(() => {
        void saveCurrentDefinition(false);
      }, 900);
    }

    return () => {
      if (autoSaveTimer) {
        window.clearTimeout(autoSaveTimer);
      }
    };
  }, [isLoading, item, saveCurrentDefinition, saveStatus]);

  // ── Derived save-enabled ──────────────────────────────────────────────────
  const isSaveEnabled = (currentView: string): boolean => {
    if (currentView === VIEW.EMPTY) return false;
    return saveStatus !== SaveStatus.Saved;
  };

  // ── View wrappers that use navigation hooks ───────────────────────────────

  const EmptyViewWrapper = () => {
    const { setCurrentView } = useViewNavigation();
    return (
      <InsightWorkbenchItemEmptyView
        workloadClient={workloadClient}
        item={item}
        onNavigateToHub={() => {
          setCurrentDefinition((prev) => ({
            ...prev,
            schemaVersion: '1.0',
          }));
          setSaveStatus(SaveStatus.NotSaved);
          setCurrentView(VIEW.HUB);
        }}
      />
    );
  };

  // ── Static view registrations ─────────────────────────────────────────────
  const views = [
    {
      name: VIEW.EMPTY,
      component: <EmptyViewWrapper />,
    },
    {
      name: VIEW.HUB,
      component: (
        <InsightWorkbenchItemDefaultView
          workloadClient={workloadClient}
          item={item}
          storageSettings={currentDefinition.requirementsBoardStorage}
          onStorageSettingsChange={handleRequirementsBoardStorageSettingsChange}
        />
      ),
    },
    {
      name: VIEW.METADATA_EXPLORER,
      component: (
        <MetadataExplorerView
          workloadClient={workloadClient}
          item={item}
          metadataState={currentDefinition.metadataExplorer}
          onArtifactCatalogChange={handleMetadataArtifactCatalogChange}
        />
      ),
    },
    {
      name: VIEW.SEMANTIC_ANALYZER,
      component: (
        <SemanticAnalyzerView
          workloadClient={workloadClient}
          item={item}
          storageSettings={currentDefinition.oneLakeStorage}
          detailViewName={VIEW.SEMANTIC_ANALYZER_DETAIL}
        />
      ),
    },
    {
      name: VIEW.SEMANTIC_ANALYZER_DETAIL,
      component: <SemanticAnalyzerDetailView />,
      isDetailView: true,
    },
    {
      name: VIEW.LINEAGE_GRAPH,
      component: (
        <LineageGraphView
          workloadClient={workloadClient}
          item={item}
          lineageState={currentDefinition.lineageGraph}
          onLineageStateChange={handleLineageGraphStateChange}
          artifactCatalog={currentDefinition.metadataExplorer?.artifactCatalog}
          onArtifactCatalogChange={handleMetadataArtifactCatalogChange}
        />
      ),
    },
    {
      name: VIEW.REPORT_SCANNER,
      component: (
        <ReportScannerView
          workloadClient={workloadClient}
          item={item}
          reportScannerState={currentDefinition.reportScanner}
          onReportScannerStateChange={handleReportScannerStateChange}
          artifactCatalog={currentDefinition.metadataExplorer?.artifactCatalog}
          onArtifactCatalogChange={handleMetadataArtifactCatalogChange}
          onSaveReportSnapshot={handleSaveReportSnapshot}
        />
      ),
    },
    {
      name: VIEW.REQUIREMENTS_BOARD,
      component: (
        <RequirementsBoardView
          workloadClient={workloadClient}
          item={item}
          boardState={currentDefinition.requirementsBoard}
          storageSettings={currentDefinition.requirementsBoardStorage}
          onBoardStateChange={handleRequirementsBoardStateChange}
          artifactCatalog={currentDefinition.metadataExplorer?.artifactCatalog}
          onArtifactCatalogChange={handleMetadataArtifactCatalogChange}
        />
      ),
    },
    {
      name: VIEW.LAKEHOUSE_ANALYZER,
      component: (
        <LakehouseAnalyzerView
          workloadClient={workloadClient}
          item={item}
        />
      ),
    },
    {
      name: VIEW.STORAGE_SETTINGS,
      component: (
        <InsightWorkbenchStorageSettingsView
          workloadClient={workloadClient}
          item={item}
          currentDefinition={currentDefinition}
          onStorageSettingsChange={handleOneLakeStorageSettingsChange}
        />
      ),
    },
  ];


  const getRequestedViewFromQuery = useCallback((): InsightWorkbenchView | null => {
    const params = new URLSearchParams(search);
    const requestedView = params.get("view");
    if (!requestedView) {
      return null;
    }

    const validViews = new Set(Object.values(VIEW));
    if (!validViews.has(requestedView as InsightWorkbenchView)) {
      return null;
    }

    return requestedView as InsightWorkbenchView;
  }, [search]);

  const syncViewToUrl = useCallback((view: string) => {
    const params = new URLSearchParams(search);
    const currentQueryView = params.get("view");

    if (view === VIEW.EMPTY) {
      if (currentQueryView !== null) {
        params.delete("view");
        const nextSearch = params.toString();
        history.push({ pathname, search: nextSearch.length > 0 ? `?${nextSearch}` : "" });
      }
      return;
    }

    if (currentQueryView === view) {
      return;
    }

    params.set("view", view);
    const nextSearch = params.toString();
    history.push({ pathname, search: `?${nextSearch}` });
  }, [history, pathname, search]);

  const handleWorkbenchViewChanged = useCallback((view: string) => {
    currentWorkbenchViewRef.current = view;

    if (isApplyingViewFromUrlRef.current) {
      isApplyingViewFromUrlRef.current = false;
      return;
    }

    syncViewToUrl(view);
  }, [syncViewToUrl]);

  // Determine initial view after load completes
  useEffect(() => {
    if (!isLoading && item && viewSetter) {
      const requestedView = getRequestedViewFromQuery();
      if (requestedView) {
        isApplyingViewFromUrlRef.current = true;
        currentWorkbenchViewRef.current = requestedView;
        viewSetter(requestedView);
        return;
      }

      const hasDefinition =
        item.definition?.schemaVersion !== undefined ||
        (item.definition?.requirementsBoard?.cards?.length ?? 0) > 0;
      const fallbackView = hasDefinition ? VIEW.HUB : VIEW.EMPTY;
      currentWorkbenchViewRef.current = fallbackView;
      viewSetter(fallbackView);
    }
  }, [getRequestedViewFromQuery, isLoading, item, viewSetter]);

  // Apply deep-link view when browser Back/Forward changes query string.
  useEffect(() => {
    if (!viewSetter || isLoading || !item) {
      return;
    }

    const requestedView = getRequestedViewFromQuery();
    if (!requestedView || currentWorkbenchViewRef.current === requestedView) {
      return;
    }

    isApplyingViewFromUrlRef.current = true;
    currentWorkbenchViewRef.current = requestedView;
    viewSetter(requestedView);
  }, [getRequestedViewFromQuery, isLoading, item, viewSetter]);

  // ── Static notification registrations ────────────────────────────────────
  const notifications: RegisteredNotification[] = [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SemanticAnalyzerProvider
      workloadClient={workloadClient}
      tmdlHistoryEntries={currentDefinition.semanticAnalyzer?.tmdlHistoryEntries ?? []}
      onTmdlHistoryEntriesChange={handleSemanticHistoryEntriesChange}
      onSaveTmdlSnapshot={handleSaveTmdlSnapshot}
    >
      <ItemEditor
        isLoading={isLoading}
        loadingMessage={t('InsightWorkbenchItemEditor_Loading', 'Loading Insight Workbench...')}
        onViewChange={handleWorkbenchViewChanged}
        ribbon={(context) => (
          <InsightWorkbenchItemRibbon
            {...props}
            viewContext={context}
            isSaveButtonEnabled={isSaveEnabled(context.currentView)}
            saveItemCallback={saveItem}
            openSettingsCallback={handleOpenSettings}
          />
        )}
        messageBar={notifications}
        views={views}
        viewSetter={(setCurrentView) => {
          if (!viewSetter) {
            setViewSetter(() => setCurrentView);
          }
        }}
      />
    </SemanticAnalyzerProvider>
  );
}
