const STORAGE_KEY = "chatgpt_ttfw_samples";
const OVERLAY_SETTINGS_KEY = "chatgpt_ttfw_overlay_settings";
const storage = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
const storageEvents = typeof browser !== "undefined" ? browser.storage : chrome.storage;
let selectedRange = 10;

function average(items, key) {
  if (!items.length) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  return total / items.length;
}

function percentile(items, key, p) {
  if (!items.length) {
    return 0;
  }

  const values = items
    .map((item) => Number(item[key]) || 0)
    .sort((a, b) => a - b);
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil((p / 100) * values.length) - 1));
  return values[index];
}

function formatMs(value) {
  if (!value && value !== 0) {
    return "-";
  }
  return `${Math.round(value)} ms`;
}

function formatNumber(value) {
  if (!value && value !== 0) {
    return "-";
  }
  return Number(value).toFixed(2);
}

function formatCompactMs(value) {
  if (!value && value !== 0) {
    return "-";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }

  return `${Math.round(value)}ms`;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function renderSummary(samples) {
  document.getElementById("samples-count").textContent = String(samples.length);
  document.getElementById("avg-ttfw").textContent = formatMs(average(samples, "ttfwMs"));
  document.getElementById("avg-ttlw").textContent = formatMs(average(samples, "ttlwMs"));
  document.getElementById("avg-wps").textContent = formatNumber(average(samples, "wordsPerSecond"));
}

function filterSamples(samples) {
  if (selectedRange === "all") {
    return samples;
  }

  return samples.slice(0, selectedRange);
}

function renderRangeState(totalCount, filteredCount) {
  const label = selectedRange === "all" ? "all samples" : `last ${selectedRange} samples`;
  document.getElementById("range-status").textContent = `Using ${label}${selectedRange === "all" ? "" : ` of ${totalCount}`}`;

  document.querySelectorAll(".range-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === String(selectedRange));
  });
}

function buildChartSvg(values) {
  const width = 320;
  const height = 132;
  const padding = { top: 10, right: 8, bottom: 20, left: 8 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);

  const points = values.map((value, index) => {
    const x = padding.left + (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - ((value - minValue) / range) * innerHeight;
    return { x, y, value };
  });

  const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = [
    `${padding.left},${padding.top + innerHeight}`,
    ...points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`),
    `${padding.left + innerWidth},${padding.top + innerHeight}`
  ].join(" ");

  const midY = padding.top + innerHeight / 2;

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line class="chart-grid-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left + innerWidth}" y2="${padding.top}"></line>
      <line class="chart-grid-line" x1="${padding.left}" y1="${midY}" x2="${padding.left + innerWidth}" y2="${midY}"></line>
      <line class="chart-grid-line" x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${padding.left + innerWidth}" y2="${padding.top + innerHeight}"></line>
      <polygon class="chart-area" points="${area}"></polygon>
      <polyline class="chart-line" points="${polyline}"></polyline>
      <circle class="chart-point" cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="3.5"></circle>
      <text class="chart-label" x="${padding.left}" y="${height - 6}">Oldest</text>
      <text class="chart-label" x="${width - padding.right}" y="${height - 6}" text-anchor="end">Latest</text>
    </svg>
  `;
}

function renderChart(containerId, samples, key, formatter) {
  const container = document.getElementById(containerId);
  const chronological = [...samples].reverse();
  const values = chronological.map((sample) => Number(sample[key]) || 0);

  if (values.length < 2) {
    container.className = "chart-canvas empty-chart";
    container.textContent = "Need at least 2 samples.";
    return;
  }

  container.className = "chart-canvas";
  container.innerHTML = buildChartSvg(values);
  container.setAttribute("aria-label", chronological.map((sample) => formatter(sample[key])).join(", "));
}

function renderCharts(samples) {
  const latest = samples[0] || null;
  document.getElementById("ttfw-latest").textContent = `Latest ${latest ? formatCompactMs(latest.ttfwMs) : "-"}`;
  document.getElementById("ttfw-p95").textContent = `P95 ${samples.length ? formatCompactMs(percentile(samples, "ttfwMs", 95)) : "-"}`;
  document.getElementById("wps-latest").textContent = `Latest ${latest ? formatNumber(latest.wordsPerSecond) : "-"}`;
  document.getElementById("wps-p95").textContent = `P95 ${samples.length ? formatNumber(percentile(samples, "wordsPerSecond", 95)) : "-"}`;

  renderChart("ttfw-chart", samples, "ttfwMs", formatCompactMs);
  renderChart("wps-chart", samples, "wordsPerSecond", formatNumber);
}

function normalizeOverlaySettings(raw) {
  return {
    enabled: Boolean(raw?.enabled)
  };
}

function renderOverlaySettings(settings) {
  const normalized = normalizeOverlaySettings(settings);
  document.getElementById("overlay-toggle").checked = normalized.enabled;
  document.getElementById("overlay-status").textContent = normalized.enabled
    ? "Visible on chatgpt.com"
    : "Hidden on page";
}

function sampleTitle(sample) {
  return sample.promptPreview || sample.title || "Untitled prompt";
}

function renderSamples(samples) {
  const list = document.getElementById("samples-list");
  const emptyState = document.getElementById("empty-state");
  const template = document.getElementById("sample-template");

  list.innerHTML = "";
  emptyState.hidden = samples.length > 0;

  samples.slice(0, 25).forEach((sample) => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".sample-title").textContent = sampleTitle(sample);
    fragment.querySelector(".sample-time").textContent = formatDate(sample.startedAt);

    const metrics = [
      `TTFW ${formatMs(sample.ttfwMs)}`,
      `TTLW ${formatMs(sample.ttlwMs)}`,
      `${sample.wordCount} words`,
      `${formatNumber(sample.wordsPerSecond)} wps`
    ];

    const metricsContainer = fragment.querySelector(".sample-metrics");
    metrics.forEach((metric) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = metric;
      metricsContainer.appendChild(chip);
    });

    list.appendChild(fragment);
  });
}

async function loadSamples() {
  const data = await storage.get([STORAGE_KEY, OVERLAY_SETTINGS_KEY]);
  const allSamples = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  const samples = filterSamples(allSamples);
  renderRangeState(allSamples.length, samples.length);
  renderSummary(samples);
  renderCharts(samples);
  renderSamples(samples);
  renderOverlaySettings(data[OVERLAY_SETTINGS_KEY]);
}

document.getElementById("clear-button").addEventListener("click", async () => {
  await storage.set({ [STORAGE_KEY]: [] });
  await loadSamples();
});

document.getElementById("overlay-toggle").addEventListener("change", async (event) => {
  const target = event.target;
  const current = await storage.get(OVERLAY_SETTINGS_KEY);
  const settings = current[OVERLAY_SETTINGS_KEY] || {};
  await storage.set({
    [OVERLAY_SETTINGS_KEY]: {
      ...settings,
      enabled: Boolean(target.checked)
    }
  });
});

document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", async () => {
    selectedRange = button.dataset.range === "all" ? "all" : Number(button.dataset.range);
    await loadSamples();
  });
});

if (storageEvents.onChanged && typeof storageEvents.onChanged.addListener === "function") {
  storageEvents.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes[STORAGE_KEY] || changes[OVERLAY_SETTINGS_KEY])) {
      void loadSamples();
    }
  });
}

void loadSamples();
