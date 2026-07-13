import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  Field,
  Input,
  Checkbox,
  Divider,
  Button,
  Spinner,
  ProgressBar,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { PlayRegular, DatabaseRegular, BuildingRegular, DocumentRegular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { FabricNotebookClient } from "../../clients/FabricNotebookClient";
import { FabricPipelineClient } from "../../clients/FabricPipelineClient";
import type { LineageWorkbenchExtractionConfig } from "./LineageWorkbenchItemDefinition";
import { LineageSetupWizard, LakehouseSetupResult } from "./LineageSetupWizard";
import { LineageEnvironmentSetupWizard, EnvironmentSetupResult } from "./LineageEnvironmentSetupWizard";
import { LineageNotebookSetupWizard, NotebookSetupResult } from "./LineageNotebookSetupWizard";
import { LineageWorkspaceSelectionWizard, WorkspaceSelectionResult } from "./LineageWorkspaceSelectionWizard";
import bronzeExtractTemplate from "../../../notebooks/1_LineageWorkbench_Extract_Raw_Metadata.ipynb";
import silverNodeTemplate from "../../../notebooks/2_LineageWorkbench_Build_Node_View.ipynb";
import edgeExtractTemplate from "../../../notebooks/3_LineageWorkbench_BuildEdges.ipynb";
import mapDatasourcesTemplate from "../../../notebooks/4_LineageWorkbench_Map_M_Datasources.ipynb";

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingVerticalXL,
    maxWidth: "720px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXL,
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalS,
  },
  sectionBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  runSection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  progressItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS,
  },
});

interface LineageWorkbenchItemExtractionViewProps {
  workloadClient: WorkloadClientAPI;
  workspaceId: string;
  extraction: LineageWorkbenchExtractionConfig;
  onExtractionChange: (next: LineageWorkbenchExtractionConfig) => void;
  onSave?: () => Promise<void>;
}

