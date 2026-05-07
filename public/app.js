const state = {
  data: null,
  batch: null,
  hkjc: null,
  probability: null,
  titanGuess: null,
  diagnostics: null,
  analysis: null,
  context: null,
  features: null,
  loadedMatches: [],
  loadedMatchesById: new Map(),
  hkjcMatchCheck: null,
  hkjcMatchCheckPromise: null,
  hkjcMatchCheckRunId: 0,
  hkjcMatchCheckTimer: null,
  activeTab: "asianFull",
  working: false,
  serverOnline: false,
  titanHealth: null,
  guideStatus: null,
  aiKeySaved: false,
  aiTest: null,
  lastAiError: "",
  lastAiDurationMs: null,
  lastPayloadStats: null,
  aiProgress: null,
  analysisHistory: [],
  backtestRecords: [],
  localTitanCache: { entries: [], stats: null },
};

const AI_KEY_STORAGE_KEY = "odds-workbench.ai-api-key";
const API_FOOTBALL_KEY_STORAGE_KEY = "odds-workbench.api-football-key";
const EXTRACTION_DEEP_MODE_STORAGE_KEY = "odds-workbench.extraction-deep-mode";
const EXTRACTION_WORKER_COUNT_STORAGE_KEY = "odds-workbench.worker-count";
const PROBABILITY_WINDOW_STORAGE_KEY = "odds-workbench.probability-window";
const AI_HISTORY_STORAGE_KEY = "odds-workbench.ai-history";
const BACKTEST_STORAGE_KEY = "odds-workbench.backtest-records";
const MAX_HISTORY_ITEMS = 25;
const MAX_BACKTEST_RECORDS = 100;
const MAX_AI_ROWS = 800;
const BATCH_EXTRACT_LIMIT = 25;
const HKJC_OPEN_EXTRACT_WINDOW_HOURS = 6;
const HKJC_EXTRACT_MIN_MATCH_SCORE = 50;
const AI_PROMPT_VERSION = "global-scan-lite-single-match-v4";
const AI_STRUCTURED_SCHEMA_VERSION = "odds-analysis-v1";
const CHUNKED_AI_WORKFLOWS = new Set(["top10_ai_ranking", "analyze_current_result"]);
let aiProgressTimer = null;
const ANALYSIS_FRAMEWORK = {
  version: AI_PROMPT_VERSION,
  structuredSchemaVersion: AI_STRUCTURED_SCHEMA_VERSION,
  localRole: "collect_and_organize_only",
  aiOwns: ["top10_ranking", "confidence_score", "risk_score", "conflict_detection", "play_mapping"],
  requiredLayers: [
    {
      key: "field_strength",
      label: "真實戰力層",
      instruction: "只能由盤口、歐賠、大小球與賽事資料推斷市場隱含強弱；缺少 xG、傷停、陣容時要列為資料缺口。",
    },
    {
      key: "market_price",
      label: "市場真實價格層",
      instruction: "比較 1X2、亞盤、大小球、初盤與即時盤，留意跨莊家是否一致。",
    },
    {
      key: "resonance_conflict",
      label: "共振與衝突層",
      instruction: "判斷歐賠、亞盤、大細盤、HKJC 命中賠率之間是同向、背離，還是資料不足。",
    },
    {
      key: "volatility_risk",
      label: "波動風險層",
      instruction: "標記封盤、多盤、高低水陷阱、盤口大幅移動、樣本不足、單一市場孤立訊號。",
    },
    {
      key: "play_fit",
      label: "玩法適配層",
      instruction: "以主客和、讓球、入球大細、半場/全場角度映射觀察，不輸出保證式投注指令。",
    },
  ],
  outputContract: {
    language: "zh-Hant",
    mustInclude: ["資料完整度與限制", "結論", "證據", "主要風險", "仍需補充資料", "非投注建議"],
    top10: ["排名", "Match ID", "賽事", "信心分 0-100", "主要證據", "主要風險", "頭 3 場單獨分析候選"],
    singleMatch: ["五層分析", "市場共振/背離", "玩法適配", "不確定性"],
    structuredJson: AI_STRUCTURED_SCHEMA_VERSION,
  },
};

