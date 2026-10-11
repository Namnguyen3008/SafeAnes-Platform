# VitalDB preprocessing validation

- Dataset: VitalDB `1.0.1`.
- Catalog SHA-256: `6eb530a8b77661cc3bb74227935bb7ff6a0a5625960feae5f4016616407835e8`.
- Window generation uses contract-defined numeric history and stride; only case-time samples before each prediction time are read.
- No labels, future events, or model predictions are inputs to preprocessing validation.

| Model | Windows examined | Input eligible | Inference eligible | Abstained |
|---|---:|---:|---:|---:|
| SafeAnes-UC04-HypoFormer | 1386 | 1319 | 1319 | 67 |
| SafeAnes-UC05-RespFormer | 1356 | 1301 | 0 | 1356 |

## Limitations

- UC05 inference is technically `INTEGRATION_READY` under the exported strict
  schema. Windows missing valid SpO₂ history, capnogram, AWP, or PPG abstain
  explicitly; the historical stream-evaluator mismatch is not used as the
  production gate.
- VitalDB track units absent from source metadata are reported NOT_RECORDED; no unit conversion is invented.
- This report validates input construction and preprocessing only; it does not run model predictions or establish clinical validity.

No raw checksum or case loading errors were recorded.

Each window record, including feature states, observed coverage, shape, and abstain reason, is in `backend/data/vitaldb/processed/preprocessing_validation_report.json`.
