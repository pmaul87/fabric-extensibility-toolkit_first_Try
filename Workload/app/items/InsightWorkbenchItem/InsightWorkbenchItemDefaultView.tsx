import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { useViewNavigation } from "../../components/ItemEditor";
import { InsightWorkbenchItemDefinition } from "./InsightWorkbenchItemDefinition";
import "./InsightWorkbenchItem.scss";

interface InsightWorkbenchItemDefaultViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
}

/**
 * Hub card definition — one entry per capability.
 * Extend this array in future phases as capabilities are fully built out.
 */
interface CapabilityCard {
  viewName: string;
  emoji: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey: string;
  defaultDescription: string;
}

const CAPABILITY_CARDS: CapabilityCard[] = [
  {
    viewName: 'metadata-explorer',
    emoji: '🗂️',
    titleKey: 'InsightWorkbench_MetadataExplorer_Label',
    defaultTitle: 'Metadata Explorer',
    descriptionKey: 'InsightWorkbench_MetadataExplorer_Description',
    defaultDescription: 'Browse, search, and filter all Fabric artifacts across workspaces.',
  },
  {
    viewName: 'semantic-analyzer',
    emoji: '🔬',
    titleKey: 'InsightWorkbench_SemanticAnalyzer_Label',
    defaultTitle: 'Semantic Model Analyzer',
    descriptionKey: 'InsightWorkbench_SemanticAnalyzer_Description',
    defaultDescription: 'Explore tables, measures, columns, and dependencies inside semantic models.',
  },
  {
    viewName: 'lineage-graph',
    emoji: '🕸️',
    titleKey: 'InsightWorkbench_LineageGraph_Label',
    defaultTitle: 'Lineage & Dependency Graph',
    descriptionKey: 'InsightWorkbench_LineageGraph_Description',
    defaultDescription: 'Trace cross-workspace data lineage and report usage — upstream and downstream.',
  },
  {
    viewName: 'requirements-board',
    emoji: '📋',
    titleKey: 'InsightWorkbench_RequirementsBoard_Label',
    defaultTitle: 'Requirements Board',
    descriptionKey: 'InsightWorkbench_RequirementsBoard_Description',
    defaultDescription: 'Manage requirements as Kanban cards linked to Fabric metadata and insights.',
  },
];

/**
 * Capability navigation hub — shown as the default landing view.
 * Clicking a card navigates to the capability's registered view.
 */
function HubContent({ item }: { item?: ItemWithDefinition<InsightWorkbenchItemDefinition> }) {
  const { t } = useTranslation();
  const { setCurrentView } = useViewNavigation();

  return (
    <div className="insight-workbench-hub">
      <h1 className="insight-workbench-hub-title">
        {t('InsightWorkbench_Hub_Title', 'Insight Workbench')}
      </h1>
      <p className="insight-workbench-hub-description">
        {t(
          'InsightWorkbench_Hub_Description',
          'Select a capability below to get started. Your work is automatically saved across sessions.'
        )}
      </p>
      <div className="insight-workbench-hub-cards">
        {CAPABILITY_CARDS.map((card) => (
          <div
            key={card.viewName}
            className="insight-workbench-hub-card"
            role="button"
            tabIndex={0}
            aria-label={t(card.titleKey, card.defaultTitle)}
            onClick={() => setCurrentView(card.viewName)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setCurrentView(card.viewName);
            }}
          >
            <div className="insight-workbench-hub-card-icon">{card.emoji}</div>
            <div className="insight-workbench-hub-card-title">
              {t(card.titleKey, card.defaultTitle)}
            </div>
            <div className="insight-workbench-hub-card-description">
              {t(card.descriptionKey, card.defaultDescription)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * InsightWorkbenchItemDefaultView
 * Two-panel layout: left panel reserved for future quick-nav tree / OneLakeView;
 * center panel shows the capability hub or the currently active capability stub.
 */
export function InsightWorkbenchItemDefaultView({
  workloadClient,
  item,
}: InsightWorkbenchItemDefaultViewProps) {
  return (
    <ItemEditorDefaultView
      center={{
        content: <HubContent item={item} />,
      }}
    />
  );
}
