const STORAGE_KEY = "chatgpt_ttfw_samples";
const storage = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
const storageEvents = typeof browser !== "undefined" ? browser.storage : chrome.storage;

let latestRenderedJson = "";
let currentSamples = [];
let selectedKeys = new Set();

function sampleKey(sample, index) {
  if (sample?.id) {
    return String(sample.id);
  }

  return JSON.stringify([
    sample?.startedAt || "",
    sample?.site || "",
    sample?.model || "",
    sample?.ttlwMs || 0,
    sample?.wordCount || 0,
    index
  ]);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "-";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function setStatus(message, tone) {
  const element = document.getElementById("status-message");
  element.textContent = message;
  element.className = tone ? `subtle status-${tone}` : "subtle";
}

function formatSampleTitle(sample) {
  const site = sample?.site || "unknown";
  const model = sample?.model || "unknown";
  return `${site} | ${model}`;
}

function formatSampleSubtitle(sample) {
  const startedAt = sample?.startedAt ? new Date(sample.startedAt) : null;
  const startedText = startedAt && !Number.isNaN(startedAt.getTime())
    ? startedAt.toLocaleString()
    : "Unknown time";
  const id = sample?.id ? String(sample.id).slice(0, 12) : "no-id";
  return `${startedText} · ${id}`;
}

function formatSampleValue(sample) {
  const ttfw = Number.isFinite(sample?.ttfwMs) ? `${sample.ttfwMs} ms` : "-";
  const words = Number.isFinite(sample?.wordCount) ? `${sample.wordCount} words` : "-";
  return `${ttfw} · ${words}`;
}

function updateSelectionUi() {
  const selectedCount = selectedKeys.size;
  document.getElementById("selected-count").textContent = String(selectedCount);
  document.getElementById("delete-selected-button").disabled = selectedCount === 0;
  document.getElementById("select-all-button").textContent =
    currentSamples.length > 0 && selectedCount === currentSamples.length ? "Clear Selection" : "Select All";
}

function renderSampleList(samples) {
  const list = document.getElementById("sample-list");
  list.textContent = "";
  list.classList.toggle("is-empty", samples.length === 0);

  if (samples.length === 0) {
    list.textContent = "No samples stored yet.";
    updateSelectionUi();
    return;
  }

  const fragment = document.createDocumentFragment();
  samples.forEach((sample, index) => {
    const key = sampleKey(sample, index);
    const row = document.createElement("label");
    row.className = "sample-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedKeys.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedKeys.add(key);
      } else {
        selectedKeys.delete(key);
      }
      updateSelectionUi();
    });

    const meta = document.createElement("div");
    meta.className = "sample-meta";

    const title = document.createElement("div");
    title.className = "sample-title";
    title.textContent = formatSampleTitle(sample);

    const subtitle = document.createElement("div");
    subtitle.className = "sample-subtitle";
    subtitle.textContent = formatSampleSubtitle(sample);

    const value = document.createElement("div");
    value.className = "sample-value";
    value.textContent = formatSampleValue(sample);

    meta.append(title, subtitle);
    row.append(checkbox, meta, value);
    fragment.append(row);
  });

  list.append(fragment);
  updateSelectionUi();
}

function renderRaw(samples) {
  const output = document.getElementById("raw-output");
  const count = Array.isArray(samples) ? samples.length : 0;
  const json = JSON.stringify(Array.isArray(samples) ? samples : [], null, 2);
  currentSamples = Array.isArray(samples) ? samples : [];
  selectedKeys = new Set(
    currentSamples
      .map((sample, index) => sampleKey(sample, index))
      .filter((key) => selectedKeys.has(key))
  );

  latestRenderedJson = json;
  output.textContent = json || "[]";
  output.classList.toggle("is-empty", count === 0);
  document.getElementById("samples-count").textContent = String(count);
  document.getElementById("raw-size").textContent = formatBytes(new Blob([json]).size);
  document.getElementById("updated-at").textContent = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  renderSampleList(currentSamples);

  setStatus(count > 0 ? "Showing local stored samples." : "No samples stored yet.", count > 0 ? "ok" : "");
}

async function loadRaw() {
  try {
    const data = await storage.get(STORAGE_KEY);
    const samples = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    renderRaw(samples);
  } catch (error) {
    latestRenderedJson = "";
    document.getElementById("raw-output").textContent = "";
    document.getElementById("raw-output").classList.add("is-empty");
    setStatus(`Failed to load local data: ${error.message || "unknown error"}`, "error");
  }
}

async function copyRawJson() {
  if (!latestRenderedJson) {
    setStatus("Nothing to copy yet.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(latestRenderedJson);
    setStatus("Copied raw JSON to clipboard.", "ok");
  } catch (_error) {
    setStatus("Copy failed. Your browser may block clipboard access.", "error");
  }
}

async function deleteSelectedSamples() {
  if (selectedKeys.size === 0) {
    setStatus("Select at least one sample to delete.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete ${selectedKeys.size} selected sample(s) from local storage?`);
  if (!confirmed) {
    return;
  }

  const nextSamples = currentSamples.filter((sample, index) => !selectedKeys.has(sampleKey(sample, index)));
  selectedKeys.clear();

  try {
    await storage.set({ [STORAGE_KEY]: nextSamples });
    renderRaw(nextSamples);
    setStatus("Deleted selected samples from local storage.", "ok");
  } catch (error) {
    setStatus(`Delete failed: ${error.message || "unknown error"}`, "error");
  }
}

function toggleSelectAll() {
  if (currentSamples.length === 0) {
    return;
  }

  if (selectedKeys.size === currentSamples.length) {
    selectedKeys.clear();
  } else {
    selectedKeys = new Set(currentSamples.map((sample, index) => sampleKey(sample, index)));
  }

  renderSampleList(currentSamples);
}

document.getElementById("refresh-button").addEventListener("click", () => {
  void loadRaw();
});

document.getElementById("copy-button").addEventListener("click", () => {
  void copyRawJson();
});

document.getElementById("select-all-button").addEventListener("click", () => {
  toggleSelectAll();
});

document.getElementById("delete-selected-button").addEventListener("click", () => {
  void deleteSelectedSamples();
});

if (storageEvents.onChanged && typeof storageEvents.onChanged.addListener === "function") {
  storageEvents.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      void loadRaw();
    }
  });
}

void loadRaw();
