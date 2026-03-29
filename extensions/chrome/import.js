const STORAGE_KEY = "chatgpt_ttfw_samples";
const MAX_SAMPLES = 10000;
const storage = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
const transfer = globalThis.LlmSampleTransfer;

let selectedFile = null;

function setStatus(message, tone) {
  const element = document.getElementById("status-message");
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = false;
}

async function refreshStoredCount() {
  const data = await storage.get(STORAGE_KEY);
  const samples = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  document.getElementById("stored-count").textContent = String(samples.length);
}

function updateSelectedFile(file) {
  selectedFile = file || null;
  document.getElementById("file-name").textContent = file ? file.name : "None";
  document.getElementById("import-submit").disabled = !file;
  document.getElementById("status-message").hidden = true;
}

async function importSelectedFile() {
  if (!selectedFile) {
    return;
  }

  try {
    const result = await transfer.importSamplesFromFile(selectedFile, {
      storage,
      storageKey: STORAGE_KEY,
      maxSamples: MAX_SAMPLES
    });
    await refreshStoredCount();

    const skippedCount = result.rawCount - result.validCount;
    const suffix = skippedCount > 0 ? ` ${skippedCount} invalid samples were skipped.` : "";
    setStatus(`Import complete. ${result.addedCount} new samples added. ${result.totalCount} total stored.${suffix}`, "success");
  } catch (error) {
    const message = error instanceof SyntaxError
      ? "Import failed: file is not valid JSON."
      : `Import failed: ${error.message || "could not import samples."}`;
    setStatus(message, "error");
  }
}

document.getElementById("import-input").addEventListener("change", (event) => {
  const input = event.target;
  const [file] = input.files || [];
  updateSelectedFile(file);
});

document.getElementById("import-submit").addEventListener("click", () => {
  void importSelectedFile();
});

void refreshStoredCount();
