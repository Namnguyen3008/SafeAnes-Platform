function New-CmdCommandArguments {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath,

        [Parameter(Mandatory = $true)]
        [string]$CommandLine,

        [string]$RedirectPath
    )

    if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or $ExecutablePath.Contains('"')) {
        throw "command executable path is invalid"
    }
    if ($RedirectPath -and $RedirectPath.Contains('"')) {
        throw "command output path is invalid"
    }

    $command = '"' + $ExecutablePath + '"'
    if (-not [string]::IsNullOrWhiteSpace($CommandLine)) {
        $command += ' ' + $CommandLine
    }
    if (-not [string]::IsNullOrWhiteSpace($RedirectPath)) {
        $command += ' >"' + $RedirectPath + '" 2>&1'
    }

    # cmd.exe /c requires the extra outer quotes when the command begins with
    # a quoted executable path. This remains valid when the path contains
    # spaces, including a normal Program Files installation.
    return '/d /s /c "' + $command + '"'
}

function Get-BrowserSuiteTimeoutSeconds {
    param(
        [Parameter(Mandatory = $true)]
        [int]$StartupTimeoutSeconds,

        [switch]$Visual
    )

    $minimumSeconds = if ($Visual) { 900 } else { 600 }
    $scale = if ($Visual) { 10 } else { 6 }
    $scaledSeconds = [int][Math]::Ceiling($StartupTimeoutSeconds * $scale)
    return [Math]::Min(1800, [Math]::Max($minimumSeconds, $scaledSeconds))
}

function Test-ReadinessResponse {
    param($Response)

    if (-not $Response -or $Response.StatusCode -ne 200 -or -not $Response.Json) {
        return $false
    }
    return ($Response.Json.status -eq "ready" -and $Response.Json.ready -is [bool] -and $Response.Json.ready)
}

function New-ProcessCleanupSummary {
    param(
        [bool[]]$ProcessStopped,
        [int[]]$ExitCodes
    )

    $allStopped = $true
    foreach ($stopped in @($ProcessStopped)) {
        if (-not $stopped) {
            $allStopped = $false
            break
        }
    }
    return [pscustomobject]@{
        AllStopped = [bool]$allStopped
        ExitCodes = @($ExitCodes)
    }
}

$script:SafeAnesWindowsRuntimeEnvironmentNames = @(
    "APPDATA",
    "ComSpec",
    "COMMONPROGRAMFILES",
    "COMMONPROGRAMFILES(X86)",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_ARCHITEW6432",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE",
    "WINDIR"
)

function Get-RequiredWindowsRuntimeEnvironment {
    $values = @{}
    foreach ($name in $script:SafeAnesWindowsRuntimeEnvironmentNames) {
        $value = [Environment]::GetEnvironmentVariable($name, "Process")
        if ($null -ne $value) {
            $values[$name] = [string]$value
        }
    }
    return $values
}

function New-StrictChildEnvironment {
    param(
        [hashtable]$Values,
        [string[]]$AllowedNames,
        [hashtable]$Overrides
    )

    $result = Get-RequiredWindowsRuntimeEnvironment
    foreach ($name in @($AllowedNames)) {
        if ($Values -and $Values.ContainsKey($name)) {
            $result[$name] = [string]$Values[$name]
        }
    }
    if ($Overrides) {
        foreach ($entry in $Overrides.GetEnumerator()) {
            $result[$entry.Key] = [string]$entry.Value
        }
    }
    return $result
}

function Get-ValidatedApiToken {
    param([hashtable]$Values)

    $backendToken = if ($Values -and $Values.ContainsKey("SAFEANES_API_TOKEN")) {
        [string]$Values["SAFEANES_API_TOKEN"]
    }
    else { "" }
    $proxyToken = if ($Values -and $Values.ContainsKey("SAFEANES_BACKEND_API_TOKEN")) {
        [string]$Values["SAFEANES_BACKEND_API_TOKEN"]
    }
    else { "" }
    if ($backendToken -cne $proxyToken) {
        throw "backend/proxy API token configuration does not match"
    }
    return $backendToken
}

function Get-ProcessTreeIds {
    param([int]$RootProcessId)

    $ids = New-Object System.Collections.Generic.List[int]
    $ids.Add($RootProcessId)
    try {
        $rows = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
        $childrenByParent = @{}
        foreach ($row in $rows) {
            $parentId = [int]$row.ParentProcessId
            if (-not $childrenByParent.ContainsKey($parentId)) {
                $childrenByParent[$parentId] = New-Object System.Collections.Generic.List[int]
            }
            $childrenByParent[$parentId].Add([int]$row.ProcessId)
        }
        $queue = New-Object System.Collections.Generic.Queue[int]
        $queue.Enqueue($RootProcessId)
        while ($queue.Count -gt 0) {
            $parentId = $queue.Dequeue()
            if (-not $childrenByParent.ContainsKey($parentId)) { continue }
            foreach ($childId in $childrenByParent[$parentId]) {
                if (-not $ids.Contains($childId)) {
                    $ids.Add($childId)
                    $queue.Enqueue($childId)
                }
            }
        }
    }
    catch {
        # taskkill /T still provides recursive cleanup if CIM is unavailable.
    }
    return @($ids)
}

