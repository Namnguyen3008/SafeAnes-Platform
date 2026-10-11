# Targeted Figma MCP Request Queue

All items below are pending because no exact design frame or component node IDs are currently verified. Use the authenticated official Figma MCP session after access/quota is available. Do not issue repeated calls while the provider limit remains active.

## One-time discovery

1. Read metadata for the known SafeAnes Figma file once; determine whether the historical empty `Page 1` result is still current.
2. If pages or frames exist, use metadata to locate exact node IDs and names.
3. Stop if the file is still empty or access is denied. Do not infer missing frames from local proposals.

## Grouped context requests

| Priority | Design task | Retrieve together | Needed for |
|---|---|---|---|
| 1 | Global shell and navigation | Header, navigation, case context, source/replay controls, EN/VI control | Shell alignment and persistent workstation context |
| 2 | Shared primitives | Panels, badges, buttons, tabs, tables, toolbar, separators, variables | Reuse and token parity |
| 3 | Review overlays | Evidence inspector/drawer, dialogs, tooltip/popover, focus behavior | UC02 review and UC03 action flows |
| 4 | Alerts and statuses | Alert severity, quality, provenance, model availability, unavailable/loading states | Semantic consistency without changing clinical meaning |
| 5 | Clinical workspaces | Overview, UC01, UC02, UC03, UC04, UC05 frames as available | Module-specific layout verification |

For each task, request `get_design_context` only for selected exact nodes. Use `get_metadata` first when a response would otherwise require a whole-file context read. Fetch `get_screenshot` only for frames requiring actual visual comparison. Read variables once per relevant collection and reuse cached definitions until the source changes.

## Cache entry requirements

Each newly verified entry should record:

- Figma file URL and exact node ID.
- Node/component name and type returned by Figma.
- Retrieval timestamp and the MCP operation used.
- Only relevant layout properties, variables, variants, and interaction details.
- Corresponding SafeAnes component path and reuse decision.
- Whether a screenshot was captured for comparison.
- Any access, licensing, or permission limits.

Do not record raw MCP auth diagnostics, access tokens, headers, private screenshots, or patient data.
