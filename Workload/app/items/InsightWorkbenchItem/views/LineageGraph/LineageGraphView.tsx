/**
 * LineageGraphView — Phase 4 stub
 *
 * Phase 1: Placeholder to confirm routing and navigation work.
 * Phase 4: Implement Requirements 3.1–3.4 (cross-workspace lineage, graph model,
 *          upstream/downstream traversal, report usage for semantic entities — table + graph).
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import "../../InsightWorkbenchItem.scss";

interface LineageGraphViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
}

function LineageGraphContent() {
  const { t } = useTranslation();
  const { goBack } = useViewNavigation();

  return (
    <div className="insight-workbench-view">
      <h2 className="insight-workbench-section-title">
        {t('InsightWorkbench_LineageGraph_Label', 'Lineage & Dependency Graph')}
      </h2>
      <div className="insight-workbench-placeholder">
        <div className="insight-workbench-placeholder-icon">🕸️</div>
        <div className="insight-workbench-placeholder-text">
          {t(
            'InsightWorkbench_LineageGraph_PhaseNote',
            'Lineage Graph is implemented in Phase 4. Requirements: cross-workspace lineage, graph model, upstream/downstream traversal, report usage mapping — table and graph views.'
          )}
        </div>
        <button onClick={goBack}>
          {t('InsightWorkbench_BackToHub', '← Back to Hub')}
        </button>
      </div>
    </div>
  );
}

export function LineageGraphView({ workloadClient, item }: LineageGraphViewProps) {
  return (
    <ItemEditorDefaultView
      center={{ content: <LineageGraphContent /> }}
    />
  );
}
