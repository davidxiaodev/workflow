#!/usr/bin/env node
// Day-one setup: find the apps and services in this repo and the checks they already have, and write
// a minimal .verify/config.json from them. Nothing else is required to start; design contracts,
// screenshots, journeys and checklists are added later, when a change needs them.
//
//   node init.mjs [--dry-run] [--force]
//
// It looks at the repo root and one level of apps/, packages/, services/ and the top-level folders:
//   package.json   web (next, react, vue, svelte, vite, astro, remix, solid…) → frontend lane
//                  expo / react-native → frontend lane, platform react-native
//                  express, fastify, koa, hono, nest, a server with no UI → backend lane
//                  its scripts: typecheck, lint, test (and tsc --noEmit when there is a tsconfig)
//   pyproject.toml / requirements.txt → backend lane: ruff, mypy, pytest when configured
//   go.mod         → backend lane: go vet, go test
// Every lane with a test command also gets the negative check.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gitRoot } from "./lib/verify-config.mjs";

const args = process.argv.slice(2);
const root = gitRoot(process.cwd());
if (!root) fail("init: run this inside a git repository.");
const target = join(root, ".verify", "config.json");
if (existsSync(target) && !args.includes("--force") && !args.includes("--dry-run")) fail(`init: ${relative(process.cwd(), target) || target} exists (use --force to replace it).`);

const WEB = ["next", "react", "react-dom", "vue", "nuxt", "svelte", "@sveltejs/kit", "vite", "astro", "@remix-run/react", "solid-js", "@angular/core", "preact"];
const RN = ["expo", "react-native"];
const SERVER = ["express", "fastify", "koa", "hono", "@nestjs/core", "@hapi/hapi", "restify", "elysia", "@trpc/server", "apollo-server", "@apollo/server"];

const candidates = [".", ...["apps", "packages", "services"].flatMap((d) => subdirs(d).map((s) => `${d}/${s}`)), ...subdirs(".").filter((d) => !["apps", "packages", "services", "node_modules", "docs", "scripts", "e2e", "test", "tests"].includes(d))];
const pm = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock")) ? "bun" : "npm";
const lanes = {};
const found = [];

for (const dir of [...new Set(candidates)]) {
  const abs = join(root, dir);
  const node = readJsonFile(join(abs, "package.json"));
  if (node) addNode(dir, node);
  else if (existsSync(join(abs, "pyproject.toml")) || existsSync(join(abs, "requirements.txt"))) addPython(dir);
  else if (existsSync(join(abs, "go.mod"))) addGo(dir);
}
// In a monorepo (workspaces, pnpm-workspace.yaml, turbo.json, nx.json) the root package.json is the
// workspace, not an app: its files overlap every app's, and its scripts run every app's checks again.
for (const [name, lane] of Object.entries(lanes)) if (lane.atRoot && Object.keys(lanes).length > 1) delete lanes[name];
for (const lane of Object.values(lanes)) delete lane.atRoot;
const kept = new Set(Object.keys(lanes));
found.splice(0, found.length, ...found.filter((f) => kept.has(f.split(" ")[0])));

if (!Object.keys(lanes).length) fail("init: found no package.json, pyproject.toml, requirements.txt or go.mod to build lanes from. Write .verify/config.json from the plugin's shared/verify.config.json.");

