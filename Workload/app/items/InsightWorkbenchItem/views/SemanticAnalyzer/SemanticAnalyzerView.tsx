import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Spinner,
  Text,
  Tooltip,
} from "@fluentui/react-components";
import { ItemEditorDefaultView, ItemEditorDetailView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import {
  InsightWorkbenchItemDefinition,
  InsightWorkbenchStorageSettings,
  EntitySnapshotMeta,
  SemanticEntityTmdlHistoryEntry,
} from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { SemanticAnalyzerClient } from "../../../../clients/SemanticAnalyzerClient";
import { createStorageService } from "../../services/InsightWorkbenchStorageService";
import type {
  EntityRelationshipContext,
  SemanticColumnStats,
  SemanticDependency as SemanticDependencyRow,
  SemanticEntity as SemanticEntityRow,
  SemanticEntityType,
  SemanticModel,
  SemanticTableStats,
} from "../../../../services/SemanticAnalyzerService";
import {
  EntityReportUsageSummary,
  ScannedReportUsage,
} from "../../models/ReportUsageModel";
import { NAV_JUMP_SEMANTIC_ANALYZER, NAV_JUMP_REPORT_SCANNER } from "../../InsightWorkbenchNavKeys";
import "../../InsightWorkbenchItem.scss";

const QUERY_PARAM_MODEL_ID = "semanticModelId";
const QUERY_PARAM_MODEL_WORKSPACE_ID = "semanticModelWorkspaceId";
const QUERY_PARAM_ENTITY_ID = "semanticEntityId";

interface SemanticAnalyzerViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  storageSettings?: InsightWorkbenchStorageSettings;
  detailViewName: string;
}

interface SemanticAnalyzerProviderProps {
  workloadClient: WorkloadClientAPI;
  tmdlHistoryEntries: SemanticEntityTmdlHistoryEntry[];
  onTmdlHistoryEntriesChange?: (entries: SemanticEntityTmdlHistoryEntry[]) => void;
  children: React.ReactNode;
  onSaveTmdlSnapshot?: (tmdlContent: string, modelId: string, modelName: string, workspaceId: string) => Promise<void>;
}


interface SemanticAnalyzerContextValue {
  isLoadingModels: boolean;
  isLoadingEntities: boolean;
  isLoadingReportUsage: boolean;
  errorText: string | null;
  reportUsageError: string | null;
  semanticModels: SemanticModel[];
  selectedModel?: SemanticModel;
  setSelectedModelFromExplorer: (model: SemanticModel | undefined) => void;
  entities: SemanticEntityRow[];
  dependencies: SemanticDependencyRow[];
  dependencyDiagnostics?: {
    expressionSource: "INFO.DEPENDENCIES()" | "INFO.CALCDEPENDENCY()" | "analyzer-fallback" | "cached";
    infoRowCount?: number;
    mappedCount?: number;
    queryAttempts?: Array<{
      query: string;
      rowCount: number;
      error: string | null;
    }>;
  };
  backendEntityRelationships?: Record<string, { dependsOn: string[]; dependedOnBy: string[] }>;
  relationshipContext?: Record<string, EntityRelationshipContext>;
  reportUsageReports: ScannedReportUsage[];
  reportUsageByEntityId: Record<string, EntityReportUsageSummary | undefined>;
  selectedEntityId: string | null;
  setSelectedEntityId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedEntity?: SemanticEntityRow;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  entityTypeFilter: string;
  setEntityTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  hiddenFilter: "all" | "hidden" | "visible";
  setHiddenFilter: React.Dispatch<React.SetStateAction<"all" | "hidden" | "visible">>;
  filteredEntities: SemanticEntityRow[];
  entityTypeCounts: Record<SemanticEntityType, number>;
  tableStatsByName: Record<string, SemanticTableStats | undefined>;
  columnStatsByEntityId: Record<string, SemanticColumnStats | undefined>;
  tmdlHistoryEntries: SemanticEntityTmdlHistoryEntry[];
  setTmdlHistoryEntries: (entries: SemanticEntityTmdlHistoryEntry[]) => void;
  tmdlView?: {
    source: "tmdl-serializer";
    queryUsed: string | null;
    content: string | null;
    error: string | null;
  };
  loadEntities: () => Promise<void>;
  loadTableStats: (tableName: string, forceRefresh?: boolean) => Promise<SemanticTableStats | undefined>;
  loadColumnStats: (
    tableName: string,
    columnName: string,
    entityId: string,
    forceRefresh?: boolean
  ) => Promise<SemanticColumnStats | undefined>;
  reportUsageFilter: "all" | "used";
  setReportUsageFilter: React.Dispatch<React.SetStateAction<"all" | "used">>;
  onSaveTmdlSnapshot?: (tmdlContent: string, modelId: string, modelName: string, workspaceId: string) => Promise<void>;
}


const SemanticAnalyzerContext = createContext<SemanticAnalyzerContextValue | null>(null);

export function useSemanticAnalyzerContext(): SemanticAnalyzerContextValue {
  const context = useContext(SemanticAnalyzerContext);
  if (!context) {
    throw new Error("SemanticAnalyzerContext is not available.");
  }
  return context;
}

function matchSearch(entity: SemanticEntityRow, searchText: string): boolean {
  const value = searchText.trim().toLowerCase();
  if (!value) {
    return true;
  }

  const tableColumn = entity.tableName
    ? `${entity.tableName}.${entity.name}`.toLowerCase()
    : entity.name.toLowerCase();

  return (
    entity.name.toLowerCase().includes(value) ||
    (entity.tableName?.toLowerCase().includes(value) ?? false) ||
    tableColumn.includes(value) ||
    (entity.expression?.toLowerCase().includes(value) ?? false) ||
    (entity.details?.toLowerCase().includes(value) ?? false) ||
    entity.type.toLowerCase().includes(value)
  );
}

