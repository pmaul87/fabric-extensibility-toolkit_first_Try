/**
 * RequirementsBoardView — Phase 5 stub
 *
 * Phase 1: Placeholder to confirm routing and navigation work.
 * Phase 5: Implement Requirements 4.1–4.5 (Kanban board, cards, status workflow,
 *          links to artifacts / semantic entities / lineage insights).
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../../../components/ItemEditor";
import { useViewNavigation } from "../../../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "../../InsightWorkbenchItemDefinition";
import { ItemWithDefinition } from "../../../../controller/ItemCRUDController";
import "../../InsightWorkbenchItem.scss";

interface RequirementsBoardViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
}

function RequirementsBoardContent() {
  const { t } = useTranslation();
  const { goBack } = useViewNavigation();

  return (
    <div className="insight-workbench-view">
      <h2 className="insight-workbench-section-title">
        {t('InsightWorkbench_RequirementsBoard_Label', 'Requirements Board')}
      </h2>
      <div className="insight-workbench-placeholder">
        <div className="insight-workbench-placeholder-icon">📋</div>
        <div className="insight-workbench-placeholder-text">
          {t(
            'InsightWorkbench_RequirementsBoard_PhaseNote',
            'Requirements Board is implemented in Phase 5. Requirements: Kanban board, requirement cards, status workflow (Backlog → Done), links to Fabric artifacts and insights.'
          )}
        </div>
        <button onClick={goBack}>
          {t('InsightWorkbench_BackToHub', '← Back to Hub')}
        </button>
      </div>
    </div>
  );
}

export function RequirementsBoardView({ workloadClient, item }: RequirementsBoardViewProps) {
  return (
    <ItemEditorDefaultView
      center={{ content: <RequirementsBoardContent /> }}
    />
  );
}
