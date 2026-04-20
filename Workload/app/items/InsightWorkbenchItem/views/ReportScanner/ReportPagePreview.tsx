import React, { useEffect, useRef, useState } from "react";
import { Text, tokens } from "@fluentui/react-components";
import { UnifiedPage, UnifiedVisual } from "../../models/UnifiedReportModel";

interface ReportPagePreviewProps {
  page: UnifiedPage;
  selectedField?: string | null;
  selectedVisual?: string | null;
  onVisualClick?: (visualName: string) => void;
  containerWidth?: number;
  containerHeight?: number;
}

const VISUAL_TYPE_COLORS: Record<string, string> = {
  card: "#0078D4",
  clusteredColumnChart: "#00BCF2",
  lineChart: "#8764B8",
  pieChart: "#00B294",
  table: "#107C10",
  matrix: "#498205",
  slicer: "#FFB900",
  textbox: "#847545",
  image: "#CA5010",
  shape: "#737373",
  map: "#004E8C",
  unknown: "#605E5C",
};

const VISUAL_TYPE_SYMBOLS: Record<string, string> = {
  card: "C",
  kpi: "K",
  clusteredColumnChart: "#",
  stackedColumnChart: "#",
  columnChart: "#",
  clusteredBarChart: "=",
  stackedBarChart: "=",
  barChart: "=",
  lineChart: "/",
  areaChart: "~",
  comboChart: "#/",
  pieChart: "()",
  donutChart: "0",
  scatterChart: ".*",
  table: "[]",
  matrix: "++",
  slicer: "S",
  textbox: "T",
  image: "I",
  shape: "<>",
  map: "M",
  filledMap: "M",
  gauge: "G",
  funnel: "V",
  waterfall: "W",
  treemap: "TM",
  ribbonChart: "R",
  decompositionTree: "DT",
  qnaVisual: "?",
  unknown: "*",
};

