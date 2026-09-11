-- AtmosGuard relational schema.
--
-- Written to run unchanged on PostgreSQL (the production target) and SQLite
-- (local development). Portability rules followed here:
--   * TEXT / REAL / INTEGER / TIMESTAMP only - no SERIAL, no JSONB, no arrays.
--   * No ON CONFLICT ... WHERE, no partial-index predicates.
--   * Surrogate keys are supplied by the application, not the database, so the
--     same INSERT works on both engines.
--
-- TimescaleDB hypertable conversion lives in schema_timescale.sql and is
-- applied only on PostgreSQL.

CREATE TABLE IF NOT EXISTS locations (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    state               TEXT NOT NULL,
    lat                 REAL NOT NULL,
    lon                 REAL NOT NULL,
    is_featured         INTEGER NOT NULL DEFAULT 0,
    rain_climatology    REAL NOT NULL,
    temp_climatology    REAL NOT NULL,
    historical_skill    REAL NOT NULL,
    convective_index    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS model_versions (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    version             TEXT NOT NULL,
    kind                TEXT NOT NULL,
    trained             INTEGER NOT NULL DEFAULT 0,
    explanation_method  TEXT NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMP NOT NULL
);

-- One row per (site, variable, NWP model, initialisation, lead time).
CREATE TABLE IF NOT EXISTS forecasts (
    id                  TEXT PRIMARY KEY,
    location_id         TEXT NOT NULL REFERENCES locations(id),
    variable_id         TEXT NOT NULL,
    nwp_model_id        TEXT NOT NULL,
    base_date           TIMESTAMP NOT NULL,
    valid_date          TIMESTAMP NOT NULL,
    lead_time           INTEGER NOT NULL,
    deterministic_value REAL NOT NULL,
    ensemble_mean       REAL NOT NULL,
    ensemble_sd         REAL NOT NULL,
    unit                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forecasts_lookup
    ON forecasts (location_id, variable_id, nwp_model_id, base_date, lead_time);
CREATE INDEX IF NOT EXISTS idx_forecasts_valid ON forecasts (valid_date);

-- Individual ensemble member trajectories.
CREATE TABLE IF NOT EXISTS ensemble_members (
    id                  TEXT PRIMARY KEY,
    forecast_id         TEXT NOT NULL REFERENCES forecasts(id),
    member_number       INTEGER NOT NULL,
    value               REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_forecast ON ensemble_members (forecast_id);

-- Model inputs, stored one row per predictor so new predictors do not require
-- a migration (the alternative, a wide table, breaks every time the feature
-- set changes).
CREATE TABLE IF NOT EXISTS features (
    id                  TEXT PRIMARY KEY,
    location_id         TEXT NOT NULL REFERENCES locations(id),
    variable_id         TEXT NOT NULL,
    nwp_model_id        TEXT NOT NULL,
    base_date           TIMESTAMP NOT NULL,
    lead_time           INTEGER NOT NULL,
    feature_name        TEXT NOT NULL,
    feature_value       REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_features_lookup
    ON features (location_id, variable_id, base_date, lead_time);

CREATE TABLE IF NOT EXISTS risk_predictions (
    id                  TEXT PRIMARY KEY,
    location_id         TEXT NOT NULL REFERENCES locations(id),
    variable_id         TEXT NOT NULL,
    nwp_model_id        TEXT NOT NULL,
    model_version_id    TEXT NOT NULL REFERENCES model_versions(id),
    base_date           TIMESTAMP NOT NULL,
    valid_date          TIMESTAMP NOT NULL,
    lead_time           INTEGER NOT NULL,
    risk_score          REAL NOT NULL,
    risk_category       TEXT NOT NULL,
    forecast_confidence REAL NOT NULL,
    model_confidence    REAL NOT NULL,
    explanation         TEXT,
    created_at          TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risk_lookup
    ON risk_predictions (location_id, variable_id, base_date, lead_time);
CREATE INDEX IF NOT EXISTS idx_risk_valid ON risk_predictions (valid_date);

-- Per-prediction feature attributions (SHAP values, or their exact linear
-- equivalent for the baseline model).
CREATE TABLE IF NOT EXISTS risk_contributions (
    id                  TEXT PRIMARY KEY,
    risk_prediction_id  TEXT NOT NULL REFERENCES risk_predictions(id),
    feature_name        TEXT NOT NULL,
    feature_value       REAL NOT NULL,
    contribution        REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contrib_prediction
    ON risk_contributions (risk_prediction_id);

CREATE TABLE IF NOT EXISTS historical_analogues (
    id                  TEXT PRIMARY KEY,
    event_date          TEXT NOT NULL,
    region              TEXT NOT NULL,
    regime              TEXT NOT NULL,
    pattern             TEXT NOT NULL,
    fingerprint_regime_change    REAL NOT NULL,
    fingerprint_forcing          REAL NOT NULL,
    fingerprint_moisture         REAL NOT NULL,
    fingerprint_convective       REAL NOT NULL,
    bust_occurred       INTEGER NOT NULL,
    outcome             TEXT NOT NULL,
    verified_error      TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
    id                  TEXT PRIMARY KEY,
    location_id         TEXT NOT NULL REFERENCES locations(id),
    variable_id         TEXT NOT NULL,
    risk_prediction_id  TEXT REFERENCES risk_predictions(id),
    issued_at           TIMESTAMP NOT NULL,
    valid_date          TIMESTAMP NOT NULL,
    lead_time           INTEGER NOT NULL,
    severity            TEXT NOT NULL,
    risk_score          REAL NOT NULL,
    headline            TEXT NOT NULL,
    reason              TEXT NOT NULL,
    recommended_action  TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Monitoring',
    acknowledged_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_issued ON alerts (issued_at);

-- Forecast-vs-observation verification, and the derived bust label that the
-- risk model is trained and scored against.
CREATE TABLE IF NOT EXISTS verification_metrics (
    id                  TEXT PRIMARY KEY,
    location_id         TEXT NOT NULL REFERENCES locations(id),
    variable_id         TEXT NOT NULL,
    base_date           TIMESTAMP NOT NULL,
    valid_date          TIMESTAMP NOT NULL,
    lead_time           INTEGER NOT NULL,
    forecast_value      REAL NOT NULL,
    observed_value      REAL NOT NULL,
    error               REAL NOT NULL,
    normalised_error    REAL NOT NULL,
    bust                INTEGER NOT NULL,
    source              TEXT NOT NULL DEFAULT 'demo'
);

CREATE INDEX IF NOT EXISTS idx_verification_lookup
    ON verification_metrics (location_id, variable_id, valid_date);
