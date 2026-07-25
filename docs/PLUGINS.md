# Plugins

> **Scope:** handbook §20 — plugin types and contracts, the safety model, and
> (eventually) an authoring tutorial.
> **Status:** scoped stub (task 0.4). `packages/plugin-sdk` is an empty scaffold
> with **no owner assigned yet** (open item from task 0.1); plugins are a Phase 3
> deliverable (FR-PL-4). Owner: Documentation Agent.

## Goal

Add tafsīr collections, reciters, AI model backends, educational modules, and
drill types **without core changes**.

## Plugin types

| Type | Contract (in `packages/plugin-sdk`) | Runtime |
|---|---|---|
| Content pack plugin (tafsīr, translation, matn, reciter index) | data-pack manifest extension; no code | data only — safest, first to ship |
| AI provider plugin | implements the `ai-core` provider interface; declared via entry point | server-side, operator-installed |
| Drill/module plugin | JSON activity schema + optional sandboxed UI widget (web: iframe + postMessage; mobile: declarative renderer only) | client |
| Rule-set plugin | additional tajweed rule YAML + tests | build-time |

## Safety model (binding from day one)

- **Data plugins** require a signature and a license manifest entry, and their
  content passes the **same reference validator as core KB ingestion** — no
  fabricated verse can enter through a plugin (D-009, Rule R3).
- **Code plugins are operator-level**: a self-host admin installs them. No
  arbitrary code from end users. Client drill plugins are declarative, not
  executable.
- Registry: `plugins/registry.json` in-repo for the curated list; a remote
  registry is an unscheduled future item.

## Not yet decided

- Ownership of `packages/plugin-sdk` (open item from task 0.1).
- Versioning/compatibility policy between the SDK and core releases.
- The authoring tutorial required by handbook §22 (acceptance criterion for
  Phase 3: reproducible by an external contributor).

Until then, handbook §20 is the reference.
