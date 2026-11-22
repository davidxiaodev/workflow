import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { git, node } from "./helpers.mjs";

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "dxinit-"));
  dirs.push(root);
  git(root, "init", "-q", "-b", "main");
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), typeof c === "string" ? c : JSON.stringify(c, null, 2));
  }
  return root;
}
const config = (root) => JSON.parse(readFileSync(join(root, ".verify/config.json"), "utf8"));

describe("init", () => {
  it("turns a single Next.js app's scripts into a frontend lane with a negative check", () => {
    const root = repo({
      "package.json": { dependencies: { next: "15", react: "19" }, scripts: { lint: "next lint", typecheck: "tsc --noEmit", test: "vitest run" } },
      "pnpm-lock.yaml": "",
      "tsconfig.json": "{}",
    });
    const r = node("init.mjs", [], { cwd: root });
    assert.equal(r.code, 0, r.stderr);
    const { lanes } = config(root);
    assert.deepEqual(Object.keys(lanes), ["web"]);
    assert.equal(lanes.web.kind, "frontend");
    assert.deepEqual(lanes.web.checks.map((c) => c.run ?? `negative: ${c.negative.test}`), ["pnpm run typecheck", "pnpm run lint", "pnpm run test", "negative: pnpm run test"]);
    assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /^\.verify\/\*\n!\.verify\/config\.json\n$/);
    assert.equal(node("init.mjs", [], { cwd: root }).code, 2, "does not overwrite without --force");
  });

  it("finds every app in a monorepo and leaves the workspace root out", () => {
    const root = repo({
      "package.json": { private: true, workspaces: ["apps/*", "services/*"], scripts: { test: "turbo test" }, devDependencies: { turbo: "2" } },
      "apps/web/package.json": { dependencies: { react: "19", vite: "6" }, scripts: { test: "vitest run" } },
      "apps/mobile/package.json": { dependencies: { expo: "52", "react-native": "0.76" }, scripts: { test: "jest", lint: "expo lint" } },
      "services/api/package.json": { dependencies: { fastify: "5" }, scripts: { test: "node --test" } },
      "services/ml/pyproject.toml": '[project]\nname = "ml"\n[tool.ruff]\n[project.optional-dependencies]\ndev = ["pytest", "mypy"]\n',
    });
    const r = node("init.mjs", [], { cwd: root });
    assert.equal(r.code, 0, r.stderr);
    const { lanes } = config(root);
    assert.deepEqual(Object.keys(lanes).sort(), ["api", "ml", "mobile", "web"]);
    assert.equal(lanes.mobile.platform, "react-native");
    assert.ok(lanes.mobile.native.includes("apps/mobile/app.json"));
    assert.equal(lanes.api.kind, "backend");
    assert.deepEqual(lanes.api.checks.find((c) => c.name === "unit"), { name: "unit", run: "npm run test", cwd: "services/api" });
    assert.deepEqual(lanes.api.checks.find((c) => c.name === "negative").negative, { test: "npm run test", cwd: "services/api" });
    assert.deepEqual(lanes.ml.checks.map((c) => c.name), ["lint", "types", "unit", "negative"]);
    assert.deepEqual(lanes.ml.files, ["services/ml/**/*.py"]);
    assert.match(r.stdout, /4 lane\(s\)/);
  });

  it("handles Go, dry runs, and repos it cannot read", () => {
    const go = repo({ "go.mod": "module x\n" });
    const r = node("init.mjs", ["--dry-run"], { cwd: go });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /"go test \.\/\.\.\."/);
    assert.throws(() => readFileSync(join(go, ".verify/config.json")));
    assert.equal(node("init.mjs", [], { cwd: repo({ "README.md": "hi" }) }).code, 2);
  });

  it("writes a config run-verify can run straight away", () => {
    const root = repo({
      "package.json": { type: "module", main: "src/index.js", scripts: { test: "node test.js" } },
      "src/index.js": "export const one = () => 1;\n",
      "test.js": 'import { one } from "./src/index.js";\nif (one() !== 1) process.exit(1);\n',
    });
    assert.equal(node("init.mjs", [], { cwd: root }).code, 0);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");
    const r = node("run-verify.mjs", [], { cwd: root });
    assert.equal(r.code, 0, r.stdout);
    assert.match(r.stdout, /lane api: pass/);
  });
});
