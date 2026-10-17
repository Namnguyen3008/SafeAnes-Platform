param(
    [switch]$RequireRuntimeArtifacts
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env"
$templateFile = Join-Path $repoRoot ".env.example"

if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath $templateFile -Destination $envFile
    Write-Host "Created .env from .env.example. Edit model and data paths if they differ on this machine."
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$Matches[1]] = $value
    }
}

function Resolve-ConfiguredPath([string]$Value, [string]$Fallback) {
    $candidate = if ([string]::IsNullOrWhiteSpace($Value)) { $Fallback } else { $Value }
    if ([System.IO.Path]::IsPathRooted($candidate)) { return [System.IO.Path]::GetFullPath($candidate) }
    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $candidate))
}

$registryPath = Resolve-ConfiguredPath $values["MODEL_REGISTRY_PATH"] "backend/app/ml/registry/model_registry.json"
$registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
$modelRoot = Resolve-ConfiguredPath $values["SAFEANES_MODEL_ROOT"] "models"
$expected = @{
    UC04_MODEL_PATH = $registry.models.'SafeAnes-UC04-HypoFormer'
    UC05_MODEL_PATH = $registry.models.'SafeAnes-UC05-RespFormer'
}
$artifactsReady = $true
foreach ($key in @("UC04_MODEL_PATH", "UC05_MODEL_PATH")) {
    $entry = $expected[$key]
    $artifactPath = Resolve-ConfiguredPath $values[$key] (Join-Path $modelRoot $entry.artifact_path)
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
        Write-Warning "$key is missing. Registered artifact path: $($entry.artifact_path). Set SAFEANES_MODEL_ROOT to the model root containing that path, or set $key to the registered path."
        $artifactsReady = $false
        continue
    }
    $actualHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $entry.artifact_sha256.ToLowerInvariant()) {
        Write-Warning "$key failed its registered SHA-256 check for $($entry.artifact_path); restore the audited artifact before starting the backend."
        $artifactsReady = $false
        continue
    }
    foreach ($supportName in $entry.supporting_artifacts.PSObject.Properties.Name) {
        $supportPath = Join-Path (Split-Path $artifactPath -Parent) $supportName
        if (-not (Test-Path -LiteralPath $supportPath -PathType Leaf)) {
            Write-Warning "$key supporting artifact $supportName is missing."
            $artifactsReady = $false
            continue
        }
        $supportHash = (Get-FileHash -LiteralPath $supportPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($supportHash -ne $entry.supporting_artifacts.$supportName.ToLowerInvariant()) {
            Write-Warning "$key supporting artifact $supportName failed its registered SHA-256 check."
            $artifactsReady = $false
        }
    }
}

$dataRoot = Resolve-ConfiguredPath $values["SAFEANES_DATA_ROOT"] "backend/data"
$catalogPath = Join-Path $dataRoot "manifests/vitaldb_case_catalog.json"
$cachedCases = 0
if (Test-Path -LiteralPath $catalogPath -PathType Leaf) {
    $catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
    foreach ($case in $catalog.cases) {
        $caseId = [string]$case.case_id
        if ((Test-Path -LiteralPath (Join-Path $dataRoot "vitaldb/raw/$caseId.vital") -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $dataRoot "vitaldb/manifests/$caseId.json") -PathType Leaf)) {
            $cachedCases++
        }
    }
} else {
    Write-Warning "VitalDB case catalog is missing at the configured data root. No recordings are downloaded by this script."
}

Write-Host "Data cache: $cachedCases catalog cases have both a raw file and manifest."
Write-Host "Model artifacts: $(if ($artifactsReady) { 'registered checksums verified' } else { 'one or more models are not ready' })"
Write-Host "Local setup check complete. Start the API and Next.js app using docs/LOCAL_DEVELOPMENT.md."

if ($RequireRuntimeArtifacts -and (-not $artifactsReady -or $cachedCases -eq 0)) {
    throw "Required model artifacts or VitalDB cache are unavailable. Configure paths or ingest selected data, then rerun."
}
