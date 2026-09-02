#!/usr/bin/env node
// OKF bundle visualizer: reads .md files with `type:` frontmatter and renders
// an interactive force-directed graph as self-contained HTML (zero external deps).
// Usage: node okf-visualize.mjs <bundleDir> [--out <file>]

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, basename, dirname, resolve } from "node:path";

const bundleDir = process.argv[2];
const outIdx = process.argv.indexOf("--out");
const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : null;

if (!bundleDir) {
  console.error("Usage: node okf-visualize.mjs <bundleDir> [--out <file>]");
  process.exit(1);
}

const SKIP = new Set([".git", "node_modules", ".specify", ".agents", ".cursor"]);
const RESERVED = new Set(["index.md", "log.md"]);

// Minimal frontmatter parse: extract key: value lines from --- ... --- block
function parseFrontmatter(text) {
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

// Recursive walk: yield all .md files
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      yield* walk(join(dir, e.name));
    } else if (e.name.endsWith(".md")) {
      yield join(dir, e.name);
    }
  }
}

// Resolve a link target relative to a source file to bundle-relative posix path
function resolveLink(sourcePath, target, bundleDir) {
  try {
    const sourceDir = dirname(sourcePath);
    const resolved = resolve(sourceDir, target);
    const bundleResolved = resolve(bundleDir);

    // Must be within bundle
    if (!resolved.startsWith(bundleResolved)) return null;

    // Normalize to posix bundle-relative path
    const rel = relative(bundleResolved, resolved).replace(/\\/g, "/");
    return rel.endsWith(".md") ? rel : rel + ".md";
  } catch {
    return null;
  }
}

// Extract node IDs from markdown links ](<target>) and wiki-links [[<name>]]
function extractLinks(text, sourceId, nodes, bundleDir, sourceFilePath) {
  const edges = [];
  const nodeMap = new Map();

  // Build lookup map: id -> node, label -> node, basename -> node
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    if (node.label) nodeMap.set(node.label, node);
    const baseName = node.id.split("/").pop().replace(/\.md$/, "");
    nodeMap.set(baseName, node);
  }

  // Markdown links: ](<target>)
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1].trim().split("#")[0]; // strip anchor
    if (!target || /^(https?:|mailto:|ftp:)/.test(target)) continue; // skip absolute URLs
    const resolved = resolveLink(sourceFilePath, target, bundleDir);
    if (resolved && nodeMap.has(resolved) && resolved !== sourceId) {
      edges.push([sourceId, resolved]);
    }
  }

  // Wiki-links: [[<name>]]
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const name = m[1].trim();
    if (nodeMap.has(name)) {
      const targetNode = nodeMap.get(name);
      if (targetNode.id !== sourceId) {
        edges.push([sourceId, targetNode.id]);
      }
    }
  }

  return edges;
}

// Main: collect nodes and edges
const bundleResolved = resolve(bundleDir);
if (!existsSync(bundleResolved)) {
  console.error(`Bundle directory not found: ${bundleDir}`);
  process.exit(1);
}

const nodes = [];
const nodeMap = new Map(); // id -> node

// First pass: collect all concepts
for (const path of walk(bundleResolved)) {
  if (RESERVED.has(basename(path))) continue;

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }

  const fm = parseFrontmatter(text);
  if (!fm || !fm.type) continue;

  const id = relative(bundleResolved, path).replace(/\\/g, "/");
  const label = fm.title || basename(path).replace(/\.md$/, "");
  const description = fm.description || "";

  const node = { id, label, type: fm.type, description };
  nodes.push(node);
  nodeMap.set(id, node);
}

// Second pass: extract edges
const edgeSet = new Set();
for (const path of walk(bundleResolved)) {
  if (RESERVED.has(basename(path))) continue;

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }

  const fm = parseFrontmatter(text);
  if (!fm || !fm.type) continue;

  const id = relative(bundleResolved, path).replace(/\\/g, "/");
  const links = extractLinks(text, id, nodes, bundleResolved, path);

  for (const [source, target] of links) {
    // Dedup and skip self-edges
    if (source === target) continue;
    const edgeKey = source < target ? `${source}|${target}` : `${target}|${source}`;
    edgeSet.add(edgeKey);
  }
}

