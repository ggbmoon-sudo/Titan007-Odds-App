const http = require("node:http");
const https = require("node:https");
const zlib = require("node:zlib");
const { _internals: hkjcInternals } = require("./hkjc");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const HKJC_GRAPHQL_URL = "https://info.cld.hkjc.com/graphql/base/";

function decodeBody(buffer, headers = {}) {
  const encoding = String(headers["content-encoding"] || "").toLowerCase();
  try {
    if (encoding.includes("gzip")) return zlib.gunzipSync(buffer).toString("utf8");
    if (encoding.includes("deflate")) return zlib.inflateSync(buffer).toString("utf8");
    if (encoding.includes("br")) return zlib.brotliDecompressSync(buffer).toString("utf8");
  } catch {
    return buffer.toString("utf8");
  }
  return buffer.toString("utf8");
}

function compactText(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function classifyProbeResult(input) {
  const statusCode = Number(input.statusCode || 0);
  const text = String(input.text || "");
  const lower = text.toLowerCase();
  const hints = [];
  let state = "ok";
  let diagnosis = "連線正常";

  if (input.error) {
    state = "error";
    diagnosis = /timeout/i.test(input.error) ? "連線逾時" : "網絡或路由錯誤";
    hints.push("檢查 VPN / 代理 / DNS / 目標網站是否阻擋目前 IP。");
  } else if (statusCode === 403) {
    state = "error";
    diagnosis = "HTTP 403，疑似 IP / 地區 / WAF 風控";
    hints.push("同一功能台灣 IP 可用、香港 IP 不可用時，這通常是目標網站風控。");
  } else if (statusCode === 429) {
    state = "error";
    diagnosis = "HTTP 429，疑似短時間請求過多";
    hints.push("降低頻率、分批、加延遲，或稍後再試。");
  } else if (statusCode >= 500) {
    state = "warn";
    diagnosis = `HTTP ${statusCode}，目標網站伺服器錯誤`;
    hints.push("如果只在某個 IP 出現，可能是 CDN 節點或路由問題。");
  } else if (statusCode >= 300 && statusCode < 400) {
    state = "warn";
    diagnosis = `HTTP ${statusCode}，被重新導向`;
  } else if (statusCode >= 400) {
    state = "error";
    diagnosis = `HTTP ${statusCode}`;
  } else if (!text.trim()) {
    state = "warn";
    diagnosis = "回應為空";
  }

  if (!input.error && /(access denied|forbidden|captcha|cloudflare|blocked|安全验证|安全驗證|访问过于频繁|訪問過於頻繁|please enable cookies|unusual traffic)/i.test(text)) {
    state = statusCode >= 400 ? "error" : "warn";
    diagnosis = "回應內容疑似風控 / 驗證頁";
    hints.push("Node 後端沒有瀏覽器 session/cookie，某些 IP 會被要求驗證。");
  }

  if (!input.error && input.expected) {
    if (input.expected.ok && state === "ok" && input.expected.diagnosis) {
      diagnosis = input.expected.diagnosis;
    } else if (!input.expected.ok) {
      state = input.expected.severity || (state === "ok" ? "warn" : state);
      diagnosis = input.expected.diagnosis || diagnosis;
      hints.push(...(input.expected.hints || []));
    }
  }

  return {
    ...input,
    statusCode: statusCode || null,
    state,
    ok: state === "ok",
    diagnosis,
    hints: [...new Set(hints)],
    sample: compactText(input.sample || text),
  };
}

function requestProbe(config) {
  const startedAt = Date.now();
  const timeoutMs = Number(config.timeoutMs || 12000);
  const maxBodyBytes = Number(config.maxBodyBytes || 160000);
  const body = config.body ? (typeof config.body === "string" ? config.body : JSON.stringify(config.body)) : "";
  const headers = {
    "user-agent": USER_AGENT,
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br",
    ...(config.referer ? { referer: config.referer } : {}),
    ...(config.origin ? { origin: config.origin } : {}),
    ...(config.headers || {}),
  };
  if (body) {
    headers["content-type"] = headers["content-type"] || "application/json";
    headers["content-length"] = Buffer.byteLength(body);
  }

  return new Promise((resolve) => {
    const requestUrl = new URL(config.url);
    const transport = requestUrl.protocol === "http:" ? http : https;
    let timer = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(
        classifyProbeResult({
          name: config.name,
          label: config.label,
          url: config.url,
          elapsedMs: Date.now() - startedAt,
          ...result,
        })
      );
    };

    const req = transport.request(
      requestUrl,
      {
        method: config.method || (body ? "POST" : "GET"),
        timeout: timeoutMs,
        headers,
      },
      (res) => {
        let totalBytes = 0;
        let storedBytes = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (storedBytes < maxBodyBytes) {
            const keep = chunk.slice(0, maxBodyBytes - storedBytes);
            chunks.push(keep);
            storedBytes += keep.length;
          }
        });
        res.on("end", () => {
          const text = decodeBody(Buffer.concat(chunks), res.headers);
          let expected = null;
          let meta = {};
          try {
            const analyzed = config.analyze ? config.analyze(text, res) : null;
            expected = analyzed?.expected || null;
            meta = analyzed?.meta || {};
          } catch (error) {
            expected = {
              ok: false,
              severity: "warn",
              diagnosis: `診斷解析失敗：${error.message || error}`,
            };
          }
          finish({
            statusCode: res.statusCode || 0,
            contentType: res.headers["content-type"] || "",
            bytes: totalBytes,
            text,
            expected,
            meta,
          });
        });
      }
    );

    timer = setTimeout(() => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs + 500);
    req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
    req.on("error", (error) => {
      finish({
        error: error.message || String(error),
        errorCode: error.code || "",
      });
    });
    req.end(body || undefined);
  });
}

