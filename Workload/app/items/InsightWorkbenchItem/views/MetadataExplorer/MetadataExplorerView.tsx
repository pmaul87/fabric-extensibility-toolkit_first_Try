import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import jwt_decode from "jwt-decode";
import {
  Badge,
  Button,
  Checkbox,
  Dropdown,
  Field,
  Input,
  Link,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Spinner,
  Text,
} from "@fluentui/react-components";
import { ItemEditorDefaultView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import { useSemanticAnalyzerContext } from "../SemanticAnalyzer/SemanticAnalyzerView";
import { VIEW } from "../../InsightWorkbenchViewNames";
import { InsightWorkbenchItemDefinition, MetadataArtifactCatalogState, MetadataExplorerState } from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { navigateToItem } from "../../../../controller/NavigationController";
import { NAV_JUMP_LAKEHOUSE_ANALYZER, NAV_JUMP_REPORT_SCANNER } from "../../InsightWorkbenchNavKeys";
import {
  ExplorerArtifact,
  compareArtifactsBy,
  formatApiError,
  SortBy,
  GroupBy,
} from "../../../../services/MetadataService";
import { MetadataExplorerClient } from "../../../../clients/MetadataExplorerClient";
import { Item } from "../../../../clients/FabricPlatformTypes";
import { deserializeArtifactCatalog, serializeArtifactCatalog } from "../../services/MetadataArtifactCatalogStorage";
import "../../InsightWorkbenchItem.scss";

interface MetadataExplorerViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  metadataState?: MetadataExplorerState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
}

type MetadataColumnKey =
  | "name"
  | "type"
  | "workspace"
  | "contact"
  | "description"
  | "id"
  | "workspaceId";

interface MetadataColumnDefinition {
  key: MetadataColumnKey;
  labelKey: string;
  defaultLabel: string;
  minWidth: string;
}

const METADATA_COLUMNS: MetadataColumnDefinition[] = [
  {
    key: "name",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_Name",
    defaultLabel: "Name",
    minWidth: "minmax(240px, 2fr)",
  },
  {
    key: "type",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_Type",
    defaultLabel: "Type",
    minWidth: "minmax(140px, 1fr)",
  },
  {
    key: "workspace",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_Workspace",
    defaultLabel: "Workspace",
    minWidth: "minmax(180px, 1.2fr)",
  },
  {
    key: "contact",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_Contact",
    defaultLabel: "Contact",
    minWidth: "minmax(180px, 1fr)",
  },
  {
    key: "description",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_Description",
    defaultLabel: "Description",
    minWidth: "minmax(220px, 1.6fr)",
  },
  {
    key: "id",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_Id",
    defaultLabel: "Artifact ID",
    minWidth: "minmax(220px, 1.4fr)",
  },
  {
    key: "workspaceId",
    labelKey: "InsightWorkbench_MetadataExplorer_Column_WorkspaceId",
    defaultLabel: "Workspace ID",
    minWidth: "minmax(220px, 1.4fr)",
  },
];

const DEFAULT_VISIBLE_COLUMNS: MetadataColumnKey[] = ["name", "type", "workspace", "contact"];
const USER_COLUMN_PREF_STORAGE_PREFIX = "insightWorkbench.metadataExplorer.visibleColumns";
const QUERY_PARAM_METADATA_SEARCH = "metadataSearch";
const QUERY_PARAM_METADATA_TYPE = "metadataType";
const QUERY_PARAM_METADATA_WORKSPACE_ID = "metadataWorkspaceId";
const QUERY_PARAM_METADATA_GROUP_BY = "metadataGroupBy";
const QUERY_PARAM_METADATA_SORT_BY = "metadataSortBy";

interface JwtIdentityClaims {
  oid?: string;
  sub?: string;
  tid?: string;
  upn?: string;
  preferred_username?: string;
  unique_name?: string;
}

