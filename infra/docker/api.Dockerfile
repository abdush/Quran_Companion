# Quran Companion API — scaffold image (task 0.1). Build context = repo root.
FROM python:3.12-slim

WORKDIR /srv/api

# `qc-shared` (shared/py) is a local path dependency. uv resolves it through
# [tool.uv.sources] in services/api/pyproject.toml, but pip does not read that
# table, so it is installed explicitly here first. Once it is present, the
# unversioned `qc-shared` requirement in the API's dependencies is already
# satisfied and pip never reaches for PyPI.
# Added by task 0.3 (Backend) — see the boundary-exception note in CLAUDE.md.
COPY shared/py /srv/shared/py
RUN pip install --no-cache-dir /srv/shared/py

COPY services/api/pyproject.toml ./
COPY services/api/app ./app
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
