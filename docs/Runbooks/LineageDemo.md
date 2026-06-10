# Lineage Demo Runbook

This runbook prepares the Fabric Lineage Manager for a demo-friendly walkthrough.

## Goals
- Start the workload with a single command.
- Verify the graph renders meaningful lineage and does not collapse on isolated nodes.
- Keep the demo flow stable and repeatable.

## Recommended Start Sequence
1. Open a terminal at the repository root.
2. Run `pwsh .\scripts\Run\StartDemo.ps1`.
3. Wait for the DevGateway and DevServer windows to finish starting.
4. Open the workload in Fabric.
5. Load the Lineage workbench and select a representative node.

## Demo Checklist
- Confirm the table and graph panels load without errors.
- Confirm the graph shows node type and parent metadata inline.
- Confirm selecting a node with no lineage connections still shows a safe warning state.
- Confirm the filtered and focused views do not show stray orphan semantic-model nodes.
- Confirm the demo can be repeated without reconfiguring the environment.

## Smoke Check
Run the fixture-based lineage smoke test before a demo:

```powershell
cd Workload
npm run smoke:lineage
```

This validates the demo fixtures for:
- connected lineage graphs
- isolated focus nodes
- empty-edge warning states

## Troubleshooting
- If the DevServer port is already in use, stop the existing Node process or adjust `DEVSERVER_PORT`.
- If the DevGateway fails to start, verify the Fabric developer environment is configured.
- If the graph is empty, run extraction again and confirm the lakehouse ID is configured in the Extract view.
