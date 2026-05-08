import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  Field,
  Input,
  Option,
  Tag,
  TagGroup,
  Text,
  Textarea,
  Tooltip,
} from "@fluentui/react-components";
import {
  Add24Regular,
  ArrowRight24Regular,
  Delete24Regular,
  Edit24Regular,
  Link24Regular,
  Open24Regular,
} from "@fluentui/react-icons";
import {
  KANBAN_COLUMNS,
  PRIORITY_CONFIG,
  Requirement,
  RequirementBoardItemDefinition,
  RequirementPriority,
  RequirementStatus,
} from "./RequirementBoardItemDefinition";
import { PageProps } from "../../App";

interface RequirementBoardItemDefaultViewProps extends PageProps {
  definition: RequirementBoardItemDefinition;
  onDefinitionChange: (def: RequirementBoardItemDefinition) => void;
  createRequestToken?: number;
  createRequestNodeId?: string;
}

function makeId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function now(): string {
  return new Date().toISOString();
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Requirement Edit Dialog ─────────────────────────────────────────────────

interface EditDialogProps {
  open: boolean;
  initial: Partial<Requirement> | null;
  defaultStatus?: RequirementStatus;
  onSave: (req: Requirement) => void;
  onCancel: () => void;
}

function EditDialog({ open, initial, defaultStatus, onSave, onCancel }: EditDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<RequirementStatus>(initial?.status ?? defaultStatus ?? "backlog");
  const [priority, setPriority] = useState<RequirementPriority>(initial?.priority ?? "medium");
  const [nodeInput, setNodeInput] = useState("");
  const [linkedNodeIds, setLinkedNodeIds] = useState<string[]>(initial?.linkedNodeIds ?? []);

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setDescription(initial?.description ?? "");
      setStatus(initial?.status ?? defaultStatus ?? "backlog");
      setPriority(initial?.priority ?? "medium");
      setLinkedNodeIds(initial?.linkedNodeIds ?? []);
      setNodeInput("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNode = () => {
    const trimmed = nodeInput.trim();
    if (trimmed && !linkedNodeIds.includes(trimmed)) {
      setLinkedNodeIds((prev) => [...prev, trimmed]);
    }
    setNodeInput("");
  };

  const removeNode = (nodeId: string) => {
    setLinkedNodeIds((prev) => prev.filter((n) => n !== nodeId));
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const ts = now();
    onSave({
      id: initial?.id ?? makeId(),
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      linkedNodeIds,
      tags: initial?.tags ?? [],
      createdAt: initial?.createdAt ?? ts,
      updatedAt: ts,
      createdBy: initial?.createdBy ?? { displayName: "Current User" },
    });
  };

  return (
    <Dialog open={open}>
      <DialogSurface className="req-edit-dialog-surface">
        <DialogBody>
          <DialogTitle>
            {initial?.id
              ? t("RequirementBoard_EditReq", "Edit Requirement")
              : t("RequirementBoard_NewReq", "New Requirement")}
          </DialogTitle>
          <DialogContent className="req-edit-dialog-content">
            <Field label={t("RequirementBoard_Field_Title", "Title")} required>
              <Input value={title} onChange={(_, d) => setTitle(d.value)} autoFocus />
            </Field>

            <Field label={t("RequirementBoard_Field_Description", "Description")}>
              <Textarea
                value={description}
                onChange={(_, d) => setDescription(d.value)}
                rows={3}
              />
            </Field>

            <div className="req-edit-row">
              <Field label={t("RequirementBoard_Field_Status", "Status")}>
                <Dropdown
                  value={KANBAN_COLUMNS.find((c) => c.id === status)?.label ?? status}
                  selectedOptions={[status]}
                  onOptionSelect={(_, d) => setStatus(d.optionValue as RequirementStatus)}
                >
                  {KANBAN_COLUMNS.map((col) => (
                    <Option key={col.id} value={col.id}>
                      {col.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label={t("RequirementBoard_Field_Priority", "Priority")}>
                <Dropdown
                  value={PRIORITY_CONFIG[priority].label}
                  selectedOptions={[priority]}
                  onOptionSelect={(_, d) => setPriority(d.optionValue as RequirementPriority)}
                >
                  {(Object.keys(PRIORITY_CONFIG) as RequirementPriority[]).map((p) => (
                    <Option key={p} value={p}>
                      {PRIORITY_CONFIG[p].label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </div>

            <Field
              label={t("RequirementBoard_Field_LinkedNodes", "Linked Lineage Nodes")}
              hint={t(
                "RequirementBoard_Field_LinkedNodes_Hint",
                "Enter a node ID (e.g. measure:sales_total) and press Enter or Add"
              )}
            >
              <div className="req-node-input-row">
                <Input
                  value={nodeInput}
                  onChange={(_, d) => setNodeInput(d.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addNode();
                    }
                  }}
                  placeholder="entity_type:name"
                />
                <Tooltip content={t("RequirementBoard_AddNode", "Add node link")} relationship="label">
                  <Button icon={<Add24Regular />} onClick={addNode} appearance="subtle" />
                </Tooltip>
              </div>
              {linkedNodeIds.length > 0 && (
                <TagGroup
                  onDismiss={(_, d) => removeNode(d.value as string)}
                  className="req-node-tags"
                >
                  {linkedNodeIds.map((nid) => (
                    <Tag key={nid} value={nid} dismissible>
                      {nid}
                    </Tag>
                  ))}
                </TagGroup>
              )}
            </Field>
          </DialogContent>

          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={onCancel}>
                {t("Common_Cancel", "Cancel")}
              </Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={handleSave} disabled={!title.trim()}>
              {t("Common_Save", "Save")}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
  req: Requirement;
  linkedLineageViewerItemId?: string;
  workloadClient: PageProps["workloadClient"];
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
  onMoveStatus: (id: string, status: RequirementStatus) => void;
  onDragStart: (id: string) => void;
  onShowInLineage: (nodeIds: string[], lineageItemId: string) => void;
}

function KanbanCard({
  req,
  linkedLineageViewerItemId,
  onEdit,
  onDelete,
  onMoveStatus,
  onDragStart,
  onShowInLineage,
}: KanbanCardProps) {
  const { t } = useTranslation();
  const { label: priorityLabel, color: priorityColor } = PRIORITY_CONFIG[req.priority];
  const colIndex = KANBAN_COLUMNS.findIndex((c) => c.id === req.status);
  const nextColumn = KANBAN_COLUMNS[colIndex + 1];

  return (
    <div
      className="req-kanban-card"
      draggable
      onDragStart={() => onDragStart(req.id)}
    >
      <div className="req-card-header">
        <Badge color={priorityColor} appearance="tint" size="small">
          {priorityLabel}
        </Badge>
        <div className="req-card-actions">
          {nextColumn && (
            <Tooltip
              content={t("RequirementBoard_MoveTo", "Move to {{col}}", { col: nextColumn.label })}
              relationship="label"
            >
              <Button
                icon={<ArrowRight24Regular />}
                size="small"
                appearance="subtle"
                onClick={() => onMoveStatus(req.id, nextColumn.id)}
              />
            </Tooltip>
          )}
          <Tooltip content={t("RequirementBoard_Edit", "Edit")} relationship="label">
            <Button
              icon={<Edit24Regular />}
              size="small"
              appearance="subtle"
              onClick={() => onEdit(req)}
            />
          </Tooltip>
          <Tooltip content={t("RequirementBoard_Delete", "Delete")} relationship="label">
            <Button
              icon={<Delete24Regular />}
              size="small"
              appearance="subtle"
              onClick={() => onDelete(req.id)}
            />
          </Tooltip>
        </div>
      </div>

      <Text className="req-card-title">{req.title}</Text>

      {req.description && (
        <Text className="req-card-description" size={200}>
          {req.description}
        </Text>
      )}

      {req.linkedNodeIds.length > 0 && (
        <div className="req-card-nodes">
          {req.linkedNodeIds.slice(0, 3).map((nid) => (
            <span key={nid} className="req-node-chip">
              {nid}
            </span>
          ))}
          {req.linkedNodeIds.length > 3 && (
            <span className="req-node-chip req-node-chip--more">
              +{req.linkedNodeIds.length - 3}
            </span>
          )}
        </div>
      )}

      {req.linkedNodeIds.length > 0 && linkedLineageViewerItemId && (
        <div className="req-card-footer">
          <Tooltip
            content={t("RequirementBoard_ShowInLineage", "Show in Lineage Viewer")}
            relationship="label"
          >
            <Button
              icon={<Open24Regular />}
              size="small"
              appearance="subtle"
              iconPosition="before"
              onClick={() => onShowInLineage(req.linkedNodeIds, linkedLineageViewerItemId)}
            >
              {t("RequirementBoard_ShowInLineage_Short", "Show in Lineage")}
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  status: RequirementStatus;
  label: string;
  cards: Requirement[];
  linkedLineageViewerItemId?: string;
  workloadClient: PageProps["workloadClient"];
  onAddCard: (status: RequirementStatus) => void;
  onEditCard: (req: Requirement) => void;
  onDeleteCard: (id: string) => void;
  onMoveCard: (id: string, status: RequirementStatus) => void;
  onDragStart: (id: string) => void;
  onDrop: (targetStatus: RequirementStatus) => void;
  onShowInLineage: (nodeIds: string[], lineageItemId: string) => void;
}

function KanbanColumn({
  status,
  label,
  cards,
  linkedLineageViewerItemId,
  workloadClient,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onMoveCard,
  onDragStart,
  onDrop,
  onShowInLineage,
}: KanbanColumnProps) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`req-kanban-column ${isDragOver ? "req-kanban-column--drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        onDrop(status);
      }}
    >
      <div className="req-column-header">
        <Text weight="semibold" className="req-column-label">
          {label}
        </Text>
        <Badge appearance="tint" color="informative" size="small">
          {cards.length}
        </Badge>
        <Tooltip
          content={t("RequirementBoard_AddToColumn", "Add to {{col}}", { col: label })}
          relationship="label"
        >
          <Button
            icon={<Add24Regular />}
            size="small"
            appearance="subtle"
            onClick={() => onAddCard(status)}
          />
        </Tooltip>
      </div>

      <div className="req-column-cards">
        {cards.map((req) => (
          <KanbanCard
            key={req.id}
            req={req}
            linkedLineageViewerItemId={linkedLineageViewerItemId}
            workloadClient={workloadClient}
            onEdit={onEditCard}
            onDelete={onDeleteCard}
            onMoveStatus={onMoveCard}
            onDragStart={onDragStart}
            onShowInLineage={onShowInLineage}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

export function RequirementBoardItemDefaultView({
  workloadClient,
  definition,
  onDefinitionChange,
  createRequestToken,
  createRequestNodeId,
}: RequirementBoardItemDefaultViewProps) {
  const { t } = useTranslation();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Partial<Requirement> | null>(null);
  const [editingDefaultStatus, setEditingDefaultStatus] = useState<RequirementStatus>("backlog");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [lineageItemIdInput, setLineageItemIdInput] = useState(
    definition.linkedLineageViewerItemId ?? ""
  );
  const draggingIdRef = useRef<string | null>(null);

  const trimmedLineageIdInput = lineageItemIdInput.trim();
  const lineageIdInvalid = Boolean(trimmedLineageIdInput) && !GUID_PATTERN.test(trimmedLineageIdInput);

  const requirements = definition.requirements ?? [];

  const updateRequirements = useCallback(
    (reqs: Requirement[]) => {
      onDefinitionChange({ ...definition, requirements: reqs });
    },
    [definition, onDefinitionChange]
  );

  // ── Dialog handlers ──────────────────────────────────────────────────────

  const openAddDialog = (status: RequirementStatus, initialDraft?: Partial<Requirement>) => {
    setEditingReq(initialDraft ?? null);
    setEditingDefaultStatus(status);
    setEditDialogOpen(true);
  };

  const openEditDialog = (req: Requirement) => {
    setEditingReq(req);
    setEditingDefaultStatus(req.status);
    setEditDialogOpen(true);
  };

  const handleSaveReq = (req: Requirement) => {
    const existing = requirements.find((r) => r.id === req.id);
    if (existing) {
      updateRequirements(requirements.map((r) => (r.id === req.id ? req : r)));
    } else {
      updateRequirements([...requirements, req]);
    }
    setEditDialogOpen(false);
  };

  const handleDeleteReq = (id: string) => {
    updateRequirements(requirements.filter((r) => r.id !== id));
  };

  const handleMoveCard = (id: string, newStatus: RequirementStatus) => {
    updateRequirements(
      requirements.map((r) => (r.id === id ? { ...r, status: newStatus, updatedAt: now() } : r))
    );
  };

  // ── Drag and drop ────────────────────────────────────────────────────────

  const handleDragStart = (id: string) => {
    draggingIdRef.current = id;
  };

  const handleDrop = (targetStatus: RequirementStatus) => {
    const id = draggingIdRef.current;
    if (!id) return;
    draggingIdRef.current = null;
    handleMoveCard(id, targetStatus);
  };

  // ── Show in Lineage ──────────────────────────────────────────────────────

  const handleShowInLineage = useCallback(
    async (nodeIds: string[], lineageItemId: string) => {
      // Navigate to the LineageViewer item. The viewer will read the first nodeId
      // from the URL hash and auto-select it on load.
      const focusParam = nodeIds[0] ? `#focus=${encodeURIComponent(nodeIds[0])}` : "";
      try {
        await workloadClient.navigation.navigate("workload", {
          path: `/LineageViewerItem-editor/${lineageItemId}${focusParam}`,
        });
      } catch {
        // If navigation fails (e.g. different workspace), show a notification
        await workloadClient.notification.open({
          notificationType: 1 /* Info */,
          title: t("RequirementBoard_NavigateFailed", "Cannot navigate"),
          message: t(
            "RequirementBoard_NavigateFailed_Msg",
            "Could not open Lineage Viewer. Ensure it is in the same workspace."
          ),
        });
      }
    },
    [workloadClient, t]
  );

  // ── Link lineage viewer ──────────────────────────────────────────────────

  const saveLinkage = () => {
    if (lineageIdInvalid) {
      return;
    }

    onDefinitionChange({
      ...definition,
      linkedLineageViewerItemId: trimmedLineageIdInput || undefined,
    });
    setLinkDialogOpen(false);
  };

  // UI Change: deep-link driven prefilled requirement creation.
  // MCP Verification: fabricux MCP verified as running on 2026-05-08.
  // Guidance: shared patterns for item creation flows and validation feedback.
  useEffect(() => {
    if (!createRequestToken) {
      return;
    }

    openAddDialog("backlog", createRequestNodeId
      ? {
          title: t("RequirementBoard_New_FromNode_Title", "Investigate {{nodeId}}", { nodeId: createRequestNodeId }),
          linkedNodeIds: [createRequestNodeId],
        }
      : undefined);
  }, [createRequestNodeId, createRequestToken, t]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="req-board-view">
      {/* Toolbar */}
      <div className="req-board-toolbar">
        <Text size={400} weight="semibold">
          {t("RequirementBoard_Title", "Requirement Board")}
        </Text>
        <div className="req-board-toolbar-right">
          <Tooltip
            content={
              definition.linkedLineageViewerItemId
                ? t("RequirementBoard_LinkedTo", "Linked to Lineage Viewer: {{id}}", {
                    id: definition.linkedLineageViewerItemId,
                  })
                : t("RequirementBoard_LinkLineage", "Link to a Lineage Viewer item")
            }
            relationship="label"
          >
            <Button
              icon={<Link24Regular />}
              appearance={definition.linkedLineageViewerItemId ? "primary" : "subtle"}
              size="small"
              onClick={() => {
                setLineageItemIdInput(definition.linkedLineageViewerItemId ?? "");
                setLinkDialogOpen(true);
              }}
            >
              {definition.linkedLineageViewerItemId
                ? t("RequirementBoard_LinkedViewer", "Lineage Viewer linked")
                : t("RequirementBoard_LinkViewer", "Link Lineage Viewer")}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Kanban board */}
      <div className="req-kanban-board">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            status={col.id}
            label={col.label}
            cards={requirements.filter((r) => r.status === col.id)}
            linkedLineageViewerItemId={definition.linkedLineageViewerItemId}
            workloadClient={workloadClient}
            onAddCard={openAddDialog}
            onEditCard={openEditDialog}
            onDeleteCard={handleDeleteReq}
            onMoveCard={handleMoveCard}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onShowInLineage={handleShowInLineage}
          />
        ))}
      </div>

      {/* Edit / Add Dialog */}
      <EditDialog
        open={editDialogOpen}
        initial={editingReq}
        defaultStatus={editingDefaultStatus}
        onSave={handleSaveReq}
        onCancel={() => setEditDialogOpen(false)}
      />

      {/* Link Lineage Viewer Dialog */}
      <Dialog open={linkDialogOpen}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {t("RequirementBoard_LinkDialog_Title", "Link to Lineage Viewer")}
            </DialogTitle>
            <DialogContent>
              <Field
                label={t("RequirementBoard_LinkDialog_Field", "Lineage Viewer Item ID")}
                hint={t(
                  "RequirementBoard_LinkDialog_Hint",
                  "Paste the Fabric item GUID of the Lineage Viewer you want to connect. Requirements linked to nodes in that viewer will show a 'Show in Lineage' button."
                )}
                validationState={lineageIdInvalid ? "error" : undefined}
                validationMessage={lineageIdInvalid
                  ? t("RequirementBoard_LinkDialog_InvalidGuid", "Enter a valid Fabric item GUID.")
                  : undefined}
              >
                <Input
                  value={lineageItemIdInput}
                  onChange={(_, d) => setLineageItemIdInput(d.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setLinkDialogOpen(false)}>
                {t("Common_Cancel", "Cancel")}
              </Button>
              {definition.linkedLineageViewerItemId && (
                <Button
                  appearance="subtle"
                  onClick={() => {
                    setLineageItemIdInput("");
                    onDefinitionChange({ ...definition, linkedLineageViewerItemId: undefined });
                    setLinkDialogOpen(false);
                  }}
                >
                  {t("RequirementBoard_Unlink", "Remove link")}
                </Button>
              )}
              <Button appearance="primary" onClick={saveLinkage} disabled={lineageIdInvalid}>
                {t("Common_Save", "Save")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
