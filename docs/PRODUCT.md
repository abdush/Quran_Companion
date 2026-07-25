# Product Requirements — FR/NFR Registry

> **Status:** authoritative standalone copy of `ENGINEERING_HANDBOOK.md` §2–§4,
> reproduced **verbatim** so requirement ids are traceable without loading the
> handbook. Owner: Documentation Agent.
>
> **Traceability contract.** Every requirement id below (`FR-<area>-<n>`,
> `NFR-<n>`) is referenced by: task cards (handbook §29), branch/commit messages
> (`feat(qds): import Tanzil text [0.3.2, FR-RD-1]`), and at least one test id
> (handbook §23 — the traceability matrix is generated in CI). Ids are **never
> renumbered or reused**; a dropped requirement is struck through and kept.
>
> **Change rule.** The handbook is the source of truth (Rule: when code and
> handbook disagree, the handbook wins). Any edit to §2–§4 must be mirrored here
> in the same PR; the wording below is a copy, not a paraphrase.

---

# 2. Product Requirements

## 2.1 Product Pillars

1. **Read** — Mushaf-accurate rendering (Madani page layout), translations, word-by-word, tafsīr, audio with word-level highlighting.
2. **Memorise** — Structured hifz plans, chunking, audio loops, active-recall testing, first-word prompting, similar-verse disambiguation.
3. **Revise** — Spaced-repetition scheduling (FSRS-based), diagnostic "detection recitation" cycles, heatmaps, forgetting prediction.
4. **Recite & Correct** — On-device/edge ASR of recitation, diff against the canonical text, tajweed-rule feedback, teacher review.
5. **Learn** — Tajweed curriculum tied to classical texts (e.g., Tuḥfat al-Aṭfāl, al-Jazariyyah, al-Tuḥfa al-Samnūdiyya), vocabulary builder, root-word explorer, qira'at (later phases).
6. **Reflect** — Personal notes, categorised annotations at word/range granularity, journaling, semantic search over one's own notes.
7. **Together** — Family profiles, child mode with Arabic voice commands, teacher workflows, community-shared plans.

## 2.2 Release Definition

| Tier | Contents (summary) | Detailed scope |
|---|---|---|
| **MVP** | Mushaf reading, word-level annotations, hifz plans + FSRS revision, self-test recitation diff (server-side ASR), AI tutor with strict RAG citations, offline reading/revision, single-user auth + sync | §27 Phase 1 |
| **Phase 2** | Family + child voice mode, teacher review workflow, memorisation heatmap + forgetting prediction, confused-verse detection, vocabulary builder, community-shared plans, E2EE sync | §27 Phase 2 |
| **Phase 3** | On-device ASR, tajweed acoustic classification, root-word explorer, semantic search, qira'at module, plugin marketplace | §27 Phase 3 |
| **Future** | Phoneme-level tajweed scoring, live halaqah rooms, OCR of personal mushaf annotations, multi-madhhab knowledge packs | §30 |

---

# 3. Functional Requirements

Requirements are numbered `FR-<area>-<n>` and referenced throughout the handbook and in task breakdowns (§29). Priority: **M**ust (MVP), **S**hould (Phase 2), **C**ould (Phase 3+).

## 3.1 Reading (RD)

| ID | Requirement | Pri |
|---|---|---|
| FR-RD-1 | Render the Quran in authentic Madani mushaf page layout (604 pages) using QPC v2/KFGQPC glyph fonts and QUL page layout data | M |
| FR-RD-2 | Continuous (scroll) and paged reading modes; translation view with selectable translations (Tanzil/QUL sourced) | M |
| FR-RD-3 | Word-by-word display: Arabic + gloss + transliteration + morphology (from Quranic Arabic Corpus data) | M |
| FR-RD-4 | Audio playback per ayah/range/surah with word-level highlight sync (quran-align / QUL segment data) | M |
| FR-RD-5 | Tafsīr panel: at least 2 Arabic + 2 translated tafsīr collections from QUL, selectable, offline-downloadable | M |
| FR-RD-6 | Bookmarks, last-read positions (multiple named positions), navigation by surah/juz/hizb/page/ayah | M |
| FR-RD-7 | Tajweed-colour text rendering option (rule-coloured letters) | S |
| FR-RD-8 | Riwāyah selection (Ḥafṣ default; Warsh, Qālūn later) affecting text, layout, and audio | C |

