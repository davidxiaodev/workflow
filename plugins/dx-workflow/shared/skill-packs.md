# Working with superpowers and Matt Pocock's skills

dx-workflow orchestrates and verifies; it does not redo what these do well. When one is in your
available skills, use it for the work inside a step. When it is not, follow this plugin's short
fallback for that step.

| Step | Use | Fallback |
| --- | --- | --- |
| Understand a Large request | `superpowers:brainstorming`, `mattpocock-skills:grilling` (`grill-with-docs` also builds a glossary) | interview, one question at a time (`workflow/SKILL.md`) |
| Architecture | `mattpocock-skills:codebase-design`, `improve-codebase-architecture` | the spec's Architecture section (`workflow/large.md`) |
| Plan | `superpowers:writing-plans`, `mattpocock-skills:to-tickets` | the task list (`workflow/large.md`) |
| Tests first | `superpowers:test-driven-development`, `mattpocock-skills:tdd` | the lane's `build.md` |
| Parallel tasks | `superpowers:using-git-worktrees`, `dispatching-parallel-agents` | one task at a time |
| Debug | `superpowers:systematic-debugging`, `mattpocock-skills:diagnosing-bugs` | `shared/debug.md` |
| Code quality, cleanup | `mattpocock-skills:improve-codebase-architecture`, `code-review` (as an extra pass) | `shared/ratchet.md` |
| Retro | `mattpocock-skills:retro` | `shared/ratchet.md` |

## Where they overlap with this plugin, this plugin decides

- **Done** is the Stop gate letting the turn end: the checks passed on the tree on disk and, for
  standard and strict changes, the independent review from `review-brief.mjs` approved it. "Tests
  pass" (`superpowers:verification-before-completion`) is part of that.
- **The independent review** is the one `review-brief.mjs` writes. Reviews inside other skills
  (`superpowers:requesting-code-review`, the reviewer in `superpowers:subagent-driven-development`,
  `mattpocock-skills:code-review`) are extra passes while building, not the approval.
- **Merging** follows the merge tier. Do not merge locally or mark a pull request ready before the
  Stop gate passes (`superpowers:finishing-a-development-branch` waits for it).
- **Files of record** for Large changes are `docs/specs/<slug>.md` and `.tasks.md`. Drafts other
  skills write elsewhere (`docs/superpowers/`, `.scratch/`, an issue) are linked under `Sources:`.
- **Session routing** (`superpowers:using-superpowers`) can stay on; in a project with
  `.verify/config.json`, coding requests start from this plugin's `workflow` skill.
- **No check is weakened** for another skill's step: skipping a test or editing `.verify/config.json`
  is a guarded change whichever skill asked for it.

Versions these names were checked against: `vendor.lock.json`, "routed". If a skill is renamed,
use the fallback and update this table in its own change.
