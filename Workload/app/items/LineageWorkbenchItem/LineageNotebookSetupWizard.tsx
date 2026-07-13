import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  Divider,
  makeStyles,
  tokens,
  Checkbox,
  Field,
  Input,
  Radio,
  RadioGroup,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemClient } from "../../clients/ItemClient";
import { FolderClient } from "../../clients/FolderClient";
import { FabricNotebookClient } from "../../clients/FabricNotebookClient";
import { FabricPlatformError } from "../../clients/FabricPlatformClient";
import bronzeExtractTemplate from "../../../notebooks/1_LineageWorkbench_Extract_Raw_Metadata.ipynb";
import silverNodeTemplate from "../../../notebooks/2_LineageWorkbench_Build_Node_View.ipynb";
import edgeExtractTemplate from "../../../notebooks/3_LineageWorkbench_BuildEdges.ipynb";
import mapDatasourcesTemplate from "../../../notebooks/4_LineageWorkbench_Map_M_Datasources.ipynb";
function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const useStyles = makeStyles({
  content: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  stepIcon: {
    fontSize: "48px",
    marginBottom: tokens.spacingVerticalM,
  },
  successIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },
  errorIcon: {
    color: tokens.colorPaletteRedForeground1,
  },
  centerContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalM,
  },
  notebookList: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  notebookItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  notebookName: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  deployedCount: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
});

export interface NotebookSetupResult {
  deployedNotebooks: string[];
  notebookIds: string[];
  pipelineId?: string;
  pipelineDisplayName?: string;
}

interface Props {
  workloadClient: WorkloadClientAPI;
  workspaceId: string;
  extractionWorkspaceIds?: string[];
  lakehouseId: string;
  lakehouseName: string;
  lakehouseWorkspaceId?: string;
  environmentId?: string;
  environmentName?: string;
  environmentWorkspaceId?: string;
  pipelineOnly?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (result: NotebookSetupResult) => void;
}

type SetupMode = "existing" | "new";
type WizardStep = "select-mode" | "select-notebooks" | "deploying" | "success" | "error";
type DeploymentOperation = "notebook" | "pipeline" | null;

type NotebookConfig = {
  name: string;
  description: string;
  fileName: string;
};

const NOTEBOOK_METADATA_BY_NAME: Record<string, Omit<NotebookConfig, "name">> = {
  "1_LineageWorkbench_Extract_Raw_Metadata": {
    description: "Bronze extraction notebook that captures raw lineage source metadata",
    fileName: "1_LineageWorkbench_Extract_Raw_Metadata.ipynb",
  },
  "2_LineageWorkbench_Build_Node_View": {
    description: "Silver notebook that builds stable node views and primary keys",
    fileName: "2_LineageWorkbench_Build_Node_View.ipynb",
  },
  "3_LineageWorkbench_BuildEdges": {
    description: "Edge notebook that extracts datasources and builds lineage edges",
    fileName: "3_LineageWorkbench_BuildEdges.ipynb",
  },
  "4_LineageWorkbench_Map_M_Datasources": {
    description: "Enrichment notebook that parses M queries and maps datasource references to existing Fabric nodes",
    fileName: "4_LineageWorkbench_Map_M_Datasources.ipynb",
  },
};

const AVAILABLE_NOTEBOOKS: NotebookConfig[] = FabricNotebookClient.EXTRACTION_NOTEBOOKS.reduce<NotebookConfig[]>(
  (configs, name) => {
    const metadata = NOTEBOOK_METADATA_BY_NAME[name];
    if (!metadata) {
      return configs;
    }

    configs.push({
      name,
      description: metadata.description,
      fileName: metadata.fileName,
    });

    return configs;
  },
  []
);

const NOTEBOOK_TEMPLATES: Record<string, string> = {
  "1_LineageWorkbench_Extract_Raw_Metadata.ipynb": bronzeExtractTemplate,
  "2_LineageWorkbench_Build_Node_View.ipynb": silverNodeTemplate,
  "3_LineageWorkbench_BuildEdges.ipynb": edgeExtractTemplate,
  "4_LineageWorkbench_Map_M_Datasources.ipynb": mapDatasourcesTemplate,
};

const DEFAULT_PIPELINE_NAME = "LineageWorkbench_Notebook_Orchestration";

