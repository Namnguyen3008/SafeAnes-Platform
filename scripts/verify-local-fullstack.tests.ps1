$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$scriptPath = Join-Path $repoRoot "scripts/verify-local-fullstack.ps1"
$passed = 0
$shellName = if ($PSVersionTable.PSEdition -eq "Core") { "pwsh" } else { "powershell.exe" }
$shellCommand = Get-Command $shellName -ErrorAction SilentlyContinue
$shellExecutable = if ($shellCommand) { $shellCommand.Source } else { [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName }
. (Join-Path $PSScriptRoot "verify-local-fullstack.helpers.ps1")
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function New-FreeListener {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.ExclusiveAddressUse = $true
    $listener.Start()
    return $listener
}
function Test-ListenerStillOccupiesPort([int]$Port) {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $probe.ExclusiveAddressUse = $true
    try {
        $probe.Start()
        return $false
    }
    catch [System.Net.Sockets.SocketException] {
        return $true
    }
    finally { $probe.Stop() }
}
$spaceRoot = Join-Path $env:TEMP ("safeanes cmd quote test " + [guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $spaceRoot -Force | Out-Null
    $spaceExecutable = Join-Path $spaceRoot "runner.cmd"
    $spaceOutput = Join-Path $spaceRoot "output file.txt"
    Set-Content -LiteralPath $spaceExecutable -Value "@echo off`r`nexit /b 0" -Encoding ascii
    $spaceArguments = New-CmdCommandArguments -ExecutablePath $spaceExecutable -CommandLine "probe" -RedirectPath $spaceOutput
    $spaceStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $spaceStartInfo.FileName = (Get-Command cmd.exe).Source
    $spaceStartInfo.Arguments = $spaceArguments
    $spaceStartInfo.WorkingDirectory = $repoRoot
    $spaceStartInfo.UseShellExecute = $false
    $spaceStartInfo.CreateNoWindow = $true
    $spaceProcess = [System.Diagnostics.Process]::Start($spaceStartInfo)
    $spaceExited = $spaceProcess.WaitForExit(10000)
    $spaceExitCode = if ($spaceExited) { $spaceProcess.ExitCode } else { -1 }
    if (-not $spaceExited -and -not $spaceProcess.HasExited) { $spaceProcess.Kill() }
    Assert-True ($spaceExited -and $spaceExitCode -eq 0 -and (Test-Path -LiteralPath $spaceOutput -PathType Leaf)) "cmd wrapper must execute paths containing spaces"
    $spaceProcess.Dispose()
    $passed++
}
finally {
    if (Test-Path -LiteralPath $spaceRoot) { Remove-Item -LiteralPath $spaceRoot -Recurse -Force }
}
Assert-True ((Get-BrowserSuiteTimeoutSeconds -StartupTimeoutSeconds 90) -eq 600) "integration timeout should scale above the old fixed cap"
Assert-True ((Get-BrowserSuiteTimeoutSeconds -StartupTimeoutSeconds 90 -Visual) -eq 900) "visual timeout should allow the workstation matrix"
Assert-True ((Get-BrowserSuiteTimeoutSeconds -StartupTimeoutSeconds 300 -Visual) -eq 1800) "browser timeout should remain bounded"
$passed++
$notReady = [pscustomobject]@{ StatusCode = 503; Json = [pscustomobject]@{ status = "not_ready"; ready = $false } }
$readyResponse = [pscustomobject]@{ StatusCode = 200; Json = [pscustomobject]@{ status = "ready"; ready = $true } }
Assert-True (-not (Test-ReadinessResponse -Response $notReady)) "HTTP 503 readiness must continue polling"
Assert-True (Test-ReadinessResponse -Response $readyResponse) "only a ready HTTP 200 response should satisfy readiness polling"
$passed++
$cleanupSummary = New-ProcessCleanupSummary -ProcessStopped @($true, $false) -ExitCodes @(0, 1)
Assert-True ($cleanupSummary -isnot [array] -and $cleanupSummary.AllStopped -eq $false) "mixed cleanup results must remain an explicit false summary"
Assert-True (@($cleanupSummary.ExitCodes).Count -eq 2) "cleanup summary should retain exit codes separately from its success flag"
$passed++
$helperSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot "verify-local-fullstack.helpers.ps1") -Raw
Assert-True ($helperSource -match 'Stop-Process -Id' -and $helperSource -notmatch 'taskkill\.exe') "process cleanup must tolerate an exit race without native stderr"
Assert-True (Stop-ExactProcessTree -RootProcessId 2147483647 -WaitSeconds 1) "an already-exited owned PID should be treated as clean"
$passed++
$strictValues = New-StrictChildEnvironment `
    -Values @{ SAFEANES_API_TOKEN = "allowed"; SHOULD_NOT_BE_INHERITED = "secret" } `
    -AllowedNames @("SAFEANES_API_TOKEN") `
    -Overrides @{ SAFEANES_TEST_OVERRIDE = "yes" }
Assert-True ($strictValues["SAFEANES_API_TOKEN"] -eq "allowed" -and $strictValues["SAFEANES_TEST_OVERRIDE"] -eq "yes") "strict child environment should retain allowlisted values"
Assert-True (-not $strictValues.ContainsKey("SHOULD_NOT_BE_INHERITED")) "strict child environment should omit unlisted values"
$passed++
Assert-True ((Get-ValidatedApiToken -Values @{ SAFEANES_API_TOKEN = "same"; SAFEANES_BACKEND_API_TOKEN = "same" }) -eq "same") "matching backend/proxy tokens should validate"
$tokenMismatch = $false
try { Get-ValidatedApiToken -Values @{ SAFEANES_API_TOKEN = "backend"; SAFEANES_BACKEND_API_TOKEN = "proxy" } | Out-Null } catch { $tokenMismatch = $true }
Assert-True $tokenMismatch "mismatched backend/proxy tokens should fail without exposing values"
$passed++
$cleanupRoot = Join-Path $env:TEMP ("safeanes cleanup root " + [guid]::NewGuid().ToString("N"))
try {
    $cleanupDist = Join-Path $cleanupRoot ".next-safeanes-launcher-test123"
    New-Item -ItemType Directory -Path $cleanupDist -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $cleanupDist "marker.txt") -Value "owned" -Encoding ascii
    Assert-True (Remove-SafeFrontendDistDir -Root $cleanupRoot -RelativeName ".next-safeanes-launcher-test123") "owned dist directory should be removed"
    Assert-True (-not (Test-Path -LiteralPath $cleanupDist)) "owned dist directory should no longer exist"
    Assert-True (-not (Remove-SafeFrontendDistDir -Root $cleanupRoot -RelativeName "..\outside")) "cleanup should reject paths outside the repository root"
    $passed++
}
finally {
    if (Test-Path -LiteralPath $cleanupRoot) { Remove-Item -LiteralPath $cleanupRoot -Recurse -Force }
}
$tsconfigRoot = Join-Path $env:TEMP ("safeanes tsconfig root " + [guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $tsconfigRoot -Force | Out-Null
    $originalTsconfig = Join-Path $tsconfigRoot "tsconfig.json"
    Set-Content -LiteralPath $originalTsconfig -Value '{"include":["src/**/*.ts"]}' -Encoding ascii
    $ownedTsconfig = Get-SafeFrontendTsconfigPath -DistDir ".next-safeanes-launcher-test123"
    Assert-True ($ownedTsconfig -eq ".tsconfig-safeanes-launcher-test123.json") "launcher tsconfig name must be derived from its owned dist directory"
    Assert-True (Copy-SafeFrontendTsconfig -Root $tsconfigRoot -RelativeName $ownedTsconfig) "launcher must create a separate tsconfig copy"
    $temporaryTsconfig = Join-Path $tsconfigRoot $ownedTsconfig
    Add-Content -LiteralPath $temporaryTsconfig -Value "`n// Next-generated route types" -Encoding ascii
    $originalContentAfterCopyEdit = Get-Content -LiteralPath $originalTsconfig -Raw
    $expectedOriginalContent = '{"include":["src/**/*.ts"]}' + [Environment]::NewLine
    Assert-True ($originalContentAfterCopyEdit -ceq $expectedOriginalContent) "temporary Next config edits must not change project tsconfig"
    Assert-True (Remove-SafeFrontendTsconfig -Root $tsconfigRoot -RelativeName $ownedTsconfig) "owned temporary tsconfig should be removed"
    Assert-True (-not (Test-Path -LiteralPath $temporaryTsconfig)) "temporary tsconfig should no longer exist"
    Assert-True (-not (Copy-SafeFrontendTsconfig -Root $tsconfigRoot -RelativeName "..\outside.json")) "tsconfig copy must reject paths outside the owned root"
    $passed++
}
finally {
    if (Test-Path -LiteralPath $tsconfigRoot) { Remove-Item -LiteralPath $tsconfigRoot -Recurse -Force }
}
$ownedStartInfo = New-Object System.Diagnostics.ProcessStartInfo
$ownedStartInfo.FileName = (Get-Command cmd.exe).Source
$ownedStartInfo.Arguments = '/d /s /c "timeout /t 30 /nobreak >nul"'
$ownedStartInfo.WorkingDirectory = $repoRoot
$ownedStartInfo.UseShellExecute = $false
$ownedStartInfo.CreateNoWindow = $true
$ownedProcess = [System.Diagnostics.Process]::Start($ownedStartInfo)
$ownedStopped = Stop-ExactProcessTree -RootProcessId $ownedProcess.Id -WaitSeconds 5
$ownedProcess.WaitForExit(5000) | Out-Null
Assert-True ($ownedStopped -and $ownedProcess.HasExited) "owned process tree should be stopped and verified"
$ownedProcess.Dispose()
$passed++
function Invoke-Preflight([string]$Arguments) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $shellExecutable
    $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '" -DryRun ' + $Arguments
    $info.WorkingDirectory = $repoRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($info)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(15000)) { $process.Kill(); throw "dry-run timed out" }
    $result = [pscustomobject]@{ ExitCode=$process.ExitCode; Output=$stdout.Result + $stderr.Result }
    $process.Dispose()
    Assert-True ($result.Output -notmatch [regex]::Escape($repoRoot)) "preflight output exposed checkout path"
    return $result
}
$one = New-FreeListener; $two = New-FreeListener
$api = $one.LocalEndpoint.Port; $front = $two.LocalEndpoint.Port
$one.Stop(); $two.Stop()
$result = Invoke-Preflight "-ApiPort $api -FrontendPort $front"
Assert-True ($result.ExitCode -eq 0 -and $result.Output -match 'Children started: NO') "free distinct ports should pass without children"
$passed++
$integrationDryRun = Invoke-Preflight "-ApiPort $api -FrontendPort $front -RunIntegrationTests"
Assert-True ($integrationDryRun.ExitCode -eq 0 -and $integrationDryRun.Output -match 'Children started: NO') "integration opt-in dry-run should validate without starting children"
$passed++
$visualDryRun = Invoke-Preflight "-ApiPort $api -FrontendPort $front -RunVisualTests"
Assert-True ($visualDryRun.ExitCode -eq 0 -and $visualDryRun.Output -match 'Children started: NO') "visual opt-in dry-run should validate without starting children"
$passed++
$waveformDryRun = Invoke-Preflight "-ApiPort $api -FrontendPort $front -RunWaveformProfile"
Assert-True ($waveformDryRun.ExitCode -eq 0 -and $waveformDryRun.Output -match 'Waveform profile: OPT-IN' -and $waveformDryRun.Output -match 'Children started: NO') "waveform profile opt-in should validate without starting children"
$passed++
$combinedDryRun = Invoke-Preflight "-ApiPort $api -FrontendPort $front -RunIntegrationTests -RunVisualTests -RunWaveformProfile"
Assert-True ($combinedDryRun.ExitCode -eq 0 -and $combinedDryRun.Output -match 'Children started: NO') "combined browser and waveform opt-ins should validate without starting children"
$passed++
$launcherSource = Get-Content -LiteralPath $scriptPath -Raw
Assert-True ($launcherSource -match 'SAFEANES_NEXT_DIST_DIR') "launcher must isolate Next output with SAFEANES_NEXT_DIST_DIR"
Assert-True ($launcherSource -match 'SAFEANES_TSCONFIG_PATH' -and $launcherSource -match 'Remove-SafeFrontendTsconfig') "launcher must isolate and clean the Next-mutated tsconfig"
Assert-True ($launcherSource -match 'EnvironmentVariables\.Clear') "launcher must clear inherited child environment variables"
Assert-True ($launcherSource -match 'api/backend/v1/health/live') "launcher must probe the frontend backend proxy"
Assert-True ($launcherSource -match 'Wait-ForHttp') "launcher must use bounded HTTP polling"
Assert-True ($launcherSource -match 'Remove-SafeFrontendDistDir') "launcher must clean the exact generated frontend output"
Assert-True ($launcherSource -match 'cleanupSummary\.AllStopped') "launcher must use the explicit process cleanup result"
Assert-True ($launcherSource -match 'PLAYWRIGHT_BASE_URL' -and $launcherSource -match 'SAFEANES_API_BASE_URL') "launcher must pass integration origins explicitly"
Assert-True ($launcherSource -match 'test-results[\\/]integration') "launcher must preserve integration artifacts"
Assert-True ($launcherSource -match 'test-results[\\/]visual') "launcher must preserve visual artifacts"
Assert-True ($launcherSource -match 'run test:visual') "launcher must support the opt-in visual suite"
Assert-True ($launcherSource -match 'RunWaveformProfile' -and $launcherSource -match 'run test:waveform-profile') "launcher must support the opt-in waveform profile"
Assert-True ($launcherSource -match 'test-results[\\/]waveform-performance') "launcher must preserve waveform profile artifacts"
$passed++
foreach ($arguments in @("-ApiPort $api -FrontendPort $api", "-CaseId 0 -ApiPort $api -FrontendPort $front", "-ApiPort 0 -FrontendPort $front", "-ApiPort $api -FrontendPort 65536", "-ApiPort invalid -FrontendPort $front", "-ApiPort $api -FrontendPort $front -TimeoutSeconds invalid", "-ApiPort $api -FrontendPort $front -TimeoutSeconds 4")) {
    $result = Invoke-Preflight $arguments
    Assert-True ($result.ExitCode -ne 0 -and $result.Output -match 'Children started: NO') "invalid arguments must fail before any children start"
    $passed++
}
$occupied = New-FreeListener
try {
    $busy = $occupied.LocalEndpoint.Port
    foreach ($arguments in @("-ApiPort $busy -FrontendPort $front", "-ApiPort $api -FrontendPort $busy")) {
        $result = Invoke-Preflight $arguments
        Assert-True ($result.ExitCode -ne 0 -and $result.Output -match 'occupied' -and $result.Output -match 'Children started: NO') "occupied port must fail before children start"
        Assert-True (Test-ListenerStillOccupiesPort $busy) "preflight must not stop unrelated listener"
        $passed++
    }
} finally { $occupied.Stop() }
Write-Output "Preflight tests: $passed passed (PowerShell $($PSVersionTable.PSVersion))"