function MetadataExplorerContent({
  workloadClient,
  item,
  metadataState,
  onArtifactCatalogChange,
}: {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  metadataState?: MetadataExplorerState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { goBack, setCurrentView } = useViewNavigation();
  const { setSelectedModelFromExplorer } = useSemanticAnalyzerContext();
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ExplorerArtifact[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortBy, setSortBy] = useState<SortBy>("alphabetical");
  const [visibleColumns, setVisibleColumns] = useState<MetadataColumnKey[]>(DEFAULT_VISIBLE_COLUMNS);
  const [userColumnPreferenceKey, setUserColumnPreferenceKey] = useState<string | null>(null);

  const deepLinkState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const requestedGroupBy = params.get(QUERY_PARAM_METADATA_GROUP_BY);
    const requestedSortBy = params.get(QUERY_PARAM_METADATA_SORT_BY);

    const parsedGroupBy: GroupBy =
      requestedGroupBy === "type" || requestedGroupBy === "workspace" || requestedGroupBy === "none"
        ? requestedGroupBy
        : "none";

    const parsedSortBy: SortBy =
      requestedSortBy === "alphabetical" || requestedSortBy === "workspace" || requestedSortBy === "category"
        ? requestedSortBy
        : "alphabetical";

    return {
      searchQuery: params.get(QUERY_PARAM_METADATA_SEARCH) ?? "",
      selectedType: params.get(QUERY_PARAM_METADATA_TYPE) ?? "all",
      selectedWorkspaceId: params.get(QUERY_PARAM_METADATA_WORKSPACE_ID) ?? "all",
      groupBy: parsedGroupBy,
      sortBy: parsedSortBy,
    };
  }, [location.search]);

  const syncMetadataExplorerDeepLink = useCallback((next: {
    searchQuery: string;
    selectedType: string;
    selectedWorkspaceId: string;
    groupBy: GroupBy;
    sortBy: SortBy;
  }) => {
    const params = new URLSearchParams(location.search);

    if (next.searchQuery.trim().length > 0) {
      params.set(QUERY_PARAM_METADATA_SEARCH, next.searchQuery);
    } else {
      params.delete(QUERY_PARAM_METADATA_SEARCH);
    }

    if (next.selectedType !== "all") {
      params.set(QUERY_PARAM_METADATA_TYPE, next.selectedType);
    } else {
      params.delete(QUERY_PARAM_METADATA_TYPE);
    }

    if (next.selectedWorkspaceId !== "all") {
      params.set(QUERY_PARAM_METADATA_WORKSPACE_ID, next.selectedWorkspaceId);
    } else {
      params.delete(QUERY_PARAM_METADATA_WORKSPACE_ID);
    }

    if (next.groupBy !== "none") {
      params.set(QUERY_PARAM_METADATA_GROUP_BY, next.groupBy);
    } else {
      params.delete(QUERY_PARAM_METADATA_GROUP_BY);
    }

    if (next.sortBy !== "alphabetical") {
      params.set(QUERY_PARAM_METADATA_SORT_BY, next.sortBy);
    } else {
      params.delete(QUERY_PARAM_METADATA_SORT_BY);
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
  }, [history, location.pathname, location.search]);

  const cachedArtifacts = useMemo(
    () => deserializeArtifactCatalog(metadataState?.artifactCatalog),
    [metadataState?.artifactCatalog]
  );

  // Create API client instance (only once)
  const apiClient = useMemo(() => new MetadataExplorerClient(workloadClient), [workloadClient]);

  const loadArtifacts = useCallback(async (source: MetadataArtifactCatalogState["source"] = "manual-refresh") => {
    const startedAt = Date.now();
    setIsLoading(true);
    setErrorText(null);

    try {
      console.log("[MetadataExplorer] Loading artifacts from backend API");
      
      // Call backend API to fetch artifacts
      const response = await apiClient.loadArtifacts({
        includeTrace: true,
        maxArtifacts: 0, // No limit
      });

      console.log("[MetadataExplorer] Backend response:", {
        artifactCount: response.totalCount,
        traceLength: response.trace.length,
        hasErrors: response.hasErrors,
        elapsedMs: Date.now() - startedAt,
      });

      setArtifacts(response.artifacts);
      onArtifactCatalogChange?.(serializeArtifactCatalog(response.artifacts, source));

      if (response.totalCount === 0) {
        console.warn("[MetadataExplorer] Metadata response returned zero artifacts", {
          tracePreview: response.trace.slice(0, 5),
          elapsedMs: Date.now() - startedAt,
        });
        setErrorText(
          t(
            "InsightWorkbench_MetadataExplorer_LoadEmpty",
            "No visible artifacts were returned for the current user in the accessible workspaces."
          )
        );
      }
    } catch (error) {
      console.error("[MetadataExplorer] Failed to load artifacts from backend", error);
      const formattedError = formatApiError(error);
      console.error("[MetadataExplorer] Formatted load failure details", {
        formattedError,
        elapsedMs: Date.now() - startedAt,
      });
      setErrorText(
        `${t(
          "InsightWorkbench_MetadataExplorer_LoadError",
          "Failed to load artifacts. Verify workspace access and try again."
        )} ${formattedError}`
      );
      
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, onArtifactCatalogChange, t]);

  useEffect(() => {
    if (cachedArtifacts.length > 0) {
      setArtifacts(cachedArtifacts);
      setIsLoading(false);
      return;
    }

    void loadArtifacts("view-load");
  }, [cachedArtifacts, loadArtifacts]);

  useEffect(() => {
    if (searchQuery !== deepLinkState.searchQuery) {
      setSearchQuery(deepLinkState.searchQuery);
    }

    if (selectedType !== deepLinkState.selectedType) {
      setSelectedType(deepLinkState.selectedType);
    }

    if (selectedWorkspaceId !== deepLinkState.selectedWorkspaceId) {
      setSelectedWorkspaceId(deepLinkState.selectedWorkspaceId);
    }

    if (groupBy !== deepLinkState.groupBy) {
      setGroupBy(deepLinkState.groupBy);
    }

    if (sortBy !== deepLinkState.sortBy) {
      setSortBy(deepLinkState.sortBy);
    }
  }, [
    deepLinkState.groupBy,
    deepLinkState.searchQuery,
    deepLinkState.selectedType,
    deepLinkState.selectedWorkspaceId,
    deepLinkState.sortBy,
    groupBy,
    searchQuery,
    selectedType,
    selectedWorkspaceId,
    sortBy,
  ]);

  useEffect(() => {
    syncMetadataExplorerDeepLink({
      searchQuery,
      selectedType,
      selectedWorkspaceId,
      groupBy,
      sortBy,
    });
  }, [
    groupBy,
    searchQuery,
    selectedType,
    selectedWorkspaceId,
    sortBy,
    syncMetadataExplorerDeepLink,
  ]);

  useEffect(() => {
    const resolveUserPreferenceKey = async () => {
      try {
        const accessToken = await workloadClient.auth.acquireFrontendAccessToken({ scopes: [] });
        const claims = jwt_decode<JwtIdentityClaims>(accessToken.token);

        const userId = claims.oid || claims.sub || claims.upn || claims.preferred_username || claims.unique_name;
        const tenantId = claims.tid || "unknown-tenant";

        if (!userId) {
          setUserColumnPreferenceKey(`${USER_COLUMN_PREF_STORAGE_PREFIX}.anonymous`);
          return;
        }

        const normalizedUserId = userId.toLowerCase();
        setUserColumnPreferenceKey(
          `${USER_COLUMN_PREF_STORAGE_PREFIX}.${tenantId.toLowerCase()}.${normalizedUserId}`
        );
      } catch (error) {
        console.warn("[MetadataExplorer] Failed to resolve Fabric user identity for column preferences", error);
        setUserColumnPreferenceKey(`${USER_COLUMN_PREF_STORAGE_PREFIX}.anonymous`);
      }
    };

    resolveUserPreferenceKey();
  }, [workloadClient]);

  useEffect(() => {
    if (!userColumnPreferenceKey) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(userColumnPreferenceKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      const savedColumns = METADATA_COLUMNS.filter((column) => parsed.includes(column.key)).map((column) => column.key);
      setVisibleColumns(savedColumns);
    } catch (error) {
      console.warn("[MetadataExplorer] Failed to restore per-user column preferences", {
        userColumnPreferenceKey,
        error,
      });
    }
  }, [userColumnPreferenceKey]);

  useEffect(() => {
    if (!userColumnPreferenceKey) {
      return;
    }

    try {
      window.localStorage.setItem(userColumnPreferenceKey, JSON.stringify(visibleColumns));
    } catch (error) {
      console.warn("[MetadataExplorer] Failed to persist per-user column preferences", {
        userColumnPreferenceKey,
        error,
      });
    }
  }, [userColumnPreferenceKey, visibleColumns]);

  const availableTypes = useMemo(
    () => [...new Set(artifacts.map((artifact) => artifact.type))].sort((a, b) => a.localeCompare(b)),
    [artifacts]
  );

  const availableWorkspaces = useMemo(
    () =>
      [...new Map(artifacts.map((artifact) => [artifact.workspaceId, artifact.workspaceName])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1])
      ),
    [artifacts]
  );

  const filteredArtifacts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return artifacts
      .filter((artifact) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          artifact.displayName.toLowerCase().includes(normalizedQuery) ||
          artifact.type.toLowerCase().includes(normalizedQuery) ||
          artifact.workspaceName.toLowerCase().includes(normalizedQuery)
        );
      })
      .filter((artifact) => selectedType === "all" || artifact.type === selectedType)
      .filter((artifact) => selectedWorkspaceId === "all" || artifact.workspaceId === selectedWorkspaceId)
        .sort((a, b) => compareArtifactsBy(a, b, sortBy));
      }, [artifacts, searchQuery, selectedType, selectedWorkspaceId, sortBy]);

  const groupedArtifacts = useMemo(() => {
    if (groupBy === "none") {
      return [
        {
          key: t("InsightWorkbench_MetadataExplorer_Group_All", "All artifacts"),
          artifacts: filteredArtifacts,
        },
      ];
    }

    const groups = new Map<string, ExplorerArtifact[]>();
    for (const artifact of filteredArtifacts) {
      const key = groupBy === "type" ? artifact.type : artifact.workspaceName;
      const current = groups.get(key) ?? [];
      current.push(artifact);
      groups.set(key, current);
    }

    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, grouped]) => ({ key, artifacts: grouped.sort((a, b) => compareArtifactsBy(a, b, sortBy)) }));
  }, [filteredArtifacts, groupBy, sortBy, t]);

  const clearFilters = () => {
    console.log("[MetadataExplorer] Clearing filters", {
      previousSearchQuery: searchQuery,
      previousType: selectedType,
      previousWorkspaceId: selectedWorkspaceId,
      previousGroupBy: groupBy,
      previousSortBy: sortBy,
    });
    setSearchQuery("");
    setSelectedType("all");
    setSelectedWorkspaceId("all");
    setGroupBy("none");
    setSortBy("alphabetical");
  };

  const handleOpenArtifact = useCallback(
    async (artifact: ExplorerArtifact) => {
      const normalizedType = artifact.type.trim().toLowerCase();

      if (normalizedType === "semanticmodel" || normalizedType === "dataset") {
        setSelectedModelFromExplorer({
          id: artifact.id,
          workspaceId: artifact.workspaceId,
          displayName: artifact.displayName,
          workspaceName: artifact.workspaceName,
          type: artifact.type,
        });
        setCurrentView(VIEW.SEMANTIC_ANALYZER);
        return;
      }

      if (normalizedType === "report") {
        try {
          window.sessionStorage.setItem(NAV_JUMP_REPORT_SCANNER, `${artifact.workspaceId}:${artifact.id}`);
        } catch {
          // Ignore storage failures and still navigate.
        }
        setCurrentView(VIEW.REPORT_SCANNER);
        return;
      }

      if (normalizedType === "lakehouse" || normalizedType === "warehouse") {
        try {
          window.sessionStorage.setItem(NAV_JUMP_LAKEHOUSE_ANALYZER, `${artifact.workspaceId}:${artifact.id}`);
        } catch {
          // Ignore storage failures and still navigate.
        }
        setCurrentView(VIEW.LAKEHOUSE_ANALYZER);
        return;
      }

      try {
        const itemToOpen: Item = {
          id: artifact.id,
          type: artifact.type,
          displayName: artifact.displayName,
          description: artifact.description,
          workspaceId: artifact.workspaceId,
        };

        await navigateToItem(workloadClient, itemToOpen);
      } catch (error) {
        console.error("[MetadataExplorer] Failed to navigate to artifact", {
          artifactId: artifact.id,
          artifactType: artifact.type,
          workspaceId: artifact.workspaceId,
          error,
        });
      }
    },
    [setCurrentView, setSelectedModelFromExplorer, workloadClient]
  );

  const handleJumpToView = useCallback(
    (viewName: string, artifact?: ExplorerArtifact) => {
      const isSemanticModelArtifact = artifact?.type.toLowerCase() === "semanticmodel";

      if (
        viewName === VIEW.SEMANTIC_ANALYZER &&
        artifact &&
        isSemanticModelArtifact
      ) {
        setSelectedModelFromExplorer({
          id: artifact.id,
          workspaceId: artifact.workspaceId,
          displayName: artifact.displayName,
          workspaceName: artifact.workspaceName,
          type: artifact.type,
        });
      } else if (viewName === VIEW.SEMANTIC_ANALYZER) {
        setSelectedModelFromExplorer(undefined);
      }

      setCurrentView(viewName);
    },
    [setCurrentView, setSelectedModelFromExplorer]
  );

  const displayedColumns = useMemo(
    () => METADATA_COLUMNS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns]
  );

  const tableGridTemplateColumns = useMemo(
    () => displayedColumns.map((column) => column.minWidth).join(" "),
    [displayedColumns]
  );

  const toggleColumn = useCallback((columnKey: MetadataColumnKey) => {
    setVisibleColumns((previous) => {
      if (previous.includes(columnKey)) {
        return previous.filter((current) => current !== columnKey);
      }

      const next = [...previous, columnKey];
      return METADATA_COLUMNS.filter((column) => next.includes(column.key)).map((column) => column.key);
    });
  }, []);

  const renderArtifactCell = useCallback(
    (artifact: ExplorerArtifact, columnKey: MetadataColumnKey) => {
      if (columnKey === "name") {
        return (
          <span title={artifact.description ?? artifact.displayName}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Link onClick={() => handleOpenArtifact(artifact)}>{artifact.displayName}</Link>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="subtle" size="small">
                    {t("InsightWorkbench_MetadataExplorer_Jump_Button", "Jump")}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem onClick={() => handleJumpToView(VIEW.SEMANTIC_ANALYZER, artifact)}>
                      {t("InsightWorkbench_SemanticAnalyzer_Label", "Semantic Model Analyzer")}
                    </MenuItem>
                    <MenuItem onClick={() => handleJumpToView(VIEW.LINEAGE_GRAPH)}>
                      {t("InsightWorkbench_LineageGraph_Label", "Lineage & Dependency Graph")}
                    </MenuItem>
                    <MenuItem onClick={() => handleJumpToView(VIEW.REQUIREMENTS_BOARD)}>
                      {t("InsightWorkbench_RequirementsBoard_Label", "Requirements Board")}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </span>
          </span>
        );
      }

      if (columnKey === "type") {
        return artifact.type;
      }

      if (columnKey === "workspace") {
        return artifact.workspaceName;
      }

      if (columnKey === "contact") {
        return artifact.createdByDisplayName || artifact.createdByUserPrincipalName || "-";
      }

      if (columnKey === "description") {
        return artifact.description || "-";
      }

      if (columnKey === "id") {
        return artifact.id;
      }

      return artifact.workspaceId;
    },
    [handleJumpToView, handleOpenArtifact, t]
  );

  return (
    <div className="insight-workbench-view insight-workbench-metadata-explorer">
      <div className="insight-workbench-metadata-explorer-header">
        <div>
          <h2 className="insight-workbench-section-title">
            {t("InsightWorkbench_MetadataExplorer_Label", "Metadata Explorer")}
          </h2>
          <Text>
            {t(
              "InsightWorkbench_MetadataExplorer_Intro",
              "Browse artifacts across workspaces. Search, filter, and group results."
            )}
          </Text>
        </div>
        <div className="insight-workbench-requirements-header-actions">
          <Button appearance="secondary" onClick={(): void => {
            void loadArtifacts("manual-refresh");
          }}>
            {t("InsightWorkbench_MetadataExplorer_Refresh", "Refresh")}
          </Button>
          <Button appearance="subtle" onClick={goBack}>
            {t("InsightWorkbench_BackToHub", "← Back to Hub")}
          </Button>
        </div>
      </div>

      <div className="insight-workbench-metadata-explorer-filters">
        <Field label={t("InsightWorkbench_MetadataExplorer_Search_Label", "Search")}> 
          <Input
            value={searchQuery}
            onChange={(_, data) => setSearchQuery(data.value)}
            placeholder={t(
              "InsightWorkbench_MetadataExplorer_Search_Placeholder",
              "Search by name, type, or workspace"
            )}
          />
        </Field>

        <Field label={t("InsightWorkbench_MetadataExplorer_FilterType_Label", "Type filter")}> 
          <Dropdown
            selectedOptions={[selectedType]}
            value={
              selectedType === "all"
                ? t("InsightWorkbench_MetadataExplorer_Filter_AllTypes", "All types")
                : selectedType
            }
            onOptionSelect={(_, data) => setSelectedType(data.optionValue ?? "all")}
          >
            <Option value="all">
              {t("InsightWorkbench_MetadataExplorer_Filter_AllTypes", "All types")}
            </Option>
            {availableTypes.map((type) => (
              <Option key={type} value={type}>
                {type}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field
          label={t("InsightWorkbench_MetadataExplorer_FilterWorkspace_Label", "Workspace filter")}
        >
          <Dropdown
            selectedOptions={[selectedWorkspaceId]}
            value={
              selectedWorkspaceId === "all"
                ? t("InsightWorkbench_MetadataExplorer_Filter_AllWorkspaces", "All workspaces")
                : availableWorkspaces.find(([workspaceId]) => workspaceId === selectedWorkspaceId)?.[1] ??
                  selectedWorkspaceId
            }
            onOptionSelect={(_, data) => setSelectedWorkspaceId(data.optionValue ?? "all")}
          >
            <Option value="all">
              {t("InsightWorkbench_MetadataExplorer_Filter_AllWorkspaces", "All workspaces")}
            </Option>
            {availableWorkspaces.map(([workspaceId, workspaceName]) => (
              <Option key={workspaceId} value={workspaceId}>
                {workspaceName}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_MetadataExplorer_GroupBy_Label", "Group by")}> 
          <Dropdown
            selectedOptions={[groupBy]}
            value={
              groupBy === "type"
                ? t("InsightWorkbench_MetadataExplorer_Group_Type", "Type")
                : groupBy === "workspace"
                  ? t("InsightWorkbench_MetadataExplorer_Group_Workspace", "Workspace")
                  : t("InsightWorkbench_MetadataExplorer_Group_None", "None")
            }
            onOptionSelect={(_, data) =>
              setGroupBy((data.optionValue as "none" | "type" | "workspace") ?? "none")
            }
          >
            <Option value="none">{t("InsightWorkbench_MetadataExplorer_Group_None", "None")}</Option>
            <Option value="type">{t("InsightWorkbench_MetadataExplorer_Group_Type", "Type")}</Option>
            <Option value="workspace">
              {t("InsightWorkbench_MetadataExplorer_Group_Workspace", "Workspace")}
            </Option>
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_MetadataExplorer_SortBy_Label", "Sort by")}> 
          <Dropdown
            selectedOptions={[sortBy]}
            value={
              sortBy === "alphabetical"
                ? t("InsightWorkbench_MetadataExplorer_Sort_Alphabetical", "Alphabetical")
                : sortBy === "category"
                ? t("InsightWorkbench_MetadataExplorer_Sort_Category", "Category")
                : t("InsightWorkbench_MetadataExplorer_Sort_Workspace", "Workspace")
            }
            onOptionSelect={(_, data) => setSortBy((data.optionValue as SortBy) ?? "alphabetical")}
          >
            <Option value="alphabetical">
              {t("InsightWorkbench_MetadataExplorer_Sort_Alphabetical", "Alphabetical")}
            </Option>
            <Option value="workspace">
              {t("InsightWorkbench_MetadataExplorer_Sort_Workspace", "Workspace")}
            </Option>
            <Option value="category">
              {t("InsightWorkbench_MetadataExplorer_Sort_Category", "Category")}
            </Option>
          </Dropdown>
        </Field>

        <Button appearance="secondary" onClick={clearFilters}>
          {t("InsightWorkbench_MetadataExplorer_ClearFilters", "Clear filters")}
        </Button>

        <Field label={t("InsightWorkbench_MetadataExplorer_Columns_Label", "Columns")}> 
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="secondary">
                {t("InsightWorkbench_MetadataExplorer_Columns_Button", "Select columns")}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <div className="insight-workbench-metadata-explorer-column-picker">
                {METADATA_COLUMNS.map((column) => (
                  <Checkbox
                    key={column.key}
                    label={t(column.labelKey, column.defaultLabel)}
                    checked={visibleColumns.includes(column.key)}
                    onChange={() => toggleColumn(column.key)}
                  />
                ))}
              </div>
            </MenuPopover>
          </Menu>
        </Field>
      </div>

      {isLoading ? (
        <div className="insight-workbench-metadata-explorer-loading">
          <Spinner size="medium" label={t("InsightWorkbench_MetadataExplorer_Loading", "Loading artifacts...")} />
        </div>
      ) : errorText ? (
        <>
          <div className="insight-workbench-metadata-explorer-error">
            <Text>{errorText}</Text>
            <Button appearance="primary" onClick={(): void => {
              void loadArtifacts();
            }}>
              {t("InsightWorkbench_MetadataExplorer_Retry", "Retry")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="insight-workbench-metadata-explorer-summary">
            <Badge appearance="filled">{`${filteredArtifacts.length} ${t("InsightWorkbench_MetadataExplorer_Artifacts", "artifacts")}`}</Badge>
            <Badge appearance="ghost">{`${availableWorkspaces.length} ${t("InsightWorkbench_MetadataExplorer_Workspaces", "workspaces")}`}</Badge>
            {metadataState?.artifactCatalog?.lastRefreshedAtUtc ? (
              <Badge appearance="outline">
                {t("InsightWorkbench_MetadataExplorer_LastRefreshed", "Refreshed {{time}}", {
                  time: new Date(metadataState.artifactCatalog.lastRefreshedAtUtc).toLocaleString(),
                })}
              </Badge>
            ) : null}
          </div>

          {filteredArtifacts.length === 0 ? (
            <div className="insight-workbench-metadata-explorer-empty">
              <Text>
                {t(
                  "InsightWorkbench_MetadataExplorer_Empty",
                  "No artifacts match the current filters."
                )}
              </Text>
            </div>
          ) : (
            <div className="insight-workbench-metadata-explorer-groups">
              {groupedArtifacts.map((group) => (
                <section key={group.key} className="insight-workbench-metadata-explorer-group">
                  <div className="insight-workbench-metadata-explorer-group-header">
                    <Text weight="semibold">{group.key}</Text>
                    <Badge appearance="outline">{group.artifacts.length}</Badge>
                  </div>

                  <div className="insight-workbench-metadata-explorer-table">
                    {displayedColumns.length === 0 ? (
                      <div className="insight-workbench-metadata-explorer-empty">
                        <Text>
                          {t(
                            "InsightWorkbench_MetadataExplorer_NoColumnsSelected",
                            "No columns selected. Choose at least one column to display the table."
                          )}
                        </Text>
                      </div>
                    ) : (
                      <>
                        <div
                          className="insight-workbench-metadata-explorer-row insight-workbench-metadata-explorer-row--header"
                          style={{ gridTemplateColumns: tableGridTemplateColumns }}
                        >
                          {displayedColumns.map((column) => (
                            <span key={column.key}>{t(column.labelKey, column.defaultLabel)}</span>
                          ))}
                        </div>

                        {group.artifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            className="insight-workbench-metadata-explorer-row"
                            style={{ gridTemplateColumns: tableGridTemplateColumns }}
                          >
                            {displayedColumns.map((column) => (
                              <span key={`${artifact.id}-${column.key}`}>
                                {renderArtifactCell(artifact, column.key)}
                              </span>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MetadataExplorerView({ workloadClient, item, metadataState, onArtifactCatalogChange }: MetadataExplorerViewProps) {
  return (
    <ItemEditorDefaultView
      center={{ content: <MetadataExplorerContent workloadClient={workloadClient} item={item} metadataState={metadataState} onArtifactCatalogChange={onArtifactCatalogChange} /> }}
    />
  );
}
