import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NotificationType } from "@ms-fabric/workload-client";
import { PageProps, ContextProps } from "../../App";
import { ItemWithDefinition, callGetItem, getWorkloadItem, saveWorkloadItem } from "../../controller/ItemCRUDController";
import { callOpenSettings } from "../../controller/SettingsController";
import { callNotificationOpen } from "../../controller/NotificationController";
import { ItemEditor } from "../../components/ItemEditor";
import { RequirementBoardItemDefinition } from "./RequirementBoardItemDefinition";
import { RequirementBoardItemDefaultView } from "./RequirementBoardItemDefaultView";
import { RequirementBoardItemEmptyView } from "./RequirementBoardItemEmptyView";
import { RequirementBoardItemRibbon } from "./RequirementBoardItemRibbon";
import "./RequirementBoardItem.scss";

const EDITOR_VIEW_TYPES = {
  EMPTY: "empty",
  DEFAULT: "default",
} as const;

const INITIAL_DEFINITION: RequirementBoardItemDefinition = {
  requirements: [],
};

const enum SaveStatus {
  NotSaved = "NotSaved",
  Saving = "Saving",
  Saved = "Saved",
}

export function RequirementBoardItemEditor(props: PageProps) {
  const { workloadClient } = props;
  const pageContext = useParams<ContextProps>();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState<ItemWithDefinition<RequirementBoardItemDefinition>>();
  const [definition, setDefinition] = useState<RequirementBoardItemDefinition>(INITIAL_DEFINITION);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.NotSaved);
  const [createRequestToken, setCreateRequestToken] = useState(0);
  const [createRequestNodeId, setCreateRequestNodeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#create=")) {
      const nodeId = decodeURIComponent(hash.slice("#create=".length));
      setCreateRequestNodeId(nodeId || undefined);
      setCreateRequestToken((prev) => prev + 1);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        if (pageContext.itemObjectId) {
          const loadedItem = await getWorkloadItem<RequirementBoardItemDefinition>(
            workloadClient,
            pageContext.itemObjectId
          );
          const loadedDefinition = loadedItem.definition ?? INITIAL_DEFINITION;
          setItem(loadedItem);
          setDefinition(loadedDefinition);
          setSaveStatus(loadedItem.definition ? SaveStatus.Saved : SaveStatus.NotSaved);
        }
      } catch (error) {
        console.error("Failed to load RequirementBoard item:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [pageContext.itemObjectId, workloadClient]);

  const handleDefinitionChange = (next: RequirementBoardItemDefinition) => {
    setDefinition(next);
    setSaveStatus(SaveStatus.NotSaved);
  };

  const handleSave = async () => {
    if (!item) return;
    setSaveStatus(SaveStatus.Saving);
    try {
      await saveWorkloadItem<RequirementBoardItemDefinition>(workloadClient, {
        ...item,
        definition,
      });
      setSaveStatus(SaveStatus.Saved);
      await callNotificationOpen(
        workloadClient,
        t("RequirementBoard_Save_Success_Title", "Board saved"),
        t("RequirementBoard_Save_Success_Message", "Requirements and board settings saved."),
        NotificationType.Success,
        undefined
      );
    } catch (error) {
      setSaveStatus(SaveStatus.NotSaved);
      await callNotificationOpen(
        workloadClient,
        t("RequirementBoard_Save_Failed_Title", "Failed to save board"),
        error instanceof Error ? error.message : String(error),
        NotificationType.Error,
        undefined
      );
    }
  };

  const handleOpenSettings = async () => {
    if (!item) return;
    try {
      const itemResponse = await callGetItem(workloadClient, item.id);
      await callOpenSettings(workloadClient, itemResponse.item, "About");
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  };

  const views = [
    {
      name: EDITOR_VIEW_TYPES.EMPTY,
      component: (
        <RequirementBoardItemEmptyView
          onGetStarted={() => {/* handled by getInitialView */}}
        />
      ),
    },
    {
      name: EDITOR_VIEW_TYPES.DEFAULT,
      component: (
        <RequirementBoardItemDefaultView
          workloadClient={workloadClient}
          definition={definition}
          onDefinitionChange={handleDefinitionChange}
          createRequestToken={createRequestToken}
          createRequestNodeId={createRequestNodeId}
        />
      ),
    },
  ];

  return (
    <ItemEditor
      isLoading={isLoading}
      getInitialView={() => EDITOR_VIEW_TYPES.DEFAULT}
      loadingMessage={t("RequirementBoard_Loading", "Loading requirement board...")}
      ribbon={(context) => (
        <RequirementBoardItemRibbon
          {...props}
          viewContext={context}
          isSaveButtonEnabled={saveStatus !== SaveStatus.Saving}
          saveItemCallback={handleSave}
          openSettingsCallback={handleOpenSettings}
          onAddRequirement={() => {
            setCreateRequestNodeId(undefined);
            setCreateRequestToken((prev) => prev + 1);
          }}
        />
      )}
      views={views}
    />
  );
}
