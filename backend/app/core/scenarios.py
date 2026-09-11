"""Curated demonstration scenarios ("Demo Mode").

Each scenario is a real point in the demonstration dataset - a specific site,
variable, lead time and initialisation - chosen because it lands cleanly in one
risk band. Nothing here overrides the model: switching Demo Mode on selects a
situation, it does not inject a score. `tests/test_scenarios.py` asserts that
each one still resolves to its intended band, so a retune of the generator
fails the test suite instead of silently degrading the live demo.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    summary: str
    expected_band: str
    location_id: str
    variable_id: str
    model_id: str
    horizon: int
    base_date: str


SCENARIOS: tuple[Scenario, ...] = (
    Scenario(
        "low",
        "Low Bust Risk",
        "A settled short-range forecast over the capital. Ensemble members cluster "
        "tightly and every monitored driver sits below its dataset average.",
        "LOW",
        "delhi", "rainfall", "ecmwf", 3, "2026-09-01",
    ),
    Scenario(
        "moderate",
        "Moderate Bust Risk",
        "A Day 7 forecast for the Konkan coast in an active but not disorganised "
        "spell. Spread is somewhat above normal for the lead time, with a little "
        "run-to-run drift worth watching.",
        "MODERATE",
        "mumbai", "rainfall", "ecmwf", 7, "2026-09-01",
    ),
    Scenario(
        "high",
        "High Bust Risk - flagship case",
        "The AtmosGuard headline case. The Day 5 forecast for Jaipur, valid "
        "6 September 2026, when IMD went on to record 29.4 mm against a daily normal "
        "of about 4 mm. The ensemble had already diverged days beforehand.",
        "HIGH",
        "jaipur", "rainfall", "ecmwf", 5, "2026-09-01",
    ),
    Scenario(
        "severe",
        "Severe Bust Risk",
        "A Day 7 forecast for the Bihar plains during an active spell, with large "
        "ensemble spread and a forecast that has not settled between runs.",
        "SEVERE",
        "patna", "rainfall", "ecmwf", 7, "2026-09-01",
    ),
    Scenario(
        "extreme",
        "Extreme Forecast Bust",
        "The most extreme situation in the current dataset: a Day 7 forecast for the "
        "Konkan coast, where very high ensemble spread, model disagreement and an "
        "unsettled run-to-run history all coincide.",
        "SEVERE",
        "konkan", "rainfall", "ecmwf", 7, "2026-09-01",
    ),
)
SCENARIOS_BY_ID = {s.id: s for s in SCENARIOS}

#: The scenario shown when the dashboard first loads.
DEFAULT_SCENARIO_ID = "high"
