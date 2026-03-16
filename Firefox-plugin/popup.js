// ── Direct storage (no background script) ──────────────────────────
let selectedRange = "all";

document.addEventListener("DOMContentLoaded", () => {
  loadHistory();

  document.getElementById("clear-btn").addEventListener("click", () => {
    browser.storage.local.remove("ttfw_history").then(loadHistory);
  });

  document.getElementById("export-btn").addEventListener("click", async () => {
    const result = await browser.storage.local.get("ttfw_history");
    exportJSON(result.ttfw_history || []);
  });

  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedRange = btn.dataset.range === "all" ? "all" : Number(btn.dataset.range);
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      loadHistory();
    });
  });
});

// Auto-refresh popup when content script writes new data
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ttfw_history) loadHistory();
});

async function loadHistory() {
  const result = await browser.storage.local.get("ttfw_history");
  const allHistory = result.ttfw_history || [];
  const history = filterHistory(allHistory);
  updateRangeStatus(allHistory.length, history.length);
  renderStats(history);
  renderCharts(history);
  renderModels(history);
  renderHistory(history);
}

function filterHistory(history) {
  if (selectedRange === "all") return history;
  return history.slice(-selectedRange);
}

function updateRangeStatus(total, filtered) {
  const el = document.getElementById("range-status");
  if (!el) return;
  el.textContent = selectedRange === "all"
    ? `${total} measurement${total !== 1 ? "s" : ""}`
    : `${filtered} of ${total} measurement${total !== 1 ? "s" : ""}`;
}

function exportJSON(history) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `llm-speed-monitor-${date}.json`;
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Percentile helper ──────────────────────────────────────────────

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ── Stats ──────────────────────────────────────────────────────────

function renderStats(history) {
  const count = history.length;
  // entry-count is now handled by updateRangeStatus

  if (!count) {
    ["stat-ttfw","stat-wps","stat-p50","stat-p90","stat-ttfw-p50","stat-ttfw-p90"]
      .forEach((id) => (document.getElementById(id).textContent = "—"));
    return;
  }

  const wpsArr = history.map((h) => h.wps).sort((a, b) => a - b);
  const ttfwArr = history.map((h) => h.ttfw).sort((a, b) => a - b);

  document.getElementById("stat-ttfw").textContent =
    avg(history.map((h) => h.ttfw)).toFixed(2) + "s";
  document.getElementById("stat-wps").textContent =
    avg(wpsArr).toFixed(1);
  document.getElementById("stat-p50").textContent =
    percentile(wpsArr, 50).toFixed(1);
  document.getElementById("stat-p90").textContent =
    percentile(wpsArr, 90).toFixed(1);
  document.getElementById("stat-ttfw-p50").textContent =
    percentile(ttfwArr, 50).toFixed(2) + "s";
  document.getElementById("stat-ttfw-p90").textContent =
    percentile(ttfwArr, 90).toFixed(2) + "s";
}

// ── Canvas Charts ──────────────────────────────────────────────────

const CHART_LINE   = "#7fdbca";
const CHART_FILL   = "rgba(127,219,202,0.12)";
const CHART_GRID   = "rgba(255,255,255,0.07)";
const CHART_LABEL  = "#666";
const CHART_DOT    = "#c3e88d";

function renderCharts(history) {
  const recent = history.slice(-30);
  drawLineChart("chart-wps", recent.map((h) => h.wps), "");
  drawLineChart("chart-ttfw", recent.map((h) => h.ttfw), "");
}

function drawLineChart(canvasId, values, _unit) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const PAD = { top: 8, right: 8, bottom: 20, left: 36 };

  ctx.clearRect(0, 0, W, H);

  if (!values.length) {
    ctx.fillStyle = CHART_LABEL;
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("No data", W / 2, H / 2);
    return;
  }

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const toX = (i) => PAD.left + (i / Math.max(values.length - 1, 1)) * chartW;
  const toY = (v) => PAD.top + chartH - ((v - minV) / range) * chartH;

  // Grid lines (3)
  ctx.strokeStyle = CHART_GRID;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const y = PAD.top + (i / 2) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = CHART_LABEL;
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.fillText(maxV.toFixed(maxV < 10 ? 2 : 0), PAD.left - 4, PAD.top + 4);
  ctx.fillText(minV.toFixed(minV < 10 ? 2 : 0), PAD.left - 4, H - PAD.bottom + 2);

  // X-axis tick count
  if (values.length > 1) {
    ctx.textAlign = "center";
    ctx.fillText(values.length, W - PAD.right, H - 4);
    ctx.fillText("1", PAD.left, H - 4);
  }

  // Fill area under line
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(values[0]));
  values.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v)); });
  ctx.lineTo(toX(values.length - 1), PAD.top + chartH);
  ctx.lineTo(toX(0), PAD.top + chartH);
  ctx.closePath();
  ctx.fillStyle = CHART_FILL;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(values[0]));
  values.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v)); });
  ctx.strokeStyle = CHART_LINE;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Dot on last point
  const last = values.length - 1;
  ctx.beginPath();
  ctx.arc(toX(last), toY(values[last]), 3, 0, Math.PI * 2);
  ctx.fillStyle = CHART_DOT;
  ctx.fill();
}

// ── Model breakdown ────────────────────────────────────────────────

const SITE_COLORS = {
  chatgpt: "#10a37f",
  claude: "#d97757",
  perplexity: "#20b2aa",
};

function renderModels(history) {
  const container = document.getElementById("model-list");
  const empty = document.getElementById("model-empty");
  container.innerHTML = "";

  const groups = {};
  history.forEach((h) => {
    const key = `${h.site || "chatgpt"}|${h.model || "unknown"}`;
    if (!groups[key]) groups[key] = { site: h.site || "chatgpt", model: h.model || "unknown", entries: [] };
    groups[key].entries.push(h);
  });

  const keys = Object.keys(groups);
  if (!keys.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  keys.sort().forEach((key) => {
    const { site, model, entries } = groups[key];
    const wpsVals = entries.map((e) => e.wps).sort((a, b) => a - b);
    const ttfwVals = entries.map((e) => e.ttfw).sort((a, b) => a - b);
    const color = SITE_COLORS[site] || "#aaa";

    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `
      <div class="model-name">
        <span class="model-dot" style="background:${color}"></span>
        <span class="model-label">${model}</span>
        <span class="model-count">${entries.length}×</span>
      </div>
      <div class="model-stats">
        <span class="ms">WPS avg <b>${avg(wpsVals).toFixed(1)}</b></span>
        <span class="ms">P50 <b>${percentile(wpsVals, 50).toFixed(1)}</b></span>
        <span class="ms">TTFW avg <b>${avg(ttfwVals).toFixed(2)}s</b></span>
      </div>
    `;
    container.appendChild(row);
  });
}

// ── History list ───────────────────────────────────────────────────

function renderHistory(history) {
  const container = document.getElementById("history-list");
  const emptyMsg = document.getElementById("empty-msg");
  container.innerHTML = "";

  if (!history.length) { emptyMsg.style.display = "block"; return; }
  emptyMsg.style.display = "none";

  const SITE_LABEL = { chatgpt: "GPT", claude: "Claude", perplexity: "Pplx" };

  [...history].reverse().forEach((entry) => {
    const row = document.createElement("div");
    row.className = "history-entry";

    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const siteLabel = SITE_LABEL[entry.site] || "GPT";
    const modelStr = entry.model && entry.model !== "unknown" ? entry.model : siteLabel;
    const siteColor = SITE_COLORS[entry.site] || SITE_COLORS.chatgpt;

    row.innerHTML = `
      <div class="entry-header">
        <span class="entry-model" style="color:${siteColor}">${modelStr}</span>
        <span class="entry-time">${timeStr}</span>
      </div>
      ${entry.promptPreview ? `<div class="entry-preview">${entry.promptPreview.slice(0, 100)}</div>` : ""}
      <div class="entry-metrics">
        <span class="metric">TTFW <b>${entry.ttfw.toFixed(2)}s</b></span>
        <span class="metric">WPS <b>${entry.wps.toFixed(1)}</b></span>
        <span class="metric">Words <b>${entry.wordCount}</b></span>
        ${entry.inputWords ? `<span class="metric">In <b>${entry.inputWords}w</b></span>` : ""}
      </div>
    `;
    container.appendChild(row);
  });
}
