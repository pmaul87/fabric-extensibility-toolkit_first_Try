param(
    [string]$WorkspaceId = "a559a09d-159b-43f9-a5f7-f908bc5a77bb",
    [string]$NotebooksPath = "$PSScriptRoot/../../Workload/notebooks",
    [string]$RootFolderName = "Notebooks"
)

# Get auth token
$token = (az account get-access-token --resource "https://api.fabric.microsoft.com" --query accessToken -o tsv)

if (-not $token) {
    Write-Error "Failed to get auth token. Make sure you're logged in with 'az login'"
    exit 1
}

$headers = @{ 
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

# Cache for folders we've already created/found
$folderCache = @{}

function Wait-FabricOperation {
    param(
        [string]$OperationId,
        [int]$MaxAttempts = 60
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $statusResponse = Invoke-RestMethod `
            -Uri "https://api.fabric.microsoft.com/v1/operations/$OperationId" `
            -Method GET `
            -Headers $headers

        $status = $statusResponse.status
        if ($status -eq "Succeeded") {
            return
        }

        if ($status -eq "Failed") {
            $errorJson = $statusResponse.error | ConvertTo-Json -Depth 10 -Compress
            throw "Operation failed ($OperationId): $errorJson"
        }

        Start-Sleep -Seconds 2
    }

    throw "Operation timed out after $MaxAttempts attempts: $OperationId"
}

function Update-NotebookDefinition {
    param(
        [string]$NotebookId,
        [string]$DisplayName,
        [string]$NotebookFilePath
    )

    $fileContent = Get-Content -Path $NotebookFilePath -Raw -Encoding UTF8
    $contentBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($fileContent))

    $platformJson = @{
        '$schema' = 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json'
        metadata = @{
            type = 'Notebook'
            displayName = $DisplayName
        }
        config = @{
            version = '2.0'
            logicalId = '00000000-0000-0000-0000-000000000000'
        }
    } | ConvertTo-Json -Depth 10 -Compress
    $platformBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($platformJson))

    $definitionBody = @{
        definition = @{
            format = 'ipynb'
            parts = @(
                @{
                    path = 'notebook-content.ipynb'
                    payload = $contentBase64
                    payloadType = 'InlineBase64'
                },
                @{
                    path = '.platform'
                    payload = $platformBase64
                    payloadType = 'InlineBase64'
                }
            )
        }
    } | ConvertTo-Json -Depth 20

    $response = Invoke-WebRequest `
        -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items/$NotebookId/updateDefinition" `
        -Method POST `
        -Headers $headers `
        -Body $definitionBody `
        -ErrorAction Stop

    if ($response.StatusCode -eq 202) {
        $operationId = $response.Headers['x-ms-operation-id']
        if (-not $operationId) {
            throw "updateDefinition returned 202 without x-ms-operation-id for notebook '$DisplayName'"
        }

        Wait-FabricOperation -OperationId $operationId
    }
}

function Get-OrCreateFolder {
    param(
        [string]$FolderPath,
        [string]$ParentFolderId = $null
    )

    # Check cache first
    if ($folderCache.ContainsKey($FolderPath)) {
        return $folderCache[$FolderPath]
    }

    # Parse folder path into parts
    $parts = $FolderPath -split '[\\/]' | Where-Object { $_ }
    
    $currentParentId = $ParentFolderId
    $currentPath = ""

    foreach ($part in $parts) {
        $currentPath += "/$part"
        
        # Check if already cached
        if ($folderCache.ContainsKey($currentPath)) {
            $currentParentId = $folderCache[$currentPath]
            continue
        }

        Write-Host "🔍 Looking for folder: $part"

        # Query for existing folder
        $queryUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/folders?recursive=false"
        if ($currentParentId) {
            $queryUrl += "&rootFolderId=$currentParentId"
        }

        $existingFolder = $null
        try {
            $itemsResponse = Invoke-RestMethod `
                -Uri $queryUrl `
                -Method GET `
                -Headers $headers -ErrorAction SilentlyContinue
            
            $existingFolder = $itemsResponse.value | Where-Object {
                $_.displayName -eq $part
            } | Select-Object -First 1
        } catch {
            # Ignore errors
        }

        if ($existingFolder) {
            Write-Host "✅ Found folder: $part"
            $currentParentId = $existingFolder.id
        } else {
            Write-Host "📁 Creating folder: $part"
            
            $folderBody = @{ displayName = $part }
            if ($currentParentId) {
                $folderBody["parentFolderId"] = $currentParentId
            }

            try {
                $response = Invoke-RestMethod `
                    -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/folders" `
                    -Method POST `
                    -Headers $headers `
                    -Body ($folderBody | ConvertTo-Json)

                Write-Host "✅ Created folder: $part (ID: $($response.id))"
                $currentParentId = $response.id
            } catch {
                Write-Error "❌ Failed to create folder: $($_.Exception.Message)"
                return $null
            }
        }

        # Cache this folder
        $folderCache[$currentPath] = $currentParentId
    }

    return $currentParentId
}

