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
import { PlayRegular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
import { FabricNotebookClient } from "../../clients/FabricNotebookClient";
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

  const handleLakehouseChange = (value: string) => {
    onExtractionChange({ ...extraction, targetLakehouseId: value });
  };

  const handleWorkspaceIdChange = (value: string) => {
    onExtractionChange({ ...extraction, workspaceId: value });
  };

  const handleSqlEndpointChange = (value: string) => {
    onExtractionChange({ ...extraction, sqlEndpoint: value });
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
          <Field label={t("LineageWorkbench_Extraction_LakehouseId", "OneLake Lakehouse ID")}>
            <Input
              value={extraction.targetLakehouseId ?? ""}
              placeholder={t("LineageWorkbench_Extraction_LakehouseId_Placeholder", "Paste Lakehouse item ID...")}
              onChange={(_, data) => handleLakehouseChange(data.value)}
            />
          </Field>
          
          <Field 
            label={t("LineageWorkbench_Extraction_WorkspaceId", "Workspace ID (Manual Override)")}
            hint={t("LineageWorkbench_Extraction_WorkspaceId_Hint", "Override if lakehouse lookup fails. Find in Fabric URL: /groups/<workspace-id>/")}
          >
            <Input
              value={extraction.workspaceId ?? ""}
              placeholder={t("LineageWorkbench_Extraction_WorkspaceId_Placeholder", "e.g., 12345678-1234-1234-1234-123456789abc")}
              onChange={(_, data) => handleWorkspaceIdChange(data.value)}
            />
          </Field>
          
          <Field 
            label={t("LineageWorkbench_Extraction_SqlEndpoint", "SQL Analytics Endpoint (Optional)")}
            hint={t("LineageWorkbench_Extraction_SqlEndpoint_Hint", "Override if auto-detection fails. Format: <workspace-id>.datawarehouse.fabric.microsoft.com")}
          >
            <Input
              value={extraction.sqlEndpoint ?? ""}
              placeholder={t("LineageWorkbench_Extraction_SqlEndpoint_Placeholder", "e.g., abc123.datawarehouse.fabric.microsoft.com")}
              onChange={(_, data) => handleSqlEndpointChange(data.value)}
            />
          </Field>
          
          <MessageBar intent="info">
            <MessageBarBody>
              <strong>Manual Configuration (when auto-detection fails):</strong>
              <ol style={{ margin: "8px 0", paddingLeft: "20px" }}>
                <li><strong>Workspace ID:</strong> Find in Fabric portal URL: https://app.fabric.microsoft.com/groups/<strong>&lt;workspace-id&gt;</strong>/...</li>
                <li><strong>SQL Endpoint:</strong> Open your Lakehouse, find the SQL analytics endpoint connection string, copy only the hostname part (after "Server=" and before the semicolon)</li>
                <li>Enter both values above and save the workbench</li>
              </ol>
            </MessageBarBody>
          </MessageBar>
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
