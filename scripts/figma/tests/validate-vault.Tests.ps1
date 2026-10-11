$script:ValidatorPath = Join-Path $PSScriptRoot '..\validate-vault.ps1'
if (Test-Path -LiteralPath $script:ValidatorPath) {
    . $script:ValidatorPath
}

Describe 'Get-FigmaVaultCredentialReport' {
    BeforeEach {
        $script:FixturePath = Join-Path $TestDrive 'vault.json'
    }

    It 'classifies only Figma entries and never returns credential values' {
        $fixture = @{
            accounts = @(
                @{ keys = @{ figma = '' ; unrelated = 'must-not-be-read' } },
                @{ keys = @{ figma = 'opaque-value' } }
            )
        } | ConvertTo-Json -Depth 8
        Set-Content -LiteralPath $script:FixturePath -Value $fixture -Encoding UTF8

        $report = @(Get-FigmaVaultCredentialReport -Path $script:FixturePath)

        $report.Count | Should Be 2
        $report[0].formatStatus | Should Be 'EMPTY'
        $report[1].formatStatus | Should Be 'UNKNOWN'
        ($report | ConvertTo-Json -Depth 5) | Should Not Match 'opaque-value|must-not-be-read'
    }

    It 'marks malformed embedded JSON without attempting to repair it' {
        $fixture = @{ accounts = @(@{ keys = @{ figma = '{unfinished' } }) } | ConvertTo-Json -Depth 8
        Set-Content -LiteralPath $script:FixturePath -Value $fixture -Encoding UTF8

        $report = @(Get-FigmaVaultCredentialReport -Path $script:FixturePath)

        $report[0].formatStatus | Should Be 'MALFORMED'
        $report[0].validationStatus | Should Be 'NOT_VALIDATED'
    }

    It 'recognizes a structurally complete OAuth token bundle as format-only' {
        $oauthBundle = @{
            access_token = 'test-access-placeholder'
            refresh_token = 'test-refresh-placeholder'
            token_type = 'Bearer'
        } | ConvertTo-Json -Compress
        $fixture = @{ accounts = @(@{ keys = @{ figma = $oauthBundle } }) } | ConvertTo-Json -Depth 8
        Set-Content -LiteralPath $script:FixturePath -Value $fixture -Encoding UTF8

        $report = @(Get-FigmaVaultCredentialReport -Path $script:FixturePath)

        $report[0].formatStatus | Should Be 'VALID_FORMAT'
        $report[0].authenticationMethod | Should Be 'MCP_OAUTH_BUNDLE'
        $report[0].validationStatus | Should Be 'NOT_AUTHENTICATED'
    }
}
