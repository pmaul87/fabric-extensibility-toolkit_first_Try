################################################
# Starting the DevServer
################################################
Write-Host ""
Write-Host "Starting the DevServer ..."
$workloadDir = Join-Path $PSScriptRoot "..\..\Workload"
Push-Location $workloadDir
try {
    $devServerPort = 60006
    if ($env:DEVSERVER_PORT) {
        [int]::TryParse($env:DEVSERVER_PORT, [ref]$devServerPort) | Out-Null
    }

    if ($IsWindows) {
        $existingListener = Get-NetTCPConnection -LocalPort $devServerPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($existingListener) {
            $existingProcess = Get-Process -Id $existingListener.OwningProcess -ErrorAction SilentlyContinue
            if ($existingProcess -and $existingProcess.ProcessName -eq "node") {
                Write-Host "DevServer appears to already be running on port $devServerPort (PID $($existingProcess.Id))."
                Write-Host "Skipping duplicate startup."
                return
            }

            Write-Error "Port $devServerPort is already in use by process ID $($existingListener.OwningProcess). Stop that process or change DEVSERVER_PORT."
            return
        }
    }

    # If running in Codespaces, use the low memory version by default to prevent OOM errors
    if ($env:CODESPACES -eq "true") {
        Write-Host "Running in Codespace environment - using low memory configuration to prevent OOM errors"
        $env:NODE_ENV = "codespace"
        npm run start:codespace
    } else {
        # Use regular start for non-codespace environments
        npm start
    }
} finally {
    Pop-Location
}
