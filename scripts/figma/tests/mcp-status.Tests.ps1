$script:StatusModulePath = Join-Path $PSScriptRoot '..\FigmaMcpStatus.psm1'
if (Test-Path -LiteralPath $script:StatusModulePath) {
    Import-Module $script:StatusModulePath -Force
}

Describe 'ConvertTo-SafeFigmaMcpStatus' {
    It 'recognizes the official endpoint and does not mistake not-logged-in for authenticated' {
        $config = @(
            @{
                name = 'figma'
                enabled = $true
                auth_status = 'not_logged_in'
                transport = @{ type = 'streamable_http'; url = 'https://mcp.figma.com/mcp' }
            }
        ) | ConvertTo-Json -Depth 8 -Compress

        $status = ConvertTo-SafeFigmaMcpStatus -ConfigJson $config

        $status.registered | Should Be $true
        $status.endpoint | Should Be 'OFFICIAL_FIGMA_MCP'
        $status.authenticationStatus | Should Be 'NOT_AUTHENTICATED'
    }

    It 'never includes token configuration values in its output' {
        $config = @(
            @{
                name = 'figma'
                enabled = $true
                auth_status = 'logged_in'
                transport = @{ type = 'streamable_http'; url = 'https://mcp.figma.com/mcp'; bearer_token = 'sensitive-placeholder' }
            }
        ) | ConvertTo-Json -Depth 8 -Compress

        $status = ConvertTo-SafeFigmaMcpStatus -ConfigJson $config

        $status.authenticationStatus | Should Be 'AUTHENTICATED'
        ($status | ConvertTo-Json -Compress) | Should Not Match 'sensitive-placeholder|bearer_token'
    }

    It 'returns a safe not-registered state for an absent Figma server' {
        $status = ConvertTo-SafeFigmaMcpStatus -ConfigJson '[]'

        $status.registered | Should Be $false
        $status.endpoint | Should Be 'UNKNOWN'
    }
}
