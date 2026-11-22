# 7. Light by default, strict where it matters

Date: 2026-11-22 · Status: accepted

## Context

By 0.6 every lane change, however small, needed an acceptance file, a run, a brief, a review
subagent, a review naming the tree and an evidence pack before the Stop gate let the turn end, and
setup asked for design and backend contracts, ctl, journeys, lint guardrails and a checklist first.
Each step had a reason; together they were the kind of process developers abandon. Size and risk
were also mixed: a one-line change to a login check was "small".

## Decision

- One entry, the `workflow` skill (`/workflow`): understand, plan, implement, verify, complete. The
  developer describes the change; the skill sizes it, picks the steps and the installed skills, and
  says when it will stop to ask.
- Size (judged by the agent from the request) decides planning: Small writes no file, Medium only
  `.verify/acceptance.md` (with a short plan when needed), Large a spec with an architecture
  section and a task list.
- Risk (computed from the diff by `lib/level.mjs`, shown by `level.mjs`) decides verification:
  light (at most 40 lines and 3 files, nothing risky) needs only passing checks; standard adds
  acceptance and one independent review; strict (contracts, migrations, sensitive or native paths,
  the checks themselves, and, without any config, risky paths and code: auth, payments, permissions,
  destructive SQL, raw HTML) adds a deep review with a security pass and merge tier 3.
- The Stop gate, the brief and the evidence pack follow the level. The gate writes the evidence pack
  itself when that is all that is missing. Reviews stop after two rounds. The brief asks only for the
  reviews the diff needs: code always, screenshots when something visual changed, contract
  compatibility, security.
- superpowers and Matt Pocock's skills do brainstorming, planning, TDD, worktrees, debugging,
  architecture and code quality; agent-skills is no longer routed. This plugin keeps orchestration,
  verification, independent review, evidence and the ratchet.
- `init.mjs` writes a working `.verify/config.json` from the project's existing commands; the full
  setup is for when a change needs it.

## Consequences

A light change ends with no review: a small, non-risky bug can merge on its checks alone. The light
limits and the risk heuristics are defaults a project can tune (`risk` in the config); the
heuristics will flag some harmless files (an `author.ts`) as risky, which costs a deeper review, not
a wrong merge. Earlier docs (`flow`, `shared/spec.md`, `shared/tasks.md`) are folded into
`skills/workflow/`.
