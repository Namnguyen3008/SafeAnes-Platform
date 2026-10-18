"""
Clinical Early Warning Alert Manager for SafeAnes UC05 v2.
Implements real-time filtering (Persistence) and anti-fatigue cooldowns for Operating Room deployment.
"""

import time
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any

@dataclass
class AlertNotification:
    tier: str                      # "TIER_1_EARLY_WARNING" | "TIER_2_HIGH_URGENCY"
    alert_time_seconds: float      # Surgery timeline seconds or timestamp
    calibrated_p5: float           # Calibrated 5-minute desaturation probability
    threshold: float
    persistence_hit_count: int
    lead_time_expectation_min: float
    recommended_action: str
    display_type: str              # "VISUAL_BANNER" | "AUDIBLE_CHIME"

class ClinicalAlertManager:
    """
    Real-time State Machine managing continuous streaming inference outputs.
    Enforces Persistence filter (2 consecutive hits) and Cooldown (180s/300s).
    """
    def __init__(
        self,
        stride_seconds: float = 30.0,
        tier1_threshold: float = 0.07,     # 7% optimal early warning
        tier1_persistence: int = 2,        # 2 windows = 60s
        tier1_cooldown_seconds: float = 180.0,
        tier2_threshold: float = 0.25,     # 25% high urgency
        tier2_persistence: int = 1,        # 1 window = 30s
        tier2_cooldown_seconds: float = 300.0,
        alert_callback: Optional[Callable[[AlertNotification], None]] = None
    ):
        self.stride = stride_seconds
        
        # Tier 1: Early Warning (Yellow)
        self.t1_threshold = tier1_threshold
        self.t1_persistence = tier1_persistence
        self.t1_cooldown = tier1_cooldown_seconds
        self.t1_hits = 0
        self.t1_last_alert_time = -math.inf
        
        # Tier 2: High Urgency (Red)
        self.t2_threshold = tier2_threshold
        self.t2_persistence = tier2_persistence
        self.t2_cooldown = tier2_cooldown_seconds
        self.t2_hits = 0
        self.t2_last_alert_time = -math.inf
        
        self.previous_timestamp = None
        self.alert_callback = alert_callback
        self.alert_history: List[AlertNotification] = []

    def reset(self):
        """Reset state for a new surgical case."""
        self.t1_hits = 0
        self.t1_last_alert_time = -math.inf
        self.t2_hits = 0
        self.t2_last_alert_time = -math.inf
        self.previous_timestamp = None
        self.alert_history.clear()

    def process_window(self, timestamp_seconds: float, p5_calibrated: float) -> List[AlertNotification]:
        """
        Process a new inference window.
        Called once every 30 seconds as new telemetry window arrives.
        Returns triggered alerts (if any).
        """
        triggered = []

        # Check for gap in telemetry stream (> stride * 1.5 -> reset consecutive hits)
        if self.previous_timestamp is not None:
            gap = timestamp_seconds - self.previous_timestamp
            if gap > self.stride * 1.5 or gap < self.stride * 0.5:
                # Stream was interrupted or time jumped
                self.t1_hits = 0
                self.t2_hits = 0

        self.previous_timestamp = timestamp_seconds

        # 1. Update Tier 2 (High Urgency - Red Alert)
        if p5_calibrated >= self.t2_threshold:
            self.t2_hits += 1
            if self.t2_hits >= self.t2_persistence:
                if timestamp_seconds - self.t2_last_alert_time >= self.t2_cooldown:
                    alert = AlertNotification(
                        tier="TIER_2_HIGH_URGENCY",
                        alert_time_seconds=timestamp_seconds,
                        calibrated_p5=p5_calibrated,
                        threshold=self.t2_threshold,
                        persistence_hit_count=self.t2_hits,
                        lead_time_expectation_min=4.5,
                        recommended_action="NGUY CƠ TỤT SPO2 CẤP DIỄN! Can thiệp tăng FiO2 khẩn cấp, thông khí bóp bóng bằng tay.",
                        display_type="AUDIBLE_CHIME"
                    )
                    triggered.append(alert)
                    self.alert_history.append(alert)
                    self.t2_last_alert_time = timestamp_seconds
                    self.t2_hits = 0
                    # A high urgency alarm also suppresses immediate yellow alarm
                    self.t1_last_alert_time = timestamp_seconds
        else:
            self.t2_hits = 0

        # 2. Update Tier 1 (Early Warning - Yellow Alert)
        if p5_calibrated >= self.t1_threshold:
            self.t1_hits += 1
            if self.t1_hits >= self.t1_persistence:
                if timestamp_seconds - self.t1_last_alert_time >= self.t1_cooldown:
                    alert = AlertNotification(
                        tier="TIER_1_EARLY_WARNING",
                        alert_time_seconds=timestamp_seconds,
                        calibrated_p5=p5_calibrated,
                        threshold=self.t1_threshold,
                        persistence_hit_count=self.t1_hits,
                        lead_time_expectation_min=4.0,
                        recommended_action="Cảnh báo tụt SpO2 sớm (Dự kiến trong 3-5 phút tới). Bác sĩ kiểm tra thông khí, độ giãn nở phổi, hút đờm nhớt.",
                        display_type="VISUAL_BANNER"
                    )
                    triggered.append(alert)
                    self.alert_history.append(alert)
                    self.t1_last_alert_time = timestamp_seconds
                    self.t1_hits = 0
        else:
            self.t1_hits = 0

        # Dispatch callbacks
        if self.alert_callback:
            for al in triggered:
                self.alert_callback(al)

        return triggered