async function loadNotebookTemplate(fileName: string): Promise<any> {
  const templateContent = NOTEBOOK_TEMPLATES[fileName];
  if (!templateContent) {
    throw new Error(`Notebook template is not bundled for ${fileName}`);
  }

  try {
    return JSON.parse(templateContent);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Notebook template ${fileName} is invalid JSON. ${reason}`);
  }
}

export const LineageNotebookSetupWizard: React.FC<Props> = ({
  workloadClient,
  workspaceId,
  extractionWorkspaceIds,
  lakehouseId,
  lakehouseName,
  lakehouseWorkspaceId,
  environmentId,
  environmentName,
  environmentWorkspaceId,
  pipelineOnly = false,
  isOpen,
  onClose,
  onComplete,
}) => {
  const styles = useStyles();
  const normalizedExtractionWorkspaceIds = (extractionWorkspaceIds || [])
    .map((id) => (id ?? "").trim())
    .filter((id) => Boolean(id));
  const extractedWorkspaces = normalizedExtractionWorkspaceIds.length > 0
    ? normalizedExtractionWorkspaceIds
    : [workspaceId];
  const resolvedLakehouseWorkspaceId = lakehouseWorkspaceId || workspaceId;
  const resolvedEnvironmentWorkspaceId = environmentWorkspaceId || workspaceId;

  const [currentStep, setCurrentStep] = useState<WizardStep>(pipelineOnly ? "select-notebooks" : "select-mode");
  const [setupMode, setSetupMode] = useState<SetupMode>(pipelineOnly ? "existing" : "new");
  const [selectedNotebooks, setSelectedNotebooks] = useState<Set<string>>(
    new Set(AVAILABLE_NOTEBOOKS.map((n) => n.name))
  );
  const [selectedExistingNotebooks, setSelectedExistingNotebooks] = useState<string[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);
  const [availableNotebooks, setAvailableNotebooks] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [deployedNotebooks, setDeployedNotebooks] = useState<string[]>([]);
  const [deployedIds, setDeployedIds] = useState<string[]>([]);
  const [createPipeline, setCreatePipeline] = useState(true);
  const [pipelineName, setPipelineName] = useState(DEFAULT_PIPELINE_NAME);
  const [createdPipelineId, setCreatedPipelineId] = useState<string | undefined>(undefined);
  const [createdPipelineDisplayName, setCreatedPipelineDisplayName] = useState<string | undefined>(undefined);
  const [currentlyDeploying, setCurrentlyDeploying] = useState<string | null>(null);
  const [currentOperation, setCurrentOperation] = useState<DeploymentOperation>(null);
  const [error, setError] = useState<string | null>(null);

  const createNotebookOrchestrationPipeline = async (
    itemClient: ItemClient,
    notebookIds: string[],
    notebookNames: string[]
  ): Promise<{ id: string; displayName: string } | undefined> => {
    if (!createPipeline || notebookIds.length === 0) {
      return undefined;
    }

    const displayName = pipelineName.trim() || DEFAULT_PIPELINE_NAME;
    const serializedTargetWorkspaces = extractedWorkspaces.join(",");
    const notebookExecutionParameters = {
      targetWorkspaces: {
        type: "string",
        value: serializedTargetWorkspaces,
      },
    };

    const activities = notebookIds.map((notebookId, index) => {
      const notebookName = notebookNames[index] || `Notebook_${index + 1}`;
      const activityName = `Run_${notebookName}`.replace(/[^a-zA-Z0-9_]/g, "_");
      const previousNotebookName = notebookNames[index - 1] || `Notebook_${index}`;
      const previousActivityName = `Run_${previousNotebookName}`.replace(/[^a-zA-Z0-9_]/g, "_");

      return {
        name: activityName,
        type: "TridentNotebook",
        dependsOn:
          index === 0
            ? []
            : [
                {
                  activity: previousActivityName,
                  dependencyConditions: ["Succeeded"],
                },
              ],
        policy: {
          retry: 3,
          retryIntervalInSeconds: 60,
        },
        typeProperties: {
          notebookId,
          workspaceId,
          parameters: notebookExecutionParameters,
        },
      };
    });

    const definitionJson = {
      name: displayName,
      properties: {
        activities,
      },
    };

    const definitionPart = {
      path: "pipeline-content.json",
      payload: encodeBase64Utf8(JSON.stringify(definitionJson)),
      payloadType: "InlineBase64" as const,
    };

    const upsertExistingPipeline = async () => {
      const pipelines = await itemClient.getItemsByType(workspaceId, "DataPipeline");
      const existing = pipelines.find(
        (item) => (item.displayName || "").trim().toLowerCase() === displayName.toLowerCase()
      );

      if (!existing) {
        return undefined;
      }

      await itemClient.updateItemDefinitionWithPolling(workspaceId, existing.id, {
        definition: {
          parts: [definitionPart],
        },
      });

      await itemClient.updateItem(workspaceId, existing.id, {
        description: `Lineage orchestration pipeline for notebook execution. Notebooks: ${notebookNames.join(", ")}.`,
      });

      return { id: existing.id, displayName: existing.displayName };
    };

    const existingPipeline = await upsertExistingPipeline();
    if (existingPipeline) {
      return existingPipeline;
    }

    let pipeline;
    try {
      pipeline = await itemClient.createItem(workspaceId, {
        displayName,
        type: "DataPipeline",
        description: `Lineage orchestration pipeline for notebook execution. Notebooks: ${notebookNames.join(", ")}.`,
        definition: {
          parts: [definitionPart],
        },
      });
    } catch (err) {
      // Some workspaces reject definition on create. Retry with bare create then update definition.
      if (err instanceof FabricPlatformError && err.statusCode === 400) {
        pipeline = await itemClient.createItem(workspaceId, {
          displayName,
          type: "DataPipeline",
          description: `Lineage orchestration pipeline for notebook execution. Notebooks: ${notebookNames.join(", ")}.`,
        });

        await itemClient.updateItemDefinitionWithPolling(workspaceId, pipeline.id, {
          definition: {
            parts: [definitionPart],
          },
        });
      } else if (err instanceof FabricPlatformError && err.statusCode === 409) {
        const conflictPipeline = await upsertExistingPipeline();
        if (conflictPipeline) {
          return conflictPipeline;
        }
        throw err;
      } else {
        throw err;
      }
    }

    return { id: pipeline.id, displayName: pipeline.displayName };
  };

  const applyNotebookBindings = (notebookJson: any) => {
    if (!notebookJson.metadata) {
      notebookJson.metadata = {};
    }
    if (!notebookJson.metadata.language_info) {
      notebookJson.metadata.language_info = { name: "python" };
    } else if (!notebookJson.metadata.language_info.name) {
      notebookJson.metadata.language_info.name = "python";
    }

    if (!notebookJson.metadata.dependencies) {
      notebookJson.metadata.dependencies = {};
    }

    notebookJson.metadata.dependencies.lakehouse = {
      default_lakehouse: lakehouseId,
      default_lakehouse_name: lakehouseName,
      default_lakehouse_workspace_id: resolvedLakehouseWorkspaceId,
      known_lakehouses: [{ id: lakehouseId }],
    };

    if (environmentId) {
      notebookJson.metadata.dependencies.environment = {
        environmentId,
        workspaceId: resolvedEnvironmentWorkspaceId,
      };
    } else {
      delete notebookJson.metadata.dependencies.environment;
    }
  };

  const buildNotebookMetadata = () => ({
    defaultLakehouse: {
      id: lakehouseId,
      name: lakehouseName,
      workspaceId: resolvedLakehouseWorkspaceId,
    },
    ...(environmentId && {
      environment: {
        id: environmentId,
        name: environmentName || "Environment",
        workspaceId: resolvedEnvironmentWorkspaceId,
      },
    }),
  });

  const validateHostingArtifacts = async (itemClient: ItemClient) => {
    try {
      await itemClient.getItem(resolvedLakehouseWorkspaceId, lakehouseId);
    } catch (err) {
      if (err instanceof FabricPlatformError) {
        throw new Error(
          `Selected lakehouse is not accessible (workspace: ${resolvedLakehouseWorkspaceId}, id: ${lakehouseId}). ` +
          `Fabric returned HTTP ${err.statusCode}: ${err.message}`
        );
      }
      throw err;
    }

    if (environmentId) {
      try {
        await itemClient.getItem(resolvedEnvironmentWorkspaceId, environmentId);
      } catch (err) {
        if (err instanceof FabricPlatformError) {
          throw new Error(
            `Selected Spark environment is not accessible (workspace: ${resolvedEnvironmentWorkspaceId}, id: ${environmentId}). ` +
            `Fabric returned HTTP ${err.statusCode}: ${err.message}`
          );
        }
        throw err;
      }
    }
  };

  const handleClose = () => {
    setCurrentStep(pipelineOnly ? "select-notebooks" : "select-mode");
    setSetupMode(pipelineOnly ? "existing" : "new");
    setSelectedNotebooks(new Set(AVAILABLE_NOTEBOOKS.map((n) => n.name)));
    setSelectedExistingNotebooks([]);
    setSelectedExistingIds([]);
    setAvailableNotebooks([]);
    setDeployedNotebooks([]);
    setDeployedIds([]);
    setCreatePipeline(pipelineOnly);
    setPipelineName(DEFAULT_PIPELINE_NAME);
    setCreatedPipelineId(undefined);
    setCreatedPipelineDisplayName(undefined);
    setCurrentlyDeploying(null);
    setCurrentOperation(null);
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Always reinitialize the wizard according to the mode that opened it.
    setSetupMode(pipelineOnly ? "existing" : "new");
    setCurrentStep(pipelineOnly ? "select-notebooks" : "select-mode");
    setCreatePipeline(pipelineOnly);
    setError(null);

    if (pipelineOnly && availableNotebooks.length === 0 && !loadingNotebooks) {
      void handleListExistingNotebooks();
    }
  }, [isOpen, pipelineOnly]);

  const toggleNotebook = (notebookName: string) => {
    const next = new Set(selectedNotebooks);
    if (next.has(notebookName)) {
      next.delete(notebookName);
    } else {
      next.add(notebookName);
    }
    setSelectedNotebooks(next);
  };

  const toggleExistingNotebook = (notebookId: string, notebookName: string) => {
    if (selectedExistingIds.includes(notebookId)) {
      setSelectedExistingIds(selectedExistingIds.filter(id => id !== notebookId));
      setSelectedExistingNotebooks(selectedExistingNotebooks.filter(name => name !== notebookName));
    } else {
      setSelectedExistingIds([...selectedExistingIds, notebookId]);
      setSelectedExistingNotebooks([...selectedExistingNotebooks, notebookName]);
    }
  };

  const handleModeNext = async () => {
    if (setupMode === "existing") {
      await handleListExistingNotebooks();
    } else {
      setCurrentStep("select-notebooks");
    }
  };

  const handleListExistingNotebooks = async () => {
    setLoadingNotebooks(true);
    setError(null);
    
    try {
      const itemClient = new ItemClient(workloadClient);
      const items = await itemClient.listItems(workspaceId, { type: "Notebook" });
      
      if (items.value && items.value.length > 0) {
        setAvailableNotebooks(items.value.map(item => ({ id: item.id, name: item.displayName })));
        setCurrentStep("select-notebooks");
      } else {
        setError("No notebooks found in this workspace. Please deploy new notebooks or create them manually in Fabric.");
        setCurrentStep("error");
      }
    } catch (err) {
      let errorMessage: string;
      if (err instanceof FabricPlatformError) {
        switch (err.statusCode) {
          case 403:
            errorMessage = `You don't have permission to list notebooks in workspace ${workspaceId}.`;
            break;
          case 404:
            errorMessage = `Workspace ${workspaceId} not found. Please ensure you have access.`;
            break;
          default:
            errorMessage = `Failed to list notebooks: ${err.message} (HTTP ${err.statusCode})`;
        }
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      setError(errorMessage);
      setCurrentStep("error");
    } finally {
      setLoadingNotebooks(false);
    }
  };

  const handleDeploy = async () => {
    if (selectedNotebooks.size === 0) {
      setError("Please select at least one notebook");
      return;
    }

    setCurrentStep("deploying");
    setError(null);

    const deployed: string[] = [];
    const ids: string[] = [];

    try {
      const itemClient = new ItemClient(workloadClient);
      const folderClient = new FolderClient(workloadClient);
      const notebooksFolder = await folderClient.createFolderHierarchy(workspaceId, ["Notebooks"]);
      await validateHostingArtifacts(itemClient);
      const existingNotebooks = await itemClient.listItems(workspaceId, { type: "Notebook" });
      const existingByName = new Map(
        (existingNotebooks.value || []).map((item) => [item.displayName.toLowerCase(), item])
      );

      for (const notebookConfig of AVAILABLE_NOTEBOOKS) {
        if (!selectedNotebooks.has(notebookConfig.name)) {
          continue;
        }

        setCurrentlyDeploying(notebookConfig.name);
        setCurrentOperation("notebook");

        // Load notebook template from packaged static assets.
        let notebookContent: string;
        let notebookJson: any;

        notebookJson = await loadNotebookTemplate(notebookConfig.fileName);

        applyNotebookBindings(notebookJson);

        notebookContent = JSON.stringify(notebookJson);

        const notebookMetadata = buildNotebookMetadata();

        const notebookDefinition = {
          format: "ipynb",
          parts: [
            {
              path: "notebook-content.ipynb",
              payload: encodeBase64Utf8(notebookContent),
              payloadType: "InlineBase64" as const,
            },
            {
              path: "notebookMetadata.json",
              payload: encodeBase64Utf8(JSON.stringify(notebookMetadata, null, 2)),
              payloadType: "InlineBase64" as const,
            },
          ],
        };

        // Overwrite existing notebook with the same name, otherwise create it.
        const existingNotebook = existingByName.get(notebookConfig.name.toLowerCase());

        if (existingNotebook) {
          await itemClient.updateItemDefinitionWithPolling(workspaceId, existingNotebook.id, {
            definition: notebookDefinition,
          });

          await itemClient.updateItem(workspaceId, existingNotebook.id, {
            description: notebookConfig.description,
          });

          if (existingNotebook.folderId !== notebooksFolder.id) {
            await itemClient.moveItem(workspaceId, existingNotebook.id, {
              targetFolderId: notebooksFolder.id,
            });
          }

          deployed.push(notebookConfig.name);
          ids.push(existingNotebook.id);
        } else {
          const notebook = await itemClient.createItem(workspaceId, {
            displayName: notebookConfig.name,
            type: "Notebook",
            description: notebookConfig.description,
            folderId: notebooksFolder.id,
            definition: notebookDefinition,
          });

          deployed.push(notebookConfig.name);
          ids.push(notebook.id);
        }
      }

      if (pipelineOnly && createPipeline) {
        setCurrentlyDeploying(pipelineName.trim() || DEFAULT_PIPELINE_NAME);
        setCurrentOperation("pipeline");
      }

      const createdPipeline = (pipelineOnly && createPipeline)
        ? await createNotebookOrchestrationPipeline(itemClient, ids, deployed)
        : undefined;
      setCreatedPipelineId(createdPipeline?.id);
      setCreatedPipelineDisplayName(createdPipeline?.displayName);

      setDeployedNotebooks(deployed);
      setDeployedIds(ids);
      setCurrentStep("success");
    } catch (err) {
      let errorMessage: string;
      
      if (err instanceof FabricPlatformError) {
        // Handle specific HTTP status codes with user-friendly messages
        switch (err.statusCode) {
          case 409:
            errorMessage = currentOperation === "pipeline"
              ? `Pipeline creation conflict for "${currentlyDeploying || pipelineName}". Please choose a different name or remove the existing pipeline.`
              : `Notebook overwrite failed for "${currentlyDeploying || "selected notebook"}". Please check your workspace permissions and try again.`;
            break;
          case 400:
            errorMessage = currentOperation === "pipeline"
              ? `Invalid pipeline configuration for "${currentlyDeploying || pipelineName}": ${err.message}. Verify Data Factory is enabled in the workspace and try a simpler pipeline name.`
              : `Invalid notebook configuration for "${currentlyDeploying || "selected notebook"}": ${err.message}`;
            break;
          case 403:
            errorMessage = `You don't have permission to create notebooks in this workspace. Please check your workspace access.`;
            break;
          case 404:
            errorMessage = `Workspace not found. Please ensure the workspace exists and you have access.`;
            break;
          case 429:
            errorMessage = `Too many requests. Please wait a moment and try again.`;
            break;
          case 500:
          case 502:
          case 503:
            errorMessage = `Fabric service error: ${err.message}. Please try again in a few moments.`;
            break;
          default:
            errorMessage = currentOperation === "pipeline"
              ? `Failed to create pipeline "${currentlyDeploying || pipelineName}": ${err.message} (HTTP ${err.statusCode})`
              : `Failed to create notebook "${currentlyDeploying || "selected notebook"}": ${err.message} (HTTP ${err.statusCode})`;
        }
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      
      setError(errorMessage);
      setCurrentStep("error");
    } finally {
      setCurrentlyDeploying(null);
      setCurrentOperation(null);
    }
  };

  const handleConfigureExistingNotebooks = async () => {
    if (selectedExistingIds.length === 0) {
      setError("Please select at least one notebook");
      return;
    }

    setCurrentStep("deploying");
    setError(null);

    const configuredNames: string[] = [];
    const configuredIds: string[] = [];

    try {
      const itemClient = new ItemClient(workloadClient);
      await validateHostingArtifacts(itemClient);

      for (const notebookId of selectedExistingIds) {
        const notebook = availableNotebooks.find((n) => n.id === notebookId);
        const notebookName = notebook?.name || notebookId;
        setCurrentlyDeploying(notebookName);
        setCurrentOperation("notebook");

        const definitionResponse = await itemClient.getItemDefinitionWithPolling(workspaceId, notebookId, "ipynb");
        const parts = definitionResponse.definition?.parts || [];

        const notebookContentPart = parts.find((part) => part.path.toLowerCase().endsWith(".ipynb"));
        if (!notebookContentPart) {
          throw new Error(`Notebook definition for "${notebookName}" does not contain an .ipynb part.`);
        }

        const notebookContentRaw =
          notebookContentPart.payloadType === "InlineBase64"
            ? decodeBase64Utf8(notebookContentPart.payload)
            : notebookContentPart.payload;

        const notebookJson = JSON.parse(notebookContentRaw);
        applyNotebookBindings(notebookJson);

        const notebookMetadata = buildNotebookMetadata();
        const preservedParts = parts.filter(
          (part) =>
            part.path !== notebookContentPart.path &&
            part.path !== "notebookMetadata.json"
        );

        await itemClient.updateItemDefinitionWithPolling(workspaceId, notebookId, {
          definition: {
            format: "ipynb",
            parts: [
              ...preservedParts,
              {
                path: notebookContentPart.path,
                payload: encodeBase64Utf8(JSON.stringify(notebookJson)),
                payloadType: "InlineBase64",
              },
              {
                path: "notebookMetadata.json",
                payload: encodeBase64Utf8(JSON.stringify(notebookMetadata, null, 2)),
                payloadType: "InlineBase64",
              },
            ],
          },
        });

        configuredNames.push(notebookName);
        configuredIds.push(notebookId);
      }

      setSelectedExistingNotebooks(configuredNames);
      setSelectedExistingIds(configuredIds);

      if (pipelineOnly && createPipeline) {
        setCurrentlyDeploying(pipelineName.trim() || DEFAULT_PIPELINE_NAME);
        setCurrentOperation("pipeline");
      }

      const createdPipeline = (pipelineOnly && createPipeline)
        ? await createNotebookOrchestrationPipeline(itemClient, configuredIds, configuredNames)
        : undefined;
      setCreatedPipelineId(createdPipeline?.id);
      setCreatedPipelineDisplayName(createdPipeline?.displayName);

      setCurrentStep("success");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to configure selected notebook metadata: ${errorMessage}`);
      setCurrentStep("error");
    } finally {
      setCurrentlyDeploying(null);
      setCurrentOperation(null);
    }
  };

  const handleCreateOrUpdatePipeline = async () => {
    if (selectedExistingIds.length === 0) {
      setError("Please select at least one notebook");
      return;
    }

    setCurrentStep("deploying");
    setError(null);

    try {
      const itemClient = new ItemClient(workloadClient);
      const selectedNames = availableNotebooks
        .filter((n) => selectedExistingIds.includes(n.id))
        .map((n) => n.name);

      setSelectedExistingNotebooks(selectedNames);
      setCurrentOperation("pipeline");
      setCurrentlyDeploying(pipelineName.trim() || DEFAULT_PIPELINE_NAME);

      const createdPipeline = await createNotebookOrchestrationPipeline(itemClient, selectedExistingIds, selectedNames);
      if (!createdPipeline) {
        throw new Error("Pipeline creation was not enabled.");
      }

      setCreatedPipelineId(createdPipeline.id);
      setCreatedPipelineDisplayName(createdPipeline.displayName);
      setCurrentStep("success");
    } catch (err) {
      let errorMessage: string;
      if (err instanceof FabricPlatformError) {
        errorMessage =
          err.statusCode === 400
            ? `Failed to create pipeline "${currentlyDeploying || pipelineName}": ${err.message} (HTTP 400). Verify Data Factory is enabled in the workspace and try a simpler pipeline name.`
            : `Failed to create pipeline "${currentlyDeploying || pipelineName}": ${err.message} (HTTP ${err.statusCode})`;
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      setError(errorMessage);
      setCurrentStep("error");
    } finally {
      setCurrentOperation(null);
      setCurrentlyDeploying(null);
    }
  };

  const handleFinish = () => {
    onComplete({
      deployedNotebooks: setupMode === "existing" ? selectedExistingNotebooks : deployedNotebooks,
      notebookIds: setupMode === "existing" ? selectedExistingIds : deployedIds,
      pipelineId: createdPipelineId,
      pipelineDisplayName: createdPipelineDisplayName,
    });
    handleClose();
  };

  const handleTryAgain = () => {
    setCurrentStep("select-mode");
    setError(null);
    setDeployedNotebooks([]);
    setDeployedIds([]);
    setCreatedPipelineId(undefined);
    setCreatedPipelineDisplayName(undefined);
    setCurrentOperation(null);
    setSelectedExistingNotebooks([]);
    setSelectedExistingIds([]);
  };

  const renderSelectMode = () => (
    <>
      <DialogTitle>Notebook Setup</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <Text size={400} weight="semibold">
            How would you like to set up notebooks for lineage extraction?
          </Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {pipelineOnly
              ? "Select existing notebooks and create an orchestration pipeline."
              : "In the next step you'll configure notebook deployment in the selected workspace."}
          </Text>
          <RadioGroup value={setupMode} onChange={(_, data) => setSetupMode(data.value as SetupMode)}>
            <Radio value="existing" label="Use existing notebooks" />
            <Text size={200} style={{ marginLeft: "28px", marginTop: "-8px", color: tokens.colorNeutralForeground3 }}>
              Select notebooks that are already deployed in this workspace
            </Text>
            <Radio value="new" label="Deploy new notebooks" style={{ marginTop: tokens.spacingVerticalM }} />
            <Text size={200} style={{ marginLeft: "28px", marginTop: "-8px", color: tokens.colorNeutralForeground3 }}>
              Upload extraction notebooks from the toolkit to this workspace
            </Text>
          </RadioGroup>
        </DialogContent>
      </DialogBody>
      <DialogActions>
        <Button appearance="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button appearance="primary" onClick={handleModeNext}>
          Next
        </Button>
      </DialogActions>
    </>
  );

  const renderSelectNotebooks = () => {
    if (setupMode === "existing") {
      return (
        <>
          <DialogTitle>{pipelineOnly ? "Create/Update Pipeline" : "Select Existing Notebooks"}</DialogTitle>
          <DialogBody className={styles.content}>
            <DialogContent>
              {loadingNotebooks ? (
                <div className={styles.centerContent}>
                  <Spinner size="extra-large" />
                  <Text size={400}>Loading notebooks from workspace...</Text>
                </div>
              ) : (
                <>
                  <Text>
                    {pipelineOnly
                      ? "Select existing notebooks to include in the orchestration pipeline."
                      : "Select the notebooks from your workspace to use for lineage extraction."}
                  </Text>

                  <div className={styles.notebookList}>
                    {availableNotebooks.map((notebook) => (
                      <div key={notebook.id} className={styles.notebookItem}>
                        <Checkbox
                          checked={selectedExistingIds.includes(notebook.id)}
                          onChange={() => toggleExistingNotebook(notebook.id, notebook.name)}
                        />
                        <div>
                          <Text className={styles.notebookName}>{notebook.name}</Text>
                        </div>
                      </div>
                    ))}
                  </div>

                  <MessageBar intent="info">
                    <MessageBarBody>
                      <Text weight="semibold">Workspace: </Text>
                      {workspaceId}
                    </MessageBarBody>
                  </MessageBar>

                  {pipelineOnly && (
                    <>
                      <Divider />

                      <Text size={300} weight="semibold">
                        Pipeline Orchestration
                      </Text>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        Create a Data Pipeline that references the selected notebooks for orchestrated runs.
                      </Text>
                      <Field label="Pipeline name">
                        <Input
                          value={pipelineName}
                          onChange={(_, data) => setPipelineName(data.value)}
                        />
                      </Field>
                    </>
                  )}
                </>
              )}
            </DialogContent>
          </DialogBody>
          <DialogActions>
            <Button appearance="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={pipelineOnly ? handleCreateOrUpdatePipeline : handleConfigureExistingNotebooks}
              disabled={selectedExistingIds.length === 0 || loadingNotebooks}
            >
              {pipelineOnly ? "Create/Update Pipeline" : "Configure & Select"}
            </Button>
          </DialogActions>
        </>
      );
    }
    
    // Deploy new mode
    return (
      <>
        <DialogTitle>Deploy Extraction Notebooks</DialogTitle>
        <DialogBody className={styles.content}>
          <DialogContent>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Deployment workspace:
            </Text>
            <Text>{workspaceId}</Text>

            <Text>
              Select the notebooks to deploy to workspace. Each notebook will be configured with the
              selected lakehouse as default and linked to the Spark environment.
            </Text>

            <div className={styles.notebookList}>
              {AVAILABLE_NOTEBOOKS.map((notebook) => (
                <div key={notebook.name} className={styles.notebookItem}>
                  <Checkbox
                    checked={selectedNotebooks.has(notebook.name)}
                    onChange={() => toggleNotebook(notebook.name)}
                  />
                  <div>
                    <Text className={styles.notebookName}>{notebook.name}</Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {notebook.description}
                    </Text>
                  </div>
                </div>
              ))}
            </div>

            <MessageBar intent="info">
              <MessageBarBody>
                <Text weight="semibold">Configuration:</Text>
                <ul style={{ marginTop: tokens.spacingVerticalS, marginLeft: tokens.spacingHorizontalL }}>
                  <li>Deployment Workspace: {workspaceId}</li>
                  <li>Default Lakehouse: {lakehouseName}</li>
                  {environmentName && <li>Spark Environment: {environmentName}</li>}
                </ul>
              </MessageBarBody>
            </MessageBar>
          </DialogContent>
        </DialogBody>
        <DialogActions>
          <Button appearance="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button appearance="primary" onClick={handleDeploy} disabled={selectedNotebooks.size === 0}>
            Deploy Notebooks
          </Button>
        </DialogActions>
      </>
    );
  };

  const renderDeploying = () => (
    <>
      <DialogTitle>{currentOperation === "pipeline" ? "Creating Pipeline" : "Deploying Notebooks"}</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <div className={styles.centerContent}>
            <Spinner size="extra-large" />
            {currentlyDeploying && (
              <>
                <Text size={400}>
                  {currentOperation === "pipeline"
                    ? `Creating pipeline "${currentlyDeploying}"...`
                    : `Deploying "${currentlyDeploying}"...`}
                </Text>
                <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                  {deployedNotebooks.length} of {selectedNotebooks.size} completed
                </Text>
              </>
            )}
          </div>
        </DialogContent>
      </DialogBody>
    </>
  );

  const renderSuccess = () => {
    const notebooks = setupMode === "existing" ? selectedExistingNotebooks : deployedNotebooks;
    const title = setupMode === "existing" ? "Notebooks Selected" : "Notebooks Deployed";
    const message = setupMode === "existing" 
      ? `Selected ${notebooks.length} existing notebook(s)`
      : `Successfully deployed ${notebooks.length} notebook(s)`;
    
    return (
      <>
        <DialogTitle>{title}</DialogTitle>
        <DialogBody className={styles.content}>
          <DialogContent>
            <div className={styles.centerContent}>
              <CheckmarkCircleRegular className={`${styles.stepIcon} ${styles.successIcon}`} />
              <Text size={400} weight="semibold">
                {message}
              </Text>
              <div style={{ marginTop: tokens.spacingVerticalM }}>
                {notebooks.map((name) => (
                  <Text key={name} size={300} style={{ color: tokens.colorNeutralForeground2 }}>
                    ✓ {name}
                  </Text>
                ))}
              </div>
              {createdPipelineDisplayName && (
                <MessageBar intent="success">
                  <MessageBarBody>
                    Orchestration pipeline created: <strong>{createdPipelineDisplayName}</strong>
                  </MessageBarBody>
                </MessageBar>
              )}
              {setupMode === "new" && (
                <MessageBar intent="success">
                  <MessageBarBody>
                    All notebooks are configured with {lakehouseName} as default lakehouse
                    {environmentName && ` and ${environmentName} environment`}.
                  </MessageBarBody>
                </MessageBar>
              )}
              {setupMode === "existing" && (
                <MessageBar intent="info">
                  <MessageBarBody>
                    Please ensure these notebooks are configured with the correct lakehouse and environment.
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
        </DialogBody>
        <DialogActions>
          <Button appearance="primary" onClick={handleFinish}>
            Finish
          </Button>
        </DialogActions>
      </>
    );
  };

  const renderError = () => (
    <>
      <DialogTitle>Deployment Error</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <div className={styles.centerContent}>
            <ErrorCircleRegular className={`${styles.stepIcon} ${styles.errorIcon}`} />
            <Text size={400} weight="semibold">
              Failed to deploy notebooks
            </Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
              {error}
            </Text>
            {deployedNotebooks.length > 0 && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  {deployedNotebooks.length} notebook(s) were deployed before the error occurred.
                </MessageBarBody>
              </MessageBar>
            )}
          </div>
        </DialogContent>
      </DialogBody>
      <DialogActions>
        <Button appearance="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button appearance="primary" onClick={handleTryAgain}>
          Try Again
        </Button>
      </DialogActions>
    </>
  );

  const renderStep = () => {
    if (pipelineOnly && currentStep === "select-mode") {
      return renderSelectNotebooks();
    }

    switch (currentStep) {
      case "select-mode":
        return renderSelectMode();
      case "select-notebooks":
        return renderSelectNotebooks();
      case "deploying":
        return renderDeploying();
      case "success":
        return renderSuccess();
      case "error":
        return renderError();
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_, data) => !data.open && handleClose()}>
      <DialogSurface style={{ maxWidth: "600px" }}>{renderStep()}</DialogSurface>
    </Dialog>
  );
};
