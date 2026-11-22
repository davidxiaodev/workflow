#!/usr/bin/env node
// Claude Code Stop hook. In a project with .verify/config.json it blocks the end of a turn that
// changed files of a lane (frontend, backend, …) when the change is not verified for exactly the
// content on disk now. What "verified" means depends on the change's level (lib/level.mjs):
//   light     every touched lane's last run-verify passed on this tree. Nothing else.
//   standard  also: an independent review of this tree, approved with no open line; the acceptance
//             criteria all accounted for in a review; the evidence pack (the gate makes it itself
//             when that is all that is missing).
//   strict    also: the review was deep ("Depth: deep", which review-brief.mjs asks for).
// A run or review counts only for the tree it names (content hash, not file times).
// "Changed" means: the files differ from the base commit (committed on this branch or not, deletions
// included), and the tree differs from the one recorded when the turn started (turn-start.mjs), so a
// turn that only talked is not stopped.
//
// It blocks once per stop (stop_hook_active lets the second attempt through, so a turn cannot loop
// forever). DX_WORKFLOW_GATE: "enforce" (default) blocks; "observe" only logs what it would have
// blocked; "off" does nothing. Every decision is appended to .verify/gate.log.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { changeLevel } from "./lib/level.mjs";
import {
  acceptanceIds,
  acceptanceLines,
  changedSince,
  gitRoot,
  inLane,
  loadConfig,
  OPEN_LINE,
  readJson,
  treeHash,
} from "./lib/verify-config.mjs";

const mode = (process.env.DX_WORKFLOW_GATE ?? "enforce").toLowerCase();
const input = readStdin();
if (mode === "off") process.exit(0);

const root = gitRoot(input.cwd ?? process.cwd());
if (!root) process.exit(0);

const cfg = loadConfig(root);
if (!cfg) process.exit(0);

const changes = changedSince(root, cfg.base);
const required = cfg.lanes
  .map((lane) => ({ lane, files: changes.filter((c) => inLane(lane, c.path)).map((c) => c.path) }))
  .filter((x) => x.files.length);
if (required.length === 0) process.exit(0);

const current = treeHash(root);
const turn = readJson(join(cfg.dir, "turn.json"));
if (current && turn?.tree === current) process.exit(0); // this turn changed nothing

const lvl = changeLevel(cfg, changes);
const last = readJson(join(cfg.dir, "last-run.json"));
const problems = [];
const reviewTimes = [];
const coveredIds = new Set();
const short = (h) => (h ? h.slice(0, 12) : "none");

if (!current) problems.push("could not hash the working tree (git failed); verification cannot be matched to the content.");

for (const { lane, files } of required) {
  const run = last?.lanes?.[lane.name];
  const reviewPath = join(cfg.dir, `review-${lane.name}.md`);
  const label = `lane ${lane.name} (${preview(files)})`;
  if (!run) {
    problems.push(`${label}: run-verify has not run this lane.`);
    continue;
  }
  if (run.result !== "pass") problems.push(`${label}: the last run-verify result is "${run.result}", not "pass".`);
  if (run.tree !== current) problems.push(`${label}: files changed since the last run-verify (it checked tree ${short(run.tree)}, the tree is now ${short(current)}).`);
  if (lvl.level === "light") continue;
  if (!existsSync(reviewPath)) {
    problems.push(`${label}: .verify/review-${lane.name}.md is missing (independent review).`);
    continue;
  }
  const review = readFileSync(reviewPath, "utf8");
  reviewTimes.push(statSync(reviewPath).mtimeMs);
  const reviewed = reviewTree(review);
  if (!reviewed) problems.push(`${label}: its review has no "Tree:" line naming the tree it reviewed (lanes.${lane.name}.tree in last-run.json).`);
  else if (current && !current.startsWith(reviewed)) problems.push(`${label}: its review is of tree ${short(reviewed)}, not the current tree ${short(current)}.`);
  const open = review.split("\n").filter(OPEN_LINE);
  if (open.length) problems.push(`${label}: its review still has ${open.length} open or failing line(s).`);
  if (!/^Verdict:\s*approved\b/im.test(review)) problems.push(`${label}: its review does not say "Verdict: approved".`);
  if (lvl.level === "strict" && !/^Depth:\s*deep\b/im.test(review)) problems.push(`${label}: the change is strict (${lvl.reasons[0]}), so its review must be deep: write a new brief with review-brief.mjs and dispatch a fresh reviewer.`);
  for (const l of acceptanceLines(review)) for (const m of l.matchAll(/\bA\d+\b/gi)) coveredIds.add(m[0].toUpperCase());
}

