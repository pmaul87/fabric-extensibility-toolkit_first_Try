# Fabric Lineage Manager - Notebooks

Jupyter notebooks for extracting lineage metadata from Fabric artifacts using **semantic-link** and **semantic-link-labs** (Microsoft official libraries).

## Overview

Notebooks use Fabric Environment for consistent package management across all extractions. No pip installation required - packages are pre-loaded from environment.

## Prerequisites

- ✅ Fabric workspace (Premium capacity)
- ✅ Lakehouse for storing extraction results
- ✅ Fabric Environment with required packages (see Environment Setup below)
- ✅ Contributor+ permissions in workspace

## Environment Setup

**One-Time Configuration**:

1. Create Fabric Environment: `LineageExtractionEnv`
2. Add packages via **Public libraries** tab:
   - `semantic-link >= 0.7.0`
   - `semantic-link-labs >= 0.9.0`
   - `requests >= 2.31.0`
   - `pandas >= 2.0.0`
3. Publish environment
4. Attach to each notebook via Environment dropdown

**Benefits**:
- ✅ Install once, use everywhere
- ✅ Faster notebook execution (~3-5min saved per run)
- ✅ Production-ready package management
- ✅ Consistent versions across team

## Notebook Structure

### Setup
- `00_setup.ipynb` - Verify environment, configure helper functions, test connections

### Extraction Notebooks (Phase 1)
- `extraction/01_extract_semantic_models.ipynb` ✅ - Extract Semantic Model metadata using semantic-link-labs
- `extraction/02_extract_reports.ipynb` ✅ - Extract Report metadata (visuals, pages, data sources)
- `extraction/03_extract_notebooks.ipynb` - Extract Notebook metadata (input/output sources)
- `extraction/04_extract_lakehouses.ipynb` - Extract Lakehouse schemas and tables
- `extraction/05_extract_warehouses.ipynb` - Extract Warehouse tables and views
- `extraction/06_extract_pipelines.ipynb` - Extract Pipeline activities and data flows
- `extraction/07_extract_dataflows.ipynb` - Extract Dataflow sources and transformations

### Processing Notebooks (Phase 2)
- `processing/build_lineage_graph.ipynb` - Build lineage graph from extracted metadata

## Usage

### Quick Start (Phase 1 Complete)
1. Create & publish Fabric Environment (see Environment Setup above)
2. Upload notebooks to Fabric workspace
3. Attach environment to each notebook
4. Attach lakehouse for result storage
5. Run setup notebook to verify configuration
6. Run extraction notebooks for each artifact type
7. Results saved to: `/lakehouse/default/Files/lineage/raw/{artifact_type}/{artifact_id}.json`

### Testing
See [TESTING.md](TESTING.md) for detailed 6-step testing workflow with validation checklist.

## Semantic Link Integration

### Environment Package Versions
```
semantic-link >= 0.7.0
semantic-link-labs >= 0.9.0
```

### Key Functions
- `list_functions()` - List all measures/calculated columns
- `list_measures()` - Get all DAX measures with expressions
- `list_columns()` - Get all columns with data types
- `list_relationships()` - Get relationships between tables
- `list_tables()` - Get table metadata

### Reference
- semantic-link: https://pypi.org/project/semantic-link/
- semantic-link-labs: https://pypi.org/project/semantic-link-labs/

## Development Status

### ✅ Phase 1 Complete
- [x] OneLakeLineageStorage (TypeScript wrapper for lakehouse)
- [x] Setup notebook with environment verification
- [x] Semantic Model extraction using semantic-link-labs
- [x] Report extraction with visual parsing
- [x] Comprehensive testing guide (TESTING.md)
- [x] Fabric Environment integration

### 🚧 Phase 2 In Progress
- [ ] SemanticLinkClient - Livy API notebook trigger
- [ ] ExtractionOrchestrator - lightweight notebook orchestration
- [ ] Configuration UI in LineageExtractorItemDefaultView
- [ ] Extraction progress tracking UI
- [ ] End-to-end orchestration testing

### 📋 Future Phases
- [ ] Notebook metadata extraction
- [ ] Lakehouse schema discovery
- [ ] Warehouse metadata extraction
- [ ] Pipeline JSON parsing
- [ ] Dataflow extraction
- [ ] Lineage graph builder

## Development Workflow

1. **Develop notebooks locally** in VS Code
2. **Test manually** in Fabric workspace (see TESTING.md)
3. **Implement orchestration** via Spark Livy API from custom item
4. **Monitor progress** and retrieve results from lakehouse
5. **Build visualization** of lineage graph (Phase 3)
