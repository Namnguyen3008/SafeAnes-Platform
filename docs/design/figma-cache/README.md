# SafeAnes Figma Context Cache

This cache stores non-secret, derived design context so Figma MCP requests can be targeted and deduplicated. It contains no credentials, screenshots, or copied private design assets.

## Current verified state

- Figma file: [SafeAnes — Unified Clinical Workstation](https://www.figma.com/design/bAkYMkjbAddPKG70KRzi5K)
- File key: `bAkYMkjbAddPKG70KRzi5K`
- Last successful metadata result recorded in local design notes: one empty `Page 1` (`0:1`, no children).
- Exact frame/component node IDs: none verified.
- Code Connect mappings: none published or activated.
- Library candidates: prior search notes contain opaque component asset keys only; no file URLs, node IDs, screenshots, design context, or reuse licenses were verified for those candidates.
- Fresh Figma requests: deferred. The local notes record a Figma MCP Starter-plan tool-call-limit response during the prior library/file inventory work. No `Retry-After` value or reset time was recorded.

The Figma file state may have changed since the recorded metadata result. Treat the empty-page result as historical evidence, not a claim about current contents.

## Reused local references

The following project documents are the source for cached SafeAnes decisions and must be rechecked if their contents change:

- `../SAFEANES_WORKSPACE_DESIGN_PROPOSALS.md` — proposed workstation hierarchy and layout constraints.
- `../SAFEANES_DESIGN_SYSTEM.md` — existing SafeAnes tokens and shared primitive contract.
- `../TEMPLATE_DISCOVERY.md` — prior library search outcomes and explicit evidence limits.
- `../FIGMA_CODE_CONNECT_MAP.md` — component mapping status.
- `../COMPONENT_REUSE_PLAN.md` — code-first reuse decisions.
- `../SAFEANES_UI_AUDIT.md` and `../VISUAL_BASELINES.md` — observed application issues and baseline context.

## Cache rules

1. Reuse local SafeAnes decisions without another Figma request while they remain unchanged.
2. Do not convert opaque library asset keys into node IDs or guessed URLs.
3. When MCP access is available, inspect file metadata once, select exact node IDs, then fetch only the grouped context needed for the design task.
4. Fetch screenshots only when comparing rendered appearance or a specific visual state.
5. Record the source node, retrieval date, relevant fields, and local-document version for every new cache entry.
6. Respect any provider retry guidance. With no retry interval available, defer the request instead of polling.
7. Never cache authentication material, request headers, private screenshots, or clinical/patient data.

See [`request-queue.md`](./request-queue.md) for grouped pending requests and [`reference-index.json`](./reference-index.json) for machine-readable verified references.
