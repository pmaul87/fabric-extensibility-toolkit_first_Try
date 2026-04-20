import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Dropdown,
  Menu,
  MenuPopover,
  MenuTrigger,
  Option,
  Spinner,
  Tab,
  TabList,
  Text,
} from "@fluentui/react-components";
import { ItemEditorDefaultView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "../../InsightWorkbenchItemDefinition";
import { NAV_JUMP_LAKEHOUSE_ANALYZER } from "../../InsightWorkbenchNavKeys";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { LakehouseAnalyzerClient } from "../../../../clients/LakehouseAnalyzerClient";
import type {
  LakehouseEntity,
  LakehouseEntityType,
  LakehouseArtifactUsage,
  LakehouseInventoryResult,
} from "../../../../services/LakehouseAnalyzerService";
import "../../InsightWorkbenchItem.scss";

const QUERY_PARAM_LAKEHOUSE_ARTIFACT_ID = "lakehouseArtifactId";
const QUERY_PARAM_LAKEHOUSE_WORKSPACE_ID = "lakehouseWorkspaceId";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LakehouseAnalyzerViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
}

// ---------------------------------------------------------------------------
// Artifact summary (left panel list)
// ---------------------------------------------------------------------------

interface ArtifactSummary {
  id: string;
  displayName: string;
  type: string;
  workspaceId: string;
  workspaceName?: string;
}

// ---------------------------------------------------------------------------
// Entity type tab filter
// ---------------------------------------------------------------------------

type EntityTab = "all" | LakehouseEntityType;
type EntityGroupBy = "none" | "table";

type EntityColumnKey =
  | "name"
  | "type"
  | "schema"
  | "format"
  | "rowCount"
  | "dataType"
  | "parentTable";

interface EntityColumnDefinition {
  key: EntityColumnKey;
  labelKey: string;
  defaultLabel: string;
  minWidth: string;
}

const ENTITY_TABS: Array<{ key: EntityTab; labelKey: string; defaultLabel: string }> = [
  { key: "all", labelKey: "InsightWorkbench_Lakehouse_Tab_All", defaultLabel: "All" },
  { key: "DeltaTable", labelKey: "InsightWorkbench_Lakehouse_Tab_DeltaTable", defaultLabel: "Delta tables" },
  { key: "ManagedTable", labelKey: "InsightWorkbench_Lakehouse_Tab_ManagedTable", defaultLabel: "Managed tables" },
  { key: "ExternalTable", labelKey: "InsightWorkbench_Lakehouse_Tab_ExternalTable", defaultLabel: "External tables" },
  { key: "View", labelKey: "InsightWorkbench_Lakehouse_Tab_View", defaultLabel: "Views" },
  {
    key: "StoredProcedure",
    labelKey: "InsightWorkbench_Lakehouse_Tab_StoredProcedure",
    defaultLabel: "Stored procedures",
  },
  { key: "Column", labelKey: "InsightWorkbench_Lakehouse_Tab_Column", defaultLabel: "Columns" },
];

const ENTITY_COLUMNS: EntityColumnDefinition[] = [
  {
    key: "name",
    labelKey: "InsightWorkbench_Lakehouse_Col_Name",
    defaultLabel: "Name",
    minWidth: "minmax(220px, 1.8fr)",
  },
  {
    key: "type",
    labelKey: "InsightWorkbench_Lakehouse_Col_Type",
    defaultLabel: "Type",
    minWidth: "minmax(140px, 1fr)",
  },
  {
    key: "schema",
    labelKey: "InsightWorkbench_Lakehouse_Col_Schema",
    defaultLabel: "Schema",
    minWidth: "minmax(140px, 1fr)",
  },
  {
    key: "format",
    labelKey: "InsightWorkbench_Lakehouse_Col_Format",
    defaultLabel: "Format",
    minWidth: "minmax(130px, 0.9fr)",
  },
  {
    key: "rowCount",
    labelKey: "InsightWorkbench_Lakehouse_Col_RowCount",
    defaultLabel: "Row count",
    minWidth: "minmax(130px, 0.9fr)",
  },
  {
    key: "dataType",
    labelKey: "InsightWorkbench_Lakehouse_Col_DataType",
    defaultLabel: "Data type",
    minWidth: "minmax(140px, 1fr)",
  },
  {
    key: "parentTable",
    labelKey: "InsightWorkbench_Lakehouse_Col_ParentTable",
    defaultLabel: "Parent table",
    minWidth: "minmax(180px, 1.2fr)",
  },
];

