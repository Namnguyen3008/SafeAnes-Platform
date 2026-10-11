# SafeAnes Figma utilities

Run these scripts from PowerShell in the SafeAnes project root. They report only sanitized status and never print credential values.

```powershell
.\scripts\figma\validate-vault.ps1
.\scripts\figma\check-connection.ps1
.\scripts\figma\check-auth.ps1
.\scripts\figma\test-design-access.ps1
.\scripts\figma\report-status.ps1
```

`test-design-access.ps1 -FileUrl <Figma file URL>` validates the URL shape. Actual node access must be checked through the authenticated Figma MCP `get_design_context` tool because the Codex CLI status command does not invoke MCP tools.

The vault validator reads only `accounts[*].keys.figma`. It deliberately does not repair malformed strings or test them by sending them to a service. Codex-managed MCP OAuth is authorized in the browser and is not loaded from the vault.
