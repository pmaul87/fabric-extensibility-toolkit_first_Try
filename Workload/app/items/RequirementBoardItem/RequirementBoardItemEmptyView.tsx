import React from "react";
import { useTranslation } from "react-i18next";
import { ItemEditorEmptyView, EmptyStateTask } from "../../components/ItemEditor";

interface RequirementBoardItemEmptyViewProps {
  onGetStarted: () => void;
}

export function RequirementBoardItemEmptyView({ onGetStarted }: RequirementBoardItemEmptyViewProps) {
  const { t } = useTranslation();

  const tasks: EmptyStateTask[] = [
    {
      id: "open-board",
      label: t("RequirementBoardEmpty_Open", "Open the board"),
      description: t(
        "RequirementBoardEmpty_Open_Description",
        "Start tracking requirements and link them to lineage nodes"
      ),
      onClick: onGetStarted,
    },
  ];

  return (
    <ItemEditorEmptyView
      title={t("RequirementBoardEmpty_Title", "Welcome to Requirement Board")}
      description={t(
        "RequirementBoardEmpty_Description",
        "Manage requirements with a Kanban board and link them directly to nodes in your Lineage Viewer. Track what needs to change and see the downstream impact."
      )}
      imageSrc="/assets/items/LineageExtractorItem/EditorEmpty.svg"
      imageAlt={t("RequirementBoardEmpty_ImageAlt", "Requirement board empty state")}
      tasks={tasks}
    />
  );
}
