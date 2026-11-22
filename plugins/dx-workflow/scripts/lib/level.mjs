// How much verification a change needs, computed from the diff so nobody has to choose it and an
// agent cannot talk itself down:
//
//   light     small and nothing risky: the lane's checks pass on the tree on disk; nothing else
//   standard  everything else: a short acceptance file, one independent review, the evidence pack
//   strict    risky whatever its size (contract, migration, auth, payments, native, the checks
//             themselves, sensitive paths): a deep review with a security pass; the owner approves
//
// Size decides how much planning a change needs (the workflow skill); this decides how hard it is checked.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changedSince, contractPaths, gitLines, guardChanges, inLane, matchAny, VERIFY_DIR } from "./verify-config.mjs";

export const LIGHT_MAX_LINES = 40;
export const LIGHT_MAX_FILES = 3;

// Risky by name, even in a project that has not listed its sensitive paths.
export const RISK_PATHS = [
  "**/{auth,authn,authz,login,logout,signin,signup,session,sessions,oauth,sso,permissions,rbac,acl}/**",
  "**/*{auth,Auth,login,Login,password,Password,session,Session,permission,Permission,oauth,OAuth}*.*",
  "**/{payment,payments,billing,checkout,subscription,subscriptions,invoice,invoices,stripe,wallet}/**",
  "**/*{payment,Payment,billing,Billing,checkout,Checkout,stripe,Stripe,invoice,Invoice,refund,Refund}*.*",
  "**/{migrations,migrate,db/migrate}/**",
  "**/*.sql",
  "**/schema.prisma",
  "**/{.env,.env.*}",
];

// Risky by content: lines added or removed that touch money, secrets, identity, destructive SQL or raw HTML.
export const RISK_LINES = [
  [/\b(?:stripe|paypal|braintree|adyen|paddle|lemonsqueezy)\b/i, "payments"],
  [/\b(?:jwt|jsonwebtoken|bcrypt|argon2|scrypt|oauth|saml|csrf|passport|next-auth|lucia|clerk|supabase\.auth)\b/i, "authentication"],
  [/\b(?:createHash|createHmac|randomBytes|timingSafeEqual|setCookie|httpOnly|sameSite)\b/, "secrets or cookies"],
  [/\b(?:DROP|TRUNCATE)\s+(?:TABLE|COLUMN|INDEX|DATABASE)\b|\bALTER\s+TABLE\b|\bDELETE\s+FROM\b/i, "destructive SQL"],
  [/dangerouslySetInnerHTML|\.innerHTML\s*=|v-html|\beval\s*\(|new Function\s*\(/, "raw HTML or eval"],
  [/\b(?:isAdmin|role\s*===?|hasPermission|can\(|authorize|requireAuth|@PreAuthorize|@login_required)\b/, "authorisation"],
];

/**
 * { level, reasons, lines, files, lanes } for the change since base. `reasons` say why it is not light.
 * A project can tune it in .verify/config.json: "risk": { "paths": [], "lightMaxLines": 40, "lightMaxFiles": 3, "heuristics": true }.
 */
export function changeLevel(cfg, changes = changedSince(cfg.root, cfg.base)) {
  const risk = cfg.config.risk ?? {};
  const maxLines = risk.lightMaxLines ?? LIGHT_MAX_LINES;
  const maxFiles = risk.lightMaxFiles ?? LIGHT_MAX_FILES;
  const heuristics = risk.heuristics !== false;
  const visible = changes.filter((c) => !c.path.startsWith(`${VERIFY_DIR}/`) || c.path === `${VERIFY_DIR}/config.json`);
  const laneOf = (p) => cfg.lanes.filter((l) => inLane(l, p));
  const laneFiles = visible.filter((c) => laneOf(c.path).length);
  const lanes = cfg.lanes.filter((l) => laneFiles.some((c) => inLane(l, c.path)));
  const strict = [];
  const standard = [];

  const add = (list, why) => !list.includes(why) && list.push(why);
  for (const g of guardChanges(cfg, changes).filter((g) => g.tier === 3)) add(strict, `the checks changed: ${g.path}`);
  for (const l of lanes) {
    for (const c of visible) {
      if (matchAny(contractPaths(l), c.path)) add(strict, `contract: ${c.path}`);
      if (matchAny(l.migrations ?? [], c.path)) add(strict, `migration: ${c.path}`);
      if (matchAny(l.sensitive ?? [], c.path)) add(strict, `sensitive: ${c.path}`);
      if (matchAny(l.native ?? [], c.path)) add(strict, `native: ${c.path}`);
      if (inLane(l, c.path) && matchAny(l.shared ?? [], c.path)) add(standard, `shared: ${c.path}`);
    }
  }
  if (heuristics) {
    for (const c of laneFiles) if (matchAny([...RISK_PATHS, ...(risk.paths ?? [])], c.path)) add(strict, `risky path: ${c.path}`);
  } else for (const c of laneFiles) if (matchAny(risk.paths ?? [], c.path)) add(strict, `risky path: ${c.path}`);

  const { lines, byFile } = diffLines(cfg.root, cfg.base, laneFiles);
  if (heuristics) {
    for (const [path, ls] of byFile) {
      for (const [re, what] of RISK_LINES) {
        const hit = ls.find((l) => re.test(l));
        if (hit) add(strict, `${what} in ${path}: "${hit.trim().slice(0, 60)}"`);
      }
    }
  }
  const changedLines = lines;
  if (changedLines > maxLines) add(standard, `${changedLines} changed lines (light is at most ${maxLines})`);
  if (laneFiles.length > maxFiles) add(standard, `${laneFiles.length} files (light is at most ${maxFiles})`);
  if (laneFiles.some((c) => c.status === "D")) add(standard, "a file was deleted");

  const level = strict.length ? "strict" : standard.length ? "standard" : "light";
  return { level, reasons: strict.length ? strict : standard, lines: changedLines, files: laneFiles.length, lanes: lanes.map((l) => l.name) };
}

/** Added plus removed lines per lane file since base (untracked files: all their lines). */
function diffLines(root, base, files) {
  const byFile = new Map();
  let lines = 0;
  if (!files.length) return { lines, byFile };
  const tracked = new Set(gitLines(root, ["ls-files", "--", ...files.map((f) => f.path)]));
  let current = null;
  for (const l of gitLines(root, ["diff", "--unified=0", "--no-color", "--no-renames", base ?? "HEAD", "--", ...files.map((f) => f.path)])) {
    if (l.startsWith("diff --git ")) {
      current = / b\/(.+)$/.exec(l)?.[1] ?? null;
      if (current && !byFile.has(current)) byFile.set(current, []);
    } else if (l.startsWith("+++ ") || l.startsWith("--- ")) continue;
    else if (current && /^[+-]/.test(l)) {
      byFile.get(current).push(l.slice(1));
      lines++;
    }
  }
  for (const f of files.filter((f) => f.status !== "D" && !tracked.has(f.path))) {
    try {
      const text = readFileSync(join(root, f.path), "utf8");
      const ls = text.split("\n");
      if (ls.at(-1) === "") ls.pop();
      byFile.set(f.path, ls);
      lines += ls.length;
    } catch {
      // unreadable: counted by path only
    }
  }
  return { lines, byFile };
}
