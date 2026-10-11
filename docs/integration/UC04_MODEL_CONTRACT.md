# UC04 HypoFormer model contract

Status: **INTEGRATION_READY for technical inference**. This status confirms the
artifact, input contract, preprocessing, and forward pass in this package. It is
not clinical validation or a claim that the output is calibrated.

## Exact artifact and runtime

| Field | Verified value |
|---|---|
| Model ID | `SafeAnes-UC04-HypoFormer` |
| Version | `unversioned+sha256:e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa` |
| Artifact | `safeanes_uc04_model/model.pt` — raw PyTorch state dict |
| SHA-256 | `e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa` |
| Supporting files | `config.json` SHA-256 `0889aa7639939861bc0c59db8928aea614c164d7e216475bfa7b31dd28bc411e`; `thresholds.json` SHA-256 `dae32d323c8295ca21aa3a11d4f23d70d5a459dffe08d753d5d47c8bdd15ded8` |
| Framework | PyTorch; training version is not recorded. Forward pass verified on 2.14.1+cpu |
| Tested runtime | Python 3.12.4, CPU; CUDA unavailable and not verified |
| Architecture | HypoFormer, restored from the supplied training notebook; strict state-dict load succeeds (205 entries) |

The architecture has separate Conv1D encoders for ART, ECG, PPG, and
capnogram, a numeric-history projection, a static-feature projection, and a
Transformer with three horizon heads. Its normalization buffers were checked
against the notebook constants after loading the checkpoint.

## Input contract

Prediction task: estimate whether a **new** episode with MAP `<= 65 mmHg` and
duration `>= 60 seconds` begins within the indicated horizon. Training candidate
windows use a 300-second history and 30-second stride; labels exclude a
120-second recovery interval after an episode.

| Input | Shape per request | Sampling / source |
|---|---:|---|
| Numeric history | `[300, 7]` model rows; loader carries a 5-second bounded interpolation pre-roll | 1 Hz; `MAP, SBP, DBP, HR, SPO2, RR, ETCO2` |
| ART | `[3000]` | 100 Hz, `SNUADC/ART`, required; at least 90% valid |
| ECG | `[7500]` | 250 Hz, `SNUADC/ECG_II` or `SNUADC/ECG_V5`, optional |
| PPG | `[3000]` | 100 Hz, `SNUADC/PLETH`, optional |
| Capnogram | `[1875]` | 62.5 Hz, `Primus/CO2`, optional |
| Static | `[5]` | `age, bmi, asa, emop, sex_male` |

Numeric VitalDB candidates follow the training notebook: invasive MAP/SBP/DBP,
Solar8000 HR/SpO2/RR/EtCO2 with the documented RR and EtCO2 fallbacks. The
loader preserves absent tracks as NaN; it does not derive a missing measure
from another track.

Normalization uses fixed center/scale arrays in the restored architecture and
checkpoint (not a scaler fitted to a demo case):

- Numeric center `(75,120,65,75,98,14,35)`, scale `(20,30,20,20,3,6,10)`,
  normalized values clipped to `[-6,6]`.
- Static center `(60,24,2,0,0)`, scale `(15,5,1,1,1)` with a missingness mask.
- Each waveform is window-normalized using median and
  `max(IQR/1.349, standard deviation, 1e-3)`, then clipped to `[-8,8]`.
- Numeric gaps of at most five seconds are interpolated only inside the bounded
  input prefix. A five-second pre-roll reproduces an interior gap at the
  beginning of the model window without reading later case samples. Remaining
  missing values and modality masks are retained.

The input contract is prospectively bounded. The VitalDB loader selects samples
with timestamps strictly earlier than `prediction_time_s`, and service
validation rejects numeric or waveform samples that extend past it. UC04
training code interpolated the full offline case before windowing; its possible
use of observations later than a replay cutoff is intentionally not reproduced.

## Output contract

The checkpoint returns finite raw logits shaped `[1,3]`, ordered 5, 10, and 15
minutes. Each service result includes model/checkpoint identity, case ID,
window and prediction times, raw logit, sigmoid score, quality status, coverage,
missing feature names, preprocessing version, and selected source tracks.

No fitted calibration artifact is present. `interpreted_output.value` is
therefore an **uncalibrated sigmoid score**, not a calibrated probability.
`confidence` is `null`. The saved `thresholds.json` gives a 5-minute configured
score threshold of `0.5`; it is returned only for that horizon. The other
horizons have no threshold. Persistence and cooldown values in the file are not
executed by this per-window inference service.

## Current API/cache execution — case 1 at `t=600s`

The verified current VitalDB cache/API row uses the prospective window
`[300s, 600s]` and the exact UC04 checkpoint. The values below are the
interpreted uncalibrated sigmoid scores returned by the API; `confidence` is
`null` for every horizon.

| Horizon | Raw logit | API interpreted score | Calibration |
|---:|---:|---:|---|
| 5 min | `-0.24149799346923828` | `0.4399172268780309` | Uncalibrated |
| 10 min | `0.3299698233604431` | `0.5817520343824671` | Uncalibrated |
| 15 min | `0.4207121431827545` | `0.6036536469090111` | Uncalibrated |

The current cache records `DEGRADED` input quality and `0.66125` aggregate
coverage. The cache file is `backend/data/processed/uc04_predictions/1.json`;
its generation run identifier is not recorded in the model contract. These
values are technical outputs and are not calibrated probabilities, HPI, or
clinical decisions.

The configured backend suite passed **135 tests with 0 skips and 13 warnings**;
the dedicated real-model smoke subset passed **8 tests**. Repeated inference
on identical input was finite and stable within `rtol=1e-5, atol=1e-6`.

## Superseded one-off smoke output

The following values came from an earlier CPU smoke run recorded as case 1 at
`t=600s`; the exact cache row/run identifier and input-quality reconstruction
are not available. They are preserved for audit history only and must not be
used as the current API parity reference:

- Historical raw logits at 5/10/15 minutes: `-0.24111962`, `0.33008170`,
  `0.42052189`.
- Historical uncalibrated scores: `0.44001046`, `0.58177926`, `0.60360813`.
- Historical reported coverage: `0.723750`, quality `DEGRADED`.

The supplied notebook has no saved prediction outputs, validation window
fixtures, or executed outputs, so no independent golden-output regression test
could be built. The package verifies strict checkpoint compatibility and
repeatability on identical input instead.

## Loading and security

Only the hard-coded registry entry is accepted. The checkpoint path must remain
inside the configured model root and match the SHA-256 above before deserialization.
The loader uses `torch.load(..., weights_only=True)` and validates that every
state-dict entry is a tensor. It never downloads or executes a pickle from an
untrusted source.

## Remaining limitations

- Training framework/package versions, checkpoint-linked training run,
  validated external units manifest, and model license were not included.
- There are no supplied calibration parameters or independent golden outputs.
- This technical integration does not establish prospective performance,
  clinical validity, or suitability for care decisions.
