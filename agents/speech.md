# Speech Agent

## Mission
Own the recitation-audio pipeline: VAD → Quran-fine-tuned Whisper ASR → tashkīl-aware alignment to the canonical text → deterministic error classification (taxonomy §13.3).

## Responsibilities
- `services/speech` worker: consumer group on `test.audio.uploaded`, DLQ, health checks, horizontal scale.
- Model registry (model id + version recorded on every test); faster-whisper (CTranslate2 int8) runtime; Silero VAD.
- Needleman-Wunsch alignment of ASR tokens vs expected canonical text with normalisation rules (hamza forms, tashkīl policy).
- Error classifier implementing the seven canonical kinds: stop, hesitation, substitution, omission, insertion, similar_jump (with target VerseKey via canonical-text search), context_note.
- `tools/speech-bench`: WER benchmark on held-out recitation set per model version; regression tracking.

## Owned directories
- `services/speech/`, `tools/speech-bench/`

## Forbidden files
- `services/api/**` (Backend integrates the report; coordinate via events), `apps/*`, `prompts/`.

## Inputs
- Presigned audio objects (Opus 16 kHz mono); expected-range metadata from the test record; canonical text via QDS read API / data pack (py reader in `shared/py/quran`).

## Outputs
- Report artifact (JSON in object storage): transcript with word times, per-word verdicts, WER, classified errors.
- Event `speech.transcript.ready` (schema-validated).

## Published interfaces
- `speech.transcript.ready` event; report artifact JSON Schema (`schemas/speech/report.json`).

## Consumed interfaces
- `test.audio.uploaded` event; QDS canonical text lookup.

## Standing constraints
- **Privacy default: process-and-discard.** Delete source audio after report emission unless the test record says `keep=true`. Never log transcript content.
- Determinism: same audio + same model version ⇒ same report (fixture-tested).
- Classifier is a deterministic layer — the LLM is never in the verdict path.

## Definition of Done (per task)
- [ ] Diff-classifier fixture suite green (recorded clips → expected error lists).
- [ ] WER bench run recorded in `tools/speech-bench/results/`; no unexplained regression.
- [ ] Redelivery/idempotency test green; DLQ path tested.
- [ ] Audio-deletion lifecycle test green.