const DEFAULT_VISIBLE_COLUMNS: EntityColumnKey[] = [
  "name",
  "type",
  "schema",
  "format",
  "rowCount",
  "dataType",
  "parentTable",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entityTypeBadgeColor(
  type: LakehouseEntityType
): "brand" | "important" | "informative" | "subtle" | "success" | "warning" | "danger" {
  switch (type) {
    case "DeltaTable":
      return "brand";
    case "ManagedTable":
      return "informative";
    case "ExternalTable":
      return "warning";
    case "View":
      return "success";
    case "StoredProcedure":
      return "important";
    case "Column":
      return "subtle";
    default:
      return "subtle";
  }
}

function confidenceBadgeColor(
  confidence: "exact" | "inferred"
): "brand" | "informative" | "subtle" {
  return confidence === "exact" ? "informative" : "subtle";
}

// ---------------------------------------------------------------------------
// Left panel – artifact list
// ---------------------------------------------------------------------------

interface ArtifactListProps {
  artifacts: ArtifactSummary[];
  selectedId: string | null;
  onSelect: (artifact: ArtifactSummary) => void;
  isLoading: boolean;
  errorText: string | null;
  onRefresh: () => void;
}

function ArtifactList({
  artifacts,
  selectedId,
  onSelect,
  isLoading,
  errorText,
  onRefresh,
}: ArtifactListProps) {
  const { t } = useTranslation();

  const lakehouses = artifacts.filter((a) => a.type === "Lakehouse");
  const warehouses = artifacts.filter((a) => a.type === "Warehouse");

  function renderGroup(items: ArtifactSummary[], groupLabelKey: string, defaultLabel: string) {
    if (items.length === 0) return null;
    return (
      <div className="insight-workbench-lakehouse-artifact-group">
        <div className="insight-workbench-lakehouse-artifact-group-header">
          <Text size={200} weight="semibold" style={{ color: "var(--colorNeutralForeground3)" }}>
            {t(groupLabelKey, defaultLabel).toUpperCase()} ({items.length})
          </Text>
        </div>
        {items.map((artifact) => (
          <div
            key={artifact.id}
            className={`insight-workbench-lakehouse-artifact-item${
              artifact.id === selectedId ? " insight-workbench-lakehouse-artifact-item--selected" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-selected={artifact.id === selectedId}
            onClick={() => onSelect(artifact)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(artifact);
            }}
          >
            <Text size={200} weight={artifact.id === selectedId ? "semibold" : "regular"}>
              {artifact.displayName}
            </Text>
            {artifact.workspaceName && (
              <Text
                size={100}
                style={{ color: "var(--colorNeutralForeground3)", display: "block" }}
              >
                {artifact.workspaceName}
              </Text>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="insight-workbench-lakehouse-artifact-list">
      <div className="insight-workbench-lakehouse-artifact-list-header">
        <Text size={300} weight="semibold">
          {t("InsightWorkbench_Lakehouse_Artifacts_Label", "Artifacts")}
        </Text>
        <Button
          size="small"
          appearance="subtle"
          onClick={onRefresh}
          disabled={isLoading}
          title={t("InsightWorkbench_Lakehouse_Refresh", "Refresh artifact list")}
        >
          {t("InsightWorkbench_Lakehouse_Refresh", "Refresh")}
        </Button>
      </div>

      {isLoading && (
        <div style={{ padding: "var(--spacingVerticalM)" }}>
          <Spinner size="small" label={t("InsightWorkbench_Lakehouse_LoadingArtifacts", "Loading artifacts…")} />
        </div>
      )}

      {!isLoading && errorText && (
        <div style={{ padding: "var(--spacingVerticalM)" }}>
          <Text size={200} style={{ color: "var(--colorStatusDangerForeground1)" }}>
            {errorText}
          </Text>
        </div>
      )}

      {!isLoading && !errorText && artifacts.length === 0 && (
        <div style={{ padding: "var(--spacingVerticalM)" }}>
          <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
            {t("InsightWorkbench_Lakehouse_NoArtifacts", "No Lakehouse or Warehouse artifacts found.")}
          </Text>
        </div>
      )}

      {!isLoading && !errorText && (
        <>
          {renderGroup(lakehouses, "InsightWorkbench_Lakehouse_Group_Lakehouses", "Lakehouses")}
          {renderGroup(warehouses, "InsightWorkbench_Lakehouse_Group_Warehouses", "Warehouses")}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center panel – entity inventory
// ---------------------------------------------------------------------------

interface EntityTableProps {
  entities: LakehouseEntity[];
  tab: EntityTab;
  groupBy: EntityGroupBy;
  visibleColumns: EntityColumnKey[];
}

function EntityTable({ entities, tab, groupBy, visibleColumns }: EntityTableProps) {
  const { t } = useTranslation();

  const filtered = tab === "all" ? entities : entities.filter((e) => e.type === tab);
  const entityMap = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const displayedColumns = useMemo(
    () => ENTITY_COLUMNS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns]
  );

  const tableGridTemplateColumns = useMemo(
    () => displayedColumns.map((column) => column.minWidth).join(" "),
    [displayedColumns]
  );

  const getParentTableName = useCallback(
    (entity: LakehouseEntity): string | undefined => {
      if (!entity.parentId) return undefined;
      return entityMap.get(entity.parentId)?.displayName;
    },
    [entityMap]
  );

  const groupedColumns = useMemo(() => {
    if (!(groupBy === "table" && tab === "Column")) {
      return [] as Array<{ key: string; entities: LakehouseEntity[] }>;
    }

    const groups = new Map<string, LakehouseEntity[]>();
    for (const column of filtered) {
      const parentTable = getParentTableName(column) || t("InsightWorkbench_Lakehouse_UnknownTable", "Unknown table");
      const list = groups.get(parentTable) ?? [];
      list.push(column);
      groups.set(parentTable, list);
    }

    return [...groups.entries()]
      .map(([key, items]) => ({
        key,
        entities: [...items].sort((left, right) => left.displayName.localeCompare(right.displayName)),
      }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }, [filtered, getParentTableName, groupBy, tab, t]);

  const renderCell = useCallback(
    (entity: LakehouseEntity, columnKey: EntityColumnKey) => {
      switch (columnKey) {
        case "name":
          return <span title={entity.id}>{entity.displayName}</span>;
        case "type":
          return (
            <span>
              <Badge
                size="small"
                color={entityTypeBadgeColor(entity.type)}
                appearance="tint"
              >
                {entity.type}
              </Badge>
            </span>
          );
        case "schema":
          return <span>{entity.schema || "—"}</span>;
        case "format":
          return <span>{entity.format || "—"}</span>;
        case "rowCount":
          return (
            <span>
              {entity.rowCount !== null && entity.rowCount !== undefined
                ? entity.rowCount.toLocaleString()
                : "—"}
            </span>
          );
        case "dataType":
          return <span>{entity.dataType || "—"}</span>;
        case "parentTable":
          return <span>{getParentTableName(entity) || "—"}</span>;
        default:
          return <span>—</span>;
      }
    },
    [getParentTableName]
  );

  if (filtered.length === 0) {
    return (
      <div className="insight-workbench-lakehouse-empty">
        <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
          {t("InsightWorkbench_Lakehouse_NoEntities", "No entities found for the selected filter.")}
        </Text>
      </div>
    );
  }

  return (
    <div className="insight-workbench-lakehouse-table">
      {/* Header row */}
      <div
        className="insight-workbench-lakehouse-row insight-workbench-lakehouse-row--header"
        style={{ gridTemplateColumns: tableGridTemplateColumns }}
      >
        {displayedColumns.map((column) => (
          <span key={column.key}>{t(column.labelKey, column.defaultLabel)}</span>
        ))}
      </div>

      {groupBy === "table" && tab === "Column"
        ? groupedColumns.map((group) => (
            <React.Fragment key={group.key}>
              <div style={{ padding: "var(--spacingVerticalS) 0 var(--spacingVerticalXXS) 0" }}>
                <Text size={200} weight="semibold" style={{ color: "var(--colorNeutralForeground2)" }}>
                  {group.key} ({group.entities.length})
                </Text>
              </div>
              {group.entities.map((entity) => (
                <div
                  key={entity.id}
                  className="insight-workbench-lakehouse-row"
                  style={{ gridTemplateColumns: tableGridTemplateColumns }}
                >
                  {displayedColumns.map((column) => (
                    <React.Fragment key={column.key}>{renderCell(entity, column.key)}</React.Fragment>
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))
        : filtered.map((entity) => (
            <div
              key={entity.id}
              className="insight-workbench-lakehouse-row"
              style={{ gridTemplateColumns: tableGridTemplateColumns }}
            >
              {displayedColumns.map((column) => (
                <React.Fragment key={column.key}>{renderCell(entity, column.key)}</React.Fragment>
              ))}
            </div>
          ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage section
// ---------------------------------------------------------------------------

interface UsageSectionProps {
  usages: LakehouseArtifactUsage[];
}

function UsageSection({ usages }: UsageSectionProps) {
  const { t } = useTranslation();

  if (usages.length === 0) {
    return (
      <div className="insight-workbench-lakehouse-empty" style={{ marginTop: "var(--spacingVerticalM)" }}>
        <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
          {t("InsightWorkbench_Lakehouse_NoUsages", "No cross-artifact usage detected from lineage data.")}
        </Text>
      </div>
    );
  }

  return (
    <div className="insight-workbench-lakehouse-table" style={{ marginTop: "var(--spacingVerticalS)" }}>
      {/* Header */}
      <div className="insight-workbench-lakehouse-usage-row insight-workbench-lakehouse-row--header">
        <span>{t("InsightWorkbench_Lakehouse_Usage_Consumer", "Consumer")}</span>
        <span>{t("InsightWorkbench_Lakehouse_Usage_Type", "Type")}</span>
        <span>{t("InsightWorkbench_Lakehouse_Usage_Workspace", "Workspace")}</span>
        <span>{t("InsightWorkbench_Lakehouse_Usage_Relationship", "Relationship")}</span>
        <span>{t("InsightWorkbench_Lakehouse_Usage_Confidence", "Confidence")}</span>
      </div>

      {usages.map((usage) => (
        <div key={`${usage.consumerArtifactId}-${usage.relationshipType}`} className="insight-workbench-lakehouse-usage-row">
          <span title={usage.consumerArtifactId}>{usage.consumerDisplayName}</span>
          <span>{usage.consumerType}</span>
          <span>{usage.consumerWorkspaceName || usage.consumerWorkspaceId}</span>
          <span>{usage.relationshipType}</span>
          <span>
            <Badge
              size="small"
              color={confidenceBadgeColor(usage.confidence)}
              appearance="tint"
              title={usage.confidenceNote}
            >
              {t(
                usage.confidence === "exact"
                  ? "InsightWorkbench_Lakehouse_Confidence_Exact"
                  : "InsightWorkbench_Lakehouse_Confidence_Inferred",
                usage.confidence === "exact" ? "Exact" : "Inferred"
              )}
            </Badge>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics strip
// ---------------------------------------------------------------------------

interface DiagnosticsProps {
  diagnostics: string[];
}

function Diagnostics({ diagnostics }: DiagnosticsProps) {
  const { t } = useTranslation();

  if (diagnostics.length === 0) return null;

  return (
    <div className="insight-workbench-lakehouse-diagnostics">
      <Text size={200} weight="semibold" style={{ color: "var(--colorStatusWarningForeground1)" }}>
        {t("InsightWorkbench_Lakehouse_Diagnostics_Title", "Partial results — diagnostics")}
      </Text>
      <ul style={{ margin: "var(--spacingVerticalXXS) 0 0 var(--spacingHorizontalM)", padding: 0 }}>
        {diagnostics.map((d, idx) => (
          <li key={idx}>
            <Text size={100} style={{ color: "var(--colorStatusWarningForeground1)" }}>
              {d}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main center panel
// ---------------------------------------------------------------------------

interface CenterPanelProps {
  selectedArtifact: ArtifactSummary | null;
  inventoryResult: LakehouseInventoryResult | null;
  isAnalyzing: boolean;
  analyzeError: string | null;
  onAnalyze: () => void;
  onBackToHub: () => void;
}

function CenterPanel({
  selectedArtifact,
  inventoryResult,
  isAnalyzing,
  analyzeError,
  onAnalyze,
  onBackToHub,
}: CenterPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<EntityTab>("all");
  const [groupBy, setGroupBy] = useState<EntityGroupBy>("none");
  const [visibleColumns, setVisibleColumns] = useState<EntityColumnKey[]>(DEFAULT_VISIBLE_COLUMNS);

  // reset tab when artifact changes
  useEffect(() => {
    setActiveTab("all");
    setGroupBy("none");
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
  }, [selectedArtifact?.id]);

  // Group-by defaults to table only for the Columns tab.
  useEffect(() => {
    setGroupBy(activeTab === "Column" ? "table" : "none");
  }, [activeTab]);

  const toggleColumn = useCallback((columnKey: EntityColumnKey) => {
    setVisibleColumns((current) => {
      if (current.includes(columnKey)) {
        if (current.length === 1) return current;
        return current.filter((key) => key !== columnKey);
      }
      return [...current, columnKey];
    });
  }, []);

  // Derive available tabs from entities
  const availableTabs = useMemo(() => {
    if (!inventoryResult) return ENTITY_TABS.filter((tab) => tab.key === "all");
    const presentTypes = new Set(inventoryResult.entities.map((e) => e.type));
    return ENTITY_TABS.filter((tab) => tab.key === "all" || presentTypes.has(tab.key as LakehouseEntityType));
  }, [inventoryResult]);

  // Count by type for tab badges
  const countsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    if (inventoryResult) {
      for (const entity of inventoryResult.entities) {
        counts[entity.type] = (counts[entity.type] ?? 0) + 1;
      }
      counts["all"] = inventoryResult.entities.length;
    }
    return counts;
  }, [inventoryResult]);

  return (
    <div className="insight-workbench-lakehouse-center">
      {/* Header row */}
      <div className="insight-workbench-lakehouse-center-header">
        <button
          className="insight-workbench-back-link"
          onClick={onBackToHub}
          aria-label={t("InsightWorkbench_BackToHub", "← Back to Hub")}
        >
          {t("InsightWorkbench_BackToHub", "← Back to Hub")}
        </button>

        <Text size={500} weight="semibold">
          {t("InsightWorkbench_Lakehouse_Title", "Lakehouse / Warehouse Analyzer")}
        </Text>
      </div>

      {/* Intro / artifact info */}
      {!selectedArtifact ? (
        <div className="insight-workbench-placeholder">
          <div className="insight-workbench-placeholder-icon">🏠</div>
          <div className="insight-workbench-placeholder-text">
            {t(
              "InsightWorkbench_Lakehouse_SelectPrompt",
              "Select a Lakehouse or Warehouse from the list to analyze its entity inventory."
            )}
          </div>
        </div>
      ) : (
        <div className="insight-workbench-lakehouse-artifact-info">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacingHorizontalS)" }}>
            <Badge color="brand" appearance="tint" size="medium">
              {selectedArtifact.type}
            </Badge>
            <Text size={400} weight="semibold">
              {selectedArtifact.displayName}
            </Text>
            {selectedArtifact.workspaceName && (
              <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                {selectedArtifact.workspaceName}
              </Text>
            )}
          </div>

          {inventoryResult?.sqlEndpoint && (
            <div style={{ marginTop: "var(--spacingVerticalXS)" }}>
              <Text size={100} style={{ color: "var(--colorNeutralForeground3)" }}>
                {t("InsightWorkbench_Lakehouse_SqlEndpoint", "SQL endpoint")}:{" "}
                <code style={{ fontFamily: "monospace", fontSize: "inherit" }}>
                  {inventoryResult.sqlEndpoint}
                </code>
              </Text>
            </div>
          )}

          {/* Analyze button */}
          {!inventoryResult && !isAnalyzing && (
            <Button
              appearance="primary"
              size="small"
              style={{ marginTop: "var(--spacingVerticalS)" }}
              onClick={onAnalyze}
            >
              {t("InsightWorkbench_Lakehouse_Analyze", "Analyze")}
            </Button>
          )}

          {isAnalyzing && (
            <Spinner
              size="small"
              label={t("InsightWorkbench_Lakehouse_Analyzing", "Analyzing artifact…")}
              style={{ marginTop: "var(--spacingVerticalS)" }}
            />
          )}

          {analyzeError && !isAnalyzing && (
            <div style={{ marginTop: "var(--spacingVerticalS)" }}>
              <Text size={200} style={{ color: "var(--colorStatusDangerForeground1)" }}>
                {analyzeError}
              </Text>
              <Button
                appearance="subtle"
                size="small"
                style={{ marginLeft: "var(--spacingHorizontalS)" }}
                onClick={onAnalyze}
              >
                {t("InsightWorkbench_Lakehouse_Retry", "Retry")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {inventoryResult && (
        <>
          {/* Diagnostics */}
          {inventoryResult.isPartial && (
            <Diagnostics diagnostics={inventoryResult.diagnostics} />
          )}

          {/* Entity inventory section */}
          <Divider style={{ margin: "var(--spacingVerticalM) 0" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--spacingVerticalS)" }}>
            <Text size={400} weight="semibold">
              {t("InsightWorkbench_Lakehouse_EntityInventory", "Entity inventory")}
              <Badge size="small" appearance="ghost" style={{ marginLeft: "var(--spacingHorizontalS)" }}>
                {inventoryResult.entities.length}
              </Badge>
            </Text>
            <Button
              appearance="subtle"
              size="small"
              onClick={onAnalyze}
              title={t("InsightWorkbench_Lakehouse_Analyze", "Re-analyze")}
            >
              {t("InsightWorkbench_Lakehouse_Reanalyze", "Re-analyze")}
            </Button>
          </div>

          {inventoryResult.entities.length > 0 ? (
            <>
              <TabList
                selectedValue={activeTab}
                onTabSelect={(_, data) => setActiveTab(data.value as EntityTab)}
                size="small"
              >
                {availableTabs.map((tab) => (
                  <Tab key={tab.key} value={tab.key}>
                    {t(tab.labelKey, tab.defaultLabel)}
                    {countsByType[tab.key] !== undefined && (
                      <Badge
                        size="extra-small"
                        appearance="ghost"
                        style={{ marginLeft: "4px" }}
                      >
                        {countsByType[tab.key]}
                      </Badge>
                    )}
                  </Tab>
                ))}
              </TabList>

              <div
                style={{
                  display: "flex",
                  gap: "var(--spacingHorizontalS)",
                  alignItems: "center",
                  marginTop: "var(--spacingVerticalS)",
                  marginBottom: "var(--spacingVerticalS)",
                }}
              >
                <Dropdown
                  size="small"
                  selectedOptions={[groupBy]}
                  value={
                    groupBy === "table"
                      ? t("InsightWorkbench_Lakehouse_GroupBy_Table", "By table")
                      : t("InsightWorkbench_Lakehouse_GroupBy_None", "No grouping")
                  }
                  onOptionSelect={(_, data) => setGroupBy((data.optionValue as EntityGroupBy) ?? "none")}
                >
                  <Option value="none">
                    {t("InsightWorkbench_Lakehouse_GroupBy_None", "No grouping")}
                  </Option>
                  <Option value="table">
                    {t("InsightWorkbench_Lakehouse_GroupBy_Table", "By table")}
                  </Option>
                </Dropdown>

                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button appearance="subtle" size="small">
                      {t("InsightWorkbench_Lakehouse_Columns_Button", "Select columns")}
                    </Button>
                  </MenuTrigger>
                  <MenuPopover>
                    <div style={{ padding: "var(--spacingVerticalS)", minWidth: "220px" }}>
                      {ENTITY_COLUMNS.map((column) => (
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
              </div>

              <EntityTable
                entities={inventoryResult.entities}
                tab={activeTab}
                groupBy={groupBy}
                visibleColumns={visibleColumns}
              />
            </>
          ) : (
            <div className="insight-workbench-lakehouse-empty">
              <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                {selectedArtifact?.type === "Warehouse"
                  ? t(
                      "InsightWorkbench_Lakehouse_Warehouse_NoEntities",
                      "Warehouse entity listing via REST API is not yet available. " +
                        "Use the SQL endpoint above to query INFORMATION_SCHEMA.TABLES."
                    )
                  : inventoryResult.sqlEndpoint
                  ? t(
                      "InsightWorkbench_Lakehouse_SchemaEnabled_NoEntities",
                      "This Lakehouse uses schemas, and the current REST tables API does not enumerate schema-enabled Lakehouses. Use the SQL endpoint above to query INFORMATION_SCHEMA.TABLES."
                    )
                  : t("InsightWorkbench_Lakehouse_NoEntitiesFound", "No entities found in this artifact.")}
              </Text>
            </div>
          )}

          {/* Cross-artifact usage section */}
          <Divider style={{ margin: "var(--spacingVerticalM) 0" }} />

          <Text size={400} weight="semibold" style={{ display: "block", marginBottom: "var(--spacingVerticalS)" }}>
            {t("InsightWorkbench_Lakehouse_UsageMapping", "Cross-artifact usage")}
            <Badge size="small" appearance="ghost" style={{ marginLeft: "var(--spacingHorizontalS)" }}>
              {inventoryResult.usages.length}
            </Badge>
          </Text>

          <UsageSection usages={inventoryResult.usages} />

          <Text size={100} style={{ color: "var(--colorNeutralForeground3)", display: "block", marginTop: "var(--spacingVerticalS)" }}>
            {t(
              "InsightWorkbench_Lakehouse_AnalyzedAt",
              "Analyzed {{time}}",
              { time: new Date(inventoryResult.analyzedAt).toLocaleString() }
            )}
          </Text>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function LakehouseAnalyzerView({ workloadClient, item }: LakehouseAnalyzerViewProps) {
  const history = useHistory();
  const location = useLocation();
  const { setCurrentView } = useViewNavigation();

  const client = useMemo(
    () => new LakehouseAnalyzerClient(workloadClient),
    [workloadClient]
  );

  // Artifact list state
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [artifactLoadError, setArtifactLoadError] = useState<string | null>(null);

  // Selection
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactSummary | null>(null);

  // Analysis state
  const [inventoryResult, setInventoryResult] = useState<LakehouseInventoryResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const deepLinkState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const artifactId = params.get(QUERY_PARAM_LAKEHOUSE_ARTIFACT_ID) ?? undefined;
    const workspaceId = params.get(QUERY_PARAM_LAKEHOUSE_WORKSPACE_ID) ?? undefined;

    return {
      artifactId,
      workspaceId,
    };
  }, [location.search]);

  const syncLakehouseDeepLink = useCallback(
    (next: { artifactId?: string; workspaceId?: string }) => {
      const params = new URLSearchParams(location.search);

      if (next.artifactId && next.workspaceId) {
        params.set(QUERY_PARAM_LAKEHOUSE_ARTIFACT_ID, next.artifactId);
        params.set(QUERY_PARAM_LAKEHOUSE_WORKSPACE_ID, next.workspaceId);
      } else {
        params.delete(QUERY_PARAM_LAKEHOUSE_ARTIFACT_ID);
        params.delete(QUERY_PARAM_LAKEHOUSE_WORKSPACE_ID);
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

  // ── Load artifacts ──────────────────────────────────────────────────────────
  const loadArtifacts = useCallback(async () => {
    setIsLoadingArtifacts(true);
    setArtifactLoadError(null);

    try {
      const response = await client.loadArtifacts();
      setArtifacts(response.artifacts);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setArtifactLoadError(msg);
    } finally {
      setIsLoadingArtifacts(false);
    }
  }, [client]);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts]);

  useEffect(() => {
    if (!deepLinkState.artifactId || !deepLinkState.workspaceId || artifacts.length === 0) {
      return;
    }

    if (
      selectedArtifact &&
      selectedArtifact.id === deepLinkState.artifactId &&
      selectedArtifact.workspaceId === deepLinkState.workspaceId
    ) {
      return;
    }

    const requestedArtifact = artifacts.find(
      (artifact) => artifact.id === deepLinkState.artifactId && artifact.workspaceId === deepLinkState.workspaceId
    );

    if (requestedArtifact) {
      setSelectedArtifact(requestedArtifact);
      setInventoryResult(null);
      setAnalyzeError(null);
    }
  }, [artifacts, deepLinkState.artifactId, deepLinkState.workspaceId, selectedArtifact]);

  // Handle jump navigation from Metadata Explorer (sessionStorage written before view switch)
  useEffect(() => {
    if (artifacts.length === 0) {
      return;
    }

    try {
      const jumpKey = window.sessionStorage.getItem(NAV_JUMP_LAKEHOUSE_ANALYZER);
      if (!jumpKey) {
        return;
      }

      window.sessionStorage.removeItem(NAV_JUMP_LAKEHOUSE_ANALYZER);
      const [workspaceId, artifactId] = jumpKey.split(":");
      if (!workspaceId || !artifactId) {
        return;
      }

      const jumpArtifact = artifacts.find(
        (artifact) => artifact.id === artifactId && artifact.workspaceId === workspaceId
      );

      if (jumpArtifact) {
        setSelectedArtifact(jumpArtifact);
        setInventoryResult(null);
        setAnalyzeError(null);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [artifacts]);

  // ── Analyze artifact ────────────────────────────────────────────────────────
  const analyzeSelected = useCallback(async () => {
    if (!selectedArtifact) return;

    setIsAnalyzing(true);
    setAnalyzeError(null);
    setInventoryResult(null);

    try {
      const response = await client.analyzeArtifact({
        workspaceId: selectedArtifact.workspaceId,
        artifactId: selectedArtifact.id,
        artifactType: selectedArtifact.type,
        artifactDisplayName: selectedArtifact.displayName,
        workspaceName: selectedArtifact.workspaceName,
      });
      setInventoryResult(response.result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setAnalyzeError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [client, selectedArtifact]);

  // Auto-analyze when a new artifact is selected
  const handleSelectArtifact = useCallback(
    (artifact: ArtifactSummary) => {
      if (artifact.id === selectedArtifact?.id) return;
      setSelectedArtifact(artifact);
      setInventoryResult(null);
      setAnalyzeError(null);
    },
    [selectedArtifact?.id]
  );

  useEffect(() => {
    if (selectedArtifact) {
      void analyzeSelected();
    }
  }, [selectedArtifact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncLakehouseDeepLink({
      artifactId: selectedArtifact?.id,
      workspaceId: selectedArtifact?.workspaceId,
    });
  }, [selectedArtifact?.id, selectedArtifact?.workspaceId, syncLakehouseDeepLink]);

  return (
    <ItemEditorDefaultView
      left={{
        content: (
          <ArtifactList
            artifacts={artifacts}
            selectedId={selectedArtifact?.id ?? null}
            onSelect={handleSelectArtifact}
            isLoading={isLoadingArtifacts}
            errorText={artifactLoadError}
            onRefresh={loadArtifacts}
          />
        ),
        title: "Lakehouse / Warehouse",
        width: 260,
        collapsible: true,
        enableUserResize: true,
      }}
      center={{
        content: (
          <CenterPanel
            selectedArtifact={selectedArtifact}
            inventoryResult={inventoryResult}
            isAnalyzing={isAnalyzing}
            analyzeError={analyzeError}
            onAnalyze={analyzeSelected}
            onBackToHub={() => setCurrentView("hub")}
          />
        ),
        ariaLabel: "Lakehouse / Warehouse Analyzer",
      }}
    />
  );
}
