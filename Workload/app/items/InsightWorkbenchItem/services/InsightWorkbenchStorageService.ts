/**
 * InsightWorkbenchStorageService.ts
 *
 * Unified OneLake persistence service for all Insight Workbench data sections.
 *
 * Capabilities:
 *  - Save / load live state for each section (metadata, semantic, lineage, reports, tickets)
 *  - Auto-snapshot on save (configurable)
 *  - List snapshot history per section
 *  - Load a specific historical snapshot for version comparison
 *  - Prune old snapshots beyond the configured retention limit
 *
 * All writes go to:
 *   Files/<rootFolder>/<section>/current.json     — latest live data
 *   Files/<rootFolder>/<section>/snapshots/<id>.json  — individual historical snapshots
 *   Files/<rootFolder>/index.json                 — lightweight snapshot index (mirrors snapshotIndex in item definition)
 */

import { v4 as uuidv4 } from "uuid";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { OneLakeStorageClient, FILE_FOLDER_NAME } from "../../../clients/OneLakeStorageClient";
import { ItemReference } from "../../../controller/ItemCRUDController";
import {
  InsightWorkbenchStorageSettings,
  StorageSnapshotMeta,
  EntitySnapshotMeta,
  MetadataArtifactCatalogState,
  SemanticAnalyzerState,
  LineageGraphState,
  ReportScannerState,
  RequirementsBoardState,
} from "../InsightWorkbenchItemDefinition";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_SCHEMA_VERSION = "2";
const DEFAULT_ROOT_FOLDER = `${FILE_FOLDER_NAME}/insight-workbench-data`;
const DEFAULT_MAX_SNAPSHOTS = 20;

const DEFAULT_SECTION_PATHS = {
  metadata: "metadata",
  semantic: "semantic",
  lineage: "lineage",
  reports: "reports",
  tickets: "tickets",
} as const;

export type StorageSection = keyof typeof DEFAULT_SECTION_PATHS;

// ---------------------------------------------------------------------------
// Envelope types (on-disk format)
// ---------------------------------------------------------------------------

interface SectionEnvelope<T> {
  schemaVersion: string;
  savedAtUtc: string;
  section: StorageSection;
  snapshotId?: string;
  label?: string;
  data: T;
}

interface SnapshotIndexFile {
  schemaVersion: string;
  updatedAtUtc: string;
  snapshots: StorageSnapshotMeta[];
}

interface EntitySnapshotIndexFile {
  schemaVersion: string;
  updatedAtUtc: string;
  snapshots: EntitySnapshotMeta[];
}

// ---------------------------------------------------------------------------
// Section data union
// ---------------------------------------------------------------------------

