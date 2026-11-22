import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { changeLevel } from "../plugins/dx-workflow/scripts/lib/level.mjs";
import { loadConfig } from "../plugins/dx-workflow/scripts/lib/verify-config.mjs";
import { addFeature, CONFIG, cleanup, evidenceText, gate, makeProject, node, read, tierOf, verify, write } from "./helpers.mjs";

const DEFAULTS = { lanes: CONFIG.lanes }; // no lightMaxLines override: the real defaults
const roots = [];
const project = (config = DEFAULTS, files = {}) => {
  const r = makeProject({ config, files });
  roots.push(r);
  return r;
};
after(() => roots.forEach(cleanup));
const level = (root) => changeLevel(loadConfig(root));

describe("change level", () => {
  it("light for a small change with nothing risky", () => {
    const root = project();
    addFeature(root);
    const l = level(root);
    assert.equal(l.level, "light", l.reasons.join("; "));
    assert.ok(l.lines > 0 && l.lines <= 40);
  });

  it("standard when it grows past the light limits", () => {
    const root = project();
    write(root, { "src/big.mjs": Array.from({ length: 60 }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n" });
    assert.equal(level(root).level, "standard");
    assert.match(level(root).reasons.join(), /60 changed lines/);
  });

  it("strict for a one-line change to a risky path or risky code, with no config", () => {
    let root = project();
    write(root, { "src/auth/token.mjs": "export const ttl = 60;\n" });
    assert.equal(level(root).level, "strict");
    assert.match(level(root).reasons.join(), /risky path: src\/auth\/token\.mjs/);

    root = project();
    write(root, { "src/math.mjs": read(root, "src/math.mjs") + "export const pay = (s) => s.stripe.charges.create();\n" });
    assert.equal(level(root).level, "strict");
    assert.match(level(root).reasons.join(), /payments in src\/math\.mjs/);
  });

  it("strict for configured sensitive paths; heuristics can be switched off", () => {
    let root = project({ lanes: { backend: { ...CONFIG.lanes.backend, sensitive: ["src/math.mjs"] } } });
    addFeature(root);
    assert.equal(level(root).level, "strict");
    root = project({ risk: { heuristics: false }, lanes: CONFIG.lanes });
    write(root, { "src/auth/token.mjs": "export const ttl = 60;\n" });
    assert.equal(level(root).level, "light");
  });

  it("level.mjs prints the level and what it needs", () => {
    const root = project();
    write(root, { "src/billing/plan.mjs": "export const plan = 1;\n" });
    const r = node("level.mjs", [], { cwd: root });
    assert.match(r.stdout, /^level: strict/);
    assert.match(r.stdout, /owner approves/);
  });
});

describe("light changes", () => {
  it("end the turn once the checks pass: no acceptance, no review, no evidence pack", () => {
    const root = project();
    addFeature(root);
    const d = gate(root);
    assert.equal(d.decision, "block");
    assert.match(d.reason, /level light/);
    assert.match(d.reason, /A light change needs only its checks/);
    assert.doesNotMatch(d.reason, /acceptance|review|evidence/i);
    assert.equal(node("run-verify.mjs", [], { cwd: root }).code, 0);
    assert.equal(gate(root), null);
  });

  it("are merge tier 1 in the evidence pack without a review", () => {
    const root = project();
    addFeature(root);
    node("run-verify.mjs", [], { cwd: root });
    node("make-evidence.mjs", [], { cwd: root });
    assert.equal(tierOf(root), "1");
    assert.match(evidenceText(root), /Light change \(\d+ line\(s\), nothing risky\)/);
    assert.match(evidenceText(root), /^Level: light$/m);
  });
});

describe("standard and strict changes", () => {
  it("get their evidence pack from the gate when it is the only thing missing", () => {
    const root = makeProject();
    roots.push(root);
    addFeature(root);
    verify(root);
    const last = JSON.parse(read(root, ".verify/last-run.json"));
    node("run-verify.mjs", [], { cwd: root }); // a new run: new run folder, no pack yet
    const run2 = JSON.parse(read(root, ".verify/last-run.json")).runDir;
    assert.notEqual(run2, last.runDir);
    assert.equal(existsSync(join(run2, "evidence.md")), false);
    assert.equal(gate(root), null, "the gate wrote the pack and let the turn end");
    assert.ok(existsSync(join(run2, "evidence.md")));
  });

  it("strict needs a deep review, and is merge tier 3", () => {
    const root = project();
    write(root, { "src/auth/token.mjs": "export const ttl = 60;\n" });
    addFeature(root);
    verify(root);
    assert.match(gate(root).reason, /the change is strict .* its review must be deep/);
    write(root, { ".verify/review-backend.md": read(root, ".verify/review-backend.md").replace("Reviewer: test", "Reviewer: test\nDepth: deep") });
    node("make-evidence.mjs", [], { cwd: root });
    assert.equal(gate(root), null);
    assert.equal(tierOf(root), "3");
    assert.match(evidenceText(root), /a risky change \(risky path: src\/auth\/token\.mjs/);
  });
});
