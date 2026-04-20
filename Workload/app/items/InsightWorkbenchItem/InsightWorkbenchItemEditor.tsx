import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NotificationType } from "@ms-fabric/workload-client";
import { PageProps, ContextProps } from "../../App";
import {
  ItemWithDefinition,
  getWorkloadItem,
  callGetItem,
  saveWorkloadItem,
} from "../../controller/ItemCRUDController";
import { callOpenSettings } from "../../controller/SettingsController";
import { callNotificationOpen } from "../../controller/NotificationController";
import {
  ItemEditor,
  useViewNavigation,
  RegisteredNotification,
} from "../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "./InsightWorkbenchItemDefinition";
import { InsightWorkbenchItemEmptyView } from "./InsightWorkbenchItemEmptyView";
import { InsightWorkbenchItemDefaultView } from "./InsightWorkbenchItemDefaultView";
import { InsightWorkbenchItemRibbon } from "./InsightWorkbenchItemRibbon";
import { MetadataExplorerView } from "./views/MetadataExplorer/MetadataExplorerView";
import { SemanticAnalyzerView } from "./views/SemanticAnalyzer/SemanticAnalyzerView";
import { LineageGraphView } from "./views/LineageGraph/LineageGraphView";
import { RequirementsBoardView } from "./views/RequirementsBoard/RequirementsBoardView";
import "./InsightWorkbenchItem.scss";

// ---------------------------------------------------------------------------
// View name constants — single source of truth shared with ribbon / views
// ---------------------------------------------------------------------------
export const VIEW = {
  EMPTY: 'empty',
  HUB: 'hub',
  METADATA_EXPLORER: 'metadata-explorer',
  SEMANTIC_ANALYZER: 'semantic-analyzer',
  LINEAGE_GRAPH: 'lineage-graph',
  REQUIREMENTS_BOARD: 'requirements-board',
} as const;

export type InsightWorkbenchView = typeof VIEW[keyof typeof VIEW];

// ---------------------------------------------------------------------------
// Save status
// ---------------------------------------------------------------------------
const enum SaveStatus {
  NotSaved = 'NotSaved',
  Saving = 'Saving',
  Saved = 'Saved',
}