export type SectionData =
  | { section: "metadata"; data: MetadataArtifactCatalogState }
  | { section: "semantic"; data: SemanticAnalyzerState }
  | { section: "lineage"; data: LineageGraphState }
  | { section: "reports"; data: ReportScannerState }
  | { section: "tickets"; data: RequirementsBoardState };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class InsightWorkbenchStorageService {
  private readonly itemWrapper: ReturnType<OneLakeStorageClient["createItemWrapper"]>;
  private readonly settings: InsightWorkbenchStorageSettings;

  constructor(
    workloadClient: WorkloadClientAPI,
    itemRef: ItemReference,
    settings: InsightWorkbenchStorageSettings
  ) {
    this.itemWrapper = new OneLakeStorageClient(workloadClient).createItemWrapper(itemRef);
    this.settings = settings;
  }

  // --------------------------------------------------------------------------
  // Public API — current state
  // --------------------------------------------------------------------------

  /** Save section data as the current live state. Optionally also creates a snapshot. */
  async saveSection<T extends SectionData>(
    sectionData: T,
    label?: string
  ): Promise<StorageSnapshotMeta | null> {
    const sectionPath = this.getSectionFolder(sectionData.section);
    const currentPath = `${sectionPath}/current.json`;

    const envelope: SectionEnvelope<T["data"]> = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      savedAtUtc: new Date().toISOString(),
      section: sectionData.section,
      data: sectionData.data,
    };

    await this.itemWrapper.writeFileAsText(currentPath, JSON.stringify(envelope));

    // Auto-snapshot when configured
    const shouldSnapshot = this.settings.autoSnapshot !== false;
    if (shouldSnapshot) {
      return this.createSnapshot(sectionData, label);
    }

    return null;
  }

  /** Load the current live state for a section. Returns undefined if not found. */
  async loadSection<T>(section: StorageSection): Promise<T | undefined> {
    const sectionPath = this.getSectionFolder(section);
    const currentPath = `${sectionPath}/current.json`;

    const exists = await this.itemWrapper.checkIfFileExists(currentPath);
    if (!exists) {
      return undefined;
    }

    const raw = await this.itemWrapper.readFileAsText(currentPath);
    if (!raw?.trim()) {
      return undefined;
    }

    try {
      const envelope = JSON.parse(raw) as SectionEnvelope<T>;
      return envelope.data;
    } catch (err) {
      console.warn(`[InsightWorkbenchStorage] Failed to parse current.json for section "${section}"`, err);
      return undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Public API — snapshots
  // --------------------------------------------------------------------------

  /** Explicitly create a named snapshot for a section (e.g. "Before Q2 migration"). */
  async createSnapshot<T extends SectionData>(
    sectionData: T,
    label?: string
  ): Promise<StorageSnapshotMeta> {
    const snapshotId = uuidv4();
    const sectionPath = this.getSectionFolder(sectionData.section);
    const filePath = `${sectionPath}/snapshots/${snapshotId}.json`;

    const envelope: SectionEnvelope<T["data"]> = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      savedAtUtc: new Date().toISOString(),
      section: sectionData.section,
      snapshotId,
      label,
      data: sectionData.data,
    };

    await this.itemWrapper.writeFileAsText(filePath, JSON.stringify(envelope));

    const meta: StorageSnapshotMeta = {
      id: snapshotId,
      savedAtUtc: envelope.savedAtUtc,
      section: sectionData.section as StorageSnapshotMeta["section"],
      label,
      filePath,
      schemaVersion: STORAGE_SCHEMA_VERSION,
    };

    await this.addSnapshotToIndex(meta);
    await this.pruneOldSnapshots(sectionData.section);

    return meta;
  }

  /** Load a historical snapshot by its ID. */
  async loadSnapshot<T>(snapshotId: string): Promise<{ meta: StorageSnapshotMeta; data: T } | undefined> {
    const index = await this.loadSnapshotIndex();
    const meta = index.find((s) => s.id === snapshotId);
    if (!meta) {
      return undefined;
    }

    const raw = await this.itemWrapper.readFileAsText(meta.filePath);
    if (!raw?.trim()) {
      return undefined;
    }

    try {
      const envelope = JSON.parse(raw) as SectionEnvelope<T>;
      return { meta, data: envelope.data };
    } catch (err) {
      console.warn(`[InsightWorkbenchStorage] Failed to parse snapshot ${snapshotId}`, err);
      return undefined;
    }
  }

  /** Load all snapshot metadata for a section, sorted newest first. */
  async listSnapshots(section: StorageSection): Promise<StorageSnapshotMeta[]> {
    const index = await this.loadSnapshotIndex();
    return index
      .filter((s) => s.section === section || s.section === "all")
      .sort((a, b) => b.savedAtUtc.localeCompare(a.savedAtUtc));
  }

  /** Load all snapshot metadata across all sections, sorted newest first. */
  async listAllSnapshots(): Promise<StorageSnapshotMeta[]> {
    const index = await this.loadSnapshotIndex();
    return [...index].sort((a, b) => b.savedAtUtc.localeCompare(a.savedAtUtc));
  }

  /**
   * Compare two snapshots for the same section.
   * Returns the raw data objects of both so the caller can diff them.
   */
  async compareSnapshots<T>(
    snapshotIdA: string,
    snapshotIdB: string
  ): Promise<{ a: { meta: StorageSnapshotMeta; data: T } | undefined; b: { meta: StorageSnapshotMeta; data: T } | undefined }> {
    const [a, b] = await Promise.all([
      this.loadSnapshot<T>(snapshotIdA),
      this.loadSnapshot<T>(snapshotIdB),
    ]);
    return { a, b };
  }

  /**
   * Delete a snapshot by ID.
   * Updates the index but does NOT delete the file (for safety — OneLake delete is hard to undo).
   */
  async removeSnapshotFromIndex(snapshotId: string): Promise<void> {
    const index = await this.loadSnapshotIndex();
    const filtered = index.filter((s) => s.id !== snapshotId);
    await this.saveSnapshotIndex(filtered);
  }

  // --------------------------------------------------------------------------
  // Public API — folder management
  // --------------------------------------------------------------------------

  /**
   * Ensure the OneLake folder structure exists.
   * Call once after the user selects a folder or during initial setup.
   */
  async ensureFolderStructure(): Promise<void> {
    const root = this.getRootFolder();
    const sections: StorageSection[] = ["metadata", "semantic", "lineage", "reports", "tickets"];

    for (const section of sections) {
      const sectionPath = `${root}/${this.getSectionSubfolder(section)}`;
      await this.itemWrapper.createFolder(`${sectionPath}/snapshots`);
    }

    await this.itemWrapper.createFolder(`${this.getSectionFolder("semantic")}/tmdl-snapshots`);
    await this.itemWrapper.createFolder(`${this.getSectionFolder("reports")}/def-snapshots`);
  }
  // Also create sub-folders for entity-level content snapshots
  async ensureEntitySnapshotFolders(): Promise<void> {
    const semanticPath = this.getSectionFolder("semantic");
    const reportsPath = this.getSectionFolder("reports");
    await this.itemWrapper.createFolder(`${semanticPath}/tmdl-snapshots`);
    await this.itemWrapper.createFolder(`${reportsPath}/def-snapshots`);
  }

  // --------------------------------------------------------------------------
  // Public API — entity content snapshots (TMDL + report JSON)
  // --------------------------------------------------------------------------

  /**
   * Save the full TMDL content of a semantic model as a named snapshot.
   * Stored as raw text at: <root>/semantic/tmdl-snapshots/<uuid>.tmdl
   */
  async saveModelTmdlSnapshot(
    modelId: string,
    modelName: string,
    workspaceId: string,
    tmdlContent: string,
    label?: string
  ): Promise<EntitySnapshotMeta> {
    const id = uuidv4();
    const filePath = `${this.getSectionFolder("semantic")}/tmdl-snapshots/${id}.tmdl`;
    await this.itemWrapper.writeFileAsText(filePath, tmdlContent);

    const meta: EntitySnapshotMeta = {
      id,
      entityType: "tmdl",
      entityId: modelId,
      workspaceId,
      displayName: modelName,
      savedAtUtc: new Date().toISOString(),
      filePath,
      label,
    };
    await this.addEntitySnapshotToIndex(meta);
    return meta;
  }

  /**
   * Save the Power BI report definition JSON as a named snapshot.
   * Stored as raw JSON text at: <root>/reports/def-snapshots/<uuid>.json
   */
  async saveReportSnapshot(
    workspaceId: string,
    reportId: string,
    reportName: string,
    definitionJson: object,
    label?: string
  ): Promise<EntitySnapshotMeta> {
    const id = uuidv4();
    const filePath = `${this.getSectionFolder("reports")}/def-snapshots/${id}.json`;
    await this.itemWrapper.writeFileAsText(filePath, JSON.stringify(definitionJson, null, 2));

    const meta: EntitySnapshotMeta = {
      id,
      entityType: "report",
      entityId: reportId,
      workspaceId,
      displayName: reportName,
      savedAtUtc: new Date().toISOString(),
      filePath,
      label,
    };
    await this.addEntitySnapshotToIndex(meta);
    return meta;
  }

  /**
   * List entity content snapshots, optionally filtered by type and entity ID.
   * Returns newest first.
   */
  async listEntitySnapshots(
    entityType?: "tmdl" | "report",
    entityId?: string
  ): Promise<EntitySnapshotMeta[]> {
    const index = await this.loadEntitySnapshotIndex();
    return index
      .filter((s) => (!entityType || s.entityType === entityType) && (!entityId || s.entityId === entityId))
      .sort((a, b) => b.savedAtUtc.localeCompare(a.savedAtUtc));
  }

  /**
   * Load raw content for an entity snapshot by ID.
   * Returns the raw string (TMDL text or report JSON text).
   */
  async loadEntitySnapshotContent(snapshotId: string): Promise<{ meta: EntitySnapshotMeta; content: string } | undefined> {
    const index = await this.loadEntitySnapshotIndex();
    const meta = index.find((s) => s.id === snapshotId);
    if (!meta) return undefined;
    const content = await this.itemWrapper.readFileAsText(meta.filePath);
    if (!content?.trim()) return undefined;
    return { meta, content };
  }

  /** Returns the root folder path as configured (or default). */
  getRootFolder(): string {
    const raw = (this.settings.rootFolderPath ?? "").trim();
    if (!raw || !raw.toLowerCase().startsWith(`${FILE_FOLDER_NAME.toLowerCase()}/`)) {
      return DEFAULT_ROOT_FOLDER;
    }
    return raw;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private getSectionSubfolder(section: StorageSection): string {
    return this.settings.sectionPaths?.[section] ?? DEFAULT_SECTION_PATHS[section];
  }

  private getSectionFolder(section: StorageSection): string {
    return `${this.getRootFolder()}/${this.getSectionSubfolder(section)}`;
  }

  private getIndexPath(): string {
    return `${this.getRootFolder()}/index.json`;
  }

  private getEntityIndexPath(): string {
    return `${this.getRootFolder()}/entity-snapshot-index.json`;
  }

  private async loadEntitySnapshotIndex(): Promise<EntitySnapshotMeta[]> {
    const indexPath = this.getEntityIndexPath();
    const exists = await this.itemWrapper.checkIfFileExists(indexPath);
    if (!exists) return [];
    const raw = await this.itemWrapper.readFileAsText(indexPath);
    if (!raw?.trim()) return [];
    try {
      const parsed = JSON.parse(raw) as EntitySnapshotIndexFile;
      return parsed.snapshots ?? [];
    } catch {
      return [];
    }
  }

  private async saveEntitySnapshotIndex(snapshots: EntitySnapshotMeta[]): Promise<void> {
    const indexFile: EntitySnapshotIndexFile = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      updatedAtUtc: new Date().toISOString(),
      snapshots,
    };
    await this.itemWrapper.writeFileAsText(this.getEntityIndexPath(), JSON.stringify(indexFile));
  }

  private async addEntitySnapshotToIndex(meta: EntitySnapshotMeta): Promise<void> {
    const index = await this.loadEntitySnapshotIndex();
    index.push(meta);
    await this.saveEntitySnapshotIndex(index);
  }

  private async loadSnapshotIndex(): Promise<StorageSnapshotMeta[]> {
    const indexPath = this.getIndexPath();
    const exists = await this.itemWrapper.checkIfFileExists(indexPath);
    if (!exists) {
      return [];
    }

    const raw = await this.itemWrapper.readFileAsText(indexPath);
    if (!raw?.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as SnapshotIndexFile;
      return parsed.snapshots ?? [];
    } catch {
      return [];
    }
  }

  private async saveSnapshotIndex(snapshots: StorageSnapshotMeta[]): Promise<void> {
    const indexFile: SnapshotIndexFile = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      updatedAtUtc: new Date().toISOString(),
      snapshots,
    };
    await this.itemWrapper.writeFileAsText(this.getIndexPath(), JSON.stringify(indexFile));
  }

  private async addSnapshotToIndex(meta: StorageSnapshotMeta): Promise<void> {
    const index = await this.loadSnapshotIndex();
    index.push(meta);
    await this.saveSnapshotIndex(index);
  }

  private async pruneOldSnapshots(section: StorageSection): Promise<void> {
    const maxSnapshots = this.settings.maxSnapshotsPerSection ?? DEFAULT_MAX_SNAPSHOTS;
    const index = await this.loadSnapshotIndex();
    const sectionSnapshots = index
      .filter((s) => s.section === section)
      .sort((a, b) => a.savedAtUtc.localeCompare(b.savedAtUtc)); // oldest first

    if (sectionSnapshots.length <= maxSnapshots) {
      return;
    }

    const toRemove = sectionSnapshots.slice(0, sectionSnapshots.length - maxSnapshots);
    const toRemoveIds = new Set(toRemove.map((s) => s.id));
    const remaining = index.filter((s) => !toRemoveIds.has(s.id));
    await this.saveSnapshotIndex(remaining);
    // Note: we intentionally do NOT delete the OneLake files (hard to undo).
    // The admin setup script or future maintenance task handles file cleanup.
  }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Creates an InsightWorkbenchStorageService instance when storage is enabled.
 * Returns undefined if settings are not enabled or incomplete.
 */
export function createStorageService(
  workloadClient: WorkloadClientAPI,
  itemRef: ItemReference,
  settings: InsightWorkbenchStorageSettings | undefined
): InsightWorkbenchStorageService | undefined {
  if (!settings?.enabled) {
    return undefined;
  }
  return new InsightWorkbenchStorageService(workloadClient, itemRef, settings);
}
