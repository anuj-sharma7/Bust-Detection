"""AtmosGuard HTTP API.

Route handlers stay thin: validate inputs, delegate to `app.core.service`,
return. Every payload that carries simulated numbers also carries `data_mode`
and `demo_notice` so no client can render them as operational output by
accident.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from ..config import settings
from ..core import alerts as alerts_core
from ..core import climate, risk_model, scenarios, service, verification
from ..ingest import sources as ingest_sources
from ..core.domain import (
    ALL_SITES_BY_ID,
    LOCATIONS,
    MODELS,
    MODELS_BY_ID,
    REGIONS,
    RISK_BANDS,
    VARIABLES,
    VARIABLES_BY_ID,
)
from ..schemas import (
    AlertsResponse,
    MetaResponse,
    NetworkResponse,
    RiskResponse,
    VerificationResponse,
)

router = APIRouter(prefix="/api")

HORIZONS = [3, 4, 5, 6, 7]

BAND_COLORS = {
    "LOW": "#22c55e",
    "MODERATE": "#eab308",
    "HIGH": "#f97316",
    "SEVERE": "#ef4444",
}


def _reference_date() -> date:
    return date.fromisoformat(settings.demo_reference_date)


def _parse_date(value: str | None) -> date:
    if not value:
        return _reference_date()
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid date '{value}'") from exc


def _validate(location_id: str, variable_id: str, model_id: str, horizon: int) -> None:
    if location_id not in ALL_SITES_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown location '{location_id}'")
    if variable_id not in VARIABLES_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown variable '{variable_id}'")
    if model_id not in MODELS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown model '{model_id}'")
    if horizon not in HORIZONS:
        raise HTTPException(
            status_code=422, detail=f"Forecast horizon must be one of {HORIZONS}"
        )


@router.get("/meta", response_model=MetaResponse)
def meta() -> dict:
    """Everything the client needs to render its selectors and legends."""
    default = scenarios.SCENARIOS_BY_ID[scenarios.DEFAULT_SCENARIO_ID]
    return {
        "app_name": settings.app_name,
        "tagline": settings.tagline,
        "version": settings.version,
        "data_mode": settings.data_mode,
        "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
        "reference_date": settings.demo_reference_date,
        "locations": [
            {**loc.__dict__, "featured": True}
            for loc in LOCATIONS
        ],
        "regions": [{**loc.__dict__, "featured": False} for loc in REGIONS],
        "variables": [v.__dict__ for v in VARIABLES],
        "models": [m.__dict__ for m in MODELS],
        "risk_bands": [
            {"name": name, "min": lo, "max": hi, "color": BAND_COLORS[name]}
            for name, lo, hi, _upper in RISK_BANDS
        ],
        "horizons": HORIZONS,
        "scenarios": [s.__dict__ for s in scenarios.SCENARIOS],
        "default_selection": {
            "location_id": default.location_id,
            "variable_id": default.variable_id,
            "model_id": default.model_id,
            "horizon": default.horizon,
            "base_date": default.base_date,
            "scenario_id": default.id,
        },
        "disclaimer": service.DISCLAIMER,
    }


@router.get("/risk", response_model=RiskResponse)
def risk(
    location: str = Query(..., description="Location or region id"),
    horizon: int = Query(5, ge=3, le=7, description="Forecast horizon in days"),
    variable: str = Query("rainfall"),
    model: str = Query("ecmwf"),
    forecast_date: str | None = Query(None, description="Initialisation date (ISO)"),
) -> dict:
    """Forecast bust risk, explanation, ensemble, analogues and verification."""
    _validate(location, variable, model, horizon)
    return service.risk_bundle(location, variable, model, _parse_date(forecast_date), horizon)


@router.get("/scenario/{scenario_id}", response_model=RiskResponse)
def scenario(scenario_id: str) -> dict:
    """Resolve a curated Demo Mode scenario."""
    if scenario_id not in scenarios.SCENARIOS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown scenario '{scenario_id}'")
    return service.resolve_scenario(scenario_id)


@router.get("/network", response_model=NetworkResponse)
def network(
    horizon: int = Query(5, ge=3, le=7),
    variable: str = Query("rainfall"),
    model: str = Query("ecmwf"),
    forecast_date: str | None = Query(None),
) -> dict:
    """Risk across the whole monitoring network - powers the map and KPI row."""
    _validate(next(iter(ALL_SITES_BY_ID)), variable, model, horizon)
    base_date = _parse_date(forecast_date)
    summary = alerts_core.network_summary(base_date.isoformat(), variable, horizon, model)
    return {
        **summary,
        "variable_id": variable,
        "horizon": horizon,
        "model_id": model,
        "base_date": base_date.isoformat(),
        "data_mode": settings.data_mode,
        "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
    }


@router.get("/alerts", response_model=AlertsResponse)
def alert_list(
    forecast_date: str | None = Query(None),
    model: str = Query("ecmwf"),
    severity: str | None = Query(None, description="Filter: LOW/MODERATE/HIGH/SEVERE"),
) -> dict:
    """Active early-warning alerts across the monitoring network."""
    if model not in MODELS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown model '{model}'")
    base_date = _parse_date(forecast_date)
    items = list(alerts_core.scan(base_date.isoformat(), model))

    counts: dict[str, int] = {"LOW": 0, "MODERATE": 0, "HIGH": 0, "SEVERE": 0}
    for item in items:
        counts[str(item["severity"])] += 1

    if severity:
        wanted = severity.upper()
        if wanted not in counts:
            raise HTTPException(status_code=422, detail=f"Unknown severity '{severity}'")
        items = [i for i in items if i["severity"] == wanted]

    return {
        "alerts": items,
        "counts": counts,
        "threshold": alerts_core.ALERT_THRESHOLD,
        "probability_threshold": alerts_core.ALERT_PROBABILITY,
        "base_date": base_date.isoformat(),
        "data_mode": settings.data_mode,
        "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
        "disclaimer": service.DISCLAIMER,
    }


@router.get("/verification/model", response_model=VerificationResponse)
def model_verification(forecast_date: str | None = Query(None)) -> dict:
    """Risk-model classification performance, computed over the dataset."""
    base_date = _parse_date(forecast_date)
    return {
        "model_performance": verification.model_performance(base_date),
        "label": "MVP Demonstration Metrics"
        if settings.is_demo
        else "Operational verification",
        "data_mode": settings.data_mode,
        "demo_notice": service.DEMO_NOTICE if settings.is_demo else None,
        "disclaimer": service.DISCLAIMER,
    }


@router.get("/verification/forecast")
def forecast_verification(
    location: str = Query(...),
    variable: str = Query("rainfall"),
    forecast_date: str | None = Query(None),
    lookback: int = Query(21, ge=7, le=90),
) -> dict:
    """Rolling forecast-vs-observation verification for one site."""
    if location not in ALL_SITES_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown location '{location}'")
    if variable not in VARIABLES_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown variable '{variable}'")
    base_date = _parse_date(forecast_date)
    payload = verification.forecast_verification(location, variable, base_date, lookback)
    return {
        **payload,
        "location_id": location,
        "variable_id": variable,
        "label": "MVP Demonstration Metrics" if settings.is_demo else "Operational verification",
        "data_mode": settings.data_mode,
    }


@router.get("/sources")
def data_sources() -> dict:
    """The catalogue of official data sources, with references.

    Status is honest: only datasets physically present and wired in are marked
    "in use". Everything else is a documented route to data this system could
    consume, not a live connection.
    """
    return {
        "sources": [s.__dict__ for s in ingest_sources.SOURCES],
        "in_use": [s.id for s in ingest_sources.in_use()],
        "counts": {
            level: len(ingest_sources.by_access(level))
            for level in ingest_sources.ACCESS_ORDER
        },
        "note": "Portal addresses are stable; deep links to individual files are not. "
        "Confirm the exact path at the source.",
    }


@router.get("/climate/{location_id}")
def climate_profile(location_id: str) -> dict:
    """Long-record climate context for a site's IMD sub-division.

    Trend, variability, the distribution of past monsoons against IMD's own
    departure categories, and the decadal record - all from the published
    1901-2017 series. This is the background a forecaster reads a single
    forecast against.
    """
    site = ALL_SITES_BY_ID.get(location_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Unknown location '{location_id}'")
    payload = climate.profile(site.subdivision)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail=f"No climate record for sub-division '{site.subdivision}'",
        )
    return {**payload, "location_id": site.id, "location_name": site.name}


@router.get("/system/status")
def system_status(forecast_date: str | None = Query(None)) -> dict:
    """Data-source and pipeline status."""
    return service.system_status(_parse_date(forecast_date))


@router.get("/model/card")
def model_card() -> dict:
    """Model card for the risk estimator currently in use."""
    return risk_model.model_card()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "data_mode": settings.data_mode, "version": settings.version}