function SemanticAnalyzerProvider({
  workloadClient,
  tmdlHistoryEntries,
  onTmdlHistoryEntriesChange,
  onSaveTmdlSnapshot,
  children,
}: SemanticAnalyzerProviderProps) {

  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const semanticClient = useMemo(() => new SemanticAnalyzerClient(workloadClient), [workloadClient]);

  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);
  const [isLoadingEntities, setIsLoadingEntities] = useState<boolean>(false);
  const [isLoadingReportUsage, setIsLoadingReportUsage] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [reportUsageError, setReportUsageError] = useState<string | null>(null);

  const [semanticModels, setSemanticModels] = useState<SemanticModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<SemanticModel | undefined>(undefined);
  const [entities, setEntities] = useState<SemanticEntityRow[]>([]);
  const [dependencies, setDependencies] = useState<SemanticDependencyRow[]>([]);
  const [dependencyDiagnostics, setDependencyDiagnostics] = useState<SemanticAnalyzerContextValue["dependencyDiagnostics"]>(undefined);
  const [reportUsageReports, setReportUsageReports] = useState<ScannedReportUsage[]>([]);
  const [reportUsageByEntityId, setReportUsageByEntityId] = useState<Record<string, EntityReportUsageSummary | undefined>>({});
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [hiddenFilter, setHiddenFilter] = useState<"all" | "hidden" | "visible">("all");
  const [reportUsageFilter, setReportUsageFilter] = useState<"all" | "used">("all");

  const [tableStatsByName, setTableStatsByName] = useState<Record<string, SemanticTableStats | undefined>>({});
  const [columnStatsByEntityId, setColumnStatsByEntityId] = useState<Record<string, SemanticColumnStats | undefined>>({});
  const [tmdlView, setTmdlView] = useState<SemanticAnalyzerContextValue["tmdlView"]>(undefined);

  // NEW: Store pre-calculated backend data to eliminate frontend useMemo calculations
  const [backendEntityCounts, setBackendEntityCounts] = useState<Record<string, number> | undefined>(undefined);
  const [backendEntityRelationships, setBackendEntityRelationships] = useState<Record<string, { dependsOn: string[]; dependedOnBy: string[] }> | undefined>(undefined);
  const [backendRelationshipContext, setBackendRelationshipContext] = useState<Record<string, EntityRelationshipContext> | undefined>(undefined);
  const [, setCacheSource] = useState<"persistent-cache" | "live-calculation" | undefined>(undefined);

  // Pending jump payload written by Report Scanner before navigating here
  const [pendingJump, setPendingJump] = useState<{
    fieldKey: string;
    modelId?: string;
    modelWorkspaceId?: string;
  } | null>(null);

  const loadSemanticModels = useCallback(async () => {
    setIsLoadingModels(true);
    setErrorText(null);
    try {
      const models = await semanticClient.loadModels();
      setSemanticModels(models);
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(
        `${t(
          "InsightWorkbench_SemanticAnalyzer_LoadModelsError",
          "Failed to load semantic models. Verify workspace access and try again."
        )} ${message}`
      );
      setSemanticModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [semanticClient, selectedModel, t]);

  const loadEntities = useCallback(async () => {
    if (!selectedModel) {
      setEntities([]);
      setDependencies([]);
      setDependencyDiagnostics(undefined);
      setBackendEntityCounts(undefined);
      setBackendEntityRelationships(undefined);
      setBackendRelationshipContext(undefined);
      setCacheSource(undefined);
      setTmdlView(undefined);
      setSelectedEntityId(null);
      return;
    }

    setIsLoadingEntities(true);
    setErrorText(null);

    try {
      const result = await semanticClient.loadModelEntities(
        selectedModel.workspaceId,
        selectedModel.id,
        selectedModel.workspaceName,
        selectedModel.displayName
      );

      setEntities(result.entities);
      setDependencies(result.dependencies);
      setDependencyDiagnostics(result.dependencyDiagnostics);
      
      // NEW: Store pre-calculated backend data
      setBackendEntityCounts(result.entityCounts);
      setBackendEntityRelationships(result.entityRelationships);
      setBackendRelationshipContext(result.relationshipContext);
      setCacheSource(result.cacheSource);
      
      setTmdlView(result.tmdlView);
      setSelectedEntityId(result.entities.length > 0 ? result.entities[0].id : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEntities([]);
      setDependencies([]);
      setDependencyDiagnostics(undefined);
      setBackendEntityCounts(undefined);
      setBackendEntityRelationships(undefined);
      setBackendRelationshipContext(undefined);
      setCacheSource(undefined);
      setSelectedEntityId(null);
      setErrorText(
        `${t(
          "InsightWorkbench_SemanticAnalyzer_LoadEntitiesError",
          "Failed to load semantic model entities. Verify model permissions and try again."
        )} ${message}`
      );
    } finally {
      setIsLoadingEntities(false);
    }
  }, [semanticClient, selectedModel, t]);

  const loadReportUsage = useCallback(async () => {
    if (!selectedModel || entities.length === 0) {
      setReportUsageReports([]);
      setReportUsageByEntityId({});
      setReportUsageError(null);
      return;
    }

    setIsLoadingReportUsage(true);
    setReportUsageError(null);

    try {
      const summary = await semanticClient.loadModelReportUsage(
        selectedModel.workspaceId,
        selectedModel.id
      );

      setReportUsageReports([]);
      setReportUsageByEntityId(summary.entityUsageById ?? {});
      setReportUsageError(
        summary.scanErrors.length > 0
          ? `${t(
              "InsightWorkbench_SemanticAnalyzer_ReportUsage_PartialError",
              "Some report definitions could not be scanned."
            )} ${summary.scanErrors.join(" | ")}`
          : null
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReportUsageReports([]);
      setReportUsageByEntityId({});
      setReportUsageError(
        `${t(
          "InsightWorkbench_SemanticAnalyzer_ReportUsage_LoadError",
          "Failed to evaluate report usage for the selected semantic model."
        )} ${message}`
      );
    } finally {
      setIsLoadingReportUsage(false);
    }
  }, [semanticClient, selectedModel, t]);

  const loadTableStats = useCallback(
    async (tableName: string, forceRefresh = false): Promise<SemanticTableStats | undefined> => {
      if (!selectedModel || !tableName) {
        return undefined;
      }

      const cacheKey = tableName.toLowerCase();
      if (!forceRefresh && tableStatsByName[cacheKey]) {
        return tableStatsByName[cacheKey];
      }

      const result = await semanticClient.loadTableStats(selectedModel.workspaceId, selectedModel.id, tableName);
      setTableStatsByName((previous) => ({ ...previous, [cacheKey]: result }));
      return result;
    },
    [selectedModel, tableStatsByName, semanticClient]
  );

  const loadColumnStats = useCallback(
    async (
      tableName: string,
      columnName: string,
      entityId: string,
      forceRefresh = false
    ): Promise<SemanticColumnStats | undefined> => {
      if (!selectedModel || !tableName || !columnName || !entityId) {
        return undefined;
      }

      if (!forceRefresh && columnStatsByEntityId[entityId]) {
        return columnStatsByEntityId[entityId];
      }

      const result = await semanticClient.loadColumnStats(
        selectedModel.workspaceId,
        selectedModel.id,
        tableName,
        columnName
      );

      setColumnStatsByEntityId((previous) => ({ ...previous, [entityId]: result }));
      return result;
    },
    [selectedModel, columnStatsByEntityId, semanticClient]
  );

  useEffect(() => {
    void loadSemanticModels();
  }, [loadSemanticModels]);

  const deepLinkState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const modelId = params.get(QUERY_PARAM_MODEL_ID) ?? undefined;
    const modelWorkspaceId = params.get(QUERY_PARAM_MODEL_WORKSPACE_ID) ?? undefined;
    const entityId = params.get(QUERY_PARAM_ENTITY_ID) ?? undefined;

    return {
      modelId,
      modelWorkspaceId,
      entityId,
    };
  }, [location.search]);

  const syncSemanticDeepLink = useCallback(
    (next: { modelId?: string; modelWorkspaceId?: string; entityId?: string }) => {
      const params = new URLSearchParams(location.search);

      if (next.modelId && next.modelWorkspaceId) {
        params.set(QUERY_PARAM_MODEL_ID, next.modelId);
        params.set(QUERY_PARAM_MODEL_WORKSPACE_ID, next.modelWorkspaceId);
      } else {
        params.delete(QUERY_PARAM_MODEL_ID);
        params.delete(QUERY_PARAM_MODEL_WORKSPACE_ID);
      }

      if (next.entityId) {
        params.set(QUERY_PARAM_ENTITY_ID, next.entityId);
      } else {
        params.delete(QUERY_PARAM_ENTITY_ID);
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

  useEffect(() => {
    if (!deepLinkState.modelId || !deepLinkState.modelWorkspaceId || semanticModels.length === 0) {
      return;
    }

    const requestedModel = semanticModels.find(
      (model) =>
        model.id === deepLinkState.modelId && model.workspaceId === deepLinkState.modelWorkspaceId
    );

    if (requestedModel) {
      setSelectedModel((previous) => {
        if (
          previous &&
          previous.id === requestedModel.id &&
          previous.workspaceId === requestedModel.workspaceId
        ) {
          return previous;
        }

        return requestedModel;
      });
    }
  }, [deepLinkState.modelId, deepLinkState.modelWorkspaceId, semanticModels]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  useEffect(() => {
    if (!deepLinkState.entityId || entities.length === 0) {
      return;
    }

    const requestedEntity = entities.find((entity) => entity.id === deepLinkState.entityId);
    if (requestedEntity) {
      setSelectedEntityId((previous) => previous === requestedEntity.id ? previous : requestedEntity.id);
    }
  }, [deepLinkState.entityId, entities]);

  useEffect(() => {
    syncSemanticDeepLink({
      modelId: selectedModel?.id,
      modelWorkspaceId: selectedModel?.workspaceId,
      entityId: selectedEntityId ?? undefined,
    });
  }, [selectedEntityId, selectedModel?.id, selectedModel?.workspaceId, syncSemanticDeepLink]);

  useEffect(() => {
    if (!isLoadingEntities && selectedModel) {
      void loadReportUsage();
    }
  }, [isLoadingEntities, selectedModel, loadReportUsage]);

  // Listen for jump-to-entity events fired by Report Scanner
  useEffect(() => {
    // Read any token written before this mount (e.g. deep-link scenario)
    try {
      const stored = window.sessionStorage.getItem(NAV_JUMP_SEMANTIC_ANALYZER);
      if (stored) {
        window.sessionStorage.removeItem(NAV_JUMP_SEMANTIC_ANALYZER);
        const payload = JSON.parse(stored) as { fieldKey: string; modelId?: string; modelWorkspaceId?: string };
        setPendingJump(payload);
      }
    } catch { /* ignore storage errors */ }

    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ fieldKey: string; modelId?: string; modelWorkspaceId?: string }>).detail;
      setPendingJump({ fieldKey: detail.fieldKey, modelId: detail.modelId, modelWorkspaceId: detail.modelWorkspaceId });
    };
    window.addEventListener("InsightWorkbench:SemanticAnalyzerJumpField", handler);
    return () => window.removeEventListener("InsightWorkbench:SemanticAnalyzerJumpField", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once: sets up event listener for cross-view navigation

  // Apply pending jump once semantic models are available
  useEffect(() => {
    if (!pendingJump || isLoadingModels) {
      return;
    }
    setPendingJump(null);

    const { fieldKey, modelId, modelWorkspaceId } = pendingJump;

    if (modelId && modelWorkspaceId) {
      const targetModel = semanticModels.find(
        (m) => m.id === modelId && m.workspaceId === modelWorkspaceId
      );
      if (targetModel) {
        setSelectedModel(targetModel);
      }
    }

    // Pre-fill search so the jumped-to entity is immediately visible
    setSearchText(fieldKey);
  }, [pendingJump, isLoadingModels, semanticModels]);

  const selectedEntity = useMemo(
    () => entities.find((entity) => entity.id === selectedEntityId),
    [entities, selectedEntityId]
  );

  // SIMPLIFIED: filteredEntities now only does search & filter logic, NOT graph traversal
  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      const matchesType = entityTypeFilter === "all" || entity.type === entityTypeFilter;
      const isEntityHidden = entity.isHidden === true;
      const matchesHidden =
        hiddenFilter === "all" ||
        (hiddenFilter === "hidden" && isEntityHidden) ||
        (hiddenFilter === "visible" && !isEntityHidden);
      const matchesReportUsage =
        reportUsageFilter === "all" || (reportUsageByEntityId[entity.id]?.reports.length ?? 0) > 0;

      return matchesType && matchesHidden && matchesReportUsage && matchSearch(entity, searchText);
    });
  }, [entities, entityTypeFilter, hiddenFilter, reportUsageFilter, reportUsageByEntityId, searchText]);

  // SIMPLIFIED: Use backend pre-calculated counts instead of computing here
  const entityTypeCounts = useMemo(() => {
    if (backendEntityCounts) {
      // Convert backend response to typed result
      return {
        Table: backendEntityCounts["Table"] || 0,
        Measure: backendEntityCounts["Measure"] || 0,
        Column: backendEntityCounts["Column"] || 0,
        Relationship: backendEntityCounts["Relationship"] || 0,
      };
    }

    // Fallback if backend data unavailable (e.g., old API)
    return entities.reduce<Record<SemanticEntityType, number>>(
      (counts, entity) => {
        counts[entity.type] += 1;
        return counts;
      },
      {
        Table: 0,
        Measure: 0,
        Column: 0,
        Relationship: 0,
      }
    );
  }, [backendEntityCounts, entities]);

  const setSelectedModelFromExplorer = useCallback((model: SemanticModel | undefined) => {
    setSelectedModel(model);
  }, []);

  const contextValue = useMemo<SemanticAnalyzerContextValue>(
    () => ({
      isLoadingModels,
      isLoadingEntities,
      isLoadingReportUsage,
      errorText,
      reportUsageError,
      semanticModels,
      selectedModel,
      setSelectedModelFromExplorer,
      entities,
      dependencies,
      dependencyDiagnostics,
      reportUsageReports,
      reportUsageByEntityId,
      relationshipContext: backendRelationshipContext,
      selectedEntityId,
      setSelectedEntityId,
      selectedEntity,
      searchText,
      setSearchText,
      entityTypeFilter,
      setEntityTypeFilter,
      hiddenFilter,
      setHiddenFilter,
      reportUsageFilter,
      setReportUsageFilter,
      filteredEntities,
      entityTypeCounts,
      tableStatsByName,
      columnStatsByEntityId,
      tmdlHistoryEntries,
      setTmdlHistoryEntries: (entries) => {
        onTmdlHistoryEntriesChange?.(entries);
      },
      tmdlView,
      onSaveTmdlSnapshot,
      backendEntityRelationships,
      backendRelationshipContext,
      loadEntities,
      loadTableStats,
      loadColumnStats,
    }),
    [
      isLoadingModels,
      isLoadingEntities,
      isLoadingReportUsage,
      errorText,
      reportUsageError,
      semanticModels,
      selectedModel,
      setSelectedModelFromExplorer,
      entities,
      dependencies,
      dependencyDiagnostics,
      reportUsageReports,
      reportUsageByEntityId,
      selectedEntityId,
      selectedEntity,
      searchText,
      entityTypeFilter,
      hiddenFilter,
      reportUsageFilter,
      filteredEntities,
      entityTypeCounts,
      tableStatsByName,
      columnStatsByEntityId,
      tmdlHistoryEntries,
      onTmdlHistoryEntriesChange,
      tmdlView,
      onSaveTmdlSnapshot,
      backendEntityRelationships,
      loadEntities,
      loadTableStats,
      loadColumnStats,
    ]
  );

  return <SemanticAnalyzerContext.Provider value={contextValue}>{children}</SemanticAnalyzerContext.Provider>;
}

function SemanticAnalyzerContent({
  detailViewName,
  workloadClient,
  item,
  storageSettings,
}: {
  detailViewName: string;
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  storageSettings?: InsightWorkbenchStorageSettings;
}) {
  const { t } = useTranslation();
  const { goBack, setCurrentView } = useViewNavigation();
  const {
    isLoadingModels,
    isLoadingEntities,
    isLoadingReportUsage,
    errorText,
    semanticModels,
    selectedModel,
    setSelectedModelFromExplorer,
    entities,
    filteredEntities,
    entityTypeCounts,
    reportUsageByEntityId,
    selectedEntityId,
    setSelectedEntityId,
    searchText,
    setSearchText,
    entityTypeFilter,
    setEntityTypeFilter,
    hiddenFilter,
    setHiddenFilter,
    reportUsageFilter,
    setReportUsageFilter,
    loadEntities,
    tmdlView,
    onSaveTmdlSnapshot,
  } = useSemanticAnalyzerContext();

  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);
  const [isLoadingModelSnapshots, setIsLoadingModelSnapshots] = useState(false);
  const [modelSnapshotError, setModelSnapshotError] = useState<string | null>(null);
  const [modelSnapshots, setModelSnapshots] = useState<EntitySnapshotMeta[]>([]);
  const [compareSnapshotA, setCompareSnapshotA] = useState("");
  const [compareSnapshotB, setCompareSnapshotB] = useState("");
  const [isComparingSnapshots, setIsComparingSnapshots] = useState(false);
  const [compareResult, setCompareResult] = useState<{
    a: { meta: EntitySnapshotMeta; content: string } | undefined;
    b: { meta: EntitySnapshotMeta; content: string } | undefined;
  } | null>(null);
  const [isEntityCompareOpen, setIsEntityCompareOpen] = useState(false);
  const [compareModelKey, setCompareModelKey] = useState("");
  const [isComparingModels, setIsComparingModels] = useState(false);
  const [entityCompareError, setEntityCompareError] = useState<string | null>(null);
  const [entityCompareResult, setEntityCompareResult] = useState<{
    baseModel: SemanticModel;
    targetModel: SemanticModel;
    baseContent: string;
    targetContent: string;
  } | null>(null);
  const semanticClient = useMemo(() => new SemanticAnalyzerClient(workloadClient), [workloadClient]);

  const selectedModelKey = selectedModel ? `${selectedModel.workspaceId}|${selectedModel.id}` : "";
  const compareCandidateModels = useMemo(
    () =>
      semanticModels.filter(
        (model) => !selectedModel || model.id !== selectedModel.id || model.workspaceId !== selectedModel.workspaceId
      ),
    [selectedModel, semanticModels]
  );

  const handleJumpToReportScanner = useCallback((reportId: string, workspaceId: string): void => {
    const reportKey = `${workspaceId}:${reportId}`;
    try {
      window.sessionStorage.setItem(NAV_JUMP_REPORT_SCANNER, reportKey);
    } catch {
      // Ignore storage failures and still navigate.
    }
    setCurrentView("report-scanner");
  }, [setCurrentView]);

  const handleSaveTmdlSnapshot = useCallback(async (): Promise<void> => {
    if (!selectedModel || !tmdlView?.content || !onSaveTmdlSnapshot) {
      return;
    }

    setIsSavingSnapshot(true);
    try {
      await onSaveTmdlSnapshot(
        tmdlView.content,
        selectedModel.id,
        selectedModel.displayName,
        selectedModel.workspaceId
      );
    } finally {
      setIsSavingSnapshot(false);
    }
  }, [onSaveTmdlSnapshot, selectedModel, tmdlView]);

  const handleOpenSnapshotCompare = useCallback(async (): Promise<void> => {
    setIsCompareDialogOpen(true);
    setModelSnapshotError(null);
    setCompareResult(null);

    if (!item || !selectedModel) {
      setModelSnapshotError(t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_SelectModel", "Select a semantic model first."));
      return;
    }

    const service = createStorageService(workloadClient, item, storageSettings);
    if (!service) {
      setModelSnapshotError(
        t(
          "InsightWorkbench_SemanticAnalyzer_SnapshotCompare_EnableStorage",
          "Enable OneLake storage in Storage Settings to compare snapshots."
        )
      );
      return;
    }

    setIsLoadingModelSnapshots(true);
    try {
      const snapshots = await service.listEntitySnapshots("tmdl", selectedModel.id);
      setModelSnapshots(snapshots);
      if (snapshots.length > 0) {
        setCompareSnapshotA((previous) => previous || snapshots[0].id);
        setCompareSnapshotB((previous) => previous || snapshots[Math.min(1, snapshots.length - 1)].id);
      }
      if (snapshots.length === 0) {
        setModelSnapshotError(
          t(
            "InsightWorkbench_SemanticAnalyzer_SnapshotCompare_NoSnapshots",
            "No TMDL snapshots exist for the selected model yet."
          )
        );
      }
    } catch (error) {
      setModelSnapshotError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingModelSnapshots(false);
    }
  }, [item, selectedModel, storageSettings, t, workloadClient]);

  const handleCompareSnapshots = useCallback(async (): Promise<void> => {
    if (!item || !compareSnapshotA || !compareSnapshotB) {
      return;
    }

    const service = createStorageService(workloadClient, item, storageSettings);
    if (!service) {
      setModelSnapshotError(
        t(
          "InsightWorkbench_SemanticAnalyzer_SnapshotCompare_EnableStorage",
          "Enable OneLake storage in Storage Settings to compare snapshots."
        )
      );
      return;
    }

    setIsComparingSnapshots(true);
    setModelSnapshotError(null);
    setCompareResult(null);

    try {
      const [a, b] = await Promise.all([
        service.loadEntitySnapshotContent(compareSnapshotA),
        service.loadEntitySnapshotContent(compareSnapshotB),
      ]);
      if (!a || !b) {
        setModelSnapshotError(
          t(
            "InsightWorkbench_SemanticAnalyzer_SnapshotCompare_LoadFailed",
            "One or both snapshots could not be loaded."
          )
        );
        return;
      }
      setCompareResult({ a, b });
    } catch (error) {
      setModelSnapshotError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsComparingSnapshots(false);
    }
  }, [compareSnapshotA, compareSnapshotB, item, storageSettings, t, workloadClient]);

  useEffect(() => {
    if (!selectedModel) {
      setCompareModelKey("");
      setEntityCompareResult(null);
      setEntityCompareError(null);
      return;
    }

    if (compareModelKey && !compareCandidateModels.some((model) => `${model.workspaceId}|${model.id}` === compareModelKey)) {
      setCompareModelKey("");
    }
  }, [compareCandidateModels, compareModelKey, selectedModel]);

  const handleCompareModels = useCallback(async (): Promise<void> => {
    if (!selectedModel || !compareModelKey) {
      return;
    }

    const targetModel = compareCandidateModels.find((model) => `${model.workspaceId}|${model.id}` === compareModelKey);
    if (!targetModel) {
      setEntityCompareError(t("InsightWorkbench_SemanticAnalyzer_CompareTo_SelectTarget", "Select another model to compare."));
      return;
    }

    setIsComparingModels(true);
    setEntityCompareError(null);
    setEntityCompareResult(null);

    try {
      const [baseResult, targetResult] = await Promise.all([
        semanticClient.loadModelEntities(
          selectedModel.workspaceId,
          selectedModel.id,
          selectedModel.workspaceName,
          selectedModel.displayName
        ),
        semanticClient.loadModelEntities(
          targetModel.workspaceId,
          targetModel.id,
          targetModel.workspaceName,
          targetModel.displayName
        ),
      ]);

      const baseContent = baseResult.tmdlView?.content?.trim() || tmdlView?.content?.trim() || "";
      const targetContent = targetResult.tmdlView?.content?.trim() || "";

      if (!baseContent || !targetContent) {
        setEntityCompareError(
          t(
            "InsightWorkbench_SemanticAnalyzer_CompareTo_NoTmdl",
            "TMDL content is unavailable for one or both selected models."
          )
        );
        return;
      }

      setEntityCompareResult({
        baseModel: selectedModel,
        targetModel,
        baseContent,
        targetContent,
      });
    } catch (error) {
      setEntityCompareError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsComparingModels(false);
    }
  }, [compareCandidateModels, compareModelKey, selectedModel, semanticClient, t, tmdlView?.content]);

  return (
    <div className="insight-workbench-view insight-workbench-semantic-analyzer">
      <div className="insight-workbench-semantic-analyzer-header">
        <div>
          <h2 className="insight-workbench-section-title">
            {t("InsightWorkbench_SemanticAnalyzer_Label", "Semantic Model Analyzer")}
          </h2>
          <Text>
            {t(
              "InsightWorkbench_SemanticAnalyzer_Intro",
              "Select one semantic model to inspect all tables, columns, measures, and relationships."
            )}
          </Text>
        </div>
        <Button appearance="subtle" onClick={goBack}>
          {t("InsightWorkbench_BackToHub", "← Back to Hub")}
        </Button>
      </div>

      <div className="insight-workbench-semantic-analyzer-controls">
        <Field label={t("InsightWorkbench_SemanticAnalyzer_Model_Label", "Semantic model")}>
          <Dropdown
            selectedOptions={selectedModelKey ? [selectedModelKey] : []}
            value={
              selectedModel
                ? `${selectedModel.displayName} (${selectedModel.workspaceName})`
                : t("InsightWorkbench_SemanticAnalyzer_Model_SelectionHint", "Select a semantic model")
            }
            onOptionSelect={(_, data) => {
              const value = data.optionValue as string;
              const model = semanticModels.find((m) => `${m.workspaceId}|${m.id}` === value);
              setSelectedModelFromExplorer(model);
            }}
          >
            {semanticModels.map((model) => (
              <Option key={`${model.workspaceId}|${model.id}`} value={`${model.workspaceId}|${model.id}`}>
                {`${model.displayName} (${model.workspaceName})`}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_SemanticAnalyzer_FilterType_Label", "Entity type")}>
          <Dropdown
            selectedOptions={[entityTypeFilter]}
            value={entityTypeFilter === "all" ? t("InsightWorkbench_SemanticAnalyzer_Filter_All", "All entities") : entityTypeFilter}
            onOptionSelect={(_, data) => setEntityTypeFilter(data.optionValue ?? "all")}
          >
            <Option value="all">{t("InsightWorkbench_SemanticAnalyzer_Filter_All", "All entities")}</Option>
            <Option value="Table">{t("InsightWorkbench_SemanticAnalyzer_Type_Table", "Table")}</Option>
            <Option value="Column">{t("InsightWorkbench_SemanticAnalyzer_Type_Column", "Column")}</Option>
            <Option value="Measure">{t("InsightWorkbench_SemanticAnalyzer_Type_Measure", "Measure")}</Option>
            <Option value="Relationship">{t("InsightWorkbench_SemanticAnalyzer_Type_Relationship", "Relationship")}</Option>
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_SemanticAnalyzer_FilterHidden_Label", "Hidden")}>
          <Dropdown
            selectedOptions={[hiddenFilter]}
            value={
              hiddenFilter === "hidden"
                ? t("InsightWorkbench_SemanticAnalyzer_FilterHidden_Hidden", "Hidden")
                : hiddenFilter === "visible"
                  ? t("InsightWorkbench_SemanticAnalyzer_FilterHidden_Visible", "Visible")
                  : t("InsightWorkbench_SemanticAnalyzer_FilterHidden_All", "All")
            }
            onOptionSelect={(_, data) => setHiddenFilter((data.optionValue as "all" | "hidden" | "visible") ?? "all")}
          >
            <Option value="all">{t("InsightWorkbench_SemanticAnalyzer_FilterHidden_All", "All")}</Option>
            <Option value="hidden">{t("InsightWorkbench_SemanticAnalyzer_FilterHidden_Hidden", "Hidden")}</Option>
            <Option value="visible">{t("InsightWorkbench_SemanticAnalyzer_FilterHidden_Visible", "Visible")}</Option>
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_SemanticAnalyzer_FilterReportUsage_Label", "Report usage")}>
          <Dropdown
            selectedOptions={[reportUsageFilter]}
            value={
              reportUsageFilter === "used"
                ? t("InsightWorkbench_SemanticAnalyzer_FilterReportUsage_Used", "Used in reports only")
                : t("InsightWorkbench_SemanticAnalyzer_FilterReportUsage_All", "All entities")
            }
            onOptionSelect={(_, data) => setReportUsageFilter((data.optionValue as "all" | "used") ?? "all")}
          >
            <Option value="all">{t("InsightWorkbench_SemanticAnalyzer_FilterReportUsage_All", "All entities")}</Option>
            <Option value="used">{t("InsightWorkbench_SemanticAnalyzer_FilterReportUsage_Used", "Used in reports only")}</Option>
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_SemanticAnalyzer_Search_Label", "Search")}>
          <Input
            value={searchText}
            onChange={(_, data) => setSearchText(data.value)}
            placeholder={t("InsightWorkbench_SemanticAnalyzer_Search_Placeholder", "Name, table, or Table.Column")}
          />
        </Field>

        <Button
          appearance="secondary"
          onClick={(): void => {
            void loadEntities();
          }}
          disabled={!selectedModel || isLoadingEntities}
        >
          {t("InsightWorkbench_SemanticAnalyzer_ReloadEntities", "Reload entities")}
        </Button>

        <Button
          appearance="primary"
          onClick={() => {
            void handleSaveTmdlSnapshot();
          }}
          disabled={!selectedModel || !tmdlView?.content || isLoadingEntities || isSavingSnapshot}
        >
          {isSavingSnapshot
            ? t("InsightWorkbench_SemanticAnalyzer_SaveTmdlSnapshot_Saving", "Saving TMDL...")
            : t("InsightWorkbench_SemanticAnalyzer_SaveTmdlSnapshot", "Save TMDL snapshot")}
        </Button>

        <Button appearance="secondary" onClick={() => {
          void handleOpenSnapshotCompare();
        }}>
          {t("InsightWorkbench_SemanticAnalyzer_OpenSnapshotCompare", "Compare TMDL snapshots")}
        </Button>

        <Button
          appearance="secondary"
          disabled={!selectedModel}
          onClick={() => {
            setIsEntityCompareOpen((previous) => !previous);
            setEntityCompareError(null);
          }}
        >
          {t("InsightWorkbench_SemanticAnalyzer_CompareTo_Button", "Compare to...")}
        </Button>
      </div>

      {isEntityCompareOpen ? (
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
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label={t("InsightWorkbench_SemanticAnalyzer_CompareTo_TargetModel", "Compare selected model with")}> 
              <Dropdown
                selectedOptions={compareModelKey ? [compareModelKey] : []}
                value={
                  compareModelKey
                    ? (compareCandidateModels.find((model) => `${model.workspaceId}|${model.id}` === compareModelKey)?.displayName ?? compareModelKey)
                    : t("InsightWorkbench_SemanticAnalyzer_CompareTo_TargetModel_Placeholder", "Select another semantic model")
                }
                onOptionSelect={(_, data) => setCompareModelKey(data.optionValue ?? "")}
              >
                {compareCandidateModels.map((model) => (
                  <Option key={`semantic-compare-model-${model.workspaceId}|${model.id}`} value={`${model.workspaceId}|${model.id}`}>
                    {`${model.displayName} (${model.workspaceName})`}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            <Button
              appearance="primary"
              disabled={!selectedModel || !compareModelKey || isComparingModels}
              onClick={() => {
                void handleCompareModels();
              }}
            >
              {isComparingModels
                ? t("InsightWorkbench_SemanticAnalyzer_CompareTo_Comparing", "Comparing...")
                : t("InsightWorkbench_SemanticAnalyzer_CompareTo_Run", "Run compare")}
            </Button>
          </div>

          {entityCompareError ? (
            <Text style={{ color: "var(--colorPaletteRedForeground1)" }}>{entityCompareError}</Text>
          ) : null}

          {entityCompareResult ? (
            <EntityDefinitionDiffView
              leftLabel={`${entityCompareResult.baseModel.displayName} (${entityCompareResult.baseModel.workspaceName})`}
              rightLabel={`${entityCompareResult.targetModel.displayName} (${entityCompareResult.targetModel.workspaceName})`}
              leftContent={entityCompareResult.baseContent}
              rightContent={entityCompareResult.targetContent}
              title={t("InsightWorkbench_SemanticAnalyzer_CompareTo_Title", "Semantic model TMDL diff")}
            />
          ) : null}
        </div>
      ) : null}

      {isLoadingModels || isLoadingEntities ? (
        <div className="insight-workbench-semantic-analyzer-loading">
          <Spinner size="medium" label={t("InsightWorkbench_SemanticAnalyzer_Loading", "Loading semantic model data...")} />
        </div>
      ) : errorText ? (
        <div className="insight-workbench-semantic-analyzer-error">
          <Text>{errorText}</Text>
        </div>
      ) : (
        <>
          <div className="insight-workbench-semantic-analyzer-summary">
            <Badge appearance="filled">{`${entities.length} ${t("InsightWorkbench_SemanticAnalyzer_Entities", "entities")}`}</Badge>
            <Badge appearance="outline">{`${entityTypeCounts.Table} ${t("InsightWorkbench_SemanticAnalyzer_Type_Table", "Table")}`}</Badge>
            <Badge appearance="outline">{`${entityTypeCounts.Column} ${t("InsightWorkbench_SemanticAnalyzer_Type_Column", "Column")}`}</Badge>
            <Badge appearance="outline">{`${entityTypeCounts.Measure} ${t("InsightWorkbench_SemanticAnalyzer_Type_Measure", "Measure")}`}</Badge>
            <Badge appearance="outline">{`${entityTypeCounts.Relationship} ${t("InsightWorkbench_SemanticAnalyzer_Type_Relationship", "Relationship")}`}</Badge>
          </div>

          {filteredEntities.length === 0 ? (
            <div className="insight-workbench-semantic-analyzer-empty">
              <Text>{t("InsightWorkbench_SemanticAnalyzer_NoFilteredEntities", "No entities match the selected filter.")}</Text>
            </div>
          ) : (
            <div className="insight-workbench-semantic-analyzer-table">
              <div
                className="insight-workbench-semantic-analyzer-row insight-workbench-semantic-analyzer-row--header"
                style={{ gridTemplateColumns: "minmax(220px,1.5fr) minmax(120px,.9fr) minmax(160px,1fr) minmax(170px,.9fr)" }}
              >
                <span>{t("InsightWorkbench_SemanticAnalyzer_Column_Name", "Name")}</span>
                <span>{t("InsightWorkbench_SemanticAnalyzer_Column_Type", "Type")}</span>
                <span>{t("InsightWorkbench_SemanticAnalyzer_Column_Table", "Table")}</span>
                <span>{t("InsightWorkbench_SemanticAnalyzer_Column_UsedInReports", "Used in reports")}</span>
              </div>
              {filteredEntities.map((entity) => {
                const usage = reportUsageByEntityId[entity.id];
                const usageCount = usage?.reports.length ?? 0;
                const usedInReports = usageCount > 0;

                return (
                  <div
                    key={entity.id}
                    role="button"
                    tabIndex={0}
                    className={`insight-workbench-semantic-analyzer-row${selectedEntityId === entity.id ? " insight-workbench-semantic-analyzer-row--selected" : ""}`}
                    style={{ gridTemplateColumns: "minmax(220px,1.5fr) minmax(120px,.9fr) minmax(160px,1fr) minmax(170px,.9fr)" }}
                    onClick={() => setSelectedEntityId(entity.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedEntityId(entity.id);
                      }
                    }}
                  >
                    <span>
                      <Button
                        appearance="transparent"
                        size="small"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>): void => {
                          event.stopPropagation();
                          setSelectedEntityId(entity.id);
                          setCurrentView(detailViewName);
                        }}
                      >
                        {entity.name}
                      </Button>
                    </span>
                    <span>{entity.type}</span>
                    <span>{entity.tableName ?? "-"}</span>
                    <span
                      onClick={(e: React.MouseEvent): void => e.stopPropagation()}
                      style={{ display: "flex", alignItems: "center", gap: "4px" }}
                    >
                      {isLoadingReportUsage ? (
                        <Badge appearance="outline">{t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Scanning", "Scanning...")}</Badge>
                      ) : usedInReports ? (
                        <>
                          <Badge appearance="filled">{t("InsightWorkbench_SemanticAnalyzer_ReportUsage_UsedCount", "Yes ({{count}})", { count: usageCount })}</Badge>
                          <Menu>
                            <MenuTrigger>
                              <Button appearance="transparent" size="small">
                                {t("InsightWorkbench_SemanticAnalyzer_JumpToReport_Button", "↗ Open")}
                              </Button>
                            </MenuTrigger>
                            <MenuPopover>
                              <MenuList>
                                {usage?.reports.map((report) => (
                                  <MenuItem
                                    key={`${report.workspaceId}:${report.reportId}`}
                                    onClick={(): void =>
                                      handleJumpToReportScanner(report.reportId, report.workspaceId)
                                    }
                                  >
                                    {`${report.reportName} (${report.workspaceName})`}
                                  </MenuItem>
                                ))}
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        </>
                      ) : (
                        <Badge appearance="tint">{t("InsightWorkbench_SemanticAnalyzer_ReportUsage_NotUsed", "No")}</Badge>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={isCompareDialogOpen} onOpenChange={(_, data) => setIsCompareDialogOpen(data.open)}>
        <DialogSurface style={{ maxWidth: 1200, width: "min(96vw, 1200px)" }}>
          <DialogBody>
            <DialogTitle>
              {t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_Title", "TMDL snapshot comparison")}
            </DialogTitle>
            <DialogContent>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {isLoadingModelSnapshots ? <Spinner label={t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_Loading", "Loading model snapshots...")} /> : null}

                {!isLoadingModelSnapshots && modelSnapshots.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <Field label={t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_SnapshotA", "Snapshot A")}>
                      <Dropdown
                        selectedOptions={compareSnapshotA ? [compareSnapshotA] : []}
                        value={
                          compareSnapshotA
                            ? (modelSnapshots.find((snapshot) => snapshot.id === compareSnapshotA)?.label ?? compareSnapshotA)
                            : t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_SelectA", "Select snapshot A")
                        }
                        onOptionSelect={(_, data) => setCompareSnapshotA(data.optionValue ?? "")}
                      >
                        {modelSnapshots.map((snapshot) => (
                          <Option key={`semantic-snapshot-a-${snapshot.id}`} value={snapshot.id}>
                            {`${snapshot.label ?? snapshot.id.slice(0, 8)} - ${new Date(snapshot.savedAtUtc).toLocaleString()}`}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Field label={t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_SnapshotB", "Snapshot B")}>
                      <Dropdown
                        selectedOptions={compareSnapshotB ? [compareSnapshotB] : []}
                        value={
                          compareSnapshotB
                            ? (modelSnapshots.find((snapshot) => snapshot.id === compareSnapshotB)?.label ?? compareSnapshotB)
                            : t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_SelectB", "Select snapshot B")
                        }
                        onOptionSelect={(_, data) => setCompareSnapshotB(data.optionValue ?? "")}
                      >
                        {modelSnapshots.map((snapshot) => (
                          <Option key={`semantic-snapshot-b-${snapshot.id}`} value={snapshot.id}>
                            {`${snapshot.label ?? snapshot.id.slice(0, 8)} - ${new Date(snapshot.savedAtUtc).toLocaleString()}`}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                    <Button
                      appearance="primary"
                      disabled={!compareSnapshotA || !compareSnapshotB || isComparingSnapshots}
                      onClick={() => {
                        void handleCompareSnapshots();
                      }}
                    >
                      {isComparingSnapshots
                        ? t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_Comparing", "Comparing...")
                        : t("InsightWorkbench_SemanticAnalyzer_SnapshotCompare_Compare", "Compare")}
                    </Button>
                  </div>
                ) : null}

                {modelSnapshotError ? (
                  <Text style={{ color: "var(--colorPaletteRedForeground1)" }}>{modelSnapshotError}</Text>
                ) : null}

                {compareResult ? <SemanticEntitySnapshotDiff resultA={compareResult.a} resultB={compareResult.b} /> : null}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setIsCompareDialogOpen(false)}>
                {t("InsightWorkbench_Close", "Close")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

type DiffKind = "same" | "added" | "removed" | "changed";

function tokenizeLine(line: string): string[] {
  return line.split(/(\s+)/).filter((token) => token.length > 0);
}

function normalizeSemanticContent(content: string, ignoreOrder: boolean): string {
  if (!ignoreOrder) {
    return content;
  }

  const sortedLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return sortedLines.join("\n");
}

function EntityDefinitionDiffView({
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

  const normalizedLeft = useMemo(() => normalizeSemanticContent(leftContent, ignoreOrder), [leftContent, ignoreOrder]);
  const normalizedRight = useMemo(() => normalizeSemanticContent(rightContent, ignoreOrder), [rightContent, ignoreOrder]);

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

    return {
      lineA,
      lineB,
      kind,
    };
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
              key={`semantic-inline-${side}-${tokenIndex}`}
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
        <Tooltip content="Sort lines before comparing to reduce ordering noise." relationship="label">
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={ignoreOrder}
              onChange={(event) => setIgnoreOrder(event.target.checked)}
            />
            <Text size={200}>Ignore order</Text>
          </label>
        </Tooltip>
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
              <div key={`entity-compare-left-${index}`} style={getCellStyle(row.kind, "left")}>
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
              <div key={`entity-compare-right-${index}`} style={getCellStyle(row.kind, "right")}>
                {renderInlineDiff(row.lineB, row.lineA, row.kind, "right")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SemanticAnalyzerView({ detailViewName, workloadClient, item, storageSettings }: SemanticAnalyzerViewProps) {
  return (
    <ItemEditorDefaultView
      center={{
        content: (
          <SemanticAnalyzerContent
            detailViewName={detailViewName}
            workloadClient={workloadClient}
            item={item}
            storageSettings={storageSettings}
          />
        ),
      }}
    />
  );
}

function SemanticEntitySnapshotDiff({
  resultA,
  resultB,
}: {
  resultA: { meta: EntitySnapshotMeta; content: string } | undefined;
  resultB: { meta: EntitySnapshotMeta; content: string } | undefined;
}) {
  if (!resultA || !resultB) {
    return <Text>One or both snapshots are unavailable.</Text>;
  }

  const linesA = resultA.content.split("\n");
  const linesB = resultB.content.split("\n");
  const maxLen = Math.max(linesA.length, linesB.length);
  const rows = Array.from({ length: maxLen }, (_, index) => {
    const lineA = linesA[index] ?? "";
    const lineB = linesB[index] ?? "";
    return {
      lineA,
      lineB,
      changed: lineA !== lineB,
    };
  });
  const changedCount = rows.filter((row) => row.changed).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Text weight="semibold">Raw TMDL diff</Text>
        <Badge appearance="tint" color={changedCount === 0 ? "success" : "warning"}>
          {changedCount === 0 ? "No differences" : `${changedCount} changed line(s)`}
        </Badge>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, overflowX: "auto" }}>
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            A - {resultA.meta.label ?? resultA.meta.id.slice(0, 10)}
          </Text>
          <div
            style={{
              fontFamily: "monospace",
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
              <div key={`semantic-diff-a-${index}`} style={{ background: row.changed ? "var(--colorPaletteYellowBackground2)" : undefined }}>
                {row.lineA || " "}
              </div>
            ))}
          </div>
        </div>
        <div>
          <Text size={200} weight="semibold" style={{ display: "block", marginBottom: 4 }}>
            B - {resultB.meta.label ?? resultB.meta.id.slice(0, 10)}
          </Text>
          <div
            style={{
              fontFamily: "monospace",
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
              <div key={`semantic-diff-b-${index}`} style={{ background: row.changed ? "var(--colorPaletteYellowBackground2)" : undefined }}>
                {row.lineB || " "}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SemanticAnalyzerEntityDetailContent() {
  const { t } = useTranslation();
  const { goBack } = useViewNavigation();
  const {
    selectedEntity,
    setSelectedEntityId,
    selectedModel,
    entities,
    dependencyDiagnostics,
    reportUsageByEntityId,
    isLoadingReportUsage,
    reportUsageError,
    tableStatsByName,
    columnStatsByEntityId,
    relationshipContext,
    loadTableStats,
    loadColumnStats,
    backendEntityRelationships,
  } = useSemanticAnalyzerContext();

  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const semanticEntityById = useMemo(() => {
    return entities.reduce<Record<string, SemanticEntityRow>>((acc, entity) => {
      acc[entity.id] = entity;
      return acc;
    }, {});
  }, [entities]);

  // MASSIVE SIMPLIFICATION: Get relationships from backend instead of computing BFS
  const dependsOnEntities = useMemo(() => {
    if (!selectedEntity || !backendEntityRelationships) {
      return [] as Array<{ entity: SemanticEntityRow; depth: number }>;
    }

    const relationships = backendEntityRelationships[selectedEntity.id];
    if (!relationships) {
      return [];
    }

    return relationships.dependsOn
      .map((entityId) => ({ entity: semanticEntityById[entityId], depth: 0 }))
      .filter((entry): entry is { entity: SemanticEntityRow; depth: number } => Boolean(entry.entity))
      .sort((left, right) => left.entity.type.localeCompare(right.entity.type) || left.entity.name.localeCompare(right.entity.name));
  }, [selectedEntity, backendEntityRelationships, semanticEntityById]);

  const dependedOnEdges = useMemo(
    () =>
      selectedEntity && backendEntityRelationships
        ? backendEntityRelationships[selectedEntity.id]?.dependedOnBy?.map((entityId) => ({
            sourceId: entityId,
            targetId: selectedEntity.id,
          })) || []
        : [],
    [selectedEntity, backendEntityRelationships]
  );

  const dependedOnByEntities = useMemo(() => {
    const allowedEntityTypes = new Set<SemanticEntityType>(["Column", "Table", "Measure"]);
    return dependedOnEdges
      .map((edge) => semanticEntityById[edge.sourceId])
      .filter((entity): entity is SemanticEntityRow => Boolean(entity) && allowedEntityTypes.has(entity.type))
      .sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));
  }, [dependedOnEdges, semanticEntityById]);

  const relationshipFilterContext = useMemo(() => {
    if (!selectedEntity || !relationshipContext) {
      return {
        filters: [] as Array<{ entity: SemanticEntityRow; depth: number }>,
        filteredBy: [] as Array<{ entity: SemanticEntityRow; depth: number }>,
      };
    }

    const context = relationshipContext[selectedEntity.id];
    if (!context) {
      return {
        filters: [] as Array<{ entity: SemanticEntityRow; depth: number }>,
        filteredBy: [] as Array<{ entity: SemanticEntityRow; depth: number }>,
      };
    }

    return {
      filters: (context.filters ?? [])
        .map((entry) => ({ entity: semanticEntityById[entry.tableId], depth: entry.depth }))
        .filter((entry): entry is { entity: SemanticEntityRow; depth: number } => Boolean(entry.entity)),
      filteredBy: (context.filteredBy ?? [])
        .map((entry) => ({ entity: semanticEntityById[entry.tableId], depth: entry.depth }))
        .filter((entry): entry is { entity: SemanticEntityRow; depth: number } => Boolean(entry.entity)),
    };
  }, [relationshipContext, selectedEntity, semanticEntityById]);

  const renderEntityLinkList = useCallback(
    (
      items: Array<{ entity: SemanticEntityRow; depth?: number }>,
      direction: "forward" | "backward",
      emptyText: string
    ) => {
      if (items.length === 0) {
        return (
          <Text size={200} className="insight-workbench-semantic-analyzer-link-empty">
            {emptyText}
          </Text>
        );
      }

      return (
        <div className="insight-workbench-semantic-analyzer-link-list">
          {items.map(({ entity, depth }) => (
            <div key={`${entity.id}:${depth ?? 0}`} className="insight-workbench-semantic-analyzer-link-row">
              <Button
                className="insight-workbench-semantic-analyzer-link-button"
                appearance="transparent"
                size="small"
                onClick={() => setSelectedEntityId(entity.id)}
              >
                {`${direction === "forward" ? "→" : "←"} ${entity.name}${entity.tableName ? ` (${entity.tableName})` : ""}${depth && depth > 1 ? ` (${depth} hops)` : ""}`}
              </Button>
            </div>
          ))}
        </div>
      );
    },
    [setSelectedEntityId]
  );

  useEffect(() => {
    const run = async () => {
      if (!selectedEntity) {
        return;
      }
      setIsLoadingStats(true);
      try {
        if (selectedEntity.type === "Table") {
          await loadTableStats(selectedEntity.name);
        }
        if (selectedEntity.type === "Column" && selectedEntity.tableName) {
          await loadColumnStats(selectedEntity.tableName, selectedEntity.name, selectedEntity.id);
        }
      } finally {
        setIsLoadingStats(false);
      }
    };

    void run();
  }, [selectedEntity, loadTableStats, loadColumnStats]);

  if (!selectedEntity) {
    return (
      <ItemEditorDetailView
        center={{
          content: (
            <div className="insight-workbench-semantic-analyzer-empty">
              <Text>{t("InsightWorkbench_SemanticAnalyzer_Detail_NoSelection", "Select an entity from the Semantic Analyzer to inspect details.")}</Text>
              <Button appearance="secondary" onClick={goBack}>{t("InsightWorkbench_SemanticAnalyzer_BackToAnalyzer", "Back to analyzer")}</Button>
            </div>
          ),
        }}
      />
    );
  }

  const usage = reportUsageByEntityId[selectedEntity.id];
  const tableStats = selectedEntity.type === "Table" ? tableStatsByName[selectedEntity.name.toLowerCase()] : undefined;
  const columnStats = selectedEntity.type === "Column" ? columnStatsByEntityId[selectedEntity.id] : undefined;
  const dependencyDiagnosticsTooltipContent = dependencyDiagnostics
    ? [
        `Source: ${dependencyDiagnostics.expressionSource}`,
        `INFO rows: ${dependencyDiagnostics.infoRowCount ?? 0}`,
        `Mapped dependencies: ${dependencyDiagnostics.mappedCount ?? 0}`,
        ...(dependencyDiagnostics.queryAttempts ?? []).map(
          (attempt) => `${attempt.query}: rows=${attempt.rowCount}${attempt.error ? `, error=${attempt.error}` : ""}`
        ),
      ].join("\n")
    : "";

  return (
    <ItemEditorDetailView
      center={{
        content: (
          <div className="insight-workbench-semantic-analyzer-detail-page">
            <div className="insight-workbench-semantic-analyzer-header">
              <div>
                <h2 className="insight-workbench-section-title">{selectedEntity.name}</h2>
                <Text>{`${selectedModel?.displayName ?? "-"} • ${selectedEntity.type}`}</Text>
              </div>
              <Button appearance="secondary" onClick={goBack}>{t("InsightWorkbench_SemanticAnalyzer_BackToAnalyzer", "Back to analyzer")}</Button>
            </div>

            <div className="insight-workbench-semantic-analyzer-summary">
              <Badge appearance="filled">{selectedEntity.type}</Badge>
              {selectedEntity.tableName ? <Badge appearance="outline">{selectedEntity.tableName}</Badge> : null}
              {dependencyDiagnostics?.expressionSource ? (
                <Tooltip relationship="description" content={dependencyDiagnosticsTooltipContent}>
                  <Badge appearance="tint">{`Dependencies: ${dependencyDiagnostics.expressionSource}`}</Badge>
                </Tooltip>
              ) : null}
            </div>

            <div className="insight-workbench-semantic-analyzer-detail">
              <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Column_DataType", "Data type")}: ${selectedEntity.dataType ?? "-"}`}</Text>
              <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Column_Format", "Format")}: ${selectedEntity.format ?? "-"}`}</Text>
              <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Column_Details", "Details")}: ${selectedEntity.details ?? "-"}`}</Text>
              <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Column_Expression", "Expression")}: ${selectedEntity.expression ?? "-"}`}</Text>
            </div>

            <div className="insight-workbench-semantic-analyzer-detail">
              <Text weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Stats_Title", "Statistics")}</Text>
              {isLoadingStats ? <Spinner size="tiny" /> : null}
              {selectedEntity.type === "Table" ? (
                <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Stats_Table_RowCount", "Table rows")}: ${tableStats?.rowCount ?? "-"}`}</Text>
              ) : null}
              {selectedEntity.type === "Column" ? (
                <>
                  <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Stats_Column_RowCount", "Column rows")}: ${columnStats?.rowCount ?? "-"}`}</Text>
                  <Text>{`${t("InsightWorkbench_SemanticAnalyzer_Stats_Column_Unique", "Unique values")}: ${columnStats?.distinctCount ?? "-"}`}</Text>
                </>
              ) : null}
              {selectedEntity.type !== "Table" && selectedEntity.type !== "Column" ? (
                <Text>{t("InsightWorkbench_SemanticAnalyzer_Stats_Entity_Hint", "Statistics are shown for table and column entities only.")}</Text>
              ) : null}
            </div>

            <div className="insight-workbench-semantic-analyzer-detail">
              <Text weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_ReportUsage_Title", "Report usage")}</Text>
              {isLoadingReportUsage ? <Spinner size="tiny" /> : null}
              {reportUsageError ? <Text>{reportUsageError}</Text> : null}
              {!isLoadingReportUsage && !usage?.reports.length ? (
                <Text>{t("InsightWorkbench_SemanticAnalyzer_Detail_ReportUsage_Empty", "No scanned reports currently reference this semantic entity.")}</Text>
              ) : (
                usage?.reports.map((report) => (
                  <Text key={`${report.workspaceId}:${report.reportId}:${report.usageKind}`}>{`${report.reportName} (${report.workspaceName})`}</Text>
                ))
              )}
            </div>

            <div className="insight-workbench-semantic-analyzer-detail">
              <Text weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_Relationships_Title", "Relationships")}</Text>
              <Text size={200} weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_Filters_Label", "Filters")}</Text>
              {renderEntityLinkList(
                relationshipFilterContext.filters,
                "forward",
                t("InsightWorkbench_SemanticAnalyzer_Detail_Filters_Empty", "No downstream filter targets found.")
              )}
              <Text size={200} weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_FilteredBy_Label", "Filtered by")}</Text>
              {renderEntityLinkList(
                relationshipFilterContext.filteredBy,
                "backward",
                t("InsightWorkbench_SemanticAnalyzer_Detail_FilteredBy_Empty", "No upstream filtering sources found.")
              )}
            </div>

            <div className="insight-workbench-semantic-analyzer-detail">
              <Text weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_Dependencies_Title", "Expression dependencies")}</Text>
              <Text size={200} weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_DependsOn_Label", "Depends on")}</Text>
              {renderEntityLinkList(
                dependsOnEntities,
                "forward",
                t("InsightWorkbench_SemanticAnalyzer_Detail_DependsOn_Empty", "No dependencies found.")
              )}
              <Text size={200} weight="semibold">{t("InsightWorkbench_SemanticAnalyzer_Detail_DependedOn_Label", "Depended on by")}</Text>
              {renderEntityLinkList(
                dependedOnByEntities.map((entity) => ({ entity })),
                "backward",
                t("InsightWorkbench_SemanticAnalyzer_Detail_DependedOn_Empty", "No entities depend on this entity.")
              )}
            </div>
          </div>
        ),
      }}
    />
  );
}

export function SemanticAnalyzerDetailView() {
  return <SemanticAnalyzerEntityDetailContent />;
}

export { SemanticAnalyzerProvider };
