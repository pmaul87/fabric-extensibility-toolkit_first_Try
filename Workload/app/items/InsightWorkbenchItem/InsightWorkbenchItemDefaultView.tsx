import React from "react";
import { useTranslation } from "react-i18next";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input, Option, Text } from "@fluentui/react-components";
import { ItemWithDefinition } from "../../controller/ItemCRUDController";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { useViewNavigation } from "../../components/ItemEditor";
import { InsightWorkbenchItemDefinition, RequirementsBoardStorageSettings } from "./InsightWorkbenchItemDefinition";
import "./InsightWorkbenchItem.scss";

interface InsightWorkbenchItemDefaultViewProps {
  workloadClient: WorkloadClientAPI;
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  storageSettings?: RequirementsBoardStorageSettings;
  onStorageSettingsChange?: (nextStorageSettings: RequirementsBoardStorageSettings) => void;
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
    viewName: 'report-scanner',
    emoji: '📑',
    titleKey: 'InsightWorkbench_ReportScanner_Label',
    defaultTitle: 'Report Scanner',
    descriptionKey: 'InsightWorkbench_ReportScanner_Description',
    defaultDescription: 'Scan one selected report on demand and inspect report, page, visual, and visual-element usage.',
  },
  {
    viewName: 'requirements-board',
    emoji: '📋',
    titleKey: 'InsightWorkbench_RequirementsBoard_Label',
    defaultTitle: 'Requirements Board',
    descriptionKey: 'InsightWorkbench_RequirementsBoard_Description',
    defaultDescription: 'Manage requirements as Kanban cards linked to Fabric metadata and insights.',
  },
  {
    viewName: 'lakehouse-analyzer',
    emoji: '🏠',
    titleKey: 'InsightWorkbench_Lakehouse_Label',
    defaultTitle: 'Lakehouse / Warehouse Analyzer',
    descriptionKey: 'InsightWorkbench_Lakehouse_Description',
    defaultDescription: 'Inspect tables, views, stored procedures, and delta tables inside Lakehouse and Warehouse artifacts.',
  },
];

/**
 * Capability navigation hub — shown as the default landing view.
 * Clicking a card navigates to the capability's registered view.
 */
function HubContent({
  item,
  storageSettings,
  onStorageSettingsChange,
}: {
  item?: ItemWithDefinition<InsightWorkbenchItemDefinition>;
  storageSettings?: RequirementsBoardStorageSettings;
  onStorageSettingsChange?: (nextStorageSettings: RequirementsBoardStorageSettings) => void;
}) {
  const { t } = useTranslation();
  const { setCurrentView } = useViewNavigation();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [modeDraft, setModeDraft] = React.useState<"default" | "custom">(storageSettings?.mode ?? "default");
  const [pathDraft, setPathDraft] = React.useState(storageSettings?.oneLakeFilePath ?? "Files/requirements-board.tickets.v1.json");

  React.useEffect(() => {
    setModeDraft(storageSettings?.mode ?? "default");
    setPathDraft(storageSettings?.oneLakeFilePath ?? "Files/requirements-board.tickets.v1.json");
  }, [storageSettings?.mode, storageSettings?.oneLakeFilePath]);

  const saveSettings = () => {
    const nextPath = pathDraft.trim();
    onStorageSettingsChange?.({
      mode: modeDraft,
      oneLakeFilePath: modeDraft === "custom" ? nextPath : "Files/requirements-board.tickets.v1.json",
    });
    setIsSettingsOpen(false);
  };

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
      <div className="insight-workbench-requirements-filterbar-quick-actions">
        <Button appearance="secondary" onClick={() => setIsSettingsOpen(true)}>
          {t('InsightWorkbench_Hub_Settings_Button', 'Storage settings')}
        </Button>
        <Text size={200}>
          {t('InsightWorkbench_Hub_Settings_Current', 'Current ticket storage: {{mode}}', {
            mode: storageSettings?.mode === 'custom' ? (storageSettings.oneLakeFilePath || 'Custom') : 'Default OneLake file',
          })}
        </Text>
      </div>
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

      <Dialog open={isSettingsOpen} onOpenChange={(_, data) => setIsSettingsOpen(data.open)}>
        <DialogSurface className="insight-workbench-requirements-dialog-surface">
          <DialogBody>
            <DialogTitle>{t('InsightWorkbench_Hub_Settings_Title', 'Workbench storage settings')}</DialogTitle>
            <DialogContent>
              <Field label={t('InsightWorkbench_Hub_Settings_Mode', 'Ticket storage mode')}>
                <Dropdown
                  inlinePopup
                  selectedOptions={[modeDraft]}
                  value={modeDraft === 'custom'
                    ? t('InsightWorkbench_Hub_Settings_Mode_Custom', 'Custom OneLake path')
                    : t('InsightWorkbench_Hub_Settings_Mode_Default', 'Default path')}
                  onOptionSelect={(_, data) => setModeDraft(((data.optionValue as string) === 'custom' ? 'custom' : 'default'))}
                >
                  <Option value="default">{t('InsightWorkbench_Hub_Settings_Mode_Default', 'Default path')}</Option>
                  <Option value="custom">{t('InsightWorkbench_Hub_Settings_Mode_Custom', 'Custom OneLake path')}</Option>
                </Dropdown>
              </Field>

              <Field label={t('InsightWorkbench_Hub_Settings_Path', 'OneLake file path')}>
                <Input
                  value={pathDraft}
                  onChange={(_, data) => setPathDraft(data.value)}
                  disabled={modeDraft !== 'custom'}
                  placeholder="Files/requirements-board.tickets.v1.json"
                />
              </Field>

              <Text size={200}>
                {t('InsightWorkbench_Hub_Settings_Hint', 'Use a path under Files/, for example Files/requirements-board.tickets.v1.json')}
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={saveSettings}>{t('InsightWorkbench_Save', 'Save')}</Button>
              <Button appearance="secondary" onClick={() => setIsSettingsOpen(false)}>{t('InsightWorkbench_Cancel', 'Cancel')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
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
  storageSettings,
  onStorageSettingsChange,
}: InsightWorkbenchItemDefaultViewProps) {
  return (
    <ItemEditorDefaultView
      center={{
        content: <HubContent item={item} storageSettings={storageSettings} onStorageSettingsChange={onStorageSettingsChange} />,
      }}
    />
  );
}
