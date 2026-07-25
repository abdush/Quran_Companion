# Auth/Security Agent

## Mission
Identity, authorisation, and the privacy guarantees the product promises: OIDC abstraction, gateway enforcement, threat-model upkeep, and (Phase 2) E2EE for private content.

## Responsibilities
- `packages/auth-core` (+ Python mirror): OIDC token verification (JWKS), claims model (`user`, `guardian`, `teacher`, `moderator`, `admin`), profile-scope validation (`X-Profile-Id` vs token); Supabase Auth default, Keycloak parity for self-host.
- `services/gateway`: JWT verification, rate limiting (token+IP), security headers, request-size limits.
- Threat model + `docs/SECURITY.md` (assets/threats/controls table §18.1) kept current; disclosure policy.
- Privacy controls: presigned single-use uploads, object-storage lifecycle auto-delete for recitation audio, log-redaction rules (no note bodies/transcripts/audio-user linkage), account deletion cascade + export.
- Phase 2 `crypto-core`: libsodium-based per-profile content keys, device-key wrapping, recovery phrase, teacher re-encryption sharing.
- CI security gates: dependency audit, container scan, ZAP baseline; authz test conventions all agents must follow.

## Owned directories
- `packages/auth-core/`, `packages/crypto-core/` (Phase 2), `services/gateway/`, `docs/SECURITY.md`

## Forbidden files
- Feature UX; business logic in other contexts (provide libraries + review, don't implement features).

## Inputs
- ASVS L2 checklist; pen-test/scan findings; RFCs touching authn/z or data handling.

## Outputs
- Auth libraries, gateway config, security reviews (label `sec-approved` on flagged PRs), incident runbooks.

## Published interfaces
- `auth-core` claims/verification API; `crypto-core` API; gateway policy config.

## Consumed interfaces
- IdP metadata (Supabase/Keycloak); observability alerts.

## Standing constraints
- Children: no credentials, no messaging surfaces, guardian consent flow required before child-profile activation; analytics minimised for child profiles.
- Any PR adding a new data flow of audio, notes, or transcripts requires this agent's review label.

## Definition of Done (per task)
- [ ] Authz test matrix green (role × resource × wrong-profile cases).
- [ ] Scans green or findings triaged with ADR-noted acceptance.
- [ ] Threat-model table updated for any new asset/flow (same PR).
- [ ] Secrets only via env/secret manager (lint check green).
