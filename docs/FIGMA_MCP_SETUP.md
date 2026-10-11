# Figma MCP setup for SafeAnes

## Current configuration

The official Figma remote MCP server is registered in Codex CLI as `figma`, enabled, and pointed at `https://mcp.figma.com/mcp`. The server currently reports `NOT_AUTHENTICATED`. A separate Codex Figma app connector responds to its identity capability check; that does not authenticate the CLI server.

The vault validator found ten `accounts[*].keys.figma` entries. All ten are malformed embedded JSON strings. No credential was repaired, copied, or sent to Figma. No REST adapter is configured because the vault did not yield a usable REST PAT. See [FIGMA_AUTH_STATUS.md](./FIGMA_AUTH_STATUS.md).

## Complete official OAuth authorization

The OAuth request started when this server was registered. Complete the pending browser authorization from the Codex MCP setup output. Before selecting **Allow**, confirm the account shown is the intended account. If it is a different account, cancel the flow; do not switch identities automatically.

For a new Codex setup where no Figma server is registered, the supported commands are:

```powershell
codex mcp add figma --url https://mcp.figma.com/mcp
codex mcp login figma
codex mcp list
```

Do not repeat `mcp add` on this machine: the server already exists. Once the pending consent is completed, verify with:

```powershell
.\scripts\figma\check-connection.ps1
.\scripts\figma\check-auth.ps1
```

The OAuth flow and resulting session are managed by Codex. Do not put OAuth values in `.env`, application code, or the design cache.

## Account and design access

The already-connected Codex Figma app connector returned a successful identity capability response. Its account details are omitted from local reports. The CLI-managed OAuth identity cannot be compared until its browser flow is authorized. No Figma file URL or node ID is in the SafeAnes project, so file-level permissions and reusable libraries remain unverified.

After authentication, use the Figma MCP tools on an explicitly selected SafeAnes file: inspect metadata, choose relevant frame/node IDs, then retrieve only the design context and components needed. Follow the order: existing SafeAnes React components, authorized Figma library components, existing shadcn/Radix primitives, 21st MCP primitives where needed, then custom UI. Do not fetch a full file repeatedly or replace clinical-domain components with generic dashboard templates.

`test-design-access.ps1` checks a supplied file URL's shape and CLI auth status. The Codex CLI exposes status but not a command for invoking a Figma MCP tool, so the script does not claim file access. Confirm actual access by calling `get_design_context` on an authorized node through the authenticated Figma MCP connector.

## Optional REST API

No REST PAT was recognized in the vault, so no REST adapter is enabled. A REST PAT is distinct from MCP OAuth and must not be substituted for it. If a REST integration is added later, keep its token in Windows Credential Manager or another OS-protected secret store, use the REST API's `X-Figma-Token` header server-side, and never expose it to browser JavaScript or a `NEXT_PUBLIC_*` variable.

## Local utilities

See [scripts/figma/README.md](../scripts/figma/README.md) for the sanitized PowerShell utilities. Run the Pester tests with:

```powershell
$figmaTests = @(
  '.\scripts\figma\tests\validate-vault.Tests.ps1',
  '.\scripts\figma\tests\mcp-status.Tests.ps1'
)
Invoke-Pester -Script $figmaTests -PassThru
```

## Official references

- [Figma remote MCP installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
- [Figma MCP access and rate limits](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)
- [Figma REST authentication](https://developers.figma.com/docs/rest-api/authentication/)
- [Figma REST personal access tokens](https://developers.figma.com/docs/rest-api/personal-access-tokens/)
