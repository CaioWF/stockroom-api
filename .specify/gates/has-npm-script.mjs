#!/usr/bin/env node
// Gate helper: exit 0 if package.json (in cwd) defines the named npm script,
// else exit 1. Zero-dep (node: builtins). Only invoked when package.json
// exists, so node is necessarily present. Usage: node has-npm-script.mjs <name>
import { readFileSync } from "node:fs";

try {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
  process.exit(process.argv[2] in scripts ? 0 : 1);
} catch {
  process.exit(1);
}
