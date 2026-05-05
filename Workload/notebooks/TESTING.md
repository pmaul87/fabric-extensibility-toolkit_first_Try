# Testing Guide for Lineage Extraction Notebooks

## 🎯 Overview

This guide shows how to test extraction notebooks **manually** in Fabric before implementing automated orchestration.

## 📋 Prerequisites

- ✅ Fabric workspace (Premium capacity)
- ✅ Lakehouse created
- ✅ Contributor+ role in workspace
- ✅ Viewer+ permissions on artifacts

## 🚀 Quick Start: 6-Step Testing

### Step 0: Create Fabric Environment (5 minutes)

**One-time setup for all notebooks**:

1. **Create Environment**:
   - Go to Fabric workspace
   - Click **+ New** → **Environment**
   - Name: `LineageExtractionEnv`

2. **Add Required Packages**:
   ```
   semantic-link >= 0.7.0
   semantic-link-labs >= 0.9.0
   requests >= 2.31.0
   pandas >= 2.0.0
   ```
   - Click **Public libraries** tab
   - For each package: Click **Add from PyPI** → Enter name and version → **Save**

3. **Publish Environment**:
   - Click **Publish** (top right)
   - Wait for publishing to complete (~3-5 minutes)
   - Status will show **Published** when ready

4. **Verify Packages**:
   - Open published environment
   - **Libraries** tab → Confirm all 4 packages listed

**Why Environment?**
- ✅ Install once, use everywhere (no `%pip install` in notebooks)
- ✅ Faster notebook execution (packages pre-loaded)
- ✅ Production-ready (consistent versions across team)

### Step 1: Upload Notebooks

1. Open your Fabric workspace
2. Go to **Data Engineering** experience
3. Click **Import** → **Notebook**
4. Upload all `.ipynb` files from `Workload/notebooks/`

### Step 2: Attach Environment & Lakehouse

For each notebook:

1. **Attach Environment**:
   - Open notebook
   - Top toolbar → **Environment** dropdown
   - Select `LineageExtractionEnv`
   - Wait for attachment (~30 seconds)

2. **Attach Lakehouse**:
   - Left panel → **Add lakehouse**
   - Select **Existing lakehouse** → Choose target lakehouse
   - Click **Add**

**Order matters**: Attach environment first, then lakehouse.

### Step 3: Test Setup (1 minute)

**Notebook**: `00_setup.ipynb`

1. Update cell 8 (Configuration):
   ```python
   WORKSPACE_IDS = ["your-actual-workspace-guid"]
   LAKEHOUSE_ID = "your-actual-lakehouse-guid"
   ```

2. Run all cells (1-9)

3. Verify cell 1 output:
   ```
   ✅ All packages loaded from Fabric Environment
      semantic-link version: 0.x.x
   ```

4. Verify cell 9 output:
   ```
   ✅ Configuration saved successfully
   ✅ Setup complete - ready for extraction!
   ```

5. **Run test cells (11-15)** to validate:
   - Cell 11: Token acquisition ✅
   - Cell 12: Lakehouse write/read ✅
   - Cell 13: Fabric API access ✅
   - Cell 14: semantic-link functions ✅

**Expected Time**: 30-60 seconds (no installation needed)

### Step 4: Test Semantic Model Extraction (2 minutes)

**Notebook**: `01_extract_semantic_models.ipynb`

1. Get a Semantic Model ID:
   - Open any Semantic Model in workspace
   - Settings → **Copy object ID**

2. Update test cell 11:
   ```python
   TEST_WORKSPACE_ID = "your-workspace-id"
   TEST_MODEL_ID = "your-semantic-model-id"
   ```

3. Run cell 11

4. **Expected output**:
   ```
   ✅ SUCCESS!
      Measures: 45
      Columns: 120
      Relationships: 15
      Functions: 3
      Duration: 12.34s
   
   📊 Sample Measures:
      1. Total Sales
      2. Average Price
      3. YoY Growth
   ```

5. Verify file created:
   ```
   /lakehouse/default/Files/lineage/raw/semantic_models/{model-id}.json
   ```

**Expected Time**: 10-30 seconds per model

### Step 5: Test Report Extraction (2 minutes)

**Notebook**: `02_extract_reports.ipynb`

