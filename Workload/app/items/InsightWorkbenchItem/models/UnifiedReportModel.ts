import {
  ParsedDefinitionPart,
  buildReportJsonTable,
  buildTableFieldSummary,
  ReportJsonVisualGroup,
} from "./ReportUsageModel";
import { ExplorerArtifact } from "../../../services/MetadataService";

/**
 * Unified field reference that appears in visuals
 */
export interface UnifiedFieldReference {
  key: string;
  name: string; // Full name like "Table.Field" or just "Field"
  tableName?: string;
  fieldName: string;
  kind: "Column" | "Measure" | "Field" | "Reference";
  sourcePath: string;
}

/**
 * Unified visual with both position data AND field references
 */
export interface UnifiedVisual {
  id: string;
  name: string;
  title?: string;
  type: string;
  
  // Position data (for canvas preview)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  
  // Field/data references (for cross-highlighting)
  fields: UnifiedFieldReference[];
  
  // Additional metadata
  filter?: string;
  properties: Record<string, unknown>;
}

/**
 * Unified page/section with all data needed for both preview and table
 */
export interface UnifiedPage {
  id: string;
  name: string;
  displayName: string;
  
  // Page dimensions (for canvas preview)
  width?: number;
  height?: number;
  
  // All visuals on this page with complete data
  visuals: UnifiedVisual[];
  
  // Metadata
  sectionIndex: number;
  sourceKey: string;
}

/**
 * Complete unified report structure
 */
export interface UnifiedReport {
  reportId: string;
  reportName: string;
  workspaceId: string;
  workspaceName: string;
  
  // All pages with complete data
  pages: UnifiedPage[];
  
  // Global field summary (all unique fields across all pages)
  allFields: {
    table: string;
    fields: string[];
  }[];
  
  // Metadata
  totalVisuals: number;
  totalFields: number;
}

/**
 * Build unified report structure from parsed definition
 */
