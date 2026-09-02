#!/usr/bin/env node
// okf-build-index — Generate and validate OKF bundle index.md files (recursive per-directory)
// Zero-dependency: node: builtins only. Never throws uncaught.
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, relative, dirname, posix } from "node:path";

// Minimal frontmatter parse: key:value lines inside the leading --- ... --- block.
function frontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const fm = {};
  for (const line of text.slice(3, end).split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return fm;
}

// Recursive walk for .md files
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if ([".git", "node_modules"].includes(e.name)) continue;
      yield* walk(join(dir, e.name));
    } else if (e.name.endsWith(".md") && !e.name.startsWith("_")) {
      yield join(dir, e.name);
    }
  }
}

// Pure function: generate all index.md files for a bundle
// Returns Map of { dirRelPath -> indexMarkdownString }
// dirRelPath uses posix "/" separators; root is ""
function generateAll(bundleDir) {
  const concepts = [];

  // Walk bundleDir for typed .md files (skip index.md and log.md)
  for (const filePath of walk(bundleDir)) {
    const fileName = filePath.split("/").pop();
    if (fileName === "index.md" || fileName === "log.md") continue;

    let text;
    try {
      text = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const fm = frontmatter(text);
    if (!fm || !fm.type) continue;

    // Extract relative path with posix separators
    const relPath = posix.normalize(relative(bundleDir, filePath).replace(/\\/g, "/"));
    const title = fm.title || fm.name || relPath.replace(/\.md$/, "");
    const description = fm.description || "";

    // Immediate parent directory (posix)
    const parts = relPath.split("/");
    const dirPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

    concepts.push({
      type: fm.type,
      title,
      description,
      path: relPath,
      fileName: parts[parts.length - 1],
      dirPath, // immediate parent dir, empty string for root
    });
  }

  // Determine which directories need an index.md
  const dirsWithConcepts = new Set();
  for (const c of concepts) {
    dirsWithConcepts.add(c.dirPath);
  }

  // Also include all ancestors
  const allDirsNeedingIndex = new Set();
  allDirsNeedingIndex.add(""); // Always include root
  for (const dir of dirsWithConcepts) {
    allDirsNeedingIndex.add(dir);
    // Walk up the tree
    let current = dir;
    while (current) {
      allDirsNeedingIndex.add(current);
      const parts = current.split("/");
      if (parts.length > 1) {
        current = parts.slice(0, -1).join("/");
      } else {
        break;
      }
    }
  }

  // Generate index.md for each directory
  const result = new Map();

  for (const dirPath of allDirsNeedingIndex) {
    const lines = [];

    // Add frontmatter only for root
    if (dirPath === "") {
      lines.push("---");
      lines.push('okf_version: "0.1"');
      lines.push("---");
      lines.push("");
    }

    // Get concepts in THIS directory only (not subdirs)
    const myConceptsUnsorted = concepts.filter((c) => c.dirPath === dirPath);
    const myConcepts = myConceptsUnsorted.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.fileName.localeCompare(b.fileName);
    });

    // Group by type and emit
    const byType = {};
    for (const c of myConcepts) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c);
    }

    const sortedTypes = Object.keys(byType).sort();
    for (const type of sortedTypes) {
      lines.push(`# ${type}`);
      for (const c of byType[type]) {
        if (c.description) {
          lines.push(`* [${c.title}](${c.fileName}) - ${c.description}`);
        } else {
          lines.push(`* [${c.title}](${c.fileName})`);
        }
      }
      lines.push("");
    }

    // Find child directories that have concepts (direct children only)
    const childDirs = new Set();
    for (const c of concepts) {
      if (c.dirPath.startsWith(dirPath)) {
        let rest = c.dirPath;
        if (dirPath) {
          rest = c.dirPath.slice(dirPath.length + 1); // remove prefix and /
        }
        if (rest && rest.includes("/")) {
          // child is deeper, extract immediate child dir name
          const firstChild = rest.split("/")[0];
          const childPath = dirPath ? `${dirPath}/${firstChild}` : firstChild;
          childDirs.add(childPath);
        } else if (rest) {
          // concept is directly in a child, but we need to check if there's a subdir
          const childPath = dirPath ? `${dirPath}/${rest.split("/")[0]}` : rest.split("/")[0];
          childDirs.add(childPath);
        }
      }
    }

    // Only include child dirs that actually have concepts in their subtree
    const validChildDirs = [];
    for (const cd of childDirs) {
      const conceptsInSubtree = concepts.filter((c) => c.dirPath === cd || c.dirPath.startsWith(cd + "/"));
      if (conceptsInSubtree.length > 0) {
        validChildDirs.push({ path: cd, count: conceptsInSubtree.length });
      }
    }

    if (validChildDirs.length > 0) {
      validChildDirs.sort((a, b) => a.path.localeCompare(b.path));
      lines.push("# Subdirectories");
      for (const cd of validChildDirs) {
        const childName = cd.path.split("/").pop();
        lines.push(`* [${childName}/](${childName}/index.md) - ${cd.count} concept(s)`);
      }
      lines.push("");
    }

    // Build final string with exactly one trailing newline
    let content = lines.join("\n");
    if (!content.endsWith("\n")) {
      content += "\n";
    }
    result.set(dirPath, content);
  }

  return result;
}

