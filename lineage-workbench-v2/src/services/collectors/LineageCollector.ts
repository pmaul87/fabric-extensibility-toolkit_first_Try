import type { GraphSnapshot } from "../../contracts/lineageSnapshot";
import type { CreateExtractionRequest, ExtractionRun } from "../../domain/extractionTypes";

export interface LineageCollector {
  collect(run: ExtractionRun, request: CreateExtractionRequest): Promise<GraphSnapshot>;
}
