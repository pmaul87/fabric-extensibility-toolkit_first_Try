import React from "react";
import { PageProps } from '../../App';
import {
  Ribbon,
  RibbonAction,
  RibbonActionButton,
  createSaveAction,
  createSettingsAction,
} from '../../components/ItemEditor';
import { ViewContext } from '../../components';
import { DatabaseRegular } from "@fluentui/react-icons";
import { VIEW } from './InsightWorkbenchViewNames';

export interface InsightWorkbenchItemRibbonProps extends PageProps {
  isSaveButtonEnabled?: boolean;
  viewContext: ViewContext;
  saveItemCallback: () => Promise<void>;
  openSettingsCallback: () => Promise<void>;
}

/**
 * InsightWorkbenchItemRibbon
 *
 * Ribbon for Insight Workbench item. Contains:
 *  - Home tab: Save + Settings (mandatory via createSaveAction / createSettingsAction)
 *  - Additional toolbars: per-capability tabs added incrementally in future phases
 */
export function InsightWorkbenchItemRibbon(props: InsightWorkbenchItemRibbonProps) {
  const saveAction = createSaveAction(
    props.saveItemCallback,
    !props.isSaveButtonEnabled
  );

  const settingsAction = createSettingsAction(
    props.openSettingsCallback
  );

  // Mandatory Home tab actions
  const homeToolbarActions: RibbonAction[] = [
    saveAction,
    settingsAction,
    {
      key: 'storage-settings',
      label: 'OneLake Storage',
      icon: DatabaseRegular,
      onClick: () => props.viewContext.setCurrentView(VIEW.STORAGE_SETTINGS),
    },
  ];

  // No right action buttons in Phase 1
  const rightActionButtons: RibbonActionButton[] = [];

  return (
    <Ribbon
      homeToolbarActions={homeToolbarActions}
      additionalToolbars={[]}
      rightActionButtons={rightActionButtons}
    />
  );
}
