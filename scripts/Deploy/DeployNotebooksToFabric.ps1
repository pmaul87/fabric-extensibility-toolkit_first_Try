param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceId,

    [string]$NotebooksPath = "$PSScriptRoot/../../Workload/notebooks",

    [string]$RootFolderName = "Notebooks"
)

function Write-Info {
    param(
        [string]$Message,
        [string]$Color = "Green"
    )

    Write-Host $Message -ForegroundColor $Color
}

function Wait-FabricOperation {
    param(
        [hashtable]$Headers,
        [string]$OperationId,
        [int]$MaxAttempts = 60
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $statusResponse = Invoke-RestMethod `
            -Uri "https://api.fabric.microsoft.com/v1/operations/$OperationId" `
            -Method GET `
            -Headers $Headers

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
        [hashtable]$Headers,
        [string]$WorkspaceId,
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
        -Headers $Headers `
        -Body $definitionBody `
        -ErrorAction Stop

    if ($response.StatusCode -eq 202) {
        $operationId = $response.Headers['x-ms-operation-id']
        if (-not $operationId) {
            throw "updateDefinition returned 202 without x-ms-operation-id for notebook '$DisplayName'"
        }

        Wait-FabricOperation -Headers $Headers -OperationId $operationId
    }
}

function Get-OrCreateFolder {
    param(
        [hashtable]$Headers,
        [hashtable]$FolderCache,
        [string]$WorkspaceId,
        [string]$FolderPath,
        [string]$ParentFolderId = $null
    )

    if ($FolderCache.ContainsKey($FolderPath)) {
        return $FolderCache[$FolderPath]
    }

    $folderName = Split-Path -Path $FolderPath -Leaf
    $parentPath = Split-Path -Path $FolderPath -Parent
    $resolvedParentId = $ParentFolderId

    if (-not [string]::IsNullOrWhiteSpace($parentPath) -and $parentPath -ne '.') {
        $resolvedParentId = Get-OrCreateFolder -Headers $Headers -FolderCache $FolderCache -WorkspaceId $WorkspaceId -FolderPath $parentPath
    }

    $queryUrl = "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/folders?recursive=false"
    if ($resolvedParentId) {
        $queryUrl += "&parentFolderId=$resolvedParentId"
    }

    $foldersResponse = Invoke-RestMethod -Uri $queryUrl -Method GET -Headers $Headers
    $existingFolder = $foldersResponse.value | Where-Object { $_.displayName -eq $folderName } | Select-Object -First 1

    if ($existingFolder) {
        $FolderCache[$FolderPath] = $existingFolder.id
        return $existingFolder.id
    }

    $body = @{ displayName = $folderName }
    if ($resolvedParentId) {
        $body.parentFolderId = $resolvedParentId
    }

    $response = Invoke-RestMethod `
        -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/folders" `
        -Method POST `
        -Headers $Headers `
        -Body ($body | ConvertTo-Json)

    $FolderCache[$FolderPath] = $response.id
    return $response.id
}

function Publish-Notebook {
    param(
        [hashtable]$Headers,
        [string]$WorkspaceId,
        [string]$NotebookFilePath,
        [string]$DisplayName,
        [string]$ParentFolderId = $null
    )

    if (-not (Test-Path $NotebookFilePath)) {
        Write-Warning "Notebook file not found: $NotebookFilePath"
        return
    }

    Write-Info "Processing notebook: $DisplayName" "Yellow"

    $itemsResponse = Invoke-RestMethod `
        -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items?type=Notebook" `
        -Method GET `
        -Headers $Headers

    $existingNotebook = $itemsResponse.value | Where-Object { $_.displayName -eq $DisplayName } | Select-Object -First 1
    $notebookId = $null

    if ($existingNotebook) {
        $notebookId = $existingNotebook.id

        if ($ParentFolderId -and $existingNotebook.folderId -ne $ParentFolderId) {
            Invoke-RestMethod `
                -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items/$($existingNotebook.id)/move" `
                -Method POST `
                -Headers $Headers `
                -Body (@{ targetFolderId = $ParentFolderId } | ConvertTo-Json)
        }
        elseif (-not $ParentFolderId -and $existingNotebook.folderId) {
            Invoke-RestMethod `
                -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items/$($existingNotebook.id)/move" `
                -Method POST `
                -Headers $Headers `
                -Body (@{ targetFolderId = $null } | ConvertTo-Json)
        }
    }
    else {
        $notebookBody = @{
            displayName = $DisplayName
            type = "Notebook"
        }

        if ($ParentFolderId) {
            $notebookBody.folderId = $ParentFolderId
        }

        $response = Invoke-RestMethod `
            -Uri "https://api.fabric.microsoft.com/v1/workspaces/$WorkspaceId/items" `
            -Method POST `
            -Headers $Headers `
            -Body ($notebookBody | ConvertTo-Json)

        $notebookId = $response.id
    }

    if (-not $notebookId) {
        throw "Could not resolve notebook ID for $DisplayName"
    }

    Update-NotebookDefinition `
        -Headers $Headers `
        -WorkspaceId $WorkspaceId `
        -NotebookId $notebookId `
        -DisplayName $DisplayName `
        -NotebookFilePath $NotebookFilePath

    Write-Info "Published notebook: $DisplayName"
}

$token = az account get-access-token --resource "https://api.fabric.microsoft.com" --query accessToken -o tsv
if (-not $token) {
    throw "Failed to get Fabric access token. Make sure Azure CLI is installed and you are logged in with 'az login'."
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

$notebookFiles = Get-ChildItem -Path $NotebooksPath -Filter "*.ipynb" -Recurse -ErrorAction SilentlyContinue
if ($notebookFiles.Count -eq 0) {
    throw "No notebooks found in $NotebooksPath"
}

$folderCache = @{}
$resolvedNotebooksRoot = (Resolve-Path -Path $NotebooksPath).Path
$rootFolderId = Get-OrCreateFolder -Headers $headers -FolderCache $folderCache -WorkspaceId $WorkspaceId -FolderPath $RootFolderName

Write-Info "Found $($notebookFiles.Count) notebook(s) to publish to workspace $WorkspaceId." "Cyan"

foreach ($file in $notebookFiles) {
    $relativePath = [System.IO.Path]::GetRelativePath($resolvedNotebooksRoot, $file.FullName)
    $directoryPath = [System.IO.Path]::GetDirectoryName($relativePath)
    $displayName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)

    $parentFolderId = $rootFolderId
    if (-not [string]::IsNullOrWhiteSpace($directoryPath)) {
        $folderPath = [System.IO.Path]::Combine($RootFolderName, $directoryPath)
        $parentFolderId = Get-OrCreateFolder -Headers $headers -FolderCache $folderCache -WorkspaceId $WorkspaceId -FolderPath $folderPath
    }

    Publish-Notebook `
        -Headers $headers `
        -WorkspaceId $WorkspaceId `
        -NotebookFilePath $file.FullName `
        -DisplayName $displayName `
        -ParentFolderId $parentFolderId
}

Write-Info "Notebook deployment complete." "Green"