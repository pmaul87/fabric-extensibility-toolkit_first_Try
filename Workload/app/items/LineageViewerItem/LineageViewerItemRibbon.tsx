import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowClockwise24Regular } from "@fluentui/react-icons";
import { PageProps } from "../../App";
import { Ribbon, RibbonAction, createSaveAction, createSettingsAction, ViewContext } from "../../components/ItemEditor";

interface LineageViewerItemRibbonProps extends PageProps {
  viewContext: ViewContext;
  isSaveButtonEnabled: boolean;
  saveItemCallback: () => Promise<void>;
  openSettingsCallback: () => Promise<void>;
  refreshGraphCallback: () => void;
}

export function LineageViewerItemRibbon(props: LineageViewerItemRibbonProps) {
  const { t } = useTranslation();

  const saveAction = createSaveAction(props.saveItemCallback, !props.isSaveButtonEnabled);
  const settingsAction = createSettingsAction(props.openSettingsCallback);

  const refreshAction: RibbonAction = {
    key: "refresh-graph",
    label: t("LineageViewer_Ribbon_Refresh", "Refresh graph"),
    icon: ArrowClockwise24Regular,
    onClick: props.refreshGraphCallback,
    tooltip: t("LineageViewer_Ribbon_Refresh_Tooltip", "Reload dependency graph data"),
  };

  const homeToolbarActions: RibbonAction[] = [saveAction, settingsAction, refreshAction];

  return <Ribbon homeToolbarActions={homeToolbarActions} viewContext={props.viewContext} />;
}
