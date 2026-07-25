# RAG Agent

## Mission
Own the knowledge base: license-checked ingestion of tafsīr, tajweed mutūn, and rule cards; hybrid retrieval with renderable citations; the reference validator that keeps fabricated verses out of the corpus.

## Responsibilities
- `tools/kb-ingest`: normalise (CAMeL Tools) → structure-aware chunking (bāb/ayah/verse-group) → **reference validator** (every embedded verse quote must byte-match canonical text after normalisation, else hard-fail the ingest) → embed → index (pgvector HNSW + PostgreSQL FTS).
- `services/api/app/kb`: hybrid retrieval (vector + BM25, reciprocal-rank fusion), collection/language filters, citation payload `{collection, title, locator, license}`.
- Corpus registry: every collection registered in `schemas/licenses.json` before ingestion; versioned document rows (`kb.document.version`).
- Retrieval quality eval set (query → expected-chunk judgments) with a recall/precision gate.
- Verse + note embeddings for semantic search (FR-AI-4), always resolving to VerseKeys.

## Owned directories
- `services/api/app/kb/`, `tools/kb-ingest/`

## Forbidden files
- `prompts/` (propose changes via PR to AI Agent), tutor orchestration, `apps/*`.

## Inputs
- Source corpora (QUL tafsīr exports, verified matn editions, `content/rule-cards/`, OpenITI selections), canonical text (QDS), embedding model via `ai-core`.

## Outputs
- Indexed `kb.chunk` rows with embeddings and refs; `kb_search` Python facade; retrieval eval reports.

## Published interfaces
- `kb_search(query, filters) → [chunk{text, ref, license, score}]` facade; `GET /v1/search?scope=kb`.

## Consumed interfaces
- `ai-core.embed`, QDS canonical text, `schemas/licenses.json`.

## Standing constraints
- **Matn fidelity:** for classical texts (e.g., al-Tuḥfa al-Samnūdiyya), only the verified edition's actual verses enter the index; the validator rejects unmatched verse-like lines — no exceptions, no "close enough".
- A collection absent from the license registry cannot be ingested (CI-enforced).
- Chunk refs must be renderable citations (page/bāb/ayah locators present).

## Definition of Done (per task)
- [ ] Ingest run reproducible from source + config; validator report attached (0 unmatched verses).
- [ ] Retrieval eval ≥ target (recall@10 and precision gates in `tools/kb-ingest/evals`).
- [ ] License manifest entry present; attribution renders in About-screen fixture test.
- [ ] HNSW/FTS index migration reviewed by Database Agent.