export function buildUnifiedReport(
  report: ExplorerArtifact,
  parsedParts: ParsedDefinitionPart[]
): UnifiedReport {
  console.log("[buildUnifiedReport] Starting build:", {
    reportId: report.id,
    parsedPartsCount: parsedParts.length,
    paths: parsedParts.map(p => p.path),
  });
  
  const reportJson = parsedParts.find((p) => p.path.endsWith("report.json"))?.json;
  
  if (!reportJson || typeof reportJson !== "object" || reportJson === null) {
    console.warn("[buildUnifiedReport] No report.json found in parsed parts");
    return createEmptyReport(report);
  }

  const reportRecord = reportJson as Record<string, unknown>;
  const sections = Array.isArray(reportRecord.sections) ? reportRecord.sections : [];
  
  console.log("[buildUnifiedReport] Building unified structure:", {
    reportId: report.id,
    reportName: report.displayName,
    sectionCount: sections.length,
  });

  const pages: UnifiedPage[] = [];
  const allFieldsMap = new Map<string, Set<string>>();

  sections.forEach((section, sectionIndex) => {
    if (!section || typeof section !== "object") return;

    const sectionRecord = section as Record<string, unknown>;
    const sectionName = extractSectionName(sectionRecord, sectionIndex);
    const sectionId = `section_${sectionIndex}`;
    
    const config = sectionRecord.config as Record<string, unknown> | undefined;
    const pageWidth = typeof config?.width === "number" ? config.width : 1280;
    const pageHeight = typeof config?.height === "number" ? config.height : 720;

    const visualContainers = Array.isArray(sectionRecord.visualContainers)
      ? sectionRecord.visualContainers
      : [];

    const visuals: UnifiedVisual[] = [];

    visualContainers.forEach((container, visualIndex) => {
      if (!container || typeof container !== "object") return;

      const containerRecord = container as Record<string, unknown>;
      const visual = extractUnifiedVisual(containerRecord, visualIndex, sectionId);
      
      if (visual) {
        visuals.push(visual);
        
        // Track all fields for global summary
        console.log(`[buildUnifiedReport] Processing visual ${visual.name} fields:`, {
          fieldCount: visual.fields.length,
          fields: visual.fields.map(f => ({ name: f.name, table: f.tableName, field: f.fieldName })),
        });
        
        visual.fields.forEach((field) => {
          const tableName = field.tableName || "Unknown";
          if (!allFieldsMap.has(tableName)) {
            allFieldsMap.set(tableName, new Set());
          }
          allFieldsMap.get(tableName)!.add(field.fieldName);
        });
      }
    });

    pages.push({
      id: sectionId,
      name: sectionName,
      displayName: sectionName,
      width: pageWidth,
      height: pageHeight,
      visuals,
      sectionIndex,
      sourceKey: `${sectionName}:${sectionIndex}`,
    });

    console.log(`[buildUnifiedReport] Page ${sectionIndex}: ${sectionName}`, {
      visualCount: visuals.length,
      visualsWithPosition: visuals.filter(v => v.x !== undefined).length,
      visualsWithFields: visuals.filter(v => v.fields.length > 0).length,
      allFieldsMapSize: allFieldsMap.size,
      tables: Array.from(allFieldsMap.keys()),
    });
  });

  // Fallback: merge legacy extraction that previously populated table/field values.
  const legacySections = buildReportJsonTable(parsedParts);

  // Fallback: hydrate per-visual fields from legacy visual groups when unified extraction is empty.
  pages.forEach((page) => {
    const legacySection = legacySections[page.sectionIndex];
    if (!legacySection) {
      return;
    }

    page.visuals.forEach((visual, visualIndex) => {
      if (visual.fields.length > 0) {
        return;
      }

      const legacyGroup = legacySection.visualGroups[visualIndex];
      if (!legacyGroup) {
        return;
      }

      const fallbackFields = extractLegacyGroupFields(legacyGroup);
      if (fallbackFields.length > 0) {
        visual.fields = fallbackFields;
      }
    });
  });

  const legacyTableSummary = buildTableFieldSummary(legacySections);
  if (legacyTableSummary.length > 0) {
    legacyTableSummary.forEach((row) => {
      if (!allFieldsMap.has(row.table)) {
        allFieldsMap.set(row.table, new Set<string>());
      }
      row.fields.forEach((fieldName) => {
        if (fieldName && fieldName.trim().length > 0) {
          allFieldsMap.get(row.table)?.add(fieldName.trim());
        }
      });
    });

    console.log("[buildUnifiedReport] Legacy field fallback merged:", {
      legacySectionCount: legacySections.length,
      legacyTableCount: legacyTableSummary.length,
      mergedAllFieldsMapSize: allFieldsMap.size,
    });
  }

  // Convert field map to sorted array
  const allFields = Array.from(allFieldsMap.entries())
    .map(([table, fields]) => ({
      table,
      fields: Array.from(fields).sort(),
    }))
    .sort((a, b) => a.table.localeCompare(b.table));

  console.log("[buildUnifiedReport] Field aggregation complete:", {
    allFieldsMapSize: allFieldsMap.size,
    allFieldsArrayLength: allFields.length,
    allFields: allFields.map(t => ({ table: t.table, fieldCount: t.fields.length })),
  });

  const totalVisuals = pages.reduce((sum, p) => sum + p.visuals.length, 0);
  const totalFields = allFields.reduce((sum, t) => sum + t.fields.length, 0);

  console.log("[buildUnifiedReport] Build complete:", {
    pageCount: pages.length,
    totalVisuals,
    totalFields,
  });

  return {
    reportId: report.id,
    reportName: report.displayName,
    workspaceId: report.workspaceId,
    workspaceName: report.workspaceName,
    pages,
    allFields,
    totalVisuals,
    totalFields,
  };
}

function extractLegacyGroupFields(group: ReportJsonVisualGroup): UnifiedFieldReference[] {
  const result: UnifiedFieldReference[] = [];
  const seen = new Set<string>();

  const addFromToken = (token: string, sourcePath: string) => {
    const normalized = token.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      return;
    }

    seen.add(normalized.toLowerCase());
    const dotIndex = normalized.indexOf(".");
    const tableName = dotIndex > 0 ? normalized.slice(0, dotIndex).trim() : undefined;
    const fieldName = dotIndex > 0 ? normalized.slice(dotIndex + 1).trim() : normalized;

    if (!fieldName) {
      return;
    }

    result.push({
      key: `Legacy:${normalized.toLowerCase()}`,
      name: normalized,
      tableName,
      fieldName,
      kind: "Field",
      sourcePath,
    });
  };

  const tokenPattern = /[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/g;
  group.visuals.forEach((row) => {
    const value = String(row.value ?? "");
    const matches = value.match(tokenPattern) ?? [];
    matches.forEach((match) => addFromToken(match, `legacy.${group.key}.${row.fieldName}`));
  });

  return result;
}

