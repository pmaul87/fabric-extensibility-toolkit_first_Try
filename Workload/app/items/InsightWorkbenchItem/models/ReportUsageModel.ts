import { MetadataExplorerClient } from "../../../clients/MetadataExplorerClient";
import {
  ExplorerArtifact,
  LoadReportDefinitionResponse,
  LineageLink,
  ReportDefinition,
  formatApiError,
} from "../../../services/MetadataService";
import {
  SemanticDependency,
  SemanticEntity,
  SemanticModel,
} from "../../../services/SemanticAnalyzerService";

export interface ReportVisualElement {
  key: string;
  name: string;
  kind: string;
  sourcePath: string;
}

export interface ReportVisual {
  id: string;
  name: string;
  type: string;
  elements: ReportVisualElement[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
}

export interface ReportPage {
  id: string;
  name: string;
  visuals: ReportVisual[];
  width?: number;
  height?: number;
}

export interface ReportDataField {
  key: string;
  tableName?: string;
  fieldName: string;
  kind: "Column" | "Measure" | "Field";
}

export interface ReportHierarchy {
  reportId: string;
  reportName: string;
  pages: ReportPage[];
  dataFields: ReportDataField[];
}

export interface ParsedDefinitionPart {
  path: string;
  json?: unknown;
}

export interface ReportJsonVisualRow {
  key: string;
  fieldName: string;
  value: string;
}

export interface ReportJsonVisualGroup {
  key: string;
  title: string;
  name: string;
  visualType: string;
  filter: string;
  visuals: ReportJsonVisualRow[];
}

export interface ReportJsonSectionTable {
  key: string;
  displayName: string;
  visualGroups: ReportJsonVisualGroup[];
}

export interface ReportTableFieldSummaryRow {
  table: string;
  fields: string[];
}

export type ReportUsageKind = "direct" | "dependency" | "table";

export interface EntityReportUsageReference {
  reportId: string;
  reportName: string;
  workspaceId: string;
  workspaceName: string;
  usageKind: ReportUsageKind;
}

export interface EntityReportUsageSummary {
  entityId: string;
  reportCount: number;
  directReportCount: number;
  reports: EntityReportUsageReference[];
}

export interface ScannedReportUsage {
  report: ExplorerArtifact;
  parsedParts: ParsedDefinitionPart[];
  hierarchy?: ReportHierarchy;
  reportJsonTable: ReportJsonSectionTable[];
  tableFieldSummary: ReportTableFieldSummaryRow[];
  debugJson: unknown;
  usageKindByEntityId: Record<string, ReportUsageKind>;
  errorText?: string;
}

export interface SemanticModelReportUsageSummary {
  reports: ScannedReportUsage[];
  entityUsageById: Record<string, EntityReportUsageSummary>;
  reportsUsingModel: ExplorerArtifact[];
  scanErrors: string[];
}

const reportDefinitionCache = new Map<string, Promise<LoadReportDefinitionResponse>>();

function decodeInlineBase64(payload: string): string {
  const decodedBinary = atob(payload);
  const bytes = Uint8Array.from(decodedBinary, (char) => char.charCodeAt(0));
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(bytes);
}

function toHumanReadableName(value: string | undefined, fallback: string): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return value
    .replace(/[\-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseQueryRef(value: string): { tableName?: string; fieldName: string; kind: "Column" | "Measure" | "Field" } {
  const withTable = value.match(/^'([^']+)'\[([^\]]+)\]$/);
  if (withTable) {
    return {
      tableName: withTable[1],
      fieldName: withTable[2],
      kind: "Column",
    };
  }

  const withoutTable = value.match(/^\[([^\]]+)\]$/);
  if (withoutTable) {
    return {
      fieldName: withoutTable[1],
      kind: "Measure",
    };
  }

  return {
    fieldName: value,
    kind: "Field",
  };
}

function extractVisualElements(visualJson: unknown): ReportVisualElement[] {
  const elements = new Map<string, ReportVisualElement>();

  const register = (name: string, kind: string, sourcePath: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return;
    }

    const key = `${kind}:${normalizedName.toLowerCase()}:${sourcePath.toLowerCase()}`;
    if (elements.has(key)) {
      return;
    }

    elements.set(key, {
      key,
      name: normalizedName,
      kind,
      sourcePath,
    });
  };

  const walk = (value: unknown, path: string) => {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.queryRef === "string") {
      register(record.queryRef, "Data field", `${path}.queryRef`);
    }

    const primitiveFieldKeys = ["column", "measure", "field", "entity", "table", "expression"];
    for (const key of primitiveFieldKeys) {
      if (typeof record[key] === "string") {
        register(String(record[key]), "Reference", `${path}.${key}`);
      }
    }