function parseTitanLiveMeta(text) {
  const matches = [...String(text || "").matchAll(/A\[(\d+)]\s*=\s*"([\s\S]*?)"\.split\('\^'\);/g)];
  const first = matches[0]?.[2]?.split("^") || [];
  return {
    matchCount: matches.length,
    firstMatchId: first[0] || "",
    firstLeague: first[3] || first[2] || "",
    firstHome: first[6] || first[5] || "",
    firstAway: first[9] || first[8] || "",
  };
}

function jsonMeta(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runNetworkDiagnostics(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 12000);
  const checkedAt = new Date().toISOString();

  const titanLiveUrl = `https://live.titan007.com/VbsXml/bfdata_ut.js?r=007&_${Date.now()}`;
  const [ip, titanHome, titanLive, hkjcPage, hkjcGraphql] = await Promise.all([
    requestProbe({
      name: "public_ip",
      label: "出口 IP",
      url: "https://api.ipify.org?format=json",
      timeoutMs,
      analyze: (text) => {
        const parsed = jsonMeta(text);
        return {
          expected: parsed?.ip
            ? { ok: true, diagnosis: `出口 IP：${parsed.ip}` }
            : { ok: false, severity: "warn", diagnosis: "未能讀取出口 IP" },
          meta: { ip: parsed?.ip || "" },
        };
      },
    }),
    requestProbe({
      name: "titan_home",
      label: "Titan007 主頁",
      url: "https://live.titan007.com/indexall_big.aspx",
      referer: "https://live.titan007.com/",
      timeoutMs,
      analyze: (text) => ({
        expected: /titan007|比分|亞|亚|A\[/i.test(text)
          ? { ok: true, diagnosis: "主頁可讀" }
          : { ok: false, severity: "warn", diagnosis: "主頁回應不像正常頁面" },
      }),
    }),
    requestProbe({
      name: "titan_live_list",
      label: "Titan007 賽事列表 API",
      url: titanLiveUrl,
      referer: "https://live.titan007.com/indexall_big.aspx",
      timeoutMs,
      analyze: (text) => {
        const meta = parseTitanLiveMeta(text);
        return {
          expected: meta.matchCount
            ? { ok: true, diagnosis: `賽事列表可讀：${meta.matchCount} 場` }
            : { ok: false, severity: "error", diagnosis: "賽事列表未讀到 match data" },
          meta,
        };
      },
    }),
    requestProbe({
      name: "hkjc_page",
      label: "HKJC HAD 頁面",
      url: "https://bet.hkjc.com/ch/football/had",
      referer: "https://bet.hkjc.com/ch/football/had",
      timeoutMs,
      analyze: (text) => ({
        expected: /hkjc|football|主客和|bet/i.test(text)
          ? { ok: true, diagnosis: "HKJC 網頁入口可讀" }
          : { ok: false, severity: "warn", diagnosis: "HKJC 頁面回應不像正常頁面" },
      }),
    }),
    requestProbe({
      name: "hkjc_graphql",
      label: "HKJC GraphQL 賠率 API",
      url: HKJC_GRAPHQL_URL,
      method: "POST",
      origin: "https://bet.hkjc.com",
      referer: "https://bet.hkjc.com/ch/football/had",
      timeoutMs,
      body: {
        query: hkjcInternals.HKJC_MATCH_QUERY,
        variables: {
          startIndex: 0,
          endIndex: 50,
          startDate: null,
          endDate: null,
          matchIds: null,
          tournIds: null,
          fbOddsTypes: ["HAD"],
          fbOddsTypesM: ["HAD"],
          inplayOnly: false,
          featuredMatchesOnly: false,
          frontEndIds: null,
          earlySettlementOnly: false,
          showAllMatch: false,
        },
      },
      analyze: (text) => {
        const parsed = jsonMeta(text);
        const errors = parsed?.errors || [];
        const matches = parsed?.data?.matches || [];
        return {
          expected: errors.length
            ? { ok: false, severity: "error", diagnosis: `GraphQL 回傳錯誤：${errors[0]?.message || "unknown"}` }
            : Array.isArray(matches)
              ? { ok: true, diagnosis: `HKJC API 可讀：${matches.length} 場` }
              : { ok: false, severity: "error", diagnosis: "HKJC API 回應不是預期 JSON" },
          meta: { matchCount: Array.isArray(matches) ? matches.length : 0, graphQLErrors: errors.length },
        };
      },
    }),
  ]);

  const matchId = titanLive.meta?.firstMatchId || "";
  const dependent = matchId
    ? await Promise.all([
        requestProbe({
          name: "titan_vip_asian",
          label: "Titan007 VIP 亞盤頁",
          url: `https://vip.titan007.com/AsianOdds_n.aspx?id=${encodeURIComponent(matchId)}&t=0&l=1`,
          referer: "https://live.titan007.com/indexall_big.aspx",
          timeoutMs,
          analyze: (text) => ({
            expected: /公司|主队|主隊|盘口|盤口|Asian/i.test(text)
              ? { ok: true, diagnosis: `VIP 盤口頁可讀：${matchId}` }
              : { ok: false, severity: "warn", diagnosis: `VIP 盤口頁未見正常盤口資料：${matchId}` },
            meta: { matchId },
          }),
        }),
        requestProbe({
          name: "titan_mobile_analysis",
          label: "Titan007 Mobile 分析頁",
          url: `https://m.titan007.com/analy/Analysis/${encodeURIComponent(matchId)}.htm`,
          referer: "https://m.titan007.com/",
          timeoutMs,
          analyze: (text) => ({
            expected: /概率事件|赛前简报|賽前簡報|freshJsonData|scheduleId/i.test(text)
              ? { ok: true, diagnosis: `Mobile 分析頁可讀：${matchId}` }
              : { ok: false, severity: "warn", diagnosis: `Mobile 分析頁未見概率/分析資料：${matchId}` },
            meta: { matchId },
          }),
        }),
      ])
    : [];

  const probes = [ip, titanHome, titanLive, ...dependent, hkjcPage, hkjcGraphql];
  const counts = probes.reduce(
    (acc, item) => {
      acc[item.state] = (acc[item.state] || 0) + 1;
      return acc;
    },
    { ok: 0, warn: 0, error: 0 }
  );
  const overall = counts.error ? "error" : counts.warn ? "warn" : "ok";
  const summary =
    overall === "ok"
      ? "Titan007 / HKJC 主要入口暫時正常。"
      : overall === "warn"
        ? "部分入口可疑，建議查看 warn 項目的 HTTP 狀態與回應內容。"
        : "有入口失敗，若台灣 IP 正常而香港 IP 失敗，多數是 IP / 地區 / 風控或 CDN 路由問題。";

  return {
    checkedAt,
    timeoutMs,
    overall,
    summary,
    counts,
    probes,
  };
}

module.exports = {
  runNetworkDiagnostics,
  _internals: {
    classifyProbeResult,
    parseTitanLiveMeta,
  },
};
