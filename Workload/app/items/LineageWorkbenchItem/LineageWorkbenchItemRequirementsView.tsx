import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  Badge,
  Input,
  Select,
  Button,
  Tooltip,
  Divider,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  Add24Regular,
  Home24Regular,
  Search24Regular,
  TaskListLtr24Regular,
} from "@fluentui/react-icons";
import { ItemEditorDefaultView, useViewNavigation } from "../../components/ItemEditor";
import type { Requirement, RequirementStatus, RequirementPriority } from "../RequirementBoardItem";
import { PRIORITY_CONFIG, KANBAN_COLUMNS, SCOPE_CONFIG, RequirementDialog } from "../RequirementBoardItem";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalXL,
    maxWidth: "960px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  toolbar: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    alignItems: "center",
  },
  searchInput: {
    flexGrow: 1,
    minWidth: "200px",
  },
  countLabel: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 110px 110px 100px 120px 150px 150px",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    gap: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  headerCell: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  requirementRow: {
    display: "grid",
    gridTemplateColumns: "1fr 110px 110px 100px 120px 150px 150px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    gap: tokens.spacingHorizontalM,
    alignItems: "start",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  requirementTitleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  requirementTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    wordBreak: "break-word",
  },
  requirementDesc: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    wordBreak: "break-word",
  },
  linkedNodeChips: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  nodeChip: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: `2px ${tokens.spacingHorizontalXS}`,
    borderRadius: tokens.borderRadiusSmall,
    wordBreak: "break-all",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground2,
  },
  emptyIcon: {
    fontSize: "48px",
    color: tokens.colorNeutralForeground3,
  },
  emptyTitle: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  emptySubtitle: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    maxWidth: "400px",
  },
});

