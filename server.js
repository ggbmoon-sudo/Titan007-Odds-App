const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const {
  checkTitanConnection,
  extractBatchOdds,
  extractMatchOdds,
  fetchLiveMatches,
  normalizeMatchItems,
  parseBoolean,
  scanTitanProbabilityEvents,
} = require("./src/titan");
const { checkTitanMatchesInHkjc, scanHkjcCorrectScoreEqualOdds, scanHkjcOdds } = require("./src/hkjc");
const { analyzeOddsPayload, buildAiInputPreview, getAnalysisGuideStatus, testAiConnection } = require("./src/ai");
const { buildContextForMatches } = require("./src/context");
const { runNetworkDiagnostics } = require("./src/diagnostics");
const { scanTitanGuess } = require("./src/titanGuess");

const HOST = process.env.HOST || "127.0.0.1";
const START_PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_JSON_BODY_BYTES = 6 * 1024 * 1024;
const MAX_BATCH_MATCHES = Number(process.env.MAX_BATCH_MATCHES || 25);
const LOCAL_CACHE_TTL_MS = Number(process.env.LOCAL_SCAN_CACHE_TTL_MS || 2 * 24 * 60 * 60 * 1000);
const LOCAL_CACHE_DIR = path.join(__dirname, ".local-cache");
const LOCAL_CACHE_FILE = path.join(LOCAL_CACHE_DIR, "scan-cache.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendError(res, statusCode, error) {
  sendJson(res, statusCode, {
    ok: false,
    error: error.message || String(error),
  });
}

function boolValue(value) {
  return value === true || parseBoolean(value);
}

function extractionModeValue(value) {
  return String(value || "").toLowerCase() === "deep" ? "deep" : "fast";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_JSON_BODY_BYTES) {
        reject(new Error("JSON body 太大。"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON body 格式不正確。"));
      }
    });

    req.on("error", reject);
  });
}

function matchIdsFromText(value) {
  return String(value || "").match(/\d+/g) || [];
}

function collectBatchMatches(body, searchParams) {
  const matches = [];

  if (Array.isArray(body.matches)) {
    matches.push(...body.matches);
  }

  if (Array.isArray(body.matchIds)) {
    matches.push(...body.matchIds);
  } else if (body.matchIds) {
    matches.push(...matchIdsFromText(body.matchIds));
  }

  if (body.matchId) {
    matches.push(...matchIdsFromText(body.matchId));
  }

  const queryMatchIds = searchParams.get("matchIds") || searchParams.get("matchId") || "";
  if (queryMatchIds) {
    matches.push(...matchIdsFromText(queryMatchIds));
  }

  return normalizeMatchItems(matches);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function emptyScanCache() {
  return {
    version: 1,
    ttlMs: LOCAL_CACHE_TTL_MS,
    updatedAt: "",
    titanExtract: {},
  };
}

function readScanCache() {
  try {
    if (!fs.existsSync(LOCAL_CACHE_FILE)) return emptyScanCache();
    const parsed = JSON.parse(fs.readFileSync(LOCAL_CACHE_FILE, "utf8"));
    return {
      ...emptyScanCache(),
      ...parsed,
      titanExtract: parsed.titanExtract || {},
    };
  } catch {
    return emptyScanCache();
  }
}

function pruneScanCache(cache, now = Date.now()) {
  for (const sectionName of ["titanExtract"]) {
    const section = cache[sectionName] || {};
    for (const [key, entry] of Object.entries(section)) {
      const expiresAt = Date.parse(entry.expiresAt || "");
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        delete section[key];
      }
    }
    cache[sectionName] = section;
  }
  return cache;
}

