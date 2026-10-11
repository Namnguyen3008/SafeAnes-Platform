# Figma authentication status

**Checked:** 2026-10-10

| Check | Result | Detail |
|---|---|---|
| Vault file | PASS | Present and valid outer JSON; only the Figma fields were inspected. |
| Figma vault entries | 10 entries | Sanitized aliases `figma-entry-01` through `figma-entry-10`. |
| Credential format | 10 `MALFORMED` | Each Figma value contains malformed embedded JSON. Values were not printed, repaired, or transmitted. |
| Credential authentication | NOT_VALIDATED | No entry qualifies as a supported credential format. |
| Figma REST PAT | NOT_FOUND | No usable PAT was identified; no REST adapter was configured. |
| Existing Codex Figma app connector | CAPABILITY_CHECK_PASS | `whoami` returned successfully; identity details are intentionally omitted. This is separate from CLI MCP OAuth. |
| Codex CLI `figma` server | REGISTERED / ENABLED | Uses the official `https://mcp.figma.com/mcp` endpoint. |
| Codex CLI OAuth | PENDING | `codex mcp list` reports `NOT_AUTHENTICATED`; the browser consent has not completed. |
| Account match for pending CLI flow | NOT_VERIFIED | Confirm the displayed account before consenting. No identity switch has been performed. |
| Figma file access | NOT_VERIFIED | No intended Figma file URL or node ID was found in the SafeAnes project. |

The connected Figma account context reports a Starter plan and View seat. The CLI OAuth identity has not yet been established, so this information is not treated as proof of CLI account identity or file permissions.

No email, token, OAuth URL, authorization header, or unrelated vault key is included in this report.