// ---------------------------------------------------------------------------
// Status colours
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<RequirementStatus, "informative" | "success" | "warning" | "danger" | "subtle"> = {
  backlog: "subtle",
  todo: "informative",
  "in-progress": "warning",
  review: "informative",
  done: "success",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LineageWorkbenchItemRequirementsViewProps {
  lineage: any;
  onLineageChange: (next: any) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LineageWorkbenchItemRequirementsView({
  lineage,
  onLineageChange,
}: LineageWorkbenchItemRequirementsViewProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { setCurrentView } = useViewNavigation();

  const requirements: Requirement[] = lineage?.requirements ?? [];
  const nodes = lineage?.graphSnapshot?.nodes ?? [];

  const nodeDisplayName = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) map.set(node.nodeId, node.displayName);
    return map;
  }, [nodes]);

  // ── List filters ────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequirementStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<RequirementPriority | "all">("all");

  const filtered = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return requirements.filter((req) => {
      if (statusFilter !== "all" && req.status !== statusFilter) return false;
      if (priorityFilter !== "all" && req.priority !== priorityFilter) return false;
      if (search) {
        const haystack = `${req.title} ${req.description ?? ""} ${req.linkedNodeIds.join(" ")} ${req.scope ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [requirements, searchText, statusFilter, priorityFilter]);

  // ── Dialog ───────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = (req: Requirement) => {
    const base = lineage ?? { direction: "both" as const, maxDepth: 4, requirements: [] };
    onLineageChange({ ...base, requirements: [...(base.requirements ?? []), req] });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const centerContent = (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <Tooltip
          content={t("LineageWorkbench_Requirements_GoHome_Tooltip", "Back to Lineage Workbench")}
          relationship="label"
        >
          <Button appearance="subtle" icon={<Home24Regular />} onClick={() => setCurrentView("home")} />
        </Tooltip>
        <Input
          className={styles.searchInput}
          contentBefore={<Search24Regular />}
          placeholder={t("LineageWorkbench_Requirements_Search", "Search requirements...")}
          value={searchText}
          onChange={(_, data) => setSearchText(data.value)}
        />
        <Select
          value={statusFilter}
          onChange={(_, data) => setStatusFilter(data.value as RequirementStatus | "all")}
        >
          <option value="all">{t("LineageWorkbench_Requirements_AllStatuses", "All statuses")}</option>
          {KANBAN_COLUMNS.map((col) => (
            <option key={col.id} value={col.id}>{col.label}</option>
          ))}
        </Select>
        <Select
          value={priorityFilter}
          onChange={(_, data) => setPriorityFilter(data.value as RequirementPriority | "all")}
        >
          <option value="all">{t("LineageWorkbench_Requirements_AllPriorities", "All priorities")}</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Text className={styles.countLabel}>
          {filtered.length} / {requirements.length}
        </Text>
        <Button appearance="primary" icon={<Add24Regular />} onClick={() => setDialogOpen(true)}>
          {t("LineageWorkbench_Requirements_New", "New requirement")}
        </Button>
      </div>

      <Divider />

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <TaskListLtr24Regular fontSize="inherit" />
          </div>
          <Text className={styles.emptyTitle}>
            {requirements.length === 0
              ? t("LineageWorkbench_Requirements_Empty_Title", "No requirements yet")
              : t("LineageWorkbench_Requirements_NoMatch_Title", "No matching requirements")}
          </Text>
          <Text className={styles.emptySubtitle}>
            {requirements.length === 0
              ? t(
                  "LineageWorkbench_Requirements_Empty_Hint",
                  'Click "New requirement" to create one, or select a node in the Lineage Graph to create it in context.'
                )
              : t("LineageWorkbench_Requirements_NoMatch_Hint", "Try adjusting your search or filter criteria.")}
          </Text>
          {requirements.length === 0 && (
            <Button appearance="primary" icon={<Add24Regular />} onClick={() => setDialogOpen(true)}>
              {t("LineageWorkbench_Requirements_New", "New requirement")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className={styles.tableHeader}>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_Title", "Title")}
            </Text>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_Status", "Status")}
            </Text>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_Priority", "Priority")}
            </Text>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_Scope", "Scope")}
            </Text>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_CreatedBy", "Created by")}
            </Text>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_AssignedTo", "Assigned to")}
            </Text>
            <Text className={styles.headerCell}>
              {t("LineageWorkbench_Requirements_Col_Nodes", "Linked nodes")}
            </Text>
          </div>

          {/* Rows */}
          {filtered.map((req) => (
            <div key={req.id} className={styles.requirementRow}>
              <div className={styles.requirementTitleBlock}>
                <Text className={styles.requirementTitle}>{req.title}</Text>
                {req.description && (
                  <Text className={styles.requirementDesc}>{req.description}</Text>
                )}
              </div>
              <Badge appearance="filled" color={STATUS_COLOR[req.status]}>
                {KANBAN_COLUMNS.find((c) => c.id === req.status)?.label ?? req.status}
              </Badge>
              <Badge appearance="outline" color={PRIORITY_CONFIG[req.priority].color}>
                {PRIORITY_CONFIG[req.priority].label}
              </Badge>
              <div>
                {req.scope ? (
                  <Badge appearance="tint" color="brand">
                    {SCOPE_CONFIG[req.scope].label}
                  </Badge>
                ) : (
                  <Text style={{ color: tokens.colorNeutralForeground4, fontSize: tokens.fontSizeBase300 }}>
                    ---
                  </Text>
                )}
              </div>
              <div>
                {req.createdBy ? (
                  <Tooltip
                    content={req.createdBy.email ? `${req.createdBy.displayName} (${req.createdBy.email})` : req.createdBy.displayName}
                    relationship="description"
                  >
                    <Text style={{ fontSize: tokens.fontSizeBase300 }}>
                      {req.createdBy.displayName}
                    </Text>
                  </Tooltip>
                ) : (
                  <Text style={{ color: tokens.colorNeutralForeground4, fontSize: tokens.fontSizeBase300 }}>
                    ---
                  </Text>
                )}
              </div>
              <div className={styles.linkedNodeChips}>
                {!req.assignedTo || req.assignedTo.length === 0 ? (
                  <Text style={{ color: tokens.colorNeutralForeground4, fontSize: tokens.fontSizeBase300 }}>
                    ---
                  </Text>
                ) : (
                  req.assignedTo.map((user) => (
                    <Tooltip
                      key={user.email}
                      content={user.email ? `${user.displayName} (${user.email})` : user.displayName}
                      relationship="description"
                    >
                      <Text className={styles.nodeChip}>
                        {user.displayName}
                      </Text>
                    </Tooltip>
                  ))
                )}
              </div>
              <div className={styles.linkedNodeChips}>
                {req.linkedNodeIds.length === 0 ? (
                  <Text style={{ color: tokens.colorNeutralForeground4, fontSize: tokens.fontSizeBase300 }}>
                    ---
                  </Text>
                ) : (
                  req.linkedNodeIds.map((nodeId) => (
                    <Tooltip key={nodeId} content={nodeId} relationship="description">
                      <Text className={styles.nodeChip}>
                        {nodeDisplayName.get(nodeId) ?? nodeId}
                      </Text>
                    </Tooltip>
                  ))
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <RequirementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        nodes={nodes}
        currentUser={{ displayName: "Current User", email: "" }}
        onSave={handleSave}
      />
    </div>
  );

  return <ItemEditorDefaultView center={{ content: centerContent }} />;
}