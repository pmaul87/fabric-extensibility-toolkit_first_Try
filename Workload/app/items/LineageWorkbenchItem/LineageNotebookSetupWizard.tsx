import React, { useState } from "react";
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
  makeStyles,
  tokens,
  Checkbox,
  Radio,
  RadioGroup,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { ItemClient } from "../../clients/ItemClient";
import { FabricPlatformError } from "../../clients/FabricPlatformClient";

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
}

interface Props {
  workloadClient: WorkloadClientAPI;
  workspaceId: string;
  lakehouseId: string;
  lakehouseName: string;
  environmentId?: string;
  environmentName?: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (result: NotebookSetupResult) => void;
}

type SetupMode = "existing" | "new";
type WizardStep = "select-mode" | "select-notebooks" | "deploying" | "success" | "error";

const AVAILABLE_NOTEBOOKS = [
  {
    name: "Extract_Datasets_and_Reports",
    description: "Extracts semantic models, reports, and relationships from Fabric workspaces",
    fileName: "Extract_Datasets_and_Reports.ipynb",
  },
  {
    name: "Extract_Datasources_from_SemanticModels",
    description: "Parses M queries to extract datasource connections from semantic models",
    fileName: "Extract_Datasources_from_SemanticModels.ipynb",
  },
];

export const LineageNotebookSetupWizard: React.FC<Props> = ({
  workloadClient,
  workspaceId,
  lakehouseId,
  lakehouseName,
  environmentId,
  environmentName,
  isOpen,
  onClose,
  onComplete,
}) => {
  const styles = useStyles();

  const [currentStep, setCurrentStep] = useState<WizardStep>("select-mode");
  const [setupMode, setSetupMode] = useState<SetupMode>("new");
  const [selectedNotebooks, setSelectedNotebooks] = useState<Set<string>>(
    new Set(AVAILABLE_NOTEBOOKS.map((n) => n.name))
  );
  const [selectedExistingNotebooks, setSelectedExistingNotebooks] = useState<string[]>([]);
  const [selectedExistingIds, setSelectedExistingIds] = useState<string[]>([]);
  const [availableNotebooks, setAvailableNotebooks] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [deployedNotebooks, setDeployedNotebooks] = useState<string[]>([]);
  const [deployedIds, setDeployedIds] = useState<string[]>([]);
  const [currentlyDeploying, setCurrentlyDeploying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setCurrentStep("select-mode");
    setSetupMode("new");
    setSelectedNotebooks(new Set(AVAILABLE_NOTEBOOKS.map((n) => n.name)));
    setSelectedExistingNotebooks([]);
    setSelectedExistingIds([]);
    setAvailableNotebooks([]);
    setDeployedNotebooks([]);
    setDeployedIds([]);
    setCurrentlyDeploying(null);
    setError(null);
    onClose();
  };

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
            errorMessage = "You don't have permission to list notebooks in this workspace.";
            break;
          case 404:
            errorMessage = "Workspace not found. Please ensure you have access.";
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

      for (const notebookConfig of AVAILABLE_NOTEBOOKS) {
        if (!selectedNotebooks.has(notebookConfig.name)) {
          continue;
        }

        setCurrentlyDeploying(notebookConfig.name);

        // Read the notebook file from the workspace
        const notebookPath = `/Workload/notebooks/${notebookConfig.fileName}`;
        let notebookContent: string;
        let notebookJson: any;

        try {
          const response = await fetch(notebookPath);
          if (!response.ok) {
            throw new Error(`Failed to load notebook: ${notebookConfig.fileName}`);
          }
          const fileContent = await response.text();
          notebookJson = JSON.parse(fileContent);
          
          // Ensure notebook has required metadata with language_info
          if (!notebookJson.metadata) {
            notebookJson.metadata = {};
          }
          if (!notebookJson.metadata.language_info) {
            notebookJson.metadata.language_info = { name: "python" };
          } else if (!notebookJson.metadata.language_info.name) {
            notebookJson.metadata.language_info.name = "python";
          }
          
          notebookContent = JSON.stringify(notebookJson);
        } catch (err) {
          console.warn(`Could not load notebook file ${notebookPath}, using placeholder`);
          notebookJson = {
            cells: [
              {
                cell_type: "markdown",
                source: [`# ${notebookConfig.name}`, "", notebookConfig.description],
              },
            ],
            metadata: {
              language_info: {
                name: "python"
              }
            },
            nbformat: 4,
            nbformat_minor: 5,
          };
          notebookContent = JSON.stringify(notebookJson);
        }

        // Create notebook metadata with lakehouse and environment
        const notebookMetadata = {
          defaultLakehouse: {
            id: lakehouseId,
            name: lakehouseName,
            workspaceId: workspaceId,
          },
          ...(environmentId && {
            environment: {
              id: environmentId,
              name: environmentName || "Environment",
              workspaceId: workspaceId,
            },
          }),
        };

        // Create the notebook with definition
        const notebook = await itemClient.createItem(workspaceId, {
          displayName: notebookConfig.name,
          type: "Notebook",
          description: notebookConfig.description,
          definition: {
            format: "ipynb",
            parts: [
              {
                path: "notebook-content.py",
                payload: btoa(notebookContent),
                payloadType: "InlineBase64",
              },
              {
                path: "notebookMetadata.json",
                payload: btoa(JSON.stringify(notebookMetadata, null, 2)),
                payloadType: "InlineBase64",
              },
            ],
          },
        });

        deployed.push(notebookConfig.name);
        ids.push(notebook.id);
      }

      setDeployedNotebooks(deployed);
      setDeployedIds(ids);
      setCurrentStep("success");
    } catch (err) {
      let errorMessage: string;
      
      if (err instanceof FabricPlatformError) {
        // Handle specific HTTP status codes with user-friendly messages
        switch (err.statusCode) {
          case 409:
            errorMessage = `A notebook named "${currentlyDeploying}" already exists in this workspace. Please delete the existing notebook or choose a different workspace.`;
            break;
          case 400:
            errorMessage = `Invalid notebook configuration for "${currentlyDeploying}": ${err.message}`;
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
            errorMessage = `Failed to create notebook "${currentlyDeploying}": ${err.message} (HTTP ${err.statusCode})`;
        }
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      
      setError(errorMessage);
      setCurrentStep("error");
    } finally {
      setCurrentlyDeploying(null);
    }
  };

  const handleFinish = () => {
    onComplete({
      deployedNotebooks: setupMode === "existing" ? selectedExistingNotebooks : deployedNotebooks,
      notebookIds: setupMode === "existing" ? selectedExistingIds : deployedIds,
    });
    handleClose();
  };

  const handleTryAgain = () => {
    setCurrentStep("select-mode");
    setError(null);
    setDeployedNotebooks([]);
    setDeployedIds([]);
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
          <DialogTitle>Select Existing Notebooks</DialogTitle>
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
                    Select the notebooks from your workspace to use for lineage extraction.
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
              onClick={() => setCurrentStep("success")} 
              disabled={selectedExistingIds.length === 0 || loadingNotebooks}
            >
              Select Notebooks
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
      <DialogTitle>Deploying Notebooks</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <div className={styles.centerContent}>
            <Spinner size="extra-large" />
            {currentlyDeploying && (
              <>
                <Text size={400}>Deploying "{currentlyDeploying}"...</Text>
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
