FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir --upgrade pip

FROM base AS development

RUN pip install --no-cache-dir --editable ".[dev]"

COPY tests ./tests

EXPOSE 8000

CMD ["uvicorn", "chiron_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "chiron_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
