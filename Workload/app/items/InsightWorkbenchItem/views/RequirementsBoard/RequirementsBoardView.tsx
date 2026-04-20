import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import jwt_decode from "jwt-decode";
import {
  Database16Regular,
  Document20Regular,
  Link20Regular,
  Table20Regular,
} from "@fluentui/react-icons";
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Dropdown,
  Field,
  Input,
  Link,
  Option,
  Spinner,
  Tab,
  TabList,
  Text,
  Textarea,
} from "@fluentui/react-components";
import { ExplorerArtifact, LineageLink, formatApiError } from "../../../../services/MetadataService";
import { MetadataExplorerClient } from "../../../../clients/MetadataExplorerClient";
import { WorkspaceClient } from "../../../../clients/WorkspaceClient";
import { ItemEditorDefaultView, useViewNavigation } from "../../../../components/ItemEditor";
import { useSemanticAnalyzerContext } from "../SemanticAnalyzer/SemanticAnalyzerView";
import { buildHierarchy, buildReportJsonTable, parseDefinitionParts } from "../../models/ReportUsageModel";
import { buildUnifiedReport, UnifiedReport } from "../../models/UnifiedReportModel";
import { ReportPagePreview } from "../ReportScanner/ReportPagePreview";
import {
  InsightWorkbenchItemDefinition,
  MetadataArtifactCatalogState,
  RequirementsBoardStorageSettings,
  RequirementCard,
  RequirementLink,
  RequirementStatus,
  TicketAuditAction,
  TicketAuditEntry,
  TicketEvidenceLink,
  TicketTmdlProposal,
  TicketComment,
  RequirementsBoardState,
} from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import { deserializeArtifactCatalog, serializeArtifactCatalog } from "../../services/MetadataArtifactCatalogStorage";
import { RequirementsBoardStorageService } from "../../services/RequirementsBoardStorageService";
import "../../InsightWorkbenchItem.scss";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequirementsBoardViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  boardState?: RequirementsBoardState;
  storageSettings?: RequirementsBoardStorageSettings;
  onBoardStateChange?: (nextState: RequirementsBoardState) => void;
  artifactCatalog?: MetadataArtifactCatalogState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
}

interface BoardUser {
  id: string;
  displayName: string;
}

type TicketReportUsageEntry = {
  reportId: string;
  workspaceId: string;
  reportName: string;
  workspaceName: string;
  reasons: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_COLUMN_ORDER: RequirementStatus[] = ["Backlog", "InProgress", "InReview", "Done"];

const STATUS_LABELS: Record<RequirementStatus, string> = {
  Backlog: "Backlog",
  InProgress: "In Progress",
  InReview: "In Review",
  Done: "Done",
};

type TicketCreateArtifactType = "report" | "semantic-model" | "data-store" | "data-loading";
type TicketCreateArtifactMode = "change-existing" | "create-new";
type SemanticPickerGroupBy = "none" | "table" | "type";
type EditDialogTab = "details" | "reports" | "semantic-impact" | "dependencies";

const CREATE_ARTIFACT_TYPE_OPTIONS: Array<{ value: TicketCreateArtifactType; label: string }> = [
  { value: "report", label: "Report" },
  { value: "semantic-model", label: "Semantic Model" },
  { value: "data-store", label: "Data Store" },
  { value: "data-loading", label: "Data Loading" },
];

const QUERY_PARAM_REQUIREMENTS_TICKET = "requirementsTicket";
const QUERY_PARAM_REQUIREMENTS_EDIT_TAB = "requirementsEditTab";

function mapArtifactToCreateType(artifactType: string): TicketCreateArtifactType | null {
  const normalized = artifactType.toLowerCase();
  if (normalized.includes("report")) return "report";
  if (normalized.includes("semantic")) return "semantic-model";
  if (normalized.includes("dataset")) return "semantic-model";
  if (normalized.includes("warehouse") || normalized.includes("lakehouse") || normalized.includes("datastore")) return "data-store";
  if (normalized.includes("dataflow") || normalized.includes("pipeline") || normalized.includes("notebook")) return "data-loading";
  return null;
}

function getRequirementLinkIcon(link: RequirementLink): { icon: React.ReactNode; label: string } {
  const entityType = (link.entityType ?? "").toLowerCase();
  const linkType = link.linkType.toLowerCase();

  if (linkType === "semantic") {
    if (entityType.includes("measure")) {
      return {
        icon: <span style={{ fontWeight: 700, fontSize: "14px", lineHeight: 1 }}>∑</span>,
        label: "Measure",
      };
    }

    if (entityType.includes("column")) {
      return { icon: <Table20Regular />, label: "Semantic column" };
    }

    if (entityType.includes("table")) {
      return { icon: <Table20Regular />, label: "Semantic table" };
    }

    if (entityType.includes("relationship")) {
      return { icon: <Link20Regular />, label: "Semantic relationship" };
    }

    return { icon: <Database16Regular />, label: "Semantic model" };
  }

  if (linkType === "artifact") {
    if (entityType.includes("report")) {
      return { icon: <Document20Regular />, label: "Report" };
    }

    if (entityType.includes("semantic") || entityType.includes("dataset")) {
      return { icon: <Database16Regular />, label: "Semantic model" };
    }

    if (
      entityType.includes("lakehouse") ||
      entityType.includes("warehouse") ||
      entityType.includes("table")
    ) {
      return { icon: <Table20Regular />, label: "Data store" };
    }

    return { icon: <Document20Regular />, label: "Artifact" };
  }

  if (linkType === "lineage") {
    return { icon: <Link20Regular />, label: "Lineage" };
  }

  return { icon: <Link20Regular />, label: "Link" };
}

function createClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTicketAuditEntry(
  ticketId: string,
  action: TicketAuditAction,
  details?: string,
  proposalId?: string
): TicketAuditEntry {
  return {
    id: createClientId("ticket-audit"),
    ticketId,
    action,
    timestampUtc: new Date().toISOString(),
    details,
    proposalId,
  };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    operation
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function formatArtifactTimestamp(value: Date | string | undefined): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function tryParseImageLine(line: string): { alt: string; url: string } | undefined {
  const trimmed = line.trim();
  const markdownMatch = trimmed.match(/^!\[(.*?)\]\((https?:\/\/[^\s)]+|data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)$/i);
  if (markdownMatch) {
    return {
      alt: markdownMatch[1] || "image",
      url: markdownMatch[2],
    };
  }

  const urlMatch = trimmed.match(/^(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg))(\?\S*)?$/i);
  if (urlMatch) {
    return {
      alt: "image",
      url: trimmed,
    };
  }

  return undefined;
}

function appendImageMarkdown(baseText: string | undefined, imageUrl: string, altText = "image"): string {
  const nextUrl = imageUrl.trim();
  if (!nextUrl) {
    return baseText ?? "";
  }

  const prefix = (baseText ?? "").trim().length > 0 ? `${baseText?.trim()}\n` : "";
  return `${prefix}![${altText}](${nextUrl})`;
}

function extractImageFilesFromClipboard(event: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>): File[] {
  const items = event.clipboardData?.items;
  if (!items) {
    return [];
  }

  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }

  return files;
}

function extractImageFilesFromDrop(event: React.DragEvent<HTMLTextAreaElement | HTMLInputElement>): File[] {
  const files = event.dataTransfer?.files;
  if (!files) {
    return [];
  }

  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function appendImageFilesAsMarkdown(
  baseText: string | undefined,
  files: File[],
  altPrefix: string
): Promise<string> {
  let nextText = baseText ?? "";

  for (let index = 0; index < files.length; index += 1) {
    const dataUrl = await fileToDataUrl(files[index]);
    nextText = appendImageMarkdown(nextText, dataUrl, `${altPrefix}-${index + 1}`);
  }

  return nextText;
}

async function buildImageMarkdownBlock(files: File[], altPrefix: string): Promise<string> {
  const lines: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const dataUrl = await fileToDataUrl(files[index]);
    lines.push(`![${altPrefix}-${index + 1}](${dataUrl})`);
  }

  return lines.join("\n");
}

function normalizeBoardState(state: RequirementsBoardState | undefined): RequirementsBoardState {
  const cards = (state?.cards ?? []).map((card, index) => ({
    ...card,
    ticketNumber: card.ticketNumber ?? index + 1,
    name: card.name ?? card.title ?? `Ticket ${index + 1}`,
    developer: card.developer ?? card.assignee,
    links: (card.links ?? []).map((link, linkIndex) => ({
      ...link,
      id: link.id ?? `${card.id}-link-${linkIndex}`,
    })),
    tmdlProposals: [...(card.tmdlProposals ?? [])],
    evidenceLinks: [...(card.evidenceLinks ?? [])],
    comments: [...(card.comments ?? [])],
    auditTrail: (card.auditTrail ?? []).map((entry, entryIndex) => ({
      ...entry,
      id: entry.id ?? `${card.id}-audit-${entryIndex}`,
      ticketId: entry.ticketId ?? card.id,
    })),
  }));

  const maxTicketNumber = cards.reduce((max, card) => Math.max(max, card.ticketNumber || 0), 0);

  return {
    cards,
    columnOrder: state?.columnOrder ?? DEFAULT_COLUMN_ORDER,
    nextTicketNumber: state?.nextTicketNumber ?? maxTicketNumber + 1,
    assistantStub: state?.assistantStub ?? {
      provider: "mcp",
      status: "planned",
      serverName: "insight-workbench-mcp",
      endpoint: "http://localhost:7071/mcp",
      promptTemplate:
        "Analyze linked artifacts/entities for this ticket and suggest implementation steps.",
    },
  };
}

function getReportUsageReasonLabel(
  t: ReturnType<typeof useTranslation>["t"],
  usageKind: "direct" | "dependency" | "table"
): string {
  if (usageKind === "direct") {
    return t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Kind_Direct", "Direct field usage");
  }

  if (usageKind === "dependency") {
    return t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Kind_Dependency", "Reached through dependency graph");
  }

  return t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Kind_Table", "Table used by report");
}

const EMPTY_CREATE_FORM = {
  name: "",
  description: "",
  status: "Backlog" as RequirementStatus,
  developer: "",
  dataOwner: "",
  requestor: "",
  project: "",
  assignedUserId: "",
  assignedUserDisplay: "",
};

// ─── Person Combobox ──────────────────────────────────────────────────────────

