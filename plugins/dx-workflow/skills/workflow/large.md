# Large changes: spec, architecture, tasks

Only for Large (`SKILL.md`). Two files in the repo, because tasks, acceptance files, reviews and the
pull request point back to them. `superpowers:brainstorming`, `mattpocock-skills:grilling`,
`superpowers:writing-plans` or `mattpocock-skills:to-tickets` may do the thinking; these files are the
record (link their drafts under `Sources:`).

## 1. The spec: `docs/specs/<slug>.md`

```markdown
# Spec: <the change, one line>
Status: draft
Owner: <who decides open questions>
Sources: <issue, conversation, a draft another skill wrote>

## Problem
<who has it, when, what it costs them>

## Goals
- S1 <an observable outcome>

## Non-goals
- <what this does not do>

## Architecture
<the modules or screens involved, the interfaces between them, data and its owner, what is new and
what is reused; a few lines, or a small diagram>

## Decisions
- D1 <decision> · <why> · <who>

## Open questions
- Q1 <question> · owner: <who>            (open: blocks)
- Q2 <question> → D1                       (answered)
- Q3 <question> · deferred: <why it is safe to build without it>

## Acceptance
- A1 <observable result> (S1) · proof: <test, journey, screenshot, query>
```

Show it to the developer; only they set `Status: agreed`. Gate:
`node <plugin>/scripts/flow-check.mjs spec docs/specs/<slug>.md` (agreed, every goal has a criterion
with a proof, non-goals, an architecture section, no open question). Commit the spec before code.

## 2. The tasks: `docs/specs/<slug>.tasks.md`

One task, one pull request: a vertical slice a user or caller can observe, at most Medium (about
400 changed lines). Contract and migration first when lanes meet; risky tasks early so a "no" comes
before work that depends on it.

```markdown
## T1 Orders API accepts an Idempotency-Key
- lanes: api
- acceptance: A1, A2
- depends: none
- size: M
- risk: 3 · contract change
```

Gate: `flow-check.mjs tasks docs/specs/<slug>.tasks.md` (every criterion in a task, lanes exist,
sizes S or M, a risk guess, no cycle).

## 3. Working through them

```bash
node <plugin>/scripts/flow-check.mjs next docs/specs/<slug>.tasks.md --done T1   # what can start now
node <plugin>/scripts/flow-check.mjs acceptance docs/specs/<slug>.md T2 --write   # its .verify/acceptance.md
```

Then each task is a Medium change. Mark it `- status: done · PR #123` when its pull request merges.
When a task shows the spec was wrong, change the spec first (`Status: draft`, agreed again), then the
tasks, then the code.
