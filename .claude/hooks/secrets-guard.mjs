#!/usr/bin/env node
// PreToolUse(Read|Grep|Bash) guard: block the agent from READING secret files
// (.env, private keys, credential stores). This is a guardrail against accidental
// reads, not a security boundary — Bash coverage is best-effort defence-in-depth
// (a determined read via python/od/etc. can slip through). For an airtight Read
// block, add native `permissions.deny` (e.g. "Read(./.env)") in settings.json.
//
// Editable policy below. Template/example env files stay readable on purpose —
// they are documentation of expected config, not secrets.
import { readEvent } from "./_lib.mjs";
import { basename } from "node:path";

// A basename is a secret if it matches any of these. `.env.example` and friends
// are explicitly NOT secrets (they carry no real values).
const SAFE_ENV = /^\.env\.(example|sample|template|dist|defaults?)$/i;
function isSecretName(name) {
  const n = name.toLowerCase();
  if (/^\.env(\..+)?$/.test(n)) return !SAFE_ENV.test(n); // .env, .env.local, .env.production…
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(n)) return true; // SSH private keys (not *.pub)
  if (/^\.(npmrc|pypirc|netrc|pgpass|htpasswd)$/.test(n)) return true; // token/credential files
  if (/^(credentials|secrets?)(\.(json|ya?ml|env|txt))?$/.test(n)) return true;
  if (/\.(pem|key|p12|pfx|keystore|jks|secret)$/.test(n)) return true; // key material
  return false;
}

const ev = await readEvent();
const tool = ev.tool_name || "";
const ti = ev.tool_input || {};

function block(what) {
  process.stderr.write(
    `[keel:secrets-guard] Blocked read of a secret file (${what}). ` +
      `Reading secrets (.env, keys, credentials) is disabled to avoid leaking them into the transcript. ` +
      `If you need the shape of the config, read the .env.example instead; to override, edit .claude/hooks/secrets-guard.mjs.\n`,
  );
  process.exit(2);
}

// Read / Grep / Notebook: any structured path field that names a secret file.
if (tool === "Read" || tool === "Grep") {
  for (const p of [ti.file_path, ti.path, ti.notebook_path]) {
    if (p && isSecretName(basename(String(p)))) block(String(p));
  }
  process.exit(0);
}

// Bash: best-effort. Block when a secret filename token appears together with a
// reading verb, or is fed in via input redirection. File-management verbs
// (rm/mv/cp/touch/git add/echo>>) are left alone so `.env` can still be managed.
if (tool === "Bash") {
  const cmd = String(ti.command || "");
  const SECRET_TOKEN =
    /(?:^|[\s'"=/])(\.env(?:\.(?!example|sample|template|dist|defaults?)[\w-]+)?|id_(?:rsa|dsa|ecdsa|ed25519)|\.npmrc|\.pypirc|\.netrc|\.pgpass|\.htpasswd|credentials(?:\.\w+)?|secrets?\.\w+|[\w./-]+\.(?:pem|key|p12|pfx|keystore|jks|secret))(?=$|[\s'":;)|&<])/i;
  const READ_VERB =
    /\b(cat|less|more|head|tail|nl|tac|view|vi|vim|nvim|emacs|nano|od|xxd|hexdump|strings|base64|grep|egrep|fgrep|rg|ag|awk|sed|cut|tr|dotenv)\b/i;
  const REDIRECT_IN = /<\s*['"]?[\w./-]*\.(env|pem|key|secret)\b/i;
  const m = cmd.match(SECRET_TOKEN);
  if (m && (READ_VERB.test(cmd) || REDIRECT_IN.test(cmd))) block(m[1]);
  process.exit(0);
}

process.exit(0);