function createEmptyReport(report: ExplorerArtifact): UnifiedReport {
  return {
    reportId: report.id,
    reportName: report.displayName,
    workspaceId: report.workspaceId,
    workspaceName: report.workspaceName,
    pages: [],
    allFields: [],
    totalVisuals: 0,
    totalFields: 0,
  };
}

function extractSectionName(section: Record<string, unknown>, index: number): string {
  if (typeof section.displayName === "string" && section.displayName.trim()) {
    return section.displayName.trim();
  }
  if (typeof section.name === "string" && section.name.trim()) {
    return section.name.trim();
  }
  return `Page ${index + 1}`;
}

function extractUnifiedVisual(
  container: Record<string, unknown>,
  visualIndex: number,
  pageId: string
): UnifiedVisual | null {
  const config = normalizeRecord(container.config);
  const singleVisual = normalizeRecord(config?.singleVisual);

  // Extract visual ID and name
  const visualId = typeof container.id === "string" ? container.id : `visual_${visualIndex}`;
  const visualName = extractVisualName(singleVisual, config, visualId);
  const visualType = extractVisualType(singleVisual, config);
  const visualTitle = extractVisualTitle(singleVisual, config);
  const filter = extractFilterSummary(config);

  // Extract position
  let x: number | undefined;
  let y: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let z: number | undefined;

  // Try container level first
  if (typeof container.x === "number") x = container.x;
  if (typeof container.y === "number") y = container.y;
  if (typeof container.width === "number") width = container.width;
  if (typeof container.height === "number") height = container.height;
  if (typeof container.z === "number") z = container.z;

  // Try config level
  if (config) {
    if (typeof config.x === "number") x = config.x;
    if (typeof config.y === "number") y = config.y;
    if (typeof config.width === "number") width = config.width;
    if (typeof config.height === "number") height = config.height;
    if (typeof config.z === "number") z = config.z;
  }

  // Try singleVisual level
  if (singleVisual) {
    if (typeof singleVisual.x === "number") x = singleVisual.x;
    if (typeof singleVisual.y === "number") y = singleVisual.y;
    if (typeof singleVisual.width === "number") width = singleVisual.width;
    if (typeof singleVisual.height === "number") height = singleVisual.height;
    if (typeof singleVisual.z === "number") z = singleVisual.z;
  }

  // Extract all field references from entire container
  const fields = extractFieldReferences(container);

  if (fields.length > 0) {
    console.log(`[extractUnifiedVisual] ${visualName}:`, {
      id: visualId,
      type: visualType,
      hasPosition: x !== undefined && y !== undefined,
      fieldCount: fields.length,
      fields: fields.map(f => f.name),
    });
  }

  return {
    id: visualId,
    name: visualName,
    title: visualTitle,
    type: visualType,
    x,
    y,
    width,
    height,
    z,
    fields,
    filter,
    properties: config || {},
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function findFirstStringByKeys(root: unknown, keyNames: string[], maxDepth: number = 5): string | undefined {
  const visited = new Set<object>();

  const walk = (value: unknown, depth: number, fromTargetKey: boolean): string | undefined => {
    if (depth > maxDepth || value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === "string") {
      if (!fromTargetKey) {
        return undefined;
      }
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const hit = walk(entry, depth + 1, fromTargetKey);
        if (hit) {
          return hit;
        }
      }
      return undefined;
    }

    if (typeof value !== "object") {
      return undefined;
    }

    const obj = value as Record<string, unknown>;
    if (visited.has(obj)) {
      return undefined;
    }
    visited.add(obj);

    for (const keyName of keyNames) {
      if (keyName in obj) {
        const hit = walk(obj[keyName], depth + 1, true);
        if (hit) {
          return hit;
        }
      }
    }

    for (const nested of Object.values(obj)) {
      const hit = walk(nested, depth + 1, false);
      if (hit) {
        return hit;
      }
    }

    return undefined;
  };

  return walk(root, 0, false);
}

function extractVisualName(
  singleVisual: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined,
  fallback: string
): string {
  if (singleVisual && typeof singleVisual.name === "string" && singleVisual.name.trim()) {
    return singleVisual.name.trim();
  }
  if (config && typeof config.name === "string" && config.name.trim()) {
    return config.name.trim();
  }
  return fallback;
}

function extractVisualType(
  singleVisual: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined
): string {
  const directTypeValue = singleVisual?.visualType || singleVisual?.type || config?.type;
  if (typeof directTypeValue === "string" && directTypeValue.trim()) {
    return directTypeValue.trim();
  }

  const deepType = findFirstStringByKeys(singleVisual ?? config, ["visualType", "type"]);
  return deepType ?? "unknown";
}

function extractVisualTitle(
  singleVisual: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined
): string | undefined {
  if (singleVisual && typeof singleVisual.title === "string" && singleVisual.title.trim()) {
    return singleVisual.title.trim();
  }
  
  // Try nested title path
  const titleObj = (singleVisual?.vcObjects as Record<string, unknown>)?. title;
  if (Array.isArray(titleObj) && titleObj.length > 0) {
    const titleProps = (titleObj[0] as Record<string, unknown>)?.properties as Record<string, unknown>;
    const titleExpr = (titleProps?.text as Record<string, unknown>)?.expr as Record<string, unknown>;
    const literalValue = (titleExpr?.Literal as Record<string, unknown>)?.Value;
    if (typeof literalValue === "string" && literalValue.trim()) {
      return literalValue.replace(/^['"]|['"]$/g, "").trim();
    }
  }

  const deepTitle = findFirstStringByKeys(singleVisual ?? config, ["title", "displayName"]);
  if (deepTitle && deepTitle.toLowerCase() !== "untitled") {
    return deepTitle;
  }

  // Text box visuals often store user-authored text in nested objects rather than title fields.
  const visualType = extractVisualType(singleVisual, config).toLowerCase();
  if (visualType === "textbox") {
    const textBoxText = extractTextboxText(singleVisual, config);
    if (textBoxText) {
      return textBoxText;
    }
  }
  
  return undefined;
}

function extractTextboxText(
  singleVisual: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined
): string | undefined {
  const directCandidates: unknown[] = [
    findNestedValue(singleVisual, ["text"]),
    findNestedValue(singleVisual, ["content"]),
    findNestedValue(singleVisual, ["paragraphs"]),
    findNestedValue(singleVisual, ["objects", "paragraphs"]),
    findNestedValue(singleVisual, ["objects", "general", 0, "properties", "paragraphs", "expr", "Literal", "Value"]),
    findNestedValue(singleVisual, ["vcObjects", "general", 0, "properties", "paragraphs", "expr", "Literal", "Value"]),
    findNestedValue(config, ["singleVisual", "objects", "general", 0, "properties", "paragraphs", "expr", "Literal", "Value"]),
    findNestedValue(config, ["singleVisual", "vcObjects", "general", 0, "properties", "paragraphs", "expr", "Literal", "Value"]),
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeTextCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  // Fallback: recursively collect text-like values from known textbox sources.
  const fallbackSources = [singleVisual, config?.singleVisual as Record<string, unknown> | undefined];
  for (const source of fallbackSources) {
    const fromSource = findFirstTextLikeString(source);
    if (fromSource) {
      return fromSource;
    }
  }

  return undefined;
}

function findNestedValue(root: unknown, path: Array<string | number>): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }

    if (typeof key === "number") {
      if (!Array.isArray(cursor) || key < 0 || key >= cursor.length) {
        return undefined;
      }
      cursor = cursor[key];
      continue;
    }

    if (typeof cursor !== "object") {
      return undefined;
    }

    const record = cursor as Record<string, unknown>;
    cursor = record[key];
  }

  return cursor;
}

function normalizeTextCandidate(candidate: unknown): string | undefined {
  if (typeof candidate === "string") {
    const stripped = candidate
      .replace(/^['"]|['"]$/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.length > 0 ? stripped : undefined;
  }

  if (Array.isArray(candidate)) {
    for (const entry of candidate) {
      const nested = normalizeTextCandidate(entry);
      if (nested) {
        return nested;
      }
    }
  }

  if (candidate && typeof candidate === "object") {
    const record = candidate as Record<string, unknown>;
    const prioritizedKeys = ["text", "value", "content", "Literal", "Value", "paragraphs"];
    for (const key of prioritizedKeys) {
      const nested = normalizeTextCandidate(record[key]);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function findFirstTextLikeString(root: unknown): string | undefined {
  const visited = new Set<object>();

  const walk = (value: unknown, depth: number): string | undefined => {
    if (depth > 6 || value === null || value === undefined) {
      return undefined;
    }

    const asText = normalizeTextCandidate(value);
    if (asText && asText.length > 2) {
      return asText;
    }

    if (typeof value !== "object") {
      return undefined;
    }

    if (visited.has(value as object)) {
      return undefined;
    }
    visited.add(value as object);

    if (Array.isArray(value)) {
      for (const entry of value) {
        const nested = walk(entry, depth + 1);
        if (nested) {
          return nested;
        }
      }
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const preferredKeys = ["text", "content", "paragraphs", "title", "displayName", "value", "objects", "vcObjects", "properties", "expr", "Literal", "Value"];

    for (const key of preferredKeys) {
      const nested = walk(record[key], depth + 1);
      if (nested) {
        return nested;
      }
    }

    for (const [key, nestedValue] of Object.entries(record)) {
      if (preferredKeys.includes(key)) {
        continue;
      }
      const nested = walk(nestedValue, depth + 1);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  };

  return walk(root, 0);
}

function extractFilterSummary(config: Record<string, unknown> | undefined): string | undefined {
  const filters = config?.filters;
  if (!Array.isArray(filters) || filters.length === 0) {
    return undefined;
  }

  const filterTargets: string[] = [];
  for (const filter of filters) {
    if (!filter || typeof filter !== "object") continue;
    
    const filterRecord = filter as Record<string, unknown>;
    const table = findNestedString(filterRecord, ["table", "entity"]);
    const column = findNestedString(filterRecord, ["column", "measure", "field"]);
    
    if (table && column) {
      filterTargets.push(`${table}.${column}`);
    } else if (column) {
      filterTargets.push(column);
    }
  }

  return filterTargets.length > 0 ? filterTargets.join(", ") : `${filters.length} filter(s)`;
}

function extractFieldReferences(container: Record<string, unknown> | undefined): UnifiedFieldReference[] {
  const fields: UnifiedFieldReference[] = [];
  const seen = new Set<string>();

  const addField = (name: string, kind: "Column" | "Measure" | "Field" | "Reference", sourcePath: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || seen.has(trimmedName)) return;

    seen.add(trimmedName);

    // Parse "Table.Field" format
    const parts = trimmedName.split(".");
    const tableName = parts.length > 1 ? parts[0] : undefined;
    const fieldName = parts.length > 1 ? parts.slice(1).join(".") : trimmedName;

    fields.push({
      key: `${kind}:${trimmedName.toLowerCase()}`,
      name: trimmedName,
      tableName,
      fieldName,
      kind,
      sourcePath,
    });
  };

  if (!container) return fields;

  // Walk the entire container tree (config, singleVisual, and all nested structures)
  const walk = (value: unknown, path: string) => {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;

    // Check for queryRef (common in Power BI)
    if (typeof record.queryRef === "string") {
      addField(record.queryRef, "Field", `${path}.queryRef`);
    }

    // Check for common field property names
    const fieldKeys = ["column", "measure", "field", "table", "entity", "expression"];
    for (const key of fieldKeys) {
      if (typeof record[key] === "string") {
        addField(String(record[key]), "Reference", `${path}.${key}`);
      }
    }

    // Recursively walk nested objects
    for (const [key, nestedValue] of Object.entries(record)) {
      walk(nestedValue, path ? `${path}.${key}` : key);
    }
  };

  walk(container, "visual");

  if (fields.length > 0) {
    console.log(`[extractFieldReferences] Extraction complete:`, {
      fieldCount: fields.length,
      fields: fields.map(f => f.name),
    });
  }

  return fields;
}

function findNestedString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof obj[key] === "string" && String(obj[key]).trim()) {
      return String(obj[key]).trim();
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = findNestedString(value as Record<string, unknown>, keys);
      if (found) return found;
    }
  }

  return undefined;
}
