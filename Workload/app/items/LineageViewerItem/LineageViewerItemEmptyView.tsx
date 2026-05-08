import React from "react";
import { useTranslation } from "react-i18next";
import { ItemEditorEmptyView, EmptyStateTask } from "../../components/ItemEditor";

interface LineageViewerItemEmptyViewProps {
  onGetStarted: () => void;
}

export function LineageViewerItemEmptyView(props: LineageViewerItemEmptyViewProps) {
  const { t } = useTranslation();

  const tasks: EmptyStateTask[] = [
    {
      id: "open-viewer",
      label: t("LineageViewerItemEmpty_Open", "Open dependency viewer"),
      description: t(
        "LineageViewerItemEmpty_Open_Description",
        "Start exploring semantic model and visual dependencies"
      ),
      onClick: props.onGetStarted,
    },
  ];

  return (
    <ItemEditorEmptyView
      title={t("LineageViewerItemEmpty_Title", "Welcome to Lineage Viewer")}
      description={t(
        "LineageViewerItemEmpty_Description",
        "Use this view to explore upstream and downstream dependencies across reports, visuals, tables, columns, and measures."
      )}
      imageSrc="/assets/items/LineageExtractorItem/EditorEmpty.svg"
      imageAlt={t("LineageViewerItemEmpty_ImageAlt", "Lineage viewer empty state")}
      tasks={tasks}
    />
  );
}
