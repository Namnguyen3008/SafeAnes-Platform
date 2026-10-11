[CmdletBinding()]
param(
    [string]$VaultPath = (Join-Path $env:USERPROFILE 'Downloads\HỌC TẬP AI IN ACTION\keys_vault.json')
)

function Get-ObjectPropertyValue {
    param(
        [Parameter(Mandatory = $true)]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $InputObject) { return $null }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return ,$property.Value
}

function Get-FigmaCredentialShape {
    param([Parameter(Mandatory = $true)]$Credential)

    $value = $Credential
    if ($value -is [string]) {
        $trimmed = $value.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            return [pscustomobject]@{ formatStatus = 'EMPTY'; authenticationMethod = 'NONE'; validationStatus = 'NOT_VALIDATED' }
        }

        if ($trimmed.StartsWith('{') -or $trimmed.StartsWith('[') -or $trimmed.StartsWith('"')) {
            try {
                $value = ConvertFrom-Json -InputObject $trimmed -ErrorAction Stop
            }
            catch {
                return [pscustomobject]@{ formatStatus = 'MALFORMED'; authenticationMethod = 'UNKNOWN'; validationStatus = 'NOT_VALIDATED' }
            }
        }
        else {
            # Figma does not publish a stable syntactic schema for opaque PAT strings.
            # Preserve uncertainty instead of guessing from length or prefix.
            return [pscustomobject]@{ formatStatus = 'UNKNOWN'; authenticationMethod = 'UNKNOWN'; validationStatus = 'NOT_VALIDATED' }
        }
    }

    if ($null -eq $value) {
        return [pscustomobject]@{ formatStatus = 'EMPTY'; authenticationMethod = 'NONE'; validationStatus = 'NOT_VALIDATED' }
    }

    if ($value -is [System.Array]) {
        return [pscustomobject]@{ formatStatus = 'UNSUPPORTED_FORMAT'; authenticationMethod = 'UNSUPPORTED'; validationStatus = 'NOT_VALIDATED' }
    }

    $accessToken = Get-ObjectPropertyValue -InputObject $value -Name 'access_token'
    $tokenType = Get-ObjectPropertyValue -InputObject $value -Name 'token_type'
    if ($accessToken -is [string] -and -not [string]::IsNullOrWhiteSpace($accessToken) -and
        $tokenType -is [string] -and $tokenType.Equals('Bearer', [System.StringComparison]::OrdinalIgnoreCase)) {
        return [pscustomobject]@{ formatStatus = 'VALID_FORMAT'; authenticationMethod = 'MCP_OAUTH_BUNDLE'; validationStatus = 'NOT_AUTHENTICATED' }
    }

    if ($value -is [System.Management.Automation.PSCustomObject] -or $value -is [System.Collections.IDictionary]) {
        return [pscustomobject]@{ formatStatus = 'UNSUPPORTED_FORMAT'; authenticationMethod = 'UNSUPPORTED'; validationStatus = 'NOT_VALIDATED' }
    }

    return [pscustomobject]@{ formatStatus = 'UNSUPPORTED_FORMAT'; authenticationMethod = 'UNSUPPORTED'; validationStatus = 'NOT_VALIDATED' }
}

function Get-FigmaVaultCredentialReport {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'Credential vault file was not found.'
    }

    try {
        $json = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
        $vault = ConvertFrom-Json -InputObject $json -ErrorAction Stop
    }
    catch {
        # Parser diagnostics can include input fragments. Never forward them.
        throw 'Credential vault JSON is invalid or unreadable; parser details are suppressed.'
    }

    $accounts = Get-ObjectPropertyValue -InputObject $vault -Name 'accounts'
    if ($null -eq $accounts -or -not ($accounts -is [System.Array] -or $accounts -is [System.Collections.IList])) {
        throw 'Credential vault structure is unsupported; no credential values were emitted.'
    }

    $reports = @()
    $index = 0
    foreach ($account in $accounts) {
        $keys = Get-ObjectPropertyValue -InputObject $account -Name 'keys'
        $figmaCredential = Get-ObjectPropertyValue -InputObject $keys -Name 'figma'
        if ($null -eq $keys -or $null -eq $keys.PSObject.Properties['figma']) {
            continue
        }

        $index++
        $shape = Get-FigmaCredentialShape -Credential $figmaCredential
        $reports += [pscustomobject]@{
            alias = ('figma-entry-{0:D2}' -f $index)
            formatStatus = $shape.formatStatus
            authenticationMethod = $shape.authenticationMethod
            validationStatus = $shape.validationStatus
        }
    }

    return $reports
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $report = @(Get-FigmaVaultCredentialReport -Path $VaultPath)
        if ($report.Count -eq 0) {
            Write-Output 'No accounts[*].keys.figma entries were found.'
        }
        else {
            $report | Format-Table -AutoSize
            $counts = $report | Group-Object formatStatus | Sort-Object Name | ForEach-Object { '{0}={1}' -f $_.Name, $_.Count }
            Write-Output ('Summary: ' + ($counts -join ', '))
        }
    }
    catch {
        Write-Error $_.Exception.Message
        exit 1
    }
}
