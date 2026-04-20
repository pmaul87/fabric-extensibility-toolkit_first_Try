import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import {
  Badge,
  Button,
  Dropdown,
  Field,
  Option,
  Spinner,
  Text,
  Tab,
  TabList,
} from "@fluentui/react-components";
import { ItemEditorDefaultView, useViewNavigation } from "../../../../components/ItemEditor";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { MetadataExplorerClient } from "../../../../clients/MetadataExplorerClient";
import {
  ExplorerArtifact,
  LoadReportDefinitionResponse,
  formatApiError,
} from "../../../../services/MetadataService";
import {
  InsightWorkbenchItemDefinition,
  MetadataArtifactCatalogState,
  ReportScannerCachedDefinition,
  ReportScannerState,
} from "../../InsightWorkbenchItemDefinition";
import {
  buildDebugJson,
  parseDefinitionParts,
} from "../../models/ReportUsageModel";
import { buildUnifiedReport, UnifiedPage, UnifiedVisual, UnifiedFieldReference } from "../../models/UnifiedReportModel";
import { deserializeArtifactCatalog, serializeArtifactCatalog } from "../../services/MetadataArtifactCatalogStorage";
import { VIEW } from "../../InsightWorkbenchViewNames";
import { NAV_JUMP_SEMANTIC_ANALYZER, NAV_JUMP_REPORT_SCANNER, NAV_OPEN_STORAGE_HISTORY } from "../../InsightWorkbenchNavKeys";
import { ReportPagePreview } from "./ReportPagePreview";
import { UsedFieldsTable } from "./components/UsedFieldsTable";
import { VisualsTable } from "./components/VisualsTable";
import { useHighlightState } from "./hooks/useHighlightState";
import "../../InsightWorkbenchItem.scss";

const QUERY_PARAM_REPORT_ID = "reportId";
const QUERY_PARAM_REPORT_WORKSPACE_ID = "reportWorkspaceId";
const QUERY_PARAM_REPORT_PAGE = "reportPage";
const OPEN_STORAGE_HISTORY_EVENT = "InsightWorkbench:OpenStorageHistory";