export function LineageWorkbenchItemExtractionView(props: LineageWorkbenchItemExtractionViewProps) {
  const { workloadClient, workspaceId, extraction, onExtractionChange, onSave } = props;
  const { t } = useTranslation();
  const styles = useStyles();

  const buildItemPath = (itemWorkspaceId: string, itemTypePath: string, itemId: string): string => {
    return `/groups/${itemWorkspaceId}/${itemTypePath}/${itemId}`;
  };

  const openInNewTab = (path: string) => {
    window.open(path, "_blank", "noopener,noreferrer");
  };

  const [isRunning, setIsRunning] = useState(false);
  const [currentNotebook, setCurrentNotebook] = useState<string | null>(null);
  const [completedNotebooks, setCompletedNotebooks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEnvironmentWizardOpen, setIsEnvironmentWizardOpen] = useState(false);
  const [isNotebookWizardOpen, setIsNotebookWizardOpen] = useState(false);
  const [isPipelineOnlyWizard, setIsPipelineOnlyWizard] = useState(false);
  const [isWorkspaceWizardOpen, setIsWorkspaceWizardOpen] = useState(false);
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [pipelineRunError, setPipelineRunError] = useState<string | null>(null);
  const [currentNotebookCellProgress, setCurrentNotebookCellProgress] = useState<{
    completed?: number;
    total?: number;
    percent?: number;
    status?: string;
  } | null>(null);

  const NOTEBOOK_TEMPLATE_BY_NAME: Record<string, string> = {
    "1_LineageWorkbench_Extract_Raw_Metadata": bronzeExtractTemplate,
    "2_LineageWorkbench_Build_Node_View": silverNodeTemplate,
    "3_LineageWorkbench_BuildEdges": edgeExtractTemplate,
    "4_LineageWorkbench_Map_M_Datasources": mapDatasourcesTemplate,
  };

  const notebookOrder = [...FabricNotebookClient.EXTRACTION_NOTEBOOKS];

  const notebookCellCounts = notebookOrder.reduce<Record<string, number>>((acc, notebookName) => {
    const template = NOTEBOOK_TEMPLATE_BY_NAME[notebookName];
    if (!template) {
      acc[notebookName] = 0;
      return acc;
    }

    try {
      const parsed = JSON.parse(template) as { cells?: Array<{ cell_type?: string }> };
      acc[notebookName] = (parsed.cells || []).filter((cell) => cell?.cell_type === "code").length;
    } catch {
      acc[notebookName] = 0;
    }

    return acc;
  }, {});

  const totalCodeCells = notebookOrder.reduce((sum, notebookName) => sum + (notebookCellCounts[notebookName] || 0), 0);

  const completedCodeCells = completedNotebooks.reduce(
    (sum, notebookName) => sum + (notebookCellCounts[notebookName] || 0),
    0
  );

  const activeNotebookTemplateCells = currentNotebook ? notebookCellCounts[currentNotebook] || 0 : 0;
  const activeNotebookCompletedCells = currentNotebookCellProgress?.completed || 0;
  const processedCodeCells = completedCodeCells + Math.min(activeNotebookCompletedCells, activeNotebookTemplateCells || activeNotebookCompletedCells);



  const handleSelectLakehouse = async () => {
    setIsWizardOpen(true);
  };

  const handleWizardComplete = (result: LakehouseSetupResult) => {
    onExtractionChange({
      ...extraction,
      targetLakehouseId: result.lakehouseId,
      targetLakehouseDisplayName: result.lakehouseDisplayName,
      targetLakehouseWorkspaceId: result.lakehouseWorkspaceId,
    });
    // Auto-save after lakehouse selection
    setTimeout(() => {
      if (onSave) {
        onSave();
      }
    }, 100);
  };

  const handleSelectEnvironment = async () => {
    setIsEnvironmentWizardOpen(true);
  };

  const handleEnvironmentWizardComplete = (result: EnvironmentSetupResult) => {
    onExtractionChange({
      ...extraction,
      targetEnvironmentId: result.environmentId,
      targetEnvironmentDisplayName: result.environmentDisplayName,
      targetEnvironmentWorkspaceId: result.environmentWorkspaceId,
    });
    // Auto-save after environment selection
    setTimeout(() => {
      if (onSave) {
        onSave();
      }
    }, 100);
  };

  const handleDeployNotebooks = () => {
    setIsPipelineOnlyWizard(false);
    setIsNotebookWizardOpen(true);
  };

  const handleCreateOrUpdatePipeline = () => {
    setIsPipelineOnlyWizard(true);
    setIsNotebookWizardOpen(true);
  };

  const handleStartPipeline = async () => {
    if (!extraction.targetPipelineId) {
      setPipelineRunError("Please configure a deployment pipeline first.");
      return;
    }

    setIsStartingPipeline(true);
    setPipelineRunError(null);
    setPipelineRunId(null);

    try {
      const client = new FabricPipelineClient(workloadClient);
      const targetWorkspaces = (extraction.targetWorkspaces && extraction.targetWorkspaces.length > 0)
        ? extraction.targetWorkspaces
        : [workspaceId];

      const result = await client.triggerPipeline(workspaceId, extraction.targetPipelineId, {
        targetWorkspaces,
      });
      setPipelineRunId(result.jobInstanceId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setPipelineRunError(errorMessage);
    } finally {
      setIsStartingPipeline(false);
    }
  };

  const handleNotebookWizardComplete = (result: NotebookSetupResult) => {
    console.log("Notebooks deployed:", result.deployedNotebooks, result.notebookIds);
    onExtractionChange({
      ...extraction,
      targetPipelineId: result.pipelineId,
      targetPipelineDisplayName: result.pipelineDisplayName,
    });
    // Auto-save after notebook deployment
    setTimeout(() => {
      if (onSave) {
        onSave();
      }
    }, 100);
  };

  const handleSelectWorkspaces = () => {
    setIsWorkspaceWizardOpen(true);
  };

  const handleWorkspaceSelectionComplete = (result: WorkspaceSelectionResult) => {
    onExtractionChange({
      ...extraction,
      targetWorkspaces: result.workspaceIds,
      targetWorkspaceNames: result.workspaceNames,
      targetWorkspaceTypes: result.workspaceTypes,
      workspaceReportExtractionWarnings: result.reportExtractionWarnings,
    });
    // Auto-save after workspace selection
    setTimeout(() => {
      if (onSave) {
        onSave();
      }
    }, 100);
  };

  const runExtraction = useCallback(async () => {
    if (!extraction.targetLakehouseId) {
      setError("Please configure a target lakehouse ID first");
      return;
    }

    setIsRunning(true);
    setError(null);
    setCurrentNotebook(null);
    setCompletedNotebooks([]);
    setCurrentNotebookCellProgress(null);

    try {
      const client = new FabricNotebookClient(workloadClient);

      await client.runAllExtractionNotebooks(
        workspaceId,
        {
          targetWorkspaces: extraction.targetWorkspaces || [workspaceId],
          targetLakehouseId: extraction.targetLakehouseId,
          artifactTypes: extraction.artifactTypes,
        },
        (name) => {
          setCurrentNotebook(name);
          setCurrentNotebookCellProgress({ status: "InProgress" });
        },
        (name) => {
          setCompletedNotebooks((prev) => [...prev, name]);
          setCurrentNotebook(null);
          setCurrentNotebookCellProgress(null);
        },
        (progress) => {
          if (progress.notebookName !== currentNotebook && progress.status !== "Completed") {
            setCurrentNotebook(progress.notebookName);
          }

          setCurrentNotebookCellProgress({
            completed: progress.completedCells,
            total: progress.totalCells,
            percent: progress.progressPercent,
            status: progress.status,
          });
        }
      );

      // Update status to success
      onExtractionChange({ ...extraction, lastRunStatus: "success" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      onExtractionChange({ ...extraction, lastRunStatus: "error" });
    } finally {
      setIsRunning(false);
    }
  }, [extraction, onExtractionChange, workloadClient, workspaceId, currentNotebook]);

  const centerContent = (
    <div className={styles.root}>
      <MessageBar intent="info">
        <MessageBarBody>
          {t("LineageWorkbench_Extraction_PhaseNote",
            "Extraction configuration is scaffolded. Actual extraction logic runs through the Fabric API in a future phase.")}
        </MessageBarBody>
      </MessageBar>

      {extraction.targetLakehouseId && (
        <MessageBar intent="success">
          <MessageBarBody>
            {t("LineageWorkbench_Extraction_SaveReminder",
              "✅ Lakehouse ID configured. Remember to save the workbench (ribbon Save button) before navigating to the Lineage view.")}
          </MessageBarBody>
        </MessageBar>
      )}

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_Target", "Target Lakehouse")}
        </Text>
        <div className={styles.sectionBody}>
          <Field label={t("LineageWorkbench_Extraction_Lakehouse", "Lineage Storage Lakehouse")}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
              <Button
                appearance="secondary"
                icon={<DatabaseRegular />}
                onClick={handleSelectLakehouse}
              >
                {extraction.targetLakehouseId
                  ? extraction.targetLakehouseDisplayName || t("LineageWorkbench_Extraction_Lakehouse_Selected", "Lakehouse selected")
                  : t("LineageWorkbench_Extraction_Lakehouse_Select", "Select Lakehouse")}
              </Button>
              {extraction.targetLakehouseId && (
                <>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {extraction.targetLakehouseId}
                  </Text>
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() =>
                      openInNewTab(
                        buildItemPath(
                          extraction.targetLakehouseWorkspaceId || workspaceId,
                          "lakehouses",
                          extraction.targetLakehouseId as string
                        )
                      )
                    }
                  >
                    {t("LineageWorkbench_Extraction_OpenLakehouse", "Open")}
                  </Button>
                </>
              )}
            </div>
          </Field>
          
          <MessageBar intent="info">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_LakehouseInfo", 
                "Workspace ID and SQL endpoint are automatically retrieved from the selected lakehouse.")}
            </MessageBarBody>
          </MessageBar>
        </div>
      </div>

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_Environment", "Spark Environment")}
        </Text>
        <div className={styles.sectionBody}>
          <Field label={t("LineageWorkbench_Extraction_Environment", "Extraction Environment")}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
              <Button
                appearance="secondary"
                icon={<BuildingRegular />}
                onClick={handleSelectEnvironment}
              >
                {extraction.targetEnvironmentId
                  ? extraction.targetEnvironmentDisplayName || t("LineageWorkbench_Extraction_Environment_Selected", "Environment selected")
                  : t("LineageWorkbench_Extraction_Environment_Select", "Select Environment")}
              </Button>
              {extraction.targetEnvironmentId && (
                <>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {extraction.targetEnvironmentId}
                  </Text>
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() =>
                      openInNewTab(
                        buildItemPath(
                          extraction.targetEnvironmentWorkspaceId || workspaceId,
                          "synapseenvironments",
                          extraction.targetEnvironmentId as string
                        )
                      )
                    }
                  >
                    {t("LineageWorkbench_Extraction_OpenEnvironment", "Open")}
                  </Button>
                </>
              )}
            </div>
          </Field>
          
          <MessageBar intent="info">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_EnvironmentInfo", 
                "The environment must have semantic-link and semantic-link-labs libraries installed for lineage extraction. The workbench uses a configuration designed for F4 capacity. For faster processing, open the environment, go to Compute, and adjust the compute properties accordingly.")}
            </MessageBarBody>
          </MessageBar>
        </div>
      </div>

      <Divider />

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_Notebooks", "Extraction Notebooks")}
        </Text>
        <div className={styles.sectionBody}>
          <Field label={t("LineageWorkbench_Extraction_Notebooks", "Notebook Deployment") }>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
              <Button
                appearance="primary"
                icon={<DocumentRegular />}
                onClick={handleDeployNotebooks}
                disabled={!extraction.targetLakehouseId || !extraction.targetEnvironmentId}
              >
                {t("LineageWorkbench_Extraction_DeployNotebooks", "Deploy Notebooks")}
              </Button>
            </div>
          </Field>

          {(!extraction.targetLakehouseId || !extraction.targetEnvironmentId) && (
            <MessageBar intent="warning">
              <MessageBarBody>
                {t("LineageWorkbench_Extraction_NotebooksRequirement", 
                  "Please configure both lakehouse and environment before deploying notebooks.")}
              </MessageBarBody>
            </MessageBar>
          )}

          {extraction.targetLakehouseId && extraction.targetEnvironmentId && (
            <MessageBar intent="info">
              <MessageBarBody>
                <strong>{t("LineageWorkbench_Extraction_NotebooksInfo", "Available notebooks:")} </strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {notebookOrder.map((name) => (
                    <li key={name}>{name}.ipynb</li>
                  ))}
                </ul>
                <Text size={200}>
                  Notebooks will be configured with {extraction.targetLakehouseDisplayName} as default lakehouse
                  and {extraction.targetEnvironmentDisplayName} environment.
                </Text>
              </MessageBarBody>
            </MessageBar>
          )}
        </div>
      </div>

      <Divider />

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_Workspaces", "Workspaces to extract")}
        </Text>
        <div className={styles.sectionBody}>
          <Field label={t("LineageWorkbench_Extraction_Workspaces", "Source workspaces")}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
              <Button
                appearance="secondary"
                icon={<BuildingRegular />}
                onClick={handleSelectWorkspaces}
              >
                {extraction.targetWorkspaces && extraction.targetWorkspaces.length > 0
                  ? t("LineageWorkbench_Extraction_Workspaces_Selected", "{{count}} workspace(s) selected", { count: extraction.targetWorkspaces.length })
                  : t("LineageWorkbench_Extraction_Workspaces_Select", "Select workspaces")}
              </Button>
            </div>
          </Field>

          {extraction.targetWorkspaces && extraction.targetWorkspaces.length > 0 && (
            <MessageBar intent="success">
              <MessageBarBody>
                <strong>{t("LineageWorkbench_Extraction_SelectedWorkspaces", "Selected workspaces:")} </strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {(extraction.targetWorkspaceNames && extraction.targetWorkspaceNames.length > 0
                    ? extraction.targetWorkspaceNames
                    : extraction.targetWorkspaces).map((workspaceName, index) => (
                    <li key={`${workspaceName}-${index}`}>
                      <span>{workspaceName}</span>
                      {extraction.targetWorkspaceTypes && extraction.targetWorkspaceTypes[index] && (
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: tokens.spacingHorizontalS }}>
                          ({extraction.targetWorkspaceTypes[index]})
                        </Text>
                      )}
                      {extraction.targetWorkspaces && extraction.targetWorkspaces[index] && (
                        <Button
                          appearance="subtle"
                          size="small"
                          onClick={() => openInNewTab(`/groups/${extraction.targetWorkspaces?.[index]}`)}
                          style={{ marginLeft: tokens.spacingHorizontalS }}
                        >
                          {t("LineageWorkbench_Extraction_OpenWorkspace", "Open")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </MessageBarBody>
            </MessageBar>
          )}

          {extraction.workspaceReportExtractionWarnings && extraction.workspaceReportExtractionWarnings.length > 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>
                <strong>{t("LineageWorkbench_Extraction_WorkspaceWarning_Title", "Workspace capacity warning:")}</strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {extraction.workspaceReportExtractionWarnings.map((warning, index) => (
                    <li key={`workspace-warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </MessageBarBody>
            </MessageBar>
          )}
        </div>
      </div>

      <Divider />

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_DeploymentPipeline", "Deployment Pipeline")}
        </Text>
        <div className={styles.sectionBody}>
          <Field label={t("LineageWorkbench_Extraction_DeploymentPipeline", "Pipeline Deployment") }>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
              <Button
                appearance="secondary"
                icon={<DocumentRegular />}
                onClick={handleCreateOrUpdatePipeline}
              >
                {t("LineageWorkbench_Extraction_ConfigurePipeline", "Create/Update Pipeline")}
              </Button>
              <Button
                appearance="primary"
                icon={<PlayRegular />}
                onClick={handleStartPipeline}
                disabled={!extraction.targetPipelineId || isStartingPipeline}
              >
                {isStartingPipeline
                  ? t("LineageWorkbench_Extraction_StartPipeline_Starting", "Starting pipeline...")
                  : t("LineageWorkbench_Extraction_StartPipeline", "Start Pipeline")}
              </Button>
            </div>
          </Field>

          <MessageBar intent="info">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_DeploymentPipelineInfo", "Creates an orchestration pipeline that chains the selected notebooks.")}
            </MessageBarBody>
          </MessageBar>

          {extraction.targetPipelineId && (
            <MessageBar intent="success">
              <MessageBarBody>
                <strong>Pipeline configured:</strong> {extraction.targetPipelineDisplayName || "Lineage pipeline"}
                <div style={{ marginTop: tokens.spacingVerticalXS }}>
                  <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {extraction.targetPipelineId}
                    </Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() =>
                        openInNewTab(
                          buildItemPath(workspaceId, "pipelines", extraction.targetPipelineId as string)
                        )
                      }
                    >
                      {t("LineageWorkbench_Extraction_OpenPipeline", "Open")}
                    </Button>
                  </div>
                </div>
              </MessageBarBody>
            </MessageBar>
          )}

          {pipelineRunId && (
            <MessageBar intent="success">
              <MessageBarBody>
                {t("LineageWorkbench_Extraction_PipelineRunStarted", "Pipeline run started successfully.")}
                <div style={{ marginTop: tokens.spacingVerticalXS }}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    Job instance ID: {pipelineRunId}
                  </Text>
                </div>
              </MessageBarBody>
            </MessageBar>
          )}

          {pipelineRunError && (
            <MessageBar intent="error">
              <MessageBarBody>{pipelineRunError}</MessageBarBody>
            </MessageBar>
          )}
        </div>
      </div>

      <Divider />

      {/* Azure OpenAI Configuration */}
      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_AzureOpenAI", "Azure OpenAI Configuration")}
        </Text>
        <div className={styles.sectionBody}>
          <MessageBar intent="info">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_AzureOpenAI_Info",
                "NOT YET IMPLEMENTED! Configure Azure OpenAI for query explanation features during lineage extraction.")}
            </MessageBarBody>
          </MessageBar>

          <Checkbox
            checked={extraction.azureOpenAI?.enabled ?? false}
            onChange={(_, data) =>
              onExtractionChange({
                ...extraction,
                azureOpenAI: {
                  ...extraction.azureOpenAI,
                  enabled: data.checked as boolean,
                },
              })
            }
            label={t("LineageWorkbench_Extraction_AzureOpenAI_Enabled", "Enable Azure OpenAI Query Explanation")}
          />

          {extraction.azureOpenAI?.enabled && (
            <>
              <Field 
                label={t("LineageWorkbench_Extraction_AzureOpenAI_Endpoint", "Azure OpenAI Endpoint")}
                required
              >
                <Input
                  value={extraction.azureOpenAI?.endpoint ?? ""}
                  placeholder="https://your-resource.openai.azure.com"
                  onChange={(_, data) =>
                    onExtractionChange({
                      ...extraction,
                      azureOpenAI: {
                        ...extraction.azureOpenAI,
                        endpoint: data.value,
                      },
                    })
                  }
                />
              </Field>

              <Field 
                label={t("LineageWorkbench_Extraction_AzureOpenAI_ApiKey", "API Key")}
                required
              >
                <Input
                  type="password"
                  value={extraction.azureOpenAI?.apiKey ?? ""}
                  placeholder="Enter your Azure OpenAI API key"
                  onChange={(_, data) =>
                    onExtractionChange({
                      ...extraction,
                      azureOpenAI: {
                        ...extraction.azureOpenAI,
                        apiKey: data.value,
                      },
                    })
                  }
                />
              </Field>

              <Field label={t("LineageWorkbench_Extraction_AzureOpenAI_DeploymentName", "Deployment Name")}>
                <Input
                  value={extraction.azureOpenAI?.deploymentName ?? "gpt-4"}
                  placeholder="gpt-4"
                  onChange={(_, data) =>
                    onExtractionChange({
                      ...extraction,
                      azureOpenAI: {
                        ...extraction.azureOpenAI,
                        deploymentName: data.value,
                      },
                    })
                  }
                />
              </Field>

              <Field label={t("LineageWorkbench_Extraction_AzureOpenAI_MaxTokens", "Max Tokens")}>
                <Input
                  type="number"
                  value={String(extraction.azureOpenAI?.maxTokens ?? 500)}
                  onChange={(_, data) =>
                    onExtractionChange({
                      ...extraction,
                      azureOpenAI: {
                        ...extraction.azureOpenAI,
                        maxTokens: parseInt(data.value) || 500,
                      },
                    })
                  }
                />
              </Field>

              <Field label={t("LineageWorkbench_Extraction_AzureOpenAI_Temperature", "Temperature (0-1)")}>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={String(extraction.azureOpenAI?.temperature ?? 0.3)}
                  onChange={(_, data) =>
                    onExtractionChange({
                      ...extraction,
                      azureOpenAI: {
                        ...extraction.azureOpenAI,
                        temperature: parseFloat(data.value) || 0.3,
                      },
                    })
                  }
                />
              </Field>
            </>
          )}
        </div>
      </div>

      {/* Run Extraction Section hidden for now */}
      {false && (
      <div className={styles.runSection}>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_Run", "Run Extraction")}
        </Text>
        
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {extraction.lastRunStatus === "success" && !isRunning && (
          <MessageBar intent="success">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_LastRun_Success", "✅ Last extraction completed successfully")}
            </MessageBarBody>
          </MessageBar>
        )}

        <Button
          appearance="primary"
          icon={<PlayRegular />}
          disabled={
            isRunning ||
            !extraction.targetLakehouseId ||
            !extraction.targetEnvironmentId ||
            !extraction.targetWorkspaces ||
            extraction.targetWorkspaces.length === 0
          }
          onClick={runExtraction}
        >
          {isRunning 
            ? t("LineageWorkbench_Extraction_Button_Running", "Running Extraction...")
            : t("LineageWorkbench_Extraction_Button_Run", "Run Extraction")}
        </Button>

        {isRunning && (
          <MessageBar intent="info">
            <MessageBarBody>
              {t(
                "LineageWorkbench_Extraction_Progress_Cells",
                "Processed code cells: {{processed}} / {{total}}",
                { processed: processedCodeCells, total: totalCodeCells }
              )}
            </MessageBarBody>
          </MessageBar>
        )}
        
        {(!extraction.targetWorkspaces || extraction.targetWorkspaces.length === 0) && (
          <MessageBar intent="warning">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_NoWorkspaces", "Please select at least one workspace to extract from.")}
            </MessageBarBody>
          </MessageBar>
        )}

        {isRunning && (
          <div>
            <ProgressBar />
            {currentNotebook && (
              <div className={styles.progressItem}>
                <Spinner size="tiny" />
                <Text>
                  {t("LineageWorkbench_Extraction_Progress_Current", "Running: {{name}}", { name: currentNotebook })}
                  {currentNotebookCellProgress?.completed !== undefined &&
                    (currentNotebookCellProgress.total !== undefined || activeNotebookTemplateCells > 0) &&
                    ` (${currentNotebookCellProgress.completed}/${currentNotebookCellProgress.total ?? activeNotebookTemplateCells})`}
                </Text>
              </div>
            )}
            {notebookOrder.map((name) => (
              <div key={name} className={styles.progressItem}>
                <Text>
                  {completedNotebooks.includes(name)
                    ? `✅ ${name} (${notebookCellCounts[name] || 0} cells)`
                    : currentNotebook === name
                    ? `⏳ ${name}`
                    : `⬜ ${name}`}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );

  return (
    <>
      <LineageSetupWizard
        workloadClient={workloadClient}
        workspaceId={workspaceId}
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleWizardComplete}
      />
      <LineageEnvironmentSetupWizard
        workloadClient={workloadClient}
        workspaceId={workspaceId}
        isOpen={isEnvironmentWizardOpen}
        onClose={() => setIsEnvironmentWizardOpen(false)}
        onComplete={handleEnvironmentWizardComplete}
      />
      <LineageNotebookSetupWizard
        workloadClient={workloadClient}
        workspaceId={workspaceId}
        extractionWorkspaceIds={extraction.targetWorkspaces && extraction.targetWorkspaces.length > 0 ? extraction.targetWorkspaces : [workspaceId]}
        lakehouseId={extraction.targetLakehouseId || ""}
        lakehouseName={extraction.targetLakehouseDisplayName || ""}
        lakehouseWorkspaceId={extraction.targetLakehouseWorkspaceId}
        environmentId={extraction.targetEnvironmentId}
        environmentName={extraction.targetEnvironmentDisplayName}
        environmentWorkspaceId={extraction.targetEnvironmentWorkspaceId}
        pipelineOnly={isPipelineOnlyWizard}
        isOpen={isNotebookWizardOpen}
        onClose={() => {
          setIsNotebookWizardOpen(false);
          setIsPipelineOnlyWizard(false);
        }}
        onComplete={handleNotebookWizardComplete}
      />
      <LineageWorkspaceSelectionWizard
        workloadClient={workloadClient}
        currentWorkspaceId={workspaceId}
        preSelectedWorkspaceIds={extraction.targetWorkspaces}
        isOpen={isWorkspaceWizardOpen}
        onClose={() => setIsWorkspaceWizardOpen(false)}
        onComplete={handleWorkspaceSelectionComplete}
      />
      <ItemEditorDefaultView center={{ content: centerContent }} />
    </>
  );
}
