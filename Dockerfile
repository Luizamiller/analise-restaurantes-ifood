# 1) build do frontend
FROM node:22-alpine AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# 2) API analítica (DuckDB) + frontend estático
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 UV_LINK_MODE=copy
RUN pip install --no-cache-dir uv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
COPY src/ /app/src/
COPY reports/ /app/reports/
COPY figures/ /app/figures/
COPY --from=web /web/dist /app/web/dist
EXPOSE 8000
# Monte data/processed com os Parquet gerados por `pipeline.build` para habilitar filtros e explorador.
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