const INITIAL_DEFINITION: InsightWorkbenchItemDefinition = {
  schemaVersion: '1.0',
  requirementsBoard: { cards: [] },
};

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function InsightWorkbenchItemEditor(props: PageProps) {
  const { workloadClient } = props;
  const pageContext = useParams<ContextProps>();
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState<ItemWithDefinition<InsightWorkbenchItemDefinition>>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.NotSaved);
  const [currentDefinition, setCurrentDefinition] =
    useState<InsightWorkbenchItemDefinition>(INITIAL_DEFINITION);
  const [viewSetter, setViewSetter] = useState<((view: string) => void) | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function loadDataFromUrl(ctx: ContextProps, path: string): Promise<void> {
    if (ctx.itemObjectId && item && item.id === ctx.itemObjectId) {
      return; // already loaded
    }

    setIsLoading(true);

    if (ctx.itemObjectId) {
      try {
        let loaded = await getWorkloadItem<InsightWorkbenchItemDefinition>(
          workloadClient,
          ctx.itemObjectId
        );

        if (!loaded.definition) {
          setSaveStatus(SaveStatus.NotSaved);
          loaded = { ...loaded, definition: INITIAL_DEFINITION };
        } else {
          setSaveStatus(SaveStatus.Saved);
        }

        setItem(loaded);
        setCurrentDefinition(loaded.definition);
      } catch (err) {
        console.error('[InsightWorkbench] Failed to load item:', err);
        setItem(undefined);
      }
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadDataFromUrl(pageContext, pathname);
  }, [pageContext, pathname]);

  // ── Settings ──────────────────────────────────────────────────────────────
  const handleOpenSettings = async () => {
    if (item) {
      try {
        const res = await callGetItem(workloadClient, item.id);
        await callOpenSettings(workloadClient, res.item, 'About');
      } catch (err) {
        console.error('[InsightWorkbench] Failed to open settings:', err);
      }
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveItem(): Promise<void> {
    setSaveStatus(SaveStatus.Saving);

    const definitionToSave: InsightWorkbenchItemDefinition = {
      ...currentDefinition,
      schemaVersion: '1.0',
    };

    let successResult: unknown;
    let errorMessage = '';

    try {
      successResult = await saveWorkloadItem<InsightWorkbenchItemDefinition>(
        workloadClient,
        { ...item, definition: definitionToSave }
      );
    } catch (err: unknown) {
      errorMessage = (err as Error)?.message ?? '';
    }

    if (successResult) {
      item!.definition = definitionToSave;
      setCurrentDefinition(definitionToSave);
      setSaveStatus(SaveStatus.Saved);
      callNotificationOpen(
        workloadClient,
        t('ItemEditor_Saved_Notification_Title'),
        t('ItemEditor_Saved_Notification_Text', { itemName: item!.displayName }),
        undefined,
        undefined
      );
    } else {
      setSaveStatus(SaveStatus.NotSaved);
      const msg = errorMessage
        ? `${t('ItemEditor_SaveFailed_Notification_Text', { itemName: item?.displayName })} ${errorMessage}.`
        : t('ItemEditor_SaveFailed_Notification_Text', { itemName: item?.displayName });
      callNotificationOpen(workloadClient, t('ItemEditor_SaveFailed_Notification_Title'), msg, NotificationType.Error, undefined);
    }
  }

  // ── Derived save-enabled ──────────────────────────────────────────────────
  const isSaveEnabled = (currentView: string): boolean => {
    if (currentView === VIEW.EMPTY) return false;
    return saveStatus !== SaveStatus.Saved;
  };

  // ── View wrappers that use navigation hooks ───────────────────────────────

  const EmptyViewWrapper = () => {
    const { setCurrentView } = useViewNavigation();
    return (
      <InsightWorkbenchItemEmptyView
        workloadClient={workloadClient}
        item={item}
        onNavigateToHub={() => {
          setCurrentDefinition((prev) => ({
            ...prev,
            schemaVersion: '1.0',
          }));
          setSaveStatus(SaveStatus.NotSaved);
          setCurrentView(VIEW.HUB);
        }}
      />
    );
  };

  // ── Static view registrations ─────────────────────────────────────────────
  const views = [
    {
      name: VIEW.EMPTY,
      component: <EmptyViewWrapper />,
    },
    {
      name: VIEW.HUB,
      component: (
        <InsightWorkbenchItemDefaultView
          workloadClient={workloadClient}
          item={item}
        />
      ),
    },
    {
      name: VIEW.METADATA_EXPLORER,
      component: (
        <MetadataExplorerView
          workloadClient={workloadClient}
          item={item}
        />
      ),
    },
    {
      name: VIEW.SEMANTIC_ANALYZER,
      component: (
        <SemanticAnalyzerView
          workloadClient={workloadClient}
          item={item}
        />
      ),
    },
    {
      name: VIEW.LINEAGE_GRAPH,
      component: (
        <LineageGraphView
          workloadClient={workloadClient}
          item={item}
        />
      ),
    },
    {
      name: VIEW.REQUIREMENTS_BOARD,
      component: (
        <RequirementsBoardView
          workloadClient={workloadClient}
          item={item}
        />
      ),
    },
  ];

  // Determine initial view after load completes
  useEffect(() => {
    if (!isLoading && item && viewSetter) {
      const hasDefinition =
        item.definition?.schemaVersion !== undefined ||
        (item.definition?.requirementsBoard?.cards?.length ?? 0) > 0;
      viewSetter(hasDefinition ? VIEW.HUB : VIEW.EMPTY);
    }
  }, [isLoading, item, viewSetter]);

  // ── Static notification registrations ────────────────────────────────────
  const notifications: RegisteredNotification[] = [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ItemEditor
      isLoading={isLoading}
      loadingMessage={t('InsightWorkbenchItemEditor_Loading', 'Loading Insight Workbench...')}
      ribbon={(context) => (
        <InsightWorkbenchItemRibbon
          {...props}
          viewContext={context}
          isSaveButtonEnabled={isSaveEnabled(context.currentView)}
          saveItemCallback={saveItem}
          openSettingsCallback={handleOpenSettings}
        />
      )}
      messageBar={notifications}
      views={views}
      viewSetter={(setCurrentView) => {
        if (!viewSetter) {
          setViewSetter(() => setCurrentView);
        }
      }}
    />
  );
}