## 3.2 Annotation (AN) — Mushafi feature set

| ID | Requirement | Pri |
|---|---|---|
| FR-AN-1 | Tap-select a single word or drag-select a word range on the mushaf | M |
| FR-AN-2 | Attach a categorised note to a selection; categories form a user-extensible tree with seeded roots: حفظ (memorisation), تجويد (tajweed), وقف وابتداء (stopping/starting) | M |
| FR-AN-3 | Colour-coded highlight rendering per category; filter highlights by category/surah/date | M |
| FR-AN-4 | Word addressing uses canonical `(surah, ayah, word_position)` integers compatible with Quran Foundation / QUL word IDs | M |
| FR-AN-5 | Notes support text, audio snippets, and links to tajweed rules in the knowledge base | S |
| FR-AN-6 | Export/import annotations (JSON), shareable note templates | S |

## 3.3 Memorisation (HZ)

| ID | Requirement | Pri |
|---|---|---|
| FR-HZ-1 | Create hifz plans: target portion, daily new amount, revision ratios (e.g., classical سبق/سبقي/منزل — new / near-past / long-past cycles) | M |
| FR-HZ-2 | Memorisation session tools: segment looping, hide-text recall mode, first-word/first-letter prompting, audio-before-text mode | M |
| FR-HZ-3 | Self-testing: recite from a random or chosen starting point; system transcribes and diffs against canonical text; errors classified (omission, substitution, insertion, hesitation, similar-verse jump) | M |
| FR-HZ-4 | Diagnostic "detection recitation" cycle: a structured pass over already-memorised portions that records a four-symbol classification per incident — complete stop, hesitation/substitution, similar-verse confusion, contextual pattern note | M |
| FR-HZ-5 | Per-ayah and per-page **strength score** (0–100) derived from test history + FSRS memory state | M |
| FR-HZ-6 | **Memorisation heatmap**: mushaf-page and juz-level visualisation of strength; **forgetting prediction** surfaces portions predicted to fall below a retention threshold within N days | S |
| FR-HZ-7 | **Confused-verse detection**: automatic identification of mutashābihāt pairs the user actually confuses (from test history), plus a curated similar-verse dataset for proactive drills | S |
| FR-HZ-8 | Mistake ledger integrated with annotations (an error in a test auto-creates/updates a حفظ annotation on the exact word) | M |

## 3.4 Revision Planning (RV)

| ID | Requirement | Pri |
|---|---|---|
| FR-RV-1 | FSRS-based scheduling at configurable granularity (ayah-group / quarter-page / page) with per-item memory state | M |
| FR-RV-2 | Daily queue generation respecting a user-set time budget and classical cycle constraints (recent portions revised daily regardless of FSRS) | M |
| FR-RV-3 | Manual grading (Again/Hard/Good/Easy) and automatic grading from recitation-test results | M |
| FR-RV-4 | Plan repair: missed days redistribute load without silently dropping items | M |
| FR-RV-5 | Long-term retention analytics dashboard (retention curve, workload forecast, strength trends) | S |

## 3.5 Recitation & Tajweed Correction (TJ)

| ID | Requirement | Pri |
|---|---|---|
| FR-TJ-1 | Record recitation with on-device VAD trimming; upload optional (privacy default: process-and-discard, see §18) | M |
| FR-TJ-2 | ASR transcription with diacritics using Quran-fine-tuned Whisper family models; word-level alignment to canonical text | M |
| FR-TJ-3 | Text-level error report: per-word verdict (correct / substituted / omitted / inserted / skipped-to-similar-verse) rendered on the mushaf | M |
| FR-TJ-4 | Rule-based tajweed lint on the *text path*: given the canonical text and stop position, flag rule contexts (madd, ghunnah, idghām, qalqalah, waqf validity) for the recited range and link each to knowledge-base rule cards | S |
| FR-TJ-5 | Acoustic tajweed classification (e.g., madd duration, ghunnah presence) — research-grade, clearly labelled as assistive, never authoritative | C |
| FR-TJ-6 | Teacher review workflow: student submits a recording; teacher plays it with the aligned text, drops time-anchored + word-anchored annotations, returns structured feedback | S |

## 3.6 AI Tutor & Knowledge (AI)

