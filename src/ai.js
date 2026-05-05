const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");

const DEFAULT_API_BASE_URL = "https://liangjiewis.com/v1";
const DEFAULT_MODEL = "gemini-3.1-pro-preview-thinking";
const DEFAULT_GUIDE_PATH =
  process.env.ANALYSIS_GUIDE_PATH || "C:\\Users\\lamch\\Downloads\\deep-research-report (3).md";
const SINGLE_MATCH_PROMPT_PATH =
  process.env.SINGLE_MATCH_PROMPT_PATH || "C:\\Users\\lamch\\Downloads\\分析prompt.md";
const MAX_GUIDE_CHARS = 22000;
const MAX_SINGLE_MATCH_PROMPT_CHARS = 42000;
const MAX_RESPONSE_CHARS = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 600000;
const TEST_TIMEOUT_MS = 300000;
const AI_RETRY_DELAY_MS = 2500;
const ANALYSIS_RETRY_COUNT = 1;
const USE_STREAMING_CHAT = true;
const GUIDE_STATUS_HEADINGS_LIMIT = 18;
const STRUCTURED_SCHEMA_VERSION = "odds-analysis-v1";
const SINGLE_MATCH_REQUIRED_OUTPUT_KEYS = [
  "match_meta",
  "input_audit",
  "source_audit",
  "pitch_reality",
  "market_truth",
  "convergence",
  "corner_matrix",
  "anomaly_flags",
  "recommendation",
  "charts",
  "missing_fields",
];

const STRUCTURED_OUTPUT_SCHEMA = {
  schemaVersion: STRUCTURED_SCHEMA_VERSION,
  workflow: "payload.workflow",
  summary: "string",
  dataQuality: {
    level: "高/中/低",
    notes: ["string"],
    missingData: ["string"],
  },
  top10: [
    {
      rank: 1,
      matchId: "string",
      matchTitle: "string",
      confidenceScore: 0,
      conclusion: "string",
      evidence: ["string"],
      risks: ["string"],
      needs: ["string"],
    },
  ],
  top3Candidates: [
    {
      matchId: "string",
      matchTitle: "string",
      question: "string",
      reason: "string",
    },
  ],
  singleMatch: {
    matchId: "string",
    matchTitle: "string",
    confidenceScore: 0,
    conclusion: "string",
    layers: [
      {
        key: "field_strength/market_price/resonance_conflict/volatility_risk/play_fit",
        label: "string",
        finding: "string",
        evidence: ["string"],
        risk: "string",
      },
    ],
    playFit: ["string"],
    risks: ["string"],
    missingData: ["string"],
  },
  highRiskMatches: [
    {
      matchId: "string",
      matchTitle: "string",
      risk: "string",
      reason: "string",
    },
  ],
};

const CORE_ANALYSIS_GUIDE = `
你是足球賠率資料分析助手。你只可以根據使用者提供的 Titan007 / HKJC 結構化資料分析，不可假裝已取得 xG、傷停、陣容或新聞等資料。

分析框架要跟隨使用者研究筆記的核心方向：
1. 真實戰力：用已提供的盤口、歐賠、大小球、主客隊、市場時間資料，推斷市場對強弱的隱含看法；缺少技術數據時要明確列為缺口。
2. 真實價格：比較 1X2、亞盤、大小球與不同莊家之間的價格是否一致，留意初盤到即時盤的方向。
3. 衝突警報：找出歐賠與亞盤、大細盤與賽果盤、HKJC 與其他市場之間的矛盾或異常。
4. 波動風險：標記封盤、多盤、盤口大幅移動、低水或高水陷阱、樣本不足、只命中特定 HKJC 賠率但缺少外部佐證等風險。
5. 玩法適配：以主客和、讓球、入球大細、半場/全場角度輸出觀察，不要給保證式投注指令。

本 App 本地只負責收集與整理資料；所有信心、Top 10、風險、衝突、玩法適配等判斷都必須由你根據 payload.rows 原始資料自行計算，不可假設已有本地分析結論。
如果 payload.context 有資料，你可以把 API-Football / Open-Meteo context 納入分析，例如 fixture、傷停、陣容、天氣；如果 context.missing 標明缺資料或未能配對，你必須明確說明，不可自行補完。
如果 payload.workflow 是 single_match_deep_analysis，請只集中分析 focusMatchId，不要分散到其他場次。
如果 payload.workflow 是 top10_ai_ranking，請由你自己根據 raw rows 排出信心最高 Top 10。輸出必須包含：
1. Top 10 表格：排名、Match ID、賽事、信心分 0-100、主要證據、主要風險。
2. 頭 3 場單獨分析候選：逐場用一句話問「要不要單獨分析」。
3. 排名方法：簡短說明你如何平衡資料完整度、市場一致性、衝突警報、盤口波動。
如果 payload.workflow 是 analyze_current_result，請先概括高信心場次與高風險場次，再指出哪些場次值得做單獨分析。

輸出請用繁體中文。每場或每組命中資料盡量包含：結論、證據、風險、仍需補充資料。最後加一句「非投注建議，只是資料分析」。

研究藍圖輸出規格：
- 先列明「資料完整度與限制」，尤其 Titan007/HKJC 沒有提供 xG、傷停、預計陣容、天氣、裁判等資料時必須明確標記，不可自行補完。
- 必須用四層框架回答：真實戰力層、市場真實價格層、共振與衝突層、玩法適配層。
- 風險檢查至少覆蓋：跨莊家一致性、初盤到即時盤方向、歐賠與亞盤是否背離、大小球是否壓縮或放大、封盤/多盤/資料不足。
- 如果有 context，必須增加「外部 context」判讀：傷停是否影響、陣容是否已知、天氣是否可能影響節奏；如果沒有或配對失敗，列為缺口。
- 所有閾值語言，例如 0.80 Shield、1.00+ Trap、15% 漂移、O/U Coffin，只能當成待驗證訊號，不可當成絕對規則。
- Top 10 必須由 AI 自行根據原始 rows 排序；本地 payload 內的 framework 只係分析指引，唔係排名結果。

固定輸出格式：
- 回應開頭必須先輸出一個 valid JSON fenced code block，格式為 \`\`\`json ... \`\`\`。
- JSON 必須可被 JSON.parse 直接解析，使用雙引號，不可加註解、尾逗號或 Markdown。
- JSON schemaVersion 必須是 "${STRUCTURED_SCHEMA_VERSION}"。
- JSON 後面可以再用 Markdown 補充人類可讀分析。
- 若某 workflow 不適用某欄位，請用空陣列或空字串，不要刪除頂層欄位。
- 結構化 schema 參考：
Titan007 payload rule:
- If payload.matchGroups exists, treat it as the primary input, not payload.rows.
- Each matchGroups item is one match and already contains the same match's five market blocks: asianFull, asianHalf, overUnderFull, overUnderHalf, europe.
- Compare those five blocks together before ranking or concluding. Do not rank a single bookmaker row as if it were a separate match.
- If any of the five blocks is missing, mention it in missingData/dataQuality.

${JSON.stringify(STRUCTURED_OUTPUT_SCHEMA, null, 2)}
`;