const acceptancePath = join(cfg.dir, "acceptance.md");
if (lvl.level === "light") {
  // nothing beyond passing checks
} else if (!existsSync(acceptancePath)) problems.push(".verify/acceptance.md is missing: write the observable criteria for this change (shared/acceptance.md).");
else {
  const ids = acceptanceIds(readFileSync(acceptancePath, "utf8"));
  if (ids.length === 0) problems.push(".verify/acceptance.md has no criteria (lines starting with `- A1`).");
  const missing = ids.filter((id) => !coveredIds.has(id));
  if (missing.length && reviewTimes.length) problems.push(`acceptance criteria ${missing.join(", ")} appear in no review's "## Acceptance" section.`);
}

// The evidence pack is bookkeeping, not a step: when everything else holds, make it here.
if (lvl.level !== "light") {
  let evidence = evidenceProblems();
  if (evidence.length && problems.length === 0) {
    spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "make-evidence.mjs"), "--root", root], { cwd: root, stdio: "ignore", timeout: 20_000 });
    evidence = evidenceProblems();
  }
  problems.push(...evidence);
}

function evidenceProblems() {
  const evidencePath = last?.runDir ? join(last.runDir, "evidence.md") : "";
  if (!evidencePath || !existsSync(evidencePath)) return ["the evidence pack is missing: run make-evidence.mjs after the reviews."];
  const out = [];
  const evidenceTree = /^Tree:\s*([0-9a-f]+)/im.exec(readFileSync(evidencePath, "utf8"))?.[1];
  if (evidenceTree !== current) out.push("the evidence pack is of another tree: run make-evidence.mjs again.");
  if (reviewTimes.some((t) => statSync(evidencePath).mtimeMs < t)) out.push("the evidence pack is older than a review: run make-evidence.mjs again.");
  return out;
}

if (problems.length === 0) {
  log(`pass (${lvl.level})`, []);
  process.exit(0);
}
if (input.stop_hook_active) {
  log("let-through-unverified", problems);
  process.exit(0);
}
if (mode === "observe") {
  log("would-block", problems);
  process.exit(0);
}
log("block", problems);
block([
  `Changes are not verified (level ${lvl.level}${lvl.reasons.length ? `: ${lvl.reasons.slice(0, 3).join("; ")}` : ""}):`,
  ...problems.map((p) => `- ${p}`),
  lvl.level === "light"
    ? "A light change needs only its checks: run run-verify.mjs and fix what fails."
    : "Run run-verify.mjs, then an independent review: review-brief.mjs writes the brief for a fresh subagent, which writes .verify/review-<lane>.md. The gate makes the evidence pack itself.",
  "If you cannot verify (no browser, no database, server will not start), say so plainly to the user instead of claiming the work is done.",
]);

function reviewTree(text) {
  return /^Tree:\s*([0-9a-f]{7,40})\b/im.exec(text)?.[1] ?? null;
}

function log(decision, list) {
  try {
    appendFileSync(
      join(cfg.dir, "gate.log"),
      JSON.stringify({ at: new Date().toISOString(), mode, decision, tree: current, session: input.session_id ?? null, problems: list }) + "\n",
    );
  } catch {
    // logging never decides anything
  }
}

function block(lines) {
  process.stdout.write(JSON.stringify({ decision: "block", reason: lines.join("\n") }) + "\n");
  process.exit(0);
}

function preview(files) {
  return `${files.slice(0, 5).join(", ")}${files.length > 5 ? ", …" : ""}`;
}

function readStdin() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