| ID | Requirement | Pri |
|---|---|---|
| FR-AI-1 | Conversational tutor that answers Quran/tajweed questions **only** with retrieved, cited passages from the curated knowledge base; refuses or defers when no source is found | M |
| FR-AI-2 | Every verse quoted by the AI is fetched verbatim from the canonical text store by reference — never generated | M |
| FR-AI-3 | Tutor modes: explain a verse (tafsīr-grounded), explain a tajweed rule (matn-grounded), quiz me, plan my week | M |
| FR-AI-4 | **Semantic search**: search the Quran and one's own notes by meaning (multilingual embeddings), always resolving results to canonical verse references | S |
| FR-AI-5 | **Root-word explorer**: browse all occurrences of a triliteral root across the Quran with morphology (Quranic Arabic Corpus data) | S |
| FR-AI-6 | **Personal vocabulary builder**: user saves words during reading; system generates FSRS flashcards with root, morphology, gloss, and example ayāt | S |
| FR-AI-7 | Configurable model backends (Anthropic API default; local/self-hosted via plugin) | S |

## 3.7 Family & Child Mode (FM)

| ID | Requirement | Pri |
|---|---|---|
| FR-FM-1 | Family accounts: guardian + child profiles; child profiles have no direct messaging, no external links, restricted AI surface | S |
| FR-FM-2 | **Arabic voice-command player** for children: select surah/ayah, repeat N times, next/previous, switch reciter — entirely by spoken Arabic commands; grammar-constrained command recognition (not open dictation) | S |
| FR-FM-3 | Guardian dashboard: child listening/memorisation activity, streaks, assigned portions | S |
| FR-FM-4 | Teacher features: classes, rosters, portion assignments, submission inbox, annotated review (see FR-TJ-6), class analytics | S |

## 3.8 Community (CM)

| ID | Requirement | Pri |
|---|---|---|
| FR-CM-1 | Publish/subscribe **study-plan templates** and **note templates** (content-moderated, no free-form social feed) | S |
| FR-CM-2 | Attribution and versioning of shared templates; one-tap fork into personal plans | S |

## 3.9 Platform (PL)

| ID | Requirement | Pri |
|---|---|---|
| FR-PL-1 | Mobile app (iOS/Android) and web app with feature parity for reading/memorisation/revision | M |
| FR-PL-2 | Full offline operation of reading, annotation, memorisation, and revision; sync on reconnect | M |
| FR-PL-3 | Multi-device sync with conflict-free merging of annotations and revision state | M |
| FR-PL-4 | Plugin system per §20 | C |
| FR-PL-5 | Interface languages: Arabic (RTL-first) and English at minimum; i18n framework for more | M |

---

# 4. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | **Correctness** | Quran text checksums verified against Tanzil Uthmani reference at build time and at every client data-pack install. Any mismatch is a fatal error. |
| NFR-2 | **Availability** | Backend 99.5% monthly (self-host tier); clients degrade gracefully to full offline. |
| NFR-3 | **Performance** | See §26 for concrete budgets (page render < 16 ms/frame, audio highlight drift < 60 ms, ASR feedback < 5 s for a 30 s clip on server path). |
| NFR-4 | **Privacy** | Recitation audio never retained server-side beyond processing unless the user explicitly saves/submits it. Private notes E2EE in Phase 2 (§18.4). |
| NFR-5 | **Security** | OWASP ASVS L2; all services behind authenticated gateway; secrets via environment/secret manager only. |
| NFR-6 | **Accessibility** | WCAG 2.1 AA on web; dynamic type, screen-reader labels, high-contrast mushaf theme. |
| NFR-7 | **Internationalisation** | RTL-first layouts; all UI strings externalised; Arabic typography correctness (no broken ligatures, correct Uthmani glyphs). |
| NFR-8 | **Portability** | Entire backend runs via `docker compose up` for self-hosting; no proprietary cloud dependency in core path. |
| NFR-9 | **Licensing** | Core code MIT; every bundled dataset carries its upstream license and attribution manifest (§6.4). |
| NFR-10 | **Cost** | AI features degrade to cheaper/local models by configuration; no feature hard-requires a paid API. |
| NFR-11 | **Observability** | Structured logs, traces, metrics on every service (§25); no PII in logs. |
| NFR-12 | **Data integrity** | Sync is loss-less: no silent overwrite; conflicts resolved by CRDT merge or surfaced to the user (§19). |


---

_Verbatim copy of handbook §2–§4 (lines 83–224 at the time of writing, task 0.4)._