const config = { lanes };
const text = JSON.stringify(config, null, 2) + "\n";
console.log(`init: ${found.length} lane(s):`);
for (const f of found) console.log(`- ${f}`);
if (args.includes("--dry-run")) {
  process.stdout.write(text);
  process.exit(0);
}
mkdirSync(join(root, ".verify"), { recursive: true });
writeFileSync(target, text);
const gi = join(root, ".gitignore");
const ignore = existsSync(gi) ? readFileSync(gi, "utf8") : "";
const missing = [".verify/*", "!.verify/config.json"].filter((l) => !ignore.split("\n").includes(l));
if (missing.length) writeFileSync(gi, `${ignore}${ignore && !ignore.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
console.log(`init: wrote .verify/config.json${missing.length ? " and .gitignore lines" : ""}.`);
console.log("Next: run `node <plugin>/scripts/run-verify.mjs --config working` once on the unchanged code; every check should pass. Commit .verify/config.json.");
console.log("Later, only when a change needs it: docs/design.md and screenshots (frontend setup.md), docs/backend.md (backend setup.md), sensitive paths, docs/checklist.md.");

function addNode(dir, pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (list) => list.some((d) => d in deps);
  const scripts = pkg.scripts ?? {};
  const kind = has(RN) ? "rn" : has(WEB) ? "web" : has(SERVER) || pkg.main || scripts.start || existsSync(join(root, dir, "tsconfig.json")) ? "backend" : null;
  if (!kind) return;
  const run = (name) => (pm === "npm" ? `npm run ${name}` : `${pm} run ${name}`);
  const pick = (...names) => names.find((n) => scripts[n] && !/no test specified/.test(scripts[n]));
  const checks = [];
  const typecheck = pick("typecheck", "type-check", "types", "check-types", "tsc");
  if (typecheck) checks.push({ name: "types", run: run(typecheck) });
  else if (existsSync(join(root, dir, "tsconfig.json"))) checks.push({ name: "types", run: "npx tsc --noEmit" });
  const lint = pick("lint");
  if (lint) checks.push({ name: "lint", run: run(lint) });
  const test = pick("test:unit", "test");
  if (test) checks.push({ name: "unit", run: run(test) }, { name: "negative", negative: { test: run(test) } });
  for (const c of checks) if (dir !== ".") c.cwd = dir;
  for (const c of checks) if (c.negative && dir !== ".") c.negative.cwd = dir;
  const name = laneName(dir, kind === "backend" ? "api" : kind === "rn" ? "app" : "web");
  const prefix = dir === "." ? "" : `${dir}/`;
  lanes[name] =
    kind === "backend"
      ? { kind: "backend", files: [`${prefix}**/*.{ts,js,mjs,cjs,mts}`, ...(dir === "." ? [] : [`${prefix}package.json`])], checks }
      : kind === "rn"
        ? { kind: "frontend", platform: "react-native", files: [`${prefix}**/*.{ts,tsx,js,jsx}`, `${prefix}app.json`, `${prefix}app.config.{js,ts}`, `${prefix}ios/**`, `${prefix}android/**`], native: [`${prefix}app.json`, `${prefix}app.config.{js,ts}`, `${prefix}eas.json`, `${prefix}ios/**`, `${prefix}android/**`], checks }
        : { kind: "frontend", files: [`${prefix}**/*.{tsx,jsx,ts,js,vue,svelte,astro,css,scss}`], checks };
  const workspace = pkg.workspaces || existsSync(join(root, "pnpm-workspace.yaml")) || existsSync(join(root, "turbo.json")) || existsSync(join(root, "nx.json"));
  if (dir === ".") Object.assign(lanes[name], { ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"], atRoot: Boolean(workspace) });
  found.push(`${name} (${kind === "rn" ? "React Native / Expo" : kind === "web" ? "web frontend" : "Node backend"}, ${dir === "." ? "repo root" : dir}): ${checks.map((c) => c.name).join(", ") || "no checks found: add them to the lane"}`);
}

function addPython(dir) {
  const abs = join(root, dir);
  const py = [readText(join(abs, "pyproject.toml")), readText(join(abs, "requirements.txt")), readText(join(abs, "requirements-dev.txt"))].join("\n");
  const checks = [];
  if (/\bruff\b/.test(py)) checks.push({ name: "lint", run: "ruff check ." });
  if (/\bmypy\b/.test(py)) checks.push({ name: "types", run: "mypy ." });
  if (/\bpytest\b/.test(py) || existsSync(join(abs, "tests"))) checks.push({ name: "unit", run: "pytest -q" }, { name: "negative", negative: { test: "pytest -q" } });
  for (const c of checks) {
    if (dir !== ".") c.cwd = dir;
    if (c.negative && dir !== ".") c.negative.cwd = dir;
  }
  const name = laneName(dir, "api");
  lanes[name] = { kind: "backend", files: [`${dir === "." ? "" : `${dir}/`}**/*.py`], checks };
  found.push(`${name} (Python backend, ${dir === "." ? "repo root" : dir}): ${checks.map((c) => c.name).join(", ") || "no checks found: add them to the lane"}`);
}

function addGo(dir) {
  const cwd = dir === "." ? {} : { cwd: dir };
  const checks = [
    { name: "vet", run: "go vet ./...", ...cwd },
    { name: "unit", run: "go test ./...", ...cwd },
    { name: "negative", negative: { test: "go test ./...", ...cwd } },
  ];
  const name = laneName(dir, "api");
  lanes[name] = { kind: "backend", files: [`${dir === "." ? "" : `${dir}/`}**/*.go`], checks };
  found.push(`${name} (Go backend, ${dir === "." ? "repo root" : dir}): vet, unit, negative`);
}

function laneName(dir, fallback) {
  const base = dir === "." ? (Object.keys(lanes).length ? "root" : fallback) : dir.split("/").pop().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  let name = base;
  for (let i = 2; lanes[name]; i++) name = `${base}-${i}`;
  return name;
}

function subdirs(d) {
  try {
    return readdirSync(join(root, d), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function readJsonFile(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