function PersonCombobox({
  label,
  value,
  users,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  users: BoardUser[];
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Combobox
        value={value}
        placeholder={placeholder ?? "Select or type name"}
        freeform
        onOptionSelect={(_, data) => onChange(data.optionText ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        {users.map((user) => (
          <Option key={user.id} value={user.displayName} text={user.displayName}>
            {user.displayName}
          </Option>
        ))}
      </Combobox>
    </Field>
  );
}

// ─── Ticket Details Section ───────────────────────────────────────────────────

// ─── Searchable Combobox ──────────────────────────────────────────────────────

function SearchableCombobox({
  options,
  selectedValue,
  onSelect,
  placeholder,
  className,
  disabled,
}: {
  options: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [inputText, setInputText] = useState("");
  const selectedLabel = options.find((o) => o.value === selectedValue)?.label ?? "";

  const filteredOptions = useMemo(() => {
    if (!inputText || selectedValue) return options;
    const lc = inputText.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lc));
  }, [options, inputText, selectedValue]);

  useEffect(() => {
    if (!selectedValue) setInputText("");
  }, [selectedValue]);

  return (
    <Combobox
      value={selectedValue ? selectedLabel : inputText}
      selectedOptions={selectedValue ? [selectedValue] : []}
      placeholder={placeholder ?? "Search\u2026"}
      className={className}
      disabled={disabled}
      onOptionSelect={(_, data) => {
        onSelect(data.optionValue ?? "");
        setInputText("");
      }}
      onChange={(e) => {
        setInputText(e.currentTarget.value);
        if (selectedValue) onSelect("");
      }}
    >
      {filteredOptions.map((o) => (
        <Option key={o.value} value={o.value}>{o.label}</Option>
      ))}
    </Combobox>
  );
}

// ─── Ticket Details Section ───────────────────────────────────────────────────

type TicketDraftBase = {
  name: string;
  description?: string;
  status: RequirementStatus;
  developer?: string;
  dataOwner?: string;
  requestor?: string;
  project?: string;
  assignedUserId?: string;
  assignedUserDisplay?: string;
  assignedUser?: { id: string; displayName: string };
  tmdlProposals?: TicketTmdlProposal[];
  evidenceLinks?: TicketEvidenceLink[];
};

function TicketDetailsSection({
  draft,
  users,
  onChange,
  existingProjects,
  showCoreFields = true,
  descriptionReadOnly = false,
  onRequestEditDescription,
  onDoneEditDescription,
  descriptionReadOnlyContent,
  onDescriptionPaste,
  onDescriptionDrop,
}: {
  draft: TicketDraftBase;
  users: BoardUser[];
  existingProjects?: string[];
  onChange: (patch: Partial<TicketDraftBase>) => void;
  showCoreFields?: boolean;
  descriptionReadOnly?: boolean;
  onRequestEditDescription?: () => void;
  onDoneEditDescription?: () => void;
  descriptionReadOnlyContent?: React.ReactNode;
  onDescriptionPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDescriptionDrop?: (event: React.DragEvent<HTMLTextAreaElement>) => void;
}) {
  const { t } = useTranslation();

  const assignedUserDisplay = draft.assignedUserDisplay ?? draft.assignedUser?.displayName ?? "";

  const handleAssignedSelect = (displayName: string) => {
    const matched = users.find((u) => u.displayName === displayName);
    onChange({
      assignedUserId: matched ? matched.id : "",
      assignedUserDisplay: displayName,
    });
  };

  return (
    <div className="insight-workbench-requirements-dialog-grid">
      {showCoreFields ? (
        <>
          <div className="insight-workbench-requirements-dialog-span2">
            <Field
              label={t("InsightWorkbench_RequirementsBoard_New_Name", "Ticket name")}
              required
            >
              <Input
                value={draft.name}
                onChange={(_, data) => onChange({ name: data.value })}
                placeholder={t(
                  "InsightWorkbench_RequirementsBoard_New_Name_Placeholder",
                  "Add requirement title"
                )}
              />
            </Field>
          </div>

          <Field label={t("InsightWorkbench_RequirementsBoard_Field_Project", "Project")}>
            <Combobox
              freeform
              value={draft.project ?? ""}
              placeholder={t("InsightWorkbench_RequirementsBoard_Field_Project_Placeholder", "Project name")}
              onOptionSelect={(_, data) => onChange({ project: data.optionText ?? "" })}
              onChange={(e) => onChange({ project: e.target.value })}
            >
              {(existingProjects ?? []).map((proj) => (
                <Option key={proj} value={proj}>{proj}</Option>
              ))}
            </Combobox>
          </Field>
        </>
      ) : null}

      <Field label={t("InsightWorkbench_RequirementsBoard_Field_Status", "Status")}>
        <Dropdown
          inlinePopup
          selectedOptions={[draft.status]}
          value={STATUS_LABELS[draft.status] ?? draft.status}
          onOptionSelect={(_, data) =>
            onChange({ status: (data.optionValue as RequirementStatus) ?? "Backlog" })
          }
        >
          {DEFAULT_COLUMN_ORDER.map((s) => (
            <Option key={s} value={s}>{STATUS_LABELS[s]}</Option>
          ))}
        </Dropdown>
      </Field>

      <PersonCombobox
        label={t("InsightWorkbench_RequirementsBoard_Field_AssignedUser", "Assigned to")}
        value={assignedUserDisplay}
        users={users}
        onChange={handleAssignedSelect}
        placeholder={t("InsightWorkbench_RequirementsBoard_Field_AssignedUser_Placeholder", "Assign to user")}
      />

      <PersonCombobox
        label={t("InsightWorkbench_RequirementsBoard_Field_Developer", "Developer")}
        value={draft.developer ?? ""}
        users={users}
        onChange={(val) => onChange({ developer: val })}
      />

      <PersonCombobox
        label={t("InsightWorkbench_RequirementsBoard_Field_DataOwner", "Data owner")}
        value={draft.dataOwner ?? ""}
        users={users}
        onChange={(val) => onChange({ dataOwner: val })}
      />

      <PersonCombobox
        label={t("InsightWorkbench_RequirementsBoard_Field_Requestor", "Requestor")}
        value={draft.requestor ?? ""}
        users={users}
        onChange={(val) => onChange({ requestor: val })}
      />

      {showCoreFields ? (
        <div className="insight-workbench-requirements-dialog-span2">
          <Field label={t("InsightWorkbench_RequirementsBoard_New_Description", "Description")}>
            {descriptionReadOnly ? (
              <div className="insight-workbench-requirements-description-read-mode">
                <div className="insight-workbench-requirements-description-read-mode-actions">
                  <Button size="small" appearance="subtle" onClick={onRequestEditDescription}>
                    {t("InsightWorkbench_RequirementsBoard_EditDescription", "Edit")}
                  </Button>
                </div>
                <div className="insight-workbench-requirements-description-read-mode-body">
                  {descriptionReadOnlyContent ?? (
                    <Text size={200}>{(draft.description ?? "").trim() || t("InsightWorkbench_RequirementsBoard_NoDescription", "No description")}</Text>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={(_, data) => onChange({ description: data.value })}
                  onPaste={onDescriptionPaste}
                  onDrop={onDescriptionDrop}
                  resize="vertical"
                  rows={3}
                />
                <div className="insight-workbench-requirements-description-edit-actions">
                  <Button size="small" appearance="subtle" onClick={onDoneEditDescription}>
                    {t("InsightWorkbench_RequirementsBoard_DoneEditingDescription", "Done")}
                  </Button>
                </div>
              </>
            )}
          </Field>
        </div>
      ) : null}
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function RequirementsBoardContent({
  workloadClient,
  item,
  boardState,
  storageSettings,
  onBoardStateChange,
  artifactCatalog,
  onArtifactCatalogChange,
}: {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  boardState?: RequirementsBoardState;
  storageSettings?: RequirementsBoardStorageSettings;
  onBoardStateChange?: (nextState: RequirementsBoardState) => void;
  artifactCatalog?: MetadataArtifactCatalogState;
  onArtifactCatalogChange?: (nextCatalog: MetadataArtifactCatalogState) => void;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const { goBack } = useViewNavigation();
  const {
    selectedModel,
    setSelectedModelFromExplorer,
    entities,
    dependencies,
    loadEntities,
    isLoadingEntities,
    isLoadingReportUsage,
    reportUsageError,
    reportUsageByEntityId,
  } = useSemanticAnalyzerContext();

  const metadataClient = useMemo(() => new MetadataExplorerClient(workloadClient), [workloadClient]);
  const workspaceClient = useMemo(() => new WorkspaceClient(workloadClient), [workloadClient]);
  const cachedArtifacts = useMemo(() => deserializeArtifactCatalog(artifactCatalog), [artifactCatalog]);
  const requirementsBoardStorage = useMemo(
    () => (item?.id && item.workspaceId
      ? new RequirementsBoardStorageService(
        workloadClient,
        { id: item.id, workspaceId: item.workspaceId },
        storageSettings?.mode === "custom" ? storageSettings.oneLakeFilePath : undefined
      )
      : undefined),
    [item?.id, item?.workspaceId, storageSettings?.mode, storageSettings?.oneLakeFilePath, workloadClient]
  );

  // ── Board state ───────────────────────────────────────────────────────────
  const [requirementsBoard, setRequirementsBoard] = useState<RequirementsBoardState>(
    normalizeBoardState(boardState)
  );
  const [hasHydratedBoardStorage, setHasHydratedBoardStorage] = useState(false);
  const persistBoardTimeoutRef = useRef<number | undefined>(undefined);

  const deepLinkState = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const rawTicket = params.get(QUERY_PARAM_REQUIREMENTS_TICKET);
    const parsedTicket = rawTicket !== null ? Number.parseInt(rawTicket, 10) : undefined;
    const ticketNumber =
      parsedTicket !== undefined && Number.isFinite(parsedTicket) && parsedTicket > 0
        ? parsedTicket
        : undefined;
    const rawTab = params.get(QUERY_PARAM_REQUIREMENTS_EDIT_TAB);
    const editTab: EditDialogTab =
      rawTab === "reports"
        ? "reports"
        : rawTab === "semantic-impact"
          ? "semantic-impact"
          : rawTab === "dependencies" || rawTab === "links"
            ? "dependencies"
            : "details";
    const hasExplicitEditTab =
      rawTab === "details"
      || rawTab === "reports"
      || rawTab === "semantic-impact"
      || rawTab === "dependencies"
      || rawTab === "links";

    return {
      ticketNumber,
      hasExplicitEditTab,
      editTab,
    } as const;
  }, [location.search]);

  const syncRequirementsDeepLink = useCallback(
    (next: { ticketNumber?: number; editTab?: EditDialogTab }) => {
      const params = new URLSearchParams(location.search);

      if (next.ticketNumber !== undefined && next.ticketNumber > 0) {
        params.set(QUERY_PARAM_REQUIREMENTS_TICKET, String(next.ticketNumber));
        if (next.editTab && next.editTab !== "details") {
          params.set(QUERY_PARAM_REQUIREMENTS_EDIT_TAB, next.editTab);
        } else {
          params.delete(QUERY_PARAM_REQUIREMENTS_EDIT_TAB);
        }
      } else {
        params.delete(QUERY_PARAM_REQUIREMENTS_TICKET);
        params.delete(QUERY_PARAM_REQUIREMENTS_EDIT_TAB);
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
    const normalized = normalizeBoardState(boardState);
    setRequirementsBoard(normalized);
  }, [boardState]);

  useEffect(() => {
    let cancelled = false;

    const hydrateBoardFromStorage = async (): Promise<void> => {
      if (!requirementsBoardStorage) {
        setHasHydratedBoardStorage(true);
        return;
      }

      setHasHydratedBoardStorage(false);

      try {
        const persistedBoardState = await requirementsBoardStorage.load();
        if (cancelled) {
          return;
        }

        if (persistedBoardState) {
          const normalized = normalizeBoardState(persistedBoardState);
          setRequirementsBoard(normalized);
          onBoardStateChange?.(normalized);
        }
      } catch (error) {
        console.warn("[RequirementsBoard] Failed to hydrate persisted tickets", error);
      } finally {
        if (!cancelled) {
          setHasHydratedBoardStorage(true);
        }
      }

      return;
    };

    void hydrateBoardFromStorage();

    return () => {
      cancelled = true;
    };
  }, [onBoardStateChange, requirementsBoardStorage]);

  useEffect(() => {
    if (requirementsBoardStorage && hasHydratedBoardStorage) {
      if (persistBoardTimeoutRef.current) {
        window.clearTimeout(persistBoardTimeoutRef.current);
      }

      persistBoardTimeoutRef.current = window.setTimeout(() => {
        void requirementsBoardStorage.save(requirementsBoard).catch((error) => {
          console.warn("[RequirementsBoard] Failed to persist tickets to OneLake", error);
        });
      }, 600);
    }

    return () => {
      if (persistBoardTimeoutRef.current) {
        window.clearTimeout(persistBoardTimeoutRef.current);
      }
    };
  }, [hasHydratedBoardStorage, requirementsBoard, requirementsBoardStorage]);

  const saveBoardState = useCallback(
    (updater: (prev: RequirementsBoardState) => RequirementsBoardState) => {
      setRequirementsBoard((prev) => {
        const next = updater(prev);
        onBoardStateChange?.(next);
        return next;
      });
    },
    [onBoardStateChange]
  );

  // ── Workspace users ───────────────────────────────────────────────────────
  const [workspaceUsers, setWorkspaceUsers] = useState<BoardUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentImageUrl, setNewCommentImageUrl] = useState("");
  const [createDescriptionImageUrl, setCreateDescriptionImageUrl] = useState("");
  const [editDescriptionImageUrl, setEditDescriptionImageUrl] = useState("");

  const renderRichTextContent = useCallback((text: string | undefined, textSize: 200 | 300 = 200) => {
    const source = text ?? "";
    if (!source.trim()) {
      return null;
    }

    return (
      <div className="insight-workbench-requirements-rich-content">
        {source.split(/\r?\n/).map((line, index) => {
          const image = tryParseImageLine(line);
          if (image) {
            return (
              <img
                key={`img-${index}-${image.url}`}
                src={image.url}
                alt={image.alt}
                className="insight-workbench-requirements-inline-image"
              />
            );
          }

          if (!line.trim()) {
            return <div key={`br-${index}`} className="insight-workbench-requirements-rich-break" />;
          }

          return <Text key={`txt-${index}`} size={textSize}>{line}</Text>;
        })}
      </div>
    );
  }, []);

  useEffect(() => {
    const detectCurrentUser = async () => {
      try {
        const tokenResponse = await workloadClient.auth.acquireFrontendAccessToken({ scopes: [] });
        const claims = jwt_decode<{ oid?: string; sub?: string }>(tokenResponse.token);
        setCurrentUserId(claims.oid ?? claims.sub ?? null);
      } catch {
        // Silently fail — My tasks filter will be hidden
      }
    };
    void detectCurrentUser();
  }, [workloadClient]);

  const loadWorkspaceUsers = useCallback(async () => {
    const workspaceId = item?.workspaceId;
    if (!workspaceId) return;
    setIsLoadingUsers(true);
    try {
      const assignments = await workspaceClient.getAllWorkspaceRoleAssignments(workspaceId);
      const users: BoardUser[] = [];
      const seen = new Set<string>();
      for (const a of assignments) {
        const p = a.principal;
        if (p?.id && !seen.has(p.id)) {
          seen.add(p.id);
          users.push({ id: p.id, displayName: p.displayName ?? p.id });
        }
      }
      // Fallback: also include people referenced in existing cards
      const boardUsers = requirementsBoard.cards.flatMap((c) => [
        c.assignedUser,
        c.developer ? { id: c.developer, displayName: c.developer } : undefined,
        c.dataOwner ? { id: c.dataOwner, displayName: c.dataOwner } : undefined,
        c.requestor ? { id: c.requestor, displayName: c.requestor } : undefined,
      ]).filter((u): u is BoardUser => !!u?.id && !seen.has(u.id));
      boardUsers.forEach((u) => seen.add(u.id));
      setWorkspaceUsers([...users, ...boardUsers]);
    } catch {
      // Silently degrade — user can type free-form names
    } finally {
      setIsLoadingUsers(false);
    }
  }, [item?.workspaceId, requirementsBoard.cards, workspaceClient]);

  useEffect(() => { void loadWorkspaceUsers(); }, [loadWorkspaceUsers]);

  // ── Artifacts & lineage ───────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<ExplorerArtifact[]>([]);
  const [lineageLinks, setLineageLinks] = useState<LineageLink[]>([]);
  const [isLoadingDeps, setIsLoadingDeps] = useState(true);
  const [depLoadError, setDepLoadError] = useState<string | null>(null);

  const loadDependencyContext = useCallback(async (forceRefresh: boolean = false) => {
    setIsLoadingDeps(true);
    setDepLoadError(null);
    try {
      const artifactsToUse = !forceRefresh && cachedArtifacts.length > 0
        ? cachedArtifacts
        : (await metadataClient.loadArtifacts({ includeTrace: false, maxArtifacts: 0 })).artifacts;
      setArtifacts(artifactsToUse);
      if (forceRefresh || cachedArtifacts.length === 0) {
        onArtifactCatalogChange?.(serializeArtifactCatalog(artifactsToUse, "view-load"));
      }

      const linResp = await metadataClient.loadLineageLinks({ artifacts: artifactsToUse });
      setLineageLinks(linResp.links);
    } catch (err) {
      setDepLoadError(
        `${t("InsightWorkbench_RequirementsBoard_DependencyLoadError", "Failed to load artifact dependency context.")} ${formatApiError(err)}`
      );
    } finally {
      setIsLoadingDeps(false);
    }
  }, [cachedArtifacts, metadataClient, onArtifactCatalogChange, t]);

  useEffect(() => { void loadDependencyContext(); }, [loadDependencyContext]);

  const artifactByCompositeId = useMemo(
    () => new Map(artifacts.map((a) => [`${a.workspaceId}:${a.id}`, a])),
    [artifacts]
  );

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterName, setFilterName] = useState("");
  const [filterAssignedUser, setFilterAssignedUser] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [groupByProject, setGroupByProject] = useState(false);

  const allEntityFilterOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (const art of artifacts) {
      opts.push({ value: `art:${art.workspaceId}:${art.id}`, label: `📦 ${art.displayName}` });
    }
    for (const ent of entities) {
      opts.push({ value: `sem:${ent.id}`, label: `🧩 ${ent.name} (${ent.type})` });
    }
    return opts;
  }, [artifacts, entities]);

  const artifactOptions = useMemo(
    () => artifacts.map((a) => ({ value: `${a.workspaceId}:${a.id}`, label: `${a.displayName} (${a.type}) \u2022 ${a.workspaceName}` })),
    [artifacts]
  );

  const semanticEntityOptions = useMemo(
    () => entities.map((e) => ({ value: e.id, label: `${e.name} (${e.type}${e.tableName ? ` \u2022 ${e.tableName}` : ""})` })),
    [entities]
  );

  const projectOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: string[] = [];
    for (const card of requirementsBoard.cards) {
      if (card.project && !seen.has(card.project)) {
        seen.add(card.project);
        opts.push(card.project);
      }
    }
    return opts.sort();
  }, [requirementsBoard.cards]);

  // ── Filtered cards ────────────────────────────────────────────────────────
  const filteredCardsByStatus = useMemo(() => {
    const groups: Record<RequirementStatus, RequirementCard[]> = {
      Backlog: [], InProgress: [], InReview: [], Done: [],
    };
    for (const card of requirementsBoard.cards) {
      if (filterName && !card.name.toLowerCase().includes(filterName.toLowerCase())) continue;
      if (filterAssignedUser && card.assignedUser?.id !== filterAssignedUser) continue;
      if (filterEntity) {
        const links = card.links ?? [];
        const matches = links.some((link) => {
          if (filterEntity.startsWith("art:")) {
            const comp = filterEntity.slice(4);
            return link.linkType === "artifact" && `${link.workspaceId ?? ""}:${link.entityId}` === comp;
          }
          if (filterEntity.startsWith("sem:")) {
            return link.linkType === "semantic" && `sem:${link.entityId}` === filterEntity;
          }
          return false;
        });
        if (!matches) continue;
        if (filterProject && card.project !== filterProject) continue;
      }
      (groups[card.status] ?? groups.Backlog).push(card);
    }
    Object.values(groups).forEach((g) => g.sort((a, b) => a.ticketNumber - b.ticketNumber));
    return groups;
  }, [requirementsBoard.cards, filterName, filterAssignedUser, filterEntity, filterProject]);

  const columnOrder = requirementsBoard.columnOrder ?? DEFAULT_COLUMN_ORDER;
  const isFiltered = !!(filterName || filterAssignedUser || filterEntity || filterProject);
  const totalShown = Object.values(filteredCardsByStatus).reduce((s, a) => s + a.length, 0);
  const totalAll = requirementsBoard.cards.length;

  // ── Create dialog ─────────────────────────────────────────────────────────
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TicketDraftBase>({ ...EMPTY_CREATE_FORM });

  const [createArtifactType, setCreateArtifactType] = useState<TicketCreateArtifactType>("report");
  const [createArtifactMode, setCreateArtifactMode] = useState<TicketCreateArtifactMode>("change-existing");
  const [createSelectedArtifactId, setCreateSelectedArtifactId] = useState("");
  const [createReportPages, setCreateReportPages] = useState<string[]>([]);
  const [createReportVisuals, setCreateReportVisuals] = useState<string[]>([]);
  const [createReportFilters, setCreateReportFilters] = useState<string[]>([]);
  const [createSemanticEntityIds, setCreateSemanticEntityIds] = useState<string[]>([]);
  const [isLoadingCreateSemanticEntities, setIsLoadingCreateSemanticEntities] = useState(false);
  const [createSemanticLoadError, setCreateSemanticLoadError] = useState<string | null>(null);
  const [isArtifactPickerOpen, setIsArtifactPickerOpen] = useState(false);
  const [isReportTargetPickerOpen, setIsReportTargetPickerOpen] = useState(false);
  const [isSemanticTargetPickerOpen, setIsSemanticTargetPickerOpen] = useState(false);
  const [createArtifactSearchText, setCreateArtifactSearchText] = useState("");
  const [createSemanticSearchText, setCreateSemanticSearchText] = useState("");
  const [createSemanticTypeFilter, setCreateSemanticTypeFilter] = useState<string>("all");
  const [createSemanticGroupBy, setCreateSemanticGroupBy] = useState<SemanticPickerGroupBy>("none");
  const [isLoadingReportTargets, setIsLoadingReportTargets] = useState(false);
  const [reportTargetLoadError, setReportTargetLoadError] = useState<string | null>(null);
  const [reportTargetPageGroups, setReportTargetPageGroups] = useState<Array<{ page: string; visuals: string[] }>>([]);
  const [reportTargetFilters, setReportTargetFilters] = useState<string[]>([]);
  const reportTargetCacheRef = useRef(new Map<string, { pageGroups: Array<{ page: string; visuals: string[] }>; filters: string[] }>());
  const createNameInputRef = useRef<HTMLInputElement | null>(null);

  const restoreCreateDialogFocus = useCallback(() => {
    window.setTimeout(() => {
      createNameInputRef.current?.focus();
    }, 0);
  }, []);

  const filteredArtifactsForCreateType = useMemo(() => {
    const query = createArtifactSearchText.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      if (mapArtifactToCreateType(artifact.type) !== createArtifactType) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [artifact.displayName, artifact.type, artifact.workspaceName, artifact.createdByDisplayName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [artifacts, createArtifactSearchText, createArtifactType]);

  const createSelectedArtifact = useMemo(
    () => artifacts.find((artifact) => `${artifact.workspaceId}:${artifact.id}` === createSelectedArtifactId) ?? null,
    [artifacts, createSelectedArtifactId]
  );

  const pickerArtifacts = useMemo(
    () => (isArtifactPickerOpen ? filteredArtifactsForCreateType : []),
    [filteredArtifactsForCreateType, isArtifactPickerOpen]
  );

  const selectedSemanticEntityOptions = useMemo(
    () => entities.map((entity) => ({ value: entity.id, label: `${entity.name} (${entity.type}${entity.tableName ? ` • ${entity.tableName}` : ""})` })),
    [entities]
  );

  const createSemanticTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const entity of entities) {
      set.add(entity.type);
    }
    return ["all", ...Array.from(set).sort((left, right) => left.localeCompare(right))];
  }, [entities]);

  const filteredSemanticEntities = useMemo(() => {
    if (!isSemanticTargetPickerOpen) {
      return [];
    }

    const query = createSemanticSearchText.trim().toLowerCase();
    return entities
      .filter((entity) => createSemanticTypeFilter === "all" || entity.type === createSemanticTypeFilter)
      .filter((entity) => {
        if (!query) {
          return true;
        }

        return [entity.name, entity.type, entity.tableName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        tableName: entity.tableName,
        label: `${entity.name} (${entity.type}${entity.tableName ? ` • ${entity.tableName}` : ""})`,
      }));
  }, [createSemanticSearchText, createSemanticTypeFilter, entities, isSemanticTargetPickerOpen]);

  const groupedSemanticEntities = useMemo(() => {
    if (!isSemanticTargetPickerOpen) {
      return [] as Array<{ key: string; label: string; entities: typeof filteredSemanticEntities }>;
    }

    if (createSemanticGroupBy === "none") {
      return [{
        key: "all",
        label: t("InsightWorkbench_SemanticAnalyzer_Group_All", "All entities"),
        entities: filteredSemanticEntities,
      }];
    }

    const groups = new Map<string, typeof filteredSemanticEntities>();
    for (const entity of filteredSemanticEntities) {
      const key = createSemanticGroupBy === "table"
        ? (entity.tableName?.trim() || t("InsightWorkbench_SemanticAnalyzer_Group_Unassigned", "Unassigned"))
        : entity.type;
      const current = groups.get(key) ?? [];
      current.push(entity);
      groups.set(key, current);
    }

    return Array.from(groups.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, grouped]) => ({ key, label: key, entities: grouped }));
  }, [createSemanticGroupBy, filteredSemanticEntities, isSemanticTargetPickerOpen, t]);

  const openCreateDialog = () => {
    const currentUserDisplay = currentUserId
      ? (workspaceUsers.find((user) => user.id === currentUserId)?.displayName ?? "")
      : "";
    setCreateForm({
      ...EMPTY_CREATE_FORM,
      requestor: currentUserDisplay || EMPTY_CREATE_FORM.requestor,
    });
    setCreateArtifactType("report");
    setCreateArtifactMode("change-existing");
    setCreateSelectedArtifactId("");
    setCreateReportPages([]);
    setCreateReportVisuals([]);
    setCreateReportFilters([]);
    setCreateSemanticEntityIds([]);
    setIsLoadingCreateSemanticEntities(false);
    setCreateSemanticLoadError(null);
    setIsArtifactPickerOpen(false);
    setIsReportTargetPickerOpen(false);
    setIsSemanticTargetPickerOpen(false);
    setCreateArtifactSearchText("");
    setCreateSemanticSearchText("");
    setCreateSemanticTypeFilter("all");
    setCreateSemanticGroupBy("none");
    setCreateDescriptionImageUrl("");
    setReportTargetPageGroups([]);
    setReportTargetFilters([]);
    setReportTargetLoadError(null);
    setIsCreateOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    if (createArtifactType !== "semantic-model" || createArtifactMode !== "change-existing" || !createSelectedArtifact) {
      setIsLoadingCreateSemanticEntities(false);
      setCreateSemanticLoadError(null);
    } else {
      const desiredModel = {
        id: createSelectedArtifact.id,
        workspaceId: createSelectedArtifact.workspaceId,
        workspaceName: createSelectedArtifact.workspaceName,
        displayName: createSelectedArtifact.displayName,
        type: createSelectedArtifact.type,
      };

      const isDesiredModelSelected =
        selectedModel?.id === desiredModel.id
        && selectedModel?.workspaceId === desiredModel.workspaceId;

      setCreateSemanticLoadError(null);

      if (!isDesiredModelSelected) {
        setIsLoadingCreateSemanticEntities(true);
        setSelectedModelFromExplorer(desiredModel);
      } else if (entities.length > 0) {
        setIsLoadingCreateSemanticEntities(false);
      } else if (isLoadingEntities) {
        setIsLoadingCreateSemanticEntities(true);
      } else {
        setIsLoadingCreateSemanticEntities(true);
        void withTimeout(
          loadEntities(),
          90000,
          t(
            "InsightWorkbench_RequirementsBoard_Create_SemanticTimeout",
            "Loading semantic entities timed out. Please try again."
          )
        )
          .catch((error) => {
            if (!cancelled) {
              setCreateSemanticLoadError(formatApiError(error));
            }
          })
          .finally(() => {
            if (!cancelled) {
              setIsLoadingCreateSemanticEntities(false);
            }
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    createArtifactMode,
    createArtifactType,
    createSelectedArtifact,
    entities.length,
    isLoadingEntities,
    loadEntities,
    selectedModel,
    setSelectedModelFromExplorer,
    t,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadReportTargets = async () => {
      if (createArtifactType !== "report" || createArtifactMode !== "change-existing" || !createSelectedArtifact) {
        setReportTargetPageGroups([]);
        setReportTargetFilters([]);
        setReportTargetLoadError(null);
        setIsLoadingReportTargets(false);
        return;
      }

      const cacheKey = `${createSelectedArtifact.workspaceId}:${createSelectedArtifact.id}`;
      const cachedTargets = reportTargetCacheRef.current.get(cacheKey);
      if (cachedTargets) {
        setReportTargetPageGroups(cachedTargets.pageGroups);
        setReportTargetFilters(cachedTargets.filters);
        setReportTargetLoadError(null);
        setIsLoadingReportTargets(false);
        return;
      }

      setIsLoadingReportTargets(true);
      setReportTargetLoadError(null);
      try {
        const response = await withTimeout(
          metadataClient.loadReportDefinition({
            workspaceId: createSelectedArtifact.workspaceId,
            reportId: createSelectedArtifact.id,
          }),
          90000,
          t(
            "InsightWorkbench_RequirementsBoard_Create_ReportTimeout",
            "Loading report targets timed out. Please try again."
          )
        );
        const parsedParts = parseDefinitionParts(response.definition);
        const hierarchy = buildHierarchy(createSelectedArtifact, parsedParts);
        const table = buildReportJsonTable(parsedParts);

        const hierarchyPageGroups = hierarchy.pages.map((page) => ({
          page: page.name,
          visuals: page.visuals.map((visual) => visual.name || visual.id),
        }));

        const fallbackPageGroups = table
          .map((section) => ({
            page: section.displayName,
            visuals: section.visualGroups.map((group) =>
              group.title || group.name || group.visualType || t("InsightWorkbench_ReportScanner_Visual", "Visual")
            ),
          }))
          .filter((group) => group.visuals.length > 0);

        const nextPageGroups = hierarchyPageGroups.length > 0 ? hierarchyPageGroups : fallbackPageGroups;

        const filters = Array.from(
          new Set(
            table.flatMap((section) =>
              section.visualGroups
                .map((group) => group.filter)
                .filter((value) => value && value.trim().length > 0)
            )
          )
        ).sort((left, right) => left.localeCompare(right));

        if (!cancelled) {
          reportTargetCacheRef.current.set(cacheKey, {
            pageGroups: nextPageGroups,
            filters,
          });
          setReportTargetPageGroups(nextPageGroups);
          setReportTargetFilters(filters);
          if (nextPageGroups.length === 0 && filters.length === 0) {
            setReportTargetLoadError(
              t(
                "InsightWorkbench_RequirementsBoard_Create_ReportTargets_NoTargets",
                "No page, visual, or filter targets were discovered for the selected report."
              )
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          setReportTargetPageGroups([]);
          setReportTargetFilters([]);
          setReportTargetLoadError(formatApiError(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingReportTargets(false);
        }
      }
    };

    void loadReportTargets();

    return () => {
      cancelled = true;
    };
  }, [createArtifactMode, createArtifactType, createSelectedArtifact, metadataClient, t]);

  const patchCreateForm = (patch: Partial<TicketDraftBase>) =>
    setCreateForm((prev) => ({ ...prev, ...patch }));

  const confirmCreate = () => {
    const trimmedName = (createForm.name ?? "").trim();
    const trimmedProject = (createForm.project ?? "").trim();
    if (!trimmedName || !trimmedProject) return;
    if (createArtifactMode === "change-existing" && !createSelectedArtifact) return;

    const workflowLinks: RequirementLink[] = [];
    if (createArtifactMode === "change-existing" && createSelectedArtifact) {
      workflowLinks.push({
        id: createClientId("link-artifact"),
        linkType: "artifact",
        entityId: createSelectedArtifact.id,
        workspaceId: createSelectedArtifact.workspaceId,
        entityType: createSelectedArtifact.type,
        entityDisplayName: createSelectedArtifact.displayName,
      });

      if (createArtifactType === "report") {
        for (const page of createReportPages) {
          workflowLinks.push({
            id: createClientId("link-artifact"),
            linkType: "artifact",
            entityId: `${createSelectedArtifact.id}:page:${page}`,
            workspaceId: createSelectedArtifact.workspaceId,
            entityType: "ReportTarget",
            entityDisplayName: `${createSelectedArtifact.displayName} / Page: ${page}`,
          });
        }
        for (const visualKey of createReportVisuals) {
          const [page, visual] = visualKey.split("::");
          workflowLinks.push({
            id: createClientId("link-artifact"),
            linkType: "artifact",
            entityId: `${createSelectedArtifact.id}:visual:${visualKey}`,
            workspaceId: createSelectedArtifact.workspaceId,
            entityType: "ReportTarget",
            entityDisplayName: `${createSelectedArtifact.displayName} / ${page} / Visual: ${visual}`,
          });
        }
        for (const filterName of createReportFilters) {
          workflowLinks.push({
            id: createClientId("link-artifact"),
            linkType: "artifact",
            entityId: `${createSelectedArtifact.id}:filter:${filterName}`,
            workspaceId: createSelectedArtifact.workspaceId,
            entityType: "ReportTarget",
            entityDisplayName: `${createSelectedArtifact.displayName} / Filter: ${filterName}`,
          });
        }
      }

      if (createArtifactType === "semantic-model") {
        for (const entityId of createSemanticEntityIds) {
          const selectedEntity = entities.find((entity) => entity.id === entityId);
          if (!selectedEntity) continue;
          workflowLinks.push({
            id: createClientId("link-semantic"),
            linkType: "semantic",
            entityId: selectedEntity.id,
            workspaceId: createSelectedArtifact.workspaceId,
            entityType: selectedEntity.type,
            entityDisplayName: selectedEntity.name,
          });
        }
      }
    }

    saveBoardState((prev) => {
      const nextNum = prev.nextTicketNumber ?? prev.cards.length + 1;
      const now = new Date().toISOString();
      const assignedUserId = createForm.assignedUserId ?? "";
      const assignedUserDisplay = createForm.assignedUserDisplay ?? "";
      const newCard: RequirementCard = {
        id: createClientId("req"),
        ticketNumber: nextNum,
        name: trimmedName,
        description: (createForm.description ?? "").trim() || undefined,
        status: createForm.status,
        developer: (createForm.developer ?? "").trim() || undefined,
        dataOwner: (createForm.dataOwner ?? "").trim() || undefined,
        requestor: (createForm.requestor ?? "").trim() || undefined,
        assignedUser:
          assignedUserId
            ? { id: assignedUserId, displayName: assignedUserDisplay }
            : assignedUserDisplay.trim()
            ? { id: assignedUserDisplay, displayName: assignedUserDisplay }
            : undefined,
        createdAt: now,
        updatedAt: now,
        project: trimmedProject || undefined,
        links: workflowLinks,
        auditTrail: [],
      };
      newCard.auditTrail = [
        createTicketAuditEntry(newCard.id, "ticket-created", `Ticket #${newCard.ticketNumber} created`),
      ];
      return { ...prev, cards: [...prev.cards, newCard], nextTicketNumber: nextNum + 1 };
    });
    setIsCreateOpen(false);
  };

  // ── Edit dialog ───────────────────────────────────────────────────────────
  type EditDraft = RequirementCard & { assignedUserId: string; assignedUserDisplay: string };
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editTab, setEditTab] = useState<EditDialogTab>("details");
  const [editArtifactToLink, setEditArtifactToLink] = useState("");
  const [editSemanticToLink, setEditSemanticToLink] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedImpactReportKey, setSelectedImpactReportKey] = useState<string>("");
  const [isLoadingImpactReportTargets, setIsLoadingImpactReportTargets] = useState(false);
  const [impactReportTargetsError, setImpactReportTargetsError] = useState<string | null>(null);
  const [impactReportPageGroups, setImpactReportPageGroups] = useState<Array<{ page: string; visuals: string[] }>>([]);
  const [impactReportFilters, setImpactReportFilters] = useState<string[]>([]);
  const [impactSelectedPages, setImpactSelectedPages] = useState<string[]>([]);
  const [impactSelectedVisuals, setImpactSelectedVisuals] = useState<string[]>([]);
  const [impactSelectedFilters, setImpactSelectedFilters] = useState<string[]>([]);
  const [impactSelectedSemanticEntityIds, setImpactSelectedSemanticEntityIds] = useState<string[]>([]);
  const [impactUnifiedReport, setImpactUnifiedReport] = useState<UnifiedReport | null>(null);
  const [impactPreviewPageIndex, setImpactPreviewPageIndex] = useState<number>(0);
  const impactReportTargetCacheRef = useRef(
    new Map<string, { pageGroups: Array<{ page: string; visuals: string[] }>; filters: string[] }>()
  );

  const closeEditDialog = useCallback(() => {
    syncRequirementsDeepLink({});
    setIsDeleteConfirmOpen(false);
    setEditDraft(null);
    setIsEditingDescription(false);
  }, [syncRequirementsDeepLink]);

  const openEditDialog = useCallback((card: RequirementCard) => {
    setEditDraft({
      ...card,
      links: [...(card.links ?? [])],
      tmdlProposals: [...(card.tmdlProposals ?? [])],
      evidenceLinks: [...(card.evidenceLinks ?? [])],
      comments: [...(card.comments ?? [])],
      assignedUserId: card.assignedUser?.id ?? "",
      assignedUserDisplay: card.assignedUser?.displayName ?? "",
    });
    setEditTab("details");
    setIsEditingDescription(false);
    setEditArtifactToLink("");
    setEditSemanticToLink("");
    setSelectedImpactReportKey("");
    setIsLoadingImpactReportTargets(false);
    setImpactReportTargetsError(null);
    setImpactReportPageGroups([]);
    setImpactReportFilters([]);
    setImpactSelectedPages([]);
    setImpactSelectedVisuals([]);
    setImpactSelectedFilters([]);
    setImpactSelectedSemanticEntityIds([]);
    setImpactUnifiedReport(null);
    setImpactPreviewPageIndex(0);
    setNewCommentText("");
    setNewCommentImageUrl("");
    setEditDescriptionImageUrl("");
  }, []);

  useEffect(() => {
    if (deepLinkState.ticketNumber === undefined || requirementsBoard.cards.length === 0) {
      return;
    }

    if (editDraft?.ticketNumber === deepLinkState.ticketNumber) {
      if (deepLinkState.hasExplicitEditTab && editTab !== deepLinkState.editTab) {
        setEditTab(deepLinkState.editTab);
      }
      return;
    }

    const requestedCard = requirementsBoard.cards.find(
      (card) => card.ticketNumber === deepLinkState.ticketNumber
    );

    if (!requestedCard) {
      return;
    }

    openEditDialog(requestedCard);
    if (deepLinkState.editTab === "dependencies") {
      setEditTab("dependencies");
    }
  }, [
    deepLinkState.editTab,
    deepLinkState.hasExplicitEditTab,
    deepLinkState.ticketNumber,
    editDraft?.ticketNumber,
    editTab,
    openEditDialog,
    requirementsBoard.cards,
  ]);

  useEffect(() => {
    syncRequirementsDeepLink({
      ticketNumber: editDraft?.ticketNumber,
      editTab: editDraft ? editTab : undefined,
    });
  }, [editDraft?.ticketNumber, editTab, editDraft, syncRequirementsDeepLink]);

  const addSelectedSemanticImpactEntitiesToTicket = useCallback(() => {
    if (!editDraft) {
      return;
    }

    for (const entityId of impactSelectedSemanticEntityIds) {
      const entity = entities.find((entry) => entry.id === entityId);
      if (!entity) {
        continue;
      }

      addLinkToEditDraft({
        id: createClientId("link-semantic"),
        linkType: "semantic",
        entityId: entity.id,
        workspaceId: selectedModel?.workspaceId,
        entityType: entity.type,
        entityDisplayName: entity.name,
      });
    }
  }, [addLinkToEditDraft, editDraft, entities, impactSelectedSemanticEntityIds, selectedModel?.workspaceId]);

  const patchEditDraft = (patch: Partial<EditDraft>) =>
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleCreateDescriptionPaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = extractImageFilesFromClipboard(event);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const nextDescription = await appendImageFilesAsMarkdown(createForm.description, imageFiles, "pasted-image");
    patchCreateForm({ description: nextDescription });
  }, [createForm.description]);

  const handleCreateDescriptionDrop = useCallback(async (event: React.DragEvent<HTMLTextAreaElement>) => {
    const imageFiles = extractImageFilesFromDrop(event);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const nextDescription = await appendImageFilesAsMarkdown(createForm.description, imageFiles, "dropped-image");
    patchCreateForm({ description: nextDescription });
  }, [createForm.description]);

  const handleEditDescriptionPaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = extractImageFilesFromClipboard(event);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const markdownBlock = await buildImageMarkdownBlock(imageFiles, "pasted-image");
    setEditDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const trimmed = (prev.description ?? "").trim();
      const separator = trimmed ? "\n" : "";
      return { ...prev, description: `${trimmed}${separator}${markdownBlock}` };
    });
  }, []);

  const handleEditDescriptionDrop = useCallback(async (event: React.DragEvent<HTMLTextAreaElement>) => {
    const imageFiles = extractImageFilesFromDrop(event);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const markdownBlock = await buildImageMarkdownBlock(imageFiles, "dropped-image");
    setEditDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const trimmed = (prev.description ?? "").trim();
      const separator = trimmed ? "\n" : "";
      return { ...prev, description: `${trimmed}${separator}${markdownBlock}` };
    });
  }, []);

  const handleCommentPaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = extractImageFilesFromClipboard(event);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const nextComment = await appendImageFilesAsMarkdown(newCommentText, imageFiles, "pasted-image");
    setNewCommentText(nextComment);
  }, [newCommentText]);

  const handleCommentDrop = useCallback(async (event: React.DragEvent<HTMLTextAreaElement>) => {
    const imageFiles = extractImageFilesFromDrop(event);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    const nextComment = await appendImageFilesAsMarkdown(newCommentText, imageFiles, "dropped-image");
    setNewCommentText(nextComment);
  }, [newCommentText]);

  const addCommentToEditDraft = () => {
    const text = newCommentText.trim();
    if (!text || !editDraft) return;
    const comment: TicketComment = {
      id: createClientId("comment"),
      ticketId: editDraft.id,
      text,
      author: currentUserId
        ? (workspaceUsers.find((u) => u.id === currentUserId)?.displayName ?? "You")
        : "You",
      createdAtUtc: new Date().toISOString(),
    };
    patchEditDraft({
      comments: [...(editDraft.comments ?? []), comment],
      auditTrail: [
        ...(editDraft.auditTrail ?? []),
        createTicketAuditEntry(editDraft.id, "comment-added", `Comment added by ${comment.author ?? "user"}`),
      ],
    });
    setNewCommentText("");
    setNewCommentImageUrl("");
  };

  const saveEdit = () => {
    if (!editDraft) return;
    const { assignedUserId, assignedUserDisplay, ...rest } = editDraft;
    const draftUpdated: RequirementCard = {
      ...rest,
      assignedUser:
        assignedUserId
          ? { id: assignedUserId, displayName: assignedUserDisplay }
          : assignedUserDisplay.trim()
          ? { id: assignedUserDisplay, displayName: assignedUserDisplay }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    saveBoardState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => {
        if (c.id !== draftUpdated.id) {
          return c;
        }

        const previousLinks = c.links ?? [];
        const nextLinks = draftUpdated.links ?? [];

        const linkAddedEntries = nextLinks
          .filter(
            (nextLink) =>
              !previousLinks.some(
                (prevLink) =>
                  prevLink.linkType === nextLink.linkType &&
                  prevLink.entityId === nextLink.entityId &&
                  (prevLink.workspaceId ?? "") === (nextLink.workspaceId ?? "")
              )
          )
          .map((nextLink) => {
            const actionByType: Record<RequirementLink["linkType"], TicketAuditAction> = {
              artifact: "artifact-linked",
              semantic: "semantic-linked",
              lineage: "lineage-linked",
            };
            return createTicketAuditEntry(
              c.id,
              actionByType[nextLink.linkType],
              `${nextLink.linkType} link added: ${nextLink.entityDisplayName ?? nextLink.entityId}`
            );
          });

        const metadataChanged =
          c.name !== draftUpdated.name ||
          (c.description ?? "") !== (draftUpdated.description ?? "") ||
          c.status !== draftUpdated.status ||
          (c.project ?? "") !== (draftUpdated.project ?? "") ||
          (c.developer ?? "") !== (draftUpdated.developer ?? "") ||
          (c.dataOwner ?? "") !== (draftUpdated.dataOwner ?? "") ||
          (c.requestor ?? "") !== (draftUpdated.requestor ?? "") ||
          (c.assignedUser?.id ?? "") !== (draftUpdated.assignedUser?.id ?? "") ||
          (c.assignedUser?.displayName ?? "") !== (draftUpdated.assignedUser?.displayName ?? "");

        const updateEntry = metadataChanged
          ? [createTicketAuditEntry(c.id, "ticket-updated", "Ticket details updated")]
          : [];

        return {
          ...draftUpdated,
          auditTrail: [
            ...(c.auditTrail ?? []),
            ...updateEntry,
            ...linkAddedEntries,
          ],
        };
      }),
    }));
    closeEditDialog();
  };

  const deleteEditCard = () => {
    if (!editDraft) return;
    saveBoardState((prev) => ({
      ...prev,
      cards: prev.cards.filter((c) => c.id !== editDraft.id),
    }));
    closeEditDialog();
  };

  function addLinkToEditDraft(link: RequirementLink): void {
    if (!editDraft) return;
    const exists = (editDraft.links ?? []).some(
      (l) =>
        l.linkType === link.linkType &&
        l.entityId === link.entityId &&
        (l.workspaceId ?? "") === (link.workspaceId ?? "")
    );
    if (exists) return;
    patchEditDraft({ links: [...(editDraft.links ?? []), link] });
  }

  const removeLinkFromEditDraft = (linkId: string) =>
    patchEditDraft({ links: (editDraft?.links ?? []).filter((l) => l.id !== linkId) });

  const addSelectedArtifactLink = () => {
    if (!editDraft || !editArtifactToLink) return;
    const artifact = artifacts.find((a) => `${a.workspaceId}:${a.id}` === editArtifactToLink);
    if (!artifact) return;
    addLinkToEditDraft({
      id: createClientId("link-artifact"),
      linkType: "artifact",
      entityId: artifact.id,
      workspaceId: artifact.workspaceId,
      entityType: artifact.type,
      entityDisplayName: artifact.displayName,
    });
    setEditArtifactToLink("");
  };

  const addSelectedSemanticLink = () => {
    if (!editDraft || !editSemanticToLink) return;
    const entity = entities.find((e) => e.id === editSemanticToLink);
    if (!entity) return;
    addLinkToEditDraft({
      id: createClientId("link-semantic"),
      linkType: "semantic",
      entityId: entity.id,
      workspaceId: selectedModel?.workspaceId,
      entityType: entity.type,
      entityDisplayName: entity.name,
    });
    setEditSemanticToLink("");
  };

  const editDraftArtifactDeps = useMemo(() => {
    if (!editDraft) return [] as Array<{ relationshipType: string; artifact: ExplorerArtifact }>;
    const linkedSet = new Set(
      (editDraft.links ?? [])
        .filter((l) => l.linkType === "artifact")
        .map((l) => `${l.workspaceId ?? ""}:${l.entityId}`)
    );
    const result: Array<{ relationshipType: string; artifact: ExplorerArtifact }> = [];
    const seen = new Set<string>();
    for (const lineage of lineageLinks) {
      const src = `${lineage.sourceWorkspaceId}:${lineage.sourceArtifactId}`;
      const tgt = `${lineage.targetWorkspaceId}:${lineage.targetArtifactId}`;
      if (linkedSet.has(src)) {
        const a = artifactByCompositeId.get(tgt);
        if (a) {
          const key = `${lineage.relationshipType}:${tgt}`;
          if (!seen.has(key)) { seen.add(key); result.push({ relationshipType: lineage.relationshipType, artifact: a }); }
        }
      }
      if (linkedSet.has(tgt)) {
        const a = artifactByCompositeId.get(src);
        if (a) {
          const key = `${lineage.relationshipType}:${src}`;
          if (!seen.has(key)) { seen.add(key); result.push({ relationshipType: lineage.relationshipType, artifact: a }); }
        }
      }
    }
    return result;
  }, [editDraft, lineageLinks, artifactByCompositeId]);

  const editDraftSemanticDeps = useMemo(() => {
    if (!editDraft) return [] as typeof dependencies;
    const linkedIds = new Set(
      (editDraft.links ?? []).filter((l) => l.linkType === "semantic").map((l) => l.entityId)
    );
    if (linkedIds.size === 0) return [] as typeof dependencies;
    return dependencies.filter((d) => linkedIds.has(d.sourceId) || linkedIds.has(d.targetId));
  }, [editDraft, dependencies]);

  const editDraftReportUsage = useMemo(() => {
    if (!editDraft) {
      return [] as TicketReportUsageEntry[];
    }

    const reportMap = new Map<string, TicketReportUsageEntry>();
    const addReport = (
      reportId: string,
      workspaceId: string,
      reportName: string,
      workspaceName: string,
      reason: string
    ) => {
      const key = `${workspaceId}:${reportId}`;
      const current = reportMap.get(key) ?? {
        reportId,
        workspaceId,
        reportName,
        workspaceName,
        reasons: [],
      };

      if (!current.reasons.includes(reason)) {
        current.reasons.push(reason);
      }

      reportMap.set(key, current);
    };

    for (const link of editDraft.links ?? []) {
      if (link.linkType === "semantic") {
        const usage = reportUsageByEntityId[link.entityId];
        if (!usage) {
          continue;
        }

        const entityLabel = link.entityDisplayName ?? link.entityId;
        for (const report of usage.reports) {
          addReport(
            report.reportId,
            report.workspaceId,
            report.reportName,
            report.workspaceName,
            `${entityLabel} • ${getReportUsageReasonLabel(t, report.usageKind)}`
          );
        }
      }

      if (link.linkType === "artifact") {
        const artifactCompositeId = `${link.workspaceId ?? ""}:${link.entityId}`;
        const linkedArtifact = artifactByCompositeId.get(artifactCompositeId);

        if (linkedArtifact && String(linkedArtifact.type).toLowerCase() === "report") {
          addReport(
            linkedArtifact.id,
            linkedArtifact.workspaceId,
            linkedArtifact.displayName,
            linkedArtifact.workspaceName,
            t("InsightWorkbench_RequirementsBoard_ReportUsage_Reason_Artifact", "Linked report artifact")
          );
        }

        for (const lineage of lineageLinks) {
          if (
            lineage.relationshipType === "report-uses-dataset" &&
            `${lineage.targetWorkspaceId}:${lineage.targetArtifactId}` === artifactCompositeId
          ) {
            const reportArtifact = artifactByCompositeId.get(`${lineage.sourceWorkspaceId}:${lineage.sourceArtifactId}`);
            if (reportArtifact) {
              addReport(
                reportArtifact.id,
                reportArtifact.workspaceId,
                reportArtifact.displayName,
                reportArtifact.workspaceName,
                t("InsightWorkbench_RequirementsBoard_ReportUsage_Reason_Lineage", "Lineage: report uses linked artifact")
              );
            }
          }
        }
      }
    }

    return [...reportMap.values()].sort((left, right) => {
      return (
        left.workspaceName.localeCompare(right.workspaceName) ||
        left.reportName.localeCompare(right.reportName) ||
        left.reportId.localeCompare(right.reportId)
      );
    });
  }, [artifactByCompositeId, editDraft, lineageLinks, reportUsageByEntityId, t]);

  const influencedReportOptions = useMemo(() => {
    const reportMap = new Map<string, { key: string; reportId: string; workspaceId: string; reportName: string; workspaceName: string }>();

    for (const report of editDraftReportUsage) {
      const key = `${report.workspaceId}:${report.reportId}`;
      reportMap.set(key, {
        key,
        reportId: report.reportId,
        workspaceId: report.workspaceId,
        reportName: report.reportName,
        workspaceName: report.workspaceName,
      });
    }

    for (const link of editDraft?.links ?? []) {
      if (link.linkType !== "artifact") {
        continue;
      }

      const reportId = link.entityId.split(":")[0];
      const workspaceId = link.workspaceId ?? "";
      if (!reportId || !workspaceId) {
        continue;
      }

      const key = `${workspaceId}:${reportId}`;
      if (reportMap.has(key)) {
        continue;
      }

      const reportArtifact = artifactByCompositeId.get(key);
      reportMap.set(key, {
        key,
        reportId,
        workspaceId,
        reportName: reportArtifact?.displayName ?? (link.entityDisplayName ?? reportId),
        workspaceName: reportArtifact?.workspaceName ?? workspaceId,
      });
    }

    return Array.from(reportMap.values()).sort(
      (left, right) =>
        left.workspaceName.localeCompare(right.workspaceName)
        || left.reportName.localeCompare(right.reportName)
        || left.reportId.localeCompare(right.reportId)
    );
  }, [artifactByCompositeId, editDraft?.links, editDraftReportUsage]);

  const selectedImpactReport = useMemo(
    () => influencedReportOptions.find((report) => report.key === selectedImpactReportKey),
    [influencedReportOptions, selectedImpactReportKey]
  );

  useEffect(() => {
    if (!editDraft) {
      setSelectedImpactReportKey("");
      return;
    }

    if (influencedReportOptions.length === 0) {
      setSelectedImpactReportKey("");
      return;
    }

    const hasCurrent = influencedReportOptions.some((report) => report.key === selectedImpactReportKey);
    if (!hasCurrent) {
      setSelectedImpactReportKey(influencedReportOptions[0].key);
    }
  }, [editDraft, influencedReportOptions, selectedImpactReportKey]);

  useEffect(() => {
    let cancelled = false;

    const loadTargets = async (): Promise<void> => {
      if (!selectedImpactReport) {
        setImpactReportPageGroups([]);
        setImpactReportFilters([]);
        setImpactReportTargetsError(null);
        setIsLoadingImpactReportTargets(false);
        setImpactUnifiedReport(null);
        setImpactPreviewPageIndex(0);
        return;
      }

      const cacheKey = selectedImpactReport.key;
      const cachedTargets = impactReportTargetCacheRef.current.get(cacheKey);
      if (cachedTargets) {
        setImpactReportPageGroups(cachedTargets.pageGroups);
        setImpactReportFilters(cachedTargets.filters);
        setImpactReportTargetsError(null);
        setIsLoadingImpactReportTargets(false);
        setImpactPreviewPageIndex(0);
        return;
      }

      setIsLoadingImpactReportTargets(true);
      setImpactReportTargetsError(null);

      try {
        const response = await withTimeout(
          metadataClient.loadReportDefinition({
            workspaceId: selectedImpactReport.workspaceId,
            reportId: selectedImpactReport.reportId,
          }),
          90000,
          t(
            "InsightWorkbench_RequirementsBoard_ReportImpact_LoadTimeout",
            "Loading report structure timed out. Please try again."
          )
        );

        const parsedParts = parseDefinitionParts(response.definition);
        const unified = buildUnifiedReport(
          {
            id: selectedImpactReport.reportId,
            workspaceId: selectedImpactReport.workspaceId,
            displayName: selectedImpactReport.reportName,
            workspaceName: selectedImpactReport.workspaceName,
            type: "Report",
          } as ExplorerArtifact,
          parsedParts
        );
        const hierarchy = buildHierarchy(
          {
            id: selectedImpactReport.reportId,
            workspaceId: selectedImpactReport.workspaceId,
            displayName: selectedImpactReport.reportName,
            workspaceName: selectedImpactReport.workspaceName,
            type: "Report",
          } as ExplorerArtifact,
          parsedParts
        );
        const table = buildReportJsonTable(parsedParts);

        const hierarchyPageGroups = hierarchy.pages.map((page) => ({
          page: page.name,
          visuals: page.visuals.map((visual) => visual.name || visual.id),
        }));

        const fallbackPageGroups = table
          .map((section) => ({
            page: section.displayName,
            visuals: section.visualGroups.map((group) =>
              group.title || group.name || group.visualType || t("InsightWorkbench_ReportScanner_Visual", "Visual")
            ),
          }))
          .filter((group) => group.visuals.length > 0);

        const nextPageGroups = hierarchyPageGroups.length > 0 ? hierarchyPageGroups : fallbackPageGroups;

        const filters = Array.from(
          new Set(
            table.flatMap((section) =>
              section.visualGroups
                .map((group) => group.filter)
                .filter((value) => value && value.trim().length > 0)
            )
          )
        ).sort((left, right) => left.localeCompare(right));

        if (!cancelled) {
          impactReportTargetCacheRef.current.set(cacheKey, {
            pageGroups: nextPageGroups,
            filters,
          });
          setImpactReportPageGroups(nextPageGroups);
          setImpactReportFilters(filters);
          setImpactUnifiedReport(unified);
          setImpactPreviewPageIndex(0);
        }
      } catch (error) {
        if (!cancelled) {
          setImpactReportPageGroups([]);
          setImpactReportFilters([]);
          setImpactReportTargetsError(formatApiError(error));
          setImpactUnifiedReport(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingImpactReportTargets(false);
        }
      }
    };

    void loadTargets();

    return () => {
      cancelled = true;
    };
  }, [metadataClient, selectedImpactReport, t]);

  useEffect(() => {
    if (!selectedImpactReport || !editDraft) {
      setImpactSelectedPages([]);
      setImpactSelectedVisuals([]);
      setImpactSelectedFilters([]);
      return;
    }

    const reportPrefix = `${selectedImpactReport.reportId}:`;
    const reportLinks = (editDraft.links ?? []).filter(
      (link) => link.linkType === "artifact" && link.workspaceId === selectedImpactReport.workspaceId && link.entityId.startsWith(reportPrefix)
    );

    const pageSelections = new Set<string>();
    const visualSelections = new Set<string>();
    const filterSelections = new Set<string>();

    for (const link of reportLinks) {
      if (link.entityId.startsWith(`${selectedImpactReport.reportId}:page:`)) {
        pageSelections.add(link.entityId.slice(`${selectedImpactReport.reportId}:page:`.length));
      } else if (link.entityId.startsWith(`${selectedImpactReport.reportId}:visual:`)) {
        visualSelections.add(link.entityId.slice(`${selectedImpactReport.reportId}:visual:`.length));
      } else if (link.entityId.startsWith(`${selectedImpactReport.reportId}:filter:`)) {
        filterSelections.add(link.entityId.slice(`${selectedImpactReport.reportId}:filter:`.length));
      }
    }

    setImpactSelectedPages(Array.from(pageSelections));
    setImpactSelectedVisuals(Array.from(visualSelections));
    setImpactSelectedFilters(Array.from(filterSelections));
  }, [editDraft, selectedImpactReport]);

  const addSelectedReportTargetsToTicket = useCallback(() => {
    if (!editDraft || !selectedImpactReport) {
      return;
    }

    for (const page of impactSelectedPages) {
      addLinkToEditDraft({
        id: createClientId("link-artifact"),
        linkType: "artifact",
        entityId: `${selectedImpactReport.reportId}:page:${page}`,
        workspaceId: selectedImpactReport.workspaceId,
        entityType: "ReportTarget",
        entityDisplayName: `${selectedImpactReport.reportName} / Page: ${page}`,
      });
    }

    for (const visualKey of impactSelectedVisuals) {
      const [page, visual] = visualKey.split("::");
      addLinkToEditDraft({
        id: createClientId("link-artifact"),
        linkType: "artifact",
        entityId: `${selectedImpactReport.reportId}:visual:${visualKey}`,
        workspaceId: selectedImpactReport.workspaceId,
        entityType: "ReportTarget",
        entityDisplayName: `${selectedImpactReport.reportName} / ${page ?? "Page"} / Visual: ${visual ?? visualKey}`,
      });
    }

    for (const filterName of impactSelectedFilters) {
      addLinkToEditDraft({
        id: createClientId("link-artifact"),
        linkType: "artifact",
        entityId: `${selectedImpactReport.reportId}:filter:${filterName}`,
        workspaceId: selectedImpactReport.workspaceId,
        entityType: "ReportTarget",
        entityDisplayName: `${selectedImpactReport.reportName} / Filter: ${filterName}`,
      });
    }
  }, [
    addLinkToEditDraft,
    editDraft,
    impactSelectedFilters,
    impactSelectedPages,
    impactSelectedVisuals,
    selectedImpactReport,
  ]);

  const influencedSemanticEntities = useMemo(() => {
    const entityIds = new Set<string>();

    for (const link of editDraft?.links ?? []) {
      if (link.linkType === "semantic") {
        entityIds.add(link.entityId);
      }
    }

    for (const dep of editDraftSemanticDeps) {
      entityIds.add(dep.sourceId);
      entityIds.add(dep.targetId);
    }

    return entities
      .filter((entity) => entityIds.has(entity.id))
      .sort((left, right) =>
        (left.tableName ?? "").localeCompare(right.tableName ?? "")
        || left.name.localeCompare(right.name)
      );
  }, [editDraft?.links, editDraftSemanticDeps, entities]);

  const selectedImpactPreviewPage = useMemo(() => {
    if (!impactUnifiedReport || impactUnifiedReport.pages.length === 0) {
      return undefined;
    }
    const safeIndex = Math.min(Math.max(impactPreviewPageIndex, 0), impactUnifiedReport.pages.length - 1);
    return impactUnifiedReport.pages[safeIndex];
  }, [impactPreviewPageIndex, impactUnifiedReport]);

  const selectedImpactVisualForPreview = useMemo(() => {
    if (!selectedImpactPreviewPage) {
      return undefined;
    }

    const visualKey = impactSelectedVisuals.find((entry) => entry.startsWith(`${selectedImpactPreviewPage.name}::`));
    if (!visualKey) {
      return undefined;
    }

    const [, visualName] = visualKey.split("::");
    return visualName;
  }, [impactSelectedVisuals, selectedImpactPreviewPage]);

  const groupedLinkedEntities = useMemo(() => {
    type GroupedItem = {
      key: string;
      parentLabel: string;
      parentMeta: string;
      icon: React.ReactNode;
      iconLabel: string;
      children: Array<{ linkId: string; label: string; meta: string; category: "Page" | "Visual" | "Filter" | "Entity" }>;
      standaloneLinkId?: string;
    };

    const groups = new Map<string, GroupedItem>();

    for (const link of editDraft?.links ?? []) {
      const { icon, label: iconLabel } = getRequirementLinkIcon(link);

      if (link.linkType === "artifact") {
        const parts = link.entityId.split(":");
        const reportId = parts[0] ?? "";
        const scope = parts[1] ?? "";
        const workspaceId = link.workspaceId ?? "";
        const reportArtifact = reportId && workspaceId ? artifactByCompositeId.get(`${workspaceId}:${reportId}`) : undefined;
        const reportName = reportArtifact?.displayName ?? link.entityDisplayName ?? reportId;

        if (reportId && (scope === "page" || scope === "visual" || scope === "filter")) {
          const groupKey = `report:${workspaceId}:${reportId}`;
          const current = groups.get(groupKey) ?? {
            key: groupKey,
            parentLabel: reportName,
            parentMeta: `${t("InsightWorkbench_RequirementsBoard_Report_Label", "Report")} • ${workspaceId}`,
            icon,
            iconLabel,
            children: [],
          };

          if (scope === "page") {
            const page = parts.slice(2).join(":");
            current.children.push({
              linkId: link.id,
              label: page,
              meta: t("InsightWorkbench_RequirementsBoard_ReportPages", "Pages"),
              category: "Page",
            });
          } else if (scope === "visual") {
            const visualToken = parts.slice(2).join(":");
            const [page, visual] = visualToken.split("::");
            current.children.push({
              linkId: link.id,
              label: visual ? `${visual}` : visualToken,
              meta: page
                ? t("InsightWorkbench_RequirementsBoard_VisualInPage", "Visual in {{page}}", { page })
                : t("InsightWorkbench_RequirementsBoard_ReportVisuals", "Visuals"),
              category: "Visual",
            });
          } else {
            const filterName = parts.slice(2).join(":");
            current.children.push({
              linkId: link.id,
              label: filterName,
              meta: t("InsightWorkbench_RequirementsBoard_ReportFilters", "Filters"),
              category: "Filter",
            });
          }

          groups.set(groupKey, current);
          continue;
        }

        const isReportRoot = reportId && reportId === link.entityId && (String(link.entityType ?? "").toLowerCase().includes("report") || !!reportArtifact);
        if (isReportRoot) {
          const groupKey = `report:${workspaceId}:${reportId}`;
          const current = groups.get(groupKey) ?? {
            key: groupKey,
            parentLabel: reportName,
            parentMeta: `${t("InsightWorkbench_RequirementsBoard_Report_Label", "Report")} • ${workspaceId}`,
            icon,
            iconLabel,
            children: [],
          };
          current.standaloneLinkId = current.standaloneLinkId ?? link.id;
          groups.set(groupKey, current);
          continue;
        }
      }

      if (link.linkType === "semantic") {
        const semanticScope = link.workspaceId ?? selectedModel?.workspaceId ?? "semantic";
        const groupKey = `semantic:${semanticScope}`;
        const current = groups.get(groupKey) ?? {
          key: groupKey,
          parentLabel: selectedModel?.displayName ?? t("InsightWorkbench_RequirementsBoard_SemanticModel", "Semantic model"),
          parentMeta: t("InsightWorkbench_RequirementsBoard_SemanticModel_Label", "Semantic model"),
          icon,
          iconLabel,
          children: [],
        };

        current.children.push({
          linkId: link.id,
          label: link.entityDisplayName ?? link.entityId,
          meta: link.entityType ?? t("InsightWorkbench_SemanticAnalyzer_Filter_EntityType", "Entity type"),
          category: "Entity",
        });
        groups.set(groupKey, current);
        continue;
      }

      const standaloneKey = `single:${link.id}`;
      groups.set(standaloneKey, {
        key: standaloneKey,
        parentLabel: link.entityDisplayName ?? link.entityId,
        parentMeta: `${link.linkType}${link.entityType ? ` • ${link.entityType}` : ""}`,
        icon,
        iconLabel,
        children: [],
        standaloneLinkId: link.id,
      });
    }

    return Array.from(groups.values()).sort((left, right) => left.parentLabel.localeCompare(right.parentLabel));
  }, [artifactByCompositeId, editDraft?.links, selectedModel?.displayName, selectedModel?.workspaceId, t]);

  const impactOverview = useMemo(() => {
    const reportGroups = groupedLinkedEntities.filter((group) => group.key.startsWith("report:"));
    const semanticGroups = groupedLinkedEntities.filter((group) => group.key.startsWith("semantic:"));

    let reportPageCount = 0;
    let reportVisualCount = 0;
    let reportFilterCount = 0;
    let semanticEntityCount = 0;

    for (const group of groupedLinkedEntities) {
      for (const child of group.children) {
        if (child.category === "Page") {
          reportPageCount += 1;
        } else if (child.category === "Visual") {
          reportVisualCount += 1;
        } else if (child.category === "Filter") {
          reportFilterCount += 1;
        } else if (child.category === "Entity") {
          semanticEntityCount += 1;
        }
      }
    }

    return {
      reportCount: reportGroups.length,
      semanticModelCount: semanticGroups.length,
      reportPageCount,
      reportVisualCount,
      reportFilterCount,
      semanticEntityCount,
      artifactDependencyCount: editDraftArtifactDeps.length,
      semanticDependencyCount: editDraftSemanticDeps.length,
      reportUsageCount: editDraftReportUsage.length,
    };
  }, [editDraftArtifactDeps.length, editDraftReportUsage.length, editDraftSemanticDeps.length, groupedLinkedEntities]);

  const impactTodoSuggestions = useMemo(() => {
    return [
      {
        key: "report-targets",
        label: t("InsightWorkbench_RequirementsBoard_Todo_ReportTargets", "Identify impacted report pages, visuals, and filters"),
        done: impactOverview.reportPageCount + impactOverview.reportVisualCount + impactOverview.reportFilterCount > 0,
      },
      {
        key: "semantic-entities",
        label: t("InsightWorkbench_RequirementsBoard_Todo_SemanticEntities", "Identify impacted semantic entities (tables/measures/columns)"),
        done: impactOverview.semanticEntityCount > 0,
      },
      {
        key: "lineage-check",
        label: t("InsightWorkbench_RequirementsBoard_Todo_Lineage", "Review downstream/upstream artifact dependencies"),
        done: impactOverview.artifactDependencyCount > 0 || impactOverview.semanticDependencyCount > 0,
      },
      {
        key: "usage-validation",
        label: t("InsightWorkbench_RequirementsBoard_Todo_ReportUsage", "Validate which reports are affected by semantic changes"),
        done: impactOverview.reportUsageCount > 0,
      },
    ];
  }, [
    impactOverview.artifactDependencyCount,
    impactOverview.reportFilterCount,
    impactOverview.reportPageCount,
    impactOverview.reportUsageCount,
    impactOverview.reportVisualCount,
    impactOverview.semanticDependencyCount,
    impactOverview.semanticEntityCount,
    t,
  ]);

  const editDraftExistingConnectionsByEntity = useMemo(() => {
    if (!editDraft) {
      return [] as Array<{ linkId: string; label: string; linkType: RequirementLink["linkType"]; entityType: string; connections: string[] }>;
    }

    const sections: Array<{ linkId: string; label: string; linkType: RequirementLink["linkType"]; entityType: string; connections: string[] }> = [];

    for (const link of editDraft.links ?? []) {
      const label = link.entityDisplayName ?? link.entityId;
      const connections: string[] = [];

      if (link.linkType === "artifact") {
        const composite = `${link.workspaceId ?? ""}:${link.entityId}`;
        for (const lineage of lineageLinks) {
          const src = `${lineage.sourceWorkspaceId}:${lineage.sourceArtifactId}`;
          const tgt = `${lineage.targetWorkspaceId}:${lineage.targetArtifactId}`;

          if (src === composite) {
            const related = artifactByCompositeId.get(tgt);
            if (related) {
              connections.push(`Upstream: ${related.displayName} (${lineage.relationshipType})`);
            }
          }

          if (tgt === composite) {
            const related = artifactByCompositeId.get(src);
            if (related) {
              connections.push(`Downstream: ${related.displayName} (${lineage.relationshipType})`);
            }
          }
        }
      }

      if (link.linkType === "semantic") {
        for (const dep of dependencies) {
          if (dep.sourceId === link.entityId) {
            connections.push(`Depends on: ${dep.targetName} (${dep.dependencyType})`);
          } else if (dep.targetId === link.entityId) {
            connections.push(`Depended by: ${dep.sourceName} (${dep.dependencyType})`);
          }
        }

        const usage = reportUsageByEntityId[link.entityId];
        for (const report of usage?.reports ?? []) {
          connections.push(`Used by report: ${report.reportName} (${getReportUsageReasonLabel(t, report.usageKind)})`);
        }
      }

      sections.push({
        linkId: link.id,
        label,
        linkType: link.linkType,
        entityType: link.entityType ?? (link.linkType === "semantic" ? "Semantic" : "Artifact"),
        connections: Array.from(new Set(connections)),
      });
    }

    return sections;
  }, [artifactByCompositeId, dependencies, editDraft, lineageLinks, reportUsageByEntityId, t]);

  const editDraftExistingConnectionsByType = useMemo(() => {
    const groups = new Map<string, typeof editDraftExistingConnectionsByEntity>();

    for (const section of editDraftExistingConnectionsByEntity) {
      const groupKey = section.entityType || "Unknown";
      const current = groups.get(groupKey) ?? [];
      current.push(section);
      groups.set(groupKey, current);
    }

    return Array.from(groups.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([entityType, entries]) => ({
        entityType,
        entries: entries.sort((left, right) => left.label.localeCompare(right.label)),
      }));
  }, [editDraftExistingConnectionsByEntity]);

  // ── Move card from board column ───────────────────────────────────────────
  const moveCardStatus = (card: RequirementCard, status: RequirementStatus) => {
    if (card.status === status) return;
    saveBoardState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id
          ? {
              ...c,
              status,
              updatedAt: new Date().toISOString(),
              auditTrail: [
                ...(c.auditTrail ?? []),
                createTicketAuditEntry(c.id, "ticket-moved", `Status changed to ${status}`),
              ],
            }
          : c
      ),
    }));
  };

  // ── Assistant stub ────────────────────────────────────────────────────────
  const prepareAssistantStub = () => {
    saveBoardState((prev) => ({
      ...prev,
      assistantStub: {
        ...prev.assistantStub,
        provider: "mcp",
        status: "configured",
        serverName: prev.assistantStub?.serverName ?? "insight-workbench-mcp",
        endpoint: prev.assistantStub?.endpoint ?? "http://localhost:7071/mcp",
        promptTemplate:
          prev.assistantStub?.promptTemplate ??
          "Analyze linked artifacts/entities for this ticket and suggest implementation steps.",
        lastPreparedAt: new Date().toISOString(),
      },
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="insight-workbench-view">

      {/* Header */}
      <div className="insight-workbench-requirements-header">
        <div>
          <h2 className="insight-workbench-section-title">
            {t("InsightWorkbench_RequirementsBoard_Label", "Requirements Board")}
          </h2>
          <Text>
            {t(
              "InsightWorkbench_RequirementsBoard_Intro",
              "Track requirement tickets in a Kanban workflow and link them to artifacts, semantic entities, and dependencies."
            )}
          </Text>
        </div>
        <div className="insight-workbench-requirements-header-actions">
          {artifactCatalog?.lastRefreshedAtUtc ? (
            <Badge appearance="outline">
              {t("InsightWorkbench_RequirementsBoard_LastRefreshed", "Refreshed {{time}}", {
                time: new Date(artifactCatalog.lastRefreshedAtUtc).toLocaleString(),
              })}
            </Badge>
          ) : null}
          <Button appearance="secondary" onClick={() => { void loadDependencyContext(true); }}>
            {t("InsightWorkbench_RequirementsBoard_RefreshMetadata", "Refresh metadata")}
          </Button>
          <Button appearance="primary" onClick={openCreateDialog}>
            {t("InsightWorkbench_RequirementsBoard_NewTicket", "+ New ticket")}
          </Button>
          <Button appearance="subtle" onClick={goBack}>
            {t("InsightWorkbench_BackToHub", "← Back to Hub")}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="insight-workbench-requirements-filterbar">
        <Field label={t("InsightWorkbench_RequirementsBoard_Filter_Name", "Ticket name")}>
          <Input
            value={filterName}
            onChange={(_, data) => setFilterName(data.value)}
            placeholder={t("InsightWorkbench_RequirementsBoard_Filter_Name_Placeholder", "Filter by name…")}
            contentAfter={
              filterName ? (
                <Button appearance="transparent" size="small" onClick={() => setFilterName("")} aria-label="Clear">✕</Button>
              ) : undefined
            }
          />
        </Field>

        <Field label={t("InsightWorkbench_RequirementsBoard_Filter_AssignedUser", "Assigned to")}>
          <Dropdown
            selectedOptions={filterAssignedUser ? [filterAssignedUser] : [""]}
            value={
              filterAssignedUser
                ? workspaceUsers.find((u) => u.id === filterAssignedUser)?.displayName ?? filterAssignedUser
                : t("InsightWorkbench_RequirementsBoard_Filter_All", "All")
            }
            onOptionSelect={(_, data) =>
              setFilterAssignedUser(data.optionValue === "" ? "" : data.optionValue ?? "")
            }
          >
            <Option value="">{t("InsightWorkbench_RequirementsBoard_Filter_All", "All")}</Option>
            {isLoadingUsers ? (
              <Option value="" disabled>{t("InsightWorkbench_RequirementsBoard_LoadingUsers", "Loading users…")}</Option>
            ) : (
              workspaceUsers.map((user) => (
                <Option key={user.id} value={user.id}>{user.displayName}</Option>
              ))
            )}
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_RequirementsBoard_Filter_Entity", "Linked entity")}>
          <Dropdown
            selectedOptions={filterEntity ? [filterEntity] : [""]}
            value={
              filterEntity
                ? allEntityFilterOptions.find((o) => o.value === filterEntity)?.label ?? filterEntity
                : t("InsightWorkbench_RequirementsBoard_Filter_All", "All")
            }
            onOptionSelect={(_, data) =>
              setFilterEntity(data.optionValue === "" ? "" : data.optionValue ?? "")
            }
          >
            <Option value="">{t("InsightWorkbench_RequirementsBoard_Filter_All", "All")}</Option>
            {allEntityFilterOptions.map((opt) => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Dropdown>
        </Field>

        <Field label={t("InsightWorkbench_RequirementsBoard_Filter_Project", "Project")}>
          <Dropdown
            selectedOptions={filterProject ? [filterProject] : [""]}
            value={filterProject || t("InsightWorkbench_RequirementsBoard_Filter_All", "All")}
            onOptionSelect={(_, data) =>
              setFilterProject(data.optionValue === "" ? "" : data.optionValue ?? "")
            }
          >
            <Option value="">{t("InsightWorkbench_RequirementsBoard_Filter_All", "All")}</Option>
            {projectOptions.map((proj) => (
              <Option key={proj} value={proj}>{proj}</Option>
            ))}
          </Dropdown>
        </Field>

        <div className="insight-workbench-requirements-filterbar-quick-actions">
          {currentUserId ? (
            <Button
              appearance={filterAssignedUser === currentUserId ? "primary" : "secondary"}
              size="small"
              onClick={() =>
                setFilterAssignedUser((prev) => (prev === currentUserId ? "" : (currentUserId ?? "")))
              }
            >
              {t("InsightWorkbench_RequirementsBoard_Filter_MyTasks", "My tasks")}
            </Button>
          ) : null}
        </div>

        <div className="insight-workbench-requirements-groupby">
          <Button
            appearance={groupByProject ? "primary" : "secondary"}
            size="small"
            onClick={() => setGroupByProject((prev) => !prev)}
          >
            {groupByProject
              ? t("InsightWorkbench_RequirementsBoard_GroupBy_Status", "By status")
              : t("InsightWorkbench_RequirementsBoard_GroupBy_Project", "Group by project")}
          </Button>
        </div>

        {isFiltered ? (
          <div className="insight-workbench-requirements-filterbar-summary">
            <Text size={200}>
              {t("InsightWorkbench_RequirementsBoard_Filter_Showing", "Showing {{shown}} of {{total}}", {
                shown: totalShown,
                total: totalAll,
              })}
            </Text>
            <Button
              appearance="transparent"
              size="small"
              onClick={() => { setFilterName(""); setFilterAssignedUser(""); setFilterEntity(""); setFilterProject(""); }}
            >
              {t("InsightWorkbench_RequirementsBoard_Filter_ClearAll", "Clear all filters")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(_, data) => setIsCreateOpen(data.open)}>
        <DialogSurface className="insight-workbench-requirements-dialog-surface">
          <DialogBody>
            <DialogTitle>
              {t("InsightWorkbench_RequirementsBoard_CreateDialog_Title", "New requirement")}
            </DialogTitle>
            <DialogContent className="insight-workbench-requirements-create-content">
              <div className="insight-workbench-requirements-links">
                <div className="insight-workbench-requirements-dialog-grid">
                  <div className="insight-workbench-requirements-dialog-span2">
                    <Field label={t("InsightWorkbench_RequirementsBoard_New_Name", "Ticket name")} required>
                      <Input
                        ref={createNameInputRef}
                        value={createForm.name ?? ""}
                        onChange={(_, data) => patchCreateForm({ name: data.value })}
                        placeholder={t("InsightWorkbench_RequirementsBoard_New_Name_Placeholder", "Add requirement title")}
                      />
                    </Field>
                  </div>

                  <Field label={t("InsightWorkbench_RequirementsBoard_Field_Project", "Project")} required>
                    <Combobox
                      freeform
                      value={createForm.project ?? ""}
                      placeholder={t("InsightWorkbench_RequirementsBoard_Field_Project_Placeholder", "Project name")}
                      onOptionSelect={(_, data) => patchCreateForm({ project: data.optionText ?? "" })}
                      onChange={(e) => patchCreateForm({ project: e.target.value })}
                    >
                      {projectOptions.map((proj) => (
                        <Option key={proj} value={proj}>{proj}</Option>
                      ))}
                    </Combobox>
                  </Field>

                  <Field label={t("InsightWorkbench_RequirementsBoard_Create_ArtifactType", "Fabric artifact type")}>
                    <Dropdown
                      inlinePopup
                      selectedOptions={[createArtifactType]}
                      value={CREATE_ARTIFACT_TYPE_OPTIONS.find((option) => option.value === createArtifactType)?.label ?? ""}
                      onOptionSelect={(_, data) => {
                        const next = (data.optionValue as TicketCreateArtifactType) ?? "report";
                        setCreateArtifactType(next);
                        setCreateSelectedArtifactId("");
                        setCreateReportPages([]);
                        setCreateReportVisuals([]);
                        setCreateReportFilters([]);
                        setCreateSemanticEntityIds([]);
                        setCreateSemanticSearchText("");
                        setCreateSemanticTypeFilter("all");
                        setCreateSemanticGroupBy("none");
                      }}
                    >
                      {CREATE_ARTIFACT_TYPE_OPTIONS.map((option) => (
                        <Option key={option.value} value={option.value}>{option.label}</Option>
                      ))}
                    </Dropdown>
                  </Field>

                  <Field label={t("InsightWorkbench_RequirementsBoard_Create_ArtifactMode", "Action")}>
                    <Dropdown
                      inlinePopup
                      selectedOptions={[createArtifactMode]}
                      value={createArtifactMode === "create-new"
                        ? t("InsightWorkbench_RequirementsBoard_Create_ArtifactMode_New", "Create new")
                        : t("InsightWorkbench_RequirementsBoard_Create_ArtifactMode_Change", "Change existing")}
                      onOptionSelect={(_, data) => {
                        const nextMode = (data.optionValue as TicketCreateArtifactMode) ?? "change-existing";
                        setCreateArtifactMode(nextMode);
                        if (nextMode === "create-new") {
                          setCreateSelectedArtifactId("");
                          setCreateReportPages([]);
                          setCreateReportVisuals([]);
                          setCreateReportFilters([]);
                          setCreateSemanticEntityIds([]);
                          setCreateSemanticSearchText("");
                          setCreateSemanticTypeFilter("all");
                          setCreateSemanticGroupBy("none");
                        }
                      }}
                    >
                      <Option value="change-existing">{t("InsightWorkbench_RequirementsBoard_Create_ArtifactMode_Change", "Change existing")}</Option>
                      <Option value="create-new">{t("InsightWorkbench_RequirementsBoard_Create_ArtifactMode_New", "Create new")}</Option>
                    </Dropdown>
                  </Field>

                  {createArtifactMode === "change-existing" ? (
                    <>
                      <div className="insight-workbench-requirements-dialog-span2">
                        <Field label={t("InsightWorkbench_RequirementsBoard_Create_SelectArtifact", "Select artifact")} required>
                          <div className="insight-workbench-requirements-link-add-row">
                            <Input
                              readOnly
                              value={createSelectedArtifact
                                ? `${createSelectedArtifact.displayName} (${createSelectedArtifact.type}) • ${createSelectedArtifact.workspaceName}`
                                : ""}
                              placeholder={t("InsightWorkbench_RequirementsBoard_Create_SelectArtifact_Placeholder", "Pick an artifact from the list")}
                            />
                            <Button appearance="secondary" onClick={() => setIsArtifactPickerOpen(true)}>
                              {t("InsightWorkbench_RequirementsBoard_Create_BrowseArtifacts", "Browse")}
                            </Button>
                          </div>
                        </Field>
                      </div>

                      {createArtifactType === "report" ? (
                        <div className="insight-workbench-requirements-dialog-span2">
                          <Field label={t("InsightWorkbench_RequirementsBoard_Create_ReportTargets", "Page / Visual / Filter")}>
                            <div className="insight-workbench-requirements-link-add-row">
                              <Input
                                readOnly
                                value={isLoadingReportTargets
                                  ? t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Loading", "Loading...")
                                  : `${createReportPages.length} pages, ${createReportVisuals.length} visuals, ${createReportFilters.length} filters selected`}
                                placeholder={t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Placeholder", "Select page, visual, or filter")}
                              />
                              <Button appearance="secondary" disabled={!createSelectedArtifact || isLoadingReportTargets} onClick={() => setIsReportTargetPickerOpen(true)}>
                                {t("InsightWorkbench_RequirementsBoard_Create_BrowseTargets", "Browse")}
                              </Button>
                            </div>
                          </Field>
                          {reportTargetLoadError ? (
                            <Text size={200} style={{ color: "var(--colorPaletteRedForeground1)" }}>
                              {reportTargetLoadError}
                            </Text>
                          ) : null}
                        </div>
                      ) : null}

                      {createArtifactType === "semantic-model" ? (
                        <div className="insight-workbench-requirements-dialog-span2">
                          <Field label={t("InsightWorkbench_RequirementsBoard_Create_SemanticTargets", "Semantic entities (optional)")}>
                            <div className="insight-workbench-requirements-link-add-row">
                              <Input
                                readOnly
                                value={isLoadingCreateSemanticEntities
                                  ? t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Loading", "Loading...")
                                  : `${createSemanticEntityIds.length} selected`}
                                placeholder={t("InsightWorkbench_RequirementsBoard_Create_SemanticTargets_Placeholder", "None selected")}
                              />
                              <Button
                                appearance="secondary"
                                disabled={isLoadingCreateSemanticEntities || !createSelectedArtifact || selectedSemanticEntityOptions.length === 0}
                                onClick={() => setIsSemanticTargetPickerOpen(true)}
                              >
                                {t("InsightWorkbench_RequirementsBoard_Create_BrowseTargets", "Browse")}
                              </Button>
                            </div>
                          </Field>
                          {isLoadingCreateSemanticEntities ? (
                            <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                              {t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Loading", "Loading...")}
                            </Text>
                          ) : createSemanticLoadError ? (
                            <Text size={200} style={{ color: "var(--colorPaletteRedForeground1)" }}>
                              {createSemanticLoadError}
                            </Text>
                          ) : !createSelectedArtifact ? (
                            <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                              {t("InsightWorkbench_RequirementsBoard_Create_SemanticHint_SelectArtifact", "Select a semantic model artifact first.")}
                            </Text>
                          ) : selectedSemanticEntityOptions.length === 0 ? (
                            <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                              {t("InsightWorkbench_RequirementsBoard_Create_SemanticHint_LoadEmpty", "No semantic entities found yet. Try reloading Semantic Analyzer entities.")}
                            </Text>
                          ) : null}
                        </div>
                      ) : null}

                      {createArtifactType === "data-store" || createArtifactType === "data-loading" ? (
                        <div className="insight-workbench-requirements-dialog-span2">
                          <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                            {t("InsightWorkbench_RequirementsBoard_Create_TargetPlaceholder", "Target-level selectors for this artifact type are placeholders for now.")}
                          </Text>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="insight-workbench-requirements-dialog-span2">
                    <Field label={t("InsightWorkbench_RequirementsBoard_New_Description", "Description")}>
                      <Textarea
                        value={createForm.description ?? ""}
                        onChange={(_, data) => patchCreateForm({ description: data.value })}
                        onPaste={handleCreateDescriptionPaste}
                        onDrop={handleCreateDescriptionDrop}
                        resize="vertical"
                        rows={3}
                      />
                    </Field>
                    <div className="insight-workbench-requirements-link-add-row">
                      <Input
                        value={createDescriptionImageUrl}
                        onChange={(_, data) => setCreateDescriptionImageUrl(data.value)}
                        placeholder={t("InsightWorkbench_RequirementsBoard_ImageUrl_Placeholder", "Image URL (https://...)")}
                      />
                      <Button
                        appearance="secondary"
                        onClick={() => {
                          patchCreateForm({ description: appendImageMarkdown(createForm.description, createDescriptionImageUrl) });
                          setCreateDescriptionImageUrl("");
                        }}
                        disabled={!createDescriptionImageUrl.trim()}
                      >
                        {t("InsightWorkbench_RequirementsBoard_InsertImage", "Insert image")}
                      </Button>
                    </div>
                  </div>
                </div>

                <Divider />
                <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_AdditionalInfo", "Additional info")}</Text>
                <TicketDetailsSection
                  draft={createForm}
                  users={workspaceUsers}
                  existingProjects={projectOptions}
                  onChange={patchCreateForm}
                  showCoreFields={false}
                />
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                onClick={confirmCreate}
                disabled={
                  !(createForm.name ?? "").trim()
                  || !(createForm.project ?? "").trim()
                  || (createArtifactMode === "change-existing" && !createSelectedArtifactId)
                }
              >
                {t("InsightWorkbench_RequirementsBoard_CreateTicket", "Create ticket")}
              </Button>
              <Button appearance="secondary" onClick={() => setIsCreateOpen(false)}>
                {t("InsightWorkbench_Cancel", "Cancel")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        modalType="non-modal"
        open={isArtifactPickerOpen}
        onOpenChange={(_, data) => {
          setIsArtifactPickerOpen(data.open);
          if (!data.open) {
            restoreCreateDialogFocus();
          }
        }}
      >
        <DialogSurface className="insight-workbench-requirements-dialog-surface insight-workbench-requirements-dialog-surface--wide">
          <DialogBody>
            <DialogTitle>
              {t("InsightWorkbench_RequirementsBoard_Create_ArtifactPicker_Title", "Select artifact")}
            </DialogTitle>
            <DialogContent>
              <Field label={t("InsightWorkbench_SemanticAnalyzer_Search_Label", "Search")}>
                <Input
                  value={createArtifactSearchText}
                  onChange={(_, data) => setCreateArtifactSearchText(data.value)}
                  placeholder={t("InsightWorkbench_RequirementsBoard_Create_ArtifactSearch_Placeholder", "Search artifacts")}
                />
              </Field>
              <div className="insight-workbench-requirements-artifact-picker-table">
                <div className="insight-workbench-requirements-artifact-picker-row insight-workbench-requirements-artifact-picker-row--header">
                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Col_Name", "Name")}</Text>
                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Col_Type", "Type")}</Text>
                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Col_Workspace", "Workspace")}</Text>
                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Col_Owner", "Owner")}</Text>
                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Col_Access", "Access")}</Text>
                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Col_Synced", "Last sync")}</Text>
                </div>
                {pickerArtifacts.length === 0 ? (
                  <div className="insight-workbench-requirements-artifact-picker-empty">
                    <Text size={200}>{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Empty", "No artifacts found for the selected type.")}</Text>
                  </div>
                ) : (
                  pickerArtifacts.map((artifact) => {
                    const compositeId = `${artifact.workspaceId}:${artifact.id}`;
                    const isSelected = compositeId === createSelectedArtifactId;
                    return (
                      <button
                        key={compositeId}
                        type="button"
                        className={`insight-workbench-requirements-artifact-picker-row ${isSelected ? "insight-workbench-requirements-artifact-picker-row--selected" : ""}`}
                        onClick={() => setCreateSelectedArtifactId(compositeId)}
                      >
                        <div className="insight-workbench-requirements-artifact-name-cell">
                          <Text weight="semibold">{artifact.displayName}</Text>
                          <Text size={100} style={{ color: "var(--colorNeutralForeground3)" }}>{artifact.id}</Text>
                        </div>
                        <Text size={200}>{artifact.type}</Text>
                        <Text size={200}>{artifact.workspaceName}</Text>
                        <Text size={200}>{artifact.createdByDisplayName ?? "-"}</Text>
                        <Text size={200}>{artifact.accessLevel ?? "-"}</Text>
                        <Text size={200}>{formatArtifactTimestamp(artifact.lastSyncAt ?? artifact.discoveredAt)}</Text>
                      </button>
                    );
                  })
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => {
                setIsArtifactPickerOpen(false);
                restoreCreateDialogFocus();
              }}>
                {t("InsightWorkbench_RequirementsBoard_Create_UseSelection", "Use selection")}
              </Button>
              <Button appearance="secondary" onClick={() => {
                setIsArtifactPickerOpen(false);
                restoreCreateDialogFocus();
              }}>
                {t("InsightWorkbench_Cancel", "Cancel")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        modalType="non-modal"
        open={isReportTargetPickerOpen}
        onOpenChange={(_, data) => {
          setIsReportTargetPickerOpen(data.open);
          if (!data.open) {
            restoreCreateDialogFocus();
          }
        }}
      >
        <DialogSurface className="insight-workbench-requirements-dialog-surface insight-workbench-requirements-dialog-surface--wide">
          <DialogBody>
            <DialogTitle>
              {t("InsightWorkbench_RequirementsBoard_Create_ReportTargets", "Page / Visual / Filter")}
            </DialogTitle>
            <DialogContent>
              <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Grouped", "Pages and visuals")}</Text>
              {isLoadingReportTargets ? (
                <div className="insight-workbench-requirements-artifact-picker-empty">
                  <Spinner label={t("InsightWorkbench_ReportScanner_LoadingDefinition", "Loading report definition...")} />
                </div>
              ) : reportTargetLoadError ? (
                <div className="insight-workbench-requirements-artifact-picker-empty">
                  <Text size={200}>{reportTargetLoadError}</Text>
                </div>
              ) : reportTargetPageGroups.length === 0 ? (
                <div className="insight-workbench-requirements-artifact-picker-empty">
                  <Text size={200}>{t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Empty", "No pages or visuals were discovered for the selected report.")}</Text>
                </div>
              ) : (
                <div className="insight-workbench-requirements-report-target-table">
                  <div className="insight-workbench-requirements-report-target-row insight-workbench-requirements-report-target-row--header">
                    <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Page", "Page")}</Text>
                    <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Visuals", "Visuals")}</Text>
                  </div>
                  {reportTargetPageGroups.map((group) => (
                    <div key={group.page} className="insight-workbench-requirements-report-target-row">
                      <Checkbox
                        checked={createReportPages.includes(group.page)}
                        label={group.page}
                        onChange={(_, data) => {
                          setCreateReportPages((prev) =>
                            data.checked
                              ? Array.from(new Set([...prev, group.page]))
                              : prev.filter((page) => page !== group.page)
                          );
                        }}
                      />
                      <div className="insight-workbench-requirements-report-visual-grid">
                        {group.visuals.map((visual) => {
                          const visualKey = `${group.page}::${visual}`;
                          return (
                            <Checkbox
                              key={visualKey}
                              checked={createReportVisuals.includes(visualKey)}
                              label={visual}
                              onChange={(_, data) => {
                                setCreateReportVisuals((prev) =>
                                  data.checked
                                    ? Array.from(new Set([...prev, visualKey]))
                                    : prev.filter((value) => value !== visualKey)
                                );
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Divider style={{ margin: "var(--spacingVerticalM) 0" }} />
              <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Filters", "Filters across all pages")}</Text>
              <div className="insight-workbench-requirements-report-filter-table">
                {reportTargetFilters.map((filterName) => (
                  <div key={filterName} className="insight-workbench-requirements-report-filter-row">
                    <Checkbox
                      checked={createReportFilters.includes(filterName)}
                      label={filterName}
                      onChange={(_, data) => {
                        setCreateReportFilters((prev) =>
                          data.checked
                            ? Array.from(new Set([...prev, filterName]))
                            : prev.filter((value) => value !== filterName)
                        );
                      }}
                    />
                  </div>
                ))}
                {reportTargetFilters.length === 0 ? (
                  <div className="insight-workbench-requirements-artifact-picker-empty">
                    <Text size={200}>{t("InsightWorkbench_RequirementsBoard_Create_ReportTargets_Filters_Empty", "No report filters were discovered for the selected report.")}</Text>
                  </div>
                ) : null}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => {
                setIsReportTargetPickerOpen(false);
                restoreCreateDialogFocus();
              }}>
                {t("InsightWorkbench_RequirementsBoard_Create_UseSelection", "Use selection")}
              </Button>
              <Button appearance="secondary" onClick={() => {
                setIsReportTargetPickerOpen(false);
                restoreCreateDialogFocus();
              }}>
                {t("InsightWorkbench_Cancel", "Cancel")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        modalType="non-modal"
        open={isSemanticTargetPickerOpen}
        onOpenChange={(_, data) => {
          setIsSemanticTargetPickerOpen(data.open);
          if (!data.open) {
            restoreCreateDialogFocus();
          }
        }}
      >
        <DialogSurface className="insight-workbench-requirements-dialog-surface insight-workbench-requirements-dialog-surface--wide">
          <DialogBody>
            <DialogTitle>
              {t("InsightWorkbench_RequirementsBoard_Create_SemanticTargets", "Semantic entities (optional)")}
            </DialogTitle>
            <DialogContent>
              <div className="insight-workbench-requirements-dialog-grid" style={{ marginBottom: "var(--spacingVerticalM)" }}>
                <Field label={t("InsightWorkbench_SemanticAnalyzer_Search_Label", "Search")}>
                  <Input
                    value={createSemanticSearchText}
                    onChange={(_, data) => setCreateSemanticSearchText(data.value)}
                    placeholder={t("InsightWorkbench_RequirementsBoard_Create_SemanticSearch_Placeholder", "Search semantic entities")}
                  />
                </Field>
                <Field label={t("InsightWorkbench_SemanticAnalyzer_Filter_EntityType", "Entity type")}>
                  <Dropdown
                    inlinePopup
                    selectedOptions={[createSemanticTypeFilter]}
                    value={createSemanticTypeFilter === "all"
                      ? t("InsightWorkbench_RequirementsBoard_AllUsers", "All")
                      : createSemanticTypeFilter}
                    onOptionSelect={(_, data) => setCreateSemanticTypeFilter((data.optionValue as string) ?? "all")}
                  >
                    {createSemanticTypeOptions.map((option) => (
                      <Option key={option} value={option}>
                        {option === "all" ? t("InsightWorkbench_RequirementsBoard_AllUsers", "All") : option}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label={t("InsightWorkbench_SemanticAnalyzer_GroupBy", "Group by")}>
                  <Dropdown
                    inlinePopup
                    selectedOptions={[createSemanticGroupBy]}
                    value={createSemanticGroupBy === "none"
                      ? t("InsightWorkbench_SemanticAnalyzer_Group_None", "None")
                      : createSemanticGroupBy === "table"
                        ? t("InsightWorkbench_SemanticAnalyzer_Group_Table", "Table")
                        : t("InsightWorkbench_SemanticAnalyzer_Group_Type", "Entity type")}
                    onOptionSelect={(_, data) => setCreateSemanticGroupBy((data.optionValue as SemanticPickerGroupBy) ?? "none")}
                  >
                    <Option value="none">{t("InsightWorkbench_SemanticAnalyzer_Group_None", "None")}</Option>
                    <Option value="table">{t("InsightWorkbench_SemanticAnalyzer_Group_Table", "Table")}</Option>
                    <Option value="type">{t("InsightWorkbench_SemanticAnalyzer_Group_Type", "Entity type")}</Option>
                  </Dropdown>
                </Field>
              </div>

              <div className="insight-workbench-requirements-semantic-picker-toolbar">
                <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                  {t("InsightWorkbench_RequirementsBoard_Create_SemanticSummary", "{{selected}} selected • {{visible}} visible", {
                    selected: createSemanticEntityIds.length,
                    visible: filteredSemanticEntities.length,
                  })}
                </Text>
                <div className="insight-workbench-requirements-filterbar-quick-actions">
                  <Button
                    size="small"
                    appearance="secondary"
                    onClick={() => {
                      const next = new Set(createSemanticEntityIds);
                      for (const entity of filteredSemanticEntities) {
                        next.add(entity.id);
                      }
                      setCreateSemanticEntityIds(Array.from(next));
                    }}
                    disabled={filteredSemanticEntities.length === 0}
                  >
                    {t("InsightWorkbench_RequirementsBoard_Create_SelectVisible", "Select visible")}
                  </Button>
                  <Button
                    size="small"
                    appearance="secondary"
                    onClick={() => {
                      const visibleIds = new Set(filteredSemanticEntities.map((entity) => entity.id));
                      setCreateSemanticEntityIds((prev) => prev.filter((id) => !visibleIds.has(id)));
                    }}
                    disabled={filteredSemanticEntities.length === 0}
                  >
                    {t("InsightWorkbench_RequirementsBoard_Create_ClearVisible", "Clear visible")}
                  </Button>
                </div>
              </div>

              <div className="insight-workbench-requirements-semantic-picker-groups">
                {filteredSemanticEntities.length === 0 ? (
                  <div className="insight-workbench-requirements-artifact-picker-empty">
                    <Text size={200}>{t("InsightWorkbench_RequirementsBoard_Create_Artifact_Empty", "No artifacts found for the selected type.")}</Text>
                  </div>
                ) : (
                  groupedSemanticEntities.map((group) => (
                    <div key={group.key} className="insight-workbench-requirements-semantic-picker-group">
                      {createSemanticGroupBy !== "none" ? (
                        <div className="insight-workbench-requirements-semantic-picker-group-header">
                          <Text weight="semibold">{group.label}</Text>
                          <Badge appearance="outline">{group.entities.length}</Badge>
                        </div>
                      ) : null}
                      <div className="insight-workbench-requirements-report-filter-table">
                        {group.entities.map((entity) => (
                          <div key={entity.id} className="insight-workbench-requirements-report-filter-row">
                            <Checkbox
                              checked={createSemanticEntityIds.includes(entity.id)}
                              label={entity.label}
                              onChange={(_, data) => {
                                setCreateSemanticEntityIds((prev) =>
                                  data.checked
                                    ? Array.from(new Set([...prev, entity.id]))
                                    : prev.filter((value) => value !== entity.id)
                                );
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => {
                setIsSemanticTargetPickerOpen(false);
                restoreCreateDialogFocus();
              }}>
                {t("InsightWorkbench_RequirementsBoard_Create_UseSelection", "Use selection")}
              </Button>
              <Button appearance="secondary" onClick={() => {
                setIsSemanticTargetPickerOpen(false);
                restoreCreateDialogFocus();
              }}>
                {t("InsightWorkbench_Cancel", "Cancel")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editDraft} onOpenChange={(_, data) => { if (!data.open) { closeEditDialog(); } }}>
        <DialogSurface className="insight-workbench-requirements-dialog-surface insight-workbench-requirements-dialog-surface--wide">
          <DialogBody>
            <DialogTitle>
              {editDraft ? `#${editDraft.ticketNumber} ${editDraft.name}` : ""}
            </DialogTitle>
            <DialogContent>
              {editDraft ? (
                <>
                  <TabList
                    selectedValue={editTab}
                    onTabSelect={(_, data) => setEditTab(data.value as EditDialogTab)}
                  >
                    <Tab value="details">{t("InsightWorkbench_RequirementsBoard_Tab_Details", "Details")}</Tab>
                    <Tab value="reports">{t("InsightWorkbench_RequirementsBoard_Tab_Reports", "Report Scanner")}</Tab>
                    <Tab value="semantic-impact">{t("InsightWorkbench_RequirementsBoard_Tab_SemanticImpact", "Semantic Analyzer")}</Tab>
                    <Tab value="dependencies">{t("InsightWorkbench_RequirementsBoard_Tab_Dependencies", "Lineage & Dependencies")}</Tab>
                  </TabList>

                  {editTab === "details" ? (
                    <>
                      <TicketDetailsSection
                        draft={editDraft}
                        users={workspaceUsers}
                        existingProjects={projectOptions}
                        onChange={patchEditDraft}
                        descriptionReadOnly={!isEditingDescription}
                        onRequestEditDescription={() => setIsEditingDescription(true)}
                        onDoneEditDescription={() => setIsEditingDescription(false)}
                        descriptionReadOnlyContent={renderRichTextContent(editDraft.description, 200)}
                        onDescriptionPaste={handleEditDescriptionPaste}
                        onDescriptionDrop={handleEditDescriptionDrop}
                      />

                      <div className="insight-workbench-requirements-external-mockup">
                        <Text weight="semibold">
                          {t("InsightWorkbench_RequirementsBoard_ExternalLinks_Mockup_Title", "External work tracking (mockup)")}
                        </Text>
                        <div className="insight-workbench-requirements-link-add-row">
                          <Dropdown
                            inlinePopup
                            selectedOptions={["github"]}
                            value={t("InsightWorkbench_RequirementsBoard_ExternalLinks_Mockup_Default", "GitHub Issue")}
                            disabled
                          >
                            <Option value="github">GitHub Issue</Option>
                            <Option value="azure-devops">Azure DevOps Work Item</Option>
                          </Dropdown>
                          <Input
                            readOnly
                            value="owner/repo#123"
                            placeholder={t("InsightWorkbench_RequirementsBoard_ExternalLinks_Mockup_Reference", "External reference")}
                          />
                          <Button appearance="secondary" disabled>
                            {t("InsightWorkbench_RequirementsBoard_ExternalLinks_Mockup_Action", "Link (coming soon)")}
                          </Button>
                        </div>
                        <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                          {t("InsightWorkbench_RequirementsBoard_ExternalLinks_Mockup_Hint", "Mockup only: provider integration and sync are not implemented yet.")}
                        </Text>
                      </div>

                      <Divider style={{ margin: "var(--spacingVerticalM) 0" }} />
                      <div className="insight-workbench-requirements-comments">
                        <Text weight="semibold">
                          {t("InsightWorkbench_RequirementsBoard_Comments_Title", "Comments")}
                        </Text>
                        <div className="insight-workbench-requirements-comment-list">
                          {(editDraft.comments ?? []).length === 0 ? (
                            <Text size={200}>{t("InsightWorkbench_RequirementsBoard_Comments_Empty", "No comments yet.")}</Text>
                          ) : (
                            (editDraft.comments ?? []).map((comment) => (
                              <div key={comment.id} className="insight-workbench-requirements-comment-item">
                                <div className="insight-workbench-requirements-comment-author">
                                  <Text weight="semibold" size={200}>{comment.author ?? t("InsightWorkbench_RequirementsBoard_Comments_You", "You")}</Text>
                                  <Text size={100} style={{ color: "var(--colorNeutralForeground3)" }}>{new Date(comment.createdAtUtc).toLocaleString()}</Text>
                                </div>
                                {renderRichTextContent(comment.text, 300)}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="insight-workbench-requirements-comment-input-row">
                          <Textarea
                            value={newCommentText}
                            onChange={(_, data) => setNewCommentText(data.value)}
                            onPaste={handleCommentPaste}
                            onDrop={handleCommentDrop}
                            placeholder={t("InsightWorkbench_RequirementsBoard_Comments_Placeholder", "Add a comment…")}
                            resize="vertical"
                            rows={3}
                            className="insight-workbench-requirements-comment-compose"
                            style={{ flex: 1 }}
                          />
                          <Button appearance="secondary" onClick={addCommentToEditDraft} disabled={!newCommentText.trim()}>
                            {t("InsightWorkbench_RequirementsBoard_Comments_Submit", "Comment")}
                          </Button>
                        </div>
                        <div className="insight-workbench-requirements-comment-input-row">
                          <Input
                            value={newCommentImageUrl}
                            onChange={(_, data) => setNewCommentImageUrl(data.value)}
                            placeholder={t("InsightWorkbench_RequirementsBoard_ImageUrl_Placeholder", "Image URL (https://...)")}
                            style={{ flex: 1 }}
                          />
                          <Button
                            appearance="secondary"
                            onClick={() => {
                              setNewCommentText((prev) => appendImageMarkdown(prev, newCommentImageUrl));
                              setNewCommentImageUrl("");
                            }}
                            disabled={!newCommentImageUrl.trim()}
                          >
                            {t("InsightWorkbench_RequirementsBoard_InsertImage", "Insert image")}
                          </Button>
                        </div>
                        <div className="insight-workbench-requirements-comment-input-row">
                          <Input
                            value={editDescriptionImageUrl}
                            onChange={(_, data) => setEditDescriptionImageUrl(data.value)}
                            placeholder={t("InsightWorkbench_RequirementsBoard_ImageUrl_Placeholder", "Image URL (https://...)")}
                            style={{ flex: 1 }}
                          />
                          <Button
                            appearance="secondary"
                            onClick={() => {
                              patchEditDraft({ description: appendImageMarkdown(editDraft.description, editDescriptionImageUrl) });
                              setEditDescriptionImageUrl("");
                            }}
                            disabled={!editDescriptionImageUrl.trim()}
                          >
                            {t("InsightWorkbench_RequirementsBoard_InsertImageToDescription", "Insert image to description")}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : editTab === "reports" ? (
                    <div className="insight-workbench-requirements-links">
                      {influencedReportOptions.length === 0 ? (
                        <Text size={200}>
                          {t(
                            "InsightWorkbench_RequirementsBoard_ReportImpact_Empty",
                            "No influenced reports were found. Link semantic entities or report artifacts first."
                          )}
                        </Text>
                      ) : (
                        <>
                          <Text weight="semibold">
                            {t("InsightWorkbench_RequirementsBoard_ReportImpact_Title", "Influenced reports")}
                          </Text>

                          <div className="insight-workbench-requirements-link-list" style={{ marginBottom: "var(--spacingVerticalM)" }}>
                            {influencedReportOptions.map((report) => {
                              const isSelected = report.key === selectedImpactReportKey;
                              return (
                                <button
                                  key={report.key}
                                  type="button"
                                  className="insight-workbench-requirements-link-item"
                                  style={{
                                    width: "100%",
                                    textAlign: "left",
                                    border: isSelected ? "2px solid var(--colorBrandStroke1)" : "1px solid var(--colorNeutralStroke2)",
                                    borderRadius: "8px",
                                    background: isSelected ? "var(--colorNeutralBackground1Selected)" : "var(--colorNeutralBackground1)",
                                    cursor: "pointer",
                                  }}
                                  onClick={() => setSelectedImpactReportKey(report.key)}
                                >
                                  <Text weight="semibold">{report.reportName}</Text>
                                  <Text size={200}>{report.workspaceName}</Text>
                                </button>
                              );
                            })}
                          </div>

                          {isLoadingImpactReportTargets ? (
                            <Spinner label={t("InsightWorkbench_ReportScanner_LoadingDefinition", "Loading report definition...")} />
                          ) : impactReportTargetsError ? (
                            <div className="insight-workbench-requirements-error-block">
                              <Text>{impactReportTargetsError}</Text>
                            </div>
                          ) : (
                            <>
                              <Text size={200}>
                                {t(
                                  "InsightWorkbench_RequirementsBoard_ReportImpact_Help",
                                  "Select report pages, visuals, and filters that are impacted by this ticket and add them as linked targets."
                                )}
                              </Text>

                              <div className="insight-workbench-requirements-dependency-panels">
                                <div className="insight-workbench-requirements-dependency-panel">
                                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_ReportPages", "Pages")}</Text>
                                  {impactReportPageGroups.length === 0 ? (
                                    <Text size={200}>{t("InsightWorkbench_RequirementsBoard_ReportPages_Empty", "No pages found.")}</Text>
                                  ) : (
                                    impactReportPageGroups.map((group) => (
                                      <div key={group.page} className="insight-workbench-requirements-report-filter-row">
                                        <Checkbox
                                          checked={impactSelectedPages.includes(group.page)}
                                          label={group.page}
                                          onChange={(_, data) =>
                                            setImpactSelectedPages((prev) =>
                                              data.checked ? Array.from(new Set([...prev, group.page])) : prev.filter((value) => value !== group.page)
                                            )
                                          }
                                        />
                                      </div>
                                    ))
                                  )}
                                </div>

                                <div className="insight-workbench-requirements-dependency-panel">
                                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_ReportVisuals", "Visuals")}</Text>
                                  {impactReportPageGroups.length === 0 ? (
                                    <Text size={200}>{t("InsightWorkbench_RequirementsBoard_ReportVisuals_Empty", "No visuals found.")}</Text>
                                  ) : (
                                    impactReportPageGroups.flatMap((group) =>
                                      group.visuals.map((visual) => {
                                        const visualKey = `${group.page}::${visual}`;
                                        return (
                                          <div key={visualKey} className="insight-workbench-requirements-report-filter-row">
                                            <Checkbox
                                              checked={impactSelectedVisuals.includes(visualKey)}
                                              label={`${group.page} / ${visual}`}
                                              onChange={(_, data) =>
                                                setImpactSelectedVisuals((prev) =>
                                                  data.checked ? Array.from(new Set([...prev, visualKey])) : prev.filter((value) => value !== visualKey)
                                                )
                                              }
                                            />
                                          </div>
                                        );
                                      })
                                    )
                                  )}
                                </div>

                                <div className="insight-workbench-requirements-dependency-panel">
                                  <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_ReportFilters", "Filters")}</Text>
                                  {impactReportFilters.length === 0 ? (
                                    <Text size={200}>{t("InsightWorkbench_RequirementsBoard_ReportFilters_Empty", "No filters found.")}</Text>
                                  ) : (
                                    impactReportFilters.map((filterName) => (
                                      <div key={filterName} className="insight-workbench-requirements-report-filter-row">
                                        <Checkbox
                                          checked={impactSelectedFilters.includes(filterName)}
                                          label={filterName}
                                          onChange={(_, data) =>
                                            setImpactSelectedFilters((prev) =>
                                              data.checked ? Array.from(new Set([...prev, filterName])) : prev.filter((value) => value !== filterName)
                                            )
                                          }
                                        />
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {selectedImpactPreviewPage ? (
                                <>
                                  <Divider style={{ margin: "var(--spacingVerticalM) 0" }} />
                                  <Text weight="semibold">
                                    {t("InsightWorkbench_RequirementsBoard_ReportPreview", "Report preview")}
                                  </Text>
                                  <TabList
                                    selectedValue={`preview-page-${impactPreviewPageIndex}`}
                                    onTabSelect={(_, data) => {
                                      const raw = String(data.value ?? "").replace("preview-page-", "");
                                      const parsed = Number.parseInt(raw, 10);
                                      if (!Number.isNaN(parsed)) {
                                        setImpactPreviewPageIndex(parsed);
                                      }
                                    }}
                                    style={{ marginTop: "8px", marginBottom: "8px" }}
                                  >
                                    {impactUnifiedReport?.pages.map((page, index) => (
                                      <Tab key={page.id} value={`preview-page-${index}`}>
                                        {page.displayName}
                                      </Tab>
                                    ))}
                                  </TabList>

                                  <ReportPagePreview
                                    page={selectedImpactPreviewPage}
                                    selectedVisual={selectedImpactVisualForPreview}
                                    containerWidth={Math.min(980, Math.max(640, window.innerWidth - 260))}
                                    containerHeight={520}
                                  />
                                </>
                              ) : null}

                              <div className="insight-workbench-requirements-filterbar-quick-actions">
                                <Button
                                  size="small"
                                  appearance="secondary"
                                  onClick={addSelectedReportTargetsToTicket}
                                  disabled={impactSelectedPages.length + impactSelectedVisuals.length + impactSelectedFilters.length === 0}
                                >
                                  {t("InsightWorkbench_RequirementsBoard_ReportImpact_AddTargets", "Link selected report targets")}
                                </Button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ) : editTab === "semantic-impact" ? (
                    <div className="insight-workbench-requirements-links">
                      <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_SemanticImpact_Title", "Influenced semantic entities")}</Text>
                      {selectedModel ? (
                        <Text size={200}>{`${t("InsightWorkbench_RequirementsBoard_SemanticModel", "Model")}: ${selectedModel.displayName}`}</Text>
                      ) : (
                        <Text size={200}>{t("InsightWorkbench_RequirementsBoard_SemanticModel_Missing", "No semantic model is currently selected.")}</Text>
                      )}

                      {influencedSemanticEntities.length === 0 ? (
                        <Text size={200}>
                          {t(
                            "InsightWorkbench_RequirementsBoard_SemanticImpact_Empty",
                            "No influenced semantic entities found yet. Add semantic links or derive them from report impact."
                          )}
                        </Text>
                      ) : (
                        <div className="insight-workbench-requirements-report-filter-table">
                          {influencedSemanticEntities.map((entity) => (
                            <div key={entity.id} className="insight-workbench-requirements-report-filter-row">
                              <Checkbox
                                checked={impactSelectedSemanticEntityIds.includes(entity.id)}
                                label={`${entity.name} (${entity.type}${entity.tableName ? ` • ${entity.tableName}` : ""})`}
                                onChange={(_, data) =>
                                  setImpactSelectedSemanticEntityIds((prev) =>
                                    data.checked ? Array.from(new Set([...prev, entity.id])) : prev.filter((value) => value !== entity.id)
                                  )
                                }
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="insight-workbench-requirements-filterbar-quick-actions">
                        <Button
                          size="small"
                          appearance="secondary"
                          onClick={() => setImpactSelectedSemanticEntityIds(influencedSemanticEntities.map((entity) => entity.id))}
                          disabled={influencedSemanticEntities.length === 0}
                        >
                          {t("InsightWorkbench_RequirementsBoard_SelectAllInfluencedEntities", "Select all influenced entities")}
                        </Button>
                        <Button
                          size="small"
                          appearance="secondary"
                          onClick={addSelectedSemanticImpactEntitiesToTicket}
                          disabled={impactSelectedSemanticEntityIds.length === 0}
                        >
                          {t("InsightWorkbench_RequirementsBoard_LinkSelectedEntities", "Link selected semantic entities")}
                        </Button>
                      </div>

                      <Divider />

                      <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_ReportUsage", "Report usage")}</Text>
                      {isLoadingReportUsage ? (
                        <Spinner label={t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Loading", "Loading...")} />
                      ) : null}
                      {reportUsageError ? <Text size={200}>{reportUsageError}</Text> : null}
                      {!isLoadingReportUsage && editDraftReportUsage.length === 0 ? (
                        <Text size={200}>{t("InsightWorkbench_RequirementsBoard_ReportUsage_Empty", "No report usage found for current links.")}</Text>
                      ) : (
                        editDraftReportUsage.map((entry) => (
                          <div key={`${entry.workspaceId}:${entry.reportId}`} className="insight-workbench-requirements-dependency-item">
                            <Text weight="semibold">{entry.reportName}</Text>
                            <Text size={200}>{entry.workspaceName}</Text>
                            <Text size={200}>{entry.reasons.join(" • ")}</Text>
                          </div>
                        ))
                      )}

                      <Divider />

                      <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_SemanticDependencies", "Semantic dependencies in model")}</Text>
                      {editDraftSemanticDeps.length === 0 ? (
                        <Text size={200}>
                          {t("InsightWorkbench_RequirementsBoard_SemanticDependencies_Empty", "No semantic dependencies found for current links.")}
                        </Text>
                      ) : (
                        editDraftSemanticDeps.map((dep) => (
                          <div key={dep.id} className="insight-workbench-requirements-dependency-item">
                            <Text weight="semibold">{dep.sourceName}</Text>
                            <Text size={200}>{`→ ${dep.targetName} (${dep.dependencyType})`}</Text>
                          </div>
                        ))
                      )}
                    </div>
                  ) : editTab === "dependencies" ? (
                    <div className="insight-workbench-requirements-links">
                      {isLoadingDeps ? (
                        <Spinner label={t("InsightWorkbench_RequirementsBoard_LoadingDependencies", "Loading dependencies...")} />
                      ) : depLoadError ? (
                        <div className="insight-workbench-requirements-error-block">
                          <Text>{depLoadError}</Text>
                          <Button appearance="secondary" onClick={() => { void loadDependencyContext(); }}>
                            {t("InsightWorkbench_RequirementsBoard_Retry", "Retry")}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Text weight="semibold">
                            {t("InsightWorkbench_RequirementsBoard_AddArtifact", "Add artifact link")}
                          </Text>

                          <div className="insight-workbench-requirements-dependency-panels" style={{ marginBottom: "var(--spacingVerticalM)" }}>
                            <div className="insight-workbench-requirements-dependency-panel">
                              <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_ImpactOverview", "Impact overview")}</Text>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_Reports", "Reports")}: {impactOverview.reportCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_ReportPages", "Pages")}: {impactOverview.reportPageCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_ReportVisuals", "Visuals")}: {impactOverview.reportVisualCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_ReportFilters", "Filters")}: {impactOverview.reportFilterCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_SemanticModel", "Semantic models")}: {impactOverview.semanticModelCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_SemanticEntities", "Semantic entities")}: {impactOverview.semanticEntityCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_ArtifactDependencies", "Artifact deps")}: {impactOverview.artifactDependencyCount}</Badge>
                                <Badge appearance="outline">{t("InsightWorkbench_RequirementsBoard_SemanticDependencies", "Semantic deps")}: {impactOverview.semanticDependencyCount}</Badge>
                              </div>
                            </div>

                            <div className="insight-workbench-requirements-dependency-panel">
                              <Text weight="semibold">{t("InsightWorkbench_RequirementsBoard_NextTodos", "Suggested next todos")}</Text>
                              <div style={{ marginTop: "8px", display: "grid", gap: "6px" }}>
                                {impactTodoSuggestions.map((todo) => (
                                  <div key={todo.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <Badge appearance={todo.done ? "filled" : "outline"} color={todo.done ? "success" : undefined}>
                                      {todo.done ? t("InsightWorkbench_RequirementsBoard_Done", "Done") : t("InsightWorkbench_RequirementsBoard_Pending", "Pending")}
                                    </Badge>
                                    <Text size={200}>{todo.label}</Text>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="insight-workbench-requirements-link-add-row">
                            <SearchableCombobox
                              options={artifactOptions}
                              selectedValue={editArtifactToLink}
                              onSelect={setEditArtifactToLink}
                              placeholder={t("InsightWorkbench_RequirementsBoard_AddArtifact_Placeholder", "Select artifact")}
                              className="insight-workbench-requirements-link-dropdown"
                              disabled={isLoadingDeps}
                            />
                            <Button appearance="secondary" onClick={addSelectedArtifactLink} disabled={!editArtifactToLink}>
                              {t("InsightWorkbench_RequirementsBoard_AddLink", "Add")}
                            </Button>
                          </div>

                          <Text weight="semibold">
                            {t("InsightWorkbench_RequirementsBoard_AddSemantic", "Add semantic entity link")}
                          </Text>
                          <div className="insight-workbench-requirements-link-add-row">
                            <SearchableCombobox
                              options={semanticEntityOptions}
                              selectedValue={editSemanticToLink}
                              onSelect={setEditSemanticToLink}
                              placeholder={t("InsightWorkbench_RequirementsBoard_AddSemantic_Placeholder", "Select semantic entity")}
                              className="insight-workbench-requirements-link-dropdown"
                              disabled={isLoadingEntities || !selectedModel}
                            />
                            <Button appearance="secondary" onClick={addSelectedSemanticLink} disabled={!editSemanticToLink}>
                              {t("InsightWorkbench_RequirementsBoard_AddLink", "Add")}
                            </Button>
                          </div>

                          <Divider />

                          <Text weight="semibold">
                            {t("InsightWorkbench_RequirementsBoard_LinkedEntities", "Linked entities")}
                          </Text>
                          {(editDraft.links ?? []).length === 0 ? (
                            <Text>
                              {t("InsightWorkbench_RequirementsBoard_NoLinks", "No linked entities yet. Link artifacts or semantic entities to enrich this ticket.")}
                            </Text>
                          ) : (
                            <div className="insight-workbench-requirements-link-list">
                              {groupedLinkedEntities.map((group) => (
                                <div key={group.key} className="insight-workbench-requirements-link-item">
                                  <div style={{ width: "100%" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span
                                          aria-label={group.iconLabel}
                                          title={group.iconLabel}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            width: "20px",
                                            height: "20px",
                                            color: "var(--colorNeutralForeground2)",
                                          }}
                                        >
                                          {group.icon}
                                        </span>
                                        <div>
                                          <Text weight="semibold">{group.parentLabel}</Text>
                                          <Text size={200}>{group.parentMeta}</Text>
                                        </div>
                                      </div>
                                      {group.standaloneLinkId ? (
                                        <Button appearance="subtle" onClick={() => removeLinkFromEditDraft(group.standaloneLinkId as string)}>
                                          {t("InsightWorkbench_RequirementsBoard_RemoveLink", "Remove")}
                                        </Button>
                                      ) : null}
                                    </div>

                                    {group.children.length > 0 ? (
                                      <div style={{ marginTop: "8px", marginLeft: "28px", display: "grid", gap: "6px" }}>
                                        {group.children.map((child) => (
                                          <div key={child.linkId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                            <div>
                                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <Text size={200}>{child.label}</Text>
                                                <Badge size="small" appearance="outline">{child.category}</Badge>
                                              </div>
                                              <Text size={100} style={{ color: "var(--colorNeutralForeground3)" }}>{child.meta}</Text>
                                            </div>
                                            <Button appearance="subtle" size="small" onClick={() => removeLinkFromEditDraft(child.linkId)}>
                                              {t("InsightWorkbench_RequirementsBoard_RemoveLink", "Remove")}
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <Divider />

                          <Text weight="semibold">
                            {t("InsightWorkbench_RequirementsBoard_ExistingConnectionsByEntity", "Existing connections by linked entity")}
                          </Text>
                          {(editDraft.links ?? []).length === 0 ? (
                            <Text size={200}>
                              {t("InsightWorkbench_RequirementsBoard_ExistingConnectionsByEntity_EmptyLinks", "Add at least one link to inspect existing connections.")}
                            </Text>
                          ) : (
                            <div className="insight-workbench-requirements-link-list">
                              {editDraftExistingConnectionsByType.map((group) => (
                                <div key={group.entityType}>
                                  <div className="insight-workbench-requirements-semantic-picker-group-header">
                                    <Text weight="semibold">{group.entityType}</Text>
                                    <Badge appearance="outline">{group.entries.length}</Badge>
                                  </div>
                                  {group.entries.map((section) => (
                                    <div key={section.linkId} className="insight-workbench-requirements-link-item">
                                      <div>
                                        <Text weight="semibold">{section.label}</Text>
                                        <Text size={200}>{`${section.linkType} • ${section.connections.length} ${section.connections.length === 1 ? "connection" : "connections"}`}</Text>
                                        {section.connections.length === 0 ? (
                                          <Text size={200}>
                                            {t("InsightWorkbench_RequirementsBoard_ExistingConnectionsByEntity_NoConnections", "No existing connections discovered for this entity.")}
                                          </Text>
                                        ) : (
                                          section.connections.slice(0, 10).map((entry) => (
                                            <Text key={`${section.linkId}:${entry}`} size={200}>{entry}</Text>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}

                          <Divider />

                          <div className="insight-workbench-requirements-dependency-panels">
                            <div className="insight-workbench-requirements-dependency-panel">
                              <Text weight="semibold">
                                {t("InsightWorkbench_RequirementsBoard_ArtifactDependencies", "Dependent artifacts")}
                              </Text>
                              {editDraftArtifactDeps.length === 0 ? (
                                <Text size={200}>
                                  {t("InsightWorkbench_RequirementsBoard_ArtifactDependencies_Empty", "No dependent artifacts found for current links.")}
                                </Text>
                              ) : (
                                editDraftArtifactDeps.map((entry) => (
                                  <div key={`${entry.relationshipType}:${entry.artifact.workspaceId}:${entry.artifact.id}`} className="insight-workbench-requirements-dependency-item">
                                    <Link>{entry.artifact.displayName}</Link>
                                    <Text size={200}>{`${entry.relationshipType} • ${entry.artifact.type} • ${entry.artifact.workspaceName}`}</Text>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="insight-workbench-requirements-dependency-panel">
                              <Text weight="semibold">
                                {t("InsightWorkbench_RequirementsBoard_ReportUsage", "Report usage")}
                              </Text>
                              {isLoadingReportUsage ? (
                                <Spinner label={t("InsightWorkbench_SemanticAnalyzer_ReportUsage_Loading", "Loading...")} />
                              ) : null}
                              {reportUsageError ? <Text size={200}>{reportUsageError}</Text> : null}
                              {!isLoadingReportUsage && editDraftReportUsage.length === 0 ? (
                                <Text size={200}>
                                  {t("InsightWorkbench_RequirementsBoard_ReportUsage_Empty", "No report usage found for current links.")}
                                </Text>
                              ) : (
                                editDraftReportUsage.map((entry) => (
                                  <div key={`${entry.workspaceId}:${entry.reportId}`} className="insight-workbench-requirements-dependency-item">
                                    <Text weight="semibold">{entry.reportName}</Text>
                                    <Text size={200}>{entry.workspaceName}</Text>
                                    <Text size={200}>{entry.reasons.join(" • ")}</Text>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="insight-workbench-requirements-dependency-panel">
                              <Text weight="semibold">
                                {t("InsightWorkbench_RequirementsBoard_SemanticDependencies", "Semantic dependencies in model")}
                              </Text>
                              {selectedModel ? (
                                <Text size={200}>{`${t("InsightWorkbench_RequirementsBoard_SemanticModel", "Model")}: ${selectedModel.displayName}`}</Text>
                              ) : null}
                              {editDraftSemanticDeps.length === 0 ? (
                                <Text size={200}>
                                  {t("InsightWorkbench_RequirementsBoard_SemanticDependencies_Empty", "No semantic dependencies found for current links.")}
                                </Text>
                              ) : (
                                editDraftSemanticDeps.map((dep) => (
                                  <div key={dep.id} className="insight-workbench-requirements-dependency-item">
                                    <Text weight="semibold">{dep.sourceName}</Text>
                                    <Text size={200}>{`→ ${dep.targetName} (${dep.dependencyType})`}</Text>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={saveEdit}>
                {t("InsightWorkbench_RequirementsBoard_SaveTicket", "Save")}
              </Button>
              <Button appearance="secondary" onClick={closeEditDialog}>
                {t("InsightWorkbench_Cancel", "Cancel")}
              </Button>
              <Button
                appearance="subtle"
                style={{ marginLeft: "auto" }}
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                {t("InsightWorkbench_RequirementsBoard_DeleteTicket", "Delete")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={isDeleteConfirmOpen}
        onOpenChange={(_, data) => setIsDeleteConfirmOpen(data.open)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {t("InsightWorkbench_RequirementsBoard_DeleteConfirm_Title", "Delete ticket?")}
            </DialogTitle>
            <DialogContent>
              <Text>
                {t(
                  "InsightWorkbench_RequirementsBoard_DeleteConfirm_Message",
                  "This will permanently delete the ticket and its linked context. This action cannot be undone."
                )}
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => { deleteEditCard(); setIsDeleteConfirmOpen(false); }}>
                {t("InsightWorkbench_RequirementsBoard_DeleteTicket", "Delete")}
              </Button>
              <Button appearance="secondary" onClick={() => setIsDeleteConfirmOpen(false)}>
                {t("InsightWorkbench_Cancel", "Cancel")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Kanban board */}
      <div className="insight-workbench-requirements-board-grid">
        {columnOrder.map((status) => (
          <section key={status} className="insight-workbench-requirements-column">
            <div className="insight-workbench-requirements-column-header">
              <Text weight="semibold">{STATUS_LABELS[status]}</Text>
              <Badge appearance="outline">{filteredCardsByStatus[status]?.length ?? 0}</Badge>
            </div>
            <div className="insight-workbench-requirements-column-list">
              {(() => {
                const colCards = filteredCardsByStatus[status] ?? [];
                const renderCard = (card: RequirementCard) => (
                  <div
                    key={card.id}
                    className="insight-workbench-requirements-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditDialog(card)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openEditDialog(card); }}
                  >
                  <div className="insight-workbench-requirements-card-title-row">
                    <Text weight="semibold" size={200}>{`#${card.ticketNumber}`}</Text>
                    <Badge
                      appearance="filled"
                      color={
                        card.status === "Done" ? "success"
                        : card.status === "InReview" ? "warning"
                        : card.status === "InProgress" ? "informative"
                        : undefined
                      }
                    >
                      {STATUS_LABELS[card.status]}
                    </Badge>
                  </div>
                  <Text weight="semibold" size={300} block>{card.name}</Text>
                  {card.description ? (
                    <div className="insight-workbench-requirements-card-desc">
                      {renderRichTextContent(card.description, 200)}
                    </div>
                  ) : null}
                  <div className="insight-workbench-requirements-card-people">
                    {card.assignedUser ? (
                      <div className="insight-workbench-requirements-card-person">
                        <span className="insight-workbench-requirements-card-person-avatar">
                          {card.assignedUser.displayName.charAt(0).toUpperCase()}
                        </span>
                        <Text size={200}>{card.assignedUser.displayName}</Text>
                      </div>
                    ) : null}
                    {card.developer ? <Text size={200}>{`Dev: ${card.developer}`}</Text> : null}
                  </div>
                  {(card.links?.length ?? 0) > 0 ? (
                    <div className="insight-workbench-requirements-card-link-badges">
                      <Badge appearance="outline" size="small">
                        {`${card.links?.length} ${card.links?.length === 1 ? "link" : "links"}`}
                      </Badge>
                    </div>
                  ) : null}
                  {card.project ? (
                    <span className="insight-workbench-requirements-card-project">{card.project}</span>
                  ) : null}
                  <div
                    className="insight-workbench-requirements-card-move"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Dropdown
                      selectedOptions={[card.status]}
                      value={STATUS_LABELS[card.status]}
                      onOptionSelect={(_, data) => {
                        const s = data.optionValue as RequirementStatus;
                        if (s) moveCardStatus(card, s);
                      }}
                      size="small"
                    >
                      {DEFAULT_COLUMN_ORDER.map((s) => (
                        <Option key={s} value={s}>{STATUS_LABELS[s]}</Option>
                      ))}
                    </Dropdown>
                  </div>
                </div>
                );
                if (!groupByProject) return colCards.map(renderCard);
                const grouped = new Map<string, RequirementCard[]>();
                for (const c of colCards) {
                  const key = c.project || "\u2014 No project";
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)!.push(c);
                }
                return [...grouped.entries()]
                  .sort((ea, eb) => {
                    const ka = ea[0];
                    const kb = eb[0];
                    if (ka === "\u2014 No project") return 1;
                    if (kb === "\u2014 No project") return -1;
                    return ka.localeCompare(kb);
                  })
                  .flatMap((entry) => {
                    const proj = entry[0];
                    const pCards = entry[1];
                    return [
                      <div key={`header-${proj}`} className="insight-workbench-requirements-project-group-header">{proj}</div>,
                      ...pCards.map(renderCard),
                    ];
                  });
              })()}
            </div>
          </section>
        ))}
      </div>

      {/* Assistant stub */}
      <div className="insight-workbench-requirements-assistant-stub">
        <Text weight="semibold">
          {t("InsightWorkbench_RequirementsBoard_Assistant_Title", "Developer assistant stub (MCP)")}
        </Text>
        <Text>
          {t(
            "InsightWorkbench_RequirementsBoard_Assistant_Description",
            "This stub reserves configuration for a future MCP-based AI assistant that will help implement tickets from linked context."
          )}
        </Text>
        <div className="insight-workbench-requirements-assistant-meta">
          <Badge appearance="outline">{`provider: ${requirementsBoard.assistantStub?.provider ?? "mcp"}`}</Badge>
          <Badge appearance="filled">{`status: ${requirementsBoard.assistantStub?.status ?? "planned"}`}</Badge>
          <Badge appearance="outline">{`server: ${requirementsBoard.assistantStub?.serverName ?? "insight-workbench-mcp"}`}</Badge>
        </div>
        <Button appearance="secondary" onClick={prepareAssistantStub}>
          {t("InsightWorkbench_RequirementsBoard_Assistant_Prepare", "Prepare MCP stub")}
        </Button>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function RequirementsBoardView({
  workloadClient,
  item,
  boardState,
  onBoardStateChange,
  artifactCatalog,
  onArtifactCatalogChange,
}: RequirementsBoardViewProps) {
  return (
    <ItemEditorDefaultView
      center={{
        content: (
          <RequirementsBoardContent
            workloadClient={workloadClient}
            item={item}
            boardState={boardState}
            onBoardStateChange={onBoardStateChange}
            artifactCatalog={artifactCatalog}
            onArtifactCatalogChange={onArtifactCatalogChange}
          />
        ),
      }}
    />
  );
}



