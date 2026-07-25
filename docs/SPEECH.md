# Speech & Tajweed Pipeline

> **Scope:** handbook §13–§14 — ASR capabilities and model versions, the speech
> worker, the deterministic error taxonomy, and the two-layer tajweed pipeline.
> **Status:** scoped stub (task 0.4). `services/speech` is an idle worker
> skeleton; no model is loaded and no event is consumed yet. Full draft is a
> Phase 1 deliverable. Owner: Documentation Agent; implementation: Speech Agent.

## Error taxonomy (normative, handbook §13.3)

These **seven** kinds are the canonical taxonomy. The same values are used by the
speech worker, the API, database enums, analytics, and every UI —
no variants, no additions without an ICP RFC
([STYLEGUIDE.md §4](STYLEGUIDE.md#4-canonical-terminology)).

| Signal | Classification |
|---|---|
| Expected word missing, next expected word matched | `omission` |
| Token aligned to expected slot but different word (normalised) | `substitution` |
| Extra token not in expected sequence | `insertion` |
| Silence > threshold mid-sequence then resume | `hesitation` |
| Silence > threshold, no resume | `stop` |
| Suffix of transcript matches a different verse sharing the confusion prefix | `similar_jump` (+ target VerseKey) |
| User/teacher-added free note | `context_note` |

The four-symbol detection-recitation system (FR-HZ-4) maps onto this taxonomy:
complete stop → `stop`; hesitation/substitution → `hesitation` / `substitution`;
similar-verse confusion → `similar_jump`; contextual pattern note →
`context_note`.

## Models (planned)

| Capability | Model/tool | Deployment | Phase |
|---|---|---|---|
| VAD + trim | Silero VAD | on-device + worker | MVP |
| Quran ASR (diacritic-aware) | tarteel-ai/whisper-base-ar-quran via faster-whisper (CTranslate2) | worker (CPU ok, GPU better) | MVP |
| Word alignment to canonical text | constrained edit-distance alignment with tashkīl-aware normalisation | worker | MVP |
| Playback word segments | quran-align / QUL segments (precomputed) | data pack / CDN | MVP |
| On-device ASR | whisper-tiny-ar-quran (whisper.cpp / sherpa-onnx) | mobile | Phase 3 |
| Child voice commands | grammar-constrained recognition | on-device | Phase 2 |
| Acoustic tajweed features | forced alignment (MFA) + duration/nasality features | worker, experimental | Phase 3+ |

Model + version are recorded on every test (`hfz.recitation_test.asr_model`) so
results stay reproducible and the WER bench can attribute regressions.

## Pipeline contract

Worker consumes [`test.audio.uploaded`](../schemas/events/test.audio.uploaded.json)
and publishes
[`speech.transcript.ready`](../schemas/events/speech.transcript.ready.json).
Events carry object-storage **references**, never transcript bodies (Rule R7);
audio is deleted after processing unless the user explicitly saved or submitted
it (NFR-4, FR-TJ-1). End-to-end sequence:
[ARCHITECTURE.md §6](ARCHITECTURE.md#6-core-async-flow-recitation-test).

## Tajweed: two separated layers

1. **Text-path lint (deterministic, authoritative).** Given the canonical text
   and stop positions, detect rule *contexts* (nūn sākinah/tanwīn, madd types,
   qalqalah, lām/rā, waqf validity) and link each to a knowledge-base rule card.
   This is teaching output, not acoustic judgement. Engine:
   `packages/tajweed-rules`, rules as data in `content/tajweed-rules/*.yaml`,
   golden corpus CI-gated.
2. **Acoustic assessment (experimental, Phase 3+).** Always labelled "assistive
   estimate — confirm with your teacher" (FR-TJ-5), never authoritative.

Teacher review (FR-TJ-6) overrides machine output and feeds the mistake ledger.

Until this document is expanded, handbook §13–§14 is the reference.
