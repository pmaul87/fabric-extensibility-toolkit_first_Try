# Metadata Explorer Architecture - Backend Integration

## Overview

The Metadata Explorer has been refactored to separate concerns between frontend and backend, with focus on preparation for future database persistence.

### Architecture Diagram

```
Frontend (React/TypeScript)
├── MetadataExplorerView.tsx
│   └── MetadataExplorerContent (thin UI layer)
│       └── MetadataExplorerClient (HTTP client)
│           └── Backend API
│
Backend (Express/Node.js)
├── devServer/api/metadata.api.js (REST endpoints)
│   └── MetadataService
│       └── FabricPlatformAPIClient (orchestration)
│
Shared Types (TypeScript)
└── services/MetadataService.ts
    ├── ExplorerArtifact (domain model)
    ├── ApiCallTrace (debugging)
    └── PersistenceSchema (database-ready)
```

## Components

### 1. Shared Types (`Workload/app/services/MetadataService.ts`)

**Purpose**: Single source of truth for metadata domain model

**Key Exports**:
- `ExplorerArtifact` - Core data model (works with frontend and backend)
- `ApiCallTrace` - Debug tracing with timestamp and severity
- `LoadArtifactsResponse` - Standardized API response
- `PersistenceSchema` - Namespace defining database structures
- `compareArtifactsBy()` - Pure sorting function (reusable)
- `formatApiError()` - Error formatting utility

**Persistence-Ready Design**:
```typescript
// When ready for DB, these directly map to storage:
PersistenceSchema.ArtifactRecord {
  id, displayName, type, workspaceId, workspaceName,
  description, accessLevel,
  discoveredAt, lastSyncAt, discoveryCount
}

PersistenceSchema.SyncLog {
  id, syncStartedAt, syncCompletedAt, 
  artifactCount, hasErrors, errorMessage
}
```

### 2. Frontend API Client (`Workload/app/clients/MetadataExplorerClient.ts`)

**Purpose**: Thin HTTP client for backend communication

**Public Methods**:
```typescript
async loadArtifacts(request?: LoadArtifactsRequest): Promise<LoadArtifactsResponse>
// GET /api/metadata/artifacts
// Returns all discoverable artifacts with optional trace

async refreshArtifacts(): Promise<LoadArtifactsResponse>
// POST /api/metadata/artifacts/refresh
// Force refresh from Fabric platform (bypass cache)

async getSyncStatus(): Promise<{lastSyncAt, isStale, artifactCount}>
// GET /api/metadata/status
// Get cache/sync status for UI optimization
```

**Usage**:
```typescript
const client = new MetadataExplorerClient();
const response = await client.loadArtifacts({ includeTrace: true });
console.log(response.artifacts); // ExplorerArtifact[]
console.log(response.trace);     // ApiCallTrace[]
```

### 3. Backend Metadata Service (`Workload/devServer/services/MetadataService.js`)

**Purpose**: Orchestrate Fabric API calls for artifact discovery

**Key Logic**:
1. Discover user workspace roles (Viewer → Contributor → Member → Admin precedence)
2. Fetch all accessible workspaces
3. Fetch items from each workspace (resilient to per-workspace failures)
4. Convert to ExplorerArtifact format
5. Return trace and sync metadata for debugging

**Design Patterns**:
- **Resilience**: Per-workspace failures don't crash entire load
- **Tracing**: Every API call logged with timestamp and severity
- **Sorting**: Results deterministically sorted by workspace → type → name
- **Error Handling**: Detailed error messages in trace entries

### 4. Backend API Routes (`Workload/devServer/api/metadata.api.js`)

**Endpoints**:

#### `GET /api/metadata/artifacts`
Query Parameters:
- `includeTrace: boolean` (default: true)
- `maxArtifacts: number` (default: 0 = no limit)

Response:
```json
{
  "artifacts": [
    {
      "id": "...",
      "displayName": "...",
      "type": "SemanticModel",
      "workspaceId": "...",
      "workspaceName": "...",
      "accessLevel": "Member",
      "discoveredAt": "2026-04-01T..."
    }
  ],
  "totalCount": 42,
  "trace": [
    {
      "id": "timestamp-0",
      "text": "Step 1: Discovering user workspace roles",
      "timestamp": "2026-04-01T...",
      "severity": "info"
    }
  ],
  "syncStartedAt": "2026-04-01T...",
  "syncCompletedAt": "2026-04-01T...",
  "hasErrors": false
}
```

#### `POST /api/metadata/artifacts/refresh`
Force refresh, bypass any caching
Response: Same as GET

#### `GET /api/metadata/status`
```json
{
  "lastSyncAt": "2026-04-01T..." | null,
  "isStale": false,
  "artifactCount": 42,
  "isInitialized": true,
  "staleThresholdMs": 300000
}
```

#### `GET /api/metadata/health`
Simple health check for monitoring

### 5. Frontend View (`Workload/app/items/InsightWorkbenchItem/views/MetadataExplorer/MetadataExplorerView.tsx`)

**Responsibilities** (simplified):
- Create MetadataExplorerClient instance
- Call `loadArtifacts()` on mount
- Display loading/error/success states
- Filter/search/sort artifacts (client-side)
- Group artifacts
- Display access summary
- Show API trace for debugging

