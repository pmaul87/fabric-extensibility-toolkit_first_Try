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
import { PlayRegular, DatabaseRegular, BuildingRegular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { FabricNotebookClient } from "../../clients/FabricNotebookClient";
import { callDatahubOpen } from "../../controller/DataHubController";
import type { LineageWorkbenchExtractionConfig } from "./LineageWorkbenchItemDefinition";

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
  checkboxGroup: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
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

const ARTIFACT_TYPES = [
  "semantic_model",
  "report",
  "dataflow",
  "lakehouse",
  "warehouse",
  "notebook",
  "pipeline",
  "eventhouse",
  "dataset",
];

interface LineageWorkbenchItemExtractionViewProps {
  workloadClient: WorkloadClientAPI;
  workspaceId: string;
  extraction: LineageWorkbenchExtractionConfig;
  onExtractionChange: (next: LineageWorkbenchExtractionConfig) => void;
}

export function LineageWorkbenchItemExtractionView(props: LineageWorkbenchItemExtractionViewProps) {
  const { workloadClient, workspaceId, extraction, onExtractionChange } = props;
  const { t } = useTranslation();
  const styles = useStyles();

  const [isRunning, setIsRunning] = useState(false);
  const [currentNotebook, setCurrentNotebook] = useState<string | null>(null);
  const [completedNotebooks, setCompletedNotebooks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedTypes = new Set(extraction.artifactTypes ?? []);

  const toggleArtifactType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onExtractionChange({ ...extraction, artifactTypes: Array.from(next) });
  };

  const handleSelectLakehouse = async () => {
    const result = await callDatahubOpen(
      workloadClient,
      ["Lakehouse"],
      t("LineageWorkbench_Extraction_SelectLakehouse", "Select a Lakehouse for lineage storage"),
      false
    );

    if (result) {
      onExtractionChange({
        ...extraction,
        targetLakehouseId: result.id,
        targetLakehouseDisplayName: result.displayName,
        targetLakehouseWorkspaceId: result.workspaceId,
      });
    }
  };

  const handleCreateNewLakehouse = (checked: boolean) => {
    onExtractionChange({
      ...extraction,
      notebooks: {
        ...extraction.notebooks,
        createNewLakehouse: checked,
      },
    });
  };

  const handleDeployClick = async () => {
    if (!extraction.targetLakehouseId) {
      setError("Please select a target lakehouse first");
      return;
    }

    setError(null);
    // TODO: Implement notebook deployment via Fabric API
    // For now, show a message that deployment is not yet implemented
    setError(
      "Notebook deployment via UI is scaffolded. Use PowerShell script for now: " +
      "pwsh .\\scripts\\Deploy\\DeployNotebooksToFabric.ps1 -WorkspaceId <workspace-id>"
    );
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
          targetWorkspaces: [workspaceId], // Extract from current workspace
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

      <Divider />

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_Deployment", "Deployment Configuration")}
        </Text>
        <div className={styles.sectionBody}>
          <MessageBar intent="info">
            <MessageBarBody>
              <strong>{t("LineageWorkbench_Extraction_NotebooksInfo", "Notebooks to deploy:")} </strong>
              <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                <li>Extract_Datasets_and_Reports.ipynb</li>
                <li>Extract_Datasources_from_SemanticModels.ipynb</li>
              </ul>
            </MessageBarBody>
          </MessageBar>
          
          <Checkbox
            checked={extraction.notebooks?.createNewLakehouse ?? false}
            onChange={(_, data) => handleCreateNewLakehouse(data.checked as boolean)}
            label={t("LineageWorkbench_Extraction_CreateNewLakehouse", "Create new lakehouse for lineage storage")}
          />
          {extraction.notebooks?.createNewLakehouse && (
            <Field label={t("LineageWorkbench_Extraction_NewLakehouseName", "New Lakehouse Name")}>
              <Input
                value={extraction.notebooks?.newLakehouseName ?? ""}
                placeholder={t("LineageWorkbench_Extraction_NewLakehouseName_Placeholder", "Enter lakehouse name...")}
                onChange={(_, data) =>
                  onExtractionChange({
                    ...extraction,
                    notebooks: {
                      ...extraction.notebooks,
                      newLakehouseName: data.value,
                    },
                  })
                }
              />
            </Field>
          )}
          
          <Button
            appearance="primary"
            onClick={handleDeployClick}
            disabled={!extraction.targetLakehouseId}
          >
            {t("LineageWorkbench_Extraction_DeployButton", "Deploy Notebooks to Workspace")}
          </Button>
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
                onClick={undefined}
              >
                {t("LineageWorkbench_Extraction_Workspaces_Select", "Select Workspaces")}
              </Button>
            </div>
          </Field>
        </div>
      </div>

      <Divider />

      <div>
        <Text className={styles.sectionTitle}>
          {t("LineageWorkbench_Extraction_Section_ArtifactTypes", "Artifact Types to Extract")}
        </Text>
        <div className={styles.checkboxGroup}>
          {ARTIFACT_TYPES.map((type) => (
            <Checkbox
              key={type}
              label={type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              checked={selectedTypes.has(type)}
              onChange={() => toggleArtifactType(type)}
            />
          ))}
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
          disabled={isRunning || !extraction.targetLakehouseId}
          onClick={runExtraction}
        >
          {isRunning 
            ? t("LineageWorkbench_Extraction_Button_Running", "Running Extraction...")
            : t("LineageWorkbench_Extraction_Button_Run", "Run Extraction")}
        </Button>

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
    <ItemEditorDefaultView center={{ content: centerContent }} />
  );
}
