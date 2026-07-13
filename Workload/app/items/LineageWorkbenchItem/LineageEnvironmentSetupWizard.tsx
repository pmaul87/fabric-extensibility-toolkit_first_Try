import React, { useState } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Field,
  Input,
  Radio,
  RadioGroup,
  Text,
  Textarea,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { callDatahubOpen } from "../../controller/DataHubController";
import { ItemClient } from "../../clients/ItemClient";
import { FabricPlatformError } from "../../clients/FabricPlatformClient";

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildEnvironmentYaml(environmentName: string): string {
  return [
    `name: ${environmentName}`,
    "channels:",
    "  - defaults",
    "dependencies:",
    "  - python=3.11",
    "  - pip:",
    "      - semantic-link-labs==0.15.2",
    "      - semantic-link==0.14.1",
    "",
  ].join("\n");
}
import { useTranslation } from "react-i18next";

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
  libraryList: {
    marginTop: tokens.spacingVerticalS,
    marginLeft: tokens.spacingHorizontalL,
  },
  libraryItem: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  publishBox: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    width: "100%",
    padding: tokens.spacingVerticalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  instructionList: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  ymlBox: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  ymlHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
});

export interface EnvironmentSetupResult {
  environmentId: string;
  environmentDisplayName: string;
  environmentWorkspaceId: string;
  isNew: boolean;
}

interface Props {
  workloadClient: WorkloadClientAPI;
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (result: EnvironmentSetupResult) => void;
}

type SetupMode = "existing" | "new";
type WizardStep = "select-mode" | "creating" | "success" | "error";