1. Get a Report ID:
   - Open any Report in workspace
   - File → Settings → **Copy object ID**

2. Update test cell 11:
   ```python
   TEST_WORKSPACE_ID = "your-workspace-id"
   TEST_REPORT_ID = "your-report-id"
   ```

3. Run cell 11

4. **Expected output**:
   ```
   ✅ SUCCESS!
      Report: Sales Dashboard
      Dataset: abc-123-def
      Pages: 3
      Visuals: 12
      Duration: 3.45s
   
   📄 Pages:
      1. Overview (1280x720)
      2. Details (1280x720)
      3. Trends (1280x720)
   ```

5. Verify file created:
   ```
   /lakehouse/default/Files/lineage/raw/reports/{report-id}.json
   ```

**Expected Time**: 2-5 seconds per report

## ✅ Validation Checklist

After testing, verify:

- [ ] `00_setup.ipynb` all test cells pass
- [ ] Semantic model extraction returns data
- [ ] Report extraction returns data
- [ ] Lakehouse files created successfully
- [ ] JSON files contain expected structure
- [ ] No authentication errors

## 📁 Expected Lakehouse Structure

After successful testing:

```
/lakehouse/default/Files/lineage/
├── raw/
│   ├── semantic_models/
│   │   └── {model-id}.json      ← Extracted model metadata
│   └── reports/
│       └── {report-id}.json     ← Extracted report metadata
└── test/
    ├── semantic_model_{id}.json ← Test extraction results
    └── report_{id}.json
```

## 🔍 Verifying Extraction Quality

### Semantic Model Data Quality

Check `semantic_models/{model-id}.json`:

```json
{
  "artifactId": "model-id",
  "artifactType": "SemanticModel",
  "workspaceId": "workspace-id",
  "timestamp": "2026-04-29T...",
  "data": {
    "measures": [
      {
        "Measure Name": "Total Sales",
        "Measure Expression": "SUM('Sales'[Amount])",
        "Format String": "Currency",
        "Table Name": "Sales"
      }
    ],
    "columns": [
      {
        "Column Name": "CustomerName",
        "Data Type": "String",
        "Table Name": "Customers"
      }
    ],
    "relationships": [...],
    "functions": [...],
    "counts": {
      "measures": 45,
      "columns": 120,
      "relationships": 15,
      "functions": 3
    }
  },
  "metadata": {
    "extractionDuration": 12.34,
    "status": "success"
  }
}
```

### Report Data Quality

Check `reports/{report-id}.json`:

```json
{
  "artifactId": "report-id",
  "artifactType": "Report",
  "data": {
    "reportInfo": {
      "name": "Sales Dashboard",
      "datasetId": "semantic-model-id"
    },
    "pages": [
      {"name": "Overview", "displayName": "Overview", "width": 1280, "height": 720}
    ],
    "visuals": [
      {"page": "Overview", "visualType": "card", "title": "Total Sales"}
    ],
    "counts": {
      "pages": 3,
      "visuals": 12
    }
  }
}
```

## 🐛 Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'sempy'"

**Cause**: Fabric Environment not attached or not published

**Solutions**:
1. **Verify environment is published**:
   - Open `LineageExtractionEnv` in workspace
   - Check status shows **Published** (not Draft)
   - If Draft: Click **Publish** and wait

2. **Attach environment to notebook**:
   - Top toolbar → **Environment** dropdown
   - Select `LineageExtractionEnv`
   - Wait for green checkmark (~30 seconds)

3. **Verify packages in environment**:
   - Open environment → **Libraries** tab
   - Confirm all 4 packages listed (semantic-link, semantic-link-labs, requests, pandas)

### Issue: "Package version mismatch"

**Solution**:
- Open environment → **Public libraries** tab
- Update package versions:
  - `semantic-link >= 0.7.0`
  - `semantic-link-labs >= 0.9.0`
- **Publish** environment again
- Re-attach to notebook

### Issue: "401 Unauthorized"

**Solutions**:
- Verify workspace permissions (Contributor required)
- Check artifact permissions (Viewer required)
- Ensure correct workspace/artifact IDs

### Issue: "Lakehouse not found"

**Solution**:
- Attach lakehouse to notebook (left panel → Add lakehouse)
- Verify lakehouse exists in workspace

