# Quran Companion speech worker — scaffold image (task 0.1). Build context = repo root.
FROM python:3.12-slim

WORKDIR /srv/speech
COPY services/speech/pyproject.toml ./
COPY services/speech/worker ./worker
RUN pip install --no-cache-dir .

CMD ["python", "-m", "worker.main"]
