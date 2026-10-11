# SafeAnes UC04 / UC05 Model Audit

Audit date: 2026-10-09  
Model source: C:\Users\Namdr\Downloads\model  
Scope: artifact and notebook inspection, safe CPU loading, strict state-dict load, and one real VitalDB-window forward pass per model. No training, checkpoint writes, or application changes were performed.

## Readiness summary

Status is technical integration readiness. It is not a claim of clinical validity.

| UC | Model | Task | Inputs | Window | Horizon | Runtime | Status |
|---|---|---|---|---|---|---|---|
| UC04 | HypoFormer (the notebook’s SafeAnes-HypoFormer) | Estimate a future new MAP episode at or below 65 mmHg lasting at least 60 seconds | MAP, SBP, DBP, HR, SpO2, RR, EtCO2; ART, ECG, PPG, capnogram; static case features | Numeric history 300 × 7 at 1 Hz; four 30-second waveforms | 5, 10, 15 minutes; evaluation stride 30 seconds | PyTorch state dict; CPU load and forward verified | READY (technical inference) |
| UC05 | RespFormer v1 | Predict a new SpO2 below 90% sustained for at least 60 seconds; auxiliary ventilation-loss-pattern output | 18 numeric features; capno, airway pressure, PPG, optional flow/resp; static case features | Numeric history 600 × 18 at 1 Hz; waveforms 60 seconds | 1, 3, 5 minutes; prediction stride 30 seconds | PyTorch state dict; CPU load and forward verified | READY (strict contract; ineligible windows abstain) |

Implementation status update: the backend inference services load the exact allowlisted checkpoints and pass repeatable real VitalDB-window forward passes. UC04 is technically ready for inference with uncalibrated scores; UC05 is technically ready under its strict required-modality contract, with explicit per-window abstention when that contract is not met. Neither package is validated clinical guidance. Details and current checksums are in [UC04_MODEL_CONTRACT.md](UC04_MODEL_CONTRACT.md) and [UC05_MODEL_CONTRACT.md](UC05_MODEL_CONTRACT.md).

## Artifacts found

The directory contains ten files:

| Artifact | Format / role | SHA-256 where applicable |
|---|---|---|
| safeanes_uc04_model/model.pt | PyTorch state dict | E8222E0CC9D3416C7382C9FBB53D9331608C7AE92B06F48B00E1933E7AF93DAA |
| safeanes_uc04_model/config.json | Exported run configuration | — |
| safeanes_uc04_model/thresholds.json | UC04 5-minute threshold and alert persistence/cooldown | — |
| SafeAnes_UC04_Kaggle_Full_Pipeline.ipynb | UC04 architecture, preprocessing, training, evaluation and export code | — |
| safeanes_uc05_respformer_v1/respformer.pt | PyTorch state dict | E7785F06BF107C82DF7DF56966FB1262644B8F0AB1C14B825BEE7D5601D854DE |
| safeanes_uc05_respformer_v1/config.json | Exported run configuration | — |
| safeanes_uc05_respformer_v1/signal_schema.json | UC05 input/output shape contract | — |
| safeanes_uc05_respformer_v1/calibration_thresholds_metrics.json | UC05 temperatures, 5-minute threshold and stored validation/test metrics | — |
| safeanes_uc05_respformer_v1/MODEL_CARD.md | Short research-use note and task summary | — |
| SafeAnes_UC05_RespFormer_Kaggle_Master.ipynb | UC05 architecture, preprocessing, training, evaluation and export code | — |

The .pt files are ordinary PyTorch state dictionaries, not TorchScript or ONNX packages. Architecture definitions live in notebooks; the bundle has no standalone inference module. No scaler, encoder, split manifest, training log, validation prediction file, or requirements/lock file was found. No separate UC04 calibration JSON is present. The notebook cells have no saved execution outputs, so their logs and recorded run evidence are unavailable.

## UC04: HypoFormer

### Verified contract

