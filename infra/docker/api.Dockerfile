# Quran Companion API — scaffold image (task 0.1). Build context = repo root.
FROM python:3.12-slim

WORKDIR /srv/api
COPY services/api/pyproject.toml ./
COPY services/api/app ./app
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
