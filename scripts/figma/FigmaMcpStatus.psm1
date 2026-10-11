function ConvertTo-SafeFigmaMcpStatus {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$ConfigJson)

    try {
        $servers = ConvertFrom-Json -InputObject $ConfigJson -ErrorAction Stop
    }
    catch {
        return [pscustomobject]@{
            registered = $false
            enabled = $false
            endpoint = 'UNKNOWN'
            authenticationStatus = 'UNKNOWN'
        }
    }

    $figmaServer = @($servers | Where-Object { $_.name -eq 'figma' }) | Select-Object -First 1
    if ($null -eq $figmaServer) {
        return [pscustomobject]@{
            registered = $false
            enabled = $false
            endpoint = 'UNKNOWN'
            authenticationStatus = 'UNKNOWN'
        }
    }

    $transport = $figmaServer.transport
    $endpoint = 'OTHER_OR_UNPARSED'
    if ($null -ne $transport -and $transport.url -is [string] -and
        $transport.url.Equals('https://mcp.figma.com/mcp', [System.StringComparison]::OrdinalIgnoreCase)) {
        $endpoint = 'OFFICIAL_FIGMA_MCP'
    }

    $authText = [string]$figmaServer.auth_status
    if ($authText -match '(?i)not[_\s-]*(logged[_\s-]*in|authenticated)|unauthenticated|pending|expired|not[_\s-]*configured') {
        $authenticationStatus = 'NOT_AUTHENTICATED'
    }
    elseif ($authText -match '(?i)logged[_\s-]*in|authenticated') {
        $authenticationStatus = 'AUTHENTICATED'
    }
    else {
        $authenticationStatus = 'UNKNOWN'
    }

    return [pscustomobject]@{
        registered = $true
        enabled = [bool]$figmaServer.enabled
        endpoint = $endpoint
        authenticationStatus = $authenticationStatus
    }
}

Export-ModuleMember -Function ConvertTo-SafeFigmaMcpStatus
