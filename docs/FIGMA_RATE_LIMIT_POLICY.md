# Figma request and rate-limit policy

SafeAnes uses Codex's managed Figma MCP OAuth for MCP operations. No direct REST client or REST token is configured, so REST retry behavior is documented for a future server-side adapter and is not represented as currently running code.

## Request policy

1. Select the target Figma file and relevant node IDs before requesting design context.
2. Read metadata once, then request only the selected nodes and component context needed for the current implementation.
3. Reuse stable, non-secret metadata from `docs/design/figma-cache/`. Cache keys should include the file ID, node ID, and a source version or last-modified value when available. If source version metadata is unavailable, require an explicit refresh rather than silently treating the cache as current.
4. Retrieve screenshots only for visual comparison or when structure alone is insufficient.
5. Do not issue duplicate whole-file reads, parallel retries, or account/credential rotation to work around plan limits.

## HTTP 429 handling for any future REST adapter

- Stop new duplicate requests for the affected resource.
- Read `Retry-After` and wait no less than the provider-specified delay. If it is an HTTP date, compute the remaining delay against UTC.
- If the header is absent or invalid, do not retry immediately; surface the rate-limited status for later retry.
- Queue deferred work and serve valid cached design context while waiting.
- Retry a bounded number of times only after the permitted delay. Persistent 429 responses become a visible quota limitation.
- Preserve and record only non-secret rate-limit metadata, such as status and retry delay. Never log request authorization headers.

Figma REST responses document `Retry-After` and rate-limit metadata such as `X-Figma-Plan-Tier` and `X-Figma-Rate-Limit-Type`. Figma MCP quotas are account/seat/plan dependent; current official documentation lists a small monthly MCP read allowance for Starter View/Collab seats. These limits can change, so consult the linked provider documentation before scheduling bulk reads.

References: [Figma MCP access and rate limits](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/) · [Figma REST rate limits](https://developers.figma.com/docs/rest-api/rate-limits/)
