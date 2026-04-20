import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import { ItemEditorEmptyView, EmptyStateTask } from "../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "./InsightWorkbenchItemDefinition";
import "./InsightWorkbenchItem.scss";

interface InsightWorkbenchItemEmptyViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  onNavigateToHub: () => void;
}

/**
 * Empty state — shown on first open when no definition exists yet.
 * Guides the user into the main hub view.
 */
export function InsightWorkbenchItemEmptyView({
  workloadClient,
  item,
  onNavigateToHub,
}: InsightWorkbenchItemEmptyViewProps) {
  const { t } = useTranslation();

  const tasks: EmptyStateTask[] = [
    {
      id: 'open-hub',
      label: t('InsightWorkbenchItemEmptyView_StartButton', 'Open Insight Workbench'),
      icon: undefined,
      description: t(
        'InsightWorkbenchItemEmptyView_StartButton_Description',
        'Explore Fabric metadata, semantic models, lineage, and requirements — all in one place.'
      ),
      onClick: onNavigateToHub,
    },
  ];

  return (
    <ItemEditorEmptyView
      title={t('InsightWorkbenchItemEmptyView_Title', 'Welcome to Insight Workbench')}
      description={t(
        'InsightWorkbenchItemEmptyView_Description',
        'Insight Workbench gives you a unified view of your Fabric environment. Explore metadata, analyze semantic models, trace data lineage, and manage requirements — all linked together.'
      )}
      imageSrc="/assets/items/InsightWorkbenchItem/EditorEmpty.svg"
      imageAlt="Insight Workbench empty state illustration"
      tasks={tasks}
    />
  );
}