const edges = Array.from(edgeSet).map(key => {
  const [source, target] = key.split("|");
  return { source, target };
});

// Determine output file
const out = outFile || join(bundleResolved, "okf-graph.html");

// Generate self-contained HTML
const colorPalette = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
  "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B88B", "#52C0A1",
];

// Build type -> color map (sorted by type name for determinism)
const typeList = [...new Set(nodes.map(n => n.type))].sort();
const typeToColor = {};
for (let i = 0; i < typeList.length; i++) {
  typeToColor[typeList[i]] = colorPalette[i % colorPalette.length];
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OKF Graph — ${basename(bundleResolved)}</title>
  <style>
    :root {
      --bg: #f7f7f8; --panel: #ffffff; --panel-2: #f1f2f4; --border: #d7d9de;
      --ink: #1b1c1f; --muted: #5b5f66; --accent: #2563eb; --accent-ink: #ffffff;
      --canvas-bg: #ffffff; --focus: #1d4ed8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #17181b; --panel: #1f2024; --panel-2: #26282d; --border: #3a3d44;
        --ink: #e9eaec; --muted: #a3a7b0; --accent: #6ea8fe;
        --accent-ink: #0b0c0f; --canvas-bg: #202226; --focus: #8ab4ff;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg); color: var(--ink); line-height: 1.45;
      display: flex; flex-direction: column;
    }
    .visually-hidden {
      position: absolute !important; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0);
      white-space: nowrap; border: 0;
    }
    a { color: var(--accent); }
    :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

    header.app-head {
      display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
      padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel);
    }
    header.app-head h1 { font-size: 15px; font-weight: 700; margin-right: 4px; }
    header.app-head .count { font-size: 12px; color: var(--muted); }
    .search { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    .search label { font-size: 12px; color: var(--muted); }
    .search input {
      font: inherit; font-size: 13px; padding: 6px 10px; min-width: 190px;
      border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); color: var(--ink);
    }

    .app { flex: 1; display: flex; min-height: 0; }
    .canvas-wrap { flex: 1; min-width: 0; min-height: 0; position: relative; }
    #canvas { display: block; width: 100%; height: 100%; background: var(--canvas-bg); cursor: grab; touch-action: none; }
    #canvas.dragging { cursor: grabbing; }

    .zoom-controls {
      position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 6px;
    }
    .zoom-controls button {
      width: 34px; height: 34px; font-size: 16px; font-weight: 700; cursor: pointer;
      border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--ink);
      display: flex; align-items: center; justify-content: center;
    }
    .zoom-controls button:hover { background: var(--panel-2); }

    aside.sidebar {
      width: 320px; flex-shrink: 0; border-left: 1px solid var(--border);
      background: var(--panel); display: flex; flex-direction: column; min-height: 0;
    }
    .panel { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .panel h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 10px; }
    #legend .legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px; }
    .legend-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.15); }

    #info h3 { font-size: 15px; margin-bottom: 4px; }
    #info .type-badge {
      display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
      background: var(--panel-2); border: 1px solid var(--border); margin-bottom: 8px;
    }
    #info p { font-size: 13px; color: var(--ink); }
    #info .muted { color: var(--muted); }
    #info .conns { margin-top: 10px; }
    #info .conns strong { font-size: 12px; color: var(--muted); display: block; margin-bottom: 4px; }
    #info .conns button {
      display: block; width: 100%; text-align: left; font: inherit; font-size: 13px; color: var(--accent);
      background: none; border: 0; padding: 3px 0; cursor: pointer;
    }
    #info .conns button:hover { text-decoration: underline; }

    .nodelist { flex: 1; overflow-y: auto; min-height: 0; }
    .nodelist ul { list-style: none; }
    .nodelist li button {
      display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
      font: inherit; font-size: 13px; color: var(--ink); background: none; border: 0;
      padding: 7px 16px; cursor: pointer; border-left: 3px solid transparent;
    }
    .nodelist li button:hover { background: var(--panel-2); }
    .nodelist li button[aria-current="true"] { background: var(--panel-2); border-left-color: var(--accent); font-weight: 600; }
    .nodelist .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .nodelist .nl-type { margin-left: auto; font-size: 11px; color: var(--muted); }
    .nodelist li.hidden { display: none; }
    .nodelist .no-match { padding: 14px 16px; font-size: 13px; color: var(--muted); }

    .empty-state { margin: auto; text-align: center; color: var(--muted); padding: 40px; }

    /* Stack the sidebar under the graph on narrow viewports */
    @media (max-width: 760px) {
      .app { flex-direction: column; }
      aside.sidebar { width: 100%; border-left: 0; border-top: 1px solid var(--border); max-height: 45vh; }
      .canvas-wrap { min-height: 300px; }
    }
  </style>
