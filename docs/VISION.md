# Vision

> **Scope:** handbook §1 — mission, guiding principles, personas, non-goals.
> **Status:** scoped stub (task 0.4). The handbook text below is condensed; the
> expanded persona journeys and non-goal rationale are written when Phase 1 UX
> work starts. Owner: Documentation Agent.

## Mission

Build the most comprehensive **open-source, AI-assisted Quran platform** — a
companion that supports a Muslim's lifelong relationship with the Quran across
reading, memorisation (hifz), revision, tajweed mastery, reflection, and
learning — for individuals, families, teachers, and study circles.

## Guiding principles

| # | Principle | Engineering implication |
|---|---|---|
| P1 | Authenticity is non-negotiable | Text and knowledge come only from verified, citable sources; the AI may never generate a verse, hadith, or ruling from its weights (D-009, [AI.md](AI.md)) |
| P2 | Reuse before rebuild | Tanzil, QUL, quran-align, QAC, OpenITI, CAMeL Tools, Whisper fine-tunes are integrated, not reimplemented ([DATA.md](DATA.md)) |
| P3 | Local-first, privacy-first | Data on-device by default; sync opt-in; private content E2EE in Phase 2 ([SECURITY.md](SECURITY.md), [SYNC.md](SYNC.md)) |
| P4 | Modular, agent-buildable | Every feature is an independently buildable module with an interface, an owner, and a Definition of Done (`agents/`) |
| P5 | Offline is a feature, not a fallback | Reading, memorisation, revision fully offline (FR-PL-2) |
| P6 | Extensible by plugins | New tafsīr, reciters, models, modules attach via contracts ([PLUGINS.md](PLUGINS.md)) |

## Personas

Hafiz / advanced memoriser (MVP) · hifz student (MVP) · tajweed student (MVP) ·
general reader (MVP) · parent (Phase 2) · teacher / sheikh (Phase 2) · qira'at
learner (Phase 3). Needs per persona: handbook §1.3.

## What this platform is not

- **Not a fatwa service.** The tutor answers only from retrieved, cited sources
  and defers rulings to qualified scholars.
- **Not a social network.** Community is limited to shared study plans, note
  templates, and teacher–student workflows.
- **Not a closed SaaS.** Everything needed to self-host is in the monorepo
  ([SELF_HOSTING.md](SELF_HOSTING.md)).

Requirements derived from this vision: [PRODUCT.md](PRODUCT.md).