### Issue: "Empty measures/columns"

**Possible Causes**:
- Incorrect model ID
- Model has no measures (unlikely)
- semantic-link version incompatibility

**Solution**:
```python
# Verify model ID
from sempy_labs import list_measures
measures_df = list_measures(dataset="model-id", workspace="workspace-id")
print(f"Found {len(measures_df)} measures")
```

### Issue: "Report definition not accessible"

**Note**: Some reports don't expose definition API (expected)

**What's Still Captured**:
- Report name, description
- Dataset linkage
- Basic metadata

### Issue: "Slow Performance"

**Expected Times**:
- Small model (<50 measures): 5-10s
- Medium model (50-500 measures): 10-30s
- Large model (>500 measures): 30-60s

**If Slower**:
- Check Spark cluster status
- Verify lakehouse performance
- Consider extracting fewer workspaces

## 📊 Performance Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Setup notebook | 30-60s | Environment loads automatically |
| Single model (small) | 5-10s | <50 measures |
| Single model (medium) | 10-30s | 50-500 measures |
| Single model (large) | 30-60s | 500+ measures |
| Single report | 2-5s | Basic extraction |
| Full workspace (10 artifacts) | 2-5min | Depends on size |

**Performance Improvement with Environment**:
- ✅ ~3-5 minutes faster per notebook (no pip install)
- ✅ More consistent execution times
- ✅ Better for scheduled/automated runs

## 🎓 Understanding the Results

### Semantic Model Extraction

**What You Get**:
- All DAX measures with full expressions
- All columns with data types and formats
- All relationships between tables
- All calculated columns and functions

**Why It Matters**:
- **Measures** → Identify business logic and calculations
- **Columns** → Understand data structure and types
- **Relationships** → Build table-level lineage
- **Functions** → Capture complex transformations

### Report Extraction

**What You Get**:
- Report structure (pages, dimensions)
- Visual inventory (types, positions)
- Dataset linkages (which model feeds the report)
- Data source connections

**Why It Matters**:
- **Pages** → Understand report organization
- **Visuals** → Identify what's displayed to users
- **Dataset linkage** → Connect reports to semantic models
- **Usage patterns** → See which models are most used

## 🔄 Full Workspace Extraction

Once single-artifact testing succeeds:

### Semantic Models (Full Extraction)

1. Update cell 4 in `01_extract_semantic_models.ipynb`:
   ```python
   WORKSPACE_IDS = ["workspace-1", "workspace-2", "workspace-3"]
   ```

2. Run cells 4-8 (skip test cells)

3. Wait for completion (2-10 minutes depending on workspace size)

4. Check cell 10 for summary

### Reports (Full Extraction)

1. Update cell 4 in `02_extract_reports.ipynb`:
   ```python
   WORKSPACE_IDS = ["workspace-1", "workspace-2"]
   ```

2. Run cells 4-8

3. Check cell 10 for summary

4. Run cell 13 to see dataset linkages

## ✨ Success Criteria

You're ready to proceed if:

1. ✅ All test cells pass in `00_setup.ipynb`
2. ✅ Single model extraction returns measures/columns
3. ✅ Single report extraction returns pages/visuals
4. ✅ Lakehouse files created with valid JSON
5. ✅ No persistent authentication errors
6. ✅ Performance within expected ranges

## 📝 Next Steps After Testing

Once manual testing succeeds:

1. **Phase 1 (Current)**:
   - ✅ Test remaining extraction notebooks (notebooks, lakehouses, etc.)
   - ✅ Run full workspace extractions
   - ✅ Validate data quality

2. **Phase 2 (Next)**:
   - Implement Spark Livy client (TypeScript)
   - Build configuration UI (custom item)
   - Add automated notebook triggering
   - Implement progress monitoring

## 📚 Additional Resources

- [Fabric Notebooks Guide](https://learn.microsoft.com/fabric/data-engineering/how-to-use-notebook)
- [semantic-link-labs API Reference](https://learn.microsoft.com/python/api/semantic-link-labs/)
- [Fabric REST API Documentation](https://learn.microsoft.com/rest/api/fabric/)
- [OneLake Storage Guide](https://learn.microsoft.com/fabric/onelake/)

---

**Questions?** Check troubleshooting section or open an issue in the repository.
