"""Export a static snapshot of the API for a backend-free deployment.

    python -m scripts.export_snapshot            # writes frontend/snapshot.json

Fetches every combination the shared preview should support and writes them
under canonical keys (path + alphabetically sorted query), which is what
`frontend/src/api/client.ts` looks up when a snapshot is embedded.

Scope is deliberate rather than exhaustive: every site for rainfall (the
variable the model is actually fitted on), plus the other variables and models
for the ten featured cities. A full cross-product would be 3,000 payloads and
tens of megabytes to serve a preview.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.config import settings
from app.core import service, verification
from app.core.alerts import ALERT_PROBABILITY, ALERT_THRESHOLD, network_summary, scan
from app.core.domain import ALL_SITES, DETERMINISTIC_MODEL_IDS, LOCATIONS, VARIABLES
from app.core.scenarios import SCENARIOS
from app.api.routes import HORIZONS, data_sources, meta
from app.core import climate

OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "snapshot.json"

OTHER_MODELS = (*DETERMINISTIC_MODEL_IDS, "ensemble")


def key(path: str, params: dict[str, object]) -> str:
    items = sorted((k, str(v)) for k, v in params.items() if v not in (None, ""))
    query = "&".join(f"{k}={v}" for k, v in items)
    return f"{path}?{query}" if query else path


def main() -> None:
    base_iso = settings.demo_reference_date
    base = date.fromisoformat(base_iso)
    snap: dict[str, object] = {}

    snap["/meta"] = meta()
    snap["/sources"] = data_sources()

    # Climate context is per site and independent of the forecast selection.
    for site in ALL_SITES:
        profile = climate.profile(site.subdivision)
        if profile is not None:
            snap[f"/climate/{site.id}"] = {
                **profile,
                "location_id": site.id,
                "location_name": site.name,
            }

    def add_risk(location: str, variable: str, model: str, horizon: int) -> None:
        snap[
            key(
                "/risk",
                {
                    "location": location,
                    "variable": variable,
                    "model": model,
                    "horizon": horizon,
                    "forecast_date": base_iso,
                },
            )
        ] = service.risk_bundle(location, variable, model, base, horizon)

    # Every monitored site, for rainfall - the variable the model is fitted on.
    for site in ALL_SITES:
        for horizon in HORIZONS:
            add_risk(site.id, "rainfall", "ecmwf", horizon)

    # Featured cities: the other variables, and the other models.
    for site in LOCATIONS:
        for variable in VARIABLES:
            if variable.id != "rainfall":
                for horizon in HORIZONS:
                    add_risk(site.id, variable.id, "ecmwf", horizon)
        for model in OTHER_MODELS:
            if model != "ecmwf":
                for horizon in HORIZONS:
                    add_risk(site.id, "rainfall", model, horizon)

    # Curated scenarios may sit on other dates.
    for scenario in SCENARIOS:
        scenario_date = date.fromisoformat(scenario.base_date)
        snap[f"/scenario/{scenario.id}"] = service.resolve_scenario(scenario.id)
        snap[
            key(
                "/risk",
                {
                    "location": scenario.location_id,
                    "variable": scenario.variable_id,
                    "model": scenario.model_id,
                    "horizon": scenario.horizon,
                    "forecast_date": scenario.base_date,
                },
            )
        ] = service.risk_bundle(
            scenario.location_id,
            scenario.variable_id,
            scenario.model_id,
            scenario_date,
            scenario.horizon,
        )

    # Network views behind the map and the KPI strip.
    def add_network(variable: str, model: str, horizon: int, when: str) -> None:
        summary = network_summary(when, variable, horizon, model)
        snap[
            key(
                "/network",
                {"variable": variable, "model": model, "horizon": horizon, "forecast_date": when},
            )
        ] = {
            **summary,
            "variable_id": variable,
            "horizon": horizon,
            "model_id": model,
            "base_date": when,
            "data_mode": settings.data_mode,
            "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
        }

    dates = {base_iso, *(s.base_date for s in SCENARIOS)}
    for when in dates:
        for horizon in HORIZONS:
            for variable in VARIABLES:
                add_network(variable.id, "ecmwf", horizon, when)
            for model in OTHER_MODELS:
                if model != "ecmwf":
                    add_network("rainfall", model, horizon, when)

    # Alerts, verification and system status.
    for when in dates:
        items = list(scan(when, "ecmwf"))
        counts = {"LOW": 0, "MODERATE": 0, "HIGH": 0, "SEVERE": 0}
        for item in items:
            counts[str(item["severity"])] += 1
        payload = {
            "alerts": items,
            "counts": counts,
            "threshold": ALERT_THRESHOLD,
            "probability_threshold": ALERT_PROBABILITY,
            "base_date": when,
            "data_mode": settings.data_mode,
            "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
            "disclaimer": service.DISCLAIMER,
        }
        snap[key("/alerts", {"forecast_date": when})] = payload
        for severity in ("SEVERE", "HIGH"):
            snap[key("/alerts", {"forecast_date": when, "severity": severity})] = {
                **payload,
                "alerts": [a for a in items if a["severity"] == severity],
            }

        when_date = date.fromisoformat(when)
        snap[key("/verification/model", {"forecast_date": when})] = {
            "model_performance": verification.model_performance(when_date),
            "label": "Fitted on real IMD observations",
            "data_mode": settings.data_mode,
            "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
            "disclaimer": service.DISCLAIMER,
        }
        snap[key("/system/status", {"forecast_date": when})] = service.system_status(when_date)

    OUTPUT.write_text(json.dumps(snap, separators=(",", ":")))
    size = OUTPUT.stat().st_size
    print(f"{len(snap):,} endpoints -> {OUTPUT.name}  ({size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    main()