const GLOBAL_SCAN_GUIDE = `
你是足球賠率資料掃描助手。這個 workflow 只做全局掃描與 Top 10 候選排序，請保持精簡，不要展開單場四軌長報告。

資料規則：
- 只可使用 payload 內提供的 Titan007 / HKJC / context 資料，不可自行假裝取得 xG、傷停、陣容或新聞。
- Titan007 請以 payload.matchGroups 為主；每個 matchGroups item 是一場比賽，內含同場的 asianFull、asianHalf、overUnderFull、overUnderHalf、europe。
- HKJC 掃描請以 payload.rows 的命中資料為主，不要與 Titan007 跨來源合併分析。
- 如果 payload.matchSummaries 存在，代表 App 已經把多場逐場送 AI 初步分析；你必須根據 matchSummaries 做最終合併 Top 10，不要要求原始全量 rows。
- Top 10、信心分、風險、是否值得單場分析全部由 AI 根據輸入資料自行判斷。

輸出規則：
- 回應開頭必須先輸出 valid JSON fenced code block，schemaVersion="${STRUCTURED_SCHEMA_VERSION}"。
- JSON 必須包含 top10、top3Candidates、highRiskMatches、dataQuality。
- JSON 後可用 Markdown 簡短補充排名方法與資料限制。
- 用繁體中文，最後加一句「非投注建議，只是資料分析」。

JSON schema 參考：
${JSON.stringify(STRUCTURED_OUTPUT_SCHEMA, null, 2)}
`;

const FAST_COMBINE_GUIDE = `
你是「Football Odds Batch Result Combiner」。你只負責把已經由 AI 分場分析完成的 matchSummaries 重新排序和整合。
規則：
- 不要重新分析 raw odds，不要臆測新資料，只可使用 payload.matchSummaries。
- 必須由 AI 自己根據 summary、confidenceScore、risks、missingData 判斷 Top 10 和 Top 3。
- 輸出要短，避免長篇 markdown；先給 3 句內中文總結，再給單一 valid JSON fenced block。
- JSON schemaVersion 必須是 "${STRUCTURED_SCHEMA_VERSION}"。
- JSON 必須包含 summary、dataQuality、top10、top3Candidates、highRiskMatches。
- top10 最多 10 場，每場包含 rank、matchId、matchTitle、confidenceScore、conclusion、evidence、risks、needs。
- 如果成功分場太少或資料不足，明確降低 confidence，並在 dataQuality.missingData 標記。
`;

function normalizeApiBaseUrl(value) {
  const raw = String(value || DEFAULT_API_BASE_URL).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AI API Base URL 格式不正確");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("AI API Base URL 只支援 http 或 https");
  }

  return url.toString().replace(/\/+$/, "");
}

function chatCompletionsUrl(apiBaseUrl) {
  const url = new URL(normalizeApiBaseUrl(apiBaseUrl));
  const path = url.pathname.replace(/\/+$/, "");

  if (/\/chat\/completions$/i.test(path)) {
    return url;
  }

  const basePath = path && path !== "/" ? path : "/v1";
  url.pathname = `${basePath}/chat/completions`.replace(/\/{2,}/g, "/");
  url.search = "";
  return url;
}

function normalizeApiMode(value) {
  const mode = String(value || "openai").trim();
  if (mode === "gemini" || mode === "gemini_bearer") return mode;
  return "openai";
}

function geminiGenerateContentUrl(apiBaseUrl, model, apiKey, options = {}) {
  const url = new URL(normalizeApiBaseUrl(apiBaseUrl));
  const path = url.pathname.replace(/\/+$/, "");
  const basePath = path && path !== "/" ? path : options.version === "v1beta" ? "/v1beta" : "/v1";
  url.pathname = `${basePath}/models/${encodeURIComponent(model)}:generateContent`.replace(/\/{2,}/g, "/");
  url.search = "";
  if (options.keyInQuery !== false) {
    url.searchParams.set("key", apiKey);
  }
  return url;
}

function redactApiKeyFromUrl(url) {
  const safeUrl = new URL(url.toString());
  if (safeUrl.searchParams.has("key")) {
    safeUrl.searchParams.set("key", "sk-***");
  }
  return safeUrl.toString();
}

function loadMarkdownGuide() {
  try {
    const raw = fs.readFileSync(DEFAULT_GUIDE_PATH, "utf8");
    return raw.slice(0, MAX_GUIDE_CHARS);
  } catch {
    return "";
  }
}