- Architecture: four waveform-specific Conv1D encoders, numeric history tokens, static feature token, and a Transformer encoder with three horizon heads. The notebook names the model class HypoFormer.
- Output: one raw logit per horizon, shape [batch, 3], ordered 5/10/15 minutes. The notebook applies sigmoid for scores. A sigmoid score is not evidence of a calibrated probability.
- Label: a future MAP episode at or below the configured 65 mmHg threshold for at least 60 seconds. The labeler requires current MAP above threshold, uses a 300-second history, advances candidate times every 30 seconds, and excludes a 120-second post-episode recovery interval.
- Numeric input: [batch, 300, 7], one row per second, feature order MAP, SBP, DBP, HR, SPO2, RR, ETCO2. The notebook uses fixed center/scale arrays and concatenates a missingness mask. Values are bounded to [-6, 6] after normalization.
- Numeric track map: Solar8000/ART_MBP, ART_SBP, ART_DBP, HR, PLETH_SPO2, RR_CO2/RR, and ETCO2 candidates. Numeric tracks are sampled onto a 1 Hz grid and short gaps up to five seconds are interpolated by the notebook.
- Waveform input: ART [batch, 3000] at 100 Hz; ECG [batch, 7500] at 250 Hz; PPG [batch, 3000] at 100 Hz; capnogram [batch, 1875] at 62.5 Hz. Each window is 30 seconds. ART is required and gated at 90% valid samples; optional modalities use an 80% valid-sample gate. The code interpolates within a waveform window before robust median/IQR/std scaling and clips to [-8, 8]. A modality-level mask is passed to the model; the model does not receive a per-sample gap mask.
- Static feature order: age, BMI, ASA, emergency-operation indicator, sex_male. The model normalizes using fixed centers/scales and carries a missingness mask. The notebook does not provide a versioned external units schema; track names and metadata are the source of meaning.
- Thresholds artifact: 5-minute threshold 0.5, persistence 2, cooldown 300 seconds, target 0.5 false alerts/hour. These are configured operating-point values, not proof of achieved performance.
- Calibration: the notebook contains temperature-fitting code for 5/10/15-minute outputs and would save calibration.json, but that file is not in the supplied artifact folder. No fitted temperatures or evaluation metrics can be attributed to this checkpoint from the bundle.
- Run configuration: the exported config says SMOKE_TEST=true, MAX_CASES=24, EPOCHS=2, with stream validation/test disabled. There is no run manifest tying those settings to this exact checkpoint, so this is provenance evidence but not a complete training record.
- Split recipe: notebook code uses patient-level GroupShuffleSplit, approximately 70/15/15 with seed 42 and a second split seed 43. The split assignments are not included.
- Version: no semantic model version was found. Use the checkpoint SHA-256 as the immutable technical identifier until the owner provides a version manifest.

### UC04 execution evidence

The checkpoint loaded with weights_only=true and map_location=CPU, strict state-dict matching, and the notebook class definition. It contains 205 state entries and 1,776,707 parameters. The input window was built from VitalDB case 1 using the notebook’s signal mapping and window normalization. The forward result had shape [1, 3] and all outputs were finite. The forward pass took 26.7 ms in the current CPU environment; this is a single smoke measurement, not a performance benchmark. The values were not used as a clinical result.

## UC05: RespFormer v1

### Verified contract

