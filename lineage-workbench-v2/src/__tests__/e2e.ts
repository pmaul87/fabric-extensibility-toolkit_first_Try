import type { AddressInfo } from "net";
import { createApp } from "../app";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRun(baseUrl: string, runId: string, timeoutMs = 120000): Promise<"succeeded" | "failed" | "cancelled"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v2/lineage/extractions/${encodeURIComponent(runId)}`);
    assert(response.ok, `Status endpoint failed for run ${runId}: ${response.status}`);
    const json = (await response.json()) as { status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" };
    if (json.status === "succeeded" || json.status === "failed" || json.status === "cancelled") {
      return json.status;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for run ${runId}`);
}

async function testStagedInputTables(baseUrl: string): Promise<void> {
  const stageRes = await fetch(`${baseUrl}/api/v2/lineage/input-tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputTables: {
        t_fabric_artifacts: [
          { id: "sm_test_1", type: "SemanticModel", display_name: "Model Test", workspace_id: "ws-test" },
          { id: "report_test_1", type: "Report", display_name: "Report Test", workspace_id: "ws-test" },
        ],
        t_dataset_tables: [
          { table_pk: "Sales-sm_test_1", name: "Sales", dataset_id: "sm_test_1", workspace_id: "ws-test" },
        ],
        t_dataset_columns: [
          { column_pk: "Sales-Amount-sm_test_1", table_name: "Sales", column_name: "Amount", dataset_id: "sm_test_1", workspace_id: "ws-test" },
        ],
        t_dataset_measures: [
          { measure_pk: "Sales-Total Sales-sm_test_1", table_name: "Sales", measure_name: "Total Sales", dataset_id: "sm_test_1", workspace_id: "ws-test" },
        ],
        t_dataset_dependencies: [
          {
            dependency_pk: "dep_test_1",
            object_type: "measure",
            table_name: "Sales",
            object_name: "Total Sales",
            referenced_object_type: "column",
            referenced_table: "Sales",
            referenced_object: "Amount",
            dataset_id: "sm_test_1",
            workspace_id: "ws-test",
            parent_node: "Total Sales",
          },
        ],
        t_report_metadata: [
          { report_id: "report_test_1", report_name: "Report Test", dataset_id: "sm_test_1", workspace_id: "ws-test" },
        ],
        t_report_pages: [
          { page_pk: "Overview-report_test_1", report_id: "report_test_1", page_name: "Overview", page_display_name: "Overview", dataset_id: "sm_test_1", workspace_id: "ws-test" },
        ],
        t_report_visuals: [
          {
            visual_pk: "VisualContainer1-Overview-report_test_1",
            report_id: "report_test_1",
            page_name: "Overview",
            visual_name: "VisualContainer1",
            title: "Sales Chart",
            display_type: "clusteredColumnChart",
            dataset_id: "sm_test_1",
            workspace_id: "ws-test",
          },
        ],
        t_report_semantic_objects: [
          {
            semantic_object_pk: "so_test_1",
            report_id: "report_test_1",
            visual_fk: "VisualContainer1-Overview-report_test_1",
            object_type: "measure",
            table_name: "Sales",
            object_name: "Total Sales",
            report_source: "uses_measure",
            workspace_id: "ws-test",
          },
        ],
      },
    }),
  });

  assert(stageRes.status === 201, `Staging endpoint returned ${stageRes.status}`);
  const stageJson = (await stageRes.json()) as { inputTableSetId?: string };
  assert(stageJson.inputTableSetId, "Staging endpoint did not return inputTableSetId");

  const extractionRes = await fetch(`${baseUrl}/api/v2/lineage/extractions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceIds: ["ws-test"],
      artifactTypes: ["report", "semantic_model", "table", "column", "measure"],
      options: {
        inputTableSetId: stageJson.inputTableSetId,
        graphScope: "focused",
        graphNodeLimit: 500,
      },
    }),
  });

  assert(extractionRes.status === 202, `Extraction endpoint returned ${extractionRes.status}`);
  const extractionJson = (await extractionRes.json()) as { runId?: string };
  assert(extractionJson.runId, "Extraction did not return runId");

  const finalStatus = await waitForRun(baseUrl, extractionJson.runId);
  assert(finalStatus === "succeeded", `Expected staged run to succeed, got ${finalStatus}`);

  const resultRes = await fetch(`${baseUrl}/api/v2/lineage/extractions/${encodeURIComponent(extractionJson.runId)}/result`);
  assert(resultRes.status === 200, `Result endpoint returned ${resultRes.status}`);
  const resultJson = (await resultRes.json()) as { graphSnapshot?: { nodes?: unknown[]; edges?: unknown[] } };

  const nodes = resultJson.graphSnapshot?.nodes || [];
  const edges = resultJson.graphSnapshot?.edges || [];
  assert(nodes.length > 0, "Expected staged pipeline result to have nodes");
  assert(edges.length > 0, "Expected staged pipeline result to have edges");
}

async function testNoFallbackWithoutInputs(baseUrl: string): Promise<void> {
  const extractionRes = await fetch(`${baseUrl}/api/v2/lineage/extractions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceIds: ["ws-native"],
      artifactTypes: ["report", "semantic_model"],
      options: {
        graphScope: "focused",
        graphNodeLimit: 500,
      },
    }),
  });
  assert(extractionRes.status === 400, `Expected no-input extraction to return 400, got ${extractionRes.status}`);
  const extractionJson = (await extractionRes.json()) as { error?: string };
  assert(extractionJson.error === "v2_input_required", `Expected v2_input_required, got ${extractionJson.error || "<none>"}`);
}

async function main(): Promise<void> {
  process.env.SNAPSHOT_STORE_PROVIDER = process.env.SNAPSHOT_STORE_PROVIDER || "file";

  const app = createApp();
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    console.log("[e2e] Running staged input table extraction test...");
    await testStagedInputTables(baseUrl);
    console.log("[e2e] Staged input table extraction test passed.");

    console.log("[e2e] Running no-fallback extraction validation test...");
    await testNoFallbackWithoutInputs(baseUrl);
    console.log("[e2e] No-fallback extraction validation test passed.");

    console.log("[e2e] All end-to-end tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error("[e2e] Test run failed:", error);
  process.exitCode = 1;
});