export const LineageEnvironmentSetupWizard: React.FC<Props> = ({
  workloadClient,
  workspaceId,
  isOpen,
  onClose,
  onComplete,
}) => {
  const styles = useStyles();
  const { t } = useTranslation();
  const defaultEnvironmentName = "LineageWorkbench_Env";

  const [currentStep, setCurrentStep] = useState<WizardStep>("select-mode");
  const [setupMode, setSetupMode] = useState<SetupMode>("existing");
  const [newEnvironmentName, setNewEnvironmentName] = useState<string>(defaultEnvironmentName);
  const [selectedEnvironment, setSelectedEnvironment] = useState<EnvironmentSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleClose = () => {
    // Reset state
    setCurrentStep("select-mode");
    setSetupMode("existing");
    setNewEnvironmentName(defaultEnvironmentName);
    setSelectedEnvironment(null);
    setError(null);
    setCopyFeedback(null);
    onClose();
  };

  const handleSelectExisting = async () => {
    try {
      const result = await callDatahubOpen(
        workloadClient,
        ["Environment"],
        t("LineageEnvironment_SelectEnvironment", "Select a Spark Environment for lineage extraction"),
        false
      );

      if (result) {
        setSelectedEnvironment({
          environmentId: result.id,
          environmentDisplayName: result.displayName,
          environmentWorkspaceId: result.workspaceId || workspaceId,
          isNew: false,
        });
        setCurrentStep("success");
      }
    } catch (err) {
      let errorMessage: string;
      if (err instanceof FabricPlatformError) {
        switch (err.statusCode) {
          case 403:
            errorMessage = "You don't have permission to access environments in this workspace.";
            break;
          case 404:
            errorMessage = "Workspace not found. Please ensure you have access.";
            break;
          default:
            errorMessage = `Failed to select environment: ${err.message} (HTTP ${err.statusCode})`;
        }
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      setError(errorMessage);
      setCurrentStep("error");
    }
  };

  const handleCreateNew = async () => {
    if (!newEnvironmentName.trim()) {
      setError("Please enter an environment name");
      return;
    }

    setCurrentStep("creating");
    setError(null);

    try {
      const itemClient = new ItemClient(workloadClient);
      const environmentDefinition = {
        parts: [
          {
            path: "environment.yml",
            payload: encodeBase64Utf8(buildEnvironmentYaml(newEnvironmentName.trim())),
            payloadType: "InlineBase64" as const,
          },
        ],
      };

      // Create the environment shell first, then publish the definition so the libraries are installed.
      const environment = await itemClient.createItem(workspaceId, {
        displayName: newEnvironmentName.trim(),
        type: "Environment",
        description: "Spark environment for lineage extraction with semantic-link libraries",
      });

      await itemClient.updateItemDefinitionWithPolling(workspaceId, environment.id, {
        definition: environmentDefinition,
      });

      setSelectedEnvironment({
        environmentId: environment.id,
        environmentDisplayName: environment.displayName,
        environmentWorkspaceId: workspaceId,
        isNew: true,
      });
      setCurrentStep("success");
    } catch (err) {
      let errorMessage: string;
      if (err instanceof FabricPlatformError) {
        switch (err.statusCode) {
          case 409:
            errorMessage = `An environment named "${newEnvironmentName.trim()}" already exists in this workspace. Please choose a different name.`;
            break;
          case 400:
            errorMessage = `Invalid environment configuration: ${err.message}`;
            break;
          case 403:
            errorMessage = "You don't have permission to create environments in this workspace.";
            break;
          case 404:
            errorMessage = "Workspace not found. Please ensure you have access.";
            break;
          default:
            errorMessage = `Failed to create environment: ${err.message} (HTTP ${err.statusCode})`;
        }
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
      }
      setError(errorMessage);
      setCurrentStep("error");
    }
  };

  const handleFinish = () => {
    if (selectedEnvironment) {
      onComplete(selectedEnvironment);
      handleClose();
    }
  };

  const handleTryAgain = () => {
    setCurrentStep("select-mode");
    setError(null);
  };

  const getPublishYaml = () => buildEnvironmentYaml(selectedEnvironment?.environmentDisplayName || newEnvironmentName.trim());

  const handleCopyYaml = async () => {
    try {
      await navigator.clipboard.writeText(getPublishYaml());
      setCopyFeedback("Copied YML to clipboard");
      window.setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed. Select the text and copy manually.");
    }
  };

  const renderSelectMode = () => (
    <>
      <DialogTitle>Setup Spark Environment</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <Text>
            The extraction notebooks require a Spark environment with semantic-link libraries
            installed. Choose an existing environment or create a new one.
          </Text>

          <RadioGroup value={setupMode} onChange={(_, data) => setSetupMode(data.value as SetupMode)}>
            <Radio value="existing" label="Use existing environment" />
            <Radio value="new" label="Create new environment" />
          </RadioGroup>

          {setupMode === "new" && (
            <>
              <Field label="Environment name">
                <Input
                  value={newEnvironmentName}
                  onChange={(_, data) => setNewEnvironmentName(data.value)}
                  placeholder="Enter environment name"
                />
              </Field>

              <MessageBar intent="info">
                <MessageBarBody>
                  <Text weight="semibold">Libraries to be installed:</Text>
                  <ul className={styles.libraryList}>
                    <li className={styles.libraryItem}>semantic-link</li>
                    <li className={styles.libraryItem}>semantic-link-labs</li>
                  </ul>
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
          onClick={setupMode === "existing" ? handleSelectExisting : handleCreateNew}
        >
          {setupMode === "existing" ? "Select Environment" : "Create Environment"}
        </Button>
      </DialogActions>
    </>
  );

  const renderCreating = () => (
    <>
      <DialogTitle>Creating Environment</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <div className={styles.centerContent}>
            <Spinner size="extra-large" />
            <Text size={400}>Creating environment "{newEnvironmentName}"...</Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
              Installing semantic-link libraries
            </Text>
          </div>
        </DialogContent>
      </DialogBody>
    </>
  );

  const renderSuccess = () => (
    <>
      <DialogTitle>Environment Ready</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <div className={styles.centerContent}>
            <CheckmarkCircleRegular className={`${styles.stepIcon} ${styles.successIcon}`} />
            <Text size={400} weight="semibold">
              {selectedEnvironment?.environmentDisplayName}
            </Text>
            <Text size={300}>
              {selectedEnvironment?.isNew
                ? "Environment created. Publish the YML below so Fabric installs the libraries."
                : "Environment selected"}
            </Text>
          </div>

          {selectedEnvironment?.isNew && (
            <div className={styles.publishBox}>
              <Text weight="semibold">Publish steps</Text>
              <ol className={styles.instructionList}>
                <li>Open the environment.</li>
                <li>Go to External repositories.</li>
                <li>Open the YML editor.</li>
                <li>Paste the YML below.</li>
                <li>Click Save.</li>
                <li>Click Publish.</li>
              </ol>

              <div>
                <div className={styles.ymlHeader}>
                  <Text weight="semibold">YML</Text>
                  <Button size="small" appearance="subtle" onClick={handleCopyYaml}>
                    Copy YML
                  </Button>
                </div>
                {copyFeedback && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {copyFeedback}
                  </Text>
                )}
                <Textarea
                  className={styles.ymlBox}
                  value={getPublishYaml()}
                  readOnly
                  resize="vertical"
                  rows={8}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </DialogBody>
      <DialogActions>
        <Button appearance="primary" onClick={handleFinish}>
          Finish
        </Button>
      </DialogActions>
    </>
  );

  const renderError = () => (
    <>
      <DialogTitle>Error</DialogTitle>
      <DialogBody className={styles.content}>
        <DialogContent>
          <div className={styles.centerContent}>
            <ErrorCircleRegular className={`${styles.stepIcon} ${styles.errorIcon}`} />
            <Text size={400} weight="semibold">
              Failed to setup environment
            </Text>
            <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>
              {error}
            </Text>
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
      case "creating":
        return renderCreating();
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
      <DialogSurface>{renderStep()}</DialogSurface>
    </Dialog>
  );
};
