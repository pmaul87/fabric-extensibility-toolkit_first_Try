/**
 * SemanticAnalyzerView — Phase 3 stub
 *
 * Phase 1: Placeholder to confirm routing and navigation work.
 * Phase 3: Implement Requirements 2.1–2.5 (entities, dependencies, table + graph, drill-down).
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import "../../InsightWorkbenchItem.scss";

interface SemanticAnalyzerViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
}

function SemanticAnalyzerContent() {
  const { t } = useTranslation();
  const { goBack } = useViewNavigation();

  return (
    <div className="insight-workbench-view">
      <h2 className="insight-workbench-section-title">
        {t('InsightWorkbench_SemanticAnalyzer_Label', 'Semantic Model Analyzer')}
      </h2>
      <div className="insight-workbench-placeholder">
        <div className="insight-workbench-placeholder-icon">🔬</div>
        <div className="insight-workbench-placeholder-text">
          {t(
            'InsightWorkbench_SemanticAnalyzer_PhaseNote',
            'Semantic Model Analyzer is implemented in Phase 3. Requirements: tables, measures, columns, relations, dependency table + graph, drill-down.'
          )}
        </div>
        <button onClick={goBack}>
          {t('InsightWorkbench_BackToHub', '← Back to Hub')}
        </button>
      </div>
    </div>
  );
}

export function SemanticAnalyzerView({ workloadClient, item }: SemanticAnalyzerViewProps) {
  return (
    <ItemEditorDefaultView
      center={{ content: <SemanticAnalyzerContent /> }}
    />
  );
}
