from __future__ import annotations

from backend.app.ml.contracts.model_contract import ModelContract


UC04_MODEL_SHA256 = (
    "e8222e0cc9d3416c7382c9fbb53d9331608c7ae92b06f48b00e1933e7af93daa"
)
UC05_MODEL_SHA256 = (
    "e7785f06bf107c82df7df56966fb1262644b8f0ab1c14b825bee7d5601d854de"
)
UC04_CONFIG_SHA256 = (
    "0889aa7639939861bc0c59db8928aea614c164d7e216475bfa7b31dd28bc411e"
)
UC04_THRESHOLDS_SHA256 = (
    "dae32d323c8295ca21aa3a11d4f23d70d5a459dffe08d753d5d47c8bdd15ded8"
)
UC05_CONFIG_SHA256 = (
    "6f402ec3d388028b4fc7b05b8ea8d187402b0d8fdd6a67dfba2af16d8a02b69a"
)
UC05_SCHEMA_SHA256 = (
    "c7387214dabba32f48eb59bdd9e0d7fbea1bde5eb3af699d450881b8461b54d9"
)
UC05_CALIBRATION_SHA256 = (
    "870a8ce5b1d008741a6fbb645114728c822075ac736e6bda9975ecadbcd22866"
)


UC04_CONTRACT = ModelContract(
    model_id="SafeAnes-UC04-HypoFormer",
    model_version=f"unversioned+sha256:{UC04_MODEL_SHA256}",
    task=(
        "New MAP episode <=65 mmHg sustained for >=60 seconds within "
        "5, 10, or 15 minutes"
    ),
    artifact_path="safeanes_uc04_model/model.pt",
    artifact_sha256=UC04_MODEL_SHA256,
    framework="PyTorch",
    framework_version="training version unknown; CPU smoke-tested on 2.14.1+cpu",
    required_tracks=(
        "SNUADC/ART",
        "Solar8000/ART_MBP",
        "Solar8000/HR",
    ),
    required_features=("MAP", "SBP", "DBP", "HR", "SPO2", "RR", "ETCO2"),
    feature_order={
        "numeric": ("MAP", "SBP", "DBP", "HR", "SPO2", "RR", "ETCO2"),
        "static": ("age", "bmi", "asa", "emop", "sex_male"),
        "waveforms": ("ART", "ECG", "PPG", "CAPNO"),
    },
    input_shape={
        "art": (None, 3000),
        "ecg": (None, 7500),
        "ppg": (None, 3000),
        "capno": (None, 1875),
        "numeric": (None, 300, 7),
        "numeric_mask": (None, 300, 7),
        "static": (None, 5),
        "modality_mask": (None, 4),
        "logits": (None, 3),
    },
    sample_rate_hz={
        "numeric": 1.0,
        "art": 100.0,
        "ecg": 250.0,
        "ppg": 100.0,
        "capno": 62.5,
    },
    window_seconds={"numeric": 300, "waveforms": 30},
    stride_seconds=30,
    prediction_horizons=(5, 10, 15),
    output_semantics={
        "logits": "raw binary-classifier logits ordered 5/10/15 minutes",
        "score": "sigmoid(logit), uncalibrated because no fitted calibration file was supplied",
        "confidence": None,
    },
    normalization={
        "numeric": "fixed centers/scales registered in the checkpoint; clamp normalized values to [-6, 6]",
        "waveforms": "per-window median and max(IQR/1.349, standard deviation, 1e-3), clip [-8, 8]",
        "numeric_center": (75, 120, 65, 75, 98, 14, 35),
        "numeric_scale": (20, 30, 20, 20, 3, 6, 10),
        "static_center": (60, 24, 2, 0, 0),
        "static_scale": (15, 5, 1, 1, 1),
    },
    missing_data_policy={
        "numeric": "interpolate interior gaps of at most 5 samples within the bounded prefix; append a numeric mask",
        "map_min_valid_fraction": 0.8,
        "art_min_valid_fraction": 0.9,
        "optional_wave_min_valid_fraction": 0.8,
        "optional_waveforms": ("ecg", "ppg", "capno"),
        "absent_optional_waveforms": "zero tensor plus modality mask 0",
        "future_leakage": "cut at prediction_time before any interpolation",
    },
    calibration_method=None,
    decision_threshold={"5m": 0.5},
    supported_runtime=("CPU verified", "CUDA not verified"),
    supporting_artifacts={
        "config.json": UC04_CONFIG_SHA256,
        "thresholds.json": UC04_THRESHOLDS_SHA256,
    },
)