// Commands
async function main() {
  const [mode, bundleDir] = process.argv.slice(2);

  if (!mode || !bundleDir) {
    console.error("Usage: okf-build-index.mjs <build|check> <bundleDir>");
    process.exit(2);
  }

  if (mode === "build") {
    try {
      const allIndexes = generateAll(bundleDir);
      let totalConceptCount = 0;

      // Write each index file
      for (const [dirPath, content] of allIndexes) {
        const indexPath = dirPath === "" ? join(bundleDir, "index.md") : join(bundleDir, dirPath, "index.md");
        const dir = dirname(indexPath);

        // Ensure directory exists
        try {
          mkdirSync(dir, { recursive: true });
        } catch {
          // directory may already exist
        }

        writeFileSync(indexPath, content, "utf8");
        // Count concepts in this file (lines starting with * [)
        const conceptCount = content.split("\n").filter((l) => l.startsWith("* [")).length;
        totalConceptCount += conceptCount;
      }

      console.log(`✓ wrote ${allIndexes.size} index file(s) (${totalConceptCount} concepts)`);
      process.exit(0);
    } catch (err) {
      console.error(`✗ build failed: ${err.message}`);
      process.exit(1);
    }
  } else if (mode === "check") {
    const rootIndexPath = join(bundleDir, "index.md");

    // Check if index.md exists and has okf_version (opt-in check)
    if (!existsSync(rootIndexPath)) {
      console.log(`okf-index: ${bundleDir} not an OKF bundle (no index.md w/ okf_version) — skipping`);
      process.exit(0);
    }

    let rootIndexContent;
    try {
      rootIndexContent = readFileSync(rootIndexPath, "utf8");
    } catch {
      console.log(`okf-index: ${bundleDir} not an OKF bundle (no index.md w/ okf_version) — skipping`);
      process.exit(0);
    }

    const rootFm = frontmatter(rootIndexContent);
    if (!rootFm || !rootFm.okf_version) {
      console.log(`okf-index: ${bundleDir} not an OKF bundle (no index.md w/ okf_version) — skipping`);
      process.exit(0);
    }

    // Compare byte-for-byte across all index files
    try {
      const allIndexes = generateAll(bundleDir);

      for (const [dirPath, expectedContent] of allIndexes) {
        const indexPath = dirPath === "" ? join(bundleDir, "index.md") : join(bundleDir, dirPath, "index.md");

        if (!existsSync(indexPath)) {
          console.log(`✗ ${indexPath} is stale — run: node core/gates/okf-build-index.mjs build ${bundleDir}`);
          process.exit(1);
        }

        let actualContent;
        try {
          actualContent = readFileSync(indexPath, "utf8");
        } catch {
          console.log(`✗ ${indexPath} is stale — run: node core/gates/okf-build-index.mjs build ${bundleDir}`);
          process.exit(1);
        }

        if (actualContent !== expectedContent) {
          console.log(`✗ ${indexPath} is stale — run: node core/gates/okf-build-index.mjs build ${bundleDir}`);
          process.exit(1);
        }
      }

      console.log(`✓ ${bundleDir} index tree up to date`);
      process.exit(0);
    } catch (err) {
      console.error(`✗ check failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error("Usage: okf-build-index.mjs <build|check> <bundleDir>");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