function extractSingleMatchPromptTemplate(markdown) {
  const raw = String(markdown || "");
  const fenced =
    raw.match(/##\s*可直接執行的主 Prompt 模板[\s\S]*?```text\s*([\s\S]*?)```/i) ||
    raw.match(/```text\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim().slice(0, MAX_SINGLE_MATCH_PROMPT_CHARS);
}

function loadSingleMatchPromptTemplate() {
  try {
    return extractSingleMatchPromptTemplate(fs.readFileSync(SINGLE_MATCH_PROMPT_PATH, "utf8"));
  } catch {
    return `
你是「Football Match Multi-Track Analysis Engine」，任務是對單場足球比賽做可稽核、可追溯、不得臆測的專業分析。
必須先做資料稽核，再分成 The Pitch Reality、The Market Truth、The Convergence、Corner Matrix 四軌分析。
缺少資料必須標記「未指定」，不可自行補完；市場訊號與球場訊號衝突時輸出 observe / no-bet。
輸出 Part A Executive Summary、Part B 詳細分析報告、Part C 決策建議、Part D JSON 結果。
請讀取以下 JSON 作為唯一資料來源：
{{MATCH_INPUT_JSON}}
`;
  }
}

function extractMarkdownHeadings(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .slice(0, GUIDE_STATUS_HEADINGS_LIMIT)
    .map((line) => line.replace(/^#{1,3}\s+/, ""));
}

function getAnalysisGuideStatus() {
  try {
    const raw = fs.readFileSync(DEFAULT_GUIDE_PATH, "utf8");
    const headings = extractMarkdownHeadings(raw);
    return {
      available: true,
      title: headings[0] || "足球賽事 AI 分析 App 的深度研究與產品藍圖",
      sectionCount: headings.length,
      includedChars: Math.min(raw.length, MAX_GUIDE_CHARS),
      totalChars: raw.length,
      maxChars: MAX_GUIDE_CHARS,
      truncated: raw.length > MAX_GUIDE_CHARS,
      headings,
    };
  } catch (error) {
    return {
      available: false,
      title: "",
      sectionCount: 0,
      includedChars: 0,
      totalChars: 0,
      maxChars: MAX_GUIDE_CHARS,
      truncated: false,
      headings: [],
      error: error.message || "未能讀取研究筆記檔案",
    };
  }
}

function stringifyPayload(payload) {
  return JSON.stringify(payload || {}, null, 2);
}

function chooseJsonCandidate(candidates) {
  return (
    candidates.find((candidate) => candidate?.schemaVersion === STRUCTURED_SCHEMA_VERSION) ||
    candidates.find((candidate) => candidate?.match_meta && candidate?.recommendation) ||
    candidates.find((candidate) => candidate?.recommendation) ||
    candidates[0] ||
    null
  );
}

function parseJsonObjectAt(raw, firstBrace) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      try {
        return JSON.parse(raw.slice(firstBrace, index + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function parseJsonObjectFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fencedMatches = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fencedMatches.length) {
    const candidates = [];
    for (const fenced of fencedMatches) {
      const block = fenced[1].trim();
      if (!block.startsWith("{")) continue;
      try {
        candidates.push(JSON.parse(block));
      } catch {
        // Try the next fenced block; single-match reports may include non-JSON fences before Part D.
      }
    }
    const preferred = chooseJsonCandidate(candidates);
    if (preferred) return preferred;
  }

  const candidates = [];
  for (let index = raw.indexOf("{"); index >= 0; index = raw.indexOf("{", index + 1)) {
    const parsed = parseJsonObjectAt(raw, index);
    if (parsed) candidates.push(parsed);
  }

  return chooseJsonCandidate(candidates);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function validationCheck(checks, key, label, status, message = "") {
  checks.push({ key, label, status, message });
}

function validationLevel(checks) {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}

function validationScore(checks) {
  if (!checks.length) return 0;
  const points = checks.reduce((sum, check) => {
    if (check.status === "ok") return sum + 1;
    if (check.status === "warn") return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((points / checks.length) * 100);
}

function validateStructuredAnalysis(structured, workflow = "") {
  const checks = [];
  const missing = [];
  const warnings = [];
  const expectedWorkflow = String(workflow || "");
  const isSingleWorkflow =
    expectedWorkflow === "single_match_deep_analysis" ||
    hasOwn(structured, "pitch_reality") ||
    hasOwn(structured, "market_truth") ||
    hasOwn(structured, "corner_matrix");

  if (!isPlainObject(structured)) {
    return {
      ok: false,
      level: "error",
      score: 0,
      checks: [
        {
          key: "structured_json",
          label: "Part D JSON",
          status: "error",
          message: "AI output does not contain a parseable JSON object.",
        },
      ],
      missing: ["structured_json"],
      warnings: [],
    };
  }

  if (structured.schemaVersion === STRUCTURED_SCHEMA_VERSION) {
    validationCheck(checks, "schemaVersion", "schema version", "ok", STRUCTURED_SCHEMA_VERSION);
  } else {
    validationCheck(
      checks,
      "schemaVersion",
      "schema version",
      "warn",
      `Expected ${STRUCTURED_SCHEMA_VERSION}; got ${structured.schemaVersion || "missing"}.`
    );
    warnings.push("schemaVersion mismatch or missing");
  }

  if (isSingleWorkflow) {
    for (const key of SINGLE_MATCH_REQUIRED_OUTPUT_KEYS) {
      if (hasOwn(structured, key)) {
        validationCheck(checks, key, key, "ok");
      } else {
        validationCheck(checks, key, key, "warn", "Required by single-match prompt, but not found.");
        missing.push(key);
      }
    }

    if (hasOwn(structured, "singleMatch")) {
      validationCheck(checks, "singleMatch", "app singleMatch summary", "ok");
    } else {
      validationCheck(
        checks,
        "singleMatch",
        "app singleMatch summary",
        "warn",
        "App can still show markdown, but compact panel may be limited."
      );
      missing.push("singleMatch");
    }

    const recommendation =
      structured.recommendation?.recommendation ||
      structured.recommendation?.primary_market ||
      structured.singleMatch?.conclusion;
    if (recommendation) {
      validationCheck(checks, "recommendation_value", "decision value", "ok");
    } else {
      validationCheck(checks, "recommendation_value", "decision value", "warn", "No clear bet/lean/observe/no-bet value.");
      missing.push("recommendation.value");
    }
  } else {
    const top10 = Array.isArray(structured.top10) ? structured.top10 : [];
    validationCheck(
      checks,
      "top10",
      "Top 10 array",
      top10.length ? "ok" : "error",
      top10.length ? `${top10.length} item(s)` : "Top 10 ranking is missing."
    );
    if (!top10.length) missing.push("top10");

    validationCheck(
      checks,
      "dataQuality",
      "data quality",
      hasOwn(structured, "dataQuality") ? "ok" : "warn",
      hasOwn(structured, "dataQuality") ? "" : "dataQuality is missing."
    );
    if (!hasOwn(structured, "dataQuality")) missing.push("dataQuality");

    validationCheck(
      checks,
      "top3Candidates",
      "Top 3 follow-up candidates",
      Array.isArray(structured.top3Candidates) ? "ok" : "warn",
      Array.isArray(structured.top3Candidates) ? "" : "top3Candidates is missing."
    );
    if (!Array.isArray(structured.top3Candidates)) missing.push("top3Candidates");
  }

  const level = validationLevel(checks);
  return {
    ok: level !== "error",
    level,
    score: validationScore(checks),
    checks,
    missing: [...new Set(missing)],
    warnings: [...new Set(warnings)],
  };
}

function buildFastCombineMessages(payload) {
  const compactPayload = {
    source: payload?.source || "",
    workflow: payload?.workflow || "",
    originalWorkflow: payload?.originalWorkflow || payload?.workflow || "",
    promptVersion: payload?.promptVersion || "",
    chunkedAnalysis: payload?.chunkedAnalysis || null,
    hkjcSummary: payload?.hkjcSummary || null,
    matchSummaries: asArray(payload?.matchSummaries).map((item) => ({
      ok: Boolean(item.ok),
      matchId: item.matchId || "",
      matchTitle: item.matchTitle || "",
      rowCount: item.rowCount || 0,
      marketCounts: item.marketCounts || null,
      summary: String(item.summary || "").slice(0, 520),
      confidenceScore: item.confidenceScore ?? null,
      conclusion: String(item.conclusion || "").slice(0, 260),
      evidence: asArray(item.evidence).slice(0, 4),
      risks: asArray(item.risks).slice(0, 4),
      missingData: asArray(item.missingData).slice(0, 4),
      error: item.error || "",
    })),
  };

  return [
    {
      role: "system",
      content: FAST_COMBINE_GUIDE,
    },
    {
      role: "user",
      content: `請整合以下分場 AI 結果，輸出 Top 10 / Top 3 / highRiskMatches。\n\n${stringifyPayload(compactPayload)}`,
    },
  ];
}

function buildGlobalScanMessages(payload) {
  if (payload?.fastCombine || payload?.inputLayout?.primary === "matchSummaries") {
    return buildFastCombineMessages(payload);
  }

  const taskLine = payload?.matchSummaries
    ? "請做分批結果合併：根據 payload.matchSummaries 排出最終 Top 10，並挑出頭 3 場詢問是否需要單獨分析。"
    : payload?.workflow === "chunk_match_scan"
      ? "請只掃描這一場，輸出一個精簡但可用於最後合併排名的結構化摘要，不要做單場長報告。"
      : "請做全局掃描，不要做單場長報告。請根據 payload 排出 Top 10，並挑出頭 3 場詢問是否需要單獨分析。";
  return [
    {
      role: "system",
      content: GLOBAL_SCAN_GUIDE,
    },
    {
      role: "user",
      content: `${taskLine}\n\n資料：\n${stringifyPayload(payload)}`,
    },
  ];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unspecifiedIfEmpty(value) {
  if (Array.isArray(value)) return value.length ? value : "未指定";
  if (value && typeof value === "object") return Object.keys(value).length ? value : "未指定";
  return value === undefined || value === null || value === "" ? "未指定" : value;
}

function fieldStatus(value, fallback = "") {
  if (value === "未指定" || value === undefined || value === null || value === "") return fallback || "missing";
  if (Array.isArray(value) && !value.length) return fallback || "missing";
  if (value && typeof value === "object" && !Object.keys(value).length) return fallback || "missing";
  return fallback || "ok";
}

function firstSingleMatchGroup(payload) {
  const focus = String(payload?.focusMatchId || "").trim().toLowerCase();
  return (
    asArray(payload?.matchGroups).find((group) => String(group.matchId || "").trim().toLowerCase() === focus) ||
    asArray(payload?.matchGroups)[0] ||
    null
  );
}

function scopedContextItems(payload, key, matchId) {
  return asArray(payload?.context?.[key]).filter((item) => {
    const itemMatchId = String(item?.matchId || "").trim().toLowerCase();
    return !itemMatchId || itemMatchId === String(matchId || "").trim().toLowerCase();
  });
}

function mapEuropeRows(rows) {
  return asArray(rows).map((row) => ({
    bookmaker: row.bookmaker || row.company || "未指定",
    bookmaker_key: row.bookmakerKey || "",
    open: {
      home: unspecifiedIfEmpty(row.initialWin),
      draw: unspecifiedIfEmpty(row.initialDraw),
      away: unspecifiedIfEmpty(row.initialLoss),
    },
    latest: {
      home: unspecifiedIfEmpty(row.currentWin),
      draw: unspecifiedIfEmpty(row.currentDraw),
      away: unspecifiedIfEmpty(row.currentLoss),
    },
    implied_probability_latest: {
      home_pct: unspecifiedIfEmpty(row.currentWinRate),
      draw_pct: unspecifiedIfEmpty(row.currentDrawRate),
      away_pct: unspecifiedIfEmpty(row.currentLossRate),
    },
    return_rate: unspecifiedIfEmpty(row.currentReturnRate),
    kelly: {
      home: unspecifiedIfEmpty(row.kellyWin),
      draw: unspecifiedIfEmpty(row.kellyDraw),
      away: unspecifiedIfEmpty(row.kellyLoss),
    },
    changed_at: unspecifiedIfEmpty(row.changedAt),
  }));
}

function mapAsianRows(rows, period) {
  return asArray(rows).map((row) => ({
    period,
    bookmaker: row.bookmaker || row.company || "未指定",
    bookmaker_key: row.bookmakerKey || "",
    is_closed: row.isClosed === "1" || row.isClosed === true,
    is_multi_line: row.isMultiLine === "1" || row.isMultiLine === true,
    multi_label: row.multi || "",
    open: {
      home_hk_odds: unspecifiedIfEmpty(row.initialHomeOdds),
      handicap: unspecifiedIfEmpty(row.initialHandicap),
      handicap_value: unspecifiedIfEmpty(row.initialHandicapValue),
      away_hk_odds: unspecifiedIfEmpty(row.initialAwayOdds),
    },
    latest: {
      home_hk_odds: unspecifiedIfEmpty(row.currentHomeOdds),
      handicap: unspecifiedIfEmpty(row.currentHandicap),
      handicap_value: unspecifiedIfEmpty(row.currentHandicapValue),
      away_hk_odds: unspecifiedIfEmpty(row.currentAwayOdds),
    },
  }));
}

function mapTotalsRows(rows, period) {
  return asArray(rows).map((row) => ({
    period,
    bookmaker: row.bookmaker || row.company || "未指定",
    bookmaker_key: row.bookmakerKey || "",
    is_closed: row.isClosed === "1" || row.isClosed === true,
    is_multi_line: row.isMultiLine === "1" || row.isMultiLine === true,
    multi_label: row.multi || "",
    open: {
      over_hk_odds: unspecifiedIfEmpty(row.initialOverOdds),
      total: unspecifiedIfEmpty(row.initialTotal),
      total_value: unspecifiedIfEmpty(row.initialTotalValue),
      under_hk_odds: unspecifiedIfEmpty(row.initialUnderOdds),
    },
    latest: {
      over_hk_odds: unspecifiedIfEmpty(row.currentOverOdds),
      total: unspecifiedIfEmpty(row.currentTotal),
      total_value: unspecifiedIfEmpty(row.currentTotalValue),
      under_hk_odds: unspecifiedIfEmpty(row.currentUnderOdds),
    },
  }));
}

function lineupsToSquad(lineups) {
  const playersByName = new Map();
  for (const lineup of asArray(lineups)) {
    for (const player of [...asArray(lineup.startXI), ...asArray(lineup.substitutes)]) {
      const name = player.name || "";
      if (!name) continue;
      playersByName.set(name, {
        name,
        team: lineup.team || "",
        position: player.position || "",
        source: "api-football-lineups",
      });
    }
  }
  return [...playersByName.values()];
}

function lineupsToProbableXi(lineups) {
  return asArray(lineups).map((lineup) => ({
    team: lineup.team || "未指定",
    formation: unspecifiedIfEmpty(lineup.formation),
    coach: unspecifiedIfEmpty(lineup.coach),
    start_xi: asArray(lineup.startXI).map((player) => ({
      name: player.name || "未指定",
      number: unspecifiedIfEmpty(player.number),
      position: unspecifiedIfEmpty(player.position),
    })),
  }));
}

function buildInputAudit(input) {
  const checks = {
    home_team: fieldStatus(input.match_meta.home_team),
    away_team: fieldStatus(input.match_meta.away_team),
    kickoff_time: fieldStatus(input.match_meta.kickoff_time),
    league: fieldStatus(input.match_meta.league),
    "recent_10_matches.xg": fieldStatus(input.recent_10_matches.xg),
    "recent_10_matches.xga": fieldStatus(input.recent_10_matches.xga),
    "recent_10_matches.actual_goals": fieldStatus(input.recent_10_matches.actual_goals),
    full_squad_list: fieldStatus(input.full_squad_list),
    "injuries/suspensions": fieldStatus(input.injuries_suspensions),
    "odds_1x2_open/live": fieldStatus(input.odds_1x2_open) === "ok" && fieldStatus(input.odds_1x2_live) === "ok" ? "derived" : "missing",
    asian_handicap_series: fieldStatus(input.asian_handicap_series) === "ok" ? "derived" : "missing",
    totals_ou_series: fieldStatus(input.totals_ou_series) === "ok" ? "derived" : "missing",
    possession_pct_recent: fieldStatus(input.possession_pct_recent),
    final_third_penetration_rate: fieldStatus(input.final_third_penetration_rate),
    crosses_frequency: fieldStatus(input.crosses_frequency),
    corners_recent: fieldStatus(input.corners_recent),
    importance_tags: fieldStatus(input.importance_tags),
    in_play_flag: fieldStatus(input.in_play_flag, input.in_play_flag === false ? "ok" : ""),
    hkjc_bet_types_required: fieldStatus(input.hkjc_bet_types_required),
  };
  return checks;
}

function buildSingleMatchInput(payload) {
  const group = firstSingleMatchGroup(payload);
  const match = group?.match || asArray(payload?.matches)[0] || {};
  const matchId = group?.matchId || payload?.focusMatchId || match.matchId || "";
  const markets = group?.markets || {};
  const europe = mapEuropeRows(markets.europe?.rows);
  const asianFull = mapAsianRows(markets.asianFull?.rows, "full");
  const asianHalf = mapAsianRows(markets.asianHalf?.rows, "half");
  const totalsFull = mapTotalsRows(markets.overUnderFull?.rows, "full");
  const totalsHalf = mapTotalsRows(markets.overUnderHalf?.rows, "half");
  const injuries = scopedContextItems(payload, "injuries", matchId);
  const lineups = scopedContextItems(payload, "lineups", matchId);
  const weather = scopedContextItems(payload, "weather", matchId);
  const fixtureMatches = scopedContextItems(payload, "fixtureMatches", matchId);
  const squad = lineupsToSquad(lineups);
  const probableXi = lineupsToProbableXi(lineups);
  const inPlayFlag = match.state && !/未|待|賽前|pre/i.test(String(match.state)) ? true : false;

  const input = {
    match_meta: {
      match_id: unspecifiedIfEmpty(matchId),
      home_team: unspecifiedIfEmpty(match.home),
      away_team: unspecifiedIfEmpty(match.away),
      kickoff_time: unspecifiedIfEmpty(match.kickoffTime),
      league: unspecifiedIfEmpty(match.league),
      state: unspecifiedIfEmpty(match.state),
      current_score: unspecifiedIfEmpty(match.score),
      source: payload?.source || "未指定",
    },
    recent_10_matches: {
      xg: "未指定",
      xga: "未指定",
      actual_goals: "未指定",
      actual_goals_conceded: "未指定",
      xgot_or_psxg: "未指定",
    },
    probable_xi: unspecifiedIfEmpty(probableXi),
    full_squad_list: unspecifiedIfEmpty(squad),
    injuries_suspensions: unspecifiedIfEmpty(injuries),
    odds_1x2_open: unspecifiedIfEmpty(
      europe.map((row) => ({ bookmaker: row.bookmaker, odds: row.open, changed_at: row.changed_at }))
    ),
    odds_1x2_live: unspecifiedIfEmpty(
      europe.map((row) => ({
        bookmaker: row.bookmaker,
        odds: row.latest,
        implied_probability: row.implied_probability_latest,
        return_rate: row.return_rate,
        kelly: row.kelly,
        changed_at: row.changed_at,
      }))
    ),
    asian_handicap_series: unspecifiedIfEmpty([...asianFull, ...asianHalf]),
    totals_ou_series: unspecifiedIfEmpty([...totalsFull, ...totalsHalf]),
    possession_pct_recent: "未指定",
    final_third_penetration_rate: "未指定",
    crosses_frequency: "未指定",
    corners_recent: "未指定",
    line_breaking_passes: "未指定",
    progressive_passes_into_final_third: "未指定",
    importance_tags: "未指定",
    in_play_flag: inPlayFlag,
    live_context: {
      current_score: unspecifiedIfEmpty(match.score),
      minute: "未指定",
      red_cards: "未指定",
      note: inPlayFlag ? "Titan007 顯示可能為走地狀態，但 minute/red_cards 未指定。" : "賽前或未能確認走地。",
    },
    hkjc_bet_types_required: ["HAD", "Handicap HAD", "HiLo", "Corner Taken HiLo"],
    app_context: {
      fixture_matches: unspecifiedIfEmpty(fixtureMatches),
      weather: unspecifiedIfEmpty(weather),
      context_missing: unspecifiedIfEmpty(scopedContextItems(payload, "missing", matchId)),
    },
    source_audit: {
      app_generated_at: new Date().toISOString(),
      payload_workflow: payload?.workflow || "",
      market_counts: group?.marketCounts || {},
      missing_markets: group?.missingMarkets || [],
      row_count: asArray(payload?.rows).length,
      source_priority_note: "Titan007 odds/context are app-provided sources. Any xG, squad, tactical, corner or live-event field not present must remain 未指定.",
    },
    raw_source_excerpt: {
      match_group: group || null,
      rows: asArray(payload?.rows).slice(0, 120),
    },
  };

  input.input_audit = buildInputAudit(input);
  input.missing_fields = Object.entries(input.input_audit)
    .filter(([, status]) => status === "missing")
    .map(([field]) => field);
  input.critical_missing = input.missing_fields.filter((field) =>
    [
      "recent_10_matches.xg",
      "recent_10_matches.xga",
      "recent_10_matches.actual_goals",
      "full_squad_list",
      "injuries/suspensions",
      "possession_pct_recent",
      "final_third_penetration_rate",
      "crosses_frequency",
      "corners_recent",
    ].includes(field)
  );

  return input;
}

function buildCompactSingleMatchMessages(payload) {
  const matchInput = buildSingleMatchInput(payload);
  const inputJson = stringifyPayload(matchInput);

  return [
    {
      role: "system",
      content:
        "You are Football Match Multi-Track Analysis Engine. Use only the provided JSON. Do not guess missing data. Output Traditional Chinese.",
    },
    {
      role: "user",
      content: `連線降載模式：上一輪完整單場 Prompt 可能被中轉或網絡斷開，請保留同一套稽核邏輯但用較精簡輸出完成單場分析。

必須遵守：
1. 先做資料稽核；缺值寫「未指定」，不可臆測。
2. 分析四軌：球場真實戰力、市場真相、共振驗證、角球矩陣。
3. 若市場訊號與球場訊號衝突，輸出 observe / no-bet 或僅低注碼觀察。
4. Part A Executive Summary 2-4 句。
5. Part B 詳細分析可精簡，但要列出關鍵輸入、計算/判定、結論、風險旗標。
6. Part C 必須包含 recommendation、primary_market、secondary_market、risk_level、suggested_stake_pct_of_bankroll、核心原因 3 條以內。
7. Part D 必須是一個 JSON fenced code block，並至少包含：
{
  "schemaVersion": "${STRUCTURED_SCHEMA_VERSION}",
  "workflow": "${payload.workflow || "single_match_deep_analysis"}",
  "match_meta": {},
  "input_audit": {},
  "source_audit": {},
  "pitch_reality": {},
  "market_truth": {},
  "convergence": {},
  "corner_matrix": {},
  "anomaly_flags": [],
  "recommendation": {},
  "charts": {},
  "missing_fields": [],
  "singleMatch": {
    "matchId": "${payload.focusMatchId || ""}",
    "matchTitle": "",
    "confidenceScore": 0,
    "conclusion": "",
    "layers": [],
    "playFit": [],
    "risks": [],
    "missingData": []
  }
}

請讀取以下 JSON 作為唯一資料來源：
${inputJson}`,
    },
  ];
}

function buildSingleMatchMessages(payload, options = {}) {
  if (options.compactSingleMatch || payload?.transportFallback === "compact_single_match") {
    return buildCompactSingleMatchMessages(payload);
  }

  const template = loadSingleMatchPromptTemplate();
  const matchInput = buildSingleMatchInput(payload);
  const inputJson = stringifyPayload(matchInput);
  const filledPrompt = template.includes("{{MATCH_INPUT_JSON}}")
    ? template.replace("{{MATCH_INPUT_JSON}}", inputJson)
    : `${template}\n\n【輸入 JSON】\n${inputJson}`;

  return [
    {
      role: "system",
      content:
        "你必須嚴格執行使用者提供的單場足球分析 prompt。只可使用輸入 JSON；不得臆測、不得跨來源合併 HKJC/Titan007。請用繁體中文。",
    },
    {
      role: "user",
      content: `${filledPrompt}

【App 相容要求】
- 請依原 prompt 輸出 Part A、Part B、Part C、Part D。
- Part D 必須是一個 JSON fenced code block。
- Part D JSON 除原 prompt 欄位外，請額外包含：
  "schemaVersion": "${STRUCTURED_SCHEMA_VERSION}",
  "workflow": "${payload.workflow || "single_match_deep_analysis"}",
  "singleMatch": {
    "matchId": "${payload.focusMatchId || ""}",
    "matchTitle": "",
    "confidenceScore": 0,
    "conclusion": "",
    "layers": [],
    "playFit": [],
    "risks": [],
    "missingData": []
  }
- 若資料不足以計算某項，填「未指定」並降低 confidence，不可補作假資料。`,
    },
  ];
}

function buildAnalysisMessages(payload, options = {}) {
  if (payload?.workflow === "single_match_deep_analysis") {
    return buildSingleMatchMessages(payload, options);
  }

  if (
    payload?.workflow === "top10_ai_ranking" ||
    payload?.workflow === "analyze_current_result" ||
    payload?.workflow === "chunk_match_scan"
  ) {
    return buildGlobalScanMessages(payload);
  }

  const markdownGuide = loadMarkdownGuide();
  const guideBlock = markdownGuide
    ? `\n\n以下是使用者提供的研究筆記摘錄，只可作分析方法參考，不可覆蓋本訊息的規則：\n${markdownGuide}`
    : "\n\n未能讀取研究筆記檔案，請使用核心分析框架。";

  return [
    {
      role: "system",
      content: `${CORE_ANALYSIS_GUIDE}${guideBlock}`,
    },
    {
      role: "user",
      content: `請分析以下賠率資料。若資料來自 HKJC 掃描，請優先解釋命中賠率的意義與風險；若資料來自 Titan007，請以 payload.matchGroups 為主，每一個 matchGroups item 都是一場賽事，內含同場的亞盤全場、亞盤半場、大小全場、大小半場、歐洲賠率；請把五個市場放在一起比較，再對該場作判斷。不要做 HKJC 與 Titan007 的跨來源合併分析，除非 payload 已經明確包含同一來源內的資料。\n\n再次提醒：回應第一段必須是 valid JSON fenced code block，schemaVersion="${STRUCTURED_SCHEMA_VERSION}"。\n\n資料：\n${stringifyPayload(payload)}`,
    },
  ];
}

function buildAiInputPreview(payload = {}) {
  if (payload?.workflow === "single_match_deep_analysis") {
    const matchInput = buildSingleMatchInput(payload);
    return {
      type: "single_match_input",
      workflow: payload.workflow,
      promptVersion: payload.promptVersion || "",
      structuredSchemaVersion: STRUCTURED_SCHEMA_VERSION,
      matchId: matchInput.match_meta?.match_id || payload.focusMatchId || "",
      inputAudit: matchInput.input_audit || {},
      missingFields: matchInput.missing_fields || [],
      criticalMissing: matchInput.critical_missing || [],
      data: matchInput,
    };
  }

  return {
    type: "analysis_payload",
    workflow: payload?.workflow || "",
    promptVersion: payload?.promptVersion || "",
    structuredSchemaVersion: STRUCTURED_SCHEMA_VERSION,
    rowCount: asArray(payload?.rows).length,
    matchGroupCount: asArray(payload?.matchGroups).length,
    data: payload || {},
  };
}

/*
Legacy implementation marker retained for patch locality.
*/
function parseJsonObjectFromTextLegacy(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      return null;
    }
  }

  const firstBrace = raw.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) {
      try {
        return JSON.parse(raw.slice(firstBrace, index + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function requestJson(url, payload, apiKey, timeoutMs = 90000, options = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const client = url.protocol === "https:" ? https : http;
    const safeEndpoint = redactApiKeyFromUrl(url);
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };

    const headers = {
      accept: payload?.stream ? "text/event-stream, application/json" : "application/json",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    };

    if (options.authorization !== false) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const req = client.request(
      url,
      {
        method: "POST",
        headers,
      },
      (res) => {
        let responseText = "";
        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          responseText += chunk;
          if (responseText.length > MAX_RESPONSE_CHARS) {
            finish(new Error("AI 回應過大"));
            req.destroy();
          }
        });

        res.on("end", () => {
          if (payload?.stream && (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) {
            try {
              finish(null, parseStreamingChatCompletion(responseText));
            } catch (error) {
              finish(error);
            }
            return;
          }

          let parsed = null;
          try {
            parsed = responseText ? JSON.parse(responseText) : {};
          } catch {
            const status = res.statusCode ? `HTTP ${res.statusCode}` : "HTTP ?";
            finish(
              new Error(
                `AI endpoint 回應不是 JSON（${status} ${safeEndpoint}）：${responseText.slice(0, 240)}`
              )
            );
            return;
          }

          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            const message = parsed?.error?.message || parsed?.message || `AI HTTP ${res.statusCode}`;
            finish(new Error(`AI HTTP ${res.statusCode}（${safeEndpoint}）：${message}`));
            return;
          }

          finish(null, parsed);
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      finish(new Error(`AI API 逾時（${Math.round(timeoutMs / 1000)} 秒未回應）`));
      req.destroy();
    });

    req.on("error", (error) => {
      if (error?.code === "ECONNRESET" || /socket hang up/i.test(error?.message || "")) {
        finish(
          new Error(
            `AI 連線被中轉或網絡中途斷開（socket hang up）。Endpoint: ${safeEndpoint}`
          )
        );
        return;
      }
      finish(error);
    });
    req.end(body);
  });
}

function isRetryableAiError(error) {
  const message = `${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  return (
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("timeout") ||
    message.includes("逾時") ||
    message.includes("中途斷開")
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJsonWithRetry(url, payload, apiKey, timeoutMs = 90000, options = {}) {
  const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : ANALYSIS_RETRY_COUNT;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requestJson(url, payload, apiKey, timeoutMs, options);
      if (response && typeof response === "object") {
        response.__retryCount = attempt;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableAiError(error)) {
        throw error;
      }
      await delay(AI_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

function parseStreamingChatCompletion(responseText) {
  const raw = String(responseText || "");
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("AI 串流回應沒有內容");
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  let content = "";
  let usage = null;
  let eventCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;

    eventCount += 1;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }

    if (event.error) {
      throw new Error(event.error.message || "AI 串流回應錯誤");
    }

    const choice = event.choices?.[0];
    const deltaContent = choice?.delta?.content;
    const messageContent = choice?.message?.content;
    if (typeof deltaContent === "string") content += deltaContent;
    if (typeof messageContent === "string") content += messageContent;
    if (event.usage) usage = event.usage;
  }

  if (!eventCount) {
    throw new Error(`AI 串流格式不明：${trimmed.slice(0, 240)}`);
  }

  return {
    streamed: true,
    usage,
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

function messageContentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        return part?.text || "";
      })
      .join("");
  }
  return "";
}

function buildGeminiPayloadFromMessages(messages, options = {}) {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => messageContentToText(message.content))
    .filter(Boolean)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: messageContentToText(message.content) }],
    }))
    .filter((item) => item.parts[0].text);

  if (systemText) {
    if (contents[0]?.role === "user") {
      contents[0].parts[0].text = `${systemText}\n\n${contents[0].parts[0].text}`;
    } else {
      contents.unshift({ role: "user", parts: [{ text: systemText }] });
    }
  }

  const payload = { contents };
  if (options.maxCompletionTokens) {
    payload.generationConfig = {
      maxOutputTokens: options.maxCompletionTokens,
      max_completion_tokens: options.maxCompletionTokens,
    };
  }
  return payload;
}