**Key Simplifications**:
- ❌ No direct Fabric API calls (all via backend)
- ❌ No FabricPlatformAPIClient creation
- ❌ No workspace role discovery logic
- ❌ No error resilience (backend handles)
- ✅ Pure presentation layer
- ✅ Reusable client logic
- ✅ Clear separation of concerns

## Data Flow

### Load Artifacts Flow

```
User opens MetadataExplorer
    ↓
MetadataExplorerView mounts
    ↓
loadArtifacts() called
    ↓
MetadataExplorerClient.loadArtifacts()
    ↓
HTTP GET /api/metadata/artifacts
    ↓
Backend MetadataService
    1. getWorkspaceRoleMap()
       - For each role (Viewer → Admin)
         - Query workspaces with that role
         - Track highest role per workspace
    ↓
    2. getAllWorkspaces()
       - Get all accessible workspaces
    ↓
    3. For each workspace: getWorkspaceItems()
       - Load items (skip if workspace fails)
    ↓
    4. Convert Items → ExplorerArtifact
       - Attach workspace name and user's role
    ↓
    5. Sort deterministically
    ↓
    6. Return {artifacts, trace, metadata}
    ↓
Frontend receives response
    ↓
setArtifacts() + setApiCallTrace()
    ↓
UI renders artifacts with trace panel
```

## Integration with Dev Server

The metadata API is automatically registered when the dev server starts.

### webpack.dev.js Configuration

The `setupMiddlewares` function now:
1. Registers metadata router from `devServer/api/metadata.api.js`
2. Mounts at `/api/metadata/*`
3. Ready to initialize once FabricPlatformAPIClient is available

### Initialization (Future)

When full backend integration is implemented:

```javascript
// In webpack.dev.js setupMiddlewares:
const fabricClient = FabricPlatformAPIClient.create(/* auth token */);
initializeMetadataApi(fabricClient);
```

## Database Persistence Preparation

The architecture is ready for database integration:

### Phase 1 (Current)
- ✅ Backend orchestration logic centralized
- ✅ Domain model defined (`PersistenceSchema`)
- ✅ API trace database-ready (timestamps, severity)

### Phase 2 (Next)
- Add database layer to backend service
- Implement artifact caching/sync table
- Add sync log tracking

```typescript
// Future database schema:
artifacts {
  id: string (PK)
  displayName, type, workspaceId, workspaceName, accessLevel
  discoveredAt: timestamp
  lastSyncAt: timestamp
  discoveryCount: number
}

sync_logs {
  id: string (PK)
  syncStartedAt, syncCompletedAt
  artifactCount, hasErrors
  errorMessage?: string
  trace: jsonb
}

user_interactions {
  id: string (PK)
  userId: string
  artifactId: string
  interactionType: 'view' | 'open' | 'search' | 'filter'
  interactionAt: timestamp
}
```

### Phase 3 (Later)
- Add repository pattern for data access
- Implement artifact search indexing
- Add recommendation engine (based on user interactions)

## Development Notes

### Key File Changes

| File | Change | Impact |
|------|--------|--------|
| `MetadataService.ts` | **NEW** - Shared types | Both frontend and backend use
| `MetadataExplorerClient.ts` | **NEW** - HTTP client | Frontend calls to backend
| `metadata.api.js` | **NEW** - REST endpoints | Backend exposes API
| `MetadataService.js` | **NEW** - Backend service | Orchestrates Fabric APIs
| `devServer/index.js` | **MODIFIED** - Register metadata API | Routes configured
| `MetadataExplorerView.tsx` | **REFACTORED** - ~450→180 LOC | Removed ~270 lines of backend logic

### Removed Frontend Logic

These moved to backend:
- `getWorkspaceRoleMap()` - Role discovery
- `toExplorerArtifact()` - Item conversion
- `formatApiError()` - Now in shared service
- `ROLE_PRECEDENCE` constant
- Direct FabricPlatformAPIClient usage

### Testing Strategy

```typescript
// Unit test MetadataService backend logic
async function test_MetadataService_loadArtifacts() {
  const mockClient = createMockFabricClient();
  const service = new MetadataService(mockClient);
  
  const result = await service.loadArtifacts();
  
  assert(result.artifacts.length > 0);
  assert(result.trace.length > 0);
}

// Integration test: Frontend → Backend → Fabric
async function test_MetadataExplorer_Integration() {
  const response = await client.loadArtifacts({ includeTrace: true });
  
  assert(response.artifacts.length > 0);
  assert(response.trace.length > 0);
  assert(response.hasErrors === false);
}
```

## Next Steps

1. **Integrate with DevGateway**: Pass authenticated FabricPlatformAPIClient to `initializeMetadataApi()`
2. **Test in Local Dev**: Start dev server and load Metadata Explorer in UI
3. **Add Database Layer**: Replace in-memory sync tracking with database persistence
4. **Performance Optimization**: Implement artifact caching and smart sync intervals
5. **Enhanced Debugging**: Add backend logs to UI trace panel

## Performance Considerations

- **Frontend**: O(n) client-side filtering/sorting (acceptable for <1000 artifacts)
- **Backend**: O(w·r) where w=workspaces, r=roles (parallel requests reduce latency)
- **Caching**: Ready to add HTTP cache headers once DB persistence added
- **Pagination**: API supports `maxArtifacts` parameter for future pagination

---

**Architecture Date**: 2026-04-01
**Author**: GitHub Copilot
**Status**: Design review ready
