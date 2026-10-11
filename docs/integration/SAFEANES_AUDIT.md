# SafeAnes Application Audit for Real-Model Integration

Audit date: 2026-10-09  
Target: C:\Users\Namdr\Downloads\SafeAnes  
Scope: frontend routes, shared simulation state, prediction consumers, data mocks, runtime dependencies and deployment shape. Application source was not modified.

## Existing application structure

SafeAnes is a Next.js App Router application using Next 15.1.7, React 19, and TypeScript 5.7.3. Its frontend dependencies do not include a Python bridge, inference client, database driver, or model runtime. The inspected package scripts include dev, build, start and lint.

Existing routes include:

- / and /safeanes
- /safeanes/case/[caseId] and its overview
- /situation, /record, /medications, /hemodynamics, /respiratory
- /data-integrity and /replay

All case workspace routes are organized under the dynamic case layout. EN/VI localization is already provided in the frontend.

## Shared state and replay

SimulationReplayContext.tsx mounts one SimulationEngine created from createFullCase() and keeps it at the case-layout level. The provider owns the playback ticker and exposes a snapshot plus a derived shared simulation state. Route changes and language selection do not create separate module clocks.

This architecture is reusable for the existing deterministic synthetic demonstration. It is not a real VitalDB case repository, and its patient, case, event queue, and timebase represent the SafeAnes full-case demo scenario.

## UC04 / UC05 prediction consumers

The current UC04 and UC05 engines are deterministic scenario functions in src/simulation/engines/uc04.ts and uc05.ts. Their comments and emitted prediction metadata identify output as synthetic and not for clinical use. The identifiers include SAFEANES-DEMO-HPI@0.1-demo and SAFEANES-DEMO-RESP-v0.1. They do not load either trained checkpoint.

The shared PredictionEvent interface has model identity/version, task, simulation timestamp, horizon, probability, confidence, data coverage, missing modalities, and optional input summary/output. That type is a useful starting point, but real model adapters must avoid inventing confidence values or representing an uncalibrated score as calibrated probability. It also has synthetic/clinicalUse fields that are intentionally specific to the existing synthetic path; the real-data path needs explicit source/provenance and calibration status.

UC05 uses the existing waveform subsystem and canonical simulation observations. The UI can be retained by adapting real case observations and prediction events into its current component contracts. The UC03 medication timeline, UC02 record history, and existing synthetic-case event logic do not need to be replaced for a model-integration phase.

## Backend, storage, and deployability

No application API route, Python inference service, Dockerfile, Docker Compose file, pyproject.toml, or backend requirements file was found in the non-dependency application tree. The current Next.js application is frontend-only. No model checkpoint is present under the SafeAnes application directory.

Local cache and experiment folders exist outside the app, including parquet cohort/track/episode metadata under Downloads\uc4 and Downloads\uc4 - Copy. Those are not wired into the application. No raw VitalDB .vital case file was found in Downloads during the audit.

## Reusable pieces and boundaries

Reusable:

- App Router case layout and EN/VI localization.
- Existing shared simulation provider for the synthetic demo mode only.
- Existing UC04/UC05 visualization and PredictionEvent display surfaces.
- Clinical waveform canvas/engine and signal-quality display.
- Existing observation, episode, alert, and prediction UI types as adapter targets.

Keep separate:

- The real VitalDB case identity, case timebase, observations and replay cursor.
- The current fictional, seeded SafeAnes full-case simulation.
- Model logits/probabilities and measured observations.
- Prediction alerts and confirmed clinical events.

The real-data path is introduced through typed service adapters and an explicit data-source mode. It does not mutate `createFullCase()`, the synthetic timeline, or the synthetic model engines. The shared replay provider supplies the selected VitalDB case and cursor to all five workspaces and the global header.

## Audit conclusion

At the time of this architecture audit, the UI and shared case shell were reusable and the real-data path was still a required implementation step. The current implementation now connects VitalDB observations and cached UC04/UC05 model outputs through the backend services, shared replay provider, and recorded-mode adapters. No UI redesign is indicated by this architecture audit.