const els = {
  status: document.getElementById("status"),
  leagueInput: document.getElementById("leagueInput"),
  quickLimitInput: document.getElementById("quickLimitInput"),
  workerCountInput: document.getElementById("workerCountInput"),
  quickExtractBtn: document.getElementById("quickExtractBtn"),
  loadMatchesBtn: document.getElementById("loadMatchesBtn"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  extractSelectedBtn: document.getElementById("extractSelectedBtn"),
  extractLoadedBtn: document.getElementById("extractLoadedBtn"),
  probabilityWindowInput: document.getElementById("probabilityWindowInput"),
  probabilityScanBtn: document.getElementById("probabilityScanBtn"),
  titanGuessScanBtn: document.getElementById("titanGuessScanBtn"),
  extractFourHourBtn: document.getElementById("extractFourHourBtn"),
  extractHkjcSixHourBtn: document.getElementById("extractHkjcSixHourBtn"),
  extractHkjcTwelveHourBtn: document.getElementById("extractHkjcTwelveHourBtn"),
  extractHkjcEighteenHourBtn: document.getElementById("extractHkjcEighteenHourBtn"),
  matchList: document.getElementById("matchList"),
  matchIdInput: document.getElementById("matchIdInput"),
  includeMultiInput: document.getElementById("includeMultiInput"),
  extractBtn: document.getElementById("extractBtn"),
  batchExtractBtn: document.getElementById("batchExtractBtn"),
  hkjcSpecialOddsBtn: document.getElementById("hkjcSpecialOddsBtn"),
  hkjcCrsEqualOddsBtn: document.getElementById("hkjcCrsEqualOddsBtn"),
  networkDiagnosticsBtn: document.getElementById("networkDiagnosticsBtn"),
  hkjcScanBtn: document.getElementById("hkjcScanBtn"),
  jsonBtn: document.getElementById("jsonBtn"),
  jsonlBtn: document.getElementById("jsonlBtn"),
  csvBtn: document.getElementById("csvBtn"),
  summary: document.getElementById("summary"),
  resultTitle: document.getElementById("resultTitle"),
  tabs: document.getElementById("tabs"),
  tableWrap: document.getElementById("tableWrap"),
  aiBaseUrlInput: document.getElementById("aiBaseUrlInput"),
  aiModelInput: document.getElementById("aiModelInput"),
  aiApiModeInput: document.getElementById("aiApiModeInput"),
  aiStreamInput: document.getElementById("aiStreamInput"),
  promptVersionLabel: document.getElementById("promptVersionLabel"),
  aiKeyInput: document.getElementById("aiKeyInput"),
  rememberKeyInput: document.getElementById("rememberKeyInput"),
  aiTestBtn: document.getElementById("aiTestBtn"),
  saveAiKeyBtn: document.getElementById("saveAiKeyBtn"),
  clearAiKeyBtn: document.getElementById("clearAiKeyBtn"),
  debugKeyLight: document.getElementById("debugKeyLight"),
  debugBaseLight: document.getElementById("debugBaseLight"),
  debugServerLight: document.getElementById("debugServerLight"),
  debugTitanLight: document.getElementById("debugTitanLight"),
  debugGuideLight: document.getElementById("debugGuideLight"),
  debugPromptLight: document.getElementById("debugPromptLight"),
  debugPayloadLight: document.getElementById("debugPayloadLight"),
  debugJsonLight: document.getElementById("debugJsonLight"),
  debugTimeoutLight: document.getElementById("debugTimeoutLight"),
  debugAiLight: document.getElementById("debugAiLight"),
  debugLastLight: document.getElementById("debugLastLight"),
  aiTargetMatchSelect: document.getElementById("aiTargetMatchSelect"),
  aiTargetMatchInput: document.getElementById("aiTargetMatchInput"),
  basicTop10Btn: document.getElementById("basicTop10Btn"),
  aiAnalyzeTargetBtn: document.getElementById("aiAnalyzeTargetBtn"),
  aiAnalyzeBtn: document.getElementById("aiAnalyzeBtn"),
  featuresDownloadBtn: document.getElementById("featuresDownloadBtn"),
  aiDownloadBtn: document.getElementById("aiDownloadBtn"),
  aiJsonDownloadBtn: document.getElementById("aiJsonDownloadBtn"),
  aiProgress: document.getElementById("aiProgress"),
  aiProgressFill: document.getElementById("aiProgressFill"),
  aiProgressLabel: document.getElementById("aiProgressLabel"),
  aiProgressDetail: document.getElementById("aiProgressDetail"),
  aiProgressTime: document.getElementById("aiProgressTime"),
  validationPanel: document.getElementById("validationPanel"),
  apiFootballKeyInput: document.getElementById("apiFootballKeyInput"),
  rememberApiFootballKeyInput: document.getElementById("rememberApiFootballKeyInput"),
  includeWeatherInput: document.getElementById("includeWeatherInput"),
  loadContextBtn: document.getElementById("loadContextBtn"),
  saveApiFootballKeyBtn: document.getElementById("saveApiFootballKeyBtn"),
  clearApiFootballKeyBtn: document.getElementById("clearApiFootballKeyBtn"),
  debugContextLight: document.getElementById("debugContextLight"),
  debugApiFootballLight: document.getElementById("debugApiFootballLight"),
  debugWeatherLight: document.getElementById("debugWeatherLight"),
  analysisMeta: document.getElementById("analysisMeta"),
  featurePanel: document.getElementById("featurePanel"),
  top10Panel: document.getElementById("top10Panel"),
  top3Panel: document.getElementById("top3Panel"),
  singleMatchPanel: document.getElementById("singleMatchPanel"),
  historyPanel: document.getElementById("historyPanel"),
  backtestPanel: document.getElementById("backtestPanel"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  clearBacktestBtn: document.getElementById("clearBacktestBtn"),
  recordHitBtn: document.getElementById("recordHitBtn"),
  recordMissBtn: document.getElementById("recordMissBtn"),
  analysisOutput: document.getElementById("analysisOutput"),
};

function arrangeControlPanel() {
  const panel = document.querySelector(".control-panel");
  if (!panel) return;

  const firstSection = panel.querySelector(".tool-section");
  if (firstSection && els.matchList) {
    firstSection.insertAdjacentElement("afterend", els.matchList);
  }

  let debugDock = document.getElementById("debugDock");
  if (!debugDock) {
    debugDock = document.createElement("section");
    debugDock.id = "debugDock";
    debugDock.className = "tool-section debug-dock";
    debugDock.innerHTML = `
      <div class="section-heading">
        <span>05</span>
        <h2>除錯燈</h2>
      </div>
    `;
    panel.appendChild(debugDock);
  }

  const aiDebugLights = document.getElementById("debugLights");
  const contextDebugLights = els.debugContextLight?.closest(".debug-lights");
  for (const block of [aiDebugLights, contextDebugLights]) {
    if (block && block.parentElement !== debugDock) {
      debugDock.appendChild(block);
    }
  }
}

function ensureHkjcSpecialOddsButton() {
  if (els.hkjcSpecialOddsBtn || !els.hkjcScanBtn?.parentElement) return;
  const button = document.createElement("button");
  button.id = "hkjcSpecialOddsBtn";
  button.className = "primary";
  button.type = "button";
  button.textContent = "HKJC 指定賠率掃描";
  els.hkjcScanBtn.parentElement.insertBefore(button, els.hkjcScanBtn);
  els.hkjcSpecialOddsBtn = button;
}

function ensureHkjcCrsEqualOddsButton() {
  if (els.hkjcCrsEqualOddsBtn || !els.hkjcScanBtn?.parentElement) return;
  const button = document.createElement("button");
  button.id = "hkjcCrsEqualOddsBtn";
  button.className = "primary";
  button.type = "button";
  button.textContent = "HKJC 波膽同賠率";
  const anchor = els.hkjcSpecialOddsBtn || els.hkjcScanBtn;
  if (anchor.nextSibling) {
    anchor.parentElement.insertBefore(button, anchor.nextSibling);
  } else {
    anchor.parentElement.appendChild(button);
  }
  els.hkjcCrsEqualOddsBtn = button;
}

function ensureNetworkDiagnosticsButton() {
  if (els.networkDiagnosticsBtn || !els.hkjcScanBtn?.parentElement) return;
  const button = document.createElement("button");
  button.id = "networkDiagnosticsBtn";
  button.className = "wide-action";
  button.type = "button";
  button.textContent = "連線診斷";
  const anchor = els.hkjcCrsEqualOddsBtn || els.hkjcSpecialOddsBtn || els.hkjcScanBtn;
  if (anchor.nextSibling) {
    anchor.parentElement.insertBefore(button, anchor.nextSibling);
  } else {
    anchor.parentElement.appendChild(button);
  }
  els.networkDiagnosticsBtn = button;
}

function ensureFourHourButton() {
  if (els.extractFourHourBtn) return;
  const anchor = els.extractHkjcSixHourBtn || els.probabilityScanBtn;
  if (!anchor?.parentElement) return;
  const button = document.createElement("button");
  button.id = "extractFourHourBtn";
  button.className = "wide-action primary";
  button.type = "button";
  button.textContent = "提取未來4小時";
  anchor.parentElement.insertBefore(button, els.extractHkjcSixHourBtn || anchor.nextSibling);
  els.extractFourHourBtn = button;
}

function ensureTitanGuessButton() {
  if (els.titanGuessScanBtn || !els.probabilityScanBtn?.parentElement) return;
  const button = document.createElement("button");
  button.id = "titanGuessScanBtn";
  button.className = "wide-action";
  button.type = "button";
  button.textContent = "掃 V猜球";
  const anchor = els.probabilityScanBtn;
  if (anchor.nextSibling) {
    anchor.parentElement.insertBefore(button, anchor.nextSibling);
  } else {
    anchor.parentElement.appendChild(button);
  }
  els.titanGuessScanBtn = button;
}

arrangeControlPanel();
ensureFourHourButton();
ensureTitanGuessButton();
ensureHkjcSpecialOddsButton();
ensureHkjcCrsEqualOddsButton();
ensureNetworkDiagnosticsButton();

const TAB_LABELS = {
  asianFull: "亞盤 全場",
  asianHalf: "亞盤 半場",
  overFull: "大小 全場",
  overHalf: "大小 半場",
  europe: "歐洲賠率",
};

function setStatus(text) {
  els.status.textContent = text;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatShortTime(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit" });
}

function filenameTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function renderAiProgress(progress) {
  if (!els.aiProgress || !progress) return;
  const total = Math.max(1, progress.total || 1);
  const current = Math.min(total, Math.max(0, progress.current || 0));
  const percent = Math.round((current / total) * 100);
  els.aiProgress.hidden = false;
  els.aiProgressFill.style.width = `${percent}%`;
  els.aiProgressLabel.textContent = `${progress.label || "AI 分析進度"} · ${current}/${total}`;
  els.aiProgressDetail.textContent = progress.detail || "處理中";
  els.aiProgressTime.textContent = formatDuration(Date.now() - progress.startedAt);
}

function startAiProgress(label, total, detail = "準備送出") {
  window.clearInterval(aiProgressTimer);
  const progress = {
    startedAt: Date.now(),
    label,
    total,
    current: 0,
    detail,
  };
  state.aiProgress = progress;
  renderAiProgress(progress);
  aiProgressTimer = window.setInterval(() => renderAiProgress(state.aiProgress), 1000);
}

function updateAiProgress(current, total, detail, label = null) {
  if (!state.aiProgress) {
    startAiProgress(label || "AI 分析進度", total, detail);
    return;
  }
  state.aiProgress.current = current;
  state.aiProgress.total = total;
  state.aiProgress.detail = detail;
  if (label) state.aiProgress.label = label;
  renderAiProgress(state.aiProgress);
}

function finishAiProgress(detail = "完成") {
  if (!state.aiProgress) return;
  state.aiProgress.current = state.aiProgress.total;
  state.aiProgress.detail = detail;
  renderAiProgress(state.aiProgress);
  window.clearInterval(aiProgressTimer);
  aiProgressTimer = null;
}

function failAiProgress(detail = "失敗") {
  if (!state.aiProgress) return;
  state.aiProgress.detail = detail;
  renderAiProgress(state.aiProgress);
  window.clearInterval(aiProgressTimer);
  aiProgressTimer = null;
}

function localStorageSafe() {
  try {
    const key = "__odds_test__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function loadJsonStorage(key, fallback) {
  if (!localStorageSafe()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  if (!localStorageSafe()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadLocalAppState() {
  state.analysisHistory = loadJsonStorage(AI_HISTORY_STORAGE_KEY, []);
  state.backtestRecords = loadJsonStorage(BACKTEST_STORAGE_KEY, []);
}

function loadStoredApiKey() {
  if (!localStorageSafe()) return;
  const savedKey = window.localStorage.getItem(AI_KEY_STORAGE_KEY) || "";
  if (savedKey) {
    els.aiKeyInput.value = savedKey;
    state.aiKeySaved = true;
  }
}

function loadStoredApiFootballKey() {
  if (!localStorageSafe() || !els.apiFootballKeyInput) return;
  const savedKey = window.localStorage.getItem(API_FOOTBALL_KEY_STORAGE_KEY) || "";
  if (savedKey) {
    els.apiFootballKeyInput.value = savedKey;
  }
}

function loadExtractionOptions() {
  if (els.includeMultiInput) {
    const savedDeepMode = loadJsonStorage(EXTRACTION_DEEP_MODE_STORAGE_KEY, null);
    els.includeMultiInput.checked = savedDeepMode === null ? false : Boolean(savedDeepMode);
  }

  if (els.workerCountInput) {
    const savedWorkerCount = Number(loadJsonStorage(EXTRACTION_WORKER_COUNT_STORAGE_KEY, null));
    if (Number.isFinite(savedWorkerCount)) {
      els.workerCountInput.value = String(Math.max(1, Math.min(Math.trunc(savedWorkerCount), 3)));
    }
  }

  if (els.probabilityWindowInput) {
    const savedWindow = loadJsonStorage(PROBABILITY_WINDOW_STORAGE_KEY, "");
    if ([...els.probabilityWindowInput.options].some((option) => option.value === savedWindow)) {
      els.probabilityWindowInput.value = savedWindow;
    }
  }
}

function saveExtractionOptions() {
  if (els.includeMultiInput) {
    saveJsonStorage(EXTRACTION_DEEP_MODE_STORAGE_KEY, Boolean(els.includeMultiInput.checked));
  }
  if (els.workerCountInput) {
    saveJsonStorage(EXTRACTION_WORKER_COUNT_STORAGE_KEY, workerCount());
  }
  if (els.probabilityWindowInput) {
    saveJsonStorage(PROBABILITY_WINDOW_STORAGE_KEY, els.probabilityWindowInput.value || "all");
  }
}

function includeMultiEnabled() {
  return els.includeMultiInput ? Boolean(els.includeMultiInput.checked) : false;
}

function extractionMode() {
  return includeMultiEnabled() ? "deep" : "fast";
}

function saveApiKeyToStorage() {
  const key = els.aiKeyInput.value.trim();
  if (!key) {
    state.aiKeySaved = false;
    updateDebugLights();
    return false;
  }
  if (!localStorageSafe()) {
    state.lastAiError = "瀏覽器不允許 localStorage";
    updateDebugLights();
    return false;
  }
  window.localStorage.setItem(AI_KEY_STORAGE_KEY, key);
  state.aiKeySaved = true;
  updateDebugLights();
  return true;
}

function saveApiFootballKeyToStorage() {
  const key = els.apiFootballKeyInput?.value.trim() || "";
  if (!key || !localStorageSafe()) {
    updateDebugLights();
    return false;
  }
  window.localStorage.setItem(API_FOOTBALL_KEY_STORAGE_KEY, key);
  updateDebugLights();
  return true;
}

function clearStoredApiKey() {
  if (!window.confirm("確定清除本機儲存的 API Key？這只會刪除這個瀏覽器內的 key。")) return;
  if (localStorageSafe()) {
    window.localStorage.removeItem(AI_KEY_STORAGE_KEY);
  }
  els.aiKeyInput.value = "";
  state.aiKeySaved = false;
  state.aiTest = null;
  updateDebugLights();
}

function clearStoredApiFootballKey() {
  if (!window.confirm("確定清除本機儲存的 API-Football Key？這只會刪除這個瀏覽器內的 key。")) return;
  if (localStorageSafe()) {
    window.localStorage.removeItem(API_FOOTBALL_KEY_STORAGE_KEY);
  }
  if (els.apiFootballKeyInput) els.apiFootballKeyInput.value = "";
  state.context = null;
  renderFeaturePanel();
  updateDebugLights();
}

function persistApiKeyIfAllowed() {
  if (els.rememberKeyInput.checked) {
    saveApiKeyToStorage();
  }
}

function persistApiFootballKeyIfAllowed() {
  if (els.rememberApiFootballKeyInput?.checked) {
    saveApiFootballKeyToStorage();
  }
}

function validBaseUrl() {
  try {
    const url = new URL(els.aiBaseUrlInput.value.trim());
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function estimateTokensFromText(text) {
  return Math.ceil(String(text || "").length / 4);
}

function estimatePayloadStats(payload) {
  const json = JSON.stringify(payload || {});
  const guideChars = state.guideStatus?.includedChars || 0;
  return {
    rows: payload?.rows?.length || 0,
    jsonChars: json.length,
    estimatedInputTokens: estimateTokensFromText(json) + estimateTokensFromText(" ".repeat(guideChars)),
    truncated: Boolean(payload?.truncated),
    compressionMode: payload?.compression?.mode || "none",
  };
}

function payloadStatsLabel(stats = state.lastPayloadStats) {
  if (!stats) return "未有";
  const tokenText = stats.estimatedInputTokens >= 1000 ? `${Math.round(stats.estimatedInputTokens / 100) / 10}k` : stats.estimatedInputTokens;
  return `${stats.rows} rows / ~${tokenText} tokens`;
}

function setDebugLight(element, stateName, message) {
  if (!element) return;
  element.classList.remove("ok", "warn", "error", "pending");
  element.classList.add(stateName);
  element.title = message || "";
  const label = element.querySelector("em");
  if (label) label.textContent = message;
}

function compactTitanHealthError(error) {
  const text = String(error || "");
  if (!text) return "失敗";
  if (/error page|returned an error/i.test(text)) return "盤口頁錯誤";
  if (/timeout|逾時/i.test(text)) return "逾時";
  if (/HTTP\s+\d+/i.test(text)) return text.match(/HTTP\s+\d+/i)[0];
  if (/no usable match/i.test(text)) return "沒有可測賽事";
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

function updateDebugLights() {
  const hasKey = Boolean(els.aiKeyInput.value.trim());
  setDebugLight(
    els.debugKeyLight,
    hasKey ? "ok" : "warn",
    hasKey ? (state.aiKeySaved ? "已儲存" : "已輸入未儲存") : "未輸入"
  );
  setDebugLight(els.debugBaseLight, validBaseUrl() ? "ok" : "error", validBaseUrl() ? "格式正常" : "URL 錯誤");
  setDebugLight(els.debugServerLight, state.serverOnline ? "ok" : "pending", state.serverOnline ? "在線" : "檢查中");
  if (state.titanHealth?.ok) {
    const rowCount = Number(state.titanHealth.rowCount || 0);
    setDebugLight(
      els.debugTitanLight,
      rowCount ? "ok" : "warn",
      `${state.titanHealth.latencyMs || 0}ms · ${rowCount} rows`
    );
  } else if (state.titanHealth?.error) {
    setDebugLight(els.debugTitanLight, "error", compactTitanHealthError(state.titanHealth.error));
  } else {
    setDebugLight(els.debugTitanLight, "pending", "檢查中");
  }
  setDebugLight(els.debugPromptLight, "ok", AI_PROMPT_VERSION);
  if (state.lastPayloadStats) {
    setDebugLight(
      els.debugPayloadLight,
      state.lastPayloadStats.truncated ? "warn" : "ok",
      payloadStatsLabel()
    );
  } else {
    setDebugLight(els.debugPayloadLight, "pending", "未有");
  }
  if (state.analysis?.validation) {
    const validationState =
      state.analysis.validation.level === "error" ? "error" : state.analysis.validation.level === "warn" ? "warn" : "ok";
    setDebugLight(els.debugJsonLight, validationState, `QA ${state.analysis.validation.score ?? 0}%`);
  } else if (state.analysis?.structured?.schemaVersion === AI_STRUCTURED_SCHEMA_VERSION) {
    setDebugLight(els.debugJsonLight, "ok", state.analysis.structured.schemaVersion);
  } else if (state.analysis?.structured) {
    setDebugLight(els.debugJsonLight, "warn", state.analysis.structured.schemaVersion || "版本不明");
  } else if (state.analysis?.output) {
    setDebugLight(els.debugJsonLight, "error", "未解析");
  } else {
    setDebugLight(els.debugJsonLight, "pending", "未有");
  }
  if (state.lastAiDurationMs) {
    const slow = state.lastAiDurationMs > 60000;
    setDebugLight(els.debugTimeoutLight, slow ? "warn" : "ok", `${state.lastAiDurationMs}ms`);
  } else if (String(state.lastAiError || "").includes("逾時") || String(state.lastAiError || "").toLowerCase().includes("timeout")) {
    setDebugLight(els.debugTimeoutLight, "error", "逾時");
  } else {
    setDebugLight(els.debugTimeoutLight, "pending", "未有");
  }
  const contextFixtureCount = state.context?.fixtureMatches?.length || 0;
  const contextMissingCount = state.context?.missing?.length || 0;
  if (state.context) {
    setDebugLight(
      els.debugContextLight,
      contextFixtureCount ? "ok" : "warn",
      `${contextFixtureCount} 配對 / ${contextMissingCount} 缺`
    );
  } else {
    setDebugLight(els.debugContextLight, "pending", "未有");
  }
  const hasApiFootballKey = Boolean(els.apiFootballKeyInput?.value.trim());
  const apiFootballStatus = state.context?.sourceStatus?.find((item) => item.source === "api-football");
  if (apiFootballStatus) {
    setDebugLight(
      els.debugApiFootballLight,
      apiFootballStatus.ok ? "ok" : "warn",
      apiFootballStatus.fixtureCount !== undefined ? `${apiFootballStatus.fixtureCount} fixtures` : "已回應"
    );
  } else {
    setDebugLight(els.debugApiFootballLight, hasApiFootballKey ? "ok" : "warn", hasApiFootballKey ? "已輸入" : "未輸入");
  }
  const weatherCount = state.context?.weather?.filter((item) => item.available).length || 0;
  if (state.context?.weather?.length) {
    setDebugLight(els.debugWeatherLight, weatherCount ? "ok" : "warn", `${weatherCount}/${state.context.weather.length}`);
  } else {
    setDebugLight(els.debugWeatherLight, els.includeWeatherInput?.checked ? "pending" : "warn", els.includeWeatherInput?.checked ? "未有" : "已關閉");
  }
  if (state.guideStatus?.available) {
    const guideLabel = state.guideStatus.truncated ? "已接入節錄" : "已接入";
    setDebugLight(els.debugGuideLight, "ok", guideLabel);
  } else if (state.guideStatus && !state.guideStatus.available) {
    setDebugLight(els.debugGuideLight, "warn", "未讀到 MD");
  } else {
    setDebugLight(els.debugGuideLight, "pending", "檢查中");
  }

  if (state.aiTest?.ok) {
    setDebugLight(els.debugAiLight, "ok", `${state.aiTest.latencyMs || 0}ms`);
  } else if (state.aiTest?.error) {
    setDebugLight(els.debugAiLight, "error", "失敗");
  } else {
    setDebugLight(els.debugAiLight, "pending", "未測試");
  }

  if (state.analysis?.output) {
    setDebugLight(els.debugLastLight, "ok", "分析成功");
  } else if (state.lastAiError) {
    setDebugLight(els.debugLastLight, "error", state.lastAiError.slice(0, 18));
  } else {
    setDebugLight(els.debugLastLight, "pending", "未有");
  }
}

async function checkGuideStatus() {
  try {
    const body = await getJson("/api/ai/guide-status");
    state.guideStatus = body.data;
  } catch (error) {
    state.guideStatus = {
      available: false,
      error: error.message,
    };
  } finally {
    updateDebugLights();
    renderFeaturePanel();
  }
}

async function checkServerHealth() {
  try {
    await getJson("/api/health");
    state.serverOnline = true;
  } catch (error) {
    state.serverOnline = false;
    state.lastAiError = error.message;
  } finally {
    updateDebugLights();
  }
}

async function checkTitanHealth() {
  state.titanHealth = null;
  updateDebugLights();
  try {
    const startedAt = Date.now();
    const body = await getJson("/api/titan-health?limit=8&timeoutMs=12000&tryMatches=3");
    state.titanHealth = {
      ...(body.data || {}),
      ok: body.data?.ok !== false,
      latencyMs: body.data?.latencyMs || Date.now() - startedAt,
    };
  } catch (error) {
    state.titanHealth = {
      ok: false,
      error: error.message || String(error),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    updateDebugLights();
  }
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function postJson(url, payload, options = {}) {
  const controller = options.timeoutMs ? new AbortController() : null;
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), Math.max(1000, options.timeoutMs))
    : null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    return body;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(options.timeoutMessage || `請求逾時 (${Math.round(options.timeoutMs / 1000)}秒)`);
    }
    throw error;
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rowCount(section) {
  return section?.rows?.length || 0;
}

function displayBookmaker(row) {
  return row.bookmaker || row.company || "";
}

function parseMatchIds(text) {
  const ids = String(text || "").match(/\d+/g) || [];
  return [...new Set(ids)];
}

function basicMatch(matchId) {
  return {
    matchId,
    league: "",
    kickoffTime: "",
    state: "",
    score: "",
    home: "",
    away: "",
  };
}

function matchById(matchId) {
  return state.loadedMatchesById.get(String(matchId)) || basicMatch(matchId);
}

function parseMatchKickoffTime(match) {
  const raw = String(match?.kickoffTime || match?.kickOffTime || "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/\//g, "-").replace(/\s+/g, " ");
  const direct = new Date(normalized);
  if (Number.isFinite(direct.getTime())) return direct;

  const now = new Date();
  const yearMonthDay = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2}).*?(\d{1,2}):(\d{2})/);
  if (yearMonthDay) {
    const [, year, month, day, hour, minute] = yearMonthDay.map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }

  const monthDay = normalized.match(/(\d{1,2})-(\d{1,2}).*?(\d{1,2}):(\d{2})/);
  if (monthDay) {
    const [, month, day, hour, minute] = monthDay.map(Number);
    return new Date(now.getFullYear(), month - 1, day, hour, minute);
  }

  const timeOnly = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!timeOnly) return null;
  const [, hour, minute] = timeOnly.map(Number);
  const kickoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  if (kickoff.getTime() < now.getTime() - 2 * 60 * 60 * 1000) {
    kickoff.setDate(kickoff.getDate() + 1);
  }
  return kickoff;
}

function isWithinUpcomingHours(match, hours, now = new Date()) {
  const kickoff = parseMatchKickoffTime(match);
  if (!kickoff || !Number.isFinite(kickoff.getTime())) return false;
  const endTime = new Date(now.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  return kickoff >= now && kickoff <= endTime;
}

function isNotStartedMatch(match) {
  const code = String(match?.stateCode ?? "").trim();
  if (code) return code === "0";

  const state = String(match?.state || "").trim().toLowerCase();
  if (!state) return true;
  if (/完|進行|上半|下半|中場|加時|點球|点球|取消|腰斬|腰斩|延期|暫停|暂停|live|half|finished|postponed|cancel/.test(state)) {
    return false;
  }
  return true;
}

function isPrematchTop10Candidate(match, now = new Date()) {
  const code = String(match?.stateCode ?? "").trim();
  if (code) return code === "0";

  if (!isNotStartedMatch(match)) return false;

  const kickoff = parseMatchKickoffTime(match);
  if (kickoff && Number.isFinite(kickoff.getTime())) {
    return kickoff.getTime() >= now.getTime() - 5 * 60 * 1000;
  }

  return true;
}

function isWithinUpcomingHourRange(match, startHours, endHours, now = new Date()) {
  const kickoff = parseMatchKickoffTime(match);
  if (!kickoff || !Number.isFinite(kickoff.getTime())) return false;
  const start = new Date(now.getTime() + Math.max(0, startHours) * 60 * 60 * 1000);
  const end = new Date(now.getTime() + Math.max(startHours, endHours) * 60 * 60 * 1000);
  const afterStart = startHours > 0 ? kickoff > start : kickoff >= now;
  return afterStart && kickoff <= end;
}

function hkjcHitKickoffDate(hit) {
  return parseMatchKickoffTime({ kickOffTime: hit?.kickOffTime || hit?.kickoffTime || "" });
}

function formatHkjcKickoff(value) {
  const kickoff = hkjcHitKickoffDate({ kickOffTime: value });
  if (!kickoff || !Number.isFinite(kickoff.getTime())) return String(value || "");
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(kickoff.getMonth() + 1)}-${pad(kickoff.getDate())} ${pad(kickoff.getHours())}:${pad(kickoff.getMinutes())}`;
}

function sortedHkjcHits(hits = state.hkjc?.hits || []) {
  return [...(hits || [])].sort((left, right) => {
    const leftTime = hkjcHitKickoffDate(left)?.getTime();
    const rightTime = hkjcHitKickoffDate(right)?.getTime();
    const safeLeft = Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY;
    const safeRight = Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY;
    if (safeLeft !== safeRight) return safeLeft - safeRight;
    return [left.tournament, left.home, left.away, left.pool, left.ruleLabel]
      .join("|")
      .localeCompare([right.tournament, right.home, right.away, right.pool, right.ruleLabel].join("|"));
  });
}

function hkjcOpenUpcomingMatches(matches, endHours = HKJC_OPEN_EXTRACT_WINDOW_HOURS, startHours = 0) {
  return matches.filter(
    (match) =>
      hkjcCheckEligibleForExtraction(match.hkjcCheck) &&
      isNotStartedMatch(match) &&
      isWithinUpcomingHourRange(match, startHours, endHours)
  );
}

function probabilityWindowSelection() {
  const value = els.probabilityWindowInput?.value || "all";
  const ranges = {
    "0-4": { value: "0-4", label: "未來4小時", startHours: 0, endHours: 4 },
    "0-6": { value: "0-6", label: "未來6小時", startHours: 0, endHours: 6 },
    "6-12": { value: "6-12", label: "6-12小時", startHours: 6, endHours: 12 },
    "12-18": { value: "12-18", label: "12-18小時", startHours: 12, endHours: 18 },
    "0-24": { value: "0-24", label: "未來24小時", startHours: 0, endHours: 24 },
  };
  return ranges[value] || { value: "all", label: "全部已選/已載入", startHours: null, endHours: null };
}

function filterProbabilityMatchesByWindow(matches) {
  const range = probabilityWindowSelection();
  if (range.value === "all") return { range, matches };
  return {
    range,
    matches: matches.filter(
      (match) => isNotStartedMatch(match) && isWithinUpcomingHourRange(match, range.startHours, range.endHours)
    ),
  };
}

function hkjcCheckEligibleForExtraction(check) {
  if (!check) return false;
  const score = Number(check.score || 0);
  const hasOpenPools = Boolean(check.matched?.poolTypes?.length || check.matched?.pools?.length);
  if (!hasOpenPools) return false;
  if (check.status === "open") return true;
  return check.status === "possible" && score >= HKJC_EXTRACT_MIN_MATCH_SCORE;
}

function selectOnlyMatches(matches) {
  const ids = new Set(matches.map((match) => String(match.matchId)));
  for (const input of els.matchList.querySelectorAll(".match-check")) {
    input.checked = ids.has(String(input.value));
  }
  updateSelectedButton();
}

function matchTitle(match) {
  const teams = match.home || match.away ? `${match.home || ""} vs ${match.away || ""}` : "";
  return [match.league, teams].filter(Boolean).join(" · ") || match.matchId;
}

function contextMatches() {
  if (state.hkjc) {
    return [];
  }
  return batchItems().map((item) => item.match).filter((match) => match?.matchId);
}

function batchItems() {
  if (state.batch) {
    return (state.batch.results || [])
        .filter((result) => result.ok && result.data)
        .map((result) => ({
          data: result.data,
          match: { ...matchById(result.matchId), ...(result.data.match || {}), ...(result.match || {}), matchId: result.matchId },
        }));
    }

    if (state.data) {
      const matchId = state.data.matchId;
      return [
        {
          data: state.data,
          match: { ...matchById(matchId), ...(state.data.match || {}), matchId },
        },
      ];
    }

  return [];
}

function cacheEntryToBatchItem(entry) {
  const result = entry?.result || {};
  if (!result.ok || !result.data) return null;
  const matchId = String(result.matchId || result.data.matchId || result.match?.matchId || entry.matchId || "").trim();
  if (!matchId) return null;
  return {
      data: result.data,
      match: {
        ...matchById(matchId),
        ...(result.data.match || {}),
        ...(result.match || {}),
        matchId,
      },
    cacheEntry: entry,
  };
}

function cachedTitanItems() {
  return (state.localTitanCache?.entries || []).map(cacheEntryToBatchItem).filter(Boolean);
}

function currentTitanTargetItems() {
  return batchItems().filter((item) => item?.match?.matchId && item?.data);
}

function targetOptionValue(source, matchId) {
  return `${source}|${matchId}`;
}

function parseTargetOptionValue(value) {
  const [source, ...rest] = String(value || "").split("|");
  const matchId = rest.join("|");
  return { source, matchId };
}

function targetItemLabel(item, sourceLabel) {
  const match = item.match || {};
  const teams = [match.home, match.away].filter(Boolean).join(" vs ");
  const title = [match.league, teams || match.matchId].filter(Boolean).join(" · ");
  const savedAt = item.cacheEntry?.savedAt ? ` · ${new Date(item.cacheEntry.savedAt).toLocaleString()}` : "";
  return `${match.matchId} · ${title || "未命名賽事"} · ${sourceLabel}${savedAt}`;
}

function aiTargetOptions() {
  const options = [];
  const seen = new Set();

  for (const item of currentTitanTargetItems()) {
    const matchId = String(item.match.matchId || "");
    if (!matchId || seen.has(matchId)) continue;
    seen.add(matchId);
    options.push({
      source: "current",
      matchId,
      label: targetItemLabel(item, "目前已提取"),
    });
  }

  for (const item of cachedTitanItems()) {
    const matchId = String(item.match.matchId || "");
    if (!matchId || seen.has(matchId)) continue;
    seen.add(matchId);
    options.push({
      source: "cache",
      matchId,
      label: targetItemLabel(item, "本地保存"),
    });
  }

  return options;
}

function renderAiTargetOptions() {
  if (!els.aiTargetMatchSelect) return;
  const previous = els.aiTargetMatchSelect.value;
  const options = aiTargetOptions();
  els.aiTargetMatchSelect.innerHTML = [
    `<option value="">選擇已提取 / 本地保存場次 (${options.length})</option>`,
    ...options.map(
      (option) =>
        `<option value="${escapeHtml(targetOptionValue(option.source, option.matchId))}">${escapeHtml(option.label)}</option>`
    ),
  ].join("");
  if (options.some((option) => targetOptionValue(option.source, option.matchId) === previous)) {
    els.aiTargetMatchSelect.value = previous;
  }
}

async function loadLocalTitanCache(options = {}) {
  try {
    const body = await getJson("/api/local-cache/titan-extract");
    state.localTitanCache = body.data || { entries: [], stats: null };
    renderAiTargetOptions();
    updateAnalysisButton();
    return state.localTitanCache;
  } catch (error) {
    if (!options.silent) {
      state.lastAiError = error.message || String(error);
      updateDebugLights();
    }
    state.localTitanCache = { entries: [], stats: null };
    renderAiTargetOptions();
    return state.localTitanCache;
  }
}

function summaryCard(label, value, className = "") {
  return `
    <div class="summary-card ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderSummaryCards(cards) {
  els.summary.innerHTML = cards.map((card) => summaryCard(card.label, card.value, card.className)).join("");
}

function clearAnalysis() {
  state.analysis = null;
  state.features = null;
  state.lastAiDurationMs = null;
  els.featuresDownloadBtn.disabled = true;
  els.aiDownloadBtn.disabled = true;
  if (els.aiJsonDownloadBtn) els.aiJsonDownloadBtn.disabled = true;
  els.analysisOutput.innerHTML = `<div class="empty">完成提取或掃描後可送出分析</div>`;
  renderAnalysisPanels();
  updateDebugLights();
}

function updateAnalysisButton() {
  renderAiTargetOptions();
  const rows = currentAnalysisRows();
  const hasRows = rows.length > 0;
  const targetOptions = aiTargetOptions();
  const targetRows = rowsForAiTarget(selectedAiTarget());
  const hasTargetRows = targetRows.length > 0;
  els.aiAnalyzeBtn.disabled = state.working || !hasRows;
  els.basicTop10Btn.disabled = state.working || !hasRows;
  els.aiAnalyzeTargetBtn.disabled = state.working || !hasTargetRows;
  if (els.loadContextBtn) {
    els.loadContextBtn.disabled = state.working || !hasRows || !els.apiFootballKeyInput?.value.trim();
  }
  if (state.analysis) {
    els.analysisMeta.textContent = `${state.analysis.model || "AI"} · ${state.analysis.rowCount || 0} rows`;
  } else if (hasRows) {
    els.analysisMeta.textContent = `可分析 ${rows.length} rows`;
  } else if (hasTargetRows) {
    els.analysisMeta.textContent = "可單場分析本地保存資料";
  } else if (targetOptions.length) {
    els.analysisMeta.textContent = "請先選擇已保存場次";
  } else {
    els.analysisMeta.textContent = "未分析";
  }
  renderFeaturePanel();
}

function updateSummary() {
  els.tabs.hidden = Boolean(state.hkjc || state.probability || state.titanGuess || state.diagnostics);

  if (state.hkjc) {
    const errors = state.hkjc.errors?.length || 0;
    const label = state.hkjc.label || "HKJC 掃描";
    els.resultTitle.textContent = `${label} ${state.hkjc.hitCount || 0} 筆`;
    renderSummaryCards([
      { label: "模式", value: label },
      { label: "掃描賽事", value: state.hkjc.scannedMatches || 0 },
      { label: "命中", value: state.hkjc.hitCount || 0 },
      { label: "錯誤", value: errors, className: errors ? "warning" : "" },
    ]);
    updateAnalysisButton();
    return;
  }

  if (state.probability) {
    const errors = state.probability.errorCount || 0;
    els.resultTitle.textContent = `Titan007 概率事件 ${state.probability.hitCount || 0} 筆`;
    renderSummaryCards([
      { label: "模式", value: "概率事件" },
      { label: "時段", value: state.probability.windowLabel || "全部" },
      { label: "掃描賽事", value: state.probability.total || 0 },
      { label: "分批", value: state.probability.batchCount ? `${state.probability.batchCount} x ≤${state.probability.chunkSize || BATCH_EXTRACT_LIMIT}` : "1" },
      { label: "Worker", value: state.probability.concurrency || 1 },
      { label: "80%+", value: state.probability.hitCount || 0 },
      { label: "無資料", value: state.probability.noDataCount || 0 },
      { label: "錯誤", value: errors, className: errors ? "warning" : "" },
    ]);
    updateAnalysisButton();
    return;
  }

  if (state.titanGuess) {
    els.resultTitle.textContent = `Titan007 V猜球 ${state.titanGuess.hitCount || 0}/${state.titanGuess.total || 0} 筆`;
    renderSummaryCards([
      { label: "模式", value: "V猜球" },
      { label: "來源", value: state.titanGuess.fromCache ? "Titan007 V猜球快取" : "Titan007 V猜球總頁" },
      { label: "掃描賽事", value: state.titanGuess.total || 0 },
      { label: "70%+", value: state.titanGuess.hitCount || 0 },
      { label: "門檻", value: `${state.titanGuess.threshold || 70}%` },
      { label: state.titanGuess.fromCache ? "快取時間" : "更新", value: formatShortTime(state.titanGuess.fetchedAt) || "剛剛" },
    ]);
    updateAnalysisButton();
    return;
  }

  if (state.diagnostics) {
    const counts = state.diagnostics.counts || {};
    const overallLabel =
      state.diagnostics.overall === "ok" ? "正常" : state.diagnostics.overall === "warn" ? "可疑" : "異常";
    els.resultTitle.textContent = `連線診斷 ${overallLabel}`;
    renderSummaryCards([
      { label: "整體", value: overallLabel, className: state.diagnostics.overall === "error" ? "warning" : "" },
      { label: "正常", value: counts.ok || 0 },
      { label: "可疑", value: counts.warn || 0, className: counts.warn ? "warning" : "" },
      { label: "失敗", value: counts.error || 0, className: counts.error ? "warning" : "" },
      { label: "Timeout", value: `${state.diagnostics.timeoutMs || 0}ms` },
    ]);
    updateAnalysisButton();
    return;
  }

  if (state.batch) {
    const items = batchItems();
    const rowTotal = flattenForCsv().length;
    const failed = (state.batch.results || []).filter((result) => !result.ok).length;
    const durations = (state.batch.results || [])
      .map((result) => Number(result.durationMs || 0))
      .filter((duration) => Number.isFinite(duration) && duration > 0);
    const lastDuration = durations.length ? durations[durations.length - 1] : 0;
    const avgDuration = durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : 0;
    const marketErrors = (state.batch.results || []).reduce((count, result) => {
      const data = result.data;
      if (!data) return count;
      return (
        count +
        [data.asian.full, data.asian.half, data.overUnder.full, data.overUnder.half, data.europe].filter(
          (section) => section?.error
        ).length
      );
    }, 0);

    els.resultTitle.textContent = `Titan007 批量 ${items.length}/${state.batch.total || 0}`;
    renderSummaryCards([
      { label: "成功賽事", value: `${items.length}/${state.batch.total || 0}` },
      { label: "進度", value: state.batch.partial ? `${state.batch.completedCount || 0}/${state.batch.total || 0}` : "完成" },
      { label: "分批", value: state.batch.batchCount ? `${state.batch.batchCount} x ≤${state.batch.chunkSize || BATCH_EXTRACT_LIMIT}` : "1" },
      { label: "Worker", value: state.batch.concurrency || 1 },
      { label: "提取模式", value: state.batch.extractionMode === "deep" ? "深度補齊" : "快速穩定" },
      { label: "本地保存", value: state.batch.localCache ? `${state.batch.localCache.updatedCount || 0} / 48h` : "未有" },
      { label: "最近用時", value: lastDuration ? formatDuration(lastDuration) : "未有" },
      { label: "平均用時", value: avgDuration ? formatDuration(avgDuration) : "未有" },
      { label: "可匯出列數", value: rowTotal },
      { label: "提取失敗", value: failed, className: failed ? "warning" : "" },
      { label: "市場錯誤", value: marketErrors, className: marketErrors ? "warning" : "" },
    ]);
    updateAnalysisButton();
    return;
  }

  const data = state.data;
  if (!data) {
    els.resultTitle.textContent = "等待資料";
    renderSummaryCards([
      { label: "資料狀態", value: "未載入" },
      { label: "賽事", value: 0 },
      { label: "可匯出列數", value: 0 },
      { label: "AI", value: "待資料" },
    ]);
    updateAnalysisButton();
    return;
  }

  const marketErrors = [
    data.asian.full,
    data.asian.half,
    data.overUnder.full,
    data.overUnder.half,
    data.europe,
  ].filter((section) => section?.error).length;

  els.resultTitle.textContent = `Match ID ${data.matchId}`;
  renderSummaryCards([
    { label: "亞盤", value: `${rowCount(data.asian.full)} / ${rowCount(data.asian.half)}` },
    { label: "大小", value: `${rowCount(data.overUnder.full)} / ${rowCount(data.overUnder.half)}` },
    { label: "歐賠", value: rowCount(data.europe) },
    { label: "提取模式", value: data.extractionMode === "deep" ? "深度補齊" : "快速穩定" },
    { label: "本地保存", value: data.localCache ? "48h" : "未有" },
    { label: "錯誤", value: marketErrors, className: marketErrors ? "warning" : "" },
  ]);
  updateAnalysisButton();
}

function sectionForTab(tab) {
  const map = {
    asianFull: (data) => data.asian.full,
    asianHalf: (data) => data.asian.half,
    overFull: (data) => data.overUnder.full,
    overHalf: (data) => data.overUnder.half,
    europe: (data) => data.europe,
  };
  return map[tab] || null;
}

function activeSectionEntries(tab) {
  const resolver = sectionForTab(tab);
  const entries = [];
  const errors = [];
  const warnings = [];

  if (!resolver) return { entries, errors, warnings };

  for (const item of batchItems()) {
    const section = resolver(item.data);
    if (section?.error) {
      errors.push({
        match: item.match,
        sourceUrl: section.sourceUrl || "",
        error: section.error,
      });
    }
    if (section?.missingTargetBookmakerLabels?.length) {
      warnings.push({
        match: item.match,
        coverage: section.coverageLabel || "",
        missing: section.missingTargetBookmakerLabels,
      });
    }

    for (const row of section?.rows || []) {
      entries.push({
        match: item.match,
        row,
      });
    }
  }

  return { entries, errors, warnings };
}

function summarizeTechnicalError(error) {
  const text = String(error || "").replace(/\s+/g, " ").trim();
  if (!text) return "未知錯誤";
  const urls = [...new Set((text.match(/https?:\/\/[^\s|)]+/g) || []).map((url) => url.replace(/[.,;]+$/, "")))];
  const urlHint = urls[0] ? ` (${urls[0]})` : "";
  const http = text.match(/\bHTTP\s+\d{3}\b/i)?.[0];
  if (/timed out|timeout|逾時/i.test(text)) return `${http || "請求逾時"}${urlHint}`;
  if (/socket hang up|ECONNRESET|connection reset/i.test(text)) return `連線中斷${urlHint}`;
  if (/error page|returned an error/i.test(text)) return `Titan007 回傳錯誤頁${urlHint}`;
  if (/no Europe rows/i.test(text)) return `歐洲賠率未有可解析資料${urlHint}`;
  if (/no odds table|找不到 odds table/i.test(text)) return `找不到盤口表格${urlHint}`;
  if (http) return `${http}${urlHint}`;
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function renderErrorDetail(error) {
  const text = String(error || "").trim();
  if (!text || text.length <= 160) return "";
  return `
    <details class="error-detail">
      <summary>詳細錯誤</summary>
      <pre>${escapeHtml(text)}</pre>
    </details>
  `;
}

function renderTechnicalErrorBox(title, error) {
  const text = error?.message || String(error || "");
  const summary = summarizeTechnicalError(text);
  return `
    <div class="error technical-error-box">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(summary)}</span>
      ${renderErrorDetail(text)}
    </div>
  `;
}

function renderErrors(errors) {
  if (!errors.length) return "";

  return `
    <div class="inline-errors">
      ${errors
        .map(
          (item) => {
            const summary = summarizeTechnicalError(item.error);
            return `
            <div class="inline-error-item">
              <strong>${escapeHtml(item.match?.matchId || item.pool || "")}</strong>
              <span>${escapeHtml(item.match ? matchTitle(item.match) : item.pool || "")}</span>
              <em>${escapeHtml(summary)}</em>
              ${renderErrorDetail(item.error)}
            </div>
          `;
          }
        )
        .join("")}
    </div>
  `;
}

function renderCoverageWarnings(warnings) {
  const visibleWarnings = warnings
    .map((item) => ({
      ...item,
      missing: (item.missing || []).filter((label) => label !== "立博"),
    }))
    .filter((item) => item.missing.length);
  if (!visibleWarnings.length) return "";

  return `
    <div class="inline-errors coverage-warnings">
      ${visibleWarnings
        .map(
          (item) => `
            <div class="inline-error-item">
              <strong>${escapeHtml(item.match?.matchId || "")}</strong>
              <span>${escapeHtml(matchTitle(item.match || {}))}</span>
              <em>${escapeHtml(`莊家覆蓋 ${item.coverage || "-"} · 缺：${(item.missing || []).join("、")}`)}</em>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderExtractionProgress() {
  if (!state.batch?.results?.length && !state.batch?.partial) return "";
  const rows = (state.batch.results || [])
    .slice(-8)
    .map((result) => {
      const match = result.match || matchById(result.matchId);
      const title = [match.league, match.home && match.away ? `${match.home} vs ${match.away}` : result.matchId]
        .filter(Boolean)
        .join(" · ");
      const duration = result.durationMs ? formatDuration(result.durationMs) : "進行中";
      return `
        <div class="extract-progress-item ${result.ok ? "ok" : "error"}">
          <strong>${escapeHtml(result.matchId || match.matchId || "")}</strong>
          <span>${escapeHtml(title)}</span>
          <em>${escapeHtml(duration)}</em>
        </div>
      `;
    })
    .join("");
  return `
    <div class="extract-progress-panel">
      <div class="extract-progress-head">
        <strong>逐場提取進度</strong>
        <span>${escapeHtml(state.batch.completedCount || 0)} / ${escapeHtml(state.batch.total || 0)}</span>
      </div>
      <div class="extract-progress-list">${rows}</div>
    </div>
  `;
}

function renderProbabilityProgress() {
  if (!state.probability?.results?.length && !state.probability?.partial) return "";
  const rows = (state.probability.results || [])
    .slice(-8)
    .map((result) => {
      const match = result.match || matchById(result.matchId);
      const title = [match.league, match.home && match.away ? `${match.home} vs ${match.away}` : result.matchId]
        .filter(Boolean)
        .join(" · ");
      const duration = result.durationMs ? formatDuration(result.durationMs) : "進行中";
      const hitCount = result.hits?.length || 0;
      const note = result.ok ? `${hitCount} 命中` : "錯誤";
      return `
        <div class="extract-progress-item ${result.ok ? "ok" : "error"}">
          <strong>${escapeHtml(result.matchId || match.matchId || "")}</strong>
          <span>${escapeHtml(title)}</span>
          <em>${escapeHtml(`${duration} · ${note}`)}</em>
        </div>
      `;
    })
    .join("");
  return `
    <div class="extract-progress-panel">
      <div class="extract-progress-head">
        <strong>概率事件逐場掃描</strong>
        <span>${escapeHtml(state.probability.completedCount || 0)} / ${escapeHtml(state.probability.total || 0)}</span>
      </div>
      <div class="extract-progress-list">${rows || `<div class="empty">準備逐場提取...</div>`}</div>
    </div>
  `;
}

function prependProbabilityProgress() {
  const progressHtml = renderProbabilityProgress();
  if (progressHtml) {
    els.tableWrap.insertAdjacentHTML("afterbegin", progressHtml);
  }
}

function renderOddsTable(entries, market, errors = [], warnings = []) {
  if (!entries.length && !errors.length && !warnings.length) {
    els.tableWrap.innerHTML = `${renderExtractionProgress()}<div class="empty">此市場未有資料</div>`;
    return;
  }

  const isAsian = market === "asian";
  const lineLabel = isAsian ? "盤口" : "球數";
  const firstLabel = isAsian ? "主隊" : "大球";
  const thirdLabel = isAsian ? "客隊" : "細球";
  const firstKey = isAsian ? "homeOdds" : "overOdds";
  const lineKey = isAsian ? "handicap" : "total";
  const lineValueKey = isAsian ? "handicapValue" : "totalValue";
  const thirdKey = isAsian ? "awayOdds" : "underOdds";

  const rows = entries
    .map(({ match, row }) => {
      const multi = row.isMultiLine ? row.multiLabel || "多盤" : "";
      return `
        <tr>
          <td>${escapeHtml(match.matchId)}</td>
          <td>${escapeHtml(match.league || "")}</td>
          <td>${escapeHtml(match.home || "")}</td>
          <td>${escapeHtml(match.away || "")}</td>
          <td>${escapeHtml(match.kickoffTime || "")}</td>
          <td title="${escapeHtml(row.company)}">${escapeHtml(displayBookmaker(row))}${row.isClosed ? "（封）" : ""}</td>
          <td class="muted">${escapeHtml(row.companyId)}</td>
          <td class="muted">${escapeHtml(multi)}</td>
          <td class="number">${escapeHtml(row.initial[firstKey])}</td>
          <td class="line">${escapeHtml(row.initial[lineKey])}</td>
          <td class="muted">${escapeHtml(row.initial[lineValueKey])}</td>
          <td class="number">${escapeHtml(row.initial[thirdKey])}</td>
          <td class="number">${escapeHtml(row.current[firstKey])}</td>
          <td class="line">${escapeHtml(row.current[lineKey])}</td>
          <td class="muted">${escapeHtml(row.current[lineValueKey])}</td>
          <td class="number">${escapeHtml(row.current[thirdKey])}</td>
        </tr>
      `;
    })
    .join("");

  els.tableWrap.innerHTML = `
    ${renderExtractionProgress()}
    ${renderCoverageWarnings(warnings)}
    ${renderErrors(errors)}
    <table>
      <thead>
        <tr>
          <th style="width:95px">Match ID</th>
          <th style="width:90px">聯賽</th>
          <th style="width:120px">主隊</th>
          <th style="width:120px">客隊</th>
          <th style="width:80px">開賽</th>
          <th style="width:130px">莊家</th>
          <th style="width:70px">ID</th>
          <th style="width:70px">多盤</th>
          <th>${firstLabel} 初</th>
          <th>${lineLabel} 初</th>
          <th>值 初</th>
          <th>${thirdLabel} 初</th>
          <th>${firstLabel} 即</th>
          <th>${lineLabel} 即</th>
          <th>值 即</th>
          <th>${thirdLabel} 即</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderEuropeTable(entries, errors = []) {
  if (!entries.length && !errors.length) {
    els.tableWrap.innerHTML = `${renderExtractionProgress()}<div class="empty">歐洲賠率未有資料</div>`;
    return;
  }

  const rows = entries
    .map(
      ({ match, row }) => `
        <tr>
          <td>${escapeHtml(match.matchId)}</td>
          <td>${escapeHtml(match.league || "")}</td>
          <td>${escapeHtml(match.home || "")}</td>
          <td>${escapeHtml(match.away || "")}</td>
          <td>${escapeHtml(match.kickoffTime || "")}</td>
          <td title="${escapeHtml(row.company)}">${escapeHtml(displayBookmaker(row))}</td>
          <td class="number">${escapeHtml(row.current?.win || row.win || "")}</td>
          <td class="number">${escapeHtml(row.current?.draw || row.draw || "")}</td>
          <td class="number">${escapeHtml(row.current?.loss || row.loss || "")}</td>
          <td class="number">${escapeHtml(row.current?.winRate || row.winRate || "")}</td>
          <td class="number">${escapeHtml(row.current?.drawRate || row.drawRate || "")}</td>
          <td class="number">${escapeHtml(row.current?.lossRate || row.lossRate || "")}</td>
          <td class="number">${escapeHtml(row.current?.returnRate || row.returnRate || "")}</td>
          <td class="number">${escapeHtml(row.kellyWin || row.current?.kellyWin || "")}</td>
          <td class="number">${escapeHtml(row.kellyDraw || row.current?.kellyDraw || "")}</td>
          <td class="number">${escapeHtml(row.kellyLoss || row.current?.kellyLoss || "")}</td>
          <td>${escapeHtml(row.changedAt || "")}</td>
        </tr>
      `
    )
    .join("");

  els.tableWrap.innerHTML = `
    ${renderExtractionProgress()}
    ${renderErrors(errors)}
    <table>
      <thead>
        <tr>
          <th style="width:95px">Match ID</th>
          <th style="width:90px">聯賽</th>
          <th style="width:120px">主隊</th>
          <th style="width:120px">客隊</th>
          <th style="width:80px">開賽</th>
          <th style="width:160px">莊家</th>
          <th>主勝</th>
          <th>和</th>
          <th>客勝</th>
          <th>主勝率</th>
          <th>和率</th>
          <th>客勝率</th>
          <th>返還率</th>
          <th>凱利主</th>
          <th>凱利和</th>
          <th>凱利客</th>
          <th>變化時間</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderActiveTab() {
  if (state.hkjc) {
    renderHkjcTable();
    return;
  }
  if (state.probability) {
    renderProbabilityTable();
    return;
  }
  if (state.titanGuess) {
    renderTitanGuessTable();
    return;
  }
  if (state.diagnostics && !state.batch && !state.data) {
    renderDiagnosticsTable();
    return;
  }

  for (const button of els.tabs.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.tab === state.activeTab);
  }

  const { entries, errors, warnings } = activeSectionEntries(state.activeTab);
  if (!entries.length && !errors.length && !warnings.length) {
    els.tableWrap.innerHTML = `<div class="empty">${escapeHtml(TAB_LABELS[state.activeTab] || "此市場")}未有資料</div>`;
    return;
  }

  if (state.activeTab.startsWith("asian")) {
    renderOddsTable(entries, "asian", errors, warnings);
    return;
  }

  if (state.activeTab.startsWith("over")) {
    renderOddsTable(entries, "overUnder", errors, warnings);
    return;
  }

  renderEuropeTable(entries, errors);
}

function renderHkjcTable() {
  const data = state.hkjc;
  if (!data) return;

  const errors = data.errors?.length
    ? renderErrors(data.errors.map((item) => ({ pool: item.pool, error: item.error })))
    : "";

  if (!data.hits?.length) {
    els.tableWrap.innerHTML = `${errors}<div class="empty">未來 ${escapeHtml(data.hours || 24)} 小時未命中指定 HKJC 賠率</div>`;
    return;
  }

  const hits = sortedHkjcHits(data.hits);
  const rows = hits
    .map(
      (hit, index) => `
        <tr>
          <td><input class="hkjc-hit-check" type="checkbox" data-index="${index}" aria-label="選取"></td>
          <td>${escapeHtml(hit.pool)}</td>
          <td>${escapeHtml(hit.ruleLabel)}</td>
          <td>${escapeHtml(hit.frontEndId || hit.matchId)}</td>
          <td class="kickoff-cell" title="${escapeHtml(hit.kickOffTime || "")}">${escapeHtml(formatHkjcKickoff(hit.kickOffTime))}</td>
          <td>${escapeHtml(hit.tournament)}</td>
          <td>${escapeHtml(hit.home)}</td>
          <td>${escapeHtml(hit.away)}</td>
          <td>${escapeHtml(hit.line)}</td>
          <td>${escapeHtml(hit.selectionName || hit.selection)}</td>
          <td class="number">${escapeHtml(hit.odds)}</td>
          <td class="number">${escapeHtml(hit.homeOdds || "")}</td>
          <td class="number">${escapeHtml(hit.drawOdds || "")}</td>
          <td class="number">${escapeHtml(hit.awayOdds || "")}</td>
          <td>${escapeHtml(hit.updateAt || "")}</td>
          <td>${hit.sourcePage ? `<a href="${escapeHtml(hit.sourcePage)}" target="_blank" rel="noreferrer">查看</a>` : ""}</td>
        </tr>
      `
    )
    .join("");

  els.tableWrap.innerHTML = `
    ${errors}
    <table>
      <thead>
        <tr>
          <th style="width:48px">選</th>
          <th style="width:70px">彩池</th>
          <th style="width:190px">命中規則</th>
          <th style="width:90px">賽事</th>
          <th style="width:110px">開賽</th>
          <th style="width:140px">聯賽</th>
          <th style="width:140px">主隊</th>
          <th style="width:140px">客隊</th>
          <th style="width:70px">盤</th>
          <th style="width:95px">選項</th>
          <th style="width:70px">賠率</th>
          <th style="width:70px">主</th>
          <th style="width:70px">和</th>
          <th style="width:70px">客</th>
          <th style="width:170px">更新</th>
          <th style="width:80px">來源</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function diagnosticStateLabel(stateName) {
  if (stateName === "ok") return "正常";
  if (stateName === "warn") return "可疑";
  if (stateName === "error") return "失敗";
  return "未明";
}

function renderDiagnosticsTable() {
  const data = state.diagnostics;
  if (!data) return;

  const probes = data.probes || [];
  const rows = probes
    .map((probe) => {
      const hints = (probe.hints || []).join(" ");
      const metaParts = [];
      if (probe.meta?.ip) metaParts.push(`IP ${probe.meta.ip}`);
      if (probe.meta?.matchCount !== undefined) metaParts.push(`${probe.meta.matchCount} matches`);
      if (probe.meta?.firstMatchId) metaParts.push(`sample ${probe.meta.firstMatchId}`);
      if (probe.errorCode) metaParts.push(probe.errorCode);
      return `
        <tr>
          <td><span class="diagnostic-badge ${escapeHtml(probe.state || "warn")}">${escapeHtml(diagnosticStateLabel(probe.state))}</span></td>
          <td>${escapeHtml(probe.label || probe.name)}</td>
          <td class="number">${escapeHtml(probe.statusCode || probe.errorCode || "-")}</td>
          <td class="number">${escapeHtml(probe.elapsedMs || 0)}ms</td>
          <td>${escapeHtml(probe.contentType || "")}</td>
          <td>${escapeHtml(probe.diagnosis || probe.error || "")}</td>
          <td>${escapeHtml(metaParts.join(" · "))}</td>
          <td>${escapeHtml(hints || probe.sample || "")}</td>
        </tr>
      `;
    })
    .join("");

  els.tableWrap.innerHTML = `
    <div class="diagnostic-summary ${escapeHtml(data.overall || "warn")}">
      <strong>${escapeHtml(data.summary || "連線診斷完成")}</strong>
      <span>${escapeHtml(data.checkedAt || "")}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:82px">狀態</th>
          <th style="width:170px">項目</th>
          <th style="width:82px">HTTP</th>
          <th style="width:88px">耗時</th>
          <th style="width:190px">Content-Type</th>
          <th style="width:230px">判斷</th>
          <th style="width:170px">資料</th>
          <th>提示 / 回應摘要</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="8"><div class="empty">未有診斷結果</div></td></tr>`}</tbody>
    </table>
  `;
}

function renderProbabilityTable() {
  const data = state.probability;
  if (!data) return;

  const errors = (data.results || []).filter((result) => !result.ok);
  const errorHtml = errors.length
    ? renderErrors(errors.map((item) => ({ match: item.match || { matchId: item.matchId }, error: item.error })))
    : "";

  if (!data.hits?.length) {
    els.tableWrap.innerHTML = `${errorHtml}<div class="empty">未找到 80% 或以上的 Titan007 概率事件</div>`;
    return;
  }

  const rows = data.hits
    .map(
      (hit) => `
        <tr>
          <td>${escapeHtml(hit.matchId)}</td>
          <td>${escapeHtml(hit.league || "")}</td>
          <td>${escapeHtml(hit.home || "")}</td>
          <td>${escapeHtml(hit.away || "")}</td>
          <td>${escapeHtml(hit.kickoffTime || "")}</td>
          <td>${escapeHtml(hit.companyName || "")}</td>
          <td>${escapeHtml(hit.market || hit.oddsType || "")}</td>
          <td>${escapeHtml(hit.type || "")}</td>
          <td class="number">${escapeHtml(hit.percent)}%</td>
          <td>${escapeHtml(hit.description || "")}</td>
          <td><a href="${escapeHtml(hit.sourcePage)}" target="_blank" rel="noreferrer">Mobile</a></td>
        </tr>
      `
    )
    .join("");

  els.tableWrap.innerHTML = `
    ${errorHtml}
    <table>
      <thead>
        <tr>
          <th style="width:95px">Match ID</th>
          <th style="width:90px">聯賽</th>
          <th style="width:130px">主隊</th>
          <th style="width:130px">客隊</th>
          <th style="width:120px">開賽</th>
          <th style="width:90px">公司</th>
          <th style="width:90px">市場</th>
          <th style="width:80px">事件</th>
          <th style="width:80px">概率</th>
          <th>描述</th>
          <th style="width:90px">來源</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function guessLeanLabel(match, market) {
  if (market === "asian") {
    if (match.asianLean === "home") return `${match.home || "主隊"}方向`;
    if (match.asianLean === "away") return `${match.away || "客隊"}方向`;
    return "均衡";
  }
  if (match.totalLean === "over") return "大";
  if (match.totalLean === "under") return "小";
  return "均衡";
}

function setMatchButtons(enabled) {
  els.selectAllBtn.disabled = !enabled || state.working;
  els.clearSelectionBtn.disabled = !enabled || state.working;
  els.extractLoadedBtn.disabled = !enabled || state.working;
  els.probabilityScanBtn.disabled = state.working;
  if (els.titanGuessScanBtn) els.titanGuessScanBtn.disabled = state.working;
  if (els.extractFourHourBtn) els.extractFourHourBtn.disabled = state.working;
  if (els.hkjcSpecialOddsBtn) els.hkjcSpecialOddsBtn.disabled = state.working;
  if (els.hkjcCrsEqualOddsBtn) els.hkjcCrsEqualOddsBtn.disabled = state.working;
  if (els.networkDiagnosticsBtn) els.networkDiagnosticsBtn.disabled = state.working;
  els.extractHkjcSixHourBtn.disabled = state.working;
  els.extractHkjcTwelveHourBtn.disabled = state.working;
  els.extractHkjcEighteenHourBtn.disabled = state.working;
  updateSelectedButton();
}

function selectedMatches() {
  const ids = [...els.matchList.querySelectorAll(".match-check:checked")].map((input) => input.value);
  return ids.map(matchById);
}

function updateSelectedButton() {
  const count = selectedMatches().length;
  els.extractSelectedBtn.disabled = state.working || count === 0;
  els.extractSelectedBtn.textContent = count ? `提取已選 (${count})` : "提取已選";
}

function hkjcMatchBadge(match) {
  const check = match.hkjcCheck;
  if (!check) {
    return `<span class="hkjc-match-badge pending">HKJC 待查</span>`;
  }

  const title = check.matched
    ? `${check.matched.tournament || ""} ${check.matched.home || ""} vs ${check.matched.away || ""} ${check.matched.kickOffTime || ""}`
    : check.error || "";
  const pools = check.matched?.poolTypes?.length ? ` · ${check.matched.poolTypes.join("/")}` : "";
  const score = check.score ? ` ${check.score}%` : "";
  const label =
    check.label ||
    (check.status === "open"
      ? "HKJC 已開"
      : check.status === "possible"
        ? "HKJC 疑似"
        : check.status === "pending"
          ? "HKJC 待查"
        : check.status === "timeout"
          ? "HKJC 逾時"
          : check.status === "error"
            ? "HKJC 失敗"
            : "HKJC 未見");
  return `<span class="hkjc-match-badge ${escapeHtml(check.status || "checking")}" title="${escapeHtml(title)}">${escapeHtml(label)}${escapeHtml(score)}${escapeHtml(pools)}</span>`;
}

function setWorking(isWorking) {
  state.working = isWorking;
  els.extractBtn.disabled = isWorking;
  els.batchExtractBtn.disabled = isWorking;
  if (els.hkjcSpecialOddsBtn) els.hkjcSpecialOddsBtn.disabled = isWorking;
  if (els.hkjcCrsEqualOddsBtn) els.hkjcCrsEqualOddsBtn.disabled = isWorking;
  if (els.networkDiagnosticsBtn) els.networkDiagnosticsBtn.disabled = isWorking;
  els.hkjcScanBtn.disabled = isWorking;
  els.aiTestBtn.disabled = isWorking;
  if (els.loadContextBtn) {
    els.loadContextBtn.disabled = isWorking || currentAnalysisRows().length === 0 || !els.apiFootballKeyInput?.value.trim();
  }
  els.quickExtractBtn.disabled = isWorking;
  els.loadMatchesBtn.disabled = isWorking;
  if (els.workerCountInput) els.workerCountInput.disabled = isWorking;
  if (els.probabilityWindowInput) els.probabilityWindowInput.disabled = isWorking;
  els.probabilityScanBtn.disabled = isWorking;
  if (els.titanGuessScanBtn) els.titanGuessScanBtn.disabled = isWorking;
  if (els.extractFourHourBtn) els.extractFourHourBtn.disabled = isWorking;
  els.extractHkjcSixHourBtn.disabled = isWorking;
  els.extractHkjcTwelveHourBtn.disabled = isWorking;
  els.extractHkjcEighteenHourBtn.disabled = isWorking;
  els.selectAllBtn.disabled = isWorking || !state.loadedMatches.length;
  els.clearSelectionBtn.disabled = isWorking || !state.loadedMatches.length;
  els.extractLoadedBtn.disabled = isWorking || !state.loadedMatches.length;
  els.extractSelectedBtn.disabled = isWorking || selectedMatches().length === 0;
  updateAnalysisButton();
}

function renderTitanGuessTable() {
  const data = state.titanGuess;
  if (!data) return;

  const matches = data.matches || [];
  if (!matches.length) {
    els.tableWrap.innerHTML = `<div class="empty">Titan007 V猜球總頁暫時沒有命中目標賽事</div>`;
    return;
  }

  const pct = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const number = Number(value);
    const text = `${escapeHtml(value)}%`;
    return Number.isFinite(number) && number > 75 ? `<span class="vguess-hot-percent">${text}</span>` : text;
  };
  const rows = matches
    .map(
      (match) => {
        const maxPercent = Number(match.maxPercent || 0);
        const badgeClass = maxPercent > 75 ? "error" : match.hot ? "ok" : "warn";
        const badgeLabel = maxPercent > 75 ? "75%+" : match.hot ? "70%+" : "目標";
        return `
        <tr>
          <td><span class="diagnostic-badge ${badgeClass}">${badgeLabel}</span></td>
          <td>${escapeHtml(match.matchId)}</td>
          <td>${escapeHtml(match.league || "")}</td>
          <td>${escapeHtml(match.kickoffTime || match.state || "")}</td>
          <td>${escapeHtml(match.home || "")}</td>
          <td>${escapeHtml(match.away || "")}</td>
          <td>${escapeHtml(match.asianLine || "")}</td>
          <td class="number">${pct(match.asianHomePercent)}</td>
          <td class="number">${pct(match.asianAwayPercent)}</td>
          <td class="number">${escapeHtml(match.asianHomeSupportOdds ?? "")}</td>
          <td class="number">${escapeHtml(match.asianAwaySupportOdds ?? "")}</td>
          <td class="number">${escapeHtml(match.asianCount ?? "")}</td>
          <td>${escapeHtml(guessLeanLabel(match, "asian"))}</td>
          <td>${escapeHtml(match.totalLine || "")}</td>
          <td class="number">${pct(match.overPercent)}</td>
          <td class="number">${pct(match.underPercent)}</td>
          <td class="number">${escapeHtml(match.overSupportOdds ?? "")}</td>
          <td class="number">${escapeHtml(match.underSupportOdds ?? "")}</td>
          <td class="number">${escapeHtml(match.totalCount ?? "")}</td>
          <td>${escapeHtml(guessLeanLabel(match, "total"))}</td>
          <td class="number">${pct(match.maxPercent || 0)}</td>
          <td>${match.detailUrl ? `<a href="${escapeHtml(match.detailUrl)}" target="_blank" rel="noreferrer">V猜球</a>` : ""}</td>
        </tr>
      `;
      }
    )
    .join("");

  els.tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:78px">標記</th>
          <th style="width:95px">Match ID</th>
          <th style="width:100px">聯賽</th>
          <th style="width:88px">時間</th>
          <th style="width:130px">主隊</th>
          <th style="width:130px">客隊</th>
          <th style="width:78px">亞盤</th>
          <th style="width:78px">主%</th>
          <th style="width:78px">客%</th>
          <th style="width:70px">主水</th>
          <th style="width:70px">客水</th>
          <th style="width:70px">亞人數</th>
          <th style="width:92px">亞方向</th>
          <th style="width:78px">大小盤</th>
          <th style="width:78px">大%</th>
          <th style="width:78px">小%</th>
          <th style="width:70px">大水</th>
          <th style="width:70px">小水</th>
          <th style="width:70px">大小人數</th>
          <th style="width:92px">大小方向</th>
          <th style="width:78px">最高</th>
          <th style="width:82px">連結</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function setExportButtons(enabled) {
  els.jsonBtn.disabled = !enabled;
  els.jsonlBtn.disabled = !enabled;
  els.csvBtn.disabled = !enabled;
  updateAnalysisButton();
}

function renderMatchList(matches, options = {}) {
  const selected = options.preserveSelection
    ? new Set([...els.matchList.querySelectorAll(".match-check:checked")].map((input) => input.value))
    : new Set();
  state.loadedMatches = matches;
  state.loadedMatchesById = new Map(matches.map((match) => [String(match.matchId), match]));

  if (!matches.length) {
    els.matchList.innerHTML = `<div class="empty">沒有符合條件的賽事</div>`;
    setMatchButtons(false);
    return;
  }

  els.matchList.innerHTML = matches
    .map(
      (match) => `
        <div class="match-row" data-id="${escapeHtml(match.matchId)}">
          <label class="match-select">
            <input class="match-check" type="checkbox" value="${escapeHtml(match.matchId)}" ${selected.has(String(match.matchId)) ? "checked" : ""}>
            <span>
              <strong>${escapeHtml(match.league)} · ${escapeHtml(match.home)} vs ${escapeHtml(match.away)}</strong>
              ${escapeHtml(match.kickoffTime)} · ${escapeHtml(match.state)} · ${escapeHtml(match.score)}
              ${hkjcMatchBadge(match)}
            </span>
          </label>
          <button class="quick-extract" type="button" data-id="${escapeHtml(match.matchId)}">提取</button>
          <code>${escapeHtml(match.matchId)}</code>
        </div>
      `
    )
    .join("");
  setMatchButtons(true);
}

async function checkLoadedMatchesInHkjc(matches, options = {}) {
  if (!matches.length) return;
  const runId = options.runId || state.hkjcMatchCheckRunId;
  const requestMatches = matches.map((match) => ({
    matchId: match.matchId,
    league: match.league,
    leagueSimplified: match.leagueSimplified,
    leagueTraditional: match.leagueTraditional,
    kickoffTime: match.kickoffTime,
    state: match.state,
    home: match.home,
    homeSimplified: match.homeSimplified,
    homeTraditional: match.homeTraditional,
    away: match.away,
    awaySimplified: match.awaySimplified,
    awayTraditional: match.awayTraditional,
  }));

  try {
    const timeoutMs = options.timeoutMs || 30000;
    const body = await postJson(
      "/api/hkjc-match-check",
      {
        hours: options.hours || 72,
        possibleThreshold: options.possibleThreshold,
        openThreshold: options.openThreshold,
        timeoutMs: Math.max(5000, Math.min(timeoutMs - 5000, 20000)),
        matches: requestMatches,
      },
      {
        timeoutMs,
        timeoutMessage: "HKJC 檢查逾時，請稍後再試",
      }
    );
    if ((body.data.errors?.length || 0) && !body.data.hkjcOpenMatches) {
      throw new Error(`HKJC 檢查失敗：${body.data.errors[0]?.error || "未能取得 HKJC 場次"}`);
    }
    if (runId !== state.hkjcMatchCheckRunId) return state.loadedMatches;
    state.hkjcMatchCheck = body.data;
    const checksById = new Map((body.data.checks || []).map((check) => [String(check.matchId), check]));
    const updatedMatches = state.loadedMatches.map((match) => ({
      ...match,
      hkjcCheck: checksById.get(String(match.matchId)) || {
        matchId: match.matchId,
        status: "not_found",
        label: "HKJC 未見",
      },
    }));
    renderMatchList(updatedMatches, { preserveSelection: true });
    const open = body.data.openCount || 0;
    const possible = body.data.possibleCount || 0;
    setStatus(open || possible ? `HKJC 已對照 ${open}+${possible}` : "完成");
    return updatedMatches;
  } catch (error) {
    if (runId !== state.hkjcMatchCheckRunId) return state.loadedMatches;
    state.hkjcMatchCheck = {
      error: error.message,
      checks: [],
    };
    const updatedMatches = state.loadedMatches.map((match) => ({
      ...match,
      hkjcCheck: {
        matchId: match.matchId,
        status: "error",
        label: "HKJC 失敗",
        error: error.message,
      },
    }));
    renderMatchList(updatedMatches, { preserveSelection: true });
    setStatus("HKJC 檢查失敗");
    if (options.rethrow) throw error;
    return updatedMatches;
  }
}

function clearHkjcCheckTimer() {
  if (state.hkjcMatchCheckTimer) {
    window.clearTimeout(state.hkjcMatchCheckTimer);
    state.hkjcMatchCheckTimer = null;
  }
}

function markHkjcCheckTimedOut(runId, message = "HKJC 檢查逾時，請稍後再試") {
  if (runId !== state.hkjcMatchCheckRunId) return;
  const unfinishedStatuses = new Set(["checking", "pending"]);
  const hasUnfinished = state.loadedMatches.some((match) => unfinishedStatuses.has(match.hkjcCheck?.status));
  if (!hasUnfinished) return;
  clearHkjcCheckTimer();
  state.hkjcMatchCheckRunId += 1;

  const updatedMatches = state.loadedMatches.map((match) => {
    if (!unfinishedStatuses.has(match.hkjcCheck?.status)) return match;
    return {
      ...match,
      hkjcCheck: {
        matchId: match.matchId,
        status: "timeout",
        label: "HKJC 逾時",
        error: message,
      },
    };
  });
  state.hkjcMatchCheck = {
    error: message,
    checks: updatedMatches.map((match) => match.hkjcCheck).filter(Boolean),
  };
  renderMatchList(updatedMatches, { preserveSelection: true });
  setStatus("HKJC 檢查逾時");
}

async function loadMatches(options = {}) {
  setStatus("載入中");
  clearHkjcCheckTimer();
  state.hkjcMatchCheckRunId += 1;
  els.matchList.innerHTML = `<div class="empty">載入賽事中...</div>`;
  setMatchButtons(false);

  try {
    const league = els.leagueInput.value.trim();
    const limit = Number(options.limit || 0);
    const limitQuery = limit > 0 ? `&limit=${encodeURIComponent(limit)}` : "";
    let body = await getJson(`/api/matches?league=${encodeURIComponent(league)}${limitQuery}`);
    let fallbackLeague = "";
    if (league && !body.matches.length) {
      fallbackLeague = league;
      body = await getJson(`/api/matches?league=${encodeURIComponent("")}${limitQuery}`);
    }
    const matches = body.matches.map((match) => ({
      ...match,
      hkjcCheck: {
        matchId: match.matchId,
        status: "pending",
        label: "HKJC 待查",
      },
    }));
    renderMatchList(matches);
    if (fallbackLeague && matches.length) {
      els.matchList.insertAdjacentHTML(
        "afterbegin",
        `<div class="match-note">沒有找到「${escapeHtml(fallbackLeague)}」，已改為顯示全部目標聯賽。</div>`
      );
    }
    setStatus("對照 HKJC 中");
    if (!options.skipHkjcAutoCheck) {
      const runId = state.hkjcMatchCheckRunId;
      const timeoutMs = options.hkjcTimeoutMs || 35000;
      state.hkjcMatchCheckTimer = window.setTimeout(() => {
        markHkjcCheckTimedOut(runId);
      }, timeoutMs);
      const checkPromise = checkLoadedMatchesInHkjc(matches, {
        hours: options.hkjcHours || 72,
        timeoutMs: Math.max(5000, timeoutMs - 5000),
        runId,
      });
      state.hkjcMatchCheckPromise = checkPromise.finally(() => {
        if (state.hkjcMatchCheckPromise === checkPromise) {
          state.hkjcMatchCheckPromise = null;
        }
        if (runId === state.hkjcMatchCheckRunId) {
          clearHkjcCheckTimer();
        }
      });
      if (options.awaitHkjc) {
        await state.hkjcMatchCheckPromise;
      }
    }
    return matches;
  } catch (error) {
    state.loadedMatches = [];
    state.loadedMatchesById = new Map();
    state.hkjcMatchCheck = null;
    state.hkjcMatchCheckPromise = null;
    clearHkjcCheckTimer();
    els.matchList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
    if (options.rethrow) throw error;
    return [];
  }
}

async function extract() {
  const ids = parseMatchIds(els.matchIdInput.value);
  if (ids.length !== 1) {
    els.tableWrap.innerHTML = `<div class="error">單場提取請輸入一個 Match ID；多個 ID 請用批量提取。</div>`;
    return;
  }
  const matchId = ids[0];

  setStatus("提取中");
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">提取中...</div>`;

  try {
    const includeMulti = includeMultiEnabled() ? "1" : "0";
    const body = await getJson(
      `/api/extract?matchId=${encodeURIComponent(matchId)}&includeMulti=${includeMulti}&extractionMode=${extractionMode()}`
    );
    state.data = body.data;
    state.batch = null;
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    renderActiveTab();
    setExportButtons(true);
    setStatus("完成");
    loadLocalTitanCache({ silent: true });
  } catch (error) {
    state.data = null;
    state.batch = null;
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function extractBatchLegacy(matches, options = {}) {
  const seen = new Set();
  const normalized = [];
  for (const item of matches) {
    const match = typeof item === "object" ? item : matchById(item);
    const matchId = String(match.matchId || "").trim();
    if (!/^\d+$/.test(matchId) || seen.has(matchId)) continue;
    seen.add(matchId);
    normalized.push({ ...match, matchId });
  }

  if (!normalized.length) {
    els.tableWrap.innerHTML = `<div class="error">請選擇賽事或輸入 Match ID。</div>`;
    return;
  }

  const chunks = chunkArray(normalized, BATCH_EXTRACT_LIMIT);
  setStatus(`批量中 0/${normalized.length} · 每批最多 ${BATCH_EXTRACT_LIMIT} 場`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">批量提取中，已自動分成 ${chunks.length} 批...</div>`;

  try {
    const results = [];
    let localCache = null;
    let localCacheUpdatedCount = 0;
    let completed = 0;

    const publishPartialBatch = () => {
      state.batch = {
        fetchedAt: new Date().toISOString(),
        total: normalized.length,
        okCount: results.filter((result) => result?.ok).length,
        errorCount: results.filter((result) => result && !result.ok).length,
        completedCount: completed,
        partial: completed < normalized.length,
        batchCount: chunks.length,
        chunkSize: BATCH_EXTRACT_LIMIT,
        extractionMode: extractionMode(),
        localCache: localCache
          ? {
              ...localCache,
              updatedCount: localCacheUpdatedCount,
            }
          : null,
        results: [...results],
      };
      state.data = null;
      state.hkjc = null;
      state.probability = null;
      state.titanGuess = null;
      updateSummary();
      renderActiveTab();
      if (results.some((result) => result?.ok && result.data)) {
        setExportButtons(true);
      }
    };

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      setStatus(`批量中 ${completed}/${normalized.length} · 第 ${index + 1}/${chunks.length} 批`);
      if (!results.length) {
        els.tableWrap.innerHTML = `<div class="empty">批量提取中：第 ${index + 1}/${chunks.length} 批，每批最多 ${BATCH_EXTRACT_LIMIT} 場...</div>`;
      }

      try {
        const body = await postJson("/api/extract-batch", {
          matches: chunk,
          includeMulti: includeMultiEnabled(),
          extractionMode: extractionMode(),
          concurrency: options.concurrency || 1,
        });
        results.push(...(body.data.results || []));
        if (body.data.localCache) {
          localCache = body.data.localCache;
          localCacheUpdatedCount += body.data.localCache.updatedCount || 0;
        }
      } catch (error) {
        results.push(
          ...chunk.map((match) => ({
            ok: false,
            matchId: match.matchId,
            match,
            data: null,
            error: `第 ${index + 1} 批失敗：${error.message || error}`,
          }))
        );
      }

      completed += chunk.length;
      publishPartialBatch();
      setStatus(
        completed >= normalized.length
          ? "完成"
          : `已顯示 ${completed}/${normalized.length} · 繼續第 ${Math.min(index + 2, chunks.length)}/${chunks.length} 批`
      );
    }

    publishPartialBatch();
    setExportButtons(true);
    setStatus("完成");
    loadLocalTitanCache({ silent: true });
  } catch (error) {
    state.batch = null;
    state.data = null;
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function extractBatch(matches, options = {}) {
  const seen = new Set();
  const normalized = [];
  for (const item of matches) {
    const match = typeof item === "object" ? item : matchById(item);
    const matchId = String(match.matchId || "").trim();
    if (!/^\d+$/.test(matchId) || seen.has(matchId)) continue;
    seen.add(matchId);
    normalized.push({ ...match, matchId });
  }

  if (!normalized.length) {
    els.tableWrap.innerHTML = `<div class="error">請選擇賽事或輸入 Match ID。</div>`;
    return;
  }

  const chunks = chunkArray(normalized, BATCH_EXTRACT_LIMIT);
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || workerCount()), 3));
  if (els.workerCountInput) els.workerCountInput.value = String(concurrency);
  setStatus(`批量提取 0/${normalized.length} · ${concurrency} worker`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">批量提取中：每次最多 ${BATCH_EXTRACT_LIMIT} 場，現在逐場回傳結果...</div>`;

  try {
    const results = [];
    let localCache = null;
    let localCacheUpdatedCount = 0;
    let completed = 0;
    let nextIndex = 0;

    const publishPartialBatch = () => {
      const orderedResults = [...results].sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));
      state.batch = {
        fetchedAt: new Date().toISOString(),
        total: normalized.length,
        okCount: orderedResults.filter((result) => result?.ok).length,
        errorCount: orderedResults.filter((result) => result && !result.ok).length,
        completedCount: completed,
        partial: completed < normalized.length,
        batchCount: chunks.length,
        chunkSize: BATCH_EXTRACT_LIMIT,
        streamMode: "per_match",
        concurrency,
        extractionMode: extractionMode(),
        localCache: localCache
          ? {
              ...localCache,
              updatedCount: localCacheUpdatedCount,
            }
          : null,
        results: orderedResults,
      };
      state.data = null;
      state.hkjc = null;
      state.probability = null;
      state.titanGuess = null;
      updateSummary();
      renderActiveTab();
      if (orderedResults.some((result) => result?.ok && result.data)) {
        setExportButtons(true);
      }
    };

    const extractOneMatch = async (match, sourceIndex) => {
      const startedAt = Date.now();
      try {
        const body = await postJson("/api/extract-batch", {
          matches: [match],
          includeMulti: includeMultiEnabled(),
          extractionMode: extractionMode(),
          concurrency: 1,
        });
        if (body.data.localCache) {
          localCache = body.data.localCache;
          localCacheUpdatedCount += body.data.localCache.updatedCount || 0;
        }
        const result = (body.data.results || [])[0];
        return result
          ? {
              ...result,
              sourceIndex,
              durationMs: Date.now() - startedAt,
              completedAt: new Date().toISOString(),
              match: { ...match, ...(result.match || {}) },
            }
          : {
              ok: false,
              matchId: match.matchId,
              match,
              data: null,
              sourceIndex,
              durationMs: Date.now() - startedAt,
              completedAt: new Date().toISOString(),
              error: "沒有回傳結果",
            };
      } catch (error) {
        return {
          ok: false,
          matchId: match.matchId,
          match,
          data: null,
          sourceIndex,
          durationMs: Date.now() - startedAt,
          completedAt: new Date().toISOString(),
          error: error.message || String(error),
        };
      }
    };

    const worker = async () => {
      while (nextIndex < normalized.length) {
        const index = nextIndex;
        nextIndex += 1;
        const match = normalized[index];
        setStatus(`批量提取 ${completed}/${normalized.length} · ${concurrency} worker · 正在 ${index + 1}/${normalized.length}`);
        const result = await extractOneMatch(match, index);
        results.push(result);
        completed += 1;
        publishPartialBatch();
        const durationLabel = result.durationMs ? formatDuration(result.durationMs) : "";
        setStatus(
          completed >= normalized.length
            ? `完成 · ${concurrency} worker`
            : `已顯示 ${completed}/${normalized.length} · ${concurrency} worker${durationLabel ? ` · 上場 ${durationLabel}` : ""}`
        );
      }
    };

    publishPartialBatch();
    await Promise.all(Array.from({ length: Math.min(concurrency, normalized.length) }, () => worker()));
    publishPartialBatch();
    setExportButtons(Boolean(results.length));
    setStatus(`完成 · ${concurrency} worker`);
    loadLocalTitanCache({ silent: true });
  } catch (error) {
    state.batch = null;
    state.data = null;
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

function extractBatchFromInput() {
  const ids = parseMatchIds(els.matchIdInput.value);
  extractBatch(ids.map(matchById));
}

function quickLimit() {
  const value = Number(els.quickLimitInput.value || 5);
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(Math.trunc(value), 25));
}

function workerCount() {
  const value = Number(els.workerCountInput?.value || 2);
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(Math.trunc(value), 3));
}

async function quickExtract() {
  const limit = quickLimit();
  const concurrency = workerCount();
  els.quickLimitInput.value = String(limit);
  if (els.workerCountInput) els.workerCountInput.value = String(concurrency);
  setStatus("快速載入");
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">載入前 ${limit} 場賽事...</div>`;

  try {
    const matches = await loadMatches({ limit, rethrow: true });
    if (!matches.length) {
      els.tableWrap.innerHTML = `<div class="empty">沒有可快速提取的賽事</div>`;
      return;
    }

    await extractBatch(matches, { concurrency });
  } catch (error) {
    state.batch = null;
    state.data = null;
    state.hkjc = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function extractHkjcOpenRange({ startHours = 0, endHours = 6, label = "HKJC" } = {}) {
  const concurrency = workerCount();
  if (els.workerCountInput) els.workerCountInput.value = String(concurrency);
  setStatus(`${label}篩選中 · ${concurrency} worker`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">正在載入 Titan 賽事並檢查 HKJC 開場...</div>`;

  try {
    const matches = await loadMatches({ rethrow: true, skipHkjcAutoCheck: true });

    if (!matches.length) {
      els.tableWrap.innerHTML = `<div class="empty">沒有可檢查的 Titan 賽事</div>`;
      setStatus("沒有賽事");
      return;
    }

    if (state.hkjcMatchCheckPromise) {
      setStatus("等待HKJC對照");
      await state.hkjcMatchCheckPromise;
    }

    const upcoming = state.loadedMatches.filter(
      (match) => isNotStartedMatch(match) && isWithinUpcomingHourRange(match, startHours, endHours)
    );
    if (!upcoming.length) {
      els.tableWrap.innerHTML = `<div class="empty">${label} 沒有未開賽的 Titan 目標賽事</div>`;
      setStatus("沒有目標賽事");
      return;
    }

    setStatus(`${label}對照中`);
    await checkLoadedMatchesInHkjc(state.loadedMatches, {
      hours: endHours,
      possibleThreshold: HKJC_EXTRACT_MIN_MATCH_SCORE,
      rethrow: true,
    });

    const targets = hkjcOpenUpcomingMatches(state.loadedMatches, endHours, startHours);
    selectOnlyMatches(targets);

    if (!targets.length) {
      els.tableWrap.innerHTML = `<div class="empty">${label} 沒有 HKJC 已開或 ${HKJC_EXTRACT_MIN_MATCH_SCORE}%+ 疑似的未開賽 Titan 賽事</div>`;
      setStatus("HKJC未開");
      return;
    }

    setStatus(`提取${label} ${targets.length}場 · ${concurrency} worker`);
    await extractBatch(targets, { concurrency });
  } catch (error) {
    state.batch = null;
    state.data = null;
    state.hkjc = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function extractFourHourUpcoming() {
  const concurrency = workerCount();
  if (els.workerCountInput) els.workerCountInput.value = String(concurrency);
  setStatus(`4小時篩選中 · ${concurrency} worker`);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">正在載入未來 4 小時 Titan 賽事，HKJC 未開也會提取...</div>`;

  try {
    await loadMatches({ rethrow: true, skipHkjcAutoCheck: true });

    const targets = state.loadedMatches.filter(
      (match) => isNotStartedMatch(match) && isWithinUpcomingHourRange(match, 0, 4)
    );
    selectOnlyMatches(targets);

    if (!targets.length) {
      els.tableWrap.innerHTML = `<div class="empty">未來 4 小時內沒有未開賽 Titan 目標賽事</div>`;
      setStatus("沒有4小時賽事");
      return;
    }

    setStatus(`提取未來4小時 ${targets.length}場 · ${concurrency} worker`);
    await extractBatch(targets, { concurrency });
  } catch (error) {
    state.batch = null;
    state.data = null;
    state.hkjc = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  }
}

async function extractHkjcSixHourOpen() {
  return extractHkjcOpenRange({ startHours: 0, endHours: 6, label: "6小時HKJC" });
}

function extractHkjcTwelveHourOpen() {
  return extractHkjcOpenRange({ startHours: 6, endHours: 12, label: "6-12小時HKJC" });
}

function extractHkjcEighteenHourOpen() {
  return extractHkjcOpenRange({ startHours: 12, endHours: 18, label: "12-18小時HKJC" });
}

function probabilityTargetMatches() {
  const selected = selectedMatches();
  if (selected.length) return selected;
  if (state.loadedMatches.length) return state.loadedMatches;
  return parseMatchIds(els.matchIdInput.value).map(matchById);
}

async function scanProbabilityEvents() {
  const seen = new Set();
  const baseMatches = [];
  for (const item of probabilityTargetMatches()) {
    const match = typeof item === "object" ? item : matchById(item);
    const matchId = String(match.matchId || "").trim();
    if (!/^\d+$/.test(matchId) || seen.has(matchId)) continue;
    seen.add(matchId);
    baseMatches.push({ ...match, matchId });
  }
  const { range, matches } = filterProbabilityMatchesByWindow(baseMatches);
  if (!matches.length) {
    els.tableWrap.innerHTML = `<div class="error">沒有符合「${escapeHtml(range.label)}」的概率掃描目標。請先載入/選擇賽事，或改回全部時段。</div>`;
    setStatus("沒有目標場次");
    return;
  }

  const chunks = chunkArray(matches, BATCH_EXTRACT_LIMIT);
  const concurrency = workerCount();
  if (els.workerCountInput) els.workerCountInput.value = String(concurrency);
  setStatus(`掃概率 0/${matches.length} · ${concurrency} worker · 每批最多 ${BATCH_EXTRACT_LIMIT} 場`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">正在掃描 Titan007 Mobile 概率事件，已自動分成 ${chunks.length} 批...</div>`;

  try {
    const results = [];
    let completed = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      setStatus(`掃概率 ${completed}/${matches.length} · 第 ${index + 1}/${chunks.length} 批`);
      els.tableWrap.innerHTML = `<div class="empty">概率事件掃描中：第 ${index + 1}/${chunks.length} 批，每批最多 ${BATCH_EXTRACT_LIMIT} 場...</div>`;

      try {
        const body = await postJson("/api/probability-events", {
          matches: chunk,
          threshold: 80,
          concurrency,
        });
        results.push(...(body.data.results || []));
      } catch (error) {
        results.push(
          ...chunk.map((match) => ({
            ok: false,
            matchId: match.matchId,
            match,
            sourcePage: "",
            hits: [],
            error: `第 ${index + 1} 批失敗：${error.message || error}`,
          }))
        );
      }

      completed += chunk.length;
    }

    const hits = results.flatMap((result) => result?.hits || []);
    state.probability = {
      fetchedAt: new Date().toISOString(),
      threshold: 80,
      windowValue: range.value,
      windowLabel: range.label,
      total: matches.length,
      okCount: results.filter((result) => result?.ok).length,
      errorCount: results.filter((result) => result && !result.ok).length,
      noDataCount: results.filter((result) => result?.noData).length,
      hitCount: hits.length,
      matchHitCount: new Set(hits.map((hit) => hit.matchId)).size,
      batchCount: chunks.length,
      chunkSize: BATCH_EXTRACT_LIMIT,
      hits,
      results,
    };
    state.hkjc = null;
    state.batch = null;
    state.data = null;
    state.titanGuess = null;
    updateSummary();
    renderProbabilityTable();
    setExportButtons(true);
    setStatus(`概率80%+ ${state.probability.hitCount || 0}筆`);
  } catch (error) {
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function scanProbabilityEventsPerMatch() {
  const seen = new Set();
  const baseMatches = [];
  for (const item of probabilityTargetMatches()) {
    const match = typeof item === "object" ? item : matchById(item);
    const matchId = String(match.matchId || "").trim();
    if (!/^\d+$/.test(matchId) || seen.has(matchId)) continue;
    seen.add(matchId);
    baseMatches.push({ ...match, matchId });
  }
  const { range, matches } = filterProbabilityMatchesByWindow(baseMatches);

  if (!matches.length) {
    els.tableWrap.innerHTML = `<div class="error">沒有符合「${escapeHtml(range.label)}」的概率掃描目標。請先載入/選取目標賽事，或改回全部時段。</div>`;
    setStatus("未有目標賽事");
    return;
  }

  const chunks = chunkArray(matches, BATCH_EXTRACT_LIMIT);
  const concurrency = Math.max(1, Math.min(workerCount(), matches.length, 3));
  const results = [];
  let completed = 0;
  let nextIndex = 0;

  const publishProbability = () => {
    const orderedResults = [...results].sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));
    const hits = orderedResults.flatMap((result) => result?.hits || []);
    state.probability = {
      fetchedAt: new Date().toISOString(),
      threshold: 80,
      windowValue: range.value,
      windowLabel: range.label,
      total: matches.length,
      okCount: orderedResults.filter((result) => result?.ok).length,
      errorCount: orderedResults.filter((result) => result && !result.ok).length,
      noDataCount: orderedResults.filter((result) => result?.noData).length,
      hitCount: hits.length,
      matchHitCount: new Set(hits.map((hit) => hit.matchId)).size,
      completedCount: completed,
      partial: completed < matches.length,
      batchCount: chunks.length,
      chunkSize: BATCH_EXTRACT_LIMIT,
      streamMode: "per_match",
      concurrency,
      hits,
      results: orderedResults,
    };
    state.hkjc = null;
    state.batch = null;
    state.data = null;
    updateSummary();
    renderProbabilityTable();
    prependProbabilityProgress();
    setExportButtons(Boolean(orderedResults.length || hits.length));
  };

  const scanOneMatch = async (match, sourceIndex) => {
    const startedAt = Date.now();
    try {
      const body = await postJson("/api/probability-events", {
        matches: [match],
        threshold: 80,
        concurrency: 1,
      });
      const result = (body.data.results || [])[0];
      return result
        ? {
            ...result,
            sourceIndex,
            durationMs: Date.now() - startedAt,
            completedAt: new Date().toISOString(),
            match: { ...match, ...(result.match || {}) },
          }
        : {
            ok: false,
            matchId: match.matchId,
            match,
            sourcePage: "",
            hits: [],
            sourceIndex,
            durationMs: Date.now() - startedAt,
            completedAt: new Date().toISOString(),
            error: "沒有收到 Titan007 概率事件回傳",
          };
    } catch (error) {
      return {
        ok: false,
        matchId: match.matchId,
        match,
        sourcePage: "",
        hits: [],
        sourceIndex,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
        error: error.message || String(error),
      };
    }
  };

  const worker = async () => {
    while (nextIndex < matches.length) {
      const index = nextIndex;
      nextIndex += 1;
      const match = matches[index];
      setStatus(`掃概率80% ${completed}/${matches.length} · ${concurrency} worker · 讀取第 ${index + 1} 場`);
      const result = await scanOneMatch(match, index);
      results.push(result);
      completed += 1;
      publishProbability();
      const durationLabel = result.durationMs ? formatDuration(result.durationMs) : "";
      setStatus(
        completed >= matches.length
          ? `概率80%+ ${state.probability.hitCount || 0}筆 · ${concurrency} worker`
          : `掃概率80% ${completed}/${matches.length} · ${concurrency} worker${durationLabel ? ` · 上場 ${durationLabel}` : ""}`
      );
    }
  };

  setStatus(`掃概率80% ${range.label} 0/${matches.length} · ${concurrency} worker`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  try {
    publishProbability();
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    publishProbability();
    setExportButtons(Boolean(results.length));
    setStatus(`概率80%+ ${state.probability.hitCount || 0}筆 · ${concurrency} worker`);
  } catch (error) {
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function scanHkjc() {
  setStatus("掃描中");
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">掃描 HKJC 未來 24 小時賠率...</div>`;

  try {
    const body = await getJson("/api/hkjc-scan?hours=24");
    state.hkjc = body.data;
    state.data = null;
    state.batch = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    renderHkjcTable();
    setExportButtons(true);
    setStatus("完成");
  } catch (error) {
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function scanTitanGuess() {
  setStatus("V猜球掃描中");
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  state.diagnostics = null;
  state.data = null;
  state.batch = null;
  state.hkjc = null;
  state.probability = null;
  state.titanGuess = null;
  updateSummary();
  els.tableWrap.innerHTML = `<div class="empty">正在讀取 Titan007 V猜球總頁，篩選目標賽事...</div>`;

  try {
    const body = await getJson("/api/titan-guess-scan?limit=120&threshold=70&timeoutMs=60000&attempts=1");
    state.titanGuess = body.data;
    updateSummary();
    renderTitanGuessTable();
    setExportButtons(true);
    setStatus(`V猜球 ${state.titanGuess.hitCount || 0}/${state.titanGuess.total || 0}${state.titanGuess.fromCache ? " 快取" : ""}`);
  } catch (error) {
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("V猜球錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function scanHkjcSpecialOdds() {
  const label = "HKJC 指定賠率";
  setStatus(`${label}掃描中`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">正在掃描未來 24 小時 HKJC 指定賠率...</div>`;

  try {
    const body = await getJson("/api/hkjc-special-odds-scan?hours=24");
    state.hkjc = body.data;
    state.data = null;
    state.batch = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    renderHkjcTable();
    setExportButtons(true);
    setStatus("完成");
  } catch (error) {
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function scanHkjcCrsEqualOdds() {
  const label = "HKJC 波膽同賠率";
  setStatus(`${label}掃描中`);
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  els.tableWrap.innerHTML = `<div class="empty">正在掃描 HKJC 全場波膽 CRS 及半場波膽 FCS 同賠率...</div>`;

  try {
    const body = await getJson("/api/hkjc-crs-equal-odds-scan?hours=24");
    state.hkjc = body.data;
    state.data = null;
    state.batch = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    renderHkjcTable();
    setExportButtons(true);
    setStatus("完成");
  } catch (error) {
    state.hkjc = null;
    state.probability = null;
    state.titanGuess = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

async function runNetworkDiagnostics() {
  setStatus("連線診斷中");
  setWorking(true);
  setExportButtons(false);
  clearAnalysis();
  state.diagnostics = null;
  state.data = null;
  state.batch = null;
  state.hkjc = null;
  state.probability = null;
  state.titanGuess = null;
  updateSummary();
  els.tableWrap.innerHTML = `<div class="empty">正在檢查 Titan007 / HKJC 入口、API、盤口頁與出口 IP...</div>`;

  try {
    const body = await getJson("/api/network-diagnostics?timeoutMs=12000");
    state.diagnostics = body.data;
    updateSummary();
    renderDiagnosticsTable();
    const label =
      state.diagnostics.overall === "ok"
        ? "連線正常"
        : state.diagnostics.overall === "warn"
          ? "連線可疑"
          : "連線異常";
    setStatus(label);
  } catch (error) {
    state.diagnostics = null;
    updateSummary();
    els.tableWrap.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("診斷錯誤");
  } finally {
    setWorking(false);
    updateSelectedButton();
  }
}

function flattenTitanItems(items) {
  const rows = [];

  const pushOdds = (match, marketLabel, period, section, market) => {
    const isAsian = market === "asian";
    const firstKey = isAsian ? "homeOdds" : "overOdds";
    const lineKey = isAsian ? "handicap" : "total";
    const lineValueKey = isAsian ? "handicapValue" : "totalValue";
    const thirdKey = isAsian ? "awayOdds" : "underOdds";
    for (const row of section?.rows || []) {
      rows.push({
        matchId: match.matchId,
        league: match.league || "",
        kickoffTime: match.kickoffTime || "",
        state: match.state || "",
        score: match.score || "",
        home: match.home || "",
        away: match.away || "",
        market: marketLabel,
        period,
        bookmaker: row.bookmaker || "",
        bookmakerKey: row.bookmakerKey || "",
        company: row.company,
        companyId: row.companyId,
        isClosed: row.isClosed ? "1" : "0",
        isMultiLine: row.isMultiLine ? "1" : "0",
        multi: row.isMultiLine ? row.multiLabel : "",
        initialHomeOdds: isAsian ? row.initial[firstKey] : "",
        initialHandicap: isAsian ? row.initial[lineKey] : "",
        initialHandicapValue: isAsian ? row.initial[lineValueKey] : "",
        initialAwayOdds: isAsian ? row.initial[thirdKey] : "",
        currentHomeOdds: isAsian ? row.current[firstKey] : "",
        currentHandicap: isAsian ? row.current[lineKey] : "",
        currentHandicapValue: isAsian ? row.current[lineValueKey] : "",
        currentAwayOdds: isAsian ? row.current[thirdKey] : "",
        initialOverOdds: !isAsian ? row.initial[firstKey] : "",
        initialTotal: !isAsian ? row.initial[lineKey] : "",
        initialTotalValue: !isAsian ? row.initial[lineValueKey] : "",
        initialUnderOdds: !isAsian ? row.initial[thirdKey] : "",
        currentOverOdds: !isAsian ? row.current[firstKey] : "",
        currentTotal: !isAsian ? row.current[lineKey] : "",
        currentTotalValue: !isAsian ? row.current[lineValueKey] : "",
        currentUnderOdds: !isAsian ? row.current[thirdKey] : "",
      });
    }
  };

  for (const item of items || []) {
    const { data, match } = item;
    if (!data || !match) continue;
    pushOdds(match, "asian", "full", data.asian?.full, "asian");
    pushOdds(match, "asian", "half", data.asian?.half, "asian");
    pushOdds(match, "over_under", "full", data.overUnder?.full, "overUnder");
    pushOdds(match, "over_under", "half", data.overUnder?.half, "overUnder");

    for (const row of data.europe?.rows || []) {
      rows.push({
        matchId: match.matchId,
        league: match.league || "",
        kickoffTime: match.kickoffTime || "",
        state: match.state || "",
        score: match.score || "",
        home: match.home || "",
        away: match.away || "",
        market: "europe",
        period: "full",
        bookmaker: row.bookmaker || "",
        bookmakerKey: row.bookmakerKey || "",
        company: row.company,
        companyId: row.companyId || "",
        isClosed: "",
        isMultiLine: "",
        multi: "",
        initialWin: row.initial?.win || "",
        initialDraw: row.initial?.draw || "",
        initialLoss: row.initial?.loss || "",
        currentWin: row.current?.win || row.win || "",
        currentDraw: row.current?.draw || row.draw || "",
        currentLoss: row.current?.loss || row.loss || "",
        currentWinRate: row.current?.winRate || row.winRate || "",
        currentDrawRate: row.current?.drawRate || row.drawRate || "",
        currentLossRate: row.current?.lossRate || row.lossRate || "",
        currentReturnRate: row.current?.returnRate || row.returnRate || "",
        kellyWin: row.kellyWin || row.current?.kellyWin || "",
        kellyDraw: row.kellyDraw || row.current?.kellyDraw || "",
        kellyLoss: row.kellyLoss || row.current?.kellyLoss || "",
        changedAt: row.changedAt || "",
      });
    }
  }

  return rows;
}

function flattenForCsv() {
  if (state.hkjc) {
    return sortedHkjcHits();
  }
  if (state.probability) {
    return state.probability.hits || [];
  }
  if (state.titanGuess) {
    return state.titanGuess.matches || [];
  }

  return flattenTitanItems(batchItems());

  const rows = [];

  const pushOdds = (match, marketLabel, period, section, market) => {
    const isAsian = market === "asian";
    const firstKey = isAsian ? "homeOdds" : "overOdds";
    const lineKey = isAsian ? "handicap" : "total";
    const lineValueKey = isAsian ? "handicapValue" : "totalValue";
    const thirdKey = isAsian ? "awayOdds" : "underOdds";
    for (const row of section.rows || []) {
      rows.push({
        matchId: match.matchId,
        league: match.league || "",
        kickoffTime: match.kickoffTime || "",
        state: match.state || "",
        score: match.score || "",
        home: match.home || "",
        away: match.away || "",
        market: marketLabel,
        period,
        bookmaker: row.bookmaker || "",
        bookmakerKey: row.bookmakerKey || "",
        company: row.company,
        companyId: row.companyId,
        isClosed: row.isClosed ? "1" : "0",
        isMultiLine: row.isMultiLine ? "1" : "0",
        multi: row.isMultiLine ? row.multiLabel : "",
        initialHomeOdds: isAsian ? row.initial[firstKey] : "",
        initialHandicap: isAsian ? row.initial[lineKey] : "",
        initialHandicapValue: isAsian ? row.initial[lineValueKey] : "",
        initialAwayOdds: isAsian ? row.initial[thirdKey] : "",
        currentHomeOdds: isAsian ? row.current[firstKey] : "",
        currentHandicap: isAsian ? row.current[lineKey] : "",
        currentHandicapValue: isAsian ? row.current[lineValueKey] : "",
        currentAwayOdds: isAsian ? row.current[thirdKey] : "",
        initialOverOdds: !isAsian ? row.initial[firstKey] : "",
        initialTotal: !isAsian ? row.initial[lineKey] : "",
        initialTotalValue: !isAsian ? row.initial[lineValueKey] : "",
        initialUnderOdds: !isAsian ? row.initial[thirdKey] : "",
        currentOverOdds: !isAsian ? row.current[firstKey] : "",
        currentTotal: !isAsian ? row.current[lineKey] : "",
        currentTotalValue: !isAsian ? row.current[lineValueKey] : "",
        currentUnderOdds: !isAsian ? row.current[thirdKey] : "",
      });
    }
  };

  for (const item of batchItems()) {
    const { data, match } = item;
    pushOdds(match, "asian", "full", data.asian.full, "asian");
    pushOdds(match, "asian", "half", data.asian.half, "asian");
    pushOdds(match, "over_under", "full", data.overUnder.full, "overUnder");
    pushOdds(match, "over_under", "half", data.overUnder.half, "overUnder");

    for (const row of data.europe.rows || []) {
      rows.push({
        matchId: match.matchId,
        league: match.league || "",
        kickoffTime: match.kickoffTime || "",
        state: match.state || "",
        score: match.score || "",
        home: match.home || "",
        away: match.away || "",
        market: "europe",
        period: "full",
        bookmaker: row.bookmaker || "",
        bookmakerKey: row.bookmakerKey || "",
        company: row.company,
        companyId: row.companyId || "",
        isClosed: "",
        isMultiLine: "",
        multi: "",
        initialWin: row.initial?.win || "",
        initialDraw: row.initial?.draw || "",
        initialLoss: row.initial?.loss || "",
        currentWin: row.current?.win || row.win || "",
        currentDraw: row.current?.draw || row.draw || "",
        currentLoss: row.current?.loss || row.loss || "",
        currentWinRate: row.current?.winRate || row.winRate || "",
        currentDrawRate: row.current?.drawRate || row.drawRate || "",
        currentLossRate: row.current?.lossRate || row.lossRate || "",
        currentReturnRate: row.current?.returnRate || row.returnRate || "",
        kellyWin: row.kellyWin || row.current?.kellyWin || "",
        kellyDraw: row.kellyDraw || row.current?.kellyDraw || "",
        kellyLoss: row.kellyLoss || row.current?.kellyLoss || "",
        changedAt: row.changedAt || "",
      });
    }
  }

  return rows;
}

function selectedHkjcHits() {
  if (!state.hkjc) return [];
  const checks = [...els.tableWrap.querySelectorAll(".hkjc-hit-check:checked")];
  const hits = sortedHkjcHits();
  return checks
    .map((input) => hits[Number(input.dataset.index)])
    .filter(Boolean);
}

function currentAnalysisRows() {
  if (state.hkjc) {
    const selected = selectedHkjcHits();
    return selected.length ? selected : sortedHkjcHits();
  }
  return flattenForCsv();
}

function top10PrematchRows(rows) {
  const now = new Date();
  return safeArray(rows).filter((row) => isPrematchTop10Candidate(row, now));
}

function top10PrematchMatches(rows) {
  const ids = new Set(top10PrematchRows(rows).map((row) => normalizeId(row.matchId)).filter(Boolean));
  const now = new Date();
  return batchItems()
    .map((item) => item.match)
    .filter((match) => ids.has(normalizeId(match?.matchId)) && isPrematchTop10Candidate(match, now));
}

function top10ExcludedMatchCount(allRows, prematchRows) {
  const allIds = new Set(safeArray(allRows).map((row) => normalizeId(row.matchId)).filter(Boolean));
  const includedIds = new Set(safeArray(prematchRows).map((row) => normalizeId(row.matchId)).filter(Boolean));
  for (const id of includedIds) allIds.delete(id);
  return allIds.size;
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function rowsForMatchId(matchId) {
  const needle = normalizeId(matchId);
  if (!needle) return [];

  if (state.hkjc) {
    return sortedHkjcHits().filter((hit) =>
      [hit.frontEndId, hit.matchId, hit.rawMatchId].some((value) => normalizeId(value) === needle)
    );
  }
  if (state.probability) {
    return (state.probability.hits || []).filter((hit) => normalizeId(hit.matchId) === needle);
  }
  if (state.titanGuess) {
    return (state.titanGuess.matches || []).filter((match) => normalizeId(match.matchId) === needle);
  }

  return flattenForCsv().filter((row) => normalizeId(row.matchId) === needle);
}

function rowsForCachedMatchId(matchId) {
  const needle = normalizeId(matchId);
  if (!needle) return [];
  return flattenTitanItems(cachedTitanItems().filter((item) => normalizeId(item.match.matchId) === needle));
}

function cachedMatchForId(matchId) {
  const needle = normalizeId(matchId);
  return cachedTitanItems().find((item) => normalizeId(item.match.matchId) === needle)?.match || null;
}

function currentTitanMatchForId(matchId) {
  const needle = normalizeId(matchId);
  return currentTitanTargetItems().find((item) => normalizeId(item.match.matchId) === needle)?.match || null;
}

function selectedAiTarget() {
  const selected = parseTargetOptionValue(els.aiTargetMatchSelect?.value || "");
  if (selected.matchId) return selected;
  return {
    source: "auto",
    matchId: els.aiTargetMatchInput.value.trim(),
  };
}

function rowsForAiTarget(target) {
  if (!target?.matchId) return [];
  if (target.source === "cache") return rowsForCachedMatchId(target.matchId);
  if (target.source === "current") return rowsForMatchId(target.matchId);
  const currentRows = rowsForMatchId(target.matchId);
  return currentRows.length ? currentRows : rowsForCachedMatchId(target.matchId);
}

function matchForAiTarget(target) {
  if (!target?.matchId) return null;
  if (target.source === "cache") return cachedMatchForId(target.matchId);
  return currentTitanMatchForId(target.matchId) || cachedMatchForId(target.matchId);
}

function matchFeatureById(snapshot, matchId) {
  const needle = normalizeId(matchId);
  return (snapshot?.matches || []).find((item) =>
    [item.matchId, item.rawMatchId].some((value) => normalizeId(value) === needle)
  );
}

function currentAnalysisSource() {
  if (state.hkjc) return "hkjc_scan";
  if (state.probability) return "titan_probability_events";
  if (state.titanGuess) return "titan_v_guess";
  if (state.batch) return "titan_batch";
  if (state.data) return "titan_single";
  return "empty";
}

function compactObject(object, keys) {
  const result = {};
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

function compactAnalysisRow(row) {
  if (state.titanGuess || row.asianHomePercent !== undefined || row.overPercent !== undefined) {
    return compactObject(row, [
      "matchId",
      "guessId",
      "league",
      "kickoffTime",
      "state",
      "score",
      "home",
      "away",
      "homeRank",
      "awayRank",
      "asianLine",
      "asianLineOdds",
      "asianCount",
      "asianHomePercent",
      "asianAwayPercent",
      "asianHomeSupportOdds",
      "asianAwaySupportOdds",
      "asianLean",
      "asianEdge",
      "totalLine",
      "totalLineOdds",
      "totalCount",
      "overPercent",
      "underPercent",
      "overSupportOdds",
      "underSupportOdds",
      "totalLean",
      "totalEdge",
      "maxPercent",
      "maxEdge",
      "hot",
      "detailUrl",
      "sourcePage",
    ]);
  }

  if (state.hkjc || row.pool || row.sourcePage) {
    return compactObject(row, [
      "pool",
      "rule",
      "ruleLabel",
      "frontEndId",
      "matchId",
      "rawMatchId",
      "kickOffTime",
      "status",
      "tournament",
      "home",
      "away",
      "line",
      "selection",
      "selectionName",
      "odds",
      "homeOdds",
      "drawOdds",
      "awayOdds",
      "poolStatus",
      "lineStatus",
      "combinationStatus",
      "updateAt",
      "sourcePage",
    ]);
  }

  return compactObject(row, [
    "matchId",
    "league",
    "kickoffTime",
    "state",
    "score",
    "home",
    "away",
    "market",
    "period",
    "bookmaker",
    "bookmakerKey",
    "company",
    "companyId",
    "isClosed",
    "isMultiLine",
    "multi",
    "initialHomeOdds",
    "initialHandicap",
    "initialHandicapValue",
    "initialAwayOdds",
    "currentHomeOdds",
    "currentHandicap",
    "currentHandicapValue",
    "currentAwayOdds",
    "initialOverOdds",
    "initialTotal",
    "initialTotalValue",
    "initialUnderOdds",
    "currentOverOdds",
    "currentTotal",
    "currentTotalValue",
    "currentUnderOdds",
    "initialWin",
    "initialDraw",
    "initialLoss",
    "currentWin",
    "currentDraw",
    "currentLoss",
    "currentWinRate",
    "currentDrawRate",
    "currentLossRate",
    "currentReturnRate",
    "kellyWin",
    "kellyDraw",
    "kellyLoss",
    "changedAt",
  ]);
}

function compactRowsForAi(rows) {
  return rows.map(compactAnalysisRow);
}

const TITAN_MARKET_BUCKETS = [
  { key: "asianFull", market: "asian", period: "full", label: "亞盤 全場" },
  { key: "asianHalf", market: "asian", period: "half", label: "亞盤 半場" },
  { key: "overUnderFull", market: "over_under", period: "full", label: "大小 全場" },
  { key: "overUnderHalf", market: "over_under", period: "half", label: "大小 半場" },
  { key: "europe", market: "europe", period: "full", label: "歐洲賠率" },
];

function emptyTitanMarkets() {
  return TITAN_MARKET_BUCKETS.reduce((markets, bucket) => {
    markets[bucket.key] = {
      label: bucket.label,
      market: bucket.market,
      period: bucket.period,
      rows: [],
    };
    return markets;
  }, {});
}

function titanMarketBucketKey(row) {
  return TITAN_MARKET_BUCKETS.find((bucket) => bucket.market === row.market && bucket.period === row.period)?.key || "";
}

function compactMarketRow(row) {
  const marketRow = { ...row };
  for (const key of ["matchId", "league", "kickoffTime", "state", "score", "home", "away", "market", "period"]) {
    delete marketRow[key];
  }
  return marketRow;
}

function buildTitanMatchGroups(rows) {
  const groupsById = new Map();

  for (const row of rows) {
    const matchId = String(row.matchId || "").trim();
    if (!matchId) continue;

    if (!groupsById.has(matchId)) {
      groupsById.set(matchId, {
        matchId,
        match: compactObject(row, ["matchId", "league", "kickoffTime", "state", "score", "home", "away"]),
        markets: emptyTitanMarkets(),
      });
    }

    const bucketKey = titanMarketBucketKey(row);
    if (!bucketKey) continue;
    groupsById.get(matchId).markets[bucketKey].rows.push(compactMarketRow(row));
  }

  return [...groupsById.values()].map((group) => {
    const marketCounts = {};
    const missingMarkets = [];
    for (const bucket of TITAN_MARKET_BUCKETS) {
      const count = group.markets[bucket.key].rows.length;
      marketCounts[bucket.key] = count;
      if (!count) missingMarkets.push(bucket.label);
    }

    return {
      ...group,
      marketCounts,
      completeMarketCount: TITAN_MARKET_BUCKETS.length - missingMarkets.length,
      missingMarkets,
    };
  });
}

function buildFeatureSnapshot(rowsOverride = null) {
  if (!window.oddsFeatureEngine) return null;
  const rows = rowsOverride || currentAnalysisRows();
  if (!rows.length) return null;
  return window.oddsFeatureEngine.buildFeatureSnapshot({
    source: currentAnalysisSource(),
    rows,
    matches: batchItems().map((item) => item.match),
    hkjc: state.hkjc,
  });
}

function guideStatusLabel() {
  const guide = state.guideStatus;
  if (guide?.available) {
    return `${guide.truncated ? "MD 節錄" : "MD 全量"} · ${guide.includedChars || 0} 字`;
  }
  if (guide) return "MD 未讀到";
  return "MD 檢查中";
}

function frameworkCardsHtml() {
  return ANALYSIS_FRAMEWORK.requiredLayers
    .map(
      (layer) => `
        <div class="framework-card">
          <strong>${escapeHtml(layer.label)}</strong>
          <span>${escapeHtml(layer.instruction)}</span>
        </div>
      `
    )
    .join("");
}

function renderFeaturePanel() {
  if (!els.featurePanel) return;
  const rows = currentAnalysisRows();
  const frameworkCards = frameworkCardsHtml();

  if (!rows.length) {
    state.features = null;
    els.featuresDownloadBtn.disabled = true;
    state.lastPayloadStats = null;
    updateDebugLights();
    els.featurePanel.innerHTML = `
      <div class="feature-grid">
        <div class="feature-card">
          <span>AI 輸入來源</span>
          <strong>等待資料</strong>
        </div>
        <div class="feature-card">
          <span>資料列</span>
          <strong>0</strong>
        </div>
        <div class="feature-card">
          <span>研究藍圖</span>
          <strong>${escapeHtml(guideStatusLabel())}</strong>
        </div>
      <div class="feature-card">
        <span>判斷責任</span>
        <strong>AI</strong>
      </div>
        <div class="feature-card">
          <span>Context</span>
          <strong>${escapeHtml(state.context ? "已補充" : "未補充")}</strong>
        </div>
      <div class="feature-card">
        <span>Prompt</span>
        <strong>${escapeHtml(AI_PROMPT_VERSION)}</strong>
        </div>
      </div>
      <div class="framework-strip">
        ${frameworkCards}
      </div>
      <div class="feature-subhead">
        <strong>AI 輸入資料等待中</strong>
        <span>提取或掃描後，原始 rows 會連同 MD 研究藍圖一併送入 AI。</span>
      </div>
    `;
    return;
  }

  state.features = null;
  els.featuresDownloadBtn.disabled = false;
  const previewPayload = buildAnalysisPayload({ rows, workflow: "preview_input" });
  state.lastPayloadStats = previewPayload.diagnostics;
  const sourceLabel = state.hkjc
    ? "HKJC 掃描"
    : state.probability
      ? "Titan007 概率事件"
      : state.batch
        ? "Titan007 批量"
        : "Titan007 單場";
  const matchCount = state.hkjc
    ? new Set(rows.map((row) => row.frontEndId || row.matchId).filter(Boolean)).size
    : new Set(rows.map((row) => row.matchId).filter(Boolean)).size;
  const markets = state.hkjc
    ? [...new Set(rows.map((row) => row.pool).filter(Boolean))]
    : state.probability
      ? [...new Set(rows.map((row) => row.type).filter(Boolean))]
      : [...new Set(rows.map((row) => row.market).filter(Boolean))];
  const contextLabel = state.context
    ? `${state.context.fixtureMatches?.length || 0} 配對 / ${state.context.missing?.length || 0} 缺`
    : "未補充";

  els.featurePanel.innerHTML = `
    <div class="feature-grid">
      <div class="feature-card">
        <span>AI 輸入來源</span>
        <strong>${escapeHtml(sourceLabel)}</strong>
      </div>
      <div class="feature-card">
        <span>賽事數</span>
        <strong>${escapeHtml(matchCount)}</strong>
      </div>
      <div class="feature-card">
        <span>資料列</span>
        <strong>${escapeHtml(rows.length)}</strong>
      </div>
      <div class="feature-card">
        <span>市場</span>
        <strong>${escapeHtml(markets.length)}</strong>
      </div>
      <div class="feature-card">
        <span>研究藍圖</span>
        <strong>${escapeHtml(guideStatusLabel())}</strong>
      </div>
      <div class="feature-card">
        <span>Context</span>
        <strong>${escapeHtml(contextLabel)}</strong>
      </div>
      <div class="feature-card">
        <span>Prompt</span>
        <strong>${escapeHtml(AI_PROMPT_VERSION)}</strong>
      </div>
      <div class="feature-card">
        <span>估算輸入</span>
        <strong>${escapeHtml(payloadStatsLabel(previewPayload.diagnostics))}</strong>
      </div>
    </div>
    <div class="framework-strip">
      ${frameworkCards}
    </div>
    <div class="feature-subhead">
      <strong>AI 負責全部判斷</strong>
      <span>本地只收集和整理原始資料；Top 10、信心、風險、單場分析全部由 AI 計算。MD 研究藍圖會作為方法參考送入 AI。</span>
    </div>
  `;
  updateDebugLights();
}

function buildAnalysisPayload(options = {}) {
  const rows = options.rows || currentAnalysisRows();
  const source = options.sourceOverride || currentAnalysisSource();
  const isHkjcPayload = source === "hkjc_scan";
  const allRows = options.allRows || (isHkjcPayload ? state.hkjc?.hits || [] : flattenForCsv());
  const compactRows = compactRowsForAi(rows);
  const payloadRows = compactRows.slice(0, MAX_AI_ROWS);
  const matchGroups = isHkjcPayload ? [] : buildTitanMatchGroups(payloadRows);
  const payload = {
    source,
    generatedAt: new Date().toISOString(),
    activeMarketTab: isHkjcPayload ? "" : state.activeTab,
    promptVersion: AI_PROMPT_VERSION,
    structuredSchemaVersion: AI_STRUCTURED_SCHEMA_VERSION,
    workflow: options.workflow || "current_result",
    focusMatchId: options.focusMatchId || "",
    analysisFramework: ANALYSIS_FRAMEWORK,
    guideStatus: state.guideStatus
      ? {
          available: Boolean(state.guideStatus.available),
          title: state.guideStatus.title || "",
          includedChars: state.guideStatus.includedChars || 0,
          totalChars: state.guideStatus.totalChars || 0,
          truncated: Boolean(state.guideStatus.truncated),
          headings: state.guideStatus.headings || [],
        }
      : null,
    compression: {
      mode: isHkjcPayload ? "essential_fields_only" : "match_grouped_essential_fields",
      note: isHkjcPayload
        ? "本地只刪除空欄位與保留 AI 分析必要欄位，不計算信心或風險。"
        : "Titan007 資料會先按同一場賽事分組，再把亞盤全場、亞盤半場、大小全場、大小半場、歐洲賠率放在同一個 matchGroups 物件；本地不計算信心或風險。",
      originalRows: rows.length,
      sentRows: payloadRows.length,
      maxRows: MAX_AI_ROWS,
      omittedRows: Math.max(0, rows.length - payloadRows.length),
    },
    rowCount: payloadRows.length,
    matchGroupCount: matchGroups.length,
    totalAvailableRows: allRows.length,
    truncated: rows.length > MAX_AI_ROWS,
    inputLayout: isHkjcPayload
      ? {
          primary: "rows",
          note: "HKJC 掃描資料以命中 rows 為主。",
        }
      : {
          primary: "matchGroups",
          note: "AI 分析 Titan007 時必須先使用 matchGroups；每個 matchGroups item 已把同場五個市場放在一起。rows 只作 flat fallback。",
          requiredMarketOrder: TITAN_MARKET_BUCKETS.map((bucket) => bucket.label),
        },
    matches: isHkjcPayload ? [] : (options.matchesOverride || batchItems().map((item) => item.match)).slice(0, 50),
    hkjcSummary: isHkjcPayload && state.hkjc
      ? {
          hours: state.hkjc.hours,
          scannedMatches: state.hkjc.scannedMatches,
          hitCount: state.hkjc.hitCount,
          errors: state.hkjc.errors || [],
        }
      : null,
    context: state.context
      ? {
          ...state.context,
          note: "此 context 由 App 透過指定 API 有規則地收集；AI 可使用，但不可自行假裝有未提供資料。",
        }
      : {
          mode: "not_loaded",
          missing: [{ type: "external_context", reason: "使用者未補充 API-Football / Open-Meteo context。" }],
        },
    matchGroups,
    rows: payloadRows,
  };
  payload.diagnostics = estimatePayloadStats(payload);

  return payload;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function scopedContextForMatch(context, matchId) {
  if (!context || context.mode === "not_loaded") return context;
  const sameMatch = (item) => !item?.matchId || normalizeId(item.matchId) === normalizeId(matchId);
  return {
    ...context,
    fixtureMatches: safeArray(context.fixtureMatches).filter(sameMatch),
    injuries: safeArray(context.injuries).filter(sameMatch),
    lineups: safeArray(context.lineups).filter(sameMatch),
    weather: safeArray(context.weather).filter(sameMatch),
    missing: safeArray(context.missing).filter(sameMatch),
    sourceStatus: safeArray(context.sourceStatus).filter(sameMatch),
    note: `${context.note || ""} 已按單場分批，只包含 matchId=${matchId} 相關 context。`.trim(),
  };
}

function chunkMatchTitle(match = {}) {
  return [match.league, [match.home, match.away].filter(Boolean).join(" vs ")].filter(Boolean).join(" · ") || match.matchId || "";
}

function withPayloadDiagnostics(payload) {
  payload.rowCount = safeArray(payload.rows).length;
  payload.matchGroupCount = safeArray(payload.matchGroups).length;
  payload.diagnostics = estimatePayloadStats(payload);
  return payload;
}

function buildTitanChunkPayloads(payload) {
  return safeArray(payload.matchGroups).map((group, index, groups) => {
    const matchId = group.matchId;
    const rows = safeArray(payload.rows).filter((row) => normalizeId(row.matchId) === normalizeId(matchId));
    const matches = safeArray(payload.matches).filter((match) => normalizeId(match.matchId) === normalizeId(matchId));
    return withPayloadDiagnostics({
      ...cloneJson(payload),
      workflow: "chunk_match_scan",
      originalWorkflow: payload.workflow,
      focusMatchId: matchId,
      rows,
      matchGroups: [group],
      matches,
      context: scopedContextForMatch(payload.context, matchId),
      chunk: {
        mode: "per_match",
        index: index + 1,
        total: groups.length,
        matchId,
        matchTitle: chunkMatchTitle(group.match),
      },
    });
  });
}

function hkjcGroupId(row) {
  return row.frontEndId || row.matchId || row.rawMatchId || [row.tournament, row.home, row.away].filter(Boolean).join("|") || "unknown";
}

function buildHkjcChunkPayloads(payload) {
  const groups = new Map();
  for (const row of safeArray(payload.rows)) {
    const id = hkjcGroupId(row);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return [...groups.entries()].map(([id, rows], index, entries) =>
    withPayloadDiagnostics({
      ...cloneJson(payload),
      workflow: "chunk_match_scan",
      originalWorkflow: payload.workflow,
      focusMatchId: id,
      rows,
      matchGroups: [],
      chunk: {
        mode: "per_hkjc_match",
        index: index + 1,
        total: entries.length,
        matchId: id,
        matchTitle: [rows[0]?.tournament, rows[0]?.home, rows[0]?.away].filter(Boolean).join(" · ") || id,
      },
    })
  );
}

function chunkPayloadsForAnalysis(payload) {
  if (!CHUNKED_AI_WORKFLOWS.has(payload.workflow)) return [];
  if (safeArray(payload.matchGroups).length > 1) return buildTitanChunkPayloads(payload);
  if (state.hkjc) return buildHkjcChunkPayloads(payload).filter((item) => safeArray(item.rows).length);
  return [];
}

function summarizeChunkForCombine(chunkPayload, result) {
  const structured = result?.structured || {};
  const top = safeArray(structured.top10)[0] || {};
  const single = structured.singleMatch || {};
  return {
    ok: true,
    matchId: chunkPayload.focusMatchId || top.matchId || single.matchId || "",
    matchTitle: chunkPayload.chunk?.matchTitle || top.matchTitle || single.matchTitle || "",
    rowCount: safeArray(chunkPayload.rows).length,
    marketCounts: chunkPayload.matchGroups?.[0]?.marketCounts || null,
    summary: structuredSummary(structured, result?.output).slice(0, 700),
    confidenceScore: top.confidenceScore ?? single.confidenceScore ?? null,
    conclusion: top.conclusion || single.conclusion || "",
    evidence: safeArray(top.evidence).concat(safeArray(single.layers).map((layer) => layer.finding).filter(Boolean)).slice(0, 5),
    risks: safeArray(top.risks).concat(safeArray(single.risks)).slice(0, 5),
    missingData: safeArray(structured.dataQuality?.missingData).concat(safeArray(single.missingData)).slice(0, 5),
    outputExcerpt: String(result?.output || "").slice(0, 700),
  };
}

function summarizeChunkFailure(chunkPayload, error) {
  return {
    ok: false,
    matchId: chunkPayload.focusMatchId || "",
    matchTitle: chunkPayload.chunk?.matchTitle || chunkPayload.focusMatchId || "",
    rowCount: safeArray(chunkPayload.rows).length,
    error: error.message || String(error),
  };
}

function buildCombinePayload(originalPayload, chunkSummaries) {
  const compactSummaries = chunkSummaries.map((item) => ({
    ok: Boolean(item.ok),
    matchId: item.matchId || "",
    matchTitle: item.matchTitle || "",
    rowCount: item.rowCount || 0,
    marketCounts: item.marketCounts || null,
    summary: String(item.summary || "").slice(0, 520),
    confidenceScore: item.confidenceScore ?? null,
    conclusion: String(item.conclusion || "").slice(0, 260),
    evidence: safeArray(item.evidence).slice(0, 4),
    risks: safeArray(item.risks).slice(0, 4),
    missingData: safeArray(item.missingData).slice(0, 4),
    error: item.error || "",
  }));
  const payload = {
    source: originalPayload.source,
    generatedAt: new Date().toISOString(),
    promptVersion: originalPayload.promptVersion,
    structuredSchemaVersion: originalPayload.structuredSchemaVersion,
    workflow: originalPayload.workflow,
    originalWorkflow: originalPayload.workflow,
    fastCombine: true,
    focusMatchId: "",
    analysisFramework: {
      version: originalPayload.analysisFramework?.version || AI_PROMPT_VERSION,
      note: "Final combine uses AI-generated per-match summaries only to reduce timeout risk.",
    },
    guideStatus: originalPayload.guideStatus,
    inputLayout: {
      primary: "matchSummaries",
      note: "多場賽事已逐場送 AI 初步分析；請根據 matchSummaries 做最終 Top 10 合併排名，不要要求原始全量 rows。",
    },
    chunkedAnalysis: {
      mode: "per_match_then_ai_combine",
      totalChunks: compactSummaries.length,
      successCount: compactSummaries.filter((item) => item.ok).length,
      failedCount: compactSummaries.filter((item) => !item.ok).length,
    },
    matchSummaries: compactSummaries,
    hkjcSummary: originalPayload.hkjcSummary,
    context: {
      mode: "chunked_summary_only",
      note: "context 已在逐場 chunk 階段提供；此階段只做合併排名。",
    },
    rows: [],
    matchGroups: [],
  };
  return withPayloadDiagnostics(payload);
}

function buildCombineFailureData(originalPayload, combinePayload, chunkSummaries, error) {
  const successCount = chunkSummaries.filter((item) => item.ok).length;
  const failedCount = chunkSummaries.length - successCount;
  const output = [
    "## 分批 AI 分析已完成，但最後整合失敗",
    "",
    `已完成分場 AI：${successCount}/${chunkSummaries.length}`,
    `分場失敗：${failedCount}`,
    `最後整合錯誤：${error.message || error}`,
    "",
    "已保留每場 AI 回傳摘要。請按「AI 計 Top 10」重試最後整合，或減少批量場次。",
    "",
    ...chunkSummaries.map((item, index) =>
      `${index + 1}. ${item.matchTitle || item.matchId} - ${item.ok ? item.conclusion || item.summary || "AI 分場完成" : item.error}`
    ),
  ].join("\n");

  const structured = {
    schemaVersion: AI_STRUCTURED_SCHEMA_VERSION,
    workflow: originalPayload.workflow,
    summary: "分場 AI 已完成，但最後 Top 10 整合因連線中斷未完成。",
    dataQuality: {
      level: "high",
      notes: ["final_combine_failed", "per_match_ai_summaries_preserved"],
      missingData: ["final_ai_top10_ranking"],
    },
    top10: [],
    top3Candidates: [],
    highRiskMatches: chunkSummaries
      .filter((item) => !item.ok)
      .map((item) => ({
        matchId: item.matchId,
        matchTitle: item.matchTitle,
        risk: "chunk_failed",
        reason: item.error || "AI 分場失敗",
      })),
  };

  return {
    apiBaseUrl: "",
    apiMode: els.aiApiModeInput?.value || "openai",
    endpoint: "",
    model: els.aiModelInput.value.trim(),
    streamed: false,
    output,
    structured,
    validation: {
      ok: true,
      level: "warn",
      score: 50,
      checks: [
        {
          key: "chunked_per_match",
          label: "分場 AI",
          status: successCount ? "ok" : "error",
          message: `${successCount}/${chunkSummaries.length}`,
        },
        {
          key: "final_combine",
          label: "最後整合",
          status: "warn",
          message: "AI 整合連線中斷，未產生 Top 10",
        },
      ],
      missing: ["final_ai_top10_ranking"],
      warnings: [error.message || String(error)],
    },
    structuredSchemaVersion: AI_STRUCTURED_SCHEMA_VERSION,
    retryCount: 0,
    usage: null,
    createdAt: new Date().toISOString(),
    chunked: true,
    chunkSummaries,
    combinedFromChunks: chunkSummaries.length,
    combineFailed: true,
    combinePayload,
  };
}

async function postAiAnalyzeRequest(payload, apiKey) {
  const body = await postJson("/api/ai/analyze", {
    apiBaseUrl: els.aiBaseUrlInput.value.trim(),
    model: els.aiModelInput.value.trim(),
    apiMode: els.aiApiModeInput?.value || "openai",
    stream: Boolean(els.aiStreamInput?.checked),
    apiKey,
    payload,
  });
  return body.data;
}

function renderChunkProgressOutput(chunkSummaries, totalChunks) {
  const rows = chunkSummaries
    .map(
      (item, index) => `
        <div class="chunk-row ${item.ok ? "ok" : "error"}">
          <strong>${index + 1}. ${escapeHtml(item.matchTitle || item.matchId || "未命名賽事")}</strong>
          <span>${escapeHtml(item.ok ? item.conclusion || item.summary || "已完成" : item.error || "失敗")}</span>
        </div>
      `
    )
    .join("");
  return `
    <div class="chunk-progress-output">
      <strong>分批分析中：${chunkSummaries.length}/${totalChunks} 場完成</strong>
      <span>每場獨立送出，完成後再交給 AI 合併 Top 10。</span>
      ${rows}
    </div>
  `;
}

async function runChunkedAiAnalysis(originalPayload, chunkPayloads, apiKey) {
  const totalSteps = chunkPayloads.length + 1;
  const chunkSummaries = [];
  startAiProgress("分批 AI 分析", totalSteps, `準備逐場送出 ${chunkPayloads.length} 場`);
  els.analysisOutput.innerHTML = renderChunkProgressOutput(chunkSummaries, chunkPayloads.length);

  for (let index = 0; index < chunkPayloads.length; index += 1) {
    const chunkPayload = chunkPayloads[index];
    const title = chunkPayload.chunk?.matchTitle || chunkPayload.focusMatchId || `第 ${index + 1} 場`;
    updateAiProgress(index, totalSteps, `送出第 ${index + 1}/${chunkPayloads.length} 場：${title}`);
    els.analysisMeta.textContent = `分批 ${index + 1}/${chunkPayloads.length} · ${title}`;

    try {
      const result = await postAiAnalyzeRequest(chunkPayload, apiKey);
      chunkSummaries.push(summarizeChunkForCombine(chunkPayload, result));
    } catch (error) {
      chunkSummaries.push(summarizeChunkFailure(chunkPayload, error));
    }

    updateAiProgress(index + 1, totalSteps, `完成第 ${index + 1}/${chunkPayloads.length} 場：${title}`);
    els.analysisOutput.innerHTML = renderChunkProgressOutput(chunkSummaries, chunkPayloads.length);
  }

  const successCount = chunkSummaries.filter((item) => item.ok).length;
  if (!successCount) {
    throw new Error("全部分批 AI 分析都失敗，未能合併結果。");
  }

  const combinePayload = buildCombinePayload(originalPayload, chunkSummaries);
  updateAiProgress(chunkPayloads.length, totalSteps, `合併 ${successCount} 場結果，產生最終 Top 10`);
  els.analysisMeta.textContent = `AI 合併 ${successCount}/${chunkSummaries.length} 場`;
  let finalData;
  try {
    finalData = await postAiAnalyzeRequest(combinePayload, apiKey);
    finishAiProgress(`完成：${successCount}/${chunkSummaries.length} 場成功並已合併`);
  } catch (error) {
    finalData = buildCombineFailureData(originalPayload, combinePayload, chunkSummaries, error);
    finishAiProgress(`分場完成：最後 AI 整合連線中斷`);
  }
  return {
    data: {
      ...finalData,
      chunked: true,
      chunkSummaries,
      combinedFromChunks: chunkSummaries.length,
    },
    combinePayload,
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function summaryToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(summaryToText).filter(Boolean).join("；");
  if (typeof value === "object") {
    const direct =
      value.text ||
      value.summary ||
      value.conclusion ||
      value.recommendation ||
      value.final ||
      value.overview ||
      value.zh ||
      "";
    if (direct) return summaryToText(direct);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function findStructuredCandidates(structured) {
  const top3 = safeArray(structured?.top3Candidates).filter((item) => item?.matchId);
  if (top3.length) return top3.slice(0, 3);
  return safeArray(structured?.top10)
    .filter((item) => item?.matchId)
    .slice(0, 3)
    .map((item) => ({
      matchId: item.matchId,
      matchTitle: item.matchTitle || "",
      question: `要不要單獨分析 ${item.matchTitle || item.matchId}？`,
      reason: item.conclusion || safeArray(item.evidence)[0] || "",
    }));
}

function structuredSummary(structured, fallback = "") {
  return (
    summaryToText(structured?.summary) ||
    summaryToText(structured?.singleMatch?.conclusion) ||
    summaryToText(fallback) ||
    "未有摘要"
  );
}

function analysisHasValidStructuredJson(analysis = state.analysis) {
  return (
    analysis?.structured?.schemaVersion === AI_STRUCTURED_SCHEMA_VERSION &&
    analysis?.validation?.level !== "error"
  );
}

function validationLabel(level) {
  if (level === "ok") return "通過";
  if (level === "warn") return "需留意";
  if (level === "error") return "失敗";
  return "未稽核";
}

function renderValidationPanel(validation = state.analysis?.validation) {
  if (!els.validationPanel) return;
  if (!validation) {
    els.validationPanel.innerHTML = `<div class="empty compact-empty">等待 AI 回傳稽核</div>`;
    return;
  }

  const checks = safeArray(validation.checks)
    .slice(0, 14)
    .map(
      (check) => `
        <div class="validation-check ${escapeHtml(check.status || "pending")}">
          <span></span>
          <strong>${escapeHtml(check.label || check.key || "check")}</strong>
          <em>${escapeHtml(check.message || check.status || "")}</em>
        </div>
      `
    )
    .join("");
  const missing = safeArray(validation.missing).slice(0, 8).join(", ");

  els.validationPanel.innerHTML = `
    <div class="validation-summary ${escapeHtml(validation.level || "pending")}">
      <strong>AI 稽核 ${escapeHtml(validation.score ?? 0)}%</strong>
      <span>${escapeHtml(validationLabel(validation.level))}${missing ? ` · 缺少：${escapeHtml(missing)}` : ""}</span>
    </div>
    <div class="validation-checks">${checks}</div>
  `;
}

function currentAnalysisMatchId() {
  const structured = state.analysis?.structured;
  return (
    structured?.singleMatch?.matchId ||
    safeArray(structured?.top10)[0]?.matchId ||
    safeArray(structured?.top3Candidates)[0]?.matchId ||
    state.analysis?.payloadWorkflow ||
    ""
  );
}

function renderTop10Panel(structured = state.analysis?.structured) {
  if (!els.top10Panel) return;
  const top10 = safeArray(structured?.top10).filter((item) => item?.matchId).slice(0, 10);
  if (!top10.length) {
    els.top10Panel.innerHTML = `<div class="empty compact-empty">等待 AI 排名</div>`;
    return;
  }

  els.top10Panel.innerHTML = top10
    .map((item, index) => {
      const evidence = safeArray(item.evidence).slice(0, 2).join("；");
      const risks = safeArray(item.risks).slice(0, 2).join("；");
      const score = Number.isFinite(Number(item.confidenceScore)) ? Number(item.confidenceScore) : "";
      return `
        <div class="top10-row">
          <div class="top10-rank">${escapeHtml(item.rank || index + 1)}</div>
          <div class="top10-main">
            <strong>${escapeHtml(item.matchTitle || item.matchId)}</strong>
            <span>${escapeHtml(item.conclusion || "")}</span>
            ${evidence ? `<em>證據：${escapeHtml(evidence)}</em>` : ""}
            ${risks ? `<em class="risk-note">風險：${escapeHtml(risks)}</em>` : ""}
          </div>
          <div class="top10-score">${escapeHtml(score)}</div>
          <button class="mini-action analyze-candidate" type="button" data-match-id="${escapeHtml(item.matchId)}">單場</button>
        </div>
      `;
    })
    .join("");
}

function renderTop3Panel(structured = state.analysis?.structured) {
  if (!els.top3Panel) return;
  const candidates = findStructuredCandidates(structured);
  if (!candidates.length) {
    els.top3Panel.innerHTML = `<div class="empty compact-empty">等待 AI Top 10</div>`;
    return;
  }

  els.top3Panel.innerHTML = candidates
    .map(
      (item, index) => `
        <div class="candidate-card">
          <div>
            <strong>${index + 1}. ${escapeHtml(item.matchTitle || item.matchId)}</strong>
            <span>${escapeHtml(item.question || item.reason || "可做單場分析")}</span>
          </div>
          <button class="mini-action analyze-candidate" type="button" data-match-id="${escapeHtml(item.matchId)}">單獨分析</button>
        </div>
      `
    )
    .join("");
}

function renderSingleMatchPanel(structured = state.analysis?.structured) {
  if (!els.singleMatchPanel) return;
  const single = structured?.singleMatch;
  if (!single?.matchId && !safeArray(single?.layers).length) {
    els.singleMatchPanel.innerHTML = `<div class="empty compact-empty">未有單場分析</div>`;
    return;
  }

  const layers = safeArray(single.layers)
    .map(
      (layer) => `
        <div class="layer-card">
          <strong>${escapeHtml(layer.label || layer.key || "分析層")}</strong>
          <span>${escapeHtml(layer.finding || "")}</span>
          ${layer.risk ? `<em>${escapeHtml(layer.risk)}</em>` : ""}
        </div>
      `
    )
    .join("");

  els.singleMatchPanel.innerHTML = `
    <div class="single-summary">
      <strong>${escapeHtml(single.matchTitle || single.matchId || "單場分析")}</strong>
      <span>信心 ${escapeHtml(single.confidenceScore ?? "")}</span>
      <p>${escapeHtml(single.conclusion || "")}</p>
    </div>
    <div class="layer-grid">${layers || `<div class="empty compact-empty">AI 未回傳分層摘要</div>`}</div>
  `;
}

function renderHistoryPanel() {
  if (!els.historyPanel) return;
  if (!state.analysisHistory.length) {
    els.historyPanel.innerHTML = `<div class="empty compact-empty">未有紀錄</div>`;
    return;
  }

  els.historyPanel.innerHTML = state.analysisHistory
    .slice(0, 8)
    .map(
      (item, index) => `
        <div class="history-row">
          <div>
            <strong>${escapeHtml(item.workflow || "AI 分析")}</strong>
            <span>${escapeHtml(new Date(item.createdAt).toLocaleString())} · ${escapeHtml(item.rowCount || 0)} rows · ${escapeHtml(item.schemaVersion || "no-json")}</span>
            <em>${escapeHtml(item.summary || "")}</em>
          </div>
          <button class="mini-action load-history" type="button" data-history-index="${index}">查看</button>
        </div>
      `
    )
    .join("");
}

function saveAnalysisHistory(payload, analysis) {
  const item = {
    id: `analysis-${Date.now()}`,
    createdAt: analysis.createdAt || new Date().toISOString(),
    workflow: payload.workflow,
    source: payload.source,
    promptVersion: payload.promptVersion,
    schemaVersion: analysis.structured?.schemaVersion || analysis.structuredSchemaVersion || "",
    model: analysis.model || "",
    rowCount: payload.rows.length,
    summary: structuredSummary(analysis.structured, analysis.output).slice(0, 260),
    structured: analysis.structured || null,
    validation: analysis.validation || null,
    output: String(analysis.output || "").slice(0, 20000),
  };
  state.analysisHistory = [item, ...state.analysisHistory].slice(0, MAX_HISTORY_ITEMS);
  saveJsonStorage(AI_HISTORY_STORAGE_KEY, state.analysisHistory);
  renderHistoryPanel();
}

function renderBacktestPanel() {
  if (!els.backtestPanel) return;
  const total = state.backtestRecords.length;
  const hits = state.backtestRecords.filter((item) => item.result === "hit").length;
  const misses = state.backtestRecords.filter((item) => item.result === "miss").length;
  if (!total) {
    els.backtestPanel.innerHTML = `<div class="empty compact-empty">未有紀錄</div>`;
    return;
  }

  const recent = state.backtestRecords
    .slice(0, 5)
    .map(
      (item) => `
        <div class="record-row">
          <strong>${escapeHtml(item.result === "hit" ? "命中" : "未中")}</strong>
          <span>${escapeHtml(item.matchId || item.workflow || "AI 分析")} · ${escapeHtml(new Date(item.createdAt).toLocaleDateString())}</span>
        </div>
      `
    )
    .join("");

  els.backtestPanel.innerHTML = `
    <div class="record-stats">
      <strong>${hits}/${total}</strong>
      <span>命中 ${hits} · 未中 ${misses}</span>
    </div>
    ${recent}
  `;
}

function recordBacktestResult(result) {
  if (!state.analysis) return;
  const record = {
    id: `record-${Date.now()}`,
    createdAt: new Date().toISOString(),
    result,
    workflow: state.analysis.payloadWorkflow || state.analysis.structured?.workflow || "",
    matchId: currentAnalysisMatchId(),
    summary: structuredSummary(state.analysis.structured, state.analysis.output).slice(0, 260),
    promptVersion: AI_PROMPT_VERSION,
    schemaVersion: state.analysis.structured?.schemaVersion || "",
  };
  state.backtestRecords = [record, ...state.backtestRecords].slice(0, MAX_BACKTEST_RECORDS);
  saveJsonStorage(BACKTEST_STORAGE_KEY, state.backtestRecords);
  renderBacktestPanel();
}

function renderAnalysisPanels() {
  renderValidationPanel();
  renderTop10Panel();
  renderTop3Panel();
  renderSingleMatchPanel();
  renderHistoryPanel();
  renderBacktestPanel();
  const hasAnalysis = Boolean(state.analysis?.output);
  if (els.recordHitBtn) els.recordHitBtn.disabled = !hasAnalysis;
  if (els.recordMissBtn) els.recordMissBtn.disabled = !hasAnalysis;
  if (els.aiJsonDownloadBtn) els.aiJsonDownloadBtn.disabled = !analysisHasValidStructuredJson();
}

async function sendAiAnalysis(payload, label = "AI 分析中") {
  const apiKey = els.aiKeyInput.value.trim();
  if (!apiKey) {
    els.analysisOutput.innerHTML = `<div class="error">請先輸入 API Key。</div>`;
    state.lastAiError = "未輸入 API Key";
    updateDebugLights();
    return;
  }

  persistApiKeyIfAllowed();
  state.aiTest = state.aiTest || null;
  state.lastAiError = "";
  state.lastPayloadStats = payload.diagnostics || estimatePayloadStats(payload);
  state.lastAiDurationMs = null;
  updateDebugLights();
  setStatus(label);
  setWorking(true);
  els.analysisMeta.textContent = `送出 ${payload.rows.length} rows · ${payloadStatsLabel(state.lastPayloadStats)}`;
  els.analysisOutput.innerHTML = `<div class="empty">AI 分析中...</div>`;
  const startedAt = Date.now();
  window.clearInterval(aiProgressTimer);
  aiProgressTimer = null;
  state.aiProgress = null;
  if (els.aiProgress) els.aiProgress.hidden = true;

  try {
    const chunkPayloads = chunkPayloadsForAnalysis(payload);
    const bodyData = chunkPayloads.length > 1
      ? (await runChunkedAiAnalysis(payload, chunkPayloads, apiKey)).data
      : await postAiAnalyzeRequest(payload, apiKey);
    state.analysis = {
      ...bodyData,
      rowCount: payload.rows.length,
      payloadWorkflow: payload.workflow,
      payloadStats: state.lastPayloadStats,
    };
    state.lastAiDurationMs = Date.now() - startedAt;
    state.lastAiError = "";
    els.analysisOutput.innerHTML = `<pre>${escapeHtml(bodyData.output || "")}</pre>`;
    els.aiDownloadBtn.disabled = false;
    if (els.aiJsonDownloadBtn) els.aiJsonDownloadBtn.disabled = !analysisHasValidStructuredJson(state.analysis);
    saveAnalysisHistory(payload, state.analysis);
    renderAnalysisPanels();
    updateAnalysisButton();
    setStatus("完成");
  } catch (error) {
    state.analysis = null;
    state.lastAiDurationMs = Date.now() - startedAt;
    state.lastAiError = error.message;
    failAiProgress(error.message);
    els.aiDownloadBtn.disabled = true;
    if (els.aiJsonDownloadBtn) els.aiJsonDownloadBtn.disabled = true;
    els.analysisOutput.innerHTML = renderTechnicalErrorBox("AI 分析失敗", error);
    renderAnalysisPanels();
    setStatus("錯誤");
  } finally {
    setWorking(false);
    updateDebugLights();
  }
}

async function testAiConnection() {
  const apiKey = els.aiKeyInput.value.trim();
  if (!apiKey) {
    state.aiTest = { ok: false, error: "未輸入 API Key" };
    state.lastAiError = "未輸入 API Key";
    els.analysisOutput.innerHTML = `<div class="error">請先輸入 API Key。</div>`;
    updateDebugLights();
    return;
  }

  if (!validBaseUrl()) {
    state.aiTest = { ok: false, error: "Base URL 錯誤" };
    state.lastAiError = "Base URL 錯誤";
    els.analysisOutput.innerHTML = `<div class="error">API Base URL 格式不正確。</div>`;
    updateDebugLights();
    return;
  }

  persistApiKeyIfAllowed();
  state.aiTest = null;
  state.lastAiError = "";
  updateDebugLights();
  setStatus("AI 測試中");
  setWorking(true);
  els.analysisMeta.textContent = "AI 測試";
  els.analysisOutput.innerHTML = `<div class="empty">用最少 token 測試 AI 連線，最多等待 300 秒...</div>`;

  try {
    const body = await postJson("/api/ai/test", {
      apiBaseUrl: els.aiBaseUrlInput.value.trim(),
      model: els.aiModelInput.value.trim(),
      apiMode: els.aiApiModeInput?.value || "openai",
      stream: Boolean(els.aiStreamInput?.checked),
      apiKey,
    });
    state.aiTest = {
      ok: true,
      ...body.data,
    };
    state.lastAiError = "";
    els.analysisOutput.innerHTML = `<pre>${escapeHtml(
      [
        `AI 測試成功`,
        `回應: ${body.data.output}`,
        `延遲: ${body.data.latencyMs}ms`,
        `Model: ${body.data.model}`,
        `API 格式: ${body.data.apiMode || "openai"}`,
        `Stream: ${body.data.streamed ? "yes" : "no"}`,
        `Endpoint: ${body.data.endpoint || body.data.apiBaseUrl || ""}`,
      ].join("\n")
    )}</pre>`;
    setStatus("完成");
  } catch (error) {
    state.aiTest = { ok: false, error: error.message };
    state.lastAiError = error.message;
    els.analysisOutput.innerHTML = renderTechnicalErrorBox("AI 測試失敗", error);
    setStatus("AI 測試失敗");
  } finally {
    setWorking(false);
    updateDebugLights();
  }
}

async function analyzeCurrentResult() {
  const rows = currentAnalysisRows();
  if (!rows.length) return;
  const payload = buildAnalysisPayload({
    rows,
    workflow: "analyze_current_result",
  });
  await sendAiAnalysis(payload, "AI 分析中");
}

async function loadExternalContext() {
  const rows = currentAnalysisRows();
  if (!rows.length) {
    els.analysisOutput.innerHTML = `<div class="error">請先提取 Titan007 賽事資料，再補充 context。</div>`;
    return;
  }
  if (state.hkjc) {
    els.analysisOutput.innerHTML = `<div class="error">HKJC 掃描資料暫不做跨來源 context 配對。</div>`;
    return;
  }

  const apiFootballKey = els.apiFootballKeyInput?.value.trim() || "";
  if (!apiFootballKey) {
    els.analysisOutput.innerHTML = `<div class="error">請先輸入 API-Football Key。</div>`;
    updateDebugLights();
    return;
  }

  persistApiFootballKeyIfAllowed();
  setStatus("補充 Context 中");
  setWorking(true);
  els.analysisOutput.innerHTML = `<div class="empty">正在查 API-Football / Open-Meteo，配對可能需要少少時間...</div>`;
  try {
    const body = await postJson("/api/context", {
      apiFootballKey,
      includeWeather: Boolean(els.includeWeatherInput?.checked),
      timezone: "Asia/Hong_Kong",
      matches: contextMatches(),
    });
    state.context = body.data;
    const matched = state.context.fixtureMatches?.length || 0;
    const missing = state.context.missing?.length || 0;
    els.analysisOutput.innerHTML = `<pre>${escapeHtml(
      [
        `Context 補充完成`,
        `Fixture 配對: ${matched}`,
        `缺少/未配對: ${missing}`,
        `傷停: ${state.context.injuries?.length || 0}`,
        `陣容: ${state.context.lineups?.length || 0}`,
        `天氣: ${state.context.weather?.filter((item) => item.available).length || 0}`,
      ].join("\n")
    )}</pre>`;
    renderFeaturePanel();
    updateAnalysisButton();
    setStatus("完成");
  } catch (error) {
    state.context = null;
    els.analysisOutput.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    setStatus("Context 錯誤");
  } finally {
    setWorking(false);
    updateDebugLights();
  }
}

async function analyzeSpecificMatch(matchId, options = {}) {
  const target = {
    source: options.source || "auto",
    matchId: String(matchId || "").trim(),
  };
  const rows = rowsForAiTarget(target);
  if (!rows.length) {
    els.analysisOutput.innerHTML = `<div class="error">找不到指定場次：${escapeHtml(matchId)}</div>`;
    return;
  }

  const match = matchForAiTarget(target);
  const isCacheTarget = target.source === "cache" || (!rowsForMatchId(target.matchId).length && rowsForCachedMatchId(target.matchId).length);
  const payload = buildAnalysisPayload({
    rows,
    focusMatchId: target.matchId,
    workflow: "single_match_deep_analysis",
    sourceOverride: isCacheTarget ? "titan_local_cache" : undefined,
    matchesOverride: match ? [match] : undefined,
    allRows: rows,
  });
  await sendAiAnalysis(payload, "單場分析中");
}

async function analyzeTargetMatch() {
  const target = selectedAiTarget();
  if (!target.matchId) {
    els.analysisOutput.innerHTML = `<div class="error">請先在下拉選擇已提取/本地保存場次。</div>`;
    return;
  }
  await analyzeSpecificMatch(target.matchId, { source: target.source });
}

function formatFeatureLine(item, index) {
  const teams = [item.home, item.away].filter(Boolean).join(" vs ");
  const title = [item.league, teams || item.matchId].filter(Boolean).join(" · ");
  const flags = (item.flags || []).slice(0, 2).map((flag) => flag.title).join("；") || "暫無明顯警報";
  return `${index + 1}. ${title || item.matchId}\n   信心 ${item.confidenceScore || 0}（${item.confidenceLevel || "低"}）｜風險 ${item.conflictScore || 0}（${item.conflictLevel || "低"}）｜${flags}`;
}

async function analyzeTop10WithAi() {
  const allRows = currentAnalysisRows();
  const rows = top10PrematchRows(allRows);
  const excludedMatchCount = top10ExcludedMatchCount(allRows, rows);
  if (!allRows.length) {
    els.analysisOutput.innerHTML = `<div class="error">未有足夠資料交給 AI 排 Top 10。請先提取或掃描目標資料。</div>`;
    return;
  }
  if (!rows.length) {
    els.analysisOutput.innerHTML = `<div class="error">Top 10 預設只分析未開賽場次；目前結果只包含中場、進行中或完場賽事。</div>`;
    return;
  }

  const payload = buildAnalysisPayload({
    rows,
    allRows,
    matchesOverride: top10PrematchMatches(rows),
    workflow: "top10_ai_ranking",
  });
  payload.top10Filter = {
    mode: "prematch_only",
    includedRows: rows.length,
    excludedMatchCount,
    note: "Top 10 ranking excludes in-play, half-time, finished, postponed, cancelled and past-kickoff matches by default.",
  };
  payload.aiTask = {
    name: "rank_top_10_confidence",
    instruction:
      "請只使用已過濾的未開賽 matchGroups / rows 排名 Top 10；中場、進行中、完場、延期、取消或已過開賽時間的場次已由 App 排除。請由 AI 根據 raw odds 原始資料自行計算信心最高 Top 10，並在最後列出頭 3 場，詢問是否需要單獨分析。不要依賴任何本地排名，因為本地只負責收集資料。",
  };
  renderFeaturePanel();
  await sendAiAnalysis(payload, "AI 排 Top 10 中");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (state.hkjc) {
    const headers = [
      "pool",
      "rule",
      "ruleLabel",
      "frontEndId",
      "matchId",
      "kickOffTime",
      "status",
      "tournament",
      "tournamentCode",
      "home",
      "away",
      "line",
      "selection",
      "selectionName",
      "odds",
      "homeOdds",
      "drawOdds",
      "awayOdds",
      "poolStatus",
      "lineStatus",
      "combinationStatus",
      "updateAt",
      "sourcePage",
    ];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [headers.join(","), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))].join("\n");
  }

  if (state.probability) {
    const headers = [
      "matchId",
      "league",
      "kickoffTime",
      "state",
      "score",
      "home",
      "away",
      "companyName",
      "companyId",
      "market",
      "oddsType",
      "type",
      "percent",
      "description",
      "count",
      "kind",
      "rawLine",
      "sourcePage",
    ];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [headers.join(","), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))].join("\n");
  }

  if (state.titanGuess) {
    const headers = [
      "matchId",
      "guessId",
      "league",
      "kickoffTime",
      "state",
      "score",
      "home",
      "away",
      "homeRank",
      "awayRank",
      "asianLine",
      "asianLineOdds",
      "asianCount",
      "asianHomePercent",
      "asianAwayPercent",
      "asianHomeSupportOdds",
      "asianAwaySupportOdds",
      "asianLean",
      "asianEdge",
      "totalLine",
      "totalLineOdds",
      "totalCount",
      "overPercent",
      "underPercent",
      "overSupportOdds",
      "underSupportOdds",
      "totalLean",
      "totalEdge",
      "maxPercent",
      "maxEdge",
      "hot",
      "detailUrl",
      "sourcePage",
    ];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return [headers.join(","), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))].join("\n");
  }

  const headers = [
    "matchId",
    "league",
    "kickoffTime",
    "state",
    "score",
    "home",
    "away",
    "market",
    "period",
    "bookmaker",
    "bookmakerKey",
    "company",
    "companyId",
    "isClosed",
    "isMultiLine",
    "multi",
    "initialHomeOdds",
    "initialHandicap",
    "initialHandicapValue",
    "initialAwayOdds",
    "currentHomeOdds",
    "currentHandicap",
    "currentHandicapValue",
    "currentAwayOdds",
    "initialOverOdds",
    "initialTotal",
    "initialTotalValue",
    "initialUnderOdds",
    "currentOverOdds",
    "currentTotal",
    "currentTotalValue",
    "currentUnderOdds",
    "initialWin",
    "initialDraw",
    "initialLoss",
    "currentWin",
    "currentDraw",
    "currentLoss",
    "currentWinRate",
    "currentDrawRate",
    "currentLossRate",
    "currentReturnRate",
    "kellyWin",
    "kellyDraw",
    "kellyLoss",
    "changedAt",
  ];
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(","))].join("\n");
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

els.loadMatchesBtn.addEventListener("click", loadMatches);
els.quickExtractBtn.addEventListener("click", quickExtract);
els.probabilityScanBtn.addEventListener("click", scanProbabilityEventsPerMatch);
els.titanGuessScanBtn?.addEventListener("click", scanTitanGuess);
els.extractFourHourBtn?.addEventListener("click", extractFourHourUpcoming);
els.extractHkjcSixHourBtn.addEventListener("click", extractHkjcSixHourOpen);
els.extractHkjcTwelveHourBtn.addEventListener("click", extractHkjcTwelveHourOpen);
els.extractHkjcEighteenHourBtn.addEventListener("click", extractHkjcEighteenHourOpen);
els.extractBtn.addEventListener("click", extract);
els.batchExtractBtn.addEventListener("click", extractBatchFromInput);
els.hkjcSpecialOddsBtn?.addEventListener("click", scanHkjcSpecialOdds);
els.hkjcCrsEqualOddsBtn?.addEventListener("click", scanHkjcCrsEqualOdds);
els.networkDiagnosticsBtn?.addEventListener("click", runNetworkDiagnostics);
els.hkjcScanBtn.addEventListener("click", scanHkjc);
els.aiTestBtn.addEventListener("click", testAiConnection);
els.loadContextBtn.addEventListener("click", loadExternalContext);
els.saveApiFootballKeyBtn.addEventListener("click", () => {
  if (saveApiFootballKeyToStorage()) {
    els.analysisOutput.innerHTML = `<div class="empty">API-Football Key 已儲存在本機瀏覽器。</div>`;
  } else {
    els.analysisOutput.innerHTML = `<div class="error">未能儲存 API-Football Key。</div>`;
  }
});
els.clearApiFootballKeyBtn.addEventListener("click", clearStoredApiFootballKey);
els.saveAiKeyBtn.addEventListener("click", () => {
  if (saveApiKeyToStorage()) {
    els.analysisOutput.innerHTML = `<div class="empty">API Key 已儲存在本機瀏覽器。</div>`;
  } else {
    els.analysisOutput.innerHTML = `<div class="error">未能儲存 API Key。</div>`;
  }
});
els.clearAiKeyBtn.addEventListener("click", clearStoredApiKey);
els.basicTop10Btn.addEventListener("click", analyzeTop10WithAi);
els.aiAnalyzeTargetBtn.addEventListener("click", analyzeTargetMatch);
els.aiAnalyzeBtn.addEventListener("click", analyzeCurrentResult);

els.aiKeyInput.addEventListener("input", () => {
  state.aiKeySaved = localStorageSafe() && window.localStorage.getItem(AI_KEY_STORAGE_KEY) === els.aiKeyInput.value.trim();
  state.aiTest = null;
  updateDebugLights();
});
els.aiKeyInput.addEventListener("change", () => {
  if (els.rememberKeyInput.checked && els.aiKeyInput.value.trim()) {
    saveApiKeyToStorage();
  }
});
els.rememberKeyInput.addEventListener("change", () => {
  if (els.rememberKeyInput.checked && els.aiKeyInput.value.trim()) {
    saveApiKeyToStorage();
  }
  updateDebugLights();
});
els.aiBaseUrlInput.addEventListener("input", () => {
  state.aiTest = null;
  updateDebugLights();
});
els.aiModelInput.addEventListener("input", () => {
  state.aiTest = null;
  updateDebugLights();
});
els.aiApiModeInput?.addEventListener("change", () => {
  state.aiTest = null;
  updateDebugLights();
});
els.aiStreamInput?.addEventListener("change", () => {
  state.aiTest = null;
  updateDebugLights();
});
els.apiFootballKeyInput.addEventListener("input", () => {
  updateAnalysisButton();
  updateDebugLights();
});
els.apiFootballKeyInput.addEventListener("change", () => {
  if (els.rememberApiFootballKeyInput.checked && els.apiFootballKeyInput.value.trim()) {
    saveApiFootballKeyToStorage();
  }
});
els.rememberApiFootballKeyInput.addEventListener("change", () => {
  if (els.rememberApiFootballKeyInput.checked && els.apiFootballKeyInput.value.trim()) {
    saveApiFootballKeyToStorage();
  }
  updateDebugLights();
});
els.includeWeatherInput.addEventListener("change", updateDebugLights);
els.includeMultiInput?.addEventListener("change", saveExtractionOptions);
els.workerCountInput?.addEventListener("change", saveExtractionOptions);
els.probabilityWindowInput?.addEventListener("change", saveExtractionOptions);

els.matchIdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    const ids = parseMatchIds(els.matchIdInput.value);
    if (ids.length > 1) extractBatchFromInput();
    else extract();
  }
});

els.aiTargetMatchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    analyzeTargetMatch();
  }
});

els.aiTargetMatchInput.addEventListener("input", () => {
  if (els.aiTargetMatchSelect) els.aiTargetMatchSelect.value = "";
  updateAnalysisButton();
});

els.aiTargetMatchSelect?.addEventListener("change", () => {
  const target = selectedAiTarget();
  if (target.matchId) {
    els.aiTargetMatchInput.value = target.matchId;
  }
  updateAnalysisButton();
});

els.matchList.addEventListener("click", (event) => {
  const quickButton = event.target.closest(".quick-extract");
  if (!quickButton) return;
  els.matchIdInput.value = quickButton.dataset.id;
  extract();
});

els.matchList.addEventListener("change", (event) => {
  if (!event.target.matches(".match-check")) return;
  updateSelectedButton();
});

els.tableWrap.addEventListener("change", (event) => {
  if (!event.target.matches(".hkjc-hit-check")) return;
  updateAnalysisButton();
});

els.featurePanel.addEventListener("click", (event) => {
  const button = event.target.closest(".single-ai-analyze");
  if (!button) return;
  const matchId = button.dataset.matchId || "";
  els.aiTargetMatchInput.value = matchId;
  if (els.aiTargetMatchSelect) els.aiTargetMatchSelect.value = "";
  analyzeSpecificMatch(matchId);
});

els.top3Panel.addEventListener("click", (event) => {
  const button = event.target.closest(".analyze-candidate");
  if (!button) return;
  const matchId = button.dataset.matchId || "";
  els.aiTargetMatchInput.value = matchId;
  if (els.aiTargetMatchSelect) els.aiTargetMatchSelect.value = "";
  analyzeSpecificMatch(matchId);
});

els.top10Panel.addEventListener("click", (event) => {
  const button = event.target.closest(".analyze-candidate");
  if (!button) return;
  const matchId = button.dataset.matchId || "";
  els.aiTargetMatchInput.value = matchId;
  if (els.aiTargetMatchSelect) els.aiTargetMatchSelect.value = "";
  analyzeSpecificMatch(matchId);
});

els.historyPanel.addEventListener("click", (event) => {
  const button = event.target.closest(".load-history");
  if (!button) return;
  const item = state.analysisHistory[Number(button.dataset.historyIndex)];
  if (!item) return;
  state.analysis = {
    model: item.model,
    output: item.output,
    structured: item.structured,
    validation: item.validation || null,
    createdAt: item.createdAt,
    rowCount: item.rowCount,
    payloadWorkflow: item.workflow,
  };
  els.analysisOutput.innerHTML = `<pre>${escapeHtml(item.output || "")}</pre>`;
  els.aiDownloadBtn.disabled = false;
  if (els.aiJsonDownloadBtn) els.aiJsonDownloadBtn.disabled = !analysisHasValidStructuredJson(state.analysis);
  renderAnalysisPanels();
  updateAnalysisButton();
  updateDebugLights();
});

els.clearHistoryBtn.addEventListener("click", () => {
  if (!window.confirm("確定清除本機 AI 分析歷史？這只會刪除這個瀏覽器內的紀錄。")) return;
  state.analysisHistory = [];
  saveJsonStorage(AI_HISTORY_STORAGE_KEY, state.analysisHistory);
  renderHistoryPanel();
});

els.recordHitBtn.addEventListener("click", () => recordBacktestResult("hit"));
els.recordMissBtn.addEventListener("click", () => recordBacktestResult("miss"));

els.clearBacktestBtn.addEventListener("click", () => {
  if (!window.confirm("確定清除本機命中紀錄？這只會刪除這個瀏覽器內的紀錄。")) return;
  state.backtestRecords = [];
  saveJsonStorage(BACKTEST_STORAGE_KEY, state.backtestRecords);
  renderBacktestPanel();
});

els.selectAllBtn.addEventListener("click", () => {
  for (const input of els.matchList.querySelectorAll(".match-check")) {
    input.checked = true;
  }
  updateSelectedButton();
});

els.clearSelectionBtn.addEventListener("click", () => {
  for (const input of els.matchList.querySelectorAll(".match-check")) {
    input.checked = false;
  }
  updateSelectedButton();
});

els.extractSelectedBtn.addEventListener("click", () => {
  extractBatch(selectedMatches());
});

els.extractLoadedBtn.addEventListener("click", () => {
  extractBatch(state.loadedMatches);
});

els.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  state.activeTab = button.dataset.tab;
  renderActiveTab();
});

els.jsonBtn.addEventListener("click", () => {
  const payload = state.hkjc || state.probability || state.titanGuess || state.batch || state.data;
  if (!payload) return;
  const filename = state.hkjc
    ? `hkjc-scan-${Date.now()}.json`
    : state.probability
      ? `titan007-probability-${Date.now()}.json`
      : state.titanGuess
        ? `titan007-v-guess-${Date.now()}.json`
        : state.batch
          ? `titan007-batch-${Date.now()}.json`
          : `titan007-${state.data.matchId}.json`;
  download(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
});

els.jsonlBtn.addEventListener("click", () => {
  const rows = flattenForCsv();
  if (!rows.length) return;
  const currentTime = filenameTimestamp();
  const filename = state.hkjc
    ? `hkjc-scan-${currentTime}.jsonl`
    : state.probability
      ? `titan007-probability-${currentTime}.jsonl`
      : state.titanGuess
        ? `titan007-v-guess-${currentTime}.jsonl`
        : state.batch
          ? `titan007-batch-${currentTime}.jsonl`
          : `titan007-${state.data.matchId}-${currentTime}.jsonl`;
  download(filename, toJsonl(rows), "application/x-ndjson;charset=utf-8");
});

els.csvBtn.addEventListener("click", () => {
  const rows = flattenForCsv();
  if (!rows.length) return;
  const filename = state.hkjc
    ? `hkjc-scan-${Date.now()}.csv`
    : state.probability
      ? `titan007-probability-${Date.now()}.csv`
      : state.titanGuess
        ? `titan007-v-guess-${Date.now()}.csv`
        : state.batch
          ? `titan007-batch-${Date.now()}.csv`
          : `titan007-${state.data.matchId}.csv`;
  download(filename, toCsv(rows), "text/csv;charset=utf-8");
});

els.aiDownloadBtn.addEventListener("click", () => {
  if (!state.analysis?.output) return;
  const header = [
    `# AI 賠率分析`,
    ``,
    `- Model: ${state.analysis.model || ""}`,
    `- Created: ${state.analysis.createdAt || new Date().toISOString()}`,
    `- Rows: ${state.analysis.rowCount || 0}`,
    ``,
  ].join("\n");
  download(`ai-analysis-${Date.now()}.md`, `${header}${state.analysis.output}`, "text/markdown;charset=utf-8");
});

els.aiJsonDownloadBtn.addEventListener("click", () => {
  if (!analysisHasValidStructuredJson()) return;
  const payload = {
    schemaVersion: state.analysis.structured.schemaVersion,
    promptVersion: AI_PROMPT_VERSION,
    model: state.analysis.model || "",
    createdAt: state.analysis.createdAt || new Date().toISOString(),
    rowCount: state.analysis.rowCount || 0,
    workflow: state.analysis.payloadWorkflow || state.analysis.structured.workflow || "",
    structured: state.analysis.structured,
    validation: state.analysis.validation || null,
    usage: state.analysis.usage || null,
    payloadStats: state.analysis.payloadStats || null,
  };
  download(`ai-analysis-structured-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
});

els.featuresDownloadBtn.addEventListener("click", async () => {
  const rows = currentAnalysisRows();
  const target = selectedAiTarget();
  const targetRows = target.matchId ? rowsForAiTarget(target) : [];
  if (!rows.length && !targetRows.length) return;
  const targetMatch = targetRows.length ? matchForAiTarget(target) : null;
  const isCacheTarget = targetRows.length && (target.source === "cache" || (!rowsForMatchId(target.matchId).length && rowsForCachedMatchId(target.matchId).length));
  const payload = buildAnalysisPayload({
    rows: targetRows.length ? targetRows : rows,
    focusMatchId: targetRows.length ? target.matchId : "",
    workflow: targetRows.length ? "single_match_deep_analysis" : "download_ai_input",
    sourceOverride: isCacheTarget ? "titan_local_cache" : undefined,
    matchesOverride: targetMatch ? [targetMatch] : undefined,
    allRows: targetRows.length ? targetRows : undefined,
  });
  try {
    const body = await postJson("/api/ai/preview-input", { payload });
    download(`ai-input-${Date.now()}.json`, JSON.stringify(body.data, null, 2), "application/json;charset=utf-8");
  } catch (error) {
    els.analysisOutput.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
});

loadLocalAppState();
loadExtractionOptions();
loadStoredApiKey();
loadStoredApiFootballKey();
if (els.promptVersionLabel) {
  els.promptVersionLabel.textContent = AI_PROMPT_VERSION;
}
renderAnalysisPanels();
updateDebugLights();
checkServerHealth();
checkTitanHealth();
checkGuideStatus();
loadLocalTitanCache({ silent: true });
updateSummary();
