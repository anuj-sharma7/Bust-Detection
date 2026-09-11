.PHONY: install dev-api dev-ui build demo test lint seed calibrate fit basemap static clean

VENV := .venv
PY   := $(VENV)/bin/python

install:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -r backend/requirements.txt pytest httpx
	npm --prefix frontend install

dev-api:
	cd backend && ../$(PY) -m uvicorn app.main:app --reload --port 8000

dev-ui:
	npm --prefix frontend run dev

build:
	npm --prefix frontend run build

# Build the UI, then serve API and UI together from a single process.
demo: build
	cd backend && ../$(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000

test:
	cd backend && ../$(PY) -m pytest tests/ -q

lint:
	npm --prefix frontend run typecheck

seed:
	cd backend && ../$(PY) -m app.db.seed --days 7

calibrate:
	cd backend && ../$(PY) -m scripts.calibrate

# Rebuild the bundled India map from the DataMeet boundary shapefile.
basemap:
	cd backend && ../$(PY) -m scripts.build_basemap

# Refit the risk model on the real IMD observations.
fit:
	cd backend && ../$(PY) -m scripts.fit_model

# Single self-contained HTML file: the whole dashboard with the API responses
# baked in, for a read-only deployment with no backend.
static: build
	cd backend && ../$(PY) -m scripts.export_snapshot
	npm --prefix frontend run package-static

clean:
	rm -rf frontend/dist frontend/node_modules $(VENV) atmosguard.db
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
