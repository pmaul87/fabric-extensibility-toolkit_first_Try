import React from "react";
import { ItemEditorDefaultView, useViewNavigation } from "../../components/ItemEditor";
import type { WorkloadClientAPI } from "@ms-fabric/workload-client";
import { Button } from "@fluentui/react-components";
import { RequirementBoardItemDefaultView, RequirementBoardItemDefinition } from "../RequirementBoardItem";
import "../RequirementBoardItem/RequirementBoardItem.scss";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LineageWorkbenchItemRequirementsViewProps {
  workloadClient: WorkloadClientAPI;
  lineage: any;
  onLineageChange: (next: any) => void;
  onSave?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LineageWorkbenchItemRequirementsView({
  workloadClient,
  lineage,
  onLineageChange,
  onSave,
}: LineageWorkbenchItemRequirementsViewProps) {
  const { setCurrentView } = useViewNavigation();

  const boardDefinition: RequirementBoardItemDefinition = {
    requirements: lineage?.requirements ?? [],
    linkedLineageViewerItemId: lineage?.linkedLineageViewerItemId,
  };

  const handleBoardChange = (next: RequirementBoardItemDefinition) => {
    const base = lineage ?? { direction: "both" as const, maxDepth: 4 };
    onLineageChange({
      ...base,
      requirements: next.requirements ?? [],
      linkedLineageViewerItemId: next.linkedLineageViewerItemId,
    });

    // Auto-save requirement updates so they persist across reloads.
    setTimeout(() => {
      if (onSave) {
        void onSave();
      }
    }, 100);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const centerContent = (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Button appearance="subtle" onClick={() => setCurrentView("home")}>
          Back to Home
        </Button>
      </div>
      <RequirementBoardItemDefaultView
        workloadClient={workloadClient}
        definition={boardDefinition}
        onDefinitionChange={handleBoardChange}
      />
    </div>
  );

  return <ItemEditorDefaultView center={{ content: centerContent }} />;
}