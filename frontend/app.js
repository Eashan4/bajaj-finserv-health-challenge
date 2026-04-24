// ═══════════════════════════════════════════════════════════════
// BFHL Hierarchy Analyzer — Frontend
// ═══════════════════════════════════════════════════════════════

let lastResponse = null;

// Auto-detect API URL (same origin when served by Express)
document.getElementById("apiUrl").value = window.location.origin + "/bfhl";

// ─── Submit ──────────────────────────────────────────────────
async function submitData() {
  const input = document.getElementById("nodeInput").value.trim();
  const apiUrl = document.getElementById("apiUrl").value.trim();

  if (!input) return showError("Please enter at least one node relationship.");
  if (!apiUrl) return showError("Please provide an API endpoint URL.");

  const data = input.split(",").map((s) => s.trim()).filter(Boolean);

  document.getElementById("loading").classList.remove("hidden");
  document.getElementById("results").classList.add("hidden");
  hideError();

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.style.opacity = "0.6";

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    lastResponse = await res.json();
    renderResults(lastResponse);
  } catch (err) {
    showError(err.message || "Failed to connect. Is the server running?");
  } finally {
    document.getElementById("loading").classList.add("hidden");
    btn.disabled = false;
    btn.style.opacity = "1";
  }
}

// ─── Render ──────────────────────────────────────────────────
function renderResults(d) {
  renderSummary(d.summary);
  renderIdentity(d);
  renderHierarchies(d.hierarchies);
  renderTags("invalidList", d.invalid_entries, "tag-invalid");
  renderTags("duplicateList", d.duplicate_edges, "tag-duplicate");
  document.getElementById("rawJSON").textContent = JSON.stringify(d, null, 2);
  document.getElementById("results").classList.remove("hidden");
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSummary(s) {
  document.getElementById("summaryGrid").innerHTML = `
    <div class="summary-card"><div class="summary-value trees">${s.total_trees}</div><div class="summary-label">Valid Trees</div></div>
    <div class="summary-card"><div class="summary-value cycles">${s.total_cycles}</div><div class="summary-label">Cycles Detected</div></div>
    <div class="summary-card"><div class="summary-value root">${esc(s.largest_tree_root || "—")}</div><div class="summary-label">Largest Tree Root</div></div>`;
}

function renderIdentity(d) {
  document.getElementById("identityGrid").innerHTML = [
    ["User ID", d.user_id], ["Email", d.email_id], ["Roll Number", d.college_roll_number]
  ].map(([l, v]) => `<div class="identity-item"><div class="identity-label">${l}</div><div class="identity-value">${esc(v)}</div></div>`).join("");
}

function renderHierarchies(list) {
  const el = document.getElementById("hierarchiesContainer");
  if (!list || !list.length) { el.innerHTML = '<p class="empty-state">No hierarchies found.</p>'; return; }
  el.innerHTML = list.map((h, i) => {
    const cyc = h.has_cycle === true;
    return `<div class="hierarchy-card" style="animation-delay:${i * 0.1}s">
      <div class="hierarchy-header">
        <div class="hierarchy-root"><span class="root-label">${esc(h.root)}</span></div>
        <div class="hierarchy-badges">
          ${cyc
            ? '<span class="h-badge cycle-badge">🔄 Cycle</span>'
            : `<span class="h-badge tree-badge">🌳 Tree</span><span class="h-badge depth-badge">📏 Depth: ${h.depth}</span>`}
        </div>
      </div>
      ${cyc
        ? '<div class="cycle-visual"><span>⚠️</span><span>Cyclic structure — no tree representation</span></div>'
        : `<div class="css-tree">${drawTree(h.tree)}</div>`}
    </div>`;
  }).join("");
}

function drawTree(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "";
  let out = "<ul>";
  keys.forEach((k) => {
    out += `<li><div class="tree-node-box">${esc(k)}</div>`;
    out += drawTree(obj[k]);
    out += `</li>`;
  });
  out += "</ul>";
  return out;
}

function renderTags(id, items, cls) {
  const el = document.getElementById(id);
  if (!items || !items.length) { el.innerHTML = '<span class="empty-state">None</span>'; return; }
  el.innerHTML = items.map((t, i) => `<span class="tag ${cls}" style="animation-delay:${i * 0.05}s">${esc(t)}</span>`).join("");
}

// ─── Actions ─────────────────────────────────────────────────
function loadExample() {
  document.getElementById("nodeInput").value =
    "A->B, A->C, B->D, C->E, E->F, X->Y, Y->Z, Z->X, P->Q, Q->R, G->H, G->H, G->I, hello, 1->2, A->";
  const ta = document.getElementById("nodeInput");
  ta.style.borderColor = "var(--accent-green)";
  ta.style.boxShadow = "0 0 0 3px rgba(52,211,153,0.15)";
  setTimeout(() => { ta.style.borderColor = ""; ta.style.boxShadow = ""; }, 800);
}

function clearAll() {
  document.getElementById("nodeInput").value = "";
  document.getElementById("results").classList.add("hidden");
  hideError();
  lastResponse = null;
}

function copyJSON() {
  if (!lastResponse) return;
  navigator.clipboard.writeText(JSON.stringify(lastResponse, null, 2)).then(() => {
    const btn = event.target.closest(".btn");
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="btn-icon">✅</span> Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });
}

// ─── Helpers ─────────────────────────────────────────────────
let errorTimeout;
function showError(msg) {
  document.getElementById("errorText").textContent = msg;
  const errEl = document.getElementById("error");
  errEl.classList.remove("hidden");
  
  clearTimeout(errorTimeout);
  errorTimeout = setTimeout(hideError, 5000);
}
function hideError() { 
  document.getElementById("error").classList.add("hidden"); 
}

function esc(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submitData(); }
});
