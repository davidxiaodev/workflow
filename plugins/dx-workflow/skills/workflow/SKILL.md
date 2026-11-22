---
name: workflow
description: The entry for any coding request in a project that uses dx-workflow (a feature, a fix, a refactor, a screen or an endpoint). The developer only describes what they want; this decides the steps (understand, plan, implement, verify, complete), how much planning the change needs, how strictly it is checked, which installed skills to use (superpowers, Matt Pocock's skills), and when to stop and ask a person. Also use when unsure what comes next.
---

# Workflow

The developer describes what they want. You decide the rest, and keep it as light as the change
allows: a small fix should feel like a small fix. Discipline comes from the checks, not from
paperwork.

```text
Understand → Plan → Implement → Verify → Complete
```

`<plugin>` is two levels up from this skill (it holds `scripts/` and `shared/`).

## Two things decide the steps

**Size** (you judge it from the request; say it in one line so the developer can correct you):

| Size | What it is | Understand | Plan | Files you write |
| --- | --- | --- | --- | --- |
| Small | a fix, copy, a style, a config value, one small function | restate it in a sentence | none | none |
| Medium | one feature or fix, one pull request | 1 to 3 questions if something is unclear, else none | a few bullet steps, only if the change has more than one part | `.verify/acceptance.md` (untracked), with `## Plan` only when needed |
| Large | a new flow, a cross-cutting change, or more than one pull request | brainstorm and interview until goals are clear | spec with a short architecture section, then tasks | `docs/specs/<slug>.md` and `<slug>.tasks.md` (`large.md`) |

**Risk** (computed from the diff, not chosen): `node <plugin>/scripts/level.mjs` says `light`,
`standard` or `strict`, and why. Auth, payments, permissions, migrations, contracts, native app
config, sensitive paths or changes to the checks make a change `strict` however small it is.

| Level | Verify asks for |
| --- | --- |
| light | the lane's checks pass (`run-verify.mjs`). That is all. |
| standard | acceptance criteria, the checks, one independent review. The evidence pack is made for you. |
| strict | as standard, with a deep review and a security pass; the owner approves the merge (tier 3). |

A Small change is usually light, but size does not lower risk: a one-line change to a login check
is strict. Run `level.mjs` again after implementing; the Stop gate uses the real diff.

## The phases

**1. Understand.** Read the code the request touches before asking anything the code can answer.
Small: restate the request. Medium: ask only what you cannot decide safely (one question at a time,
with your recommendation). Large: use `superpowers:brainstorming` or `mattpocock-skills:grilling`
when installed, else interview the same way; then the spec (`large.md`).

**2. Plan.** Small: none. Medium: acceptance criteria in `.verify/acceptance.md`
(`<plugin>/shared/acceptance.md`: observable results, each with its proof; the adverse cases that
apply), plus a `## Plan` of a few bullets only when the change has several parts. Large: the
architecture section and the task list (`large.md`; `superpowers:writing-plans` or
`mattpocock-skills:to-tickets` can draft the split; `mattpocock-skills:codebase-design` can shape the architecture).

**3. Implement.** Tests first for behaviour (`superpowers:test-driven-development` or
`mattpocock-skills:tdd` when installed). Follow the lane's skill (`frontend` or `backend`,
`build.md`) and the project's contracts (`docs/design.md`, `docs/backend.md`). Independent Large
tasks can run in parallel in worktrees (`superpowers:using-git-worktrees`); otherwise do not start
subagents while building.

**4. Verify.** `node <plugin>/scripts/run-verify.mjs`. When it says a check "failed again", stop and
find the cause (`<plugin>/shared/debug.md`; `superpowers:systematic-debugging` or
`mattpocock-skills:diagnosing-bugs`). Then by level: light is done when the checks pass. Standard and
strict: one independent review, the only subagent this workflow starts by default:
`node <plugin>/scripts/review-brief.mjs --lane <lane> --request "<the request>"`, dispatched to a fresh
subagent. The brief picks the reviews the diff needs (code always; UI only when something visual
changed; contract compatibility; security for risky changes). Fix what it finds; at most two rounds,
then hand the open findings to the developer. The Stop gate checks all of this and makes the evidence pack.

**5. Complete.** Tell the developer in a few lines: what changed, the level and merge tier, anything
not verified and why. For standard and strict, the pull request body comes from
`make-evidence.mjs --pr`. A Blocker the review found, a revert or a correction from the developer goes
through `<plugin>/shared/ratchet.md` afterwards, so the next change cannot repeat it.

## Stop and ask a person when

- the request can be read two ways and the wrong guess is expensive;
- a Large spec is ready (the developer agrees it before tasks or code);
- the change is strict: say why before building, and the owner approves the merge;
- a check still fails after diagnosis, or two review rounds end without approval;
- the right fix needs a contract, migration or native change the request did not mention.

Otherwise keep going; do not ask permission for each step.

## Keep it light

- No file a step does not need: Small writes none; Medium writes the acceptance file only.
- No review, no evidence pack and no subagent for light changes.
- No step for its own sake: if a phase has nothing to do for this change, skip it silently.
- Other skills do the work inside a step; this plugin's files, gates and review decide when it is
  done (`<plugin>/shared/skill-packs.md`).
