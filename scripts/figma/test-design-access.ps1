[CmdletBinding()]
param([string]$FileUrl)

$connection = & (Join-Path $PSScriptRoot 'check-connection.ps1') -AsObject
if ([string]::IsNullOrWhiteSpace($FileUrl)) {
    Write-Output 'Design resource access: NOT_TESTED'
    Write-Output 'Reason: no intended Figma file URL was provided; no file or node IDs are inferred.'
    exit 0
}

$match = [regex]::Match($FileUrl, '^https://(?:www\.)?figma\.com/(?:file|design|board|proto)/([A-Za-z0-9]+)(?:/|$)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if (-not $match.Success) {
    Write-Output 'Design resource access: INVALID_REFERENCE'
    Write-Output 'The input must be an https://www.figma.com file, design, board, or prototype URL.'
    exit 2
}

Write-Output 'Figma resource reference: VALID_FORMAT'
if ($connection.authenticationStatus -ne 'AUTHENTICATED') {
    Write-Output 'Design resource access: BLOCKED_PENDING_OAUTH'
    exit 0
}

Write-Output 'Design resource access: NOT_TESTED'
Write-Output 'Reason: Codex CLI exposes server registration status, not a direct MCP tool invocation; use the authenticated Figma MCP get_design_context tool for this file.'
