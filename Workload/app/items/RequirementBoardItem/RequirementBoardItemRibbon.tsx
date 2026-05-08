import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowClockwise24Regular } from "@fluentui/react-icons";
import { PageProps } from "../../App";
import { Ribbon, RibbonAction, createSaveAction, createSettingsAction, ViewContext } from "../../components/ItemEditor";

interface RequirementBoardItemRibbonProps extends PageProps {
  viewContext: ViewContext;
  isSaveButtonEnabled: boolean;
  saveItemCallback: () => Promise<void>;
  openSettingsCallback: () => Promise<void>;
  onAddRequirement: () => void;
}

export function RequirementBoardItemRibbon(props: RequirementBoardItemRibbonProps) {
  const { t } = useTranslation();

  const saveAction = createSaveAction(props.saveItemCallback, !props.isSaveButtonEnabled);
  const settingsAction = createSettingsAction(props.openSettingsCallback);

  const addAction: RibbonAction = {
    key: "add-requirement",
    label: t("RequirementBoard_Ribbon_Add", "New requirement"),
    icon: ArrowClockwise24Regular,
    onClick: props.onAddRequirement,
    tooltip: t("RequirementBoard_Ribbon_Add_Tooltip", "Add a new requirement to the backlog"),
  };

  const homeToolbarActions: RibbonAction[] = [saveAction, settingsAction, addAction];

  return <Ribbon homeToolbarActions={homeToolbarActions} viewContext={props.viewContext} />;
}