</head>
<body>
  <header class="app-head">
    <h1>OKF Graph</h1>
    <span class="count" id="count"></span>
    <div class="search" role="search">
      <label for="search-input">Search</label>
      <input id="search-input" type="search" placeholder="Filter concepts…" autocomplete="off"
             aria-controls="node-list" aria-describedby="search-help">
      <span id="search-help" class="visually-hidden">Type to filter the concept list. Press Enter to select the first match.</span>
    </div>
  </header>

  <div class="app">
    <div class="canvas-wrap">
      <canvas id="canvas" aria-hidden="true"></canvas>
      <div class="zoom-controls">
        <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" id="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" id="zoom-reset" aria-label="Reset view" title="Reset view">⤢</button>
      </div>
    </div>

    <aside class="sidebar" aria-label="Concept details and navigation">
      <div class="panel" id="legend-panel">
        <h2 id="legend-h">Types</h2>
        <div id="legend" role="list" aria-labelledby="legend-h"></div>
      </div>
      <div class="panel" id="info" aria-live="polite">
        <p class="muted">Select a concept to see its details and connections.</p>
      </div>
      <nav class="nodelist" aria-label="All concepts">
        <ul id="node-list"></ul>
        <p class="no-match" id="no-match" hidden>No concept matches your search.</p>
      </nav>
    </aside>
  </div>

  <div class="visually-hidden" aria-live="polite" id="sr-status"></div>

  <script>
    const DATA = {
      nodes: ${JSON.stringify(nodes)},
      edges: ${JSON.stringify(edges)},
      typeToColor: ${JSON.stringify(typeToColor)},
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const infoPane = document.getElementById('info');
    const legend = document.getElementById('legend');
    const nodeListEl = document.getElementById('node-list');
    const noMatchEl = document.getElementById('no-match');
    const searchInput = document.getElementById('search-input');
    const srStatus = document.getElementById('sr-status');
    const countEl = document.getElementById('count');

    countEl.textContent = DATA.nodes.length + ' concept' + (DATA.nodes.length === 1 ? '' : 's') +
      ', ' + DATA.edges.length + ' link' + (DATA.edges.length === 1 ? '' : 's');

    // ---- Adjacency ----
    const adjacency = new Map();
    for (const n of DATA.nodes) adjacency.set(n.id, new Set());
    for (const e of DATA.edges) {
      adjacency.get(e.source)?.add(e.target);
      adjacency.get(e.target)?.add(e.source);
    }
    const nodeById = new Map(DATA.nodes.map(n => [n.id, n]));

    // ---- View transform (screen = world * scale + translate), independent of DPR ----
    const view = { scale: 1, tx: 0, ty: 0 };
    let dpr = 1, cssW = 0, cssH = 0;

    function resizeCanvas() {
      dpr = window.devicePixelRatio || 1;
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // crisp on HiDPI; we draw in CSS pixels
      draw();
    }

    // ---- Physics (world coords span the initial CSS viewport) ----
    const NODE_R = 9;
    const sim = {
      nodes: DATA.nodes.map((n, i) => {
        // Deterministic initial ring layout (stable across reloads, unlike Math.random)
        const a = (i / Math.max(1, DATA.nodes.length)) * Math.PI * 2;
        return { ...n, x: 0, y: 0, a, vx: 0, vy: 0, fx: 0, fy: 0, fixed: false };
      }),
      edges: DATA.edges,
      friction: 0.85, repulsion: 9000, springK: 0.08, springLen: 110, center: 0.02,
      alpha: 1, alphaDecay: 0.02, alphaMin: 0.004,
    };
    function seedLayout() {
      const cx = cssW / 2, cy = cssH / 2, r = Math.min(cssW, cssH) * 0.32 + 1;
      for (const n of sim.nodes) { n.x = cx + Math.cos(n.a) * r; n.y = cy + Math.sin(n.a) * r; }
    }

    function step() {
      const nodes = sim.nodes;
      for (const n of nodes) { n.fx = 0; n.fy = 0; }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const force = sim.repulsion / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.fx -= fx; a.fy -= fy; b.fx += fx; b.fy += fy;
        }
      }
      for (const edge of sim.edges) {
        const a = nodeSim(edge.source), b = nodeSim(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const spring = sim.springK * (dist - sim.springLen);
        const fx = (dx / dist) * spring, fy = (dy / dist) * spring;
        a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
      }
      const cx = cssW / 2, cy = cssH / 2;
      for (const n of nodes) {
        n.fx += (cx - n.x) * sim.center; n.fy += (cy - n.y) * sim.center;
      }
      for (const n of nodes) {
        if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
        n.vx = (n.vx + n.fx) * sim.friction; n.vy = (n.vy + n.fy) * sim.friction;
        n.x += n.vx * sim.alpha; n.y += n.vy * sim.alpha;
      }
      sim.alpha += (0 - sim.alpha) * sim.alphaDecay;
    }
    const _simIndex = new Map();
    function nodeSim(id) { return _simIndex.get(id); }

    // ---- Selection / highlight state ----
    let selectedId = null;
    let hoverId = null;

    function neighborsOf(id) { return adjacency.get(id) || new Set(); }
    function isDimmed(id) {
      if (!selectedId) return false;
      return id !== selectedId && !neighborsOf(selectedId).has(id);
    }

    // ---- Coordinate helpers ----
    function worldToScreen(x, y) { return [x * view.scale + view.tx, y * view.scale + view.ty]; }
    function screenToWorld(sx, sy) { return [(sx - view.tx) / view.scale, (sy - view.ty) / view.scale]; }

    function draw() {
      ctx.clearRect(0, 0, cssW, cssH);
      const styles = getComputedStyle(document.documentElement);
      const edgeColor = styles.getPropertyValue('--ink').trim() || '#333';
      const labelColor = styles.getPropertyValue('--ink').trim() || '#333';
      const haloColor = styles.getPropertyValue('--canvas-bg').trim() || '#fff';

      // Edges
      ctx.lineWidth = 1;
      for (const edge of sim.edges) {
        const a = nodeSim(edge.source), b = nodeSim(edge.target);
        if (!a || !b) continue;
        const touchesSel = selectedId && (edge.source === selectedId || edge.target === selectedId);
        const dim = selectedId && !touchesSel;
        ctx.strokeStyle = edgeColor;
        ctx.globalAlpha = dim ? 0.06 : (touchesSel ? 0.5 : 0.18);
        ctx.lineWidth = touchesSel ? 2 : 1;
        const [ax, ay] = worldToScreen(a.x, a.y), [bx, by] = worldToScreen(b.x, b.y);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Nodes + labels
      ctx.font = '12px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      for (const n of sim.nodes) {
        const [sx, sy] = worldToScreen(n.x, n.y);
        const dim = isDimmed(n.id);
        ctx.globalAlpha = dim ? 0.25 : 1;
        const r = (n.id === selectedId) ? NODE_R + 2 : NODE_R;
        ctx.fillStyle = DATA.typeToColor[n.type] || '#999';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        if (n.id === selectedId || n.id === hoverId) {
          ctx.lineWidth = 3; ctx.strokeStyle = labelColor; ctx.stroke();
        }
        // Label with a halo so it stays legible over edges (not color-only signal)
        const showLabel = !dim || n.id === selectedId;
        if (showLabel) {
          ctx.globalAlpha = dim ? 0.5 : 1;
          ctx.lineWidth = 3; ctx.strokeStyle = haloColor; ctx.lineJoin = 'round';
          ctx.strokeText(n.label, sx + r + 5, sy);
          ctx.fillStyle = labelColor;
          ctx.fillText(n.label, sx + r + 5, sy);
        }
      }
      ctx.globalAlpha = 1;
    }

    // ---- Animation controller (settles then stops; respects reduced motion) ----
    let running = false;
    function loop() {
      if (sim.alpha > sim.alphaMin) { step(); draw(); requestAnimationFrame(loop); }
      else { running = false; draw(); }
    }
    function kick() {
      if (prefersReducedMotion) {
        let iter = 0;
        while (sim.alpha > sim.alphaMin && iter < 600) { step(); iter++; }
        draw();
        return;
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    }
    function reheat(v) { sim.alpha = Math.max(sim.alpha, v || 0.6); kick(); }

    // ---- Hit testing (screen space) ----
    function nodeAtScreen(sx, sy) {
      for (let i = sim.nodes.length - 1; i >= 0; i--) {
        const n = sim.nodes[i];
        const [nx, ny] = worldToScreen(n.x, n.y);
        if (Math.hypot(nx - sx, ny - sy) <= NODE_R + 4) return n.id;
      }
      return null;
    }

    // ---- Info pane + accessible list + SR announcements ----
    function renderInfo(id) {
      const node = nodeById.get(id);
      if (!node) { infoPane.innerHTML = '<p class="muted">Select a concept to see its details and connections.</p>'; return; }
      const conns = [...neighborsOf(id)].map(cid => nodeById.get(cid)).filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label));
      const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      let html = '<h3>' + esc(node.label) + '</h3>' +
        '<span class="type-badge">' + esc(node.type) + '</span>';
      html += node.description ? '<p>' + esc(node.description) + '</p>' : '<p class="muted">No description.</p>';
      html += '<div class="conns"><strong>' + conns.length + ' connection' + (conns.length === 1 ? '' : 's') + '</strong>';
      for (const c of conns) html += '<button type="button" data-goto="' + esc(c.id) + '">' + esc(c.label) + ' <span class="muted">· ' + esc(c.type) + '</span></button>';
      html += '</div>';
      infoPane.innerHTML = html;
      infoPane.querySelectorAll('button[data-goto]').forEach(b =>
        b.addEventListener('click', () => select(b.getAttribute('data-goto'), { focusList: true })));
    }

    function announce(id) {
      const node = nodeById.get(id); if (!node) return;
      const conns = [...neighborsOf(id)].map(cid => nodeById.get(cid)?.label).filter(Boolean);
      srStatus.textContent = 'Selected ' + node.label + ', type ' + node.type + '. ' +
        (conns.length ? conns.length + ' connections: ' + conns.join(', ') + '.' : 'No connections.');
    }

    function select(id, opts = {}) {
      selectedId = id;
      renderInfo(id);
      // Sync accessible list current-item
      nodeListEl.querySelectorAll('button[data-id]').forEach(b =>
        b.setAttribute('aria-current', b.getAttribute('data-id') === id ? 'true' : 'false'));
      if (id != null) {
        announce(id);
        if (opts.center) centerOn(id);
        if (opts.focusList) {
          const btn = nodeListEl.querySelector('button[data-id="' + cssEsc(id) + '"]');
          if (btn) btn.focus();
        }
      }
      draw();
    }
    function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\\\"'); }

    function centerOn(id) {
      const n = nodeSim(id); if (!n) return;
      view.tx = cssW / 2 - n.x * view.scale;
      view.ty = cssH / 2 - n.y * view.scale;
      draw();
    }

    // ---- Zoom / pan ----
    function zoomAt(sx, sy, factor) {
      const [wx, wy] = screenToWorld(sx, sy);
      view.scale = Math.max(0.2, Math.min(4, view.scale * factor));
      view.tx = sx - wx * view.scale;
      view.ty = sy - wy * view.scale;
      draw();
    }
    function resetView() { view.scale = 1; view.tx = 0; view.ty = 0; draw(); }

    document.getElementById('zoom-in').addEventListener('click', () => zoomAt(cssW / 2, cssH / 2, 1.2));
    document.getElementById('zoom-out').addEventListener('click', () => zoomAt(cssW / 2, cssH / 2, 1 / 1.2));
    document.getElementById('zoom-reset').addEventListener('click', resetView);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });

    // Pointer: drag a node, or pan the background
    let dragNode = null, panning = false, last = null, moved = false;
    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      moved = false; last = { sx, sy };
      const id = nodeAtScreen(sx, sy);
      if (id) { dragNode = nodeSim(id); if (dragNode) dragNode.fixed = true; }
      else { panning = true; canvas.classList.add('dragging'); }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (dragNode) {
        const [wx, wy] = screenToWorld(sx, sy);
        dragNode.x = wx; dragNode.y = wy; moved = true; reheat(0.3);
      } else if (panning && last) {
        view.tx += sx - last.sx; view.ty += sy - last.sy; last = { sx, sy }; moved = true; draw();
      } else {
        const id = nodeAtScreen(sx, sy);
        if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : 'grab'; draw(); }
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (dragNode && !moved) select(dragNode.id);      // click on node = select
      else if (panning && !moved) select(null);         // click empty space = clear
      if (dragNode) dragNode.fixed = false;
      dragNode = null; panning = false; last = null;
      canvas.classList.remove('dragging');
    });

    // ---- Legend (color + text, never color alone) ----
    (function buildLegend() {
      const types = Object.keys(DATA.typeToColor).sort();
      legend.innerHTML = types.map(t =>
        '<div class="legend-item" role="listitem"><span class="legend-swatch" style="background:' +
        DATA.typeToColor[t] + '"></span>' + t + '</div>').join('') || '<p class="muted">No types.</p>';
    })();

    // ---- Accessible, keyboard-navigable node list (the screen-reader path) ----
    (function buildList() {
      const sorted = [...DATA.nodes].sort((a, b) => a.label.localeCompare(b.label));
      const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      nodeListEl.innerHTML = sorted.map(n => {
        const conns = neighborsOf(n.id).size;
        return '<li><button type="button" data-id="' + esc(n.id) + '" aria-current="false">' +
          '<span class="dot" style="background:' + (DATA.typeToColor[n.type] || '#999') + '"></span>' +
          '<span>' + esc(n.label) + '</span>' +
          '<span class="nl-type">' + esc(n.type) + ' · ' + conns + '</span>' +
          '</button></li>';
      }).join('');
      nodeListEl.querySelectorAll('button[data-id]').forEach(b => {
        b.addEventListener('click', () => select(b.getAttribute('data-id'), { center: true }));
      });
    })();

    // Roving arrow-key navigation within the list
    nodeListEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...nodeListEl.querySelectorAll('li:not(.hidden) button')];
      const idx = items.indexOf(document.activeElement);
      if (idx < 0) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
      items[next]?.focus();
    });

    // ---- Search / filter ----
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      let visible = 0;
      nodeListEl.querySelectorAll('li').forEach(li => {
        const btn = li.querySelector('button');
        const n = nodeById.get(btn.getAttribute('data-id'));
        const match = !q || n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
        li.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      noMatchEl.hidden = visible !== 0;
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const first = nodeListEl.querySelector('li:not(.hidden) button');
      if (first) select(first.getAttribute('data-id'), { center: true, focusList: true });
    });

    // ---- Boot ----
    function boot() {
      _simIndex.clear();
      for (const n of sim.nodes) _simIndex.set(n.id, n);
      resizeCanvas();
      seedLayout();
      if (DATA.nodes.length === 0) {
        canvas.style.display = 'none';
        canvas.insertAdjacentHTML('afterend', '<div class="empty-state">No OKF concepts found in this bundle.<br>Tag docs with a <code>type:</code> frontmatter field.</div>');
        return;
      }
      kick();
    }
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => { resizeCanvas(); reheat(0.4); });
    });
    boot();
  </script>
</body>
</html>`;

try {
  writeFileSync(out, html, "utf8");
  console.log(`✓ wrote ${out} (${nodes.length} nodes, ${edges.length} edges)`);
} catch (err) {
  console.error(`Failed to write ${out}: ${err.message}`);
  process.exit(1);
}