function Upload-Notebook {
    param(
        [string]$NotebookFilePath,
        [string]$DisplayName,
        [string]$ParentFolderId = $null
    )

    if (-not (Test-Path $NotebookFilePath)) {
        Write-Warning "⚠️  Notebook file not found: $NotebookFilePath"
        return
    }

    Write-Host ""
    Write-Host "🔄 Processing notebook: $DisplayName"

    # Check if notebook already exists
    $existingNotebook = $null
    try {
        # Notebook display names are unique at workspace scope, so search globally.
        $queryUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items?type=Notebook"

        $itemsResponse = Invoke-RestMethod `
            -Uri $queryUrl `
            -Method GET `
            -Headers $headers -ErrorAction SilentlyContinue
        
        $existingNotebook = $itemsResponse.value | Where-Object {
            $_.displayName -eq $DisplayName
        } | Select-Object -First 1
    } catch {
        # Ignore errors
    }

    $notebookId = $null

    if ($existingNotebook) {
        $notebookId = $existingNotebook.id

        # Notebook already exists. Keep it and move it when folder is different.
        if ($ParentFolderId -and $existingNotebook.folderId -ne $ParentFolderId) {
            Write-Host "📦 Notebook exists in a different folder. Moving to target folder..."
            try {
                Invoke-RestMethod `
                    -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items/$($existingNotebook.id)/move" `
                    -Method POST `
                    -Headers $headers `
                    -Body (@{ targetFolderId = $ParentFolderId } | ConvertTo-Json) | Out-Null

                Write-Host "✅ Moved notebook: $DisplayName"
            } catch {
                Write-Error "❌ Failed to move notebook: $($_.Exception.Message)"
            }
        } elseif (-not $ParentFolderId -and $existingNotebook.folderId) {
            Write-Host "📦 Notebook exists in a folder. Moving to workspace root..."
            try {
                Invoke-RestMethod `
                    -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items/$($existingNotebook.id)/move" `
                    -Method POST `
                    -Headers $headers `
                    -Body (@{} | ConvertTo-Json) | Out-Null

                Write-Host "✅ Moved notebook to root: $DisplayName"
            } catch {
                Write-Error "❌ Failed to move notebook to root: $($_.Exception.Message)"
            }
        } else {
            Write-Host "✅ Notebook already exists in target location: $DisplayName"
        }
    } else {
        # Create notebook when missing
        Write-Host "📤 Creating notebook..."

        $notebookBody = @{
            displayName = $DisplayName
            type = "Notebook"
        }
        if ($ParentFolderId) {
            $notebookBody["folderId"] = $ParentFolderId
        }

        try {
            $response = Invoke-RestMethod `
                -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items" `
                -Method POST `
                -Headers $headers `
                -Body ($notebookBody | ConvertTo-Json)

            $notebookId = $response.id
            Write-Host "✅ Uploaded notebook shell: $DisplayName (ID: $notebookId)"
        } catch {
            Write-Error "❌ Failed to upload notebook: $($_.Exception.Message)"
            return
        }
    }

    if (-not $notebookId) {
        Write-Error "❌ Could not resolve notebook ID for $DisplayName"
        return
    }

    Write-Host "📝 Uploading notebook content..."
    try {
        Update-NotebookDefinition -NotebookId $notebookId -DisplayName $DisplayName -NotebookFilePath $NotebookFilePath
        Write-Host "✅ Uploaded notebook content: $DisplayName"
    } catch {
        Write-Error "❌ Failed to upload notebook content: $($_.Exception.Message)"
    }
}

# ============================================================================
# Main: Recursively find and upload all notebooks
# ============================================================================
Write-Host "🔍 Scanning for notebooks in: $NotebooksPath"
Write-Host ""

$notebookFiles = Get-ChildItem -Path $NotebooksPath -Filter "*.ipynb" -Recurse -ErrorAction SilentlyContinue

if ($notebookFiles.Count -eq 0) {
    Write-Error "No notebooks found in $NotebooksPath"
    exit 1
}

Write-Host "📚 Found $($notebookFiles.Count) notebook(s)"
Write-Host ""

$resolvedNotebooksRoot = (Resolve-Path -Path $NotebooksPath).Path

# Ensure all notebooks are placed under a top-level root folder (default: Notebooks)
$rootFolderId = Get-OrCreateFolder -FolderPath $RootFolderName
if ($null -eq $rootFolderId) {
    Write-Error "Failed to create or find root folder '$RootFolderName'"
    exit 1
}

foreach ($file in $notebookFiles) {
    # Get reliable relative path from notebooks root
    $relativePath = [System.IO.Path]::GetRelativePath($resolvedNotebooksRoot, $file.FullName)
    
    # Extract folder path and display name
    $fileInfo = $relativePath -split '[\\/]'
    $displayName = $fileInfo[-1] -replace '\.ipynb$', ''
    $folderParts = @()
    if ($fileInfo.Count -gt 1) {
        $folderParts = $fileInfo[0..($fileInfo.Count - 2)]
    }

    # Create folder hierarchy
    $parentFolderId = $rootFolderId
    if ($folderParts.Count -gt 0) {
        $folderPath = $folderParts -join "\"
        $parentFolderId = Get-OrCreateFolder -FolderPath $folderPath -ParentFolderId $rootFolderId
        
        if ($null -eq $parentFolderId) {
            Write-Warning "⚠️  Skipping notebook - failed to create folder structure"
            continue
        }
    }

    # Upload notebook
    Upload-Notebook -NotebookFilePath $file.FullName -DisplayName $displayName -ParentFolderId $parentFolderId
}

Write-Host ""
Write-Host "✨ Notebook upload complete!"
Write-Host ""
Write-Host "📍 All notebooks are now in workspace with folder structure preserved:"
Write-Host "   $WorkspaceId"