"""
Real-time Signal Preprocessor for SafeAnes UC05 v2.
Converts raw streaming physiological signals from various medical monitors (Philips, GE, Mindray, Dräger)
to the canonical tensor format expected by RespFormer v2.
"""

from fractions import Fraction
from typing import Dict, Optional, Tuple, Any
import numpy as np
from scipy import signal

# Canonical target sampling rates and lengths (60s history)
TARGET_FS = {
    "capno": 62.5,   # 60s -> 3750 samples
    "awp": 62.5,     # 60s -> 3750 samples
    "ppg": 125.0,    # 60s -> 7500 samples
    "flow": 62.5,    # 60s -> 3750 samples
    "resp": 62.5     # 60s -> 3750 samples
}
WAVE_LEN = {k: int(round(60.0 * v)) for k, v in TARGET_FS.items()}

NUM_FEATURES = [
    "SPO2","ETCO2","RR_CO2","TV","MV","PIP","PEEP","PPLAT","MAWP",
    "FIO2","COMPLIANCE","VENT_LEAK","SET_FIO2","SET_TV","SET_PIP",
    "SET_RR","HR","MAC"
]

def resample_poly_safe(x: np.ndarray, src_hz: float, dst_hz: float) -> np.ndarray:
    """
    Safely resamples signal from src_hz to dst_hz using polyphase filtering.
    Preserves signal morphology and avoids phase distortion.
    """
    x = np.asarray(x, dtype=np.float32)
    if len(x) == 0:
        return x
    if abs(float(src_hz) - float(dst_hz)) < 1e-4:
        return x
    frac = Fraction(float(dst_hz) / float(src_hz)).limit_denominator(1000)
    return signal.resample_poly(x, frac.numerator, frac.denominator).astype(np.float32)

def robust_normalize(x: np.ndarray, min_valid_frac: float = 0.8, plausible: Optional[Tuple[float, float]] = None) -> Tuple[np.ndarray, int]:
    """
    Clips outliers, imputes small gaps via linear interpolation, and normalizes using median and IQR.
    Returns (normalized_array, is_valid_flag).
    """
    x = np.asarray(x, dtype=np.float32).copy()
    if plausible is not None:
        lo, hi = plausible
        x[(x < lo) | (x > hi)] = np.nan
    valid = np.isfinite(x)
    if valid.mean() < min_valid_frac or valid.sum() < 8:
        return np.zeros_like(x, dtype=np.float32), 0
    idx = np.arange(len(x))
    x[~valid] = np.interp(idx[~valid], idx[valid], x[valid])
    med = np.median(x)
    q25, q75 = np.percentile(x, [25, 75])
    sc = max((q75 - q25) / 1.349, float(np.std(x)), 1e-3)
    normed = np.clip((x - med) / sc, -8.0, 8.0).astype(np.float32)
    return normed, 1

def pad_or_truncate(x: np.ndarray, target_len: int) -> np.ndarray:
    """Ensures buffer length exactly matches target_len."""
    if len(x) == target_len:
        return x
    if len(x) > target_len:
        return x[-target_len:]  # Keep most recent 60 seconds
    out = np.zeros(target_len, dtype=np.float32)
    out[-len(x):] = x
    return out

class RealtimeSignalPreprocessor:
    """
    High-level preprocessor handling raw multi-monitor signals.
    Supports missing waveforms (e.g. non-intubated surgery with only PPG/SpO2).
    """
    def __init__(self):
        self.plausible_ranges = {
            "ppg": (-5000.0, 5000.0),
            "capno": (0.0, 100.0),
            "awp": (-20.0, 80.0),
            "flow": (-200.0, 200.0),
            "resp": (-1000.0, 1000.0)
        }

    def process_wave(self, raw_data: Optional[np.ndarray], wave_name: str, src_fs: float) -> Tuple[np.ndarray, float]:
        """Resamples, normalizes, and packages a single waveform."""
        target_len = WAVE_LEN[wave_name]
        target_fs = TARGET_FS[wave_name]
        if raw_data is None or len(raw_data) == 0:
            return np.zeros(target_len, dtype=np.float32), 0.0

        # 1. Resample from source frequency to model canonical frequency
        resampled = resample_poly_safe(raw_data, src_hz=src_fs, dst_hz=target_fs)
        
        # 2. Fix length to exact 60-second window
        windowed = pad_or_truncate(resampled, target_len)
        
        # 3. Robust median-IQR normalization
        normed, valid_flag = robust_normalize(windowed, plausible=self.plausible_ranges.get(wave_name))
        return normed, float(valid_flag)

    def prepare_model_inputs(
        self,
        raw_waves: Dict[str, Tuple[Optional[np.ndarray], float]], # {name: (raw_array, src_fs)}
        numeric_dict: Dict[str, np.ndarray],                     # {feature_name: (600,) 1-second history}
        static_patient: Optional[Dict[str, float]] = None        # {age, bmi, asa, sex_male, weight, height, emop}
    ) -> Dict[str, np.ndarray]:
        """
        Prepares a complete inference package from arbitrary monitor inputs.
        """
        wave_order = ["capno", "awp", "ppg", "flow", "resp"]
        processed_waves = {}
        wave_mask = np.zeros(5, dtype=np.float32)

        for i, wname in enumerate(wave_order):
            if wname in raw_waves and raw_waves[wname][0] is not None:
                arr, src_fs = raw_waves[wname]
                normed, is_valid = self.process_wave(arr, wname, src_fs)
                processed_waves[wname] = normed
                wave_mask[i] = is_valid
            else:
                processed_waves[wname] = np.zeros(WAVE_LEN[wname], dtype=np.float32)
                wave_mask[i] = 0.0

        # Prepare Numeric Grid (600s x 18 features)
        num_grid = np.zeros((600, len(NUM_FEATURES)), dtype=np.float32)
        num_mask = np.zeros((600, len(NUM_FEATURES)), dtype=np.float32)
        for j, feat in enumerate(NUM_FEATURES):
            if feat in numeric_dict and numeric_dict[feat] is not None:
                vals = np.asarray(numeric_dict[feat], dtype=np.float32)
                v_len = min(600, len(vals))
                num_grid[-v_len:, j] = vals[-v_len:]
                num_mask[-v_len:, j] = np.isfinite(vals[-v_len:]).astype(np.float32)

        # Prepare Static Features (7 features)
        # Default average adult patient if not provided: Age=60, BMI=24, ASA=2, Male=0, W=65, H=165, EmOp=0
        static_defaults = {"age": 60.0, "bmi": 24.0, "asa": 2.0, "sex_male": 0.0, "weight": 65.0, "height": 165.0, "emop": 0.0}
        if static_patient:
            static_defaults.update(static_patient)
        static_arr = np.array([static_defaults[k] for k in ["age","bmi","asa","sex_male","weight","height","emop"]], dtype=np.float32)

        return {
            "capno": processed_waves["capno"],
            "awp": processed_waves["awp"],
            "ppg": processed_waves["ppg"],
            "flow": processed_waves["flow"],
            "resp": processed_waves["resp"],
            "numeric": num_grid,
            "numeric_mask": num_mask,
            "static": static_arr,
            "wave_mask": wave_mask
        }
