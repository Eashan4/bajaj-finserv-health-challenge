require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS Configuration ─────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGINS || "*";
app.use(
  cors({
    origin: corsOrigins === "*" ? true : corsOrigins.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// ═════════════════════════════════════════════════════════════
// Processing Engine
// ═════════════════════════════════════════════════════════════

const EDGE_REGEX = /^([A-Z])->([A-Z])$/;

/**
 * Validate and parse a single entry after trimming.
 * Returns { valid, parent, child, key } or { valid: false }.
 */
function parseEntry(raw) {
  if (typeof raw !== "string") return { valid: false, display: String(raw) };
  const trimmed = raw.trim();
  if (trimmed === "") return { valid: false, display: trimmed };
  const m = trimmed.match(EDGE_REGEX);
  if (!m) return { valid: false, display: trimmed };
  if (m[1] === m[2]) return { valid: false, display: trimmed }; // self-loop
  return { valid: true, parent: m[1], child: m[2], key: `${m[1]}->${m[2]}`, display: trimmed };
}

/**
 * Phase 1 — Classify every entry: valid / invalid / duplicate.
 * NOTE: Multi-parent resolution is intentionally NOT done here — it happens
 * during tree construction so that back-edges (which form cycles) are not
 * incorrectly discarded as multi-parent violations before cycle detection runs.
 */
function classifyEntries(data) {
  const invalid = [];
  const duplicateSet = new Set();
  const seenEdges = new Set();
  const edges = [];               // surviving valid, non-duplicate edges
  const nodeOrder = [];           // first-appearance order of nodes
  const seenNodes = new Set();

  for (const raw of data) {
    const p = parseEntry(raw);
    if (!p.valid) { invalid.push(p.display); continue; }

    // Duplicate edge? Record it once in duplicate_edges, skip.
    if (seenEdges.has(p.key)) { duplicateSet.add(p.key); continue; }
    seenEdges.add(p.key);

    edges.push({ parent: p.parent, child: p.child });

    // Track node order for component ordering
    if (!seenNodes.has(p.parent)) { seenNodes.add(p.parent); nodeOrder.push(p.parent); }
    if (!seenNodes.has(p.child))  { seenNodes.add(p.child);  nodeOrder.push(p.child); }
  }

  return { edges, invalid, duplicates: [...duplicateSet], nodeOrder };
}

/**
 * Phase 2 — Build adjacency and find connected components (in first-appearance order).
 */
function findComponents(edges, nodeOrder) {
  // Directed adjacency (all valid non-duplicate edges, before multi-parent filtering)
  const dir = {};
  // Undirected adjacency (for component discovery only)
  const undir = {};

  for (const { parent, child } of edges) {
    (dir[parent] ||= []).push(child);
    (undir[parent] ||= []).push(child);
    (undir[child] ||= []).push(parent);
  }

  const visited = new Set();
  const components = [];

  for (const startNode of nodeOrder) {
    if (visited.has(startNode)) continue;

    // BFS to collect component
    const queue = [startNode];
    const comp = new Set();
    visited.add(startNode);
    while (queue.length) {
      const node = queue.shift();
      comp.add(node);
      for (const nb of undir[node] || []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    components.push(comp);
  }

  return { components, dir };
}

/**
 * Phase 3 — Analyse a single component: detect cycle, build tree, compute depth.
 *
 * Multi-parent rule is applied only during tree construction (not before), so that
 * cycle back-edges are visible to the DFS cycle detector.
 */
function analyseComponent(comp, dir) {
  // All directed edges within this component (includes potential back/cross edges)
  // Used for cycle detection with the full edge set.

  // Roots = nodes NOT appearing as a child in any intra-component edge
  const compChildren = new Set();
  for (const node of comp) {
    for (const ch of dir[node] || []) {
      if (comp.has(ch)) compChildren.add(ch);
    }
  }
  const roots = [...comp].filter((n) => !compChildren.has(n)).sort();

  // ── Cycle detection (DFS with recursion stack, on full edge set) ──
  let hasCycle = false;
  const white = new Set(comp);   // unvisited
  const grey  = new Set();       // in-progress (on current DFS path)

  function dfsCycle(node) {
    white.delete(node);
    grey.add(node);
    for (const ch of dir[node] || []) {
      if (!comp.has(ch)) continue;
      if (grey.has(ch))  { hasCycle = true; return; }
      if (white.has(ch)) { dfsCycle(ch); if (hasCycle) return; }
    }
    grey.delete(node);
  }

  // Start DFS from roots first (so we traverse in natural direction), then any
  // remaining unvisited nodes (handles pure cycles with no root).
  const startOrder = [...roots, ...[...comp].filter(n => !roots.includes(n))];
  for (const node of startOrder) {
    if (white.has(node)) { dfsCycle(node); if (hasCycle) break; }
  }

  if (hasCycle) {
    // For cyclic components: use the true root if one exists, otherwise lex-smallest node.
    const root = roots.length > 0 ? roots[0] : [...comp].sort()[0];
    return { root, tree: {}, has_cycle: true };
  }

  // ── Tree construction (apply multi-parent rule here) ──
  // For acyclic components, a proper root is guaranteed to exist.
  const root = roots[0];

  // Build a restricted child map that respects the first-parent rule:
  // for each node, only the first-encountered parent edge is kept.
  const firstParent = {};  // child → first parent (in edge input order)
  const treeChildren = {}; // parent → [children] after multi-parent filtering

  for (const node of comp) {
    for (const ch of (dir[node] || [])) {
      if (!comp.has(ch)) continue;
      if (firstParent[ch] === undefined) {
        // First parent to claim this child wins
        firstParent[ch] = node;
        (treeChildren[node] ||= []).push(ch);
      }
      // Subsequent parent edges for the same child are silently discarded
    }
  }

  function buildTree(node) {
    const children = (treeChildren[node] || []).slice().sort();
    const sub = {};
    for (const ch of children) sub[ch] = buildTree(ch);
    return sub;
  }

  function calcDepth(node) {
    const children = treeChildren[node] || [];
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map(calcDepth));
  }

  return { root, tree: { [root]: buildTree(root) }, depth: calcDepth(root) };
}

/**
 * Master processor — ties all phases together.
 */
function processData(data) {
  const { edges, invalid, duplicates, nodeOrder } = classifyEntries(data);
  const { components, dir } = findComponents(edges, nodeOrder);
  const hierarchies = components.map((comp) => analyseComponent(comp, dir));

  // Summary
  const trees  = hierarchies.filter((h) => !h.has_cycle);
  const cycles = hierarchies.filter((h) => h.has_cycle);

  let largestRoot = "";
  let maxDepth = 0;
  for (const t of trees) {
    if (t.depth > maxDepth || (t.depth === maxDepth && (largestRoot === "" || t.root < largestRoot))) {
      maxDepth = t.depth;
      largestRoot = t.root;
    }
  }

  return {
    user_id: process.env.USER_ID || "fullname_ddmmyyyy",
    email_id: process.env.EMAIL_ID || "email@college.edu",
    college_roll_number: process.env.COLLEGE_ROLL_NUMBER || "ROLL_NUMBER",
    hierarchies,
    invalid_entries: invalid,
    duplicate_edges: duplicates,
    summary: {
      total_trees: trees.length,
      total_cycles: cycles.length,
      largest_tree_root: largestRoot,
    },
  };
}

// ═════════════════════════════════════════════════════════════
// Routes
// ═════════════════════════════════════════════════════════════

app.post("/bfhl", (req, res) => {
  try {
    const { data } = req.body || {};
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "'data' must be an array of strings." });
    }
    res.json(processData(data));
  } catch (err) {
    console.error("POST /bfhl error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/bfhl", (_req, res) => {
  res.json({ operation_code: 1 });
});

// SPA fallback — serve index.html for any non-API route
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

// ═════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🚀  BFHL server running → http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/bfhl`);
  console.log(`   Frontend http://localhost:${PORT}\n`);
});
