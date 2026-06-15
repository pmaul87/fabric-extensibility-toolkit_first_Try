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
import type { LineageWorkbenchExtractionConfig } from "./LineageWorkbenchItemDefinition";
import { LineageSetupWizard, LakehouseSetupResult } from "./LineageSetupWizard";
import { LineageEnvironmentSetupWizard, EnvironmentSetupResult } from "./LineageEnvironmentSetupWizard";
import { LineageNotebookSetupWizard, NotebookSetupResult } from "./LineageNotebookSetupWizard";
import { LineageWorkspaceSelectionWizard, WorkspaceSelectionResult } from "./LineageWorkspaceSelectionWizard";

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

  const [isRunning, setIsRunning] = useState(false);
  const [currentNotebook, setCurrentNotebook] = useState<string | null>(null);
  const [completedNotebooks, setCompletedNotebooks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isEnvironmentWizardOpen, setIsEnvironmentWizardOpen] = useState(false);
  const [isNotebookWizardOpen, setIsNotebookWizardOpen] = useState(false);
  const [isWorkspaceWizardOpen, setIsWorkspaceWizardOpen] = useState(false);



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
    setIsNotebookWizardOpen(true);
  };

  const handleNotebookWizardComplete = (result: NotebookSetupResult) => {
    console.log("Notebooks deployed:", result.deployedNotebooks, result.notebookIds);
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
        },
        (name) => {
          setCompletedNotebooks((prev) => [...prev, name]);
          setCurrentNotebook(null);
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
  }, [extraction, onExtractionChange, workloadClient, workspaceId]);

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
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {extraction.targetLakehouseId}
                </Text>
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
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {extraction.targetEnvironmentId}
                </Text>
              )}
            </div>
          </Field>
          
          <MessageBar intent="info">
            <MessageBarBody>
              {t("LineageWorkbench_Extraction_EnvironmentInfo", 
                "The environment must have semantic-link and semantic-link-labs libraries installed for lineage extraction.")}
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
          <Field label={t("LineageWorkbench_Extraction_Notebooks", "Deploy Notebooks")}>
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
                  <li>Extract_Datasets_and_Reports.ipynb</li>
                  <li>Extract_Datasources_from_SemanticModels.ipynb</li>
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
          {t("LineageWorkbench_Extraction_Section_Workspaces", "Workspaces to Extract")}
        </Text>
        <div className={styles.sectionBody}>
          <Field label={t("LineageWorkbench_Extraction_Workspaces", "Source Workspaces")}>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM }}>
              <Button
                appearance="secondary"
                icon={<BuildingRegular />}
                onClick={handleSelectWorkspaces}
              >
                {extraction.targetWorkspaces && extraction.targetWorkspaces.length > 0
                  ? t("LineageWorkbench_Extraction_Workspaces_Selected", "{{count}} workspace(s) selected", { count: extraction.targetWorkspaces.length })
                  : t("LineageWorkbench_Extraction_Workspaces_Select", "Select Workspaces")}
              </Button>
            </div>
          </Field>
          
          {extraction.targetWorkspaces && extraction.targetWorkspaces.length > 0 && (
            <MessageBar intent="success">
              <MessageBarBody>
                <strong>{t("LineageWorkbench_Extraction_SelectedWorkspaces", "Selected workspaces:")} </strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {extraction.targetWorkspaces.map((wsId) => (
                    <li key={wsId}>{wsId}</li>
                  ))}
                </ul>
              </MessageBarBody>
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
                "Configure Azure OpenAI for query explanation features during lineage extraction.")}
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

      <Divider />

      {/* Run Extraction Section */}
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
          disabled={isRunning || !extraction.targetLakehouseId || !extraction.targetWorkspaces || extraction.targetWorkspaces.length === 0}
          onClick={runExtraction}
        >
          {isRunning 
            ? t("LineageWorkbench_Extraction_Button_Running", "Running Extraction...")
            : t("LineageWorkbench_Extraction_Button_Run", "Run Extraction")}
        </Button>
        
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
                <Text>{t("LineageWorkbench_Extraction_Progress_Current", "Running: {{name}}", { name: currentNotebook })}</Text>
              </div>
            )}
            {completedNotebooks.map((name) => (
              <div key={name} className={styles.progressItem}>
                <Text>✅ {name}</Text>
              </div>
            ))}
          </div>
        )}
      </div>
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
        lakehouseId={extraction.targetLakehouseId || ""}
        lakehouseName={extraction.targetLakehouseDisplayName || ""}
        environmentId={extraction.targetEnvironmentId}
        environmentName={extraction.targetEnvironmentDisplayName}
        isOpen={isNotebookWizardOpen}
        onClose={() => setIsNotebookWizardOpen(false)}
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