function getVisualTypeKey(type: string | undefined): string {
  return (type ?? "unknown").toLowerCase().replace(/\s+/g, "");
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 3))}...`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function getStringAtPath(root: unknown, path: string[]): string | undefined {
  let cursor: unknown = root;
  for (const part of path) {
    const record = asRecord(cursor);
    if (!record) {
      return undefined;
    }
    cursor = record[part];
  }

  if (typeof cursor === "string") {
    const trimmed = cursor.replace(/^['"]|['"]$/g, "").trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

function resolveVisualDisplayName(visual: UnifiedVisual): string {
  const title = visual.title?.trim();
  if (title) {
    return title;
  }

  const candidatePaths: string[][] = [
    ["displayName"],
    ["singleVisual", "displayName"],
    ["singleVisual", "title"],
    ["singleVisual", "vcObjects", "title", "0", "properties", "text", "expr", "Literal", "Value"],
    ["title"],
    ["name"],
  ];

  for (const path of candidatePaths) {
    const raw = path.includes("0")
      ? (() => {
          const prefix = path.slice(0, path.indexOf("0"));
          const suffix = path.slice(path.indexOf("0") + 1);
          const list = getValueAtPath(visual.properties, prefix);
          if (!Array.isArray(list) || list.length === 0) {
            return undefined;
          }
          return getStringAtPath(list[0], suffix);
        })()
      : getStringAtPath(visual.properties, path);

    if (raw && raw.toLowerCase() !== "untitled") {
      return raw;
    }
  }

  const cleanedName = visual.name
    .replace(/^visualcontainer\d+$/i, "")
    .replace(/^visual[_\-.]*/i, "")
    .trim();

  return cleanedName || visual.name || "Untitled visual";
}

function getValueAtPath(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const part of path) {
    const record = asRecord(cursor);
    if (!record) {
      return undefined;
    }
    cursor = record[part];
  }
  return cursor;
}

/**
 * ReportPagePreview Component
 * Renders a canvas-based preview of a Power BI report page showing visual positions
 */
export const ReportPagePreview: React.FC<ReportPagePreviewProps> = ({
  page,
  selectedField,
  selectedVisual,
  onVisualClick,
  containerWidth = 800,
  containerHeight = 600,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredVisual, setHoveredVisual] = useState<string | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);

  // Debug logging - received props
  useEffect(() => {
    console.log("[ReportPagePreview] Props received/updated:", {
      pageId: page.id,
      pageName: page.name,
      selectedField,
      selectedVisual,
      visualCount: page.visuals.length,
      visualsWithFields: page.visuals.filter(v => v.fields.length > 0).length,
      timestamp: new Date().toISOString(),
    });
    
    if (selectedField) {
      console.log("[ReportPagePreview] Field selection active - checking visuals for matches...");
      page.visuals.forEach((v, idx) => {
        console.log(`[ReportPagePreview] Visual ${idx}: ${v.name}, fields:`, v.fields.map(f => f.name));
      });
    }
    
    if (selectedVisual) {
      console.log("[ReportPagePreview] Visual selection active:", selectedVisual);
      const matchingVisual = page.visuals.find(v => v.name === selectedVisual || v.id === selectedVisual);
      console.log("[ReportPagePreview] Matching visual found:", matchingVisual ? `${matchingVisual.name} (${matchingVisual.id})` : "NONE");
    }
  }, [page, selectedField, selectedVisual]);
  
  // Debug logging - only log page data when page actually changes (not on every prop update)
  const pageIdRef = React.useRef(page.id);
  useEffect(() => {
    if (pageIdRef.current !== page.id) {
      pageIdRef.current = page.id;
      console.log("[ReportPagePreview] Page changed - new page data:", {
        pageId: page.id,
        pageName: page.name,
        pageWidth: page.width,
        pageHeight: page.height,
        visualCount: page.visuals.length,
        visualsWithPosition: page.visuals.filter(v => v.x !== undefined && v.y !== undefined).length,
        visuals: page.visuals.map(v => ({
          id: v.id,
          name: v.name,
          type: v.type,
          fieldCount: v.fields.length,
          fields: v.fields.map(f => f.name),
          x: v.x,
          y: v.y,
          width: v.width,
          height: v.height,
        })),
      });
    }
  }, [page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    ctx.scale(dpr, dpr);

    // Calculate scale factor to fit the page
    const pageWidth = page.width || 1280;
    const pageHeight = page.height || 720;
    const scale = Math.min(
      (containerWidth - 40) / pageWidth,
      (containerHeight - 40) / pageHeight
    );
    setScaleFactor(scale);

    // Center the page
    const offsetX = (containerWidth - pageWidth * scale) / 2;
    const offsetY = (containerHeight - pageHeight * scale) / 2;

    // Clear canvas with light background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, containerWidth, containerHeight);

    // Draw page background (light gray)
    ctx.fillStyle = "#F5F5F5";
    ctx.fillRect(offsetX, offsetY, pageWidth * scale, pageHeight * scale);

    // Draw page border
    ctx.strokeStyle = "#D1D1D1";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, pageWidth * scale, pageHeight * scale);

    // Sort visuals by z-order (lower z-index drawn first)
    const sortedVisuals = [...page.visuals].sort((a, b) => {
      const zA = a.z ?? 0;
      const zB = b.z ?? 0;
      return zA - zB;
    });

    // Draw visuals
    for (const visual of sortedVisuals) {
      if (
        visual.x === undefined ||
        visual.y === undefined ||
        visual.width === undefined ||
        visual.height === undefined
      ) {
        continue;
      }

      const x = offsetX + visual.x * scale;
      const y = offsetY + visual.y * scale;
      const width = visual.width * scale;
      const height = visual.height * scale;

      const isHovered = hoveredVisual === visual.id;

      // Check if visual is selected by name (from table view)
      const isVisualSelected = selectedVisual && (visual.name === selectedVisual || visual.id === selectedVisual);
      
      if (selectedVisual && isVisualSelected) {
        console.log("[ReportPagePreview] ✓ Visual selected match found:", {
          visualName: visual.name,
          visualId: visual.id,
          selectedVisual,
        });
      }

      // Check if visual contains the selected field
      const isFieldHighlighted = selectedField && visual.fields.some(field => {
        // Match against field name (might be "Table.Field" or just "Field")
        const fieldName = field.name;
        // Extract field name from "Table.Field" format in selectedField
        const fieldParts = selectedField.split('.');
        const selectedFieldName = fieldParts.length > 1 ? fieldParts[fieldParts.length - 1] : selectedField;
        // Check multiple matching strategies
        const isMatch = fieldName === selectedField || 
               fieldName === selectedFieldName || 
               fieldName.includes(selectedFieldName) ||
               selectedField.includes(fieldName);
        
        if (isMatch) {
          console.log('[ReportPagePreview] Field match found:', { 
            visualName: visual.name, 
            fieldName, 
            selectedField, 
            selectedFieldName 
          });
        }
        
        return isMatch;
      });

      const isHighlighted = isVisualSelected || isFieldHighlighted;

      // Get color for visual type
      const visualTypeKey = getVisualTypeKey(visual.type);
      const color = VISUAL_TYPE_COLORS[visualTypeKey] || VISUAL_TYPE_COLORS.unknown;
      const symbol = VISUAL_TYPE_SYMBOLS[visualTypeKey] || VISUAL_TYPE_SYMBOLS.unknown;
      const visualTitleBase = resolveVisualDisplayName(visual);
      const visualTitle = visualTypeKey === "image" ? `[IMG] ${visualTitleBase}` : visualTitleBase;
      const visualTypeLabel = visual.type || "unknown";

      // Draw visual background
      ctx.fillStyle = isHighlighted ? "#FFF4CE" : (isHovered ? `${color}40` : `${color}20`);
      ctx.fillRect(x, y, width, height);

      // Draw visual border
      ctx.strokeStyle = isHighlighted ? "#FFB900" : (isHovered ? color : `${color}80`);
      ctx.lineWidth = isHighlighted ? 4 : (isHovered ? 3 : 1);
      ctx.strokeRect(x, y, width, height);

      // Draw readable label block: type symbol + visual title + visual type.
      if (width > 120 && height > 56) {
        const headerHeight = Math.min(38, Math.max(24, height * 0.3));
        const headerX = x + 3;
        const headerY = y + 3;
        const headerWidth = width - 6;

        ctx.fillStyle = isHighlighted ? "rgba(255, 255, 255, 0.94)" : "rgba(255, 255, 255, 0.9)";
        ctx.fillRect(headerX, headerY, headerWidth, headerHeight);

        const badgeSize = Math.max(14, Math.min(18, headerHeight - 8));
        const badgeX = headerX + 6;
        const badgeY = headerY + (headerHeight - badgeSize) / 2;
        ctx.fillStyle = color;
        ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "700 10px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(symbol, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 0.5);

        const textStartX = badgeX + badgeSize + 6;
        const availableWidth = headerX + headerWidth - textStartX - 4;
        const titleLength = Math.max(10, Math.floor(availableWidth / 6.5));
        const typeLength = Math.max(10, Math.floor(availableWidth / 7));

        ctx.fillStyle = "#1A1A1A";
        ctx.font = "600 11px 'Segoe UI', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(truncateLabel(visualTitle, titleLength), textStartX, headerY + 14);

        ctx.fillStyle = "#4A4A4A";
        ctx.font = "400 10px 'Segoe UI', sans-serif";
        ctx.fillText(truncateLabel(visualTypeLabel, typeLength), textStartX, headerY + 26);
      } else if (width > 70 && height > 28) {
        // Fallback for medium tiles where full label block does not fit.
        ctx.fillStyle = "#242424";
        ctx.font = `${Math.max(9, Math.min(11, height / 8))}px 'Segoe UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const compactText = truncateLabel(`${symbol} ${visualTypeLabel}`, 14);
        ctx.fillText(compactText, x + width / 2, y + height / 2);
      }
    }
  }, [page, containerWidth, containerHeight, hoveredVisual, selectedField, selectedVisual]);

  const getVisualAtCoordinates = (mouseX: number, mouseY: number): UnifiedVisual | null => {
    const pageWidth = page.width || 1280;
    const pageHeight = page.height || 720;
    const offsetX = (containerWidth - pageWidth * scaleFactor) / 2;
    const offsetY = (containerHeight - pageHeight * scaleFactor) / 2;

    // Check visuals in reverse z-order (top to bottom)
    const sortedVisuals = [...page.visuals].sort((a, b) => {
      const zA = a.z ?? 0;
      const zB = b.z ?? 0;
      return zB - zA;
    });

    for (const visual of sortedVisuals) {
      if (
        visual.x === undefined ||
        visual.y === undefined ||
        visual.width === undefined ||
        visual.height === undefined
      ) {
        continue;
      }

      const x = offsetX + visual.x * scaleFactor;
      const y = offsetY + visual.y * scaleFactor;
      const width = visual.width * scaleFactor;
      const height = visual.height * scaleFactor;

      if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height) {
        return visual;
      }
    }

    return null;
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const foundVisual = getVisualAtCoordinates(mouseX, mouseY);
    const nextHoveredVisual = foundVisual?.id ?? null;

    if (nextHoveredVisual !== hoveredVisual) {
      setHoveredVisual(nextHoveredVisual);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onVisualClick) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const clickedVisual = getVisualAtCoordinates(mouseX, mouseY);

    if (!clickedVisual) {
      return;
    }

    const visualSelectionKey = clickedVisual.name || clickedVisual.id;
    if (visualSelectionKey) {
      onVisualClick(visualSelectionKey);
    }
  };

  const handleMouseLeave = () => {
    setHoveredVisual(null);
  };

  const visualsWithPosition = page.visuals.filter(
    (v) => v.x !== undefined && v.y !== undefined && v.width !== undefined && v.height !== undefined
  );

  if (visualsWithPosition.length === 0) {
    return (
      <div
        style={{
          width: containerWidth,
          height: containerHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FAFAFA",
          border: "1px solid #D1D1D1",
          borderRadius: tokens.borderRadiusMedium,
        }}
      >
        <Text style={{ color: "#616161" }}>
          No position data available for visuals on this page
        </Text>
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        style={{
          border: "1px solid #D1D1D1",
          borderRadius: tokens.borderRadiusMedium,
          cursor: hoveredVisual ? "pointer" : "default",
          backgroundColor: "#FFFFFF",
        }}
      />
      {hoveredVisual && (
        <div style={{ marginTop: 8 }}>
          {(() => {
            const visual = page.visuals.find((v) => v.id === hoveredVisual);
            if (!visual) return null;
            return (
              <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                <strong>{visual.name}</strong> ({visual.type}) - {visual.fields.length} data field
                {visual.fields.length !== 1 ? "s" : ""}
              </Text>
            );
          })()}
        </div>
      )}
    </div>
  );
};
