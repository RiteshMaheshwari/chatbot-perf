const STORAGE_KEY = "chatgpt_ttfw_samples";
const storage = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
const storageEvents = typeof browser !== "undefined" ? browser.storage : chrome.storage;

let latestRenderedJson = "";

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

function renderRaw(samples) {
  const output = document.getElementById("raw-output");
  const count = Array.isArray(samples) ? samples.length : 0;
  const json = JSON.stringify(Array.isArray(samples) ? samples : [], null, 2);

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

document.getElementById("refresh-button").addEventListener("click", () => {
  void loadRaw();
});

document.getElementById("copy-button").addEventListener("click", () => {
  void copyRawJson();
});

if (storageEvents.onChanged && typeof storageEvents.onChanged.addListener === "function") {
  storageEvents.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      void loadRaw();
    }
  });
}

void loadRaw();