function writeScanCache(cache) {
  fs.mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
  const tmpFile = `${LOCAL_CACHE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(cache, null, 2), "utf8");
  fs.renameSync(tmpFile, LOCAL_CACHE_FILE);
}

function cacheStats(cache) {
  return {
    ttlHours: Math.round(LOCAL_CACHE_TTL_MS / 36_000) / 100,
    titanExtract: Object.keys(cache.titanExtract || {}).length,
    updatedAt: cache.updatedAt || "",
  };
}

function listTitanExtractCache() {
  const cache = pruneScanCache(readScanCache());
  writeScanCache(cache);
  const entries = Object.values(cache.titanExtract || {}).sort(
    (a, b) => Date.parse(b.savedAt || "") - Date.parse(a.savedAt || "")
  );
  return {
    entries,
    stats: cacheStats(cache),
    ttlMs: LOCAL_CACHE_TTL_MS,
    cacheFile: LOCAL_CACHE_FILE,
  };
}

function upsertScanCache(sectionName, results, options = {}) {
  const normalizedResults = Array.isArray(results) ? results : [results].filter(Boolean);
  if (!normalizedResults.length) return { updatedCount: 0, ...cacheStats(readScanCache()) };

  const now = Date.now();
  const savedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + LOCAL_CACHE_TTL_MS).toISOString();
  const cache = pruneScanCache(readScanCache(), now);
  const section = cache[sectionName] || {};
  let updatedCount = 0;

  for (const result of normalizedResults) {
    const matchId = String(result?.matchId || result?.data?.matchId || result?.match?.matchId || "").trim();
    if (!/^\d+$/.test(matchId)) continue;
    section[matchId] = {
      matchId,
      savedAt,
      expiresAt,
      type: sectionName,
      options,
      result,
    };
    updatedCount += 1;
  }

  cache[sectionName] = section;
  cache.updatedAt = savedAt;
  writeScanCache(cache);
  return {
    updatedCount,
    expiresAt,
    file: LOCAL_CACHE_FILE,
    ...cacheStats(cache),
  };
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (requestUrl.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        data: {
          status: "online",
          time: new Date().toISOString(),
        },
      });
      return;
    }

    if (requestUrl.pathname === "/api/titan-health") {
      const data = await checkTitanConnection({
        matchLimit: Number(requestUrl.searchParams.get("limit") || 20),
        timeoutMs: Number(requestUrl.searchParams.get("timeoutMs") || 15000),
        tryMatches: Number(requestUrl.searchParams.get("tryMatches") || 8),
      });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/network-diagnostics") {
      const data = await runNetworkDiagnostics({
        timeoutMs: Number(requestUrl.searchParams.get("timeoutMs") || 12000),
      });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/titan-guess-scan") {
      const data = await scanTitanGuess({
        limit: Number(requestUrl.searchParams.get("limit") || 120),
        threshold: Number(requestUrl.searchParams.get("threshold") || 70),
        timeoutMs: Number(requestUrl.searchParams.get("timeoutMs") || 60000),
        attempts: Number(requestUrl.searchParams.get("attempts") || 1),
      });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/matches") {
      const includeAllLeagues = parseBoolean(requestUrl.searchParams.get("all"));
      const matches = await fetchLiveMatches({
        league: requestUrl.searchParams.get("league") || "",
        limit: Number(requestUrl.searchParams.get("limit") || 300),
        allowedLeagues: includeAllLeagues ? false : undefined,
      });
      sendJson(res, 200, { ok: true, matches });
      return;
    }

    if (requestUrl.pathname === "/api/extract") {
      const matchId = (requestUrl.searchParams.get("matchId") || "").trim();
      if (!/^\d+$/.test(matchId)) {
        sendJson(res, 400, { ok: false, error: "matchId 必須係數字。" });
        return;
      }

      const extractionMode = extractionModeValue(requestUrl.searchParams.get("extractionMode"));
      const includeMulti = extractionMode === "deep" || parseBoolean(requestUrl.searchParams.get("includeMulti"));
      const includeAllBookmakers =
        parseBoolean(requestUrl.searchParams.get("allBookmakers")) ||
        requestUrl.searchParams.get("bookmakers") === "all";
      const data = await extractMatchOdds(matchId, {
        includeMulti,
        extractionMode,
        bookmakers: includeAllBookmakers ? false : undefined,
      });
      const localCache = upsertScanCache(
        "titanExtract",
        {
          ok: true,
          matchId,
          match: { matchId },
          data,
          error: "",
        },
        {
          mode: "single",
          extractionMode,
          includeMulti,
          bookmakers: includeAllBookmakers ? "all" : "default",
        }
      );
      data.localCache = localCache;
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/extract-batch") {
      if (!["GET", "POST"].includes(req.method || "GET")) {
        sendJson(res, 405, { ok: false, error: "只支援 GET 或 POST。" });
        return;
      }

      const body = req.method === "POST" ? await readJsonBody(req) : {};
      const matches = collectBatchMatches(body, requestUrl.searchParams);

      if (!matches.length) {
        sendJson(res, 400, { ok: false, error: "請提供至少一個 Match ID。" });
        return;
      }

      const extractionMode = extractionModeValue(body.extractionMode || requestUrl.searchParams.get("extractionMode"));
      const includeMulti =
        extractionMode === "deep" ||
        boolValue(body.includeMulti) ||
        parseBoolean(requestUrl.searchParams.get("includeMulti"));
      const includeAllBookmakers =
        boolValue(body.allBookmakers) ||
        parseBoolean(requestUrl.searchParams.get("allBookmakers")) ||
        body.bookmakers === "all" ||
        requestUrl.searchParams.get("bookmakers") === "all";
      const concurrency = Number(body.concurrency || requestUrl.searchParams.get("concurrency") || 1);

      const chunks = chunkArray(matches, MAX_BATCH_MATCHES);
      const results = [];
      for (const chunk of chunks) {
        const chunkData = await extractBatchOdds(chunk, {
          includeMulti,
          extractionMode,
          bookmakers: includeAllBookmakers ? false : undefined,
          concurrency,
        });
        results.push(...(chunkData.results || []));
      }
      const data = {
        fetchedAt: new Date().toISOString(),
        total: matches.length,
        okCount: results.filter((result) => result?.ok).length,
        errorCount: results.filter((result) => result && !result.ok).length,
        batchCount: chunks.length,
        chunkSize: MAX_BATCH_MATCHES,
        results,
      };
      data.localCache = upsertScanCache("titanExtract", results, {
        mode: "batch",
        extractionMode,
        includeMulti,
        bookmakers: includeAllBookmakers ? "all" : "default",
        batchCount: chunks.length,
      });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/hkjc-scan") {
      const hours = Number(requestUrl.searchParams.get("hours") || 24);
      const data = await scanHkjcOdds({ hours });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/hkjc-special-odds-scan") {
      const hours = Number(requestUrl.searchParams.get("hours") || 24);
      const data = await scanHkjcOdds({ hours });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/hkjc-crs-equal-odds-scan") {
      const hours = Number(requestUrl.searchParams.get("hours") || 24);
      const data = await scanHkjcCorrectScoreEqualOdds({ hours });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/local-cache/titan-extract") {
      sendJson(res, 200, { ok: true, data: listTitanExtractCache() });
      return;
    }

    if (requestUrl.pathname === "/api/hkjc-match-check") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "只支援 POST" });
        return;
      }

      const body = await readJsonBody(req);
      const data = await checkTitanMatchesInHkjc({
        matches: Array.isArray(body.matches) ? body.matches : [],
        hours: Number(body.hours || 72),
        possibleThreshold: Number(body.possibleThreshold || 58),
        openThreshold: Number(body.openThreshold || 72),
        timeoutMs: Number(body.timeoutMs || 15000),
      });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/probability-events") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "?芣??POST" });
        return;
      }

      const body = await readJsonBody(req);
      const matches = collectBatchMatches(body, requestUrl.searchParams);
      if (!matches.length) {
        sendJson(res, 400, { ok: false, error: "請提供要掃描的 Match ID" });
        return;
      }

      const threshold = Number(body.threshold ?? requestUrl.searchParams.get("threshold") ?? 80);
      const concurrency = Number(body.concurrency || requestUrl.searchParams.get("concurrency") || 2);
      const chunks = chunkArray(matches, MAX_BATCH_MATCHES);
      const results = [];
      for (const chunk of chunks) {
        const chunkData = await scanTitanProbabilityEvents(chunk, {
          threshold,
          concurrency,
        });
        results.push(...(chunkData.results || []));
      }
      const hits = results.flatMap((result) => result?.hits || []);
      const data = {
        fetchedAt: new Date().toISOString(),
        threshold,
        total: matches.length,
        okCount: results.filter((result) => result?.ok).length,
        errorCount: results.filter((result) => result && !result.ok).length,
        noDataCount: results.filter((result) => result?.noData).length,
        hitCount: hits.length,
        matchHitCount: new Set(hits.map((hit) => hit.matchId)).size,
        batchCount: chunks.length,
        chunkSize: MAX_BATCH_MATCHES,
        hits,
        results,
      };
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/ai/analyze") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "只支援 POST" });
        return;
      }

      const body = await readJsonBody(req);
      if (!String(body.apiKey || "").trim()) {
        sendJson(res, 400, { ok: false, error: "請提供 AI API Key" });
        return;
      }

      const data = await analyzeOddsPayload(body);
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/ai/preview-input") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "只支援 POST" });
        return;
      }

      const body = await readJsonBody(req);
      const data = buildAiInputPreview(body.payload || {});
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/context") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "只支援 POST" });
        return;
      }

      const body = await readJsonBody(req);
      const data = await buildContextForMatches(body);
      sendJson(res, 200, { ok: true, data });
      return;
    }

    if (requestUrl.pathname === "/api/ai/guide-status") {
      sendJson(res, 200, { ok: true, data: getAnalysisGuideStatus() });
      return;
    }

    if (requestUrl.pathname === "/api/ai/test") {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: "只支援 POST" });
        return;
      }

      const body = await readJsonBody(req);
      if (!String(body.apiKey || "").trim()) {
        sendJson(res, 400, { ok: false, error: "請提供 AI API Key" });
        return;
      }

      const data = await testAiConnection(body);
      sendJson(res, 200, { ok: true, data });
      return;
    }

    serveStatic(req, res, requestUrl.pathname);
  } catch (error) {
    sendError(res, 500, error);
  }
});

function listenOnAvailablePort(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < START_PORT + 20) {
      listenOnAvailablePort(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, HOST, () => {
    console.log(`Titan007 odds extractor running at http://${HOST}:${port}`);
  });
}

listenOnAvailablePort(START_PORT);
