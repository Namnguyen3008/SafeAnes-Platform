# VitalDB Data Access and Local Storage Plan

Audit date: 2026-10-09  
Scope: local files, metadata availability, network access, case-track coverage, disk headroom and usage terms.

## Verified access

The public metadata endpoints https://api.vitaldb.net/cases and https://api.vitaldb.net/trks responded successfully. The fetched metadata contained 6,388 cases and 486,449 case-track rows. The VitalDB Python library loaded per-case VitalDB data over the network.

A real case file for case 1 was read in memory with 28 selected tracks for the combined UC04/UC05 window test. It yielded eligible model windows and both model forward passes completed. The smoke-test file was not copied into the application or intentionally retained. A follow-up Downloads scan found no .vital file.

Official VitalDB documentation describes 6,388 de-identified surgical cases with numeric and waveform signals; the public API exposes case and track metadata and per-case files. [VitalDB open-dataset overview](https://vitaldb.net/docs/?documentId=OpenDataset%2FOverview.md), [VitalDB API reference](https://api.vitaldb.net/docs/).

## Local data and space

- No raw .vital files were found under Downloads.
- Parquet files were found under Downloads\uc4 and Downloads\uc4 - Copy. They are cohort, track-catalog, episode, or build-stat metadata, not raw signal arrays.
- No .npz or Zarr model-input shards were found in those experiment folders during the audit.
- C: had approximately 50.4 GiB free at inspection.
- A single case file can be streamed on demand; the local audit did not download the full dataset.

Track-catalog candidates were counted from the current metadata only, using adult age and case duration of at least 30 minutes:

| Pipeline filter | Candidate cases |
|---|---:|
| Adult + duration >= 30 min | 6,328 |
| UC04 track catalog: SNUADC/ART, Solar8000/ART_MBP and Solar8000/HR | 3,604 |
| UC05 track catalog: Solar8000/PLETH_SPO2, SNUADC/PLETH, plus capno or numeric EtCO2 | 6,104 |

These are metadata availability counts. They do not establish signal validity, sufficient usable windows, or suitability for either model. The UC05 optional/required-track discrepancy documented in MODEL_AUDIT.md must be resolved before a final eligibility filter is set.

## Usage terms and attribution

VitalDB’s current registration agreement states that the open dataset is released under CC BY 4.0, requires appropriate credit and a license link, and prohibits attempts to identify people in the data. Include attribution in the application’s About/data-source view and in any documentation or exports that redistribute data. [VitalDB registration agreement](https://vitaldb.net/registration-agreement/), [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

The model directory does not include model license terms. Dataset permission does not grant rights to redistribute the separate trained checkpoints; obtain model-owner terms before packaging them for deployment.

## Recommended cache policy

For local development, use a cache outside the repository, for example:

%LOCALAPPDATA%\SafeAnes\vitaldb\

Key cache objects by VitalDB case ID, selected track set, source URL/version, and content hash. Store a manifest alongside each downloaded case with retrieval time, selected track names, source license attribution, and checksum. Keep the cache out of Git and Docker build contexts. Add explicit size/age limits and a clear-cache command before implementing bulk retrieval.

Begin with case metadata and track metadata. Download one selected case only after a user selects it; request only the allowlisted tracks required by that inference path. Do not fetch all cases or all tracks by default. Keep raw case files read-only after acquisition and do not derive identity from de-identified fields.

## Network and runtime observations

The Python 3.12.4 environment used for the model smoke test had PyTorch 2.14.1+cpu, NumPy 2.5.3, pandas 3.0.6 and SciPy 1.18.1. The VitalDB module did not expose a version string. This environment could fetch a case over the network but did not expose CUDA. Package versions are not frozen by either model artifact.