- Architecture: five ConvNeXt1D waveform encoders, numeric history projection, static projection, and a Transformer backbone. The output heads produce three hypoxemia logits plus one auxiliary ventilation-pattern logit.
- Primary label: new SpO2 below 90% for at least 60 seconds at 1, 3, or 5 minutes. Candidate prediction times advance every 30 seconds. The target is onset timing, not a diagnosis or causal explanation.
- Auxiliary output: the notebook builds a ventilation-loss-pattern label from a reduction in capnogram and airway-pressure waveform amplitude. The model card explicitly calls it a weak signal-derived pattern label, not an etiologic diagnosis.
- Numeric shape: [batch, 600, 18] at 1 Hz, feature order from signal_schema.json: SPO2, ETCO2, RR_CO2, TV, MV, PIP, PEEP, PPLAT, MAWP, FIO2, COMPLIANCE, VENT_LEAK, SET_FIO2, SET_TV, SET_PIP, SET_RR, HR, MAC. Static shape [batch, 7], ordered age, BMI, ASA, sex_male, weight, height, emergency-operation indicator. The artifact schema does not define units for each numeric channel.
- Waveform shape/order: capno [3750] at 62.5 Hz; AWP [3750] at 62.5 Hz; PPG [7500] at 125 Hz; flow [3750] at 62.5 Hz; resp [3750] at 62.5 Hz. Each is a 60-second window. Per-window robust normalization uses median and a scale based on IQR/std; invalid points are interpolated when the valid fraction reaches 80%, then values are clipped to [-8, 8]. Numeric features include masks. The model receives one mask per waveform modality.
- Quality gates: at least 80% valid SpO2 history and 80% valid waveform samples. SpO2 outside [50,100] is treated as missing, with short numeric gaps interpolated up to five samples.
- Track mapping in the notebook includes Primus/CO2, Primus/AWP, SNUADC/PLETH, Solar8000/PLETH_SPO2, Primus/Solar numeric channels and Solar8000/HR.
- Historical required-modality finding: `signal_schema.json` marks capno, AWP, and PPG as optional=false. Earlier cohort/evaluator paths differed: cohort selection required SpO₂, PPG, and either capnogram or numeric EtCO₂, while the streaming evaluator only required PPG and at least one of capno/AWP. The production service now uses the resolved strict policy described below; this earlier mismatch is retained for audit provenance only.

## UC05 contract decision update

For the SafeAnes production integration, the required-modality policy is now
resolved conservatively: valid SpO₂, capnogram, AWP, and PPG are all required
for each inference window. This matches the exported `signal_schema.json` and
the confirmed product requirement. The historical evaluator's looser gate is
retained here as an audit finding, but it is not used by the runtime. UC05
technical readiness is `INTEGRATION_READY` after artifact and sidecar checks;
the readiness label does not imply clinical validation.
- Calibration artifact: temperatures are 0.26647, 0.24329, 0.20454 for 1/3/5-minute logits; threshold_5m is 0.11828. The artifact reports validation event sensitivity 2/14 (14.3%), 20 false alerts over 41.43 hours (0.483/hour); test event sensitivity 0/1, 13 false alerts over 41.18 hours (0.316/hour). The test has only one event, so it is insufficient evidence of stable event-level performance. No 1-minute/3-minute action thresholds or calibration for the auxiliary ventilation output are supplied.
- Run configuration: training-mode configuration says TRAIN_ONLY, fine-tuning epochs 2, history and horizons as above. No training log or exact run-to-checkpoint manifest is present.
- Version: directory/model-card label is RespFormer v1; no source commit or build provenance is included. Use the checkpoint SHA-256 to identify this exact file.

### UC05 execution evidence

The checkpoint loaded with weights_only=true, map_location=CPU, and strict state-dict matching. It contains 446 state entries and 17,031,172 parameters. A real VitalDB case 1 window was built through the notebook’s track mapping and sample-preparation functions. Input shapes were [1,3750], [1,3750], [1,7500], [1,3750], [1,3750], and [1,600,18]; the waveform mask was [1,1,1,0,0]. The forward outputs had shapes [1,3] and [1], and all values were finite. The pass took 116.7 ms in the current CPU environment; this is one smoke measurement, not a benchmark or validation result.

## Runtime, device, and unresolved information

The notebook code selects CUDA when torch.cuda.is_available() and otherwise uses CPU. The verified interpreter was Python 3.12.4 with PyTorch 2.14.1+cpu, NumPy 2.5.3, pandas 3.0.6 and SciPy 1.18.1. CUDA was unavailable in that interpreter; GPU inference was not tested. Package versions are not pinned in either model bundle, and VitalDB’s installed package version was not exposed by its module.

No supplied artifact states a guaranteed training PyTorch version, a model-level license, a reproducible split manifest, or a checksum-linked training run. These are unresolved release/provenance items. Do not redistribute checkpoints until the model owner confirms the applicable license.
