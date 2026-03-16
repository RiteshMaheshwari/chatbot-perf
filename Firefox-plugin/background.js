browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_METRICS") {
    saveMetrics(message.metrics);
    return;
  }

  if (message.type === "GET_HISTORY") {
    getHistory().then((history) => sendResponse(history));
    return true; // async response
  }

  if (message.type === "CLEAR_HISTORY") {
    clearHistory().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function saveMetrics(metrics) {
  const result = await browser.storage.local.get("ttfw_history");
  const history = result.ttfw_history || [];
  history.push(metrics);
  // Keep last 10,000 entries
  if (history.length > 10000) {
    history.splice(0, history.length - 10000);
  }
  await browser.storage.local.set({ ttfw_history: history });
}

async function getHistory() {
  const result = await browser.storage.local.get("ttfw_history");
  return result.ttfw_history || [];
}

async function clearHistory() {
  await browser.storage.local.remove("ttfw_history");
}
