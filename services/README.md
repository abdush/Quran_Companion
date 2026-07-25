# services/

Server-side services (handbook §21, §9.1).

| Directory | Owner |
|---|---|
| `api/` | Backend Agent (`agents/backend.md`) — FastAPI modular monolith (`app/{usr,ann,hfz,qds,kb,tutor,sync,fam,cm}`) |
| `speech/` | Speech Agent (`agents/speech.md`) — ASR/alignment worker |
| `gateway/` | Auth/Security Agent (`agents/security.md`) — auth verify, rate limit (or Traefik config) |

> Placeholder created by Task 0.1 (DevOps): `api/` and `speech/` contain boot-and-health scaffolding only — no feature logic. Owning agents take over from here.
