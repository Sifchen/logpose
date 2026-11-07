# build the react app with node, then fastapi serves it

FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build


FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"

# deps first so this layer is cached until uv.lock changes
COPY api/pyproject.toml api/uv.lock api/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api/ ./
RUN uv sync --frozen --no-dev
COPY --from=web /web/dist ./static

ENV STATIC_DIR=/app/static
EXPOSE 8000
# migrate, load cards/prices if missing, then start
CMD ["sh", "-c", "alembic upgrade head && logpose setup && exec uvicorn api.main:app --host 0.0.0.0 --port 8000"]
