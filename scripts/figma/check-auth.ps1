[CmdletBinding()]
param()

$connection = & (Join-Path $PSScriptRoot 'check-connection.ps1') -AsObject
Write-Output ('Codex-managed Figma MCP OAuth: ' + $connection.authenticationStatus)
if ($connection.authenticationStatus -eq 'NOT_AUTHENTICATED') {
    Write-Output 'Complete the pending official browser authorization after checking the displayed Figma account.'
}
