#!/usr/bin/env node
// What does the current change need? Prints the verification level (light, standard, strict) and why.
//
//   node level.mjs [--json]
//
// light: the checks must pass, nothing else. standard: acceptance, one independent review, evidence.
// strict: also a deep review with a security pass, and the owner approves the merge.
import { changeLevel } from "./lib/level.mjs";
import { gitRoot, loadConfig } from "./lib/verify-config.mjs";

const root = gitRoot(process.cwd());
const cfg = root && loadConfig(root);
if (!cfg) {
  console.error("level: no .verify/config.json here (run init.mjs first).");
  process.exit(2);
}
const l = changeLevel(cfg);
if (process.argv.includes("--json")) console.log(JSON.stringify(l, null, 2));
else {
  console.log(`level: ${l.level} · ${l.files} lane file(s), ${l.lines} changed line(s)${l.lanes.length ? ` · lanes: ${l.lanes.join(", ")}` : ""}`);
  for (const r of l.reasons) console.log(`- ${r}`);
  console.log(
    {
      light: "needs: the lane checks pass (run-verify.mjs). No acceptance file, no review.",
      standard: "needs: .verify/acceptance.md, run-verify.mjs, one independent review (review-brief.mjs). The evidence pack is made for you.",
      strict: "needs: as standard, with a deep review and a security pass; merge tier 3 (the owner approves).",
    }[l.level],
  );
}