UC05_CONTRACT = ModelContract(
    model_id="SafeAnes-UC05-RespFormer",
    model_version=f"v1+sha256:{UC05_MODEL_SHA256}",
    task=(
        "New SpO2 <90% sustained for >=60 seconds at 1/3/5 minutes; "
        "auxiliary signal-derived ventilation-loss pattern"
    ),
    artifact_path="safeanes_uc05_respformer_v1/respformer.pt",
    artifact_sha256=UC05_MODEL_SHA256,
    framework="PyTorch",
    framework_version="training version unknown; CPU smoke-tested on 2.14.1+cpu",
    required_tracks=(
        "Solar8000/PLETH_SPO2",
        "Primus/CO2",
        "Primus/AWP",
        "SNUADC/PLETH",
    ),
    required_features=(
        "SPO2 history >=80% valid after the notebook SpO2 range/short-gap gate",
        "Capnogram waveform >=80% valid",
        "Airway-pressure waveform >=80% valid",
        "PPG waveform >=80% valid",
    ),
    feature_order={
        "numeric": (
            "SPO2", "ETCO2", "RR_CO2", "TV", "MV", "PIP", "PEEP", "PPLAT",
            "MAWP", "FIO2", "COMPLIANCE", "VENT_LEAK", "SET_FIO2", "SET_TV",
            "SET_PIP", "SET_RR", "HR", "MAC",
        ),
        "static": ("age", "bmi", "asa", "sex_male", "weight", "height", "emop"),
        "waveforms": ("capno", "awp", "ppg", "flow", "resp"),
    },
    input_shape={
        "capno": (None, 3750),
        "awp": (None, 3750),
        "ppg": (None, 7500),
        "flow": (None, 3750),
        "resp": (None, 3750),
        "numeric": (None, 600, 18),
        "numeric_mask": (None, 600, 18),
        "static": (None, 7),
        "wave_mask": (None, 5),
        "hypoxemia_logits": (None, 3),
        "ventilation_pattern_logit": (None,),
    },
    sample_rate_hz={
        "numeric": 1.0,
        "capno": 62.5,
        "awp": 62.5,
        "ppg": 125.0,
        "flow": 62.5,
        "resp": 62.5,
    },
    window_seconds={"numeric": 600, "waveforms": 60},
    stride_seconds=30,
    prediction_horizons=(1, 3, 5),
    output_semantics={
        "hypoxemia_logits": "raw logits ordered 1/3/5 minutes",
        "hypoxemia_score": "sigmoid(logit / saved per-horizon temperature)",
        "ventilation_pattern_logit": "auxiliary weak signal-derived pattern logit; no diagnosis or cause",
        "confidence": None,
    },
    normalization={
        "numeric": "checkpoint fixed centers/scales; clamp normalized values to [-8, 8]",
        "waveforms": "resample_poly to target rates, per-window robust median/IQR/std scale, clip [-8, 8]",
        "numeric_center": (
            98, 35, 14, 450, 6, 18, 5, 15, 10, 45, 50, 0, 45, 450, 18, 12, 75, 1,
        ),
        "numeric_scale": (
            3, 10, 6, 200, 3, 8, 4, 8, 6, 20, 20, 200, 20, 200, 8, 6, 20, 0.5,
        ),
        "static_center": (60, 24, 2, 0, 65, 165, 0),
        "static_scale": (15, 5, 1, 1, 15, 10, 1),
    },
    missing_data_policy={
        "numeric": "retain NaNs and provide cell-level mask; model replaces NaN with 0 after normalization",
        "wave_min_valid_fraction": 0.8,
        "spo2_history_min_valid_fraction": 0.8,
        "required_waveforms": ("capno", "awp", "ppg"),
        "required_waveform_policy": "each core waveform must independently meet the 0.8 valid fraction gate; otherwise abstain",
        "optional_waveforms": ("flow", "resp"),
        "historical_stream_evaluator_gate": "PPG plus capno or AWP; weaker than the exported signal schema and not used for production inference",
    },
    calibration_method=(
        "saved per-horizon temperature scaling for hypoxemia logits; no calibration supplied for ventilation-pattern output"
    ),
    decision_threshold={"5m": 0.1182835621637828},
    supported_runtime=("CPU verified", "CUDA not verified"),
    supporting_artifacts={
        "config.json": UC05_CONFIG_SHA256,
        "signal_schema.json": UC05_SCHEMA_SHA256,
        "calibration_thresholds_metrics.json": UC05_CALIBRATION_SHA256,
    },
)


MODEL_CONTRACTS = {
    UC04_CONTRACT.model_id: UC04_CONTRACT,
    UC05_CONTRACT.model_id: UC05_CONTRACT,
}


def get_model_contract(model_id: str) -> ModelContract:
    try:
        return MODEL_CONTRACTS[model_id]
    except KeyError as exc:
        raise KeyError(f"model_id is not allowlisted: {model_id}") from exc
