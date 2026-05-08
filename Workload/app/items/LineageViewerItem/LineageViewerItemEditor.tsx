import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NotificationType } from "@ms-fabric/workload-client";
import { PageProps, ContextProps } from "../../App";
import { ItemWithDefinition, callGetItem, getWorkloadItem, saveWorkloadItem } from "../../controller/ItemCRUDController";
import { callOpenSettings } from "../../controller/SettingsController";
import { callNotificationOpen } from "../../controller/NotificationController";
import { ItemEditor } from "../../components/ItemEditor";
import { LineageViewerItemDefinition } from "./LineageViewerItemDefinition";
import { LineageViewerItemDefaultView } from "./LineageViewerItemDefaultView";
import { LineageViewerItemRibbon } from "./LineageViewerItemRibbon";
import "./LineageViewerItem.scss";

export const EDITOR_VIEW_TYPES = {
  EMPTY: "empty",
  DEFAULT: "default",
} as const;

const INITIAL_DEFINITION: LineageViewerItemDefinition = {
  direction: "both",
  maxDepth: 4,
};

const enum SaveStatus {
  NotSaved = "NotSaved",
  Saving = "Saving",
  Saved = "Saved",
}

export function LineageViewerItemEditor(props: PageProps) {
  const { workloadClient } = props;
  const pageContext = useParams<ContextProps>();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState<ItemWithDefinition<LineageViewerItemDefinition>>();
  const [definition, setDefinition] = useState<LineageViewerItemDefinition>(INITIAL_DEFINITION);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.NotSaved);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        if (pageContext.itemObjectId) {
          const loadedItem = await getWorkloadItem<LineageViewerItemDefinition>(workloadClient, pageContext.itemObjectId);
          const loadedDefinition = loadedItem.definition ?? INITIAL_DEFINITION;
          setItem(loadedItem);
          setDefinition(loadedDefinition);
          setSaveStatus(loadedItem.definition ? SaveStatus.Saved : SaveStatus.NotSaved);
        }
      } catch (error) {
        console.error("Failed to load LineageViewer item:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [pageContext.itemObjectId, workloadClient]);

  const handleDefinitionChange = (next: LineageViewerItemDefinition) => {
    setDefinition(next);
    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleSave = async () => {
    if (!item) {
      return;
    }

    setSaveStatus(SaveStatus.Saving);
    try {
      await saveWorkloadItem<LineageViewerItemDefinition>(workloadClient, {
        ...item,
        definition,
      });
      setSaveStatus(SaveStatus.Saved);
      await callNotificationOpen(
        workloadClient,
        t("LineageViewer_Save_Success_Title", "Lineage viewer saved"),
        t("LineageViewer_Save_Success_Message", "Viewer settings and current graph context were saved."),
        NotificationType.Success,
        undefined
      );
    } catch (error) {
      setSaveStatus(SaveStatus.NotSaved);
      await callNotificationOpen(
        workloadClient,
        t("LineageViewer_Save_Failed_Title", "Failed to save lineage viewer"),
        error instanceof Error ? error.message : String(error),
        NotificationType.Error,
        undefined
      );
    }
  };

  const handleOpenSettings = async () => {
    if (!item) {
      return;
    }

    try {
      const itemResponse = await callGetItem(workloadClient, item.id);
      await callOpenSettings(workloadClient, itemResponse.item, "About");
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  };

  const handleRefreshGraph = () => {
    setDefinition((previous) => ({
      ...previous,
      graphSnapshot: previous.graphSnapshot
        ? {
            ...previous.graphSnapshot,
            generatedAtUtc: new Date().toISOString(),
          }
        : previous.graphSnapshot,
    }));
    setSaveStatus(SaveStatus.NotSaved);
  };

  const views = [
    {
      name: EDITOR_VIEW_TYPES.DEFAULT,
      component: (
        <LineageViewerItemDefaultView
          workloadClient={workloadClient}
          item={item}
          definition={definition}
          onDefinitionChange={handleDefinitionChange}
        />
      ),
    },
  ];

  return (
    <ItemEditor
      isLoading={isLoading}
      getInitialView={() => EDITOR_VIEW_TYPES.DEFAULT}
      loadingMessage={t("LineageViewer_Loading", "Loading lineage viewer...")}
      ribbon={(context) => (
        <LineageViewerItemRibbon
          {...props}
          viewContext={context}
          isSaveButtonEnabled={saveStatus !== SaveStatus.Saving}
          saveItemCallback={handleSave}
          openSettingsCallback={handleOpenSettings}
          refreshGraphCallback={handleRefreshGraph}
        />
      )}
      views={views}
    />
  );
}
