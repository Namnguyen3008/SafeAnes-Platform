import numpy as np

from backend.app.vitaldb.pipeline import signal_quality_summary, stratified_sample


def test_stratified_sample_covers_candidate_range_without_repeats():
    candidates = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

    sample = stratified_sample(candidates, 4)

    assert sample == [70, 10, 100, 40]
    assert len(sample) == len(set(sample))


def test_signal_quality_summary_reports_missing_gaps_and_model_range_outliers():
    values = np.asarray([1.0, np.nan, np.nan, 2.0, 5.0], dtype=np.float32)

    summary = signal_quality_summary(values, sample_rate_hz=1.0, plausible=(0.0, 3.0))

    assert summary["sample_count"] == 5
    assert summary["finite_count"] == 3
    assert summary["valid_fraction"] == 0.6
    assert summary["nan_count"] == 2
    assert summary["missing_interval_count"] == 1
    assert summary["longest_missing_interval_seconds"] == 2.0
    assert summary["implausible_sample_count"] == 1
    assert summary["valid_time_range_seconds"] == [0.0, 4.0]
def test_signal_quality_summary_keeps_a_time_preview_and_labels_model_range_artifacts():
    values = np.asarray([1.0, np.nan, np.nan, 2.0, 5.0], dtype=np.float32)

    summary = signal_quality_summary(values, sample_rate_hz=1.0, plausible=(0.0, 3.0))

    assert summary["missing_intervals_preview_seconds"] == [[1.0, 3.0]]
    assert summary["missing_intervals_preview_truncated"] is False
    assert summary["artifact_count_from_model_plausibility_filter"] == 1