    for (const [key, nestedValue] of Object.entries(record)) {
      const nextPath = path ? `${path}.${key}` : key;
      walk(nestedValue, nextPath);
    }
  };

  walk(visualJson, "visual");
  const result = [...elements.values()].sort((left, right) => left.name.localeCompare(right.name));
  return result;
}

export function parseDefinitionParts(definition: ReportDefinition | undefined): ParsedDefinitionPart[] {
  if (!definition?.parts || definition.parts.length === 0) {
    return [];
  }

  const parsedParts: ParsedDefinitionPart[] = [];

  for (const part of definition.parts) {
    if (part.payloadType !== "InlineBase64") {
      continue;
    }

    try {
      const text = decodeInlineBase64(part.payload);
      parsedParts.push({
        path: part.path,
        json: JSON.parse(text),
      });
    } catch {
      parsedParts.push({ path: part.path });
    }
  }

  return parsedParts;
}

function parseJsonString(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function extractProjectionNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names: string[] = [];
  for (const entry of value) {
    const queryRef = (entry as Record<string, unknown>)?.queryRef;
    if (typeof queryRef === "string" && queryRef.trim().length > 0) {
      names.push(queryRef.trim());
    }
  }

  return names;
}

function resolveSelectEntryToField(
  entry: Record<string, unknown>,
  aliasMap: Record<string, string>
): string | undefined {
  const column = entry.Column as Record<string, unknown> | undefined;
  if (column) {
    const source = ((column.Expression as Record<string, unknown> | undefined)?.SourceRef as Record<string, unknown> | undefined)?.Source as string | undefined;
    const property = column.Property as string | undefined;
    if (source && property) {
      const entity = aliasMap[source] || source;
      return `${entity}.${property}`;
    }
  }

  const aggregation = entry.Aggregation as Record<string, unknown> | undefined;
  if (aggregation) {
    const innerColumn = (aggregation.Expression as Record<string, unknown> | undefined)?.Column as Record<string, unknown> | undefined;
    if (innerColumn) {
      const source = ((innerColumn.Expression as Record<string, unknown> | undefined)?.SourceRef as Record<string, unknown> | undefined)?.Source as string | undefined;
      const property = innerColumn.Property as string | undefined;
      if (source && property) {
        const entity = aliasMap[source] || source;
        return `${entity}.${property}`;
      }
    }
  }

  const measure = entry.Measure as Record<string, unknown> | undefined;
  if (measure) {
    const source = ((measure.Expression as Record<string, unknown> | undefined)?.SourceRef as Record<string, unknown> | undefined)?.Source as string | undefined;
    const property = measure.Property as string | undefined;
    if (source && property) {
      const entity = aliasMap[source] || source;
      return `${entity}.${property}`;
    }
  }

  return undefined;
}

function extractQueryStateBindings(
  singleVisual: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined
): Record<string, string> {
  const dynamicValues: Record<string, string> = {};

  const protoQuery = singleVisual?.prototypeQuery as Record<string, unknown> | undefined;
  if (protoQuery && typeof protoQuery === "object") {
    const fromArray = Array.isArray(protoQuery.From) ? (protoQuery.From as unknown[]) : [];
    const aliasMap: Record<string, string> = {};
    for (const fromEntry of fromArray) {
      const fromRecord = fromEntry as Record<string, unknown>;
      if (typeof fromRecord.Name === "string" && typeof fromRecord.Entity === "string") {
        aliasMap[fromRecord.Name] = fromRecord.Entity;
      }
    }

    const selectArray = Array.isArray(protoQuery.Select) ? (protoQuery.Select as unknown[]) : [];
    for (const selectEntry of selectArray) {
      const selectRecord = selectEntry as Record<string, unknown>;
      const selectName = typeof selectRecord.Name === "string" ? selectRecord.Name : undefined;
      const resolved = resolveSelectEntryToField(selectRecord, aliasMap);
      if (resolved) {
        const key = selectName || resolved;
        dynamicValues[key] = resolved;
      }
    }

    if (Object.keys(dynamicValues).length > 0) {
      return dynamicValues;
    }
  }

  const queryState = (singleVisual?.query as Record<string, unknown> | undefined)?.queryState as
    | Record<string, unknown>
    | undefined;

  if (queryState && typeof queryState === "object") {
    for (const [projectionName, projectionData] of Object.entries(queryState)) {
      const projections = Array.isArray((projectionData as Record<string, unknown>)?.projections)
        ? ((projectionData as Record<string, unknown>)?.projections as unknown[])
        : [];

      const bindings: string[] = [];
      for (const projection of projections) {
        const projectionRecord = (projection as Record<string, unknown>) || {};
        const field = (projectionRecord.field as Record<string, unknown> | undefined) || {};

        const column = (field.Column as Record<string, unknown> | undefined) || undefined;
        const measure = (field.Measure as Record<string, unknown> | undefined) || undefined;
        const fieldEntry = column || measure;
        if (!fieldEntry) {
          continue;
        }

        const expression = (fieldEntry as Record<string, unknown>).Expression as Record<string, unknown> | undefined;
        const sourceRef = expression?.SourceRef as Record<string, unknown> | undefined;
        const entity = sourceRef?.Entity as string | undefined;
        const property = (fieldEntry as Record<string, unknown>).Property as string | undefined;

        if (entity && property) {
          bindings.push(`${entity}.${property}`);
        }
      }

      if (bindings.length > 0) {
        dynamicValues[projectionName] = bindings.join(" | ");
      }
    }
  }

  return dynamicValues;
}