function Test-ProcessIdsStopped {
    param([int[]]$ProcessIds)

    foreach ($processId in @($ProcessIds | Select-Object -Unique)) {
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
            return $false
        }
    }
    return $true
}

function Stop-ExactProcessTree {
    param(
        [int]$RootProcessId,
        [int]$WaitSeconds = 10
    )

    $observedIds = New-Object System.Collections.Generic.List[int]
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitSeconds)
    do {
        $ownedIds = @(Get-ProcessTreeIds -RootProcessId $RootProcessId | Select-Object -Unique)
        foreach ($processId in $ownedIds) {
            if (-not $observedIds.Contains([int]$processId)) {
                $observedIds.Add([int]$processId)
            }
        }
        # Stop descendants before their parents. Stop-Process tolerates a PID
        # that exits between enumeration and termination, unlike taskkill's
        # stderr path under ErrorActionPreference=Stop.
        for ($index = $ownedIds.Count - 1; $index -ge 0; $index--) {
            $processId = [int]$ownedIds[$index]
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        if (Test-ProcessIdsStopped -ProcessIds @($observedIds.ToArray())) {
            return $true
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    return (Test-ProcessIdsStopped -ProcessIds @($observedIds.ToArray()))
}

function Remove-SafeFrontendDistDir {
    param(
        [string]$Root,
        [string]$RelativeName
    )

    if ([string]::IsNullOrWhiteSpace($RelativeName) -or $RelativeName -cnotmatch '^\.next-safeanes-launcher-[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') {
        return $false
    }
    try {
        $rootPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Root -ErrorAction Stop).ProviderPath).TrimEnd('\')
        $candidate = [IO.Path]::GetFullPath((Join-Path $rootPath $RelativeName)).TrimEnd('\')
        if (-not [String]::Equals([IO.Path]::GetDirectoryName($candidate).TrimEnd('\'), $rootPath, [StringComparison]::OrdinalIgnoreCase)) {
            return $false
        }
        if (-not (Test-Path -LiteralPath $candidate)) {
            return $true
        }
        $item = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            return $false
        }
        Remove-Item -LiteralPath $candidate -Recurse -Force -ErrorAction Stop
        return (-not (Test-Path -LiteralPath $candidate))
    }
    catch {
        return $false
    }
}

function Get-SafeFrontendTsconfigPath {
    param([string]$DistDir)

    if ([string]::IsNullOrWhiteSpace($DistDir) -or $DistDir -cnotmatch '^\.next-safeanes-launcher-([A-Za-z0-9][A-Za-z0-9_-]{0,31})$') {
        throw "launcher frontend output directory is invalid"
    }
    return ".tsconfig-safeanes-launcher-$($Matches[1]).json"
}

function Copy-SafeFrontendTsconfig {
    param(
        [string]$Root,
        [string]$RelativeName
    )

    if ([string]::IsNullOrWhiteSpace($RelativeName) -or $RelativeName -cnotmatch '^\.tsconfig-safeanes-launcher-[A-Za-z0-9][A-Za-z0-9_-]{0,31}\.json$') {
        return $false
    }
    try {
        $rootPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Root -ErrorAction Stop).ProviderPath).TrimEnd('\')
        $source = Join-Path $rootPath "tsconfig.json"
        $candidate = [IO.Path]::GetFullPath((Join-Path $rootPath $RelativeName)).TrimEnd('\')
        if (-not [String]::Equals([IO.Path]::GetDirectoryName($candidate).TrimEnd('\'), $rootPath, [StringComparison]::OrdinalIgnoreCase)) {
            return $false
        }
        if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Test-Path -LiteralPath $candidate)) {
            return $false
        }
        Copy-Item -LiteralPath $source -Destination $candidate -ErrorAction Stop
        return (Test-Path -LiteralPath $candidate -PathType Leaf)
    }
    catch {
        return $false
    }
}

function Remove-SafeFrontendTsconfig {
    param(
        [string]$Root,
        [string]$RelativeName
    )

    if ([string]::IsNullOrWhiteSpace($RelativeName) -or $RelativeName -cnotmatch '^\.tsconfig-safeanes-launcher-[A-Za-z0-9][A-Za-z0-9_-]{0,31}\.json$') {
        return $false
    }
    try {
        $rootPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Root -ErrorAction Stop).ProviderPath).TrimEnd('\')
        $candidate = [IO.Path]::GetFullPath((Join-Path $rootPath $RelativeName)).TrimEnd('\')
        if (-not [String]::Equals([IO.Path]::GetDirectoryName($candidate).TrimEnd('\'), $rootPath, [StringComparison]::OrdinalIgnoreCase)) {
            return $false
        }
        if (-not (Test-Path -LiteralPath $candidate)) {
            return $true
        }
        $item = Get-Item -LiteralPath $candidate -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            return $false
        }
        Remove-Item -LiteralPath $candidate -Force -ErrorAction Stop
        return (-not (Test-Path -LiteralPath $candidate))
    }
    catch {
        return $false
    }
}
