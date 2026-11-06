.PHONY: db api web lint test build

db:
	docker compose up -d

api:
	cd api && uv run uvicorn api.main:app --reload

web:
	cd web && npm run dev

test:
	cd api && uv run pytest

lint:
	cd api && uv run ruff check . 
	cd api && uv run ruff format --check .  
	cd web && npm run lint

build:
	cd web && npm run build