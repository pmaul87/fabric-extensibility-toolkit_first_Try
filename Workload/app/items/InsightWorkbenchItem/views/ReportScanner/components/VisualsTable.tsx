import React from "react";
import { Text } from "@fluentui/react-components";
import { TFunction } from "i18next";
import { UnifiedPage } from "../../../models/UnifiedReportModel";

interface VisualsTableProps {
  currentSection: UnifiedPage;
  selectedField: string | null;
  selectedVisual: string | null;
  onVisualClick: (visualName: string) => void;
  t: TFunction;
}

export const VisualsTable: React.FC<VisualsTableProps> = ({
  currentSection,
  selectedField,
  selectedVisual,
  onVisualClick,
  t,
}) => {
  const isFieldMatch = (candidate: string): boolean => {
    if (!selectedField) {
      return false;
    }

    const selectedParts = selectedField.split(".");
    const selectedFieldName = selectedParts[selectedParts.length - 1] || selectedField;
    const candidateParts = candidate.split(".");
    const candidateFieldName = candidateParts[candidateParts.length - 1] || candidate;

    return (
      candidate === selectedField ||
      candidateFieldName === selectedFieldName ||
      candidate.includes(selectedFieldName) ||
      selectedField.includes(candidateFieldName)
    );
  };

  if (!currentSection) {
    return (
      <Text size={200}>
        {t("InsightWorkbench_ReportScanner_Table_NoData", "No section data available.")}
      </Text>
    );
  }

  return (
    <details key={currentSection.id} className="insight-workbench-report-scanner-table-section" open>
      <summary>{`${currentSection.displayName} (${currentSection.visuals.length})`}</summary>

      {currentSection.visuals.length === 0 ? (
        <Text size={200}>
          {t("InsightWorkbench_ReportScanner_Table_NoVisuals", "No visual children found.")}
        </Text>
      ) : (
        <div className="insight-workbench-report-scanner-visual-subgroups">
          {currentSection.visuals.map((visual) => {
            const hasSelectedField = selectedField
              ? visual.fields.some((field) => isFieldMatch(field.name))
              : false;
            const isSelectedVisual = selectedVisual === visual.name;

            return (
            <details key={visual.id} className="insight-workbench-report-scanner-visual-subgroup" open>
              <summary
                style={{
                  cursor: "pointer",
                  backgroundColor: isSelectedVisual
                    ? "var(--colorBrandBackground2)"
                    : hasSelectedField
                      ? "#F9E79F"
                      : "transparent",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  border: hasSelectedField ? "2px solid #B8860B" : "1px solid transparent",
                  boxShadow: hasSelectedField ? "0 0 0 2px rgba(184, 134, 11, 0.25)" : "none",
                }}
                onClick={(e: React.MouseEvent<HTMLElement>) => {
                  e.preventDefault();
                  onVisualClick(visual.name);
                }}
              >
                {visual.title || visual.name || visual.type || t("InsightWorkbench_ReportScanner_Visual", "Visual")}
              </summary>

              <div className="insight-workbench-report-scanner-subheader-grid">
                <Text size={200}>{`${t("InsightWorkbench_ReportScanner_Table_Subheader_Title", "Title")}: ${
                  visual.title || visual.name || "-"
                }`}</Text>
                <Text size={200}>{`${t("InsightWorkbench_ReportScanner_Table_Subheader_Name", "name")}: ${
                  visual.name || "-"
                }`}</Text>
                <Text size={200}>{`${t("InsightWorkbench_ReportScanner_Table_Subheader_VisualType", "visualType")}: ${
                  visual.type || "-"
                }`}</Text>
                <Text size={200}>{`${t("InsightWorkbench_ReportScanner_Table_Subheader_Filter", "filter")}: ${
                  visual.filter || "-"
                }`}</Text>
              </div>

              <table className="insight-workbench-report-scanner-table-grid">
                <thead>
                  <tr>
                    <th>{t("InsightWorkbench_ReportScanner_Table_Column_Field", "Field")}</th>
                    <th>{t("InsightWorkbench_ReportScanner_Table_Column_Kind", "Kind")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visual.fields.length === 0 ? (
                    <tr>
                      <td colSpan={2}>
                        <Text size={200} style={{ fontStyle: "italic", color: "var(--colorNeutralForeground3)" }}>
                          {t("InsightWorkbench_ReportScanner_Table_NoFields", "No fields found in this visual")}
                        </Text>
                      </td>
                    </tr>
                  ) : (
                    visual.fields.map((field) => (
                      <tr
                        key={field.key}
                        style={isFieldMatch(field.name)
                          ? {
                              backgroundColor: "#FFF3CD",
                              borderLeft: "4px solid #B8860B",
                            }
                          : undefined}
                      >
                        <td style={isFieldMatch(field.name) ? { fontWeight: "var(--fontWeightSemibold)", color: "#5C4300" } : undefined}>{field.name}</td>
                        <td>{field.kind}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </details>
            );
          })}
        </div>
      )}
    </details>
  );
};
