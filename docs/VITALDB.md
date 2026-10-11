# VitalDB local data

The selected dataset is the VitalDB open dataset version `1.0.1`. The API uses
the VitalDB Python library `1.7.2`. The dataset is distributed under CC BY 4.0;
attribute VitalDB and its cited publication, retain the license notice, and
indicate modifications if derived materials are shared. Review the
[VitalDB terms](https://vitaldb.net/docs/?documentId=General/Terms_and_Conditions.md)
and [open dataset documentation](https://vitaldb.net/docs/?documentId=OpenDataset/Overview.md)
before redistribution. This repository configuration does not package the
selected recordings in frontend or backend images.

Three real deidentified case recordings are currently selected and cached:

| VitalDB case ID | Duration | UC04 windows | UC05 strict-schema windows | Dual input eligibility |
|---:|---:|---:|---:|---|
| `1` | 11,542.1 s | 345 | 347 | Yes |
| `6388` | 10,249.3 s | 314 | 305 | Yes |
| `3300` | 20,660.0 s | 660 | 649 | Yes |

The current catalog's full selection report is
[`integration/CASE_SELECTION_REPORT.md`](integration/CASE_SELECTION_REPORT.md).
Three cases were inspected from 6,330 indexed candidates. All other candidates
remain unverified; the catalog is not a complete cohort scan. Model train,
validation, and test membership is unknown, so these are not independent
evaluation cases.

## Paths and file integrity

The default local data root is `backend/data`:

```text
backend/data/
  manifests/vitaldb_case_catalog.json
  vitaldb/raw/<case-id>.vital
  vitaldb/manifests/<case-id>.json
  vitaldb/processed/
  processed/uc04_predictions/
  processed/uc05_predictions/
```

Set `SAFEANES_DATA_ROOT` for an alternate location. Raw `.vital` files are
stored byte-for-byte, with per-case source metadata and SHA-256 checks. The
backend mounts its data root read-only in Compose. Discovery/ingestion scripts
populate the host cache; starting a service does not download the cohort.
Absolute source timestamps and subject identifiers are not shown in the
frontend case catalog.

The files are deidentified open dataset records, but redistribution must still
follow the VitalDB license and attribution terms. Do not try to re-identify
subjects. Future ingestion should preserve source samples and record any
derived file separately with a checksum and preprocessing version.
