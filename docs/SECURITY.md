# Security & Privacy

> **Scope:** handbook §18 — threat model, baseline controls, product-level
> privacy rules, and the Phase 2 E2EE design; plus the vulnerability disclosure
> policy.
> **Status:** scoped stub (task 0.4). No auth, gateway, or user data exists yet;
> the compose stack ships **development credentials only**. Full threat model and
> disclosure policy are owned by the Auth/Security Agent and drafted as Phase 1
> auth work lands. Owner: Documentation Agent.

## Threat model highlights

| Asset | Threats | Controls |
|---|---|---|
| Recitation audio | Retention/leak of voice data (biometric-adjacent) | Default process-and-discard; presigned single-use uploads; lifecycle auto-delete; explicit opt-in to keep; regional storage |
| Children's data | Profiling, contact by strangers | No child credentials; no messaging; guardian consent; minimal analytics (COPPA/GDPR-K aligned) |
| Personal notes | Server compromise | Phase 2 E2EE; at-rest encryption regardless |
| Quran text integrity | Tampered packs | Signed packs + checksums (NFR-1, [DATA.md §3](DATA.md#3-data-packs-offline-distribution-unit)) |
| AI misuse | Fabricated religious content | Guardrails + eval gates ([AI.md](AI.md)) |

## Baseline controls

TLS 1.3 everywhere; JWT verification at the gateway; **per-profile row-level
authorisation checks in every repository method, tested**; rate limiting per
token+IP; dependency and container scanning in CI; secrets only via
environment/secret manager (never in code — Rule R7); audit log for admin and
moderator actions. Target: OWASP ASVS L2 (NFR-5).

## Privacy rules (product-level)

- Analytics are opt-out-able and anonymous by default, and **never** include
  Quran-content-linked personal data — which verses a user is weak in never
  leaves the account scope.
- Server logs contain ids and codes, never note bodies, transcripts, or audio
  paths linked to a user.

## E2EE sync (Phase 2)

Scope: annotation bodies, note audio, journal text. Structural and scheduling
data stays server-readable so opted-in teacher/family features work. Design:
per-profile symmetric content key wrapped by device keys (libsodium sealed
boxes); recovery phrase held by the user; server stores ciphertext CRDT payloads
(`sync.doc.encrypted = true`); sharing to a teacher re-encrypts the specific
objects to the teacher's public key.

## Reporting a vulnerability

**Placeholder — no security contact is published yet.** Until a policy and
contact address are agreed, report suspected vulnerabilities privately through a
GitHub security advisory on the repository rather than a public issue. This
section is replaced by the full disclosure policy (contact, PGP key, response
SLA, safe-harbour statement) when the project has a hosted deployment.
