import React from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  Field,
  Input,
  Checkbox,
  Divider,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { ItemEditorDefaultView } from "../../components/ItemEditor";
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
  extraction: LineageWorkbenchExtractionConfig;
  onExtractionChange: (next: LineageWorkbenchExtractionConfig) => void;
}

export function LineageWorkbenchItemExtractionView(props: LineageWorkbenchItemExtractionViewProps) {
  const { extraction, onExtractionChange } = props;
  const { t } = useTranslation();
  const styles = useStyles();

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

  const centerContent = (
    <div className={styles.root}>
      <MessageBar intent="info">
        <MessageBarBody>
          {t("LineageWorkbench_Extraction_PhaseNote",
            "Extraction configuration is scaffolded. Actual extraction logic runs through the Fabric API in a future phase.")}
        </MessageBarBody>
      </MessageBar>

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
    </div>
  );

  return (
    <ItemEditorDefaultView center={{ content: centerContent }} />
  );
}