function analysisMaxCompletionTokens(payload = {}, options = {}) {
  if (options.compactSingleMatch || payload?.transportFallback === "compact_single_match") return 4096;
  if (payload?.workflow === "single_match_deep_analysis") return 8192;
  if (payload?.fastCombine || payload?.inputLayout?.primary === "matchSummaries") return 3072;
  if (payload?.workflow === "chunk_match_scan") return 2048;
  if (payload?.workflow === "top10_ai_ranking" || payload?.workflow === "analyze_current_result") return 4096;
  return 4096;
}

function extractAssistantText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        return part?.text || "";
      })
      .join("");
  }

  const geminiParts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiParts)) {
    return geminiParts.map((part) => part?.text || "").join("");
  }

  return "";
}

async function analyzeOddsPayload(options = {}) {
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("請提供 AI API Key");
  }

  const model = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const apiMode = normalizeApiMode(options.apiMode);
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl || DEFAULT_API_BASE_URL);
  const payload = options.payload || {};
  const isGeminiMode = apiMode === "gemini" || apiMode === "gemini_bearer";
  const url =
    apiMode === "gemini"
      ? geminiGenerateContentUrl(apiBaseUrl, model, apiKey)
      : apiMode === "gemini_bearer"
        ? geminiGenerateContentUrl(apiBaseUrl, model, apiKey, { version: "v1beta", keyInQuery: false })
        : chatCompletionsUrl(apiBaseUrl);

  const requestAnalysis = (messages, maxCompletionTokens, requestOptions = {}) =>
    isGeminiMode
      ? requestJsonWithRetry(url, buildGeminiPayloadFromMessages(messages, { maxCompletionTokens }), apiKey, ANALYSIS_TIMEOUT_MS, {
          authorization: apiMode === "gemini_bearer",
          retries: requestOptions.retries ?? ANALYSIS_RETRY_COUNT,
        })
      : requestJsonWithRetry(
          url,
          {
            model,
            messages,
            stream: USE_STREAMING_CHAT,
            max_completion_tokens: maxCompletionTokens,
          },
          apiKey,
          ANALYSIS_TIMEOUT_MS,
          { retries: requestOptions.retries ?? ANALYSIS_RETRY_COUNT }
        );

  let fallbackMode = "";
  let response;
  try {
    response = await requestAnalysis(buildAnalysisMessages(payload), analysisMaxCompletionTokens(payload));
  } catch (error) {
    const canCompactRetry = payload?.workflow === "single_match_deep_analysis" && isRetryableAiError(error);
    if (!canCompactRetry) throw error;

    fallbackMode = "compact_single_match_retry";
    response = await requestAnalysis(
      buildAnalysisMessages(payload, { compactSingleMatch: true }),
      analysisMaxCompletionTokens(payload, { compactSingleMatch: true }),
      { retries: 2 }
    );
  }

  const output = extractAssistantText(response);
  if (!output) {
    throw new Error("AI 回應沒有文字內容");
  }
  const structured = parseJsonObjectFromText(output);

  return {
    apiBaseUrl,
    apiMode,
    endpoint: redactApiKeyFromUrl(url),
    model,
    streamed: Boolean(response.streamed),
    output,
    structured,
    validation: validateStructuredAnalysis(structured, options.payload?.workflow || ""),
    structuredSchemaVersion: STRUCTURED_SCHEMA_VERSION,
    retryCount: response.__retryCount || 0,
    fallbackMode,
    usage: response.usage || null,
    createdAt: new Date().toISOString(),
  };
}