interface ReportScannerViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  reportScannerState?: ReportScannerState;
  onReportScannerStateChange?: (nextState: ReportScannerState) => void;
  artifactCatalog?: MetadataArtifactCatalogState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
  onSaveReportSnapshot?: (reportId: string, reportName: string, workspaceId: string, definitionJson: object) => Promise<void>;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatJsonPrimitive(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function JsonTreeNode({ label, value, depth }: { label?: string; value: unknown; depth: number }) {
  const indentStyle = { marginLeft: `${depth * 14}px` };

  if (Array.isArray(value)) {
    const summary = `${label ? `${label}: ` : ""}[${value.length}]`;
    return (
      <details className="insight-workbench-json-node" open={depth < 2} style={indentStyle}>
        <summary className="insight-workbench-json-summary">{summary}</summary>
        <div className="insight-workbench-json-children">
          {value.length === 0 ? (
            <div className="insight-workbench-json-leaf" style={{ marginLeft: `${(depth + 1) * 14}px` }}>
              []
            </div>
          ) : (
            value.map((entry, index) => (
              <JsonTreeNode key={index} label={`[${index}]`} value={entry} depth={depth + 1} />
            ))
          )}
        </div>
      </details>
    );
  }

  if (isJsonRecord(value)) {
    const entries = Object.entries(value);
    const summary = `${label ? `${label}: ` : ""}{${entries.length}}`;
    return (
      <details className="insight-workbench-json-node" open={depth < 2} style={indentStyle}>
        <summary className="insight-workbench-json-summary">{summary}</summary>
        <div className="insight-workbench-json-children">
          {entries.length === 0 ? (
            <div className="insight-workbench-json-leaf" style={{ marginLeft: `${(depth + 1) * 14}px` }}>
              {"{}"}
            </div>
          ) : (
            entries.map(([key, entryValue]) => (
              <JsonTreeNode key={key} label={key} value={entryValue} depth={depth + 1} />
            ))
          )}
        </div>
      </details>
    );
  }

  const primitiveValue = formatJsonPrimitive(value);
  return (
    <div className="insight-workbench-json-leaf" style={indentStyle}>
      {label ? <span className="insight-workbench-json-key">{label}: </span> : null}
      <span className={typeof value === "string" ? "insight-workbench-json-string" : "insight-workbench-json-primitive"}>
        {primitiveValue}
      </span>
    </div>
  );
}

function ReportScannerContent({
  workloadClient,
  reportScannerState,
  onReportScannerStateChange,
  artifactCatalog,
  onArtifactCatalogChange,
  onSaveReportSnapshot,
}: {
  workloadClient: WorkloadClientAPI;
  reportScannerState?: ReportScannerState;
  onReportScannerStateChange?: (nextState: ReportScannerState) => void;
  artifactCatalog?: MetadataArtifactCatalogState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
  onSaveReportSnapshot?: (reportId: string, reportName: string, workspaceId: string, definitionJson: object) => Promise<void>;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { goBack, setCurrentView } = useViewNavigation();
  const apiClient = useMemo(() => new MetadataExplorerClient(workloadClient), [workloadClient]);
  const cachedArtifacts = useMemo(() => deserializeArtifactCatalog(artifactCatalog), [artifactCatalog]);

  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(true);
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);
  const [reports, setReports] = useState<ExplorerArtifact[]>([]);

  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(
    reportScannerState?.selectedReportKey ?? null
  );
  const [isLoadingDefinition, setIsLoadingDefinition] = useState<boolean>(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState<boolean>(false);
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [definitionResponse, setDefinitionResponse] = useState<LoadReportDefinitionResponse | undefined>(undefined);
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false);
  const [compareReportKey, setCompareReportKey] = useState<string>("");
  const [isComparingReports, setIsComparingReports] = useState<boolean>(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<{
    baseReport: ExplorerArtifact;
    targetReport: ExplorerArtifact;
    baseJson: string;
    targetJson: string;
  } | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [sectionsExpanded, setSectionsExpanded] = useState<Record<string, boolean>>({
    usedFields: true,
    preview: true,
    tableView: true,
    fieldSummary: false,
    debug: false
  });
  
  // Use custom hook for highlight state management
  const {
    selectedField,
    selectedVisual,
    showPreview,
    handleFieldClick,
    handleVisualClick,
    togglePreview,
    setShowPreview
  } = useHighlightState();
  const selectedReportKeyRef = useRef<string | null>(selectedReportKey);
  const definitionLoadRequestRef = useRef(0);

  const cachedDefinitions = useMemo(
    () => reportScannerState?.cachedDefinitions ?? [],
    [reportScannerState?.cachedDefinitions]
  );

  const selectedReport = useMemo(() => {
    if (!selectedReportKey) {
      return undefined;
    }

    return reports.find((report) => `${report.workspaceId}:${report.id}` === selectedReportKey);
  }, [reports, selectedReportKey]);

  const compareCandidateReports = useMemo(
    () => reports.filter((report) => `${report.workspaceId}:${report.id}` !== selectedReportKey),
    [reports, selectedReportKey]
  );

  const deepLinkState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const reportId = params.get(QUERY_PARAM_REPORT_ID) ?? undefined;
    const reportWorkspaceId = params.get(QUERY_PARAM_REPORT_WORKSPACE_ID) ?? undefined;
    const rawPage = params.get(QUERY_PARAM_REPORT_PAGE);
    const parsedPage = rawPage !== null ? Number.parseInt(rawPage, 10) : undefined;
    const reportPageIndex =
      parsedPage !== undefined && Number.isFinite(parsedPage) && parsedPage >= 0
        ? parsedPage
        : undefined;

    return {
      reportId,
      reportWorkspaceId,
      reportPageIndex,
    };
  }, [location.search]);

  const syncReportScannerDeepLink = useCallback(
    (next: { reportId?: string; reportWorkspaceId?: string; reportPageIndex?: number }) => {
      const params = new URLSearchParams(location.search);

      if (next.reportId && next.reportWorkspaceId) {
        params.set(QUERY_PARAM_REPORT_ID, next.reportId);
        params.set(QUERY_PARAM_REPORT_WORKSPACE_ID, next.reportWorkspaceId);
      } else {
        params.delete(QUERY_PARAM_REPORT_ID);
        params.delete(QUERY_PARAM_REPORT_WORKSPACE_ID);
      }

      if (next.reportPageIndex !== undefined && next.reportPageIndex >= 0) {
        params.set(QUERY_PARAM_REPORT_PAGE, String(next.reportPageIndex));
      } else {
        params.delete(QUERY_PARAM_REPORT_PAGE);
      }

      const nextSearch = params.toString();
      const currentSearch = location.search.startsWith("?")
        ? location.search.slice(1)
        : location.search;

      if (nextSearch === currentSearch) {
        return;
      }

      history.replace({
        pathname: location.pathname,
        search: nextSearch.length > 0 ? `?${nextSearch}` : "",
      });
    },
    [history, location.pathname, location.search]
  );

  const handleJumpToSemanticAnalyzer = useCallback(async (fieldKey: string) => {
    let jumpPayload: { fieldKey: string; modelId?: string; modelWorkspaceId?: string } = {
      fieldKey,
    };

    try {
      if (selectedReport) {
        const artifactsToUse = cachedArtifacts.length > 0
          ? cachedArtifacts
          : (await apiClient.loadArtifacts({ includeTrace: false, maxArtifacts: 0 })).artifacts;

        const lineageResponse = await apiClient.loadLineageLinks({ artifacts: artifactsToUse });
        const modelLink = lineageResponse.links.find((link) =>
          link.relationshipType === "report-uses-dataset"
          && link.sourceArtifactId === selectedReport.id
          && link.sourceWorkspaceId === selectedReport.workspaceId
        );

        if (modelLink) {
          jumpPayload = {
            fieldKey,
            modelId: modelLink.targetArtifactId,
            modelWorkspaceId: modelLink.targetWorkspaceId,
          };
        }
      }
    } catch {
      // Best effort: still navigate and pass field-only payload.
    }

    try {
      window.sessionStorage.setItem(NAV_JUMP_SEMANTIC_ANALYZER, JSON.stringify(jumpPayload));
      window.dispatchEvent(
        new CustomEvent("InsightWorkbench:SemanticAnalyzerJumpField", {
          detail: jumpPayload,
        })
      );
    } catch {
      // Ignore storage/event failures and still navigate.
    }

    setCurrentView("semantic-analyzer");
  }, [apiClient, cachedArtifacts, selectedReport, setCurrentView]);

  const parsedParts = useMemo(
    () => parseDefinitionParts(definitionResponse?.definition),
    [definitionResponse]
  );

  // Build UNIFIED structure - single source of truth for both preview and table
  const unifiedReport = useMemo(() => {
    if (!selectedReport || !definitionResponse) {
      return null;
    }

    const report = buildUnifiedReport(selectedReport, parsedParts);
    console.log("[ReportScannerView] Unified report built:", {
      reportId: report.reportId,
      pageCount: report.pages.length,
      totalVisuals: report.totalVisuals,
      totalFields: report.totalFields,
      allFieldsLength: report.allFields.length,
      pages: report.pages.map(p => ({
        id: p.id,
        name: p.name,
        visualCount: p.visuals.length,
        visualsWithPosition: p.visuals.filter(v => v.x !== undefined).length,
        visualsWithFields: p.visuals.filter(v => v.fields.length > 0).length,
      })),
    });
    return report;
  }, [selectedReport, parsedParts, definitionResponse]);

  const debugJson = useMemo(() => buildDebugJson(definitionResponse), [definitionResponse]);

  const handleSaveReportSnapshot = useCallback(async (): Promise<void> => {
    if (!selectedReport || !definitionResponse || !onSaveReportSnapshot) {
      return;
    }

    setIsSavingSnapshot(true);
    try {
      const snapshotPayload = buildDebugJson(definitionResponse);
      await onSaveReportSnapshot(
        selectedReport.id,
        selectedReport.displayName,
        selectedReport.workspaceId,
        snapshotPayload && typeof snapshotPayload === "object"
          ? snapshotPayload as object
          : { value: snapshotPayload }
      );
    } finally {
      setIsSavingSnapshot(false);
    }
  }, [definitionResponse, onSaveReportSnapshot, selectedReport]);

  const handleOpenSnapshotHistory = useCallback((): void => {
    const payload = { section: "reports" as const };
    try {
      window.sessionStorage.setItem(
        NAV_OPEN_STORAGE_HISTORY,
        JSON.stringify(payload)
      );
      window.dispatchEvent(new CustomEvent(OPEN_STORAGE_HISTORY_EVENT, { detail: payload }));
    } catch {
      // Ignore storage errors and still navigate.
    }
    setCurrentView(VIEW.STORAGE_SETTINGS);
  }, [setCurrentView]);

  const stringifyReportPayload = useCallback((value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, []);

  const resolveReportDefinition = useCallback(async (report: ExplorerArtifact): Promise<LoadReportDefinitionResponse> => {
    const cachedDefinition = cachedDefinitions.find(
      (entry) => entry.workspaceId === report.workspaceId && entry.reportId === report.id
    );

    if (cachedDefinition) {
      return {
        definition: cachedDefinition.definition,
        source: cachedDefinition.source,
        operationStatus: cachedDefinition.operationStatus,
        attempts: cachedDefinition.attempts,
        fetchedAt: cachedDefinition.fetchedAtUtc,
      };
    }

    return apiClient.loadReportDefinition({
      workspaceId: report.workspaceId,
      reportId: report.id,
    });
  }, [apiClient, cachedDefinitions]);

  const handleCompareReports = useCallback(async (): Promise<void> => {
    if (!selectedReport || !compareReportKey) {
      return;
    }

    const targetReport = compareCandidateReports.find(
      (report) => `${report.workspaceId}:${report.id}` === compareReportKey
    );

    if (!targetReport) {
      setCompareError(t("InsightWorkbench_ReportScanner_CompareTo_SelectTarget", "Select another report to compare."));
      return;
    }

    setIsComparingReports(true);
    setCompareError(null);
    setCompareResult(null);

    try {
      const [baseDefinition, targetDefinition] = await Promise.all([
        definitionResponse
          ? Promise.resolve(definitionResponse)
          : resolveReportDefinition(selectedReport),
        resolveReportDefinition(targetReport),
      ]);

      const basePayload = buildDebugJson(baseDefinition);
      const targetPayload = buildDebugJson(targetDefinition);

      setCompareResult({
        baseReport: selectedReport,
        targetReport,
        baseJson: stringifyReportPayload(basePayload),
        targetJson: stringifyReportPayload(targetPayload),
      });
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsComparingReports(false);
    }
  }, [compareCandidateReports, compareReportKey, definitionResponse, resolveReportDefinition, selectedReport, stringifyReportPayload, t]);

  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    setReportLoadError(null);

    try {
      const artifactsToUse = cachedArtifacts.length > 0
        ? cachedArtifacts
        : (await apiClient.loadArtifacts({ includeTrace: false, maxArtifacts: 0 })).artifacts;
      const reportArtifacts = artifactsToUse
        .filter((artifact) => String(artifact.type || "").toLowerCase() === "report")
        .sort(
          (left, right) =>
            left.workspaceName.localeCompare(right.workspaceName) ||
            left.displayName.localeCompare(right.displayName)
        );

      if (cachedArtifacts.length === 0) {
        onArtifactCatalogChange?.(serializeArtifactCatalog(artifactsToUse, "view-load"));
      }

      setReports(reportArtifacts);

      if (reportArtifacts.length === 0) {
        setReportLoadError(
          t(
            "InsightWorkbench_ReportScanner_NoReports",
            "No reports were found in accessible workspaces."
          )
        );
      }
    } catch (error) {
      setReportLoadError(
        `${t(
          "InsightWorkbench_ReportScanner_LoadReportsError",
          "Failed to load reports. Verify workspace access and try again."
        )} ${formatApiError(error)}`
      );
    } finally {
      setIsLoadingReports(false);
    }
  }, [apiClient, cachedArtifacts, onArtifactCatalogChange, t]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    selectedReportKeyRef.current = selectedReportKey;
  }, [selectedReportKey]);

  useEffect(() => {
    if (compareReportKey && !compareCandidateReports.some((report) => `${report.workspaceId}:${report.id}` === compareReportKey)) {
      setCompareReportKey("");
    }
    setCompareResult(null);
    setCompareError(null);
  }, [compareCandidateReports, compareReportKey, selectedReportKey]);

  const persistSelectedReportKey = useCallback((nextKey: string | null) => {
    onReportScannerStateChange?.({
      ...(reportScannerState ?? {}),
      selectedReportKey: nextKey ?? undefined,
    });
  }, [onReportScannerStateChange, reportScannerState]);

  // Stable ref so deep-link effect doesn't re-fire when parent re-renders and recreates the callback
  const persistSelectedReportKeyRef = useRef(persistSelectedReportKey);
  persistSelectedReportKeyRef.current = persistSelectedReportKey;

  useEffect(() => {
    if (!deepLinkState.reportId || !deepLinkState.reportWorkspaceId || reports.length === 0) {
      return;
    }

    const requestedKey = `${deepLinkState.reportWorkspaceId}:${deepLinkState.reportId}`;
    const requestedReport = reports.find(
      (report) => report.workspaceId === deepLinkState.reportWorkspaceId && report.id === deepLinkState.reportId
    );

    if (!requestedReport) {
      return;
    }

    const hasReportSelectionChanged = selectedReportKeyRef.current !== requestedKey;

    setSelectedReportKey((previous) => previous === requestedKey ? previous : requestedKey);
    persistSelectedReportKeyRef.current(requestedKey);

    // Only reset preview state when deep-link navigation points to a different report.
    if (hasReportSelectionChanged) {
      setSelectedPageIndex(0);
      setShowPreview(false);
    }
  }, [
    deepLinkState.reportId,
    deepLinkState.reportWorkspaceId,
    reports,
    setShowPreview,
  ]);

  // Handle jump navigation from Semantic Analyzer (sessionStorage written before view switch)
  useEffect(() => {
    try {
      const jumpKey = window.sessionStorage.getItem(NAV_JUMP_REPORT_SCANNER);
      if (jumpKey) {
        window.sessionStorage.removeItem(NAV_JUMP_REPORT_SCANNER);
        setSelectedReportKey(jumpKey);
        persistSelectedReportKeyRef.current(jumpKey);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const loadDefinition = useCallback(async (forceRefresh: boolean = false) => {
    if (!selectedReport) {
      setDefinitionResponse(undefined);
      setDefinitionError(null);
      setSelectedPageIndex(0);
      return;
    }

    const requestId = ++definitionLoadRequestRef.current;
    const requestedReportKey = `${selectedReport.workspaceId}:${selectedReport.id}`;

    const cachedDefinition = cachedDefinitions.find(
      (entry) => entry.workspaceId === selectedReport.workspaceId && entry.reportId === selectedReport.id
    );

    if (!forceRefresh && cachedDefinition) {
      if (definitionLoadRequestRef.current !== requestId || selectedReportKeyRef.current !== requestedReportKey) {
        return;
      }
      setDefinitionResponse({
        definition: cachedDefinition.definition,
        source: cachedDefinition.source,
        operationStatus: cachedDefinition.operationStatus,
        attempts: cachedDefinition.attempts,
        fetchedAt: cachedDefinition.fetchedAtUtc,
      });
      setDefinitionError(null);
      setSelectedPageIndex(0);
      return;
    }

    setIsLoadingDefinition(true);
    setDefinitionError(null);
    setSelectedPageIndex(0);
    const scanStartedAt = Date.now();

    try {
      const response = await apiClient.loadReportDefinition({
        workspaceId: selectedReport.workspaceId,
        reportId: selectedReport.id,
      });

      if (definitionLoadRequestRef.current !== requestId || selectedReportKeyRef.current !== requestedReportKey) {
        return;
      }

      setDefinitionResponse(response);

      const persistedEntry: ReportScannerCachedDefinition = {
        workspaceId: selectedReport.workspaceId,
        reportId: selectedReport.id,
        definition: response.definition,
        fetchedAtUtc: response.fetchedAt,
        source: response.source,
        operationStatus: response.operationStatus,
        attempts: response.attempts,
      };

      const nextCachedDefinitions = [
        persistedEntry,
        ...cachedDefinitions.filter(
          (entry) => !(entry.workspaceId === selectedReport.workspaceId && entry.reportId === selectedReport.id)
        ),
      ];

      onReportScannerStateChange?.({
        ...(reportScannerState ?? {}),
        selectedReportKey: `${selectedReport.workspaceId}:${selectedReport.id}`,
        cachedDefinitions: nextCachedDefinitions,
        lastRefreshedAtUtc: new Date().toISOString(),
      });

      // Persist to database (non-blocking, best-effort)
      void persistScanToDatabase(selectedReport, response, scanStartedAt);
    } catch (error) {
      if (definitionLoadRequestRef.current !== requestId || selectedReportKeyRef.current !== requestedReportKey) {
        return;
      }

      setDefinitionError(
        `${t(
          "InsightWorkbench_ReportScanner_LoadDefinitionError",
          "Failed to load report definition. Verify permissions and try again."
        )} ${formatApiError(error)}`
      );
      setDefinitionResponse(undefined);

      // Persist failed scan to database (non-blocking, best-effort)
      void persistScanToDatabase(
        selectedReport,
        null,
        scanStartedAt,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      if (definitionLoadRequestRef.current === requestId && selectedReportKeyRef.current === requestedReportKey) {
        setIsLoadingDefinition(false);
      }
    }
  }, [
    apiClient,
    cachedDefinitions,
    onReportScannerStateChange,
    reportScannerState,
    selectedReport,
    t,
  ]);

  const persistScanToDatabase = useCallback(
    async (
      report: ExplorerArtifact,
      response: LoadReportDefinitionResponse | null,
      scanStartedAt: number,
      errorMessage?: string
    ) => {
      try {
        const parsedParts = parseDefinitionParts(response?.definition);
        const unifiedReport = buildUnifiedReport(report, parsedParts);

        const scanData = {
          reportId: report.id,
          workspaceId: report.workspaceId,
          reportName: report.displayName,
          datasetName: undefined as string | undefined, // Extract from lineage if available
          datasetId: undefined as string | undefined, // Extract from lineage if available
          definitionFormat: response?.definition?.format,
          definitionSource: response?.source,
          definitionAttempts: response?.attempts,
          pages: unifiedReport?.pages.map((page: UnifiedPage, index: number) => ({
            id: page.id,
            name: page.name,
            visuals: page.visuals.map((visual: UnifiedVisual) => ({
              id: visual.id,
              title: visual.title || visual.name,
              name: visual.name,
              type: visual.type,
              elements: visual.fields.map((field: UnifiedFieldReference) => ({
                key: field.key,
                kind: field.kind,
                tableName: field.tableName,
                fieldName: field.fieldName,
                sourcePath: field.sourcePath,
                queryRef: field.name,
              })),
            })),
          })),
          filters: [] as any[], // Extract from parsed definition if available
          success: !errorMessage,
          errorMessage,
          durationMs: Date.now() - scanStartedAt,
        };

        await apiClient.persistReportScan(scanData);
        console.log("[ReportScanner] Scan results persisted to database", {
          reportId: report.id,
          success: scanData.success,
        });
      } catch (error) {
        // Log but don't block UI - persistence is best-effort
        console.warn("[ReportScanner] Failed to persist scan to database", {
          reportId: report.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [apiClient]
  );

  useEffect(() => {
    void loadDefinition(false);
  }, [loadDefinition]);

  useEffect(() => {
    if (deepLinkState.reportPageIndex === undefined || !unifiedReport) {
      return;
    }

    const boundedPageIndex = Math.min(
      deepLinkState.reportPageIndex,
      Math.max(0, unifiedReport.pages.length - 1)
    );

    setSelectedPageIndex((previous) => previous === boundedPageIndex ? previous : boundedPageIndex);
  }, [deepLinkState.reportPageIndex, unifiedReport]);

  useEffect(() => {
    syncReportScannerDeepLink({
      reportId: selectedReport?.id,
      reportWorkspaceId: selectedReport?.workspaceId,
      reportPageIndex: selectedReport ? selectedPageIndex : undefined,
    });
  }, [
    selectedPageIndex,
    selectedReport?.id,
    selectedReport?.workspaceId,
    syncReportScannerDeepLink,
  ]);

  return (
    <div className="insight-workbench-report-scanner insight-workbench-view">
      <div className="insight-workbench-metadata-explorer-header">
        <div>
          <h2 className="insight-workbench-section-title">
            {t("InsightWorkbench_ReportScanner_Label", "Report Scanner")}
          </h2>
          <Text>
            {t(
              "InsightWorkbench_ReportScanner_Intro",
              "Select one report to load its definition and inspect report → page → visual → visual elements."
            )}
          </Text>
        </div>
        <Button appearance="subtle" onClick={() => goBack()}>
          {t("InsightWorkbench_BackToHub", "← Back to Hub")}
        </Button>
      </div>

      {isLoadingReports ? (
        <div className="insight-workbench-report-scanner-loading">
          <Spinner label={t("InsightWorkbench_ReportScanner_LoadingReports", "Loading reports...")} />
        </div>
      ) : reportLoadError ? (
        <div className="insight-workbench-report-scanner-error">
          <Text>{reportLoadError}</Text>
          <Button appearance="secondary" onClick={loadReports}>
            {t("InsightWorkbench_ReportScanner_Retry", "Retry")}
          </Button>
        </div>
      ) : (
        <Field
          label={t("InsightWorkbench_ReportScanner_Report_Label", "Report")}
        >
          <Dropdown
            selectedOptions={selectedReportKey ? [selectedReportKey] : []}
            placeholder={t("InsightWorkbench_ReportScanner_Report_Placeholder", "Select a report")}
            onOptionSelect={(_, data) => {
              const nextKey = data.optionValue || null;
              setSelectedReportKey(nextKey);
              persistSelectedReportKey(nextKey);
              setSelectedPageIndex(0); // Reset to first page when changing reports
              setShowPreview(false); // Hide preview when changing reports
            }}
          >
            {reports.map((report) => {
              const key = `${report.workspaceId}:${report.id}`;
              return (
                <Option key={key} value={key} text={`${report.workspaceName} / ${report.displayName}`}>
                  {`${report.workspaceName} / ${report.displayName}`}
                </Option>
              );
            })}
          </Dropdown>
        </Field>
      )}

      {selectedReport && (
        <div className="insight-workbench-report-scanner-summary">
          <Badge appearance="outline">{`${t("InsightWorkbench_ReportScanner_Workspace", "Workspace")}: ${selectedReport.workspaceName}`}</Badge>
          <Badge appearance="outline">{`${t("InsightWorkbench_ReportScanner_ReportId", "Report ID")}: ${selectedReport.id}`}</Badge>
          <Badge appearance="outline">{`${t("InsightWorkbench_ReportScanner_WorkspaceId", "Workspace ID")}: ${selectedReport.workspaceId}`}</Badge>
          {reportScannerState?.lastRefreshedAtUtc ? (
            <Badge appearance="outline">
              {t("InsightWorkbench_ReportScanner_LastRefreshed", "Refreshed {{time}}", {
                time: new Date(reportScannerState.lastRefreshedAtUtc).toLocaleString(),
              })}
            </Badge>
          ) : null}
          <Button appearance="secondary" size="small" onClick={(): void => {
            void loadDefinition(true);
          }}>
            {t("InsightWorkbench_ReportScanner_RefreshDefinition", "Refresh definition")}
          </Button>
          <Button
            appearance="primary"
            size="small"
            onClick={() => {
              void handleSaveReportSnapshot();
            }}
            disabled={!definitionResponse || isSavingSnapshot}
          >
            {isSavingSnapshot
              ? t("InsightWorkbench_ReportScanner_SaveSnapshot_Saving", "Saving JSON...")
              : t("InsightWorkbench_ReportScanner_SaveSnapshot", "Save report JSON")}
          </Button>
          <Button appearance="secondary" size="small" onClick={handleOpenSnapshotHistory}>
            {t("InsightWorkbench_ReportScanner_OpenSnapshotHistory", "Open snapshot history")}
          </Button>
          <Button
            appearance="secondary"
            size="small"
            onClick={() => {
              setIsCompareOpen((previous) => !previous);
              setCompareError(null);
            }}
          >
            {t("InsightWorkbench_ReportScanner_CompareTo_Button", "Compare to...")}
          </Button>
        </div>
      )}

      {selectedReport && isCompareOpen ? (
        <div
          style={{
            marginTop: 12,
            marginBottom: 12,
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--colorNeutralStroke2)",
            background: "var(--colorNeutralBackground2)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label={t("InsightWorkbench_ReportScanner_CompareTo_TargetReport", "Compare selected report with")}> 
              <Dropdown
                selectedOptions={compareReportKey ? [compareReportKey] : []}
                value={
                  compareReportKey
                    ? (compareCandidateReports.find((report) => `${report.workspaceId}:${report.id}` === compareReportKey)?.displayName ?? compareReportKey)
                    : t("InsightWorkbench_ReportScanner_CompareTo_TargetReport_Placeholder", "Select another report")
                }
                onOptionSelect={(_, data) => setCompareReportKey(data.optionValue ?? "")}
              >
                {compareCandidateReports.map((report) => {
                  const key = `${report.workspaceId}:${report.id}`;
                  return (
                    <Option key={`report-compare-${key}`} value={key}>
                      {`${report.workspaceName} / ${report.displayName}`}
                    </Option>
                  );
                })}
              </Dropdown>
            </Field>

            <Button
              appearance="primary"
              disabled={!compareReportKey || isComparingReports}
              onClick={() => {
                void handleCompareReports();
              }}
            >
              {isComparingReports
                ? t("InsightWorkbench_ReportScanner_CompareTo_Comparing", "Comparing...")
                : t("InsightWorkbench_ReportScanner_CompareTo_Run", "Run compare")}
            </Button>
          </div>

          {compareError ? (
            <Text style={{ color: "var(--colorPaletteRedForeground1)" }}>{compareError}</Text>
          ) : null}

          {compareResult ? (
            <ReportDefinitionDiffView
              leftLabel={`${compareResult.baseReport.workspaceName} / ${compareResult.baseReport.displayName}`}
              rightLabel={`${compareResult.targetReport.workspaceName} / ${compareResult.targetReport.displayName}`}
              leftContent={compareResult.baseJson}
              rightContent={compareResult.targetJson}
              title={t("InsightWorkbench_ReportScanner_CompareTo_Title", "Report definition JSON diff")}
            />
          ) : null}
        </div>
      ) : null}

      {/* Used Tables & Fields - Moved to top */}
      {!isLoadingDefinition && !definitionError && unifiedReport && (
        <details 
          className="insight-workbench-report-scanner-structure" 
          open={sectionsExpanded.usedFields}
          onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setSectionsExpanded(prev => ({ ...prev, usedFields: (e.target as HTMLDetailsElement).open }))}
        >
          <summary style={{ cursor: "pointer", userSelect: "none" }}>
            <h3 className="insight-workbench-section-title" style={{ display: "inline" }}>
              {t("InsightWorkbench_ReportScanner_FieldSummary_Title", "Used tables & fields")}
            </h3>
          </summary>
          <Text size={200} style={{ marginTop: "8px", display: "block" }}>
            {t(
              "InsightWorkbench_ReportScanner_FieldSummary_Intro",
              "All tables and fields referenced across every visual in this report. Click a field to highlight its usage."
            )}
          </Text>
          {unifiedReport.allFields.length === 0 && (
            <Text size={200} style={{ marginTop: "8px", display: "block", color: "var(--colorNeutralForeground3)" }}>
              {t(
                "InsightWorkbench_ReportScanner_FieldSummary_Empty",
                "No table/field references were extracted from this definition."
              )}
            </Text>
          )}
          {unifiedReport.allFields.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <UsedFieldsTable
                tableFieldSummary={unifiedReport.allFields}
                selectedField={selectedField}
                onFieldClick={handleFieldClick}
                onFieldJumpClick={handleJumpToSemanticAnalyzer}
                t={t}
              />
            </div>
          )}
        </details>
      )}

      {isLoadingDefinition && (
        <div className="insight-workbench-report-scanner-loading">
          <Spinner label={t("InsightWorkbench_ReportScanner_LoadingDefinition", "Loading report definition...")} />
        </div>
      )}

      {definitionError && (
        <div className="insight-workbench-report-scanner-error">
          <Text>{definitionError}</Text>
        </div>
      )}

      {!isLoadingDefinition && !definitionError && unifiedReport && unifiedReport.pages.length > 0 && (
        <details 
          className="insight-workbench-report-scanner-preview"
          open={sectionsExpanded.preview}
          onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setSectionsExpanded(prev => ({ ...prev, preview: (e.target as HTMLDetailsElement).open }))}
        >
          <summary style={{ cursor: "pointer", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="insight-workbench-section-title" style={{ margin: 0, display: "inline" }}>
                {t("InsightWorkbench_ReportScanner_Preview_Title", "Page preview")}
              </h3>
              <Button 
                appearance="outline" 
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  togglePreview();
                }}
              >
                {showPreview 
                  ? t("InsightWorkbench_ReportScanner_HidePreview", "Hide preview") 
                : t("InsightWorkbench_ReportScanner_ShowPreview", "Show preview")}
            </Button>
          </div>
          </summary>
          
          {/* Tabs for page selection */}
          <TabList
            selectedValue={`page-${selectedPageIndex}`}
            onTabSelect={(_, data) => {
              const pageIndex = parseInt(String(data.value).replace("page-", ""), 10);
              if (!isNaN(pageIndex) && pageIndex < unifiedReport.pages.length) {
                setSelectedPageIndex(pageIndex);
              }
            }}
            style={{ marginBottom: "16px", marginTop: "8px" }}
          >
            {unifiedReport.pages.map((page, index) => {
              const selectedParts = (selectedField ?? "").split(".");
              const selectedFieldName = selectedParts[selectedParts.length - 1] || selectedField || "";

              const pageHasSelectedField = selectedField
                ? page.visuals.some((visual) =>
                    visual.fields.some((field) => {
                      const fieldParts = field.name.split(".");
                      const fieldName = fieldParts[fieldParts.length - 1] || field.name;
                      return (
                        field.name === selectedField ||
                        fieldName === selectedFieldName ||
                        field.name.includes(selectedFieldName) ||
                        selectedField.includes(fieldName)
                      );
                    })
                  )
                : false;

              const pageHasSelectedVisual = selectedVisual
                ? page.visuals.some((visual) => visual.name === selectedVisual || visual.id === selectedVisual)
                : false;

              const hasMatch = pageHasSelectedField || pageHasSelectedVisual;

              return (
                <Tab key={page.id} value={`page-${index}`}>
                  <span
                    style={hasMatch
                      ? {
                          padding: "2px 6px",
                          borderRadius: "999px",
                          background: "#F9E79F",
                          border: "2px solid #B8860B",
                          boxShadow: "0 0 0 2px rgba(184, 134, 11, 0.2)",
                          color: "#4A3500",
                          fontWeight: "var(--fontWeightSemibold)",
                        }
                      : undefined}
                  >
                    {page.displayName}
                  </span>
                </Tab>
              );
            })}
          </TabList>
          
          {showPreview && (
            <>
              <Text size={200} style={{ marginBottom: "12px", display: "block" }}>
                {t(
                  "InsightWorkbench_ReportScanner_Preview_Description",
                  "Visual representation of report page layout and visual positions"
                )}
              </Text>
              
              {/* Debug info */}
              {(selectedField || selectedVisual) && (
                <Text size={200} style={{ marginBottom: "8px", display: "block", color: "var(--colorPaletteBlueForeground1)" }}>
                  {selectedField ? `Selected field: ${selectedField}` : `Selected visual: ${selectedVisual}`}
                </Text>
              )}
              
              {/* Page index debug info */}
              <Text size={100} style={{ marginBottom: "8px", display: "block", color: "var(--colorNeutralForeground3)" }}>
                {`Preview showing page ${selectedPageIndex + 1} of ${unifiedReport.pages.length}: ${unifiedReport.pages[selectedPageIndex]?.name || 'N/A'}`}
              </Text>

              <ReportPagePreview
                page={unifiedReport.pages[selectedPageIndex] || unifiedReport.pages[0]}
                selectedField={selectedField}
                selectedVisual={selectedVisual}
                onVisualClick={handleVisualClick}
                containerWidth={Math.min(1000, window.innerWidth - 100)}
                containerHeight={600}
                key={`preview-${selectedPageIndex}-${selectedField}-${selectedVisual}`}
              />
            </>
          )}
          
          <details 
            className="insight-workbench-report-scanner-structure" 
            style={{ marginTop: "24px" }}
            open={sectionsExpanded.tableView}
            onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setSectionsExpanded(prev => ({ ...prev, tableView: (e.target as HTMLDetailsElement).open }))}
          >
            <summary>
              <h3 className="insight-workbench-section-title" style={{ display: "inline" }}>
                {t("InsightWorkbench_ReportScanner_Table_Title", "Visuals")}
              </h3>
            </summary>
            <Text>
              {t(
                "InsightWorkbench_ReportScanner_Table_Intro",
                "Expandable view of report.json sections/pages and their visual children."
              )}
            </Text>

            <div className="insight-workbench-report-scanner-table-view">
              {unifiedReport && (() => {
                // Show only the page for the selected page index
                const currentPage = unifiedReport.pages[Math.min(selectedPageIndex, unifiedReport.pages.length - 1)] || unifiedReport.pages[0];
                
                console.log('[ReportScannerView] Rendering table view:', {
                  selectedPageIndex,
                  pagesLength: unifiedReport.pages.length,
                  currentPageDisplayName: currentPage?.displayName,
                  currentPageId: currentPage?.id
                });
                
                return (
                  <VisualsTable
                    currentSection={currentPage}
                    selectedField={selectedField}
                    selectedVisual={selectedVisual}
                    onVisualClick={handleVisualClick}
                    t={t}
                  />
                );
              })()}
            </div>
        </details>
        </details>
      )}

      {!isLoadingDefinition && debugJson && (
        <details 
          className="insight-workbench-report-scanner-debug"
          open={sectionsExpanded.debug}
          onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) => setSectionsExpanded(prev => ({ ...prev, debug: (e.target as HTMLDetailsElement).open }))}
        >
          <summary>
            <h3 className="insight-workbench-section-title" style={{ display: "inline" }}>
              {t("InsightWorkbench_ReportScanner_Debug_Title", "Report definition debug JSON")}
            </h3>
          </summary>
          <div className="insight-workbench-report-scanner-json-tree">
            <JsonTreeNode label="root" value={debugJson} depth={0} />
          </div>
        </details>
      )}
    </div>
  );
}

type DiffKind = "same" | "added" | "removed" | "changed";

function tokenizeLine(line: string): string[] {
  return line.split(/(\s+)/).filter((token) => token.length > 0);
}

function normalizeJsonForDiff(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalizedItems = value.map((entry) => normalizeJsonForDiff(entry));
    return normalizedItems.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entry]) => [key, normalizeJsonForDiff(entry)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function normalizeReportContent(content: string, ignoreOrder: boolean): string {
  if (!ignoreOrder) {
    return content;
  }

  try {
    const parsed = JSON.parse(content);
    const normalized = normalizeJsonForDiff(parsed);
    return JSON.stringify(normalized, null, 2);
  } catch {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .sort((left, right) => left.localeCompare(right))
      .join("\n");
  }
}

function ReportDefinitionDiffView({
  leftLabel,
  rightLabel,
  leftContent,
  rightContent,
  title,
}: {
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
  title: string;
}) {
  const [ignoreOrder, setIgnoreOrder] = useState(false);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const syncScrollGuardRef = useRef(false);

  const normalizedLeft = useMemo(() => normalizeReportContent(leftContent, ignoreOrder), [leftContent, ignoreOrder]);
  const normalizedRight = useMemo(() => normalizeReportContent(rightContent, ignoreOrder), [rightContent, ignoreOrder]);

  const linesA = normalizedLeft.split("\n");
  const linesB = normalizedRight.split("\n");
  const maxLen = Math.max(linesA.length, linesB.length);

  const rows = Array.from({ length: maxLen }, (_, index) => {
    const lineA = linesA[index] ?? "";
    const lineB = linesB[index] ?? "";
    let kind: DiffKind = "same";
    if (!lineA && lineB) {
      kind = "added";
    } else if (lineA && !lineB) {
      kind = "removed";
    } else if (lineA !== lineB) {
      kind = "changed";
    }

    return { lineA, lineB, kind };
  });

  const changedCount = rows.filter((row) => row.kind !== "same").length;

  const renderInlineDiff = useCallback((line: string, otherLine: string, kind: DiffKind, side: "left" | "right") => {
    if (!line) {
      return " ";
    }

    if (kind !== "changed") {
      return line;
    }

    const tokens = tokenizeLine(line);
    const otherTokens = tokenizeLine(otherLine);

    return (
      <>
        {tokens.map((token, tokenIndex) => {
          const isWhitespace = token.trim().length === 0;
          const changed = !isWhitespace && token !== (otherTokens[tokenIndex] ?? "");
          return (
            <span
              key={`report-inline-${side}-${tokenIndex}`}
              style={
                changed
                  ? {
                    background:
                      side === "left"
                        ? "var(--colorPaletteRedBackground2)"
                        : "var(--colorPaletteGreenBackground2)",
                    borderRadius: 2,
                  }
                  : undefined
              }
            >
              {token}
            </span>
          );
        })}
      </>
    );
  }, []);

  const syncScroll = useCallback((source: "left" | "right") => {
    if (syncScrollGuardRef.current) {
      return;
    }

    const sourcePane = source === "left" ? leftPaneRef.current : rightPaneRef.current;
    const targetPane = source === "left" ? rightPaneRef.current : leftPaneRef.current;
    if (!sourcePane || !targetPane) {
      return;
    }

    syncScrollGuardRef.current = true;
    targetPane.scrollTop = sourcePane.scrollTop;
    targetPane.scrollLeft = sourcePane.scrollLeft;
    window.requestAnimationFrame(() => {
      syncScrollGuardRef.current = false;
    });
  }, []);

  const getCellStyle = (kind: DiffKind, side: "left" | "right") => {
    if (kind === "added") {
      return side === "right"
        ? { background: "var(--colorPaletteGreenBackground2)", color: "var(--colorNeutralForeground1)" }
        : {};
    }
    if (kind === "removed") {
      return side === "left"
        ? { background: "var(--colorPaletteRedBackground2)", color: "var(--colorNeutralForeground1)" }
        : {};
    }
    if (kind === "changed") {
      return { background: "var(--colorPaletteYellowBackground2)", color: "var(--colorNeutralForeground1)" };
    }
    return {};
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Text weight="semibold">{title}</Text>
        <Badge appearance="tint" color={changedCount === 0 ? "success" : "warning"}>
          {changedCount === 0 ? "No differences" : `${changedCount} changed line(s)`}
        </Badge>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={ignoreOrder}
            onChange={(event) => setIgnoreOrder(event.target.checked)}
          />
          <Text size={200}>Ignore order</Text>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, overflowX: "auto" }}>
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            A - {leftLabel}
          </Text>
          <div
            ref={leftPaneRef}
            onScroll={() => syncScroll("left")}
            style={{
              fontFamily: "Consolas, 'Courier New', monospace",
              fontSize: 11,
              background: "var(--colorNeutralBackground3)",
              borderRadius: 4,
              padding: 8,
              overflowY: "auto",
              maxHeight: 520,
              whiteSpace: "pre",
            }}
          >
            {rows.map((row, index) => (
              <div key={`report-compare-left-${index}`} style={getCellStyle(row.kind, "left")}>
                {renderInlineDiff(row.lineA, row.lineB, row.kind, "left")}
              </div>
            ))}
          </div>
        </div>
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            B - {rightLabel}
          </Text>
          <div
            ref={rightPaneRef}
            onScroll={() => syncScroll("right")}
            style={{
              fontFamily: "Consolas, 'Courier New', monospace",
              fontSize: 11,
              background: "var(--colorNeutralBackground3)",
              borderRadius: 4,
              padding: 8,
              overflowY: "auto",
              maxHeight: 520,
              whiteSpace: "pre",
            }}
          >
            {rows.map((row, index) => (
              <div key={`report-compare-right-${index}`} style={getCellStyle(row.kind, "right")}>
                {renderInlineDiff(row.lineB, row.lineA, row.kind, "right")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportScannerView({
  workloadClient,
  reportScannerState,
  onReportScannerStateChange,
  artifactCatalog,
  onArtifactCatalogChange,
  onSaveReportSnapshot,
}: ReportScannerViewProps) {
  return (
    <ItemEditorDefaultView
      center={{
        content: (
          <ReportScannerContent
            workloadClient={workloadClient}
            reportScannerState={reportScannerState}
            onReportScannerStateChange={onReportScannerStateChange}
            artifactCatalog={artifactCatalog}
            onArtifactCatalogChange={onArtifactCatalogChange}
            onSaveReportSnapshot={onSaveReportSnapshot}
          />
        ),
      }}
    />
  );
}
