FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip

FROM base AS development

COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations

RUN pip install --no-cache-dir --editable ".[dev]"

COPY tests ./tests

EXPOSE 8000

CMD ["uvicorn", "chiron_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production

COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations

RUN pip install --no-cache-dir .
RUN groupadd --system --gid 10001 chiron \
    && useradd --system --uid 10001 --gid chiron --home-dir /app chiron \
    && mkdir -p /app/uploads \
    && chown -R chiron:chiron /app/uploads

USER chiron

EXPOSE 8000

CMD ["uvicorn", "chiron_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
