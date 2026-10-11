[CmdletBinding()]
param(
    [Parameter()]
    [string]$CaseId = "6388",

    [Parameter()]
    $ApiPort = 8100,

    [Parameter()]
    $FrontendPort = 3100,

    [Parameter()]
    [switch]$DryRun,

    [Parameter()]
    [switch]$RunIntegrationTests,

    [Parameter()]
    [switch]$RunVisualTests,

    [Parameter()]
    [switch]$RunWaveformProfile,

    [Parameter()]
    $TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "verify-local-fullstack.helpers.ps1")
$startedProcesses = New-Object System.Collections.ArrayList
$ownedFrontendDistDir = $null
$ownedFrontendTsconfigPath = $null
$script:failureMessage = "local verification failed; check local configuration"

function Fail-Check {
    param([string]$Message)
    $script:failureMessage = $Message
    throw "fullstack verification stopped"
}

function Read-LocalEnvironment {
    param([string]$Root)

    $envFile = Join-Path $Root ".env"
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
        Fail-Check "local environment configuration is missing"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$name] = $value
        }
    }
    return $values
}

function Test-PortFree {
    param([int]$Port)

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.ExclusiveAddressUse = $true
    try {
        $listener.Start()
        return $true
    }
    catch [System.Net.Sockets.SocketException] {
        return $false
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Assert-PortArguments {
    $parsedApi = 0
    $parsedFrontend = 0
    if (-not [int]::TryParse([string]$ApiPort, [ref]$parsedApi) -or -not [int]::TryParse([string]$FrontendPort, [ref]$parsedFrontend)) {
        Fail-Check "ports must be integers between 1024 and 65535"
    }
    $script:ApiPort = $parsedApi
    $script:FrontendPort = $parsedFrontend
    if ($ApiPort -lt 1024 -or $ApiPort -gt 65535 -or $FrontendPort -lt 1024 -or $FrontendPort -gt 65535) {
        Fail-Check "ports must be between 1024 and 65535"
    }
    if ($ApiPort -eq $FrontendPort) {
        Fail-Check "API and frontend ports must be distinct"
    }
    if (-not (Test-PortFree -Port $ApiPort)) {
        Fail-Check "API port $ApiPort is occupied or unavailable"
    }
    if (-not (Test-PortFree -Port $FrontendPort)) {
        Fail-Check "frontend port $FrontendPort is occupied or unavailable"
    }
}

function Get-CommandPath {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }
    return $null
}

function New-SafeFrontendDistDir {
    $suffix = [guid]::NewGuid().ToString("N").Substring(0, 12)
    $distDir = ".next-safeanes-launcher-$suffix"
    if ($distDir -cnotmatch '^\.next-safeanes-[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') {
        Fail-Check "launcher generated an invalid Next output directory"
    }
    return $distDir
}

function Start-ManagedProcess {
    param(
        [string]$FileName,
        [string]$Arguments,
        [hashtable]$Environment
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FileName
    $startInfo.Arguments = $Arguments
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    # Do not attach PowerShell scriptblocks to .NET async output events. Those
    # callbacks execute on thread-pool threads without a PowerShell runspace
    # and can terminate the launcher with PSInvalidOperationException. The
    # child commands below redirect their own output to NUL, keeping this
    # verification command silent and preventing pipe back-pressure.
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false

    $startInfo.EnvironmentVariables.Clear()
    foreach ($entry in (Get-RequiredWindowsRuntimeEnvironment).GetEnumerator()) {
        $startInfo.EnvironmentVariables[$entry.Key] = [string]$entry.Value
    }
    foreach ($entry in $Environment.GetEnumerator()) {
        $startInfo.EnvironmentVariables[$entry.Key] = [string]$entry.Value
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $process.EnableRaisingEvents = $true
    if (-not $process.Start()) {
        Fail-Check "could not start a required local service"
    }
    $null = $startedProcesses.Add($process)
    return $process
}

function Read-HttpResponse {
    param(
        [string]$Uri,
        [string]$BearerToken
    )

    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = "GET"
    $request.Timeout = 3000
    $request.ReadWriteTimeout = 3000
    $request.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
    if (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
        $request.Headers["Authorization"] = "Bearer $BearerToken"
    }

    try {
        $response = [System.Net.HttpWebResponse]$request.GetResponse()
        $statusCode = [int]$response.StatusCode
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            try {
                $body = $reader.ReadToEnd()
            }
            finally {
                $reader.Dispose()
            }
        }
        finally {
            $response.Dispose()
        }
        return [pscustomobject]@{
            StatusCode = $statusCode
            Body = $body
            Json = Convert-JsonSafely -Body $body
        }
    }
    catch [System.Net.WebException] {
        $errorResponse = $_.Exception.Response
        if (-not $errorResponse) {
            return [pscustomobject]@{ StatusCode = 0; Body = ""; Json = $null }
        }
        try {
            $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
            try {
                $body = $reader.ReadToEnd()
            }
            finally {
                $reader.Dispose()
            }
            $statusCode = [int]([System.Net.HttpWebResponse]$errorResponse).StatusCode
        }
        finally {
            $errorResponse.Dispose()
        }
        return [pscustomobject]@{
            StatusCode = $statusCode
            Body = $body
            Json = Convert-JsonSafely -Body $body
        }
    }
}

function Convert-JsonSafely {
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($Body)) {
        return $null
    }
    try {
        return $Body | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Wait-ForHttp {
    param(
        [string]$Uri,
        [string]$BearerToken,
        [int]$Timeout,
        [scriptblock]$Accept
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($Timeout)
    do {
        $response = Read-HttpResponse -Uri $Uri -BearerToken $BearerToken
        if (& $Accept $response) {
            return $response
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)

    return $null
}

function Stop-StartedProcessTree {
    $stopResults = New-Object System.Collections.ArrayList
    $exitCodes = New-Object System.Collections.ArrayList
    foreach ($process in @($startedProcesses)) {
        if ($process) {
            $stopped = Stop-ExactProcessTree -RootProcessId $process.Id -WaitSeconds 10
            $null = $stopResults.Add([bool]$stopped)
            $process.WaitForExit(5000) | Out-Null
            if ($process.HasExited) { $null = $exitCodes.Add([int]$process.ExitCode) }
            $process.Dispose()
        }
    }
    return (New-ProcessCleanupSummary -ProcessStopped @($stopResults.ToArray()) -ExitCodes @($exitCodes.ToArray()))
}

try {
    if ($CaseId -notmatch '^[1-9][0-9]*$') {
        Fail-Check "case ID must be a positive integer"
    }
    $parsedTimeout = 0
    if (-not [int]::TryParse([string]$TimeoutSeconds, [ref]$parsedTimeout)) { Fail-Check "timeout must be an integer between 5 and 300 seconds" }
    $TimeoutSeconds = $parsedTimeout
    if ($TimeoutSeconds -lt 5 -or $TimeoutSeconds -gt 300) { Fail-Check "timeout must be between 5 and 300 seconds" }
    Assert-PortArguments
    $localEnvironment = Read-LocalEnvironment -Root $repoRoot
    try {
        $apiToken = Get-ValidatedApiToken -Values $localEnvironment
    }
    catch {
        Fail-Check "backend/proxy API token configuration does not match"
    }

    if ($DryRun) {
        Write-Output "SAFEANES FULLSTACK CHECK (DRY RUN)"
        Write-Output "Case: $CaseId"
        Write-Output "API port: $ApiPort"
        Write-Output "Frontend port: $FrontendPort"
        Write-Output "Port validation: PASS"
        Write-Output "Integration tests: $(if ($RunIntegrationTests) { 'OPT-IN' } else { 'SKIPPED' })"
        Write-Output "Visual tests: $(if ($RunVisualTests) { 'OPT-IN' } else { 'SKIPPED' })"
        Write-Output "Waveform profile: $(if ($RunWaveformProfile) { 'OPT-IN' } else { 'SKIPPED' })"
        Write-Output "Children started: NO"
        exit 0
    }

    $venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython -PathType Leaf) {
        $python = $venvPython
    }
    else {
        $python = Get-CommandPath -Names @("python.exe", "python")
    }
    if ([string]::IsNullOrWhiteSpace($python)) {
        Fail-Check "Python was not found on PATH"
    }
    $cmd = Get-CommandPath -Names @("cmd.exe")
    if ([string]::IsNullOrWhiteSpace($cmd)) {
        Fail-Check "Windows command host was not found"
    }
    $npm = Get-CommandPath -Names @("npm.cmd", "npm")
    if ([string]::IsNullOrWhiteSpace($npm)) {
        Fail-Check "npm was not found on PATH"
    }

    $backendEnvironment = New-StrictChildEnvironment `
        -Values $localEnvironment `
        -AllowedNames @(
            "SAFEANES_ALLOWED_HOSTS", "SAFEANES_API_TOKEN", "SAFEANES_APP_MODE", "SAFEANES_BUILD_ID",
            "SAFEANES_DATA_ROOT", "SAFEANES_DEVICE", "SAFEANES_ENV", "SAFEANES_LOG_LEVEL",
            "SAFEANES_MAX_SAMPLES", "SAFEANES_MAX_SIGNAL_RANGE_SECONDS", "SAFEANES_MAX_WAVEFORM_RANGE_SECONDS",
            "SAFEANES_MODEL_ROOT", "SAFEANES_MODEL_SERIES_CACHE_ENTRIES", "SAFEANES_RUNTIME_DEVICE",
            "SAFEANES_SIGNAL_FILE_CACHE_ENTRIES", "MODEL_REGISTRY_PATH", "UC04_MODEL_PATH", "UC05_MODEL_PATH"
        ) `
        -Overrides @{
            PYTHONPATH = $repoRoot
            SAFEANES_CORS_ORIGINS = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort"
        }

    $launcherDistDir = New-SafeFrontendDistDir
    $ownedFrontendTsconfigPath = Get-SafeFrontendTsconfigPath -DistDir $launcherDistDir
    $frontendEnvironment = New-StrictChildEnvironment `
        -Values $localEnvironment `
        -AllowedNames @("SAFEANES_APP_MODE", "SAFEANES_BACKEND_API_TOKEN", "SAFEANES_ENV", "SAFEANES_LOG_LEVEL") `
        -Overrides @{
            SAFEANES_API_URL = "http://127.0.0.1:$ApiPort"
            SAFEANES_BACKEND_URL = "http://127.0.0.1:$ApiPort"
            SAFEANES_NEXT_DIST_DIR = $launcherDistDir
            SAFEANES_TSCONFIG_PATH = $ownedFrontendTsconfigPath
        }
    $ownedFrontendDistDir = [string]$frontendEnvironment["SAFEANES_NEXT_DIST_DIR"]
    if (-not (Copy-SafeFrontendTsconfig -Root $repoRoot -RelativeName $ownedFrontendTsconfigPath)) {
        Fail-Check "could not create the isolated launcher TypeScript config"
    }

    # Command paths are quoted; user-controlled case/port values never become
    # shell strings. Redirect child output to NUL so paths/secrets cannot leak
    # through this verifier or accumulate in an unbounded output buffer.
    $backendArguments = New-CmdCommandArguments `
        -ExecutablePath $python `
        -CommandLine ("-m uvicorn backend.app.main:app --host 127.0.0.1 --port $ApiPort --log-config backend/logging.json --no-access-log") `
        -RedirectPath "NUL"
    $backend = Start-ManagedProcess -FileName $cmd -Arguments $backendArguments -Environment $backendEnvironment

    $apiBase = "http://127.0.0.1:$ApiPort"
    $live = Wait-ForHttp `
        -Uri "$apiBase/api/v1/health/live" `
        -BearerToken $apiToken `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) $response.StatusCode -eq 200 -and $null -ne $response.Json }
    if (-not $live) {
        if ($backend.HasExited) {
            Fail-Check "backend exited before the liveness check completed"
        }
        Fail-Check "backend liveness endpoint did not respond in time"
    }
    if ($live.Json.service_name -ne "safeanes-backend") {
        Fail-Check "liveness endpoint did not identify safeanes-backend"
    }
    if ([string]$live.Json.build_id -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$') {
        Fail-Check "liveness endpoint did not provide a build ID"
    }

    $frontendArguments = New-CmdCommandArguments `
        -ExecutablePath $npm `
        -CommandLine ("run dev -- --hostname 127.0.0.1 --port $FrontendPort") `
        -RedirectPath "NUL"
    $frontend = Start-ManagedProcess -FileName $cmd -Arguments $frontendArguments -Environment $frontendEnvironment
    $frontendResponse = Wait-ForHttp `
        -Uri "http://127.0.0.1:$FrontendPort/safeanes" `
        -BearerToken "" `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) $response.StatusCode -ge 200 -and $response.StatusCode -lt 300 }
    if (-not $frontendResponse) {
        if ($frontend.HasExited) {
            Fail-Check "frontend exited before its route became available"
        }
        Fail-Check "frontend route did not respond in time"
    }

    $frontendProxy = Wait-ForHttp `
        -Uri "http://127.0.0.1:$FrontendPort/api/backend/v1/health/live" `
        -BearerToken "" `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) $response.StatusCode -gt 0 -and $null -ne $response.Json }
    if (-not $frontendProxy) {
        Fail-Check "frontend backend proxy did not respond in time"
    }
    if ($frontendProxy.StatusCode -ne 200) {
        Fail-Check "frontend backend proxy health check failed"
    }
    if ($frontendProxy.Json.service_name -ne "safeanes-backend" -or [string]$frontendProxy.Json.build_id -cne [string]$live.Json.build_id) {
        Fail-Check "frontend backend proxy identity did not match the backend"
    }

    $ready = Wait-ForHttp `
        -Uri "$apiBase/api/v1/health/ready" `
        -BearerToken $apiToken `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) Test-ReadinessResponse -Response $response }
    if (-not $ready) {
        # Preserve the final component statuses in a valid not-ready response
        # so the normal summary can explain whether cache or model startup is
        # still pending. A 503 never satisfies the readiness polling gate.
        $ready = Read-HttpResponse -Uri "$apiBase/api/v1/health/ready" -BearerToken $apiToken
    }
    $models = Wait-ForHttp `
        -Uri "$apiBase/api/v1/models" `
        -BearerToken $apiToken `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) $response.StatusCode -eq 200 -and $null -ne $response.Json -and @($response.Json.models).Count -gt 0 }
    if (-not $models) {
        Fail-Check "models endpoint returned no JSON response"
    }
    $cases = Wait-ForHttp `
        -Uri "$apiBase/api/v1/cases" `
        -BearerToken $apiToken `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) $response.StatusCode -eq 200 -and $null -ne $response.Json -and @($response.Json.cases | Where-Object { [string]$_.case_id -eq $CaseId }).Count -gt 0 }
    if (-not $cases) {
        Fail-Check "cases endpoint returned no JSON response"
    }

    $selectedCase = @($cases.Json.cases | Where-Object { [string]$_.case_id -eq $CaseId }) | Select-Object -First 1
    if (-not $selectedCase) {
        Fail-Check "selected case is not present in the local catalog"
    }
    $caseDetails = Wait-ForHttp `
        -Uri "$apiBase/api/v1/cases/$CaseId" `
        -BearerToken $apiToken `
        -Timeout $TimeoutSeconds `
        -Accept { param($response) $response.StatusCode -eq 200 -and $null -ne $response.Json -and [string]$response.Json.case_id -eq $CaseId }
    if (-not $caseDetails) {
        Fail-Check "selected case details were not available"
    }

    # Validate the small public status vocabulary before printing API content.
    # Never echo arbitrary payloads, errors, filesystem paths, or headers.
    if ($ready.StatusCode -notin @(200, 503) -or $ready.Json.status -notin @("ready", "not_ready")) {
        Fail-Check "readiness endpoint returned an unexpected response"
    }
    $statusValues = @($ready.Json.components.case_catalog, $ready.Json.components.dataset_cache, $ready.Json.components.uc04_model, $ready.Json.components.uc05_model, $selectedCase.cache_status, $caseDetails.Json.raw_file.cache_status)
    foreach ($status in $statusValues) {
        if ([string]$status -cnotmatch '^[A-Z][A-Z0-9_]{0,63}$') { Fail-Check "API status contract is invalid" }
    }
    if ($ready.Json.ready -isnot [bool] -or $selectedCase.uc04_eligible -isnot [bool] -or $selectedCase.uc05_eligible -isnot [bool] -or [string]$ready.Json.components.cached_case_count -notmatch '^[0-9]+$') {
        Fail-Check "API readiness/eligibility contract is invalid"
    }
    $expectedModels = @("SafeAnes-UC04-HypoFormer", "SafeAnes-UC05-RespFormer")
    if (@($models.Json.models).Count -ne 2) { Fail-Check "API model status contract is incomplete" }
    if (@($models.Json.models.model_id | Select-Object -Unique).Count -ne 2) { Fail-Check "API model status contract contains duplicate identities" }
    foreach ($model in @($models.Json.models)) {
        if ($model.model_id -notin $expectedModels -or [string]$model.readiness_status -cnotmatch '^[A-Z][A-Z0-9_]{0,63}$' -or $model.loaded -isnot [bool]) { Fail-Check "API model status contract is invalid" }
    }
    Write-Output "SAFEANES FULLSTACK CHECK"
    Write-Output "Backend: UP service=safeanes-backend build_id=$([string]$live.Json.build_id)"
    Write-Output "Frontend: UP http_status=$($frontendResponse.StatusCode)"
    Write-Output "Case: $CaseId"
    Write-Output "Readiness: HTTP $($ready.StatusCode) status=$([string]$ready.Json.status) ready=$([string]$ready.Json.ready)"
    Write-Output "Catalog: $([string]$ready.Json.components.case_catalog)"
    Write-Output "Dataset cache: $([string]$ready.Json.components.dataset_cache) cached_cases=$([string]$ready.Json.components.cached_case_count)"
    Write-Output "UC04 model: $([string]$ready.Json.components.uc04_model)"
    Write-Output "UC05 model: $([string]$ready.Json.components.uc05_model)"
    foreach ($model in @($models.Json.models)) {
        Write-Output "Model $([string]$model.model_id): readiness=$([string]$model.readiness_status) loaded=$([string]$model.loaded)"
    }
    Write-Output "Case cache: $([string]$selectedCase.cache_status)"
    Write-Output "Case UC04 eligibility: $([string]$selectedCase.uc04_eligible)"
    Write-Output "Case UC05 eligibility: $([string]$selectedCase.uc05_eligible)"
    Write-Output "Case raw cache: $([string]$caseDetails.Json.raw_file.cache_status)"

    if ($ready.StatusCode -ne 200 -or $ready.Json.ready -ne $true) {
        Fail-Check "readiness gate is not ready; inspect the separate catalog/cache/model statuses above"
    }
    if ($selectedCase.cache_status -ne "READY" -or $caseDetails.Json.raw_file.cache_status -ne "READY") {
        Fail-Check "selected case cache is not ready"
    }

    if ($RunIntegrationTests) {
        $npx = Get-CommandPath -Names @("npx.cmd", "npx")
        if ([string]::IsNullOrWhiteSpace($npx)) {
            Fail-Check "npx was not found for the opt-in integration suite"
        }

        $integrationArtifactDir = Join-Path $repoRoot "test-results\integration"
        New-Item -ItemType Directory -Path $integrationArtifactDir -Force | Out-Null
        $integrationLog = Join-Path $integrationArtifactDir "launcher-output.log"
        $integrationEnvironment = New-StrictChildEnvironment `
            -Values @{} `
            -AllowedNames @() `
            -Overrides @{
                PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$FrontendPort"
                SAFEANES_API_BASE_URL = "http://127.0.0.1:$ApiPort/api/v1"
                SAFEANES_API_TOKEN = $apiToken
            }
        $integrationArguments = New-CmdCommandArguments `
            -ExecutablePath $npx `
            -CommandLine 'playwright test --config tests/integration/playwright.config.ts' `
            -RedirectPath $integrationLog
        $integration = Start-ManagedProcess -FileName $cmd -Arguments $integrationArguments -Environment $integrationEnvironment
        $integrationWaitSeconds = Get-BrowserSuiteTimeoutSeconds -StartupTimeoutSeconds ([int]$TimeoutSeconds)
        if (-not $integration.WaitForExit($integrationWaitSeconds * 1000)) {
            Fail-Check "integration suite timed out; artifacts were preserved"
        }
        if ($integration.ExitCode -ne 0) {
            Fail-Check "integration suite failed; artifacts were preserved"
        }
        Write-Output "Integration: PASS artifacts=test-results/integration"
    }

    if ($RunVisualTests) {
        $npm = Get-CommandPath -Names @("npm.cmd", "npm")
        if ([string]::IsNullOrWhiteSpace($npm)) {
            Fail-Check "npm was not found for the opt-in visual suite"
        }

        $visualArtifactDir = Join-Path $repoRoot "test-results\visual"
        New-Item -ItemType Directory -Path $visualArtifactDir -Force | Out-Null
        $visualLog = Join-Path $visualArtifactDir "launcher-output.log"
        $visualEnvironment = New-StrictChildEnvironment `
            -Values @{} `
            -AllowedNames @() `
            -Overrides @{
                PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$FrontendPort"
            }
        $visualArguments = New-CmdCommandArguments `
            -ExecutablePath $npm `
            -CommandLine 'run test:visual' `
            -RedirectPath $visualLog
        $visual = Start-ManagedProcess -FileName $cmd -Arguments $visualArguments -Environment $visualEnvironment
        $visualWaitSeconds = Get-BrowserSuiteTimeoutSeconds `
            -StartupTimeoutSeconds ([int]$TimeoutSeconds) `
            -Visual
        if (-not $visual.WaitForExit($visualWaitSeconds * 1000)) {
            Fail-Check "visual suite timed out; artifacts were preserved"
        }
        if ($visual.ExitCode -ne 0) {
            Fail-Check "visual suite failed; artifacts were preserved"
        }
        Write-Output "Visual: PASS artifacts=test-results/visual"
    }

    if ($RunWaveformProfile) {
        $npm = Get-CommandPath -Names @("npm.cmd", "npm")
        if ([string]::IsNullOrWhiteSpace($npm)) {
            Fail-Check "npm was not found for the waveform profile"
        }

        $profileArtifactDir = Join-Path $repoRoot "test-results\waveform-performance"
        New-Item -ItemType Directory -Path $profileArtifactDir -Force | Out-Null
        $profileLog = Join-Path $profileArtifactDir "launcher-output.log"
        $profileEnvironment = New-StrictChildEnvironment `
            -Values @{} `
            -AllowedNames @() `
            -Overrides @{
                PLAYWRIGHT_BASE_URL = "http://127.0.0.1:$FrontendPort"
                SAFEANES_PROFILE_CASE_ID = [string]$CaseId
            }
        $profileArguments = New-CmdCommandArguments `
            -ExecutablePath $npm `
            -CommandLine 'run test:waveform-profile' `
            -RedirectPath $profileLog
        $profile = Start-ManagedProcess -FileName $cmd -Arguments $profileArguments -Environment $profileEnvironment
        $profileWaitSeconds = Get-BrowserSuiteTimeoutSeconds `
            -StartupTimeoutSeconds ([int]$TimeoutSeconds) `
            -Visual
        if (-not $profile.WaitForExit($profileWaitSeconds * 1000)) {
            Fail-Check "waveform profile timed out; artifacts were preserved"
        }
        if ($profile.ExitCode -ne 0) {
            Fail-Check "waveform profile failed; artifacts were preserved"
        }
        Write-Output "Waveform profile: PASS artifacts=test-results/waveform-performance"
    }
}
catch {
    Write-Output "FULLSTACK CHECK FAILED: $script:failureMessage"
    if ($startedProcesses.Count -eq 0) { Write-Output "Children started: NO" }
    exit 1
}
finally {
    $cleanupSummary = Stop-StartedProcessTree
    foreach ($exitCode in @($cleanupSummary.ExitCodes)) {
        Write-Output "Owned child exit_code=$exitCode"
    }
    $processesStopped = [bool]$cleanupSummary.AllStopped
    $distDirRemoved = $true
    $tsconfigRemoved = $true
    if ($ownedFrontendDistDir) {
        if ($processesStopped) {
            $distDirRemoved = Remove-SafeFrontendDistDir -Root $repoRoot -RelativeName $ownedFrontendDistDir
        }
        else {
            $distDirRemoved = $false
        }
    }
    if ($ownedFrontendTsconfigPath) {
        if ($processesStopped) {
            $tsconfigRemoved = Remove-SafeFrontendTsconfig -Root $repoRoot -RelativeName $ownedFrontendTsconfigPath
        }
        else {
            $tsconfigRemoved = $false
        }
    }
    if (-not $processesStopped -or -not $distDirRemoved -or -not $tsconfigRemoved) {
        Write-Output "FULLSTACK CHECK FAILED: owned process or frontend output cleanup incomplete"
        exit 1
    }
}
