const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");
const zlib = require("node:zlib");
const { DEFAULT_ALLOWED_LEAGUES, _internals: titanInternals } = require("./titan");

const TITAN_HOME_URL = "https://www.titan007.com/";
const TITAN_GUESS_INDEX_URL = "https://guess2.titan007.com/";
const CACHE_DIR = path.join(__dirname, "..", ".local-cache");
const TITAN_GUESS_CACHE_FILE = path.join(CACHE_DIR, "titan-guess-cache.json");
const TITAN_GUESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeHtml(buffer, contentType = "") {
  const headerMatch = /charset=([^;\s]+)/i.exec(String(contentType || ""));
  const headerCharset = headerMatch?.[1]?.replace(/["']/g, "").trim().toLowerCase();
  const head = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));
  const metaMatch = /charset=["']?\s*([a-z0-9_-]+)/i.exec(head);
  const metaCharset = metaMatch?.[1]?.toLowerCase();
  const charset = headerCharset || metaCharset || "utf-8";
  const normalized = ["gb2312", "gbk", "gb18030", "cp936"].includes(charset) ? "gb18030" : charset;

  try {
    return new TextDecoder(normalized).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function decodeResponseBuffer(buffer, contentEncoding = "") {
  const encoding = String(contentEncoding || "").toLowerCase();
  try {
    if (encoding.includes("br")) return zlib.brotliDecompressSync(buffer);
    if (encoding.includes("gzip")) return zlib.gunzipSync(buffer);
    if (encoding.includes("deflate")) return zlib.inflateSync(buffer);
  } catch {
    return buffer;
  }
  return buffer;
}

function fetchText(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 20000);
  const requestUrl = new URL(url);
  const transport = requestUrl.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const fail = (error) => finish(reject, error);
    const timer = setTimeout(() => {
      req?.destroy(new Error(`Timeout after ${timeoutMs}ms while fetching ${url}`));
    }, timeoutMs);
    timer.unref?.();

    req = transport.request(
      requestUrl,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: {
          "user-agent": options.userAgent || DEFAULT_USER_AGENT,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-HK,zh;q=0.9,zh-CN;q=0.8,en;q=0.7",
          "accept-encoding": "gzip, deflate, br",
          "cache-control": "no-cache",
          "referer": options.referer || TITAN_HOME_URL,
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
          res.resume();
          const redirected = new URL(res.headers.location, requestUrl).toString();
          clearTimeout(timer);
          fetchText(redirected, { ...options, referer: url }).then(resolve, reject);
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", fail);
        res.on("end", () => {
          const buffer = decodeResponseBuffer(Buffer.concat(chunks), res.headers["content-encoding"] || "");
          const text = decodeHtml(buffer, res.headers["content-type"] || "");
          if ((res.statusCode || 0) >= 400) {
            const error = new Error(`HTTP ${res.statusCode} while fetching ${url}`);
            error.statusCode = res.statusCode;
            error.text = text.slice(0, 500);
            fail(error);
            return;
          }
          finish(resolve, {
            url,
            finalUrl: res.headers.location || url,
            statusCode: res.statusCode || 0,
            contentType: res.headers["content-type"] || "",
            text,
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout after ${timeoutMs}ms while fetching ${url}`)));
    req.on("error", fail);
    req.end();
  });
}

function readGuessCache() {
  try {
    if (!fs.existsSync(TITAN_GUESS_CACHE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(TITAN_GUESS_CACHE_FILE, "utf8"));
    if (!parsed?.data?.matches?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeGuessCache(data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TITAN_GUESS_CACHE_TTL_MS).toISOString(),
      data,
    };
    const tmpFile = `${TITAN_GUESS_CACHE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmpFile, TITAN_GUESS_CACHE_FILE);
  } catch {
    // Cache is best effort; live scan result should not fail because of disk writes.
  }
}

function cachedGuessResult(reason) {
  const cached = readGuessCache();
  if (!cached?.data) return null;
  const ageMs = Date.now() - Date.parse(cached.savedAt || 0);
  return {
    ...cached.data,
    fromCache: true,
    stale: ageMs > TITAN_GUESS_CACHE_TTL_MS,
    cacheReason: reason,
    cacheSavedAt: cached.savedAt || "",
    cacheExpiresAt: cached.expiresAt || "",
    fetchedAt: cached.savedAt || new Date().toISOString(),
  };
}

async function fetchTextWithRetry(url, options = {}) {
  const attempts = Math.max(1, Math.min(Number(options.attempts || 2), 4));
  const errors = [];

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fetchText(url, options);
    } catch (error) {
      errors.push(error);
      if (index < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 + index * 1500));
      }
    }
  }

  const lastError = errors[errors.length - 1] || new Error(`Failed to fetch ${url}`);
  lastError.message = errors.map((error) => error.message).join(" | ");
  throw lastError;
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function absoluteUrl(url, base = TITAN_HOME_URL) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function numberPercent(value) {
  const match = String(value || "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function attrValue(html, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return cleanText(pattern.exec(String(html || ""))?.[2] || "");
}

function firstMatch(html, regex, group = 1) {
  return regex.exec(String(html || ""))?.[group] || "";
}

function stripFirstTag(html, tagName) {
  return String(html || "").replace(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "i"), "");
}

function extractByStartEnd(html, startRegex, endRegex) {
  const text = String(html || "");
  const startMatch = startRegex.exec(text);
  if (!startMatch) return "";
  const start = startMatch.index;
  const rest = text.slice(start + startMatch[0].length);
  const endMatch = endRegex.exec(rest);
  const end = endMatch ? start + startMatch[0].length + endMatch.index : text.length;
  return text.slice(start, end);
}

function allowedLeagueSet(options = {}) {
  return titanInternals.buildAllowedLeagueSet(
    options.allowedLeagues === undefined ? DEFAULT_ALLOWED_LEAGUES : options.allowedLeagues
  );
}

function matchAllowedByLeague(match, options = {}) {
  return titanInternals.recordMatchesAllowedLeagues(
    {
      league: match.league,
      leagueSimplified: match.league,
      leagueTraditional: match.league,
    },
    allowedLeagueSet(options)
  );
}

function parseMatchInfo(html) {
  const infos = new Map();
  const regex = /<div\s+class=["']title\s+matchinfo["'][^>]*id=["']matchinfo_(\d+)["']([\s\S]*?)(?=<\/div>\s*<ul|<div\s+class=["']title\s+matchinfo["']|$)/gi;

  for (const match of html.matchAll(regex)) {
    const matchId = match[1];
    const block = match[2] || "";
    const league = cleanText(block.match(/<span\s+class=["']league["'][\s\S]*?<\/span>/i)?.[0] || "");
    const kickoffTime = cleanText(block.match(/<span\s+class=["']L-time["'][\s\S]*?<\/span>/i)?.[0] || "");
    const title = cleanText(block.match(/<a[^>]+class=["']tit["'][\s\S]*?<\/a>/i)?.[0] || "");
    const state = cleanText(block.match(/<a[^>]+class=["']time[^"']*["'][\s\S]*?<\/a>/i)?.[0] || "");
    const dataTime = cleanText(block.match(/data-time=["']([\s\S]*?)["']/i)?.[1] || "");
    const titleParts = title.split(/\s+VS\s+|\s+vs\s+/i).map((item) => item.trim()).filter(Boolean);

    infos.set(matchId, {
      matchId,
      league,
      kickoffTime,
      state,
      dataTime,
      title,
      home: titleParts[0] || "",
      away: titleParts[1] || "",
    });
  }

  return infos;
}

function parseTeamBlocks(block) {
  const teams = [];
  const regex = /<div\s+class=["']team["']([\s\S]*?)(?=<\/div>\s*(?:<div\s+class=["']team["']|<\/div>|$))/gi;
  for (const match of block.matchAll(regex)) {
    const teamBlock = match[0];
    const name = cleanText(teamBlock.match(/<span>\s*([\s\S]*?)\s*<\/span>/i)?.[1] || "");
    const image = absoluteUrl(teamBlock.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "");
    if (name) teams.push({ name, image });
  }
  return teams;
}

function parseGuessMarketsLegacy(block) {
  const markets = {};
  const regex =
    /<span\s+class=["']hCount["']>\s*([\d.]+)%\s*<\/span>\s*<span>\s*([^<]+?)\s*<\/span>\s*<span\s+class=["']gCount["']>\s*([\d.]+)%/gi;

  for (const match of block.matchAll(regex)) {
    const label = cleanText(match[2]);
    const leftPercent = numberPercent(match[1]);
    const rightPercent = numberPercent(match[3]);
    const edge = Number.isFinite(leftPercent) && Number.isFinite(rightPercent) ? Math.abs(leftPercent - rightPercent) : null;

    if (/亚让|亞讓|让球|讓球/i.test(label)) {
      markets.asian = {
        label: "亞讓",
        homePercent: leftPercent,
        awayPercent: rightPercent,
        lean: leftPercent > rightPercent ? "home" : rightPercent > leftPercent ? "away" : "balanced",
        edge,
      };
      continue;
    }

    if (/大小|入球|进球/i.test(label)) {
      markets.overUnder = {
        label: "大小",
        overPercent: leftPercent,
        underPercent: rightPercent,
        lean: leftPercent > rightPercent ? "over" : rightPercent > leftPercent ? "under" : "balanced",
        edge,
      };
    }
  }

  return markets;
}

function parseGuessMarkets(block) {
  const markets = {};
  const regex =
    /<span\s+class=["']hCount["']>\s*([\d.]+)%\s*<\/span>\s*<span>\s*([^<]+?)\s*<\/span>\s*<span\s+class=["']gCount["']>\s*([\d.]+)%/gi;
  const entries = [];

  for (const match of block.matchAll(regex)) {
    const label = cleanText(match[2]);
    const leftPercent = numberPercent(match[1]);
    const rightPercent = numberPercent(match[3]);
    const edge = Number.isFinite(leftPercent) && Number.isFinite(rightPercent) ? Math.abs(leftPercent - rightPercent) : null;
    entries.push({ label, leftPercent, rightPercent, edge });
  }

  for (const [index, entry] of entries.entries()) {
    const containsAsian = /[\u4e9a\u4e9e\u8ba9\u8b93]|asian|handicap/i.test(entry.label);
    const containsTotal = /[\u5927\u5c0f]|total|over|under/i.test(entry.label);

    if (!markets.asian && (containsAsian || (!containsTotal && index === 0))) {
      markets.asian = {
        label: entry.label || "asian",
        homePercent: entry.leftPercent,
        awayPercent: entry.rightPercent,
        lean: entry.leftPercent > entry.rightPercent ? "home" : entry.rightPercent > entry.leftPercent ? "away" : "balanced",
        edge: entry.edge,
      };
      continue;
    }

    if (!markets.overUnder && (containsTotal || index === 1)) {
      markets.overUnder = {
        label: entry.label || "total",
        overPercent: entry.leftPercent,
        underPercent: entry.rightPercent,
        lean: entry.leftPercent > entry.rightPercent ? "over" : entry.rightPercent > entry.leftPercent ? "under" : "balanced",
        edge: entry.edge,
      };
    }
  }

  return markets;
}

function indexMatchBlocks(html) {
  const blocks = [];
  const regex =
    /<div\s+class=["']match["'][^>]*id=["']match_position_(\d+)["'][\s\S]*?(?=<div\s+class=["']popupGuessTD["']|<div\s+class=["']match["'][^>]*id=["']match_position_|<\/form>|$)/gi;
  for (const match of html.matchAll(regex)) {
    blocks.push({ guessId: match[1], html: match[0] });
  }
  return blocks;
}

function parseIndexTeam(block, className, idPrefix, matchId) {
  const byId = matchId
    ? new RegExp(
        `<div\\s+class=["'][^"']*${className}[^"']*team[^"']*["'][^>]*id=["']${idPrefix}_${matchId}["'][^>]*>([\\s\\S]*?)<\\/div>`,
        "i"
      )
    : null;
  const byClass = new RegExp(`<div\\s+class=["'][^"']*${className}[^"']*team[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i");
  const match = (byId && byId.exec(block)) || byClass.exec(block);
  if (!match) return { name: "", rank: "" };

  const tag = match[0];
  const inner = match[1] || "";
  const rank = cleanText(firstMatch(inner, /<span[^>]*>([\s\S]*?)<\/span>/i));
  const name = attrValue(tag, "teamname") || cleanText(inner.replace(/<span[^>]*>[\s\S]*?<\/span>/i, ""));
  return { name, rank };
}

function extractIndexMarketBlock(block, prefix, matchId) {
  if (!matchId) return "";
  return extractByStartEnd(
    block,
    new RegExp(`<div\\s+id=["']${prefix}_jd_${matchId}["'][^>]*>`, "i"),
    /<div\s+id=["'](?:let|ou)_jd_\d+["']|<div\s+class=["']GTeam\b|<div\s+id=["']IsExpert_/i
  );
}

function parseButtonValue(block, prefix, side, matchId) {
  const regex = new RegExp(
    `<div\\s+id=["']${prefix}_${side}_${matchId}["'][\\s\\S]*?<span\\s+class=["']btnZS["']>([\\s\\S]*?)<\\/span>`,
    "i"
  );
  return numberValue(cleanText(firstMatch(block, regex)));
}

function parseIndexMarket(block, prefix, suffix, matchId) {
  const marketBlock = extractIndexMarketBlock(block, prefix, matchId);
  if (!marketBlock) return null;

  const lineTag = new RegExp(`<span\\s+id=["']${matchId}_${suffix}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i").exec(marketBlock);
  const count = numberValue(attrValue(marketBlock, "data-count"));
  const leftPercent = numberPercent(firstMatch(marketBlock, /<span\s+class=["']hCount["']>\s*([\d.]+)%/i));
  const rightPercent = numberPercent(firstMatch(marketBlock, /<span\s+class=["']gCount["']>\s*([\d.]+)%/i));
  const edge = Number.isFinite(leftPercent) && Number.isFinite(rightPercent) ? Math.abs(leftPercent - rightPercent) : null;
  const barWidth = numberPercent(firstMatch(marketBlock, /class=["']bar["'][^>]*style=["'][^"']*width\s*:\s*([\d.]+)%/i));

  return {
    count: count ?? "",
    line: cleanText(lineTag?.[1] || ""),
    lineOdds: numberValue(attrValue(lineTag?.[0] || "", "odds")) ?? "",
    leftPercent: leftPercent ?? "",
    rightPercent: rightPercent ?? "",
    edge: edge ?? "",
    barWidth: barWidth ?? "",
    noGuess: /\bnoGuess\b/i.test(attrValue(marketBlock, "class")),
  };
}

function summarizeMatches(matches, options = {}) {
  const threshold = Math.max(1, Math.min(Number(options.threshold || 70), 100));
  for (const match of matches) {
    match.hot = Number(match.maxPercent || 0) >= threshold;
  }
  return {
    threshold,
    total: matches.length,
    hitCount: matches.filter((match) => match.hot).length,
    matches,
  };
}

function parseTitanGuessIndexPage(html, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 200), 500));
  const threshold = Math.max(1, Math.min(Number(options.threshold || 70), 100));
  const matches = [];
  const seen = new Set();

  for (const item of indexMatchBlocks(html)) {
    const block = item.html;
    const matchId =
      firstMatch(block, /id=["']time_(\d+)["']/i) ||
      firstMatch(block, /id=["']home_(\d+)["']/i) ||
      firstMatch(block, /id=["']let_jd_(\d+)["']/i) ||
      item.guessId ||
      "";
    if (!matchId || seen.has(matchId)) continue;

    const statusHtml = firstMatch(block, /<div\s+class=["']game_guess["'][^>]*>([\s\S]*?)<\/div>/i);
    const kickoffTime = cleanText(firstMatch(statusHtml, /<i[^>]*>([\s\S]*?)<\/i>/i));
    const league = cleanText(stripFirstTag(stripFirstTag(statusHtml, "i"), "p"));
    const homeTeam = parseIndexTeam(block, "HTeam", "home", matchId);
    const awayTeam = parseIndexTeam(block, "GTeam", "guest", matchId);
    const state = cleanText(firstMatch(block, new RegExp(`<span\\s+class=["']time[^"']*["'][^>]*id=["']time_${matchId}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i")));
    const homeScore = cleanText(firstMatch(block, new RegExp(`<span\\s+id=["']h_score_${matchId}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i")));
    const awayScore = cleanText(firstMatch(block, new RegExp(`<span\\s+id=["']g_score_${matchId}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i")));
    const asian = parseIndexMarket(block, "let", "let", matchId) || {};
    const total = parseIndexMarket(block, "ou", "ou", matchId) || {};
    const record = {
      matchId,
      guessId: item.guessId,
      league,
      kickoffTime,
      state,
      score: homeScore !== "" || awayScore !== "" ? `${homeScore}-${awayScore}` : "",
      home: homeTeam.name,
      away: awayTeam.name,
      homeRank: homeTeam.rank,
      awayRank: awayTeam.rank,
      asianLine: asian.line || "",
      asianLineOdds: asian.lineOdds ?? "",
      asianCount: asian.count ?? "",
      asianHomePercent: asian.leftPercent ?? "",
      asianAwayPercent: asian.rightPercent ?? "",
      asianHomeSupportOdds: parseButtonValue(block, "let", "h", matchId) ?? "",
      asianAwaySupportOdds: parseButtonValue(block, "let", "g", matchId) ?? "",
      asianLean: asian.leftPercent > asian.rightPercent ? "home" : asian.rightPercent > asian.leftPercent ? "away" : "balanced",
      asianEdge: asian.edge ?? "",
      totalLine: total.line || "",
      totalLineOdds: total.lineOdds ?? "",
      totalCount: total.count ?? "",
      overPercent: total.leftPercent ?? "",
      underPercent: total.rightPercent ?? "",
      overSupportOdds: parseButtonValue(block, "ou", "o", matchId) ?? "",
      underSupportOdds: parseButtonValue(block, "ou", "u", matchId) ?? "",
      totalLean: total.leftPercent > total.rightPercent ? "over" : total.rightPercent > total.leftPercent ? "under" : "balanced",
      totalEdge: total.edge ?? "",
      maxPercent: Math.max(asian.leftPercent || 0, asian.rightPercent || 0, total.leftPercent || 0, total.rightPercent || 0),
      maxEdge: Math.max(asian.edge || 0, total.edge || 0),
      detailUrl: `https://guess2.titan007.com/tuijian/${matchId}.html`,
      sourcePage: TITAN_GUESS_INDEX_URL,
    };

    if (!matchAllowedByLeague(record, options)) continue;
    seen.add(matchId);
    matches.push(record);
    if (matches.length >= limit) break;
  }

  return {
    source: "titan_guess_index",
    sourceUrl: TITAN_GUESS_INDEX_URL,
    ...summarizeMatches(matches, { threshold }),
  };
}

function guessBlocks(html) {
  const blocks = [];
  const regex = /<div\s+class=["']guessBar["'][\s\S]*?(?=<div\s+class=["']guessBar["']|<div\s+class=["']gl2\s+tabs["']|$)/gi;
  for (const match of html.matchAll(regex)) {
    blocks.push(match[0]);
  }
  return blocks;
}

function parseTitanGuessHomePage(html, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 50));
  const threshold = Math.max(1, Math.min(Number(options.threshold || 70), 100));
  const matchInfo = parseMatchInfo(html);
  const matches = [];
  const seen = new Set();

  for (const block of guessBlocks(html)) {
    const detailUrlRaw =
      block.match(/window\.open\(['"]([^'"]*tuijian\/\d+\.html[^'"]*)['"]/i)?.[1] ||
      block.match(/href=["']([^"']*tuijian\/\d+\.html[^"']*)["']/i)?.[1] ||
      "";
    const detailUrl = absoluteUrl(detailUrlRaw, "https://guess2.titan007.com/");
    const matchId = detailUrl.match(/\/tuijian\/(\d+)\.html/i)?.[1] || "";
    if (!matchId || seen.has(matchId)) continue;
    seen.add(matchId);

    const teams = parseTeamBlocks(block);
    const markets = parseGuessMarkets(block);
    const info = matchInfo.get(matchId) || {};
    const home = teams[0]?.name || info.home || "";
    const away = teams[1]?.name || info.away || "";
    const maxPercent = Math.max(
      markets.asian?.homePercent || 0,
      markets.asian?.awayPercent || 0,
      markets.overUnder?.overPercent || 0,
      markets.overUnder?.underPercent || 0
    );
    const maxEdge = Math.max(markets.asian?.edge || 0, markets.overUnder?.edge || 0);

    matches.push({
      matchId,
      league: info.league || "",
      kickoffTime: info.kickoffTime || "",
      state: info.state || "",
      dataTime: info.dataTime || "",
      home,
      away,
      homeImage: teams[0]?.image || "",
      awayImage: teams[1]?.image || "",
      asianHomePercent: markets.asian?.homePercent ?? "",
      asianAwayPercent: markets.asian?.awayPercent ?? "",
      asianLean: markets.asian?.lean || "",
      asianEdge: markets.asian?.edge ?? "",
      overPercent: markets.overUnder?.overPercent ?? "",
      underPercent: markets.overUnder?.underPercent ?? "",
      totalLean: markets.overUnder?.lean || "",
      totalEdge: markets.overUnder?.edge ?? "",
      maxPercent,
      maxEdge,
      hot: maxPercent >= threshold,
      detailUrl,
      sourcePage: TITAN_HOME_URL,
    });

    if (matches.length >= limit) break;
  }

  return {
    source: "titan_home_v_guess",
    sourceUrl: TITAN_HOME_URL,
    threshold,
    total: matches.length,
    hitCount: matches.filter((match) => match.hot).length,
    matches,
  };
}

async function scanTitanGuess(options = {}) {
  const sourceUrl = options.url || TITAN_GUESS_INDEX_URL;
  try {
    const response = await fetchTextWithRetry(sourceUrl, {
      timeoutMs: options.timeoutMs || 60000,
      referer: TITAN_HOME_URL,
      attempts: options.attempts || 2,
    });
    let data = parseTitanGuessIndexPage(response.text, options);
    if (!data.total && sourceUrl !== TITAN_HOME_URL && options.fallbackHome !== false) {
      const homeResponse = await fetchTextWithRetry(TITAN_HOME_URL, {
        timeoutMs: options.timeoutMs || 60000,
        referer: TITAN_HOME_URL,
        attempts: 1,
      });
      data = parseTitanGuessHomePage(homeResponse.text, options);
      const fallbackResult = {
        ...data,
        fetchedAt: new Date().toISOString(),
        statusCode: homeResponse.statusCode,
        contentType: homeResponse.contentType,
        fallback: "titan_home",
      };
      if (fallbackResult.total) writeGuessCache(fallbackResult);
      return fallbackResult;
    }

    const result = {
      ...data,
      fetchedAt: new Date().toISOString(),
      statusCode: response.statusCode,
      contentType: response.contentType,
    };
    if (result.total) writeGuessCache(result);
    return result;
  } catch (error) {
    const cached = cachedGuessResult(error.message || String(error));
    if (cached) return cached;
    throw error;
  }
}

module.exports = {
  parseTitanGuessHomePage,
  parseTitanGuessIndexPage,
  scanTitanGuess,
  _internals: {
    decodeHtml,
    decodeResponseBuffer,
    fetchText,
    fetchTextWithRetry,
    parseGuessMarkets,
    parseMatchInfo,
    parseTeamBlocks,
  },
};
