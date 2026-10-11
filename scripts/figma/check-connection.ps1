[CmdletBinding()]
param([switch]$AsObject)

$modulePath = Join-Path $PSScriptRoot 'FigmaMcpStatus.psm1'
Import-Module $modulePath -Force

try {
    $jsonLines = & codex mcp list --json 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Codex MCP status command failed.' }
    $configJson = @($jsonLines) -join "`n"
    $status = ConvertTo-SafeFigmaMcpStatus -ConfigJson $configJson
}
catch {
    $status = [pscustomobject]@{
        registered = $false
        enabled = $false
        endpoint = 'UNKNOWN'
        authenticationStatus = 'UNKNOWN'
    }
}

if ($AsObject) {
    return $status
}

Write-Output ('Figma MCP registered: ' + $(if ($status.registered) { 'YES' } else { 'NO' }))
Write-Output ('Official endpoint: ' + $status.endpoint)
Write-Output ('Enabled: ' + $(if ($status.enabled) { 'YES' } else { 'NO' }))
Write-Output ('Authentication: ' + $status.authenticationStatus)
