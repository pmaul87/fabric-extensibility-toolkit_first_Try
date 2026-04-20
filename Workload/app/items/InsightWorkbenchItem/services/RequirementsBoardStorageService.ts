import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { OneLakeStorageClient, FILE_FOLDER_NAME } from "../../../clients/OneLakeStorageClient";
import { ItemReference } from "../../../controller/ItemCRUDController";
import { RequirementsBoardState } from "../InsightWorkbenchItemDefinition";

const STORAGE_SCHEMA_VERSION = "1";
const DEFAULT_STORAGE_FILE_NAME = `${FILE_FOLDER_NAME}/requirements-board.tickets.v1.json`;

interface RequirementsBoardStorageEnvelope {
  schemaVersion: string;
  savedAtUtc: string;
  boardState: RequirementsBoardState;
}

/**
 * Persists Requirements Board tickets to OneLake so board content survives
 * browser reloads and dev session restarts without requiring manual item saves.
 */
export class RequirementsBoardStorageService {
  private readonly itemWrapper;
  private readonly storageFilePath;

  constructor(workloadClient: WorkloadClientAPI, itemRef: ItemReference, storageFilePath?: string) {
    this.itemWrapper = new OneLakeStorageClient(workloadClient).createItemWrapper(itemRef);
    this.storageFilePath = this.normalizeStoragePath(storageFilePath);
  }

  async load(): Promise<RequirementsBoardState | undefined> {
    const exists = await this.itemWrapper.checkIfFileExists(this.storageFilePath);
    if (!exists) {
      return undefined;
    }

    const content = await this.itemWrapper.readFileAsText(this.storageFilePath);
    if (!content || !content.trim()) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(content) as RequirementsBoardStorageEnvelope;
      if (!parsed?.boardState || parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) {
        return undefined;
      }

      return parsed.boardState;
    } catch (error) {
      console.warn("[RequirementsBoardStorage] Failed to parse persisted tickets", error);
      return undefined;
    }
  }

  async save(boardState: RequirementsBoardState): Promise<void> {
    const envelope: RequirementsBoardStorageEnvelope = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      savedAtUtc: new Date().toISOString(),
      boardState,
    };

    const serialized = JSON.stringify(envelope);
    await this.itemWrapper.writeFileAsText(this.storageFilePath, serialized);

    // OneLake client write methods can fail without throwing.
    // Verify immediately so callers can surface real persistence problems.
    const verification = await this.itemWrapper.readFileAsText(this.storageFilePath);
    if (!verification || verification.trim().length === 0) {
      throw new Error("Requirements board persistence verification failed.");
    }
  }

  private normalizeStoragePath(storageFilePath?: string): string {
    const raw = (storageFilePath ?? "").trim();
    if (!raw) {
      return DEFAULT_STORAGE_FILE_NAME;
    }

    const normalized = raw.replace(/\\+/g, "/");
    if (!normalized.toLowerCase().startsWith(`${FILE_FOLDER_NAME.toLowerCase()}/`)) {
      return DEFAULT_STORAGE_FILE_NAME;
    }

    return normalized;
  }
}
