
**Manifest and registration touchpoints:**

- [`Workload/app/App.tsx`](../Workload/app/App.tsx) — route wiring
- [`Workload/Manifest/items/InsightWorkbenchItem/`](../Workload/Manifest/items/) — `.json` + `.xml`
- [`Workload/Manifest/Product.json`](../Workload/Manifest/Product.json)
- [`Workload/Manifest/assets/locales/en-US/translations.json`](../Workload/Manifest/assets/locales/en-US/translations.json)
- [`Workload/app/assets/locales/en-US/translation.json`](../Workload/app/assets/locales/en-US/translation.json)

**Backend aggregation candidates:**

- [`scripts/Setup/remote/`](../scripts/Setup/remote/)

---

## 🚦 Step-by-Step Delivery with ASAP Testing Gates

### Phase 0 — Session Bootstrap

**Goal:** Confirm environment and instructions before writing any code.

- [ ] Read all required instruction files (see table above)
- [ ] Confirm scope decisions are unchanged
- [ ] Select target phase and success gate for this session

> **Test gate:** Instruction checklist completed; scope decisions confirmed.

---

### Phase 1 — Skeleton and Registration

Create the item shell, view registration, ribbon basics, manifest registration, and route wiring.

> **Test gate:**
> - Item appears in the Fabric create flow
> - Item opens successfully
> - Save and Settings ribbon actions load and respond correctly

---

### Phase 2 — Metadata Explorer

Implement artifact listing, search, filter/group, and access summary (Req 1.1–1.5).

> **Test gate:**
> - Artifact list loads
> - Search and filters produce deterministic results
> - Group by type and by workspace both work
> - Access info renders for supported artifact types

---

### Phase 3 — Semantic Model Analyzer

Implement entity inventory and dependency mapping (Req 2.1–2.5).

> **Test gate:**
> - Tables, measures, columns, and relations all display
> - Dependency links are consistent between table and graph representations
> - Drill-down navigation opens entity detail view correctly

---

### Phase 4 — Lineage Graph

Implement cross-workspace lineage model, traversal, and report usage (Req 3.1–3.4).

> **Test gate:**
> - Upstream and downstream traversal works
> - Report usage links appear for semantic entities
> - Graph and tabular lineage are data-consistent

---

### Phase 5 — Requirements Board

Implement Kanban board with requirement card linking (Req 4.1–4.5).

> **Test gate:**
> - Create, update, and move requirement cards
> - Links to artifacts, entities, and lineage resolve correctly
> - Links remain stable after item reload

---

### Phase 6 — Hardening and Packaging

Validate build, manifest package, and deployment path.

> **Test gate:**
> - Build scripts complete without errors
> - Manifest package includes item entries
> - Dev run and deploy paths are repeatable

---

## 🏁 Definition of Done

- [ ] All five scope areas implemented to MVP level
- [ ] All phase test gates pass
- [ ] Item registration, localization, and routing complete
- [ ] No violation of repository AI/toolkit instructions
- [ ] Documentation updated: architecture doc and usage readme

---

## 🔄 Session Start Checklist

> Copy this at the start of every session.
[ ] Read instruction files — confirm no updates since last session
[ ] Confirm scope: single item / hybrid backend / graph+table / MCP dev-only
[ ] Select current phase and test gate
[ ] Implement only work required for that gate
[ ] Run test gate before moving to next phase
[ ] Record outcome in InsightWorkbench.ExecutionLog.md


---

## 📋 Change Control

Any scope expansion must be documented with:

| Field | Value |
|---|---|
| Requirement ID | New unique ID |
| Description | What is being added |
| Rationale | Why it is needed |
| Impacted phase | Which phase is affected |
| New test gate | How it will be verified |

> **Rule:** Do not silently add features outside defined requirements.