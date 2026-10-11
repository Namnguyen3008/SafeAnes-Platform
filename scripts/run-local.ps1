param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("backend", "frontend")]
    [string]$Service,

    [Parameter()]
    [ValidateSet("dev", "prod")]
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing .env. Run .\scripts\initialize-local.ps1 first."
}

foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Set-Location $repoRoot
if ($Service -eq "backend") {
    $env:PYTHONPATH = $repoRoot
    $venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
    $pythonBin = if (Test-Path -LiteralPath $venvPython -PathType Leaf) { $venvPython } else { "python" }
    & $pythonBin -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --env-file .env --log-config backend/logging.json --no-access-log
} else {
    if ($Mode -eq "prod") {
        if (-not (Test-Path (Join-Path $repoRoot ".next"))) {
            npm run build
        } else {
            node (Join-Path $repoRoot "scripts\copy-standalone-assets.cjs")
        }
        npm run start
    } else {
        npm run dev
    }
}