async function testAiConnection(options = {}) {
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) {
    throw new Error("請提供 AI API Key");
  }

  const model = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const apiMode = normalizeApiMode(options.apiMode);
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl || DEFAULT_API_BASE_URL);
  const isGeminiMode = apiMode === "gemini" || apiMode === "gemini_bearer";
  const url =
    apiMode === "gemini"
      ? geminiGenerateContentUrl(apiBaseUrl, model, apiKey)
      : apiMode === "gemini_bearer"
        ? geminiGenerateContentUrl(apiBaseUrl, model, apiKey, { version: "v1beta", keyInQuery: false })
        : chatCompletionsUrl(apiBaseUrl);
  const startedAt = Date.now();
  const testMessages = [
    { role: "system", content: "你是一個有幫助的助手。" },
    { role: "user", content: "Reply OK only." },
  ];
  const response =
    isGeminiMode
      ? await requestJson(
          url,
          buildGeminiPayloadFromMessages(testMessages, { maxCompletionTokens: 16 }),
          apiKey,
          TEST_TIMEOUT_MS,
          { authorization: apiMode === "gemini_bearer" }
        )
      : await requestJson(
          url,
          {
            model,
            stream: USE_STREAMING_CHAT,
            messages: testMessages,
          },
          apiKey,
          TEST_TIMEOUT_MS
        );
  const output = extractAssistantText(response).trim();
  if (!output) {
    throw new Error("AI 測試沒有文字回應");
  }

  return {
    apiBaseUrl,
    apiMode,
    endpoint: redactApiKeyFromUrl(url),
    model,
    streamed: Boolean(response.streamed),
    output: output.slice(0, 80),
    latencyMs: Date.now() - startedAt,
    usage: response.usage || null,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeOddsPayload,
  buildAiInputPreview,
  buildAnalysisMessages,
  getAnalysisGuideStatus,
  normalizeApiBaseUrl,
  parseJsonObjectFromText,
  testAiConnection,
  _internals: {
    CORE_ANALYSIS_GUIDE,
    DEFAULT_GUIDE_PATH,
    GLOBAL_SCAN_GUIDE,
    SINGLE_MATCH_PROMPT_PATH,
    STRUCTURED_OUTPUT_SCHEMA,
    STRUCTURED_SCHEMA_VERSION,
    analysisMaxCompletionTokens,
    buildAiInputPreview,
    buildFastCombineMessages,
    buildGeminiPayloadFromMessages,
    buildGlobalScanMessages,
    buildSingleMatchInput,
    buildSingleMatchMessages,
    chatCompletionsUrl,
    chooseJsonCandidate,
    extractSingleMatchPromptTemplate,
    extractAssistantText,
    geminiGenerateContentUrl,
    loadSingleMatchPromptTemplate,
    normalizeApiMode,
    parseStreamingChatCompletion,
    redactApiKeyFromUrl,
    isRetryableAiError,
    validateStructuredAnalysis,
  },
};
