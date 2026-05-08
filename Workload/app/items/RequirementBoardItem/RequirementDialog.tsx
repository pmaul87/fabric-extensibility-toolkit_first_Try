import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Dismiss24Regular, Search24Regular } from "@fluentui/react-icons";
import type { Requirement, RequirementPriority, RequirementScope, RequirementStatus, RequirementUser } from "./RequirementBoardItemDefinition";
import { KANBAN_COLUMNS, PRIORITY_CONFIG, SCOPE_CONFIG } from "./RequirementBoardItemDefinition";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal node shape — compatible with LineageViewerNode without importing it */
export interface NodePickerItem {
  nodeId: string;
  displayName: string;
  entityType: string;
  objectName?: string;
}

export interface RequirementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All graph nodes available for linking */
  nodes: NodePickerItem[];
  /** Pre-filled title shown when dialog opens */
  initialTitle?: string;
  /** Pre-selected node IDs (e.g. the currently selected node in the lineage graph) */
  initialLinkedNodeIds?: string[];
  /** Current user creating the requirement */
  currentUser?: RequirementUser;
  /** Called with a fully formed Requirement (id + timestamps included) when the user saves */
  onSave: (req: Requirement) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function nowUtc(): string {
  return new Date().toISOString();
}

const SCOPE_ORDER: RequirementScope[] = [
  "change", "create", "delete", "investigate",
  "validate", "document", "migrate", "review", "other",
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    minWidth: "520px",
  },
  fieldRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalM,
  },
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXS,
  },
  scopeCard: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  scopeCardSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  scopeCardTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
  },
  scopeCardDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  nodePickerBox: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    maxHeight: "180px",
    overflowY: "auto",
    marginTop: tokens.spacingVerticalXS,
  },
  nodePickerRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  nodePickerEntityType: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    minWidth: "80px",
  },
  nodeSearchInput: {
    marginBottom: tokens.spacingVerticalXS,
  },
  chipsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
    minHeight: "28px",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: `2px ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorBrandForeground1,
    cursor: "pointer",
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RequirementDialog({
  open,
  onOpenChange,
  nodes,
  initialTitle,
  initialLinkedNodeIds,
  currentUser,
  onSave,
}: RequirementDialogProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  // Form state — reset whenever the dialog opens
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftScope, setDraftScope] = useState<RequirementScope | undefined>(undefined);
  const [draftStatus, setDraftStatus] = useState<RequirementStatus>("backlog");
  const [draftPriority, setDraftPriority] = useState<RequirementPriority>("medium");
  const [draftLinkedNodeIds, setDraftLinkedNodeIds] = useState<Set<string>>(new Set());
  const [draftAssignedTo, setDraftAssignedTo] = useState<RequirementUser[]>([]);
  const [assignedToInput, setAssignedToInput] = useState("");
  const [nodeSearch, setNodeSearch] = useState("");

  useEffect(() => {
    if (open) {
      setDraftTitle(initialTitle ?? "");
      setDraftDescription("");
      setDraftScope(undefined);
      setDraftStatus("backlog");
      setDraftPriority("medium");
      setDraftLinkedNodeIds(new Set(initialLinkedNodeIds ?? []));
      setDraftAssignedTo([]);
      setAssignedToInput("");
      setNodeSearch("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeDisplayName = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) map.set(n.nodeId, n.displayName);
    return map;
  }, [nodes]);

  const filteredPickerNodes = useMemo(() => {
    const search = nodeSearch.trim().toLowerCase();
    if (!search) return nodes;
    return nodes.filter((n) =>
      `${n.displayName} ${n.entityType} ${n.objectName ?? ""}`.toLowerCase().includes(search)
    );
  }, [nodes, nodeSearch]);

  const toggleNode = (nodeId: string) => {
    setDraftLinkedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const addAssignee = (emailInput: string) => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    
    // Parse email format: "email@example.com" or "Name <email@example.com>"
    let email = trimmed;
    let displayName = trimmed;
    
    const angleMatch = trimmed.match(/^(.+?)\s*<(.+?)>$/);
    if (angleMatch) {
      displayName = angleMatch[1].trim();
      email = angleMatch[2].trim();
    }
    
    // Check if email already exists
    if (draftAssignedTo.some((user) => user.email === email)) return;
    
    setDraftAssignedTo((prev) => [
      ...prev,
      { displayName, email },
    ]);
    setAssignedToInput("");
  };

  const removeAssignee = (email: string | undefined) => {
    setDraftAssignedTo((prev) => prev.filter((user) => user.email !== email));
  };

  const handleSave = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const ts = nowUtc();
    onSave({
      id: makeId(),
      title,
      description: draftDescription.trim() || undefined,
      scope: draftScope,
      status: draftStatus,
      priority: draftPriority,
      linkedNodeIds: Array.from(draftLinkedNodeIds),
      tags: [],
      createdAt: ts,
      updatedAt: ts,
      createdBy: currentUser ?? { displayName: "Unknown User" },
      assignedTo: draftAssignedTo.length > 0 ? draftAssignedTo : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            {t("RequirementDialog_Title", "New requirement")}
          </DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              {/* Title */}
              <Field label={t("RequirementDialog_TitleField", "Title")} required>
                <Input
                  value={draftTitle}
                  placeholder={t("RequirementDialog_TitlePlaceholder", "Short, descriptive title...")}
                  onChange={(_, data) => setDraftTitle(data.value)}
                />
              </Field>

              {/* Description */}
              <Field label={t("RequirementDialog_DescriptionField", "Description")}>
                <Textarea
                  value={draftDescription}
                  placeholder={t(
                    "RequirementDialog_DescriptionPlaceholder",
                    "Detailed context, acceptance criteria, or links..."
                  )}
                  rows={3}
                  onChange={(_, data) => setDraftDescription(data.value)}
                />
              </Field>

              {/* Scope picker */}
              <div>
                <Label>{t("RequirementDialog_ScopeField", "Scope")}</Label>
                <div className={styles.scopeGrid}>
                  {SCOPE_ORDER.map((scope) => (
                    <div
                      key={scope}
                      className={
                        draftScope === scope
                          ? `${styles.scopeCard} ${styles.scopeCardSelected}`
                          : styles.scopeCard
                      }
                      onClick={() => setDraftScope(draftScope === scope ? undefined : scope)}
                      role="button"
                      aria-pressed={draftScope === scope}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setDraftScope(draftScope === scope ? undefined : scope);
                      }}
                    >
                      <Text className={styles.scopeCardTitle}>{SCOPE_CONFIG[scope].label}</Text>
                      <Text className={styles.scopeCardDesc}>{SCOPE_CONFIG[scope].description}</Text>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status + Priority */}
              <div className={styles.fieldRow}>
                <Field label={t("RequirementDialog_StatusField", "Status")}>
                  <Select
                    value={draftStatus}
                    onChange={(_, data) => setDraftStatus(data.value as RequirementStatus)}
                  >
                    {KANBAN_COLUMNS.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("RequirementDialog_PriorityField", "Priority")}>
                  <Select
                    value={draftPriority}
                    onChange={(_, data) => setDraftPriority(data.value as RequirementPriority)}
                  >
                    {(Object.keys(PRIORITY_CONFIG) as RequirementPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_CONFIG[p].label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* Assigned To */}
              <div>
                <Label>
                  {t("RequirementDialog_AssignedToField", "Assigned to")}{" "}
                  <Text style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 }}>
                    {t("RequirementDialog_AssignedToHint", "(optional)")}
                  </Text>
                </Label>
                <div style={{ display: "flex", gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalS }}>
                  <Input
                    value={assignedToInput}
                    placeholder={t("RequirementDialog_AssignedToPlaceholder", "email@example.com or Name <email@example.com>")}
                    onChange={(_, data) => setAssignedToInput(data.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addAssignee(assignedToInput);
                      }
                    }}
                  />
                  <Button onClick={() => addAssignee(assignedToInput)}>
                    {t("RequirementDialog_AssignedToAdd", "Add")}
                  </Button>
                </div>
                <div className={styles.chipsRow}>
                  {draftAssignedTo.length === 0 ? (
                    <Text style={{ color: tokens.colorNeutralForeground4, fontSize: tokens.fontSizeBase300, lineHeight: "28px" }}>
                      {t("RequirementDialog_NoAssignees", "None assigned")}
                    </Text>
                  ) : (
                    draftAssignedTo.map((user) => (
                      <span
                        key={user.email}
                        className={styles.chip}
                        onClick={() => removeAssignee(user.email)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") removeAssignee(user.email); }}
                        title={t("RequirementDialog_RemoveAssignee", "Remove")}
                      >
                        {user.displayName}
                        <Dismiss24Regular style={{ fontSize: "12px" }} />
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Node multi-picker */}
              <div>
                <Label>
                  {t("RequirementDialog_NodesField", "Linked lineage elements")}{" "}
                  <Text style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 }}>
                    {t("RequirementDialog_NodesOptional", "(optional — select one or more)")}
                  </Text>
                </Label>

                {/* Selected chips */}
                <div className={styles.chipsRow}>
                  {Array.from(draftLinkedNodeIds).map((nodeId) => (
                    <span
                      key={nodeId}
                      className={styles.chip}
                      onClick={() => toggleNode(nodeId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") toggleNode(nodeId); }}
                      title={t("RequirementDialog_RemoveNode", "Remove")}
                    >
                      {nodeDisplayName.get(nodeId) ?? nodeId}
                      <Dismiss24Regular style={{ fontSize: "12px" }} />
                    </span>
                  ))}
                  {draftLinkedNodeIds.size === 0 && (
                    <Text style={{ color: tokens.colorNeutralForeground4, fontSize: tokens.fontSizeBase300, lineHeight: "28px" }}>
                      {t("RequirementDialog_NoNodesSelected", "None selected")}
                    </Text>
                  )}
                </div>

                {nodes.length > 0 ? (
                  <>
                    <Input
                      className={styles.nodeSearchInput}
                      size="small"
                      contentBefore={<Search24Regular />}
                      placeholder={t("RequirementDialog_NodeSearch", "Filter elements...")}
                      value={nodeSearch}
                      onChange={(_, data) => setNodeSearch(data.value)}
                    />
                    <div className={styles.nodePickerBox}>
                      {filteredPickerNodes.map((node) => (
                        <div
                          key={node.nodeId}
                          className={styles.nodePickerRow}
                          onClick={() => toggleNode(node.nodeId)}
                          role="checkbox"
                          aria-checked={draftLinkedNodeIds.has(node.nodeId)}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter") toggleNode(node.nodeId); }}
                        >
                          <Checkbox
                            checked={draftLinkedNodeIds.has(node.nodeId)}
                            onChange={() => toggleNode(node.nodeId)}
                            label=""
                          />
                          <Text className={styles.nodePickerEntityType}>{node.entityType}</Text>
                          <Text>{node.displayName}</Text>
                        </div>
                      ))}
                      {filteredPickerNodes.length === 0 && (
                        <Text style={{ padding: tokens.spacingHorizontalM, color: tokens.colorNeutralForeground3 }}>
                          {t("RequirementDialog_NodeNoMatch", "No elements match")}
                        </Text>
                      )}
                    </div>
                  </>
                ) : (
                  <Text style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300, marginTop: tokens.spacingVerticalXS }}>
                    {t("RequirementDialog_NoGraph", "No lineage graph available yet. Run an extraction first, then you can link elements.")}
                  </Text>
                )}
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>
              {t("RequirementDialog_Cancel", "Cancel")}
            </Button>
            <Button appearance="primary" onClick={handleSave} disabled={!draftTitle.trim()}>
              {t("RequirementDialog_Save", "Create requirement")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
