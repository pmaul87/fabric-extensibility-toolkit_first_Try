import React from "react";
import { Button } from "@fluentui/react-components";
import { TFunction } from "i18next";
import { ReportTableFieldSummaryRow } from "../../../models/ReportUsageModel";

interface UsedFieldsTableProps {
  tableFieldSummary: ReportTableFieldSummaryRow[];
  selectedField: string | null;
  onFieldClick: (fieldKey: string) => void;
  onFieldJumpClick?: (fieldKey: string) => void;
  t: TFunction;
}

export const UsedFieldsTable: React.FC<UsedFieldsTableProps> = ({
  tableFieldSummary,
  selectedField,
  onFieldClick,
  onFieldJumpClick,
  t,
}) => {
  const normalizedRows = tableFieldSummary
    .map((row) => ({
      table: row.table,
      fields: row.fields.filter((field) => typeof field === "string" && field.trim().length > 0),
    }))
    .filter((row) => row.fields.length > 0);

  return (
    <table className="insight-workbench-report-scanner-table-grid">
      <thead>
        <tr>
          <th>{t("InsightWorkbench_ReportScanner_FieldSummary_Col_Table", "Table")}</th>
          <th>{t("InsightWorkbench_ReportScanner_FieldSummary_Col_Fields", "Fields")}</th>
        </tr>
      </thead>
      <tbody>
        {normalizedRows.length === 0 && (
          <tr>
            <td colSpan={2} style={{ color: "var(--colorNeutralForeground3)", fontStyle: "italic" }}>
              {t("InsightWorkbench_ReportScanner_FieldSummary_None", "No fields found")}
            </td>
          </tr>
        )}
        {normalizedRows.map((row) => (
          <React.Fragment key={row.table}>
            <tr>
              <td
                style={{ fontWeight: "var(--fontWeightSemibold)", whiteSpace: "nowrap" }}
                rowSpan={row.fields.length || 1}
              >
                {row.table}
              </td>
              <td>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <Button
                    appearance={selectedField === `${row.table}.${row.fields[0]}` ? "primary" : "transparent"}
                    size="small"
                    onClick={() => onFieldClick(`${row.table}.${row.fields[0]}`)}
                    style={{ flex: 1, justifyContent: "flex-start" }}
                  >
                    {row.fields[0]}
                  </Button>
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() => onFieldJumpClick?.(`${row.table}.${row.fields[0]}`)}
                    title={t("InsightWorkbench_ReportScanner_FieldSummary_JumpToSemanticAnalyzer", "Jump to Semantic Model Analyzer")}
                  >
                    {`↗ ${t("InsightWorkbench_ReportScanner_FieldSummary_Jump", "Semantic model")}`}
                  </Button>
                </div>
              </td>
            </tr>
            {row.fields.slice(1).map((field, idx) => (
              <tr key={`${row.table}-${field}-${idx}`}>
                <td>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <Button
                      appearance={selectedField === `${row.table}.${field}` ? "primary" : "transparent"}
                      size="small"
                      onClick={() => onFieldClick(`${row.table}.${field}`)}
                      style={{ flex: 1, justifyContent: "flex-start" }}
                    >
                      {field}
                    </Button>
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => onFieldJumpClick?.(`${row.table}.${field}`)}
                      title={t("InsightWorkbench_ReportScanner_FieldSummary_JumpToSemanticAnalyzer", "Jump to Semantic Model Analyzer")}
                    >
                      {`↗ ${t("InsightWorkbench_ReportScanner_FieldSummary_Jump", "Semantic model")}`}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
};
