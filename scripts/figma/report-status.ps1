[CmdletBinding()]
param(
    [string]$VaultPath = (Join-Path $env:USERPROFILE 'Downloads\HỌC TẬP AI IN ACTION\keys_vault.json')
)

. (Join-Path $PSScriptRoot 'validate-vault.ps1') -VaultPath $VaultPath
$credentialRows = @(Get-FigmaVaultCredentialReport -Path $VaultPath)
$connection = & (Join-Path $PSScriptRoot 'check-connection.ps1') -AsObject

Write-Output 'SafeAnes Figma integration status (sanitized)'
Write-Output ('Vault Figma entries: ' + $credentialRows.Count)
if ($credentialRows.Count -gt 0) {
    $credentialRows | Group-Object formatStatus | Sort-Object Name | ForEach-Object {
        Write-Output ('Credential format {0}: {1}' -f $_.Name, $_.Count)
    }
}
Write-Output ('Codex MCP server registered: ' + $(if ($connection.registered) { 'YES' } else { 'NO' }))
Write-Output ('Codex MCP endpoint: ' + $connection.endpoint)
Write-Output ('Codex MCP OAuth: ' + $connection.authenticationStatus)
Write-Output 'REST adapter: NOT_CONFIGURED'
Write-Output 'Design resource permission: NOT_TESTED'