function findStringByKeysDeep(value: unknown, keys: Set<string>): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findStringByKeysDeep(entry, keys);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (keys.has(key.toLowerCase()) && typeof nested === "string" && nested.trim().length > 0) {
      return nested.trim();
    }
  }

  for (const nested of Object.values(record)) {
    const found = findStringByKeysDeep(nested, keys);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function normalizeTitleLiteral(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractVisualTitle(
  singleVisual: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined
): string {
  if (typeof singleVisual?.title === "string" && singleVisual.title.trim().length > 0) {
    return singleVisual.title.trim();
  }

  const titleValue =
    ((((singleVisual?.vcObjects as Record<string, unknown> | undefined)?.title as unknown[] | undefined)?.[0] as
      | Record<string, unknown>
      | undefined)?.properties as Record<string, unknown> | undefined)?.text as
      | Record<string, unknown>
      | undefined;

  const literalValue = (((titleValue?.expr as Record<string, unknown> | undefined)?.Literal as Record<string, unknown> | undefined)?.Value);
  if (typeof literalValue === "string" && literalValue.trim().length > 0) {
    return normalizeTitleLiteral(literalValue);
  }

  const fallback = findStringByKeysDeep(config, new Set(["title", "displayname"]));
  return fallback || "";
}

function extractVisualFilterSummary(config: Record<string, unknown> | undefined): string {
  const filters = config?.filters;
  if (!Array.isArray(filters) || filters.length === 0) {
    return "";
  }

  const filterTargets: string[] = [];
  for (const filter of filters) {
    const queryRef = findStringByKeysDeep(filter, new Set(["queryref"]));
    if (queryRef) {
      filterTargets.push(queryRef);
      continue;
    }

    const tableName = findStringByKeysDeep(filter, new Set(["table", "entity"]));
    const columnName = findStringByKeysDeep(filter, new Set(["column", "measure", "field"]));
    if (tableName && columnName) {
      filterTargets.push(`${tableName}.${columnName}`);
      continue;
    }

    if (columnName) {
      filterTargets.push(columnName);
    }
  }

  if (filterTargets.length === 0) {
    return `${filters.length} filter(s)`;
  }

  const uniqueTargets = [...new Set(filterTargets)];
  return uniqueTargets.join(", ");
}

export function buildTableFieldSummary(sections: ReportJsonSectionTable[]): ReportTableFieldSummaryRow[] {
  const tableFieldMap = new Map<string, Set<string>>();

  for (const section of sections) {
    for (const group of section.visualGroups) {
      for (const row of group.visuals) {
        const parts = row.value.split(" | ");
        for (const part of parts) {
          const dotIndex = part.indexOf(".");
          if (dotIndex > 0) {
            const tableName = part.slice(0, dotIndex).trim();
            const fieldName = part.slice(dotIndex + 1).trim();
            if (tableName && fieldName) {
              if (!tableFieldMap.has(tableName)) {
                tableFieldMap.set(tableName, new Set());
              }
              tableFieldMap.get(tableName)?.add(fieldName);
            }
          }
        }
      }
    }
  }

  return Array.from(tableFieldMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([table, fieldSet]) => ({
      table,
      fields: Array.from(fieldSet).sort((left, right) => left.localeCompare(right)),
    }));
}

export function buildReportJsonTable(parsedParts: ParsedDefinitionPart[]): ReportJsonSectionTable[] {
  const reportJson = parsedParts.find((part) => part.path.endsWith("report.json"))?.json;
  if (!reportJson || typeof reportJson !== "object") {
    return [];
  }

  const sections = (reportJson as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) {
    return [];
  }

  const nativeRefKeys = new Set(["nativereferencename", "nativequeryref", "queryref"]);

  return sections.map((section, sectionIndex) => {
    const sectionRecord = (section as Record<string, unknown>) || {};
    const sectionDisplayName =
      (typeof sectionRecord.displayName === "string" && sectionRecord.displayName.trim()) ||
      (typeof sectionRecord.name === "string" && sectionRecord.name.trim()) ||
      `Section ${sectionIndex + 1}`;

    const visualContainers = Array.isArray(sectionRecord.visualContainers)
      ? (sectionRecord.visualContainers as unknown[])
      : [];

    const visualGroups: ReportJsonVisualGroup[] = visualContainers.map((container, visualIndex) => {
      const containerRecord = (container as Record<string, unknown>) || {};
      const config = parseJsonString(containerRecord.config);
      const singleVisual = (config?.singleVisual as Record<string, unknown> | undefined) || undefined;
      const projections = (singleVisual?.projections as Record<string, unknown> | undefined) || undefined;

      const visualType =
        (typeof singleVisual?.visualType === "string" && singleVisual.visualType.trim()) ||
        (typeof containerRecord.visualType === "string" && containerRecord.visualType.trim()) ||
        "unknown";

      const rowsValues = extractProjectionNames(projections?.Rows);
      const columnsValues = extractProjectionNames(projections?.Columns);
      const nativeReferenceName =
        findStringByKeysDeep(singleVisual, nativeRefKeys) ||
        findStringByKeysDeep(config, nativeRefKeys) ||
        "";

      const visualName =
        (typeof singleVisual?.name === "string" && singleVisual.name.trim()) ||
        (typeof config?.name === "string" && config.name.trim()) ||
        (typeof containerRecord.name === "string" && containerRecord.name.trim()) ||
        "";

      const visualTitle = extractVisualTitle(singleVisual, config);
      const visualFilter = extractVisualFilterSummary(config);
      const dynamicValues = extractQueryStateBindings(singleVisual, config);

      const rows: ReportJsonVisualRow[] = [];

      for (const [fieldName, value] of Object.entries(dynamicValues)) {
        rows.push({
          key: `${sectionDisplayName}:${visualIndex}:${fieldName}`,
          fieldName,
          value,
        });
      }

      if (rowsValues.length > 0) {
        rows.push({
          key: `${sectionDisplayName}:${visualIndex}:Rows`,
          fieldName: "Rows",
          value: rowsValues.join(", "),
        });
      }

      if (columnsValues.length > 0) {
        rows.push({
          key: `${sectionDisplayName}:${visualIndex}:Columns`,
          fieldName: "Columns",
          value: columnsValues.join(", "),
        });
      }

      if (nativeReferenceName) {
        rows.push({
          key: `${sectionDisplayName}:${visualIndex}:NativeReferenceName`,
          fieldName: "NativeReferenceName",
          value: nativeReferenceName,
        });
      }

      return {
        key: `${sectionDisplayName}:${visualIndex}`,
        title: visualTitle,
        name: visualName,
        visualType,
        filter: visualFilter,
        visuals: rows,
      };
    });

    return {
      key: `${sectionDisplayName}:${sectionIndex}`,
      displayName: sectionDisplayName,
      visualGroups,
    };
  });
}

export function buildHierarchy(
  report: ExplorerArtifact,
  parsedParts: ParsedDefinitionPart[]
): ReportHierarchy {
  const reportJson = parsedParts.find((part) => part.path.endsWith("report.json"))?.json as
    | Record<string, unknown>
    | undefined;

  const pageMap = new Map<string, ReportPage>();

  const ensurePage = (pageId: string, pageName?: string): ReportPage => {
    const existing = pageMap.get(pageId);
    if (existing) {
      if (pageName && existing.name === pageId) {
        existing.name = pageName;
      }
      return existing;
    }

    const nextPage: ReportPage = {
      id: pageId,
      name: pageName || toHumanReadableName(pageId, pageId),
      visuals: [],
    };

    pageMap.set(pageId, nextPage);
    return nextPage;
  };

  // Handle report.json with sections array (traditional Power BI structure)
  if (reportJson && typeof reportJson === 'object') {
    const sections = (reportJson as Record<string, unknown>).sections;
    if (Array.isArray(sections)) {
      
      sections.forEach((section, sectionIndex) => {
        const sectionRecord = (section as Record<string, unknown>) || {};
        const pageId = `section_${sectionIndex}`;
        const pageName =
          (typeof sectionRecord.displayName === "string" && sectionRecord.displayName.trim()) ||
          (typeof sectionRecord.name === "string" && sectionRecord.name.trim()) ||
          `Page ${sectionIndex + 1}`;
        
        const page = ensurePage(pageId, pageName);
        
        // Extract page dimensions if available
        if (typeof sectionRecord.width === "number") {
          page.width = sectionRecord.width;
        }
        if (typeof sectionRecord.height === "number") {
          page.height = sectionRecord.height;
        }
        
        // Check config for dimensions
        const sectionConfig = parseJsonString(sectionRecord.config);
        if (sectionConfig && typeof sectionConfig === 'object') {
          const scw = sectionConfig.width;
          const sch = sectionConfig.height;
          if (typeof scw === "number" && !page.width) {
            page.width = scw;
          }
          if (typeof sch === "number" && !page.height) {
            page.height = sch;
          }
        }
        
        // Extract visuals from visualContainers
        const visualContainers = Array.isArray(sectionRecord.visualContainers)
          ? (sectionRecord.visualContainers as unknown[])
          : [];

        visualContainers.forEach((container, visualIndex) => {
          const containerRecord = (container as Record<string, unknown>) || {};
          const config = parseJsonString(containerRecord.config);
          const singleVisual = (config?.singleVisual as Record<string, unknown> | undefined) || undefined;
          
          const visualType =
            (typeof singleVisual?.visualType === "string" && singleVisual.visualType.trim()) ||
            (typeof containerRecord.visualType === "string" && containerRecord.visualType.trim()) ||
            "unknown";
          
          const visualName =
            (typeof singleVisual?.name === "string" && singleVisual.name.trim()) ||
            (typeof config?.name === "string" && config.name.trim()) ||
            (typeof containerRecord.name === "string" && containerRecord.name.trim()) ||
            `Visual ${visualIndex + 1}`;
          
          const visual: ReportVisual = {
            id: `${pageId}_visual_${visualIndex}`,
            name: visualName,
            type: visualType,
            elements: [],
          };
          
          // Extract position data from multiple possible locations
          
          // Check container direct properties
          if (typeof containerRecord.x === "number") {
            visual.x = containerRecord.x;
          }
          if (typeof containerRecord.y === "number") {
            visual.y = containerRecord.y;
          }
          if (typeof containerRecord.width === "number") {
            visual.width = containerRecord.width;
          }
          if (typeof containerRecord.height === "number") {
            visual.height = containerRecord.height;
          }
          if (typeof containerRecord.z === "number") {
            visual.z = containerRecord.z;
          }
          
          // Check config object
          if (config && typeof config === 'object') {
            const cx = config.x, cy = config.y, cw = config.width, ch = config.height, cz = config.z;
            if (typeof cx === "number" && !visual.x) { visual.x = cx; }
            if (typeof cy === "number" && !visual.y) { visual.y = cy; }
            if (typeof cw === "number" && !visual.width) { visual.width = cw; }
            if (typeof ch === "number" && !visual.height) { visual.height = ch; }
            if (typeof cz === "number" && !visual.z) { visual.z = cz; }
          }
          
          // Check singleVisual object
          if (singleVisual) {
            if (typeof singleVisual.x === "number" && !visual.x) {
              visual.x = singleVisual.x;
            }
            if (typeof singleVisual.y === "number" && !visual.y) {
              visual.y = singleVisual.y;
            }
            if (typeof singleVisual.width === "number" && !visual.width) {
              visual.width = singleVisual.width;
            }
            if (typeof singleVisual.height === "number" && !visual.height) {
              visual.height = singleVisual.height;
            }
            if (typeof singleVisual.z === "number" && !visual.z) {
              visual.z = singleVisual.z;
            }
          }
          
          page.visuals.push(visual);
        });
      });
    } else {
      // No sections array in report.json - will rely on per-file visual paths below
    }
  }

  const visualPathPattern = /pages\/([^/]+)\/visuals\/([^/]+)\/.+\.json$/i;
  const pagePathPattern = /pages\/([^/]+)\/page\.json$/i;

  for (const part of parsedParts) {
    const pageMatch = part.path.match(pagePathPattern);
    if (pageMatch) {
      const pageId = pageMatch[1];
      const pageJson = part.json as Record<string, unknown> | undefined;
      const pageName =
        (typeof pageJson?.displayName === "string" && pageJson.displayName) ||
        (typeof pageJson?.name === "string" && pageJson.name) ||
        toHumanReadableName(pageId, pageId);

      const page = ensurePage(pageId, pageName);
      
      // Extract page dimensions if available - check multiple locations
      if (typeof pageJson?.width === "number") {
        page.width = pageJson.width;
      }
      if (typeof pageJson?.height === "number") {
        page.height = pageJson.height;
      }

      // Check config object
      if (isJsonRecord(pageJson?.config)) {
        const config = pageJson.config as Record<string, unknown>;
        if (typeof config.width === "number" && !page.width) {
          page.width = config.width;
        }
        if (typeof config.height === "number" && !page.height) {
          page.height = config.height;
        }
      }
      
      continue;
    }

    const visualMatch = part.path.match(visualPathPattern);
    if (!visualMatch) {
      continue;
    }

    const pageId = visualMatch[1];
    const visualId = visualMatch[2];
    const visualJson = part.json as Record<string, unknown> | undefined;

    const page = ensurePage(pageId);

    const visualName =
      (typeof visualJson?.title === "string" && visualJson.title) ||
      (typeof visualJson?.name === "string" && visualJson.name) ||
      toHumanReadableName(visualId, visualId);

    const visualType =
      (typeof visualJson?.visualType === "string" && visualJson.visualType) ||
      (typeof visualJson?.type === "string" && visualJson.type) ||
      "unknown";

    // Extract position and dimensions - check multiple possible locations
    // Power BI stores positions in various places depending on format version
    let x: number | undefined;
    let y: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let z: number | undefined;

    // Try direct properties first
    if (typeof visualJson?.x === "number") x = visualJson.x;
    if (typeof visualJson?.y === "number") y = visualJson.y;
    if (typeof visualJson?.width === "number") width = visualJson.width;
    if (typeof visualJson?.height === "number") height = visualJson.height;
    if (typeof visualJson?.z === "number") z = visualJson.z;

    // Try position object
    if (isJsonRecord(visualJson?.position)) {
      const pos = visualJson.position;
      if (typeof pos.x === "number") x = pos.x;
      if (typeof pos.y === "number") y = pos.y;
      if (typeof pos.width === "number") width = pos.width;
      if (typeof pos.height === "number") height = pos.height;
      if (typeof pos.z === "number") z = pos.z;
    }

    // Try config object (common in PBIX)
    if (isJsonRecord(visualJson?.config)) {
      const config = visualJson.config as Record<string, unknown>;
      if (typeof config.x === "number") x = config.x;
      if (typeof config.y === "number") y = config.y;
      if (typeof config.width === "number") width = config.width;
      if (typeof config.height === "number") height = config.height;
      if (typeof config.z === "number") z = config.z;

      // Sometimes nested further in config.singleVisual
      if (isJsonRecord(config.singleVisual)) {
        const sv = config.singleVisual as Record<string, unknown>;
        if (typeof sv.x === "number") x = sv.x;
        if (typeof sv.y === "number") y = sv.y;
        if (typeof sv.width === "number") width = sv.width;
        if (typeof sv.height === "number") height = sv.height;
        if (typeof sv.z === "number") z = sv.z;
      }
    }

    page.visuals.push({
      id: visualId,
      name: visualName,
      type: visualType,
      elements: extractVisualElements(visualJson),
      x,
      y,
      width,
      height,
      z,
    });
  }

  const dataFieldMap = new Map<string, ReportDataField>();

  for (const page of pageMap.values()) {
    for (const visual of page.visuals) {
      for (const element of visual.elements) {
        if (element.kind !== "Data field") {
          continue;
        }

        const parsed = parseQueryRef(element.name);
        const key = `${parsed.kind}:${parsed.tableName || ""}:${parsed.fieldName}`.toLowerCase();

        if (!dataFieldMap.has(key)) {
          dataFieldMap.set(key, {
            key,
            tableName: parsed.tableName,
            fieldName: parsed.fieldName,
            kind: parsed.kind,
          });
        }
      }
    }
  }

  const pages = [...pageMap.values()]
    .map((page) => ({
      ...page,
      visuals: [...page.visuals].sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const reportNameFromDefinition =
    (typeof reportJson?.displayName === "string" && reportJson.displayName) ||
    (typeof reportJson?.name === "string" && reportJson.name) ||
    report.displayName;

  const result = {
    reportId: report.id,
    reportName: reportNameFromDefinition,
    pages,
    dataFields: [...dataFieldMap.values()].sort((left, right) => {
      const leftName = `${left.tableName || ""}.${left.fieldName}`;
      const rightName = `${right.tableName || ""}.${right.fieldName}`;
      return leftName.localeCompare(rightName);
    }),
  };

  console.log(`[ReportHierarchy] Built hierarchy for ${reportNameFromDefinition}:`, {
    reportId: result.reportId,
    pageCount: result.pages.length,
    totalVisuals: result.pages.reduce((sum, p) => sum + p.visuals.length, 0),
  });

  return result;
}

function decodeDefinitionParts(
  parts: ReportDefinition["parts"] | undefined
): { path: string; payloadType: string; decoded: unknown }[] {
  if (!parts) {
    return [];
  }

  return parts.map((part) => {
    if (part.payloadType !== "InlineBase64" || !part.payload) {
      return { path: part.path, payloadType: part.payloadType, decoded: part.payload ?? null };
    }

    try {
      const text = decodeInlineBase64(part.payload);
      try {
        return { path: part.path, payloadType: part.payloadType, decoded: JSON.parse(text) };
      } catch {
        return { path: part.path, payloadType: part.payloadType, decoded: text };
      }
    } catch {
      return { path: part.path, payloadType: part.payloadType, decoded: `<decode error: ${part.payload.slice(0, 40)}…>` };
    }
  });
}

export function buildDebugJson(
  response: LoadReportDefinitionResponse | undefined
): unknown {
  if (!response) {
    return undefined;
  }

  return {
    source: response.source,
    operationStatus: response.operationStatus,
    fetchedAt: response.fetchedAt,
    parts: decodeDefinitionParts(response.definition?.parts),
  };
}

function normalizeName(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeFieldKey(tableName: string | undefined, fieldName: string | undefined): string {
  return `${normalizeName(tableName)}|${normalizeName(fieldName)}`;
}

async function loadCachedReportDefinition(
  metadataClient: MetadataExplorerClient,
  report: ExplorerArtifact
): Promise<LoadReportDefinitionResponse> {
  const cacheKey = `${report.workspaceId}:${report.id}`;
  const existing = reportDefinitionCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = metadataClient
    .loadReportDefinition({
      workspaceId: report.workspaceId,
      reportId: report.id,
    })
    .catch((error) => {
      reportDefinitionCache.delete(cacheKey);
      throw error;
    });

  reportDefinitionCache.set(cacheKey, promise);
  return promise;
}

function buildUsageKindByEntityId(
  entities: SemanticEntity[],
  dependencies: SemanticDependency[],
  hierarchy: ReportHierarchy | undefined,
  tableFieldSummary: ReportTableFieldSummaryRow[]
): Record<string, ReportUsageKind> {
  const entityIdsByFieldKey = new Map<string, string[]>();
  const measureIdsByName = new Map<string, string[]>();
  const tableEntityIdByName = new Map<string, string>();
  const entityById = new Map<string, SemanticEntity>(entities.map((entity) => [entity.id, entity]));

  for (const entity of entities) {
    if (entity.type === "Table") {
      tableEntityIdByName.set(normalizeName(entity.name), entity.id);
      continue;
    }

    if (entity.type === "Column" || entity.type === "Measure") {
      const fieldKey = normalizeFieldKey(entity.tableName, entity.name);
      entityIdsByFieldKey.set(fieldKey, [...(entityIdsByFieldKey.get(fieldKey) ?? []), entity.id]);
    }

    if (entity.type === "Measure") {
      const measureKey = normalizeName(entity.name);
      measureIdsByName.set(measureKey, [...(measureIdsByName.get(measureKey) ?? []), entity.id]);
    }
  }

  const assignKind = (map: Map<string, ReportUsageKind>, entityId: string, nextKind: ReportUsageKind) => {
    const current = map.get(entityId);
    const priority: Record<ReportUsageKind, number> = {
      table: 1,
      dependency: 2,
      direct: 3,
    };

    if (!current || priority[nextKind] > priority[current]) {
      map.set(entityId, nextKind);
    }
  };

  const directEntityIds = new Set<string>();
  const usageKindByEntityId = new Map<string, ReportUsageKind>();

  for (const row of tableFieldSummary) {
    const tableEntityId = tableEntityIdByName.get(normalizeName(row.table));
    if (tableEntityId) {
      assignKind(usageKindByEntityId, tableEntityId, "table");
    }

    for (const fieldName of row.fields) {
      const directMatches = entityIdsByFieldKey.get(normalizeFieldKey(row.table, fieldName)) ?? [];
      for (const entityId of directMatches) {
        directEntityIds.add(entityId);
        assignKind(usageKindByEntityId, entityId, "direct");
      }
    }
  }

  for (const field of hierarchy?.dataFields ?? []) {
    const directMatches = field.tableName
      ? entityIdsByFieldKey.get(normalizeFieldKey(field.tableName, field.fieldName)) ?? []
      : field.kind === "Measure"
        ? measureIdsByName.get(normalizeName(field.fieldName)) ?? []
        : [];

    for (const entityId of directMatches) {
      directEntityIds.add(entityId);
      assignKind(usageKindByEntityId, entityId, "direct");
    }
  }

  const dependencyTargetsBySourceId = new Map<string, string[]>();
  for (const dependency of dependencies) {
    dependencyTargetsBySourceId.set(dependency.sourceId, [
      ...(dependencyTargetsBySourceId.get(dependency.sourceId) ?? []),
      dependency.targetId,
    ]);
  }

  const queue = [...directEntityIds];
  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentEntityId = queue.shift();
    if (!currentEntityId) {
      continue;
    }

    for (const targetId of dependencyTargetsBySourceId.get(currentEntityId) ?? []) {
      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push(targetId);
      }

      if (!directEntityIds.has(targetId)) {
        assignKind(usageKindByEntityId, targetId, "dependency");
      }
    }
  }

  for (const entityId of new Set([...directEntityIds, ...visited])) {
    const entity = entityById.get(entityId);
    if (!entity?.tableName) {
      continue;
    }

    const tableEntityId = tableEntityIdByName.get(normalizeName(entity.tableName));
    if (tableEntityId) {
      assignKind(usageKindByEntityId, tableEntityId, "table");
    }
  }

  return Object.fromEntries(usageKindByEntityId.entries());
}

function buildEntityUsageById(reports: ScannedReportUsage[]): Record<string, EntityReportUsageSummary> {
  const usageMap = new Map<string, EntityReportUsageSummary>();

  for (const report of reports) {
    for (const [entityId, usageKind] of Object.entries(report.usageKindByEntityId)) {
      const current = usageMap.get(entityId) ?? {
        entityId,
        reportCount: 0,
        directReportCount: 0,
        reports: [],
      };

      current.reports.push({
        reportId: report.report.id,
        reportName: report.report.displayName,
        workspaceId: report.report.workspaceId,
        workspaceName: report.report.workspaceName,
        usageKind,
      });
      current.reportCount += 1;
      if (usageKind === "direct") {
        current.directReportCount += 1;
      }
      usageMap.set(entityId, current);
    }
  }

  for (const usage of usageMap.values()) {
    usage.reports.sort((left, right) => {
      return (
        left.workspaceName.localeCompare(right.workspaceName) ||
        left.reportName.localeCompare(right.reportName) ||
        left.reportId.localeCompare(right.reportId)
      );
    });
  }

  return Object.fromEntries(usageMap.entries());
}

export async function loadSemanticModelReportUsage(params: {
  metadataClient: MetadataExplorerClient;
  model: SemanticModel;
  entities: SemanticEntity[];
  dependencies: SemanticDependency[];
  artifacts?: ExplorerArtifact[];
  lineageLinks?: LineageLink[];
}): Promise<SemanticModelReportUsageSummary> {
  const { metadataClient, model, entities, dependencies } = params;

  const artifacts = params.artifacts ?? (await metadataClient.loadArtifacts({ includeTrace: false, maxArtifacts: 0 })).artifacts;
  const lineageLinks = params.lineageLinks ?? (await metadataClient.loadLineageLinks({ artifacts })).links;

  const artifactByCompositeId = new Map(artifacts.map((artifact) => [`${artifact.workspaceId}:${artifact.id}`, artifact]));
  const reportsUsingModel = lineageLinks
    .filter(
      (link) =>
        link.relationshipType === "report-uses-dataset" &&
        link.targetArtifactId === model.id &&
        link.targetWorkspaceId === model.workspaceId
    )
    .map((link) => artifactByCompositeId.get(`${link.sourceWorkspaceId}:${link.sourceArtifactId}`))
    .filter((artifact): artifact is ExplorerArtifact => Boolean(artifact))
    .sort((left, right) => {
      return (
        left.workspaceName.localeCompare(right.workspaceName) ||
        left.displayName.localeCompare(right.displayName) ||
        left.id.localeCompare(right.id)
      );
    });

  const uniqueReports = Array.from(
    new Map(reportsUsingModel.map((report) => [`${report.workspaceId}:${report.id}`, report])).values()
  );

  const scannedReports = await Promise.all(
    uniqueReports.map(async (report): Promise<ScannedReportUsage> => {
      try {
        const response = await loadCachedReportDefinition(metadataClient, report);
        const parsedParts = parseDefinitionParts(response.definition);
        const hierarchy = buildHierarchy(report, parsedParts);
        const reportJsonTable = buildReportJsonTable(parsedParts);
        const tableFieldSummary = buildTableFieldSummary(reportJsonTable);

        return {
          report,
          parsedParts,
          hierarchy,
          reportJsonTable,
          tableFieldSummary,
          debugJson: buildDebugJson(response),
          usageKindByEntityId: buildUsageKindByEntityId(entities, dependencies, hierarchy, tableFieldSummary),
        };
      } catch (error) {
        return {
          report,
          parsedParts: [],
          hierarchy: undefined,
          reportJsonTable: [],
          tableFieldSummary: [],
          debugJson: undefined,
          usageKindByEntityId: {},
          errorText: formatApiError(error),
        };
      }
    })
  );

  return {
    reports: scannedReports,
    entityUsageById: buildEntityUsageById(scannedReports),
    reportsUsingModel: uniqueReports,
    scanErrors: scannedReports
      .filter((report) => report.errorText)
      .map((report) => `${report.report.displayName}: ${report.errorText}`),
  };
}
