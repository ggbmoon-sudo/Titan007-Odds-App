const http = require("node:http");
const https = require("node:https");
const { execFile } = require("node:child_process");
const { TextDecoder } = require("node:util");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const DEFAULT_REFERER = "https://live.titan007.com/indexall_big.aspx";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const DEFAULT_ALLOWED_LEAGUES = [
  "英超",
  "西甲",
  "西乙",
  "德甲",
  "德乙",
  "意甲",
  "法甲",
  "法乙",
  "英冠",
  "澳超",
  "澳昆超",
  "澳威超",
  "比甲",
  "蘇超",
  "葡超",
  "荷甲",
  "俄超",
  "芬超",
  "挪超",
  "日職",
  "日職聯",
  "美冠聯",
  "美冠盃",
  "美職業",
  "墨西聯",
  "阿甲",
  "巴西甲",
  "亞冠精英",
  "英甲",
  "英足總盃",
  "智利甲",
  "智利女甲",
  "日職乙",
  "日女聯",
  "韓K聯",
  "韓K2",
  "韓女聯",
  "墨西聯春",
  "墨西女足聯",
  "墨西女超",
  "泰超",
  "歐聯",
  "歐霸盃",
  "女歐霸盃",
  "歐協聯",
  "歐洲超級盃",
  "自由盃",
  "南美球會盃",
  "世界冠軍球會盃",
  "亞冠二",
  "英格蘭聯賽盃",
  "社區盾",
  "西班牙國王盃",
  "意大利盃",
  "德國盃",
  "法國盃",
  "日聯盃",
  "天皇盃",
  "澳洲足總盃",
  "英乙",
  "瑞典超",
  "西女超",
  "瑞女超",
  "美女職",
  "德女聯",
  "澳維超",
  "世界盃及外圍賽",
  "沙地聯",
  "阿聯酋聯",
  "卡塔爾王子盃",
  "歐冠盃",
];

const LEAGUE_ALIASES = {
  "世界盃及外圍賽": ["世界盃外圍賽", "世界杯外圍賽", "世界盃", "世界杯", "世盃外"],
  "世界冠軍球會盃": ["世界冠軍俱樂部盃", "世界冠軍俱樂部杯", "世俱盃", "世俱杯"],
  "美冠聯": ["美冠联", "美國冠軍聯賽", "美国冠军联赛", "美國足球冠軍聯賽", "USL Championship", "USL冠軍聯賽"],
  "美冠盃": ["美冠杯", "中北美冠軍盃", "中北美冠軍杯", "中北美洲冠軍盃", "中北美洲冠軍杯", "CONCACAF Champions Cup"],
  "美職業": ["美職聯", "美國職業大聯盟", "美職業聯賽"],
  "墨西聯": ["墨西联", "墨西哥聯賽", "墨西哥联赛", "墨西哥聯", "墨西哥联", "墨超"],
  "墨西聯春": ["墨西聯", "墨西联", "墨西哥聯春"],
  "亞冠精英": ["亞冠精英聯賽"],
  "亞冠二": ["亞冠二級", "亞冠二級聯賽", "亞冠聯2"],
  "自由盃": ["南美自由盃", "解放者盃"],
  "南美球會盃": ["南美盃", "南美杯", "南美俱樂部盃", "南美俱乐部杯", "南球盃", "南球杯"],
  "阿聯酋聯": ["阿联酋联", "阿聯酋超", "阿联酋超", "阿聯酋職業聯賽", "阿联酋职业联赛", "阿聯酋超級聯賽"],
  "卡塔爾王子盃": [
    "卡塔尔王子杯",
    "卡塔爾王子杯",
    "卡塔爾王子盃",
    "卡亲王盃",
    "卡亲王杯",
    "卡親王盃",
    "卡親王杯",
    "卡塔爾盃",
    "卡塔尔杯",
  ],
  "歐冠盃": ["歐冠", "歐洲冠軍聯賽"],
  "日職": [
    "日職聯",
    "日本職業聯賽",
    "日本职业联赛",
    "日職百年構想聯賽",
    "日職百年构想联赛",
    "J聯賽百年構想聯賽",
    "J聯賽百年构想联赛",
    "Jリーグ百年構想リーグ",
  ],
  "日職聯": [
    "日職",
    "日本職業聯賽",
    "日本职业联赛",
    "日職百年構想聯賽",
    "日職百年构想联赛",
    "J聯賽百年構想聯賽",
    "J聯賽百年构想联赛",
    "Jリーグ百年構想リーグ",
  ],
  "女歐霸盃": ["歐女霸盃", "女子歐霸盃", "歐洲女子歐霸盃"],
  "日女聯": ["日女联", "日本女足聯賽", "日本女足联赛", "日本女子足球聯賽", "日本女子足球联赛"],
  "韓K2": ["韓K2聯", "韓K2联", "韩K2", "韓國K2聯賽", "韩国K2联赛", "K League 2", "K聯賽2"],
  "西女超": ["西班牙女超", "西班牙女子超級聯賽"],
  "瑞女超": ["瑞典女超", "瑞典女子超級聯賽"],
  "墨西女足聯": ["墨西女足联", "墨西哥女足聯賽", "墨西哥女足联赛", "墨西哥女子足球聯賽"],
  "墨西女超": ["墨西哥女超", "墨西哥女子超級聯賽"],
  "美女職": ["美國女足職業聯賽", "美國女子職業足球聯賽", "美職女"],
  "韓女聯": ["韓國女足聯賽", "韓國女子聯賽"],
  "德女聯": ["德國女足聯賽", "德國女子聯賽"],
  "澳昆超": [
    "澳昆超",
    "澳洲全國聯賽 - 昆士蘭",
    "澳洲全国联赛 - 昆士兰",
    "澳洲昆士蘭超級聯賽",
    "澳洲昆士兰超级联赛",
    "昆士蘭超",
    "昆士兰超",
    "NPL Queensland",
  ],
  "澳威超": [
    "澳威超",
    "澳洲全國聯賽 - 新南威爾斯",
    "澳洲全国联赛 - 新南威尔斯",
    "澳洲新南威爾士超級聯賽",
    "澳洲新南威尔士超级联赛",
    "新南威爾士超",
    "新南威尔士超",
    "NPL New South Wales",
    "NPL NSW",
  ],
  "澳維超": ["澳维超", "澳洲維多利亞超級聯賽", "澳洲維多利亞超"],
};

const SUPPLEMENTAL_LEAGUE_ALIASES = {
  "自由盃": [
    "自由杯",
    "解放者杯",
    "解放者盃",
    "南美自由杯",
    "南美自由盃",
    "南美解放者杯",
    "南美解放者盃",
    "CONMEBOL Libertadores",
  ],
  "南美球會盃": [
    "南美盃",
    "南美杯",
    "南球盃",
    "南球杯",
    "南美球會杯",
    "南美球会杯",
    "南美俱樂部盃",
    "南美俱乐部杯",
    "CONMEBOL Sudamericana",
  ],
  "美冠盃": [
    "美冠杯",
    "中北美冠盃",
    "中北美冠杯",
    "中北美冠軍盃",
    "中北美冠军杯",
    "CONCACAF Champions Cup",
  ],
};

const CORE_BOOKMAKER_GROUPS = [
  { key: "pinna", label: "Pinna", aliases: ["Pinna", "Pinna*", "Pinnacle", "平*", "平博"] },
  { key: "macau", label: "澳門彩票", aliases: ["澳門彩票", "澳门彩票", "澳", "澳*", "Macauslot"] },
  { key: "betfair", label: "Betfai", aliases: ["Betfai", "Betfai*", "Betfair"] },
  { key: "bet365", label: "Bet365", aliases: ["Bet365", "Bet 365", "365", "36", "36*"] },
  { key: "william_hill", label: "威廉希爾", aliases: ["威廉希爾", "威廉希尔", "William Hill", "威", "威*"] },
  { key: "ladbrokes", label: "立博", aliases: ["立博", "Ladbrokes", "立", "立*"] },
  { key: "interwetten", label: "Interwet", aliases: ["Interwet", "Interwet*", "Interwetten"] },
  {
    key: "hk_jockey",
    label: "香港賽馬會",
    aliases: ["香港賽馬會", "香港赛马会", "香港馬", "香港马", "香港馬*", "香港马*", "HK Jockey Club"],
  },
];

const MARKET_EXTRA_BOOKMAKER_GROUPS = [
  { key: "crown", label: "Crown", aliases: ["Crown", "Crow", "Crow*", "皇冠"] },
  { key: "sbobet", label: "利記", aliases: ["利記", "利记", "SBOBET", "利", "利*"] },
];

const BOOKMAKER_GROUPS = [
  CORE_BOOKMAKER_GROUPS[0],
  CORE_BOOKMAKER_GROUPS[1],
  MARKET_EXTRA_BOOKMAKER_GROUPS[0],
  CORE_BOOKMAKER_GROUPS[2],
  CORE_BOOKMAKER_GROUPS[3],
  CORE_BOOKMAKER_GROUPS[4],
  CORE_BOOKMAKER_GROUPS[5],
  MARKET_EXTRA_BOOKMAKER_GROUPS[1],
  CORE_BOOKMAKER_GROUPS[6],
  CORE_BOOKMAKER_GROUPS[7],
];

const CORE_BOOKMAKER_KEYS = CORE_BOOKMAKER_GROUPS.map((group) => group.key);
const ASIAN_OVER_UNDER_BOOKMAKER_KEYS = [
  "pinna",
  "macau",
  "crown",
  "bet365",
  "william_hill",
  "ladbrokes",
  "sbobet",
  "interwetten",
  "hk_jockey",
];
const REQUIRED_ASIAN_OVER_UNDER_BOOKMAKER_KEYS = ASIAN_OVER_UNDER_BOOKMAKER_KEYS.filter((key) => key !== "ladbrokes");

const MARKET_CONFIG = {
  asian: {
    label: "亞洲盤",
    names: ["homeOdds", "handicap", "awayOdds"],
    lineKey: "handicap",
    lineValueKey: "handicapValue",
  },
  overUnder: {
    label: "入球大小",
    names: ["overOdds", "total", "underOdds"],
    lineKey: "total",
    lineValueKey: "totalValue",
  },
};

function parseBoolean(value) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function toTraditionalText(value) {
  return String(value || "")
    .replace(/澳门/g, "澳門")
    .replace(/香港马会/g, "香港賽馬會")
    .replace(/香港赛马会/g, "香港賽馬會")
    .replace(/威廉希尔/g, "威廉希爾")
    .replace(/俱乐部/g, "俱樂部")
    .replace(/冠军/g, "冠軍")
    .replace(/超级/g, "超級")
    .replace(/马/g, "馬")
    .replace(/赛/g, "賽")
    .replace(/会/g, "會")
    .replace(/门/g, "門")
    .replace(/尔/g, "爾")
    .replace(/苏/g, "蘇")
    .replace(/联/g, "聯")
    .replace(/维/g, "維")
    .replace(/欧/g, "歐")
    .replace(/亚/g, "亞")
    .replace(/职/g, "職")
    .replace(/业/g, "業")
    .replace(/韩/g, "韓")
    .replace(/总/g, "總")
    .replace(/杯/g, "盃")
    .replace(/国/g, "國")
    .replace(/兰/g, "蘭")
    .replace(/围/g, "圍")
    .replace(/区/g, "區")
    .replace(/胜/g, "勝")
    .replace(/凯/g, "凱")
    .replace(/还/g, "還")
    .replace(/让/g, "讓")
    .replace(/盘/g, "盤")
    .replace(/进/g, "進")
    .replace(/数/g, "數");
}

function normalizeComparableText(value) {
  return toTraditionalText(value)
    .toLowerCase()
    .replace(/封/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[^0-9a-z\u4e00-\u9fff]+/gi, "");
}

function buildAllowedLeagueSet(allowedLeagues = DEFAULT_ALLOWED_LEAGUES) {
  if (allowedLeagues === false) return null;

  const set = new Set();
  const leagues = Array.isArray(allowedLeagues) ? allowedLeagues : DEFAULT_ALLOWED_LEAGUES;

  for (const league of leagues) {
    const normalized = normalizeComparableText(league);
    if (normalized) set.add(normalized);

    const aliases = [
      ...(LEAGUE_ALIASES[league] || []),
      ...(SUPPLEMENTAL_LEAGUE_ALIASES[league] || []),
    ];
    for (const alias of aliases) {
      const normalizedAlias = normalizeComparableText(alias);
      if (normalizedAlias) set.add(normalizedAlias);
    }
  }

  return set;
}

function recordMatchesAllowedLeagues(record, allowedLeagueSet) {
  if (!allowedLeagueSet) return true;

  const names = [record.league, record.leagueSimplified, record.leagueTraditional]
    .map(normalizeComparableText)
    .filter(Boolean);
  return names.some((name) => allowedLeagueSet.has(name));
}

function recordMatchesLeagueSearch(record, league) {
  if (!league) return true;

  const needle = String(league).toLowerCase().trim();
  const normalizedNeedle = normalizeComparableText(league);
  const rawHaystack = `${record.league} ${record.leagueSimplified} ${record.leagueTraditional}`.toLowerCase();
  const normalizedHaystack = normalizeComparableText(rawHaystack);

  if (rawHaystack.includes(needle) || (normalizedNeedle && normalizedHaystack.includes(normalizedNeedle))) {
    return true;
  }

  const aliases = new Set();
  for (const [canonical, values] of Object.entries({ ...LEAGUE_ALIASES, ...SUPPLEMENTAL_LEAGUE_ALIASES })) {
    const candidates = [canonical, ...(values || [])];
    const normalizedCandidates = candidates.map(normalizeComparableText).filter(Boolean);
    const matchesQuery =
      candidates.some((candidate) => String(candidate || "").toLowerCase().includes(needle)) ||
      normalizedCandidates.some((candidate) => normalizedNeedle && candidate.includes(normalizedNeedle));
    if (!matchesQuery) continue;
    for (const candidate of candidates) aliases.add(candidate);
  }

  return [...aliases].some((alias) => {
    const rawAlias = String(alias || "").toLowerCase().trim();
    const normalizedAlias = normalizeComparableText(alias);
    return (rawAlias && rawHaystack.includes(rawAlias)) || (normalizedAlias && normalizedHaystack.includes(normalizedAlias));
  });
}

const NORMALIZED_BOOKMAKER_GROUPS = BOOKMAKER_GROUPS.map((group) => ({
  ...group,
  normalizedAliases: group.aliases.map(normalizeComparableText).filter(Boolean),
}));
const BOOKMAKER_KEY_SET = new Set(BOOKMAKER_GROUPS.map((group) => group.key));
const BOOKMAKER_ORDER = new Map(BOOKMAKER_GROUPS.map((group, index) => [group.key, index]));
const BOOKMAKER_GROUP_BY_KEY = new Map(BOOKMAKER_GROUPS.map((group) => [group.key, group]));

const BOOKMAKER_COMPANY_ID_MAP = {
  asian: {
    47: "pinna",
    1: "macau",
    3: "crown",
    8: "bet365",
    9: "william_hill",
    4: "ladbrokes",
    31: "sbobet",
    19: "interwetten",
    48: "hk_jockey",
  },
  overUnder: {
    47: "pinna",
    1: "macau",
    3: "crown",
    8: "bet365",
    9: "william_hill",
    4: "ladbrokes",
    31: "sbobet",
    19: "interwetten",
    48: "hk_jockey",
  },
  europe: {
    177: "pinna",
    80: "macau",
    2: "betfair",
    988: "betfair",
    1036: "betfair",
    1055: "betfair",
    281: "bet365",
    115: "william_hill",
    82: "ladbrokes",
    1135: "ladbrokes",
    1350: "ladbrokes",
    104: "interwetten",
    432: "hk_jockey",
  },
};

function inferBookmakerMarket(row = {}) {
  if (row.market === "asian" || row.market === "overUnder" || row.market === "europe") return row.market;
  if (row.win || row.draw || row.loss || row.current?.win || row.current?.draw || row.current?.loss) return "europe";
  return "";
}

function bookmakerFromKey(key) {
  const group = BOOKMAKER_GROUP_BY_KEY.get(key);
  return group ? { key: group.key, label: group.label } : null;
}

function bookmakerAliasMatches(name, alias) {
  if (!name || !alias) return false;
  if (alias.length <= 1 || /^\d+$/.test(alias)) return name === alias || name.startsWith(alias);
  return name === alias || name.includes(alias);
}

function identifyBookmaker(...names) {
  const normalizedNames = names.map(normalizeComparableText).filter(Boolean);
  if (!normalizedNames.length) return null;

  for (const group of NORMALIZED_BOOKMAKER_GROUPS) {
    const matched = normalizedNames.some((name) =>
      group.normalizedAliases.some((alias) => bookmakerAliasMatches(name, alias))
    );
    if (matched) {
      return { key: group.key, label: group.label };
    }
  }

  return null;
}

function identifyBookmakerFromRow(row = {}) {
  const companyId = String(row.companyId || "").trim();
  const market = inferBookmakerMarket(row);
  const keyFromId = companyId ? BOOKMAKER_COMPANY_ID_MAP[market]?.[companyId] : "";
  return bookmakerFromKey(keyFromId) || identifyBookmaker(row.company, row.englishName);
}

function resolveBookmakerKey(value) {
  const raw = String(value || "").trim();
  if (BOOKMAKER_KEY_SET.has(raw)) return raw;

  const match = identifyBookmaker(value);
  return match?.key || normalizeComparableText(value);
}

function defaultBookmakerKeysForMarket(market) {
  if (market === "asian" || market === "overUnder") return ASIAN_OVER_UNDER_BOOKMAKER_KEYS;
  return CORE_BOOKMAKER_KEYS;
}

function requiredBookmakerKeysForMarket(market) {
  if (market === "asian" || market === "overUnder") return REQUIRED_ASIAN_OVER_UNDER_BOOKMAKER_KEYS;
  return CORE_BOOKMAKER_KEYS;
}

function buildAllowedBookmakerSet(bookmakers, market = "") {
  if (bookmakers === false) return null;
  const source = Array.isArray(bookmakers) && bookmakers.length ? bookmakers : defaultBookmakerKeysForMarket(market);
  return new Set(source.map(resolveBookmakerKey).filter(Boolean));
}

function dedupeBookmakerRows(rows) {
  const byBookmaker = new Map();

  for (const row of rows) {
    const key = row.bookmakerKey || "";
    if (!key) continue;

    const existing = byBookmaker.get(key);
    if (!existing) {
      byBookmaker.set(key, row);
      continue;
    }

    const existingRank = existing.isMultiLine ? 1 : 0;
    const rowRank = row.isMultiLine ? 1 : 0;
    if (rowRank < existingRank) {
      byBookmaker.set(key, row);
    }
  }

  return [...byBookmaker.values()];
}

function filterBookmakerRows(rows, options = {}) {
  const hasExplicitBookmakers = Array.isArray(options.bookmakers) && options.bookmakers.length;
  const explicitAllowedSet =
    options.filterBookmakers === false || !hasExplicitBookmakers ? null : buildAllowedBookmakerSet(options.bookmakers);

  const sortedRows = rows
    .map((row, sourceIndex) => {
      const bookmaker = identifyBookmakerFromRow(row);
      return bookmaker
        ? {
            ...row,
            bookmakerKey: bookmaker.key,
            bookmaker: bookmaker.label,
            sourceIndex,
          }
        : { ...row, sourceIndex };
    })
    .filter((row) => {
      if (options.filterBookmakers === false) return true;
      const allowedSet = explicitAllowedSet || buildAllowedBookmakerSet(undefined, inferBookmakerMarket(row));
      return allowedSet.has(row.bookmakerKey);
    })
    .sort((a, b) => {
      const orderA = BOOKMAKER_ORDER.get(a.bookmakerKey) ?? Number.MAX_SAFE_INTEGER;
      const orderB = BOOKMAKER_ORDER.get(b.bookmakerKey) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.sourceIndex - b.sourceIndex;
    });

  const shouldDedupe = options.filterBookmakers !== false && options.dedupeBookmakers !== false;
  const outputRows = shouldDedupe ? dedupeBookmakerRows(sortedRows) : sortedRows;

  return outputRows.map(({ sourceIndex, ...row }) => row);
}

function buildHeaders(referer = DEFAULT_REFERER, options = {}) {
  return {
    "user-agent": options.userAgent || USER_AGENT,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-encoding": "identity",
    "accept-language": "zh-HK,zh;q=0.9,zh-CN;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "connection": "close",
    "referer": referer,
  };
}

function normalizeCharset(charset) {
  if (!charset) return "utf-8";
  const value = charset.toLowerCase().replace(/["']/g, "").trim();
  if (["gb2312", "gbk", "gb18030", "cp936"].includes(value)) return "gb18030";
  if (["utf8", "utf-8"].includes(value)) return "utf-8";
  if (value === "big5") return "big5";
  return value;
}

function detectCharset(buffer, contentType = "") {
  const headerMatch = /charset=([^;\s]+)/i.exec(contentType);
  if (headerMatch) return normalizeCharset(headerMatch[1]);

  const head = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));
  const metaMatch = /charset=["']?\s*([a-z0-9_-]+)/i.exec(head);
  if (metaMatch) return normalizeCharset(metaMatch[1]);

  return "utf-8";
}

function bufferDeclaresUtf8(buffer, contentType = "") {
  if (/charset\s*=\s*["']?\s*utf-?8/i.test(String(contentType || ""))) return true;
  const head = buffer.toString("latin1", 0, Math.min(buffer.length, 4096));
  return /charset\s*=\s*["']?\s*utf-?8/i.test(head);
}

function countReplacementChars(value) {
  return (String(value || "").match(/\uFFFD/g) || []).length;
}

function countCjkChars(value) {
  return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function countTitanMojibakeChars(value) {
  return (String(value || "").match(/[鍚鑿鏂涓浜澶鎶娓妯鐞偛璧涘锛冿鈩鍗婂]/g) || []).length;
}

function decodeBuffer(buffer, contentType, forcedCharset = "") {
  const charset = forcedCharset || detectCharset(buffer, contentType);
  try {
    const decoded = new TextDecoder(charset).decode(buffer);
    if (forcedCharset) return decoded;
    if (charset === "gb18030") {
      const utf8Decoded = new TextDecoder("utf-8").decode(buffer);
      const utf8ReplacementCount = countReplacementChars(utf8Decoded);
      const utf8CjkCount = countCjkChars(utf8Decoded);
      const decodedMojibakeCount = countTitanMojibakeChars(decoded);
      const utf8MojibakeCount = countTitanMojibakeChars(utf8Decoded);
      const utf8LooksReadable =
        utf8CjkCount >= 10 &&
        utf8ReplacementCount <= Math.max(3, Math.ceil(utf8CjkCount / 80)) &&
        decodedMojibakeCount >= utf8MojibakeCount + 4;
      if (utf8LooksReadable) return utf8Decoded;
    }
    if (/\uFFFD/.test(decoded) && charset !== "gb18030") {
      const gbDecoded = new TextDecoder("gb18030").decode(buffer);
      const replacementCount = countReplacementChars(decoded);
      const gbReplacementCount = countReplacementChars(gbDecoded);
      const cjkCount = countCjkChars(decoded);
      const gbCjkCount = countCjkChars(gbDecoded);
      const declaresUtf8 = bufferDeclaresUtf8(buffer, contentType);
      if (declaresUtf8 && cjkCount >= 10) return decoded;
      const looksLikeGoodUtf8 = cjkCount >= 20 && replacementCount <= Math.max(4, Math.ceil(cjkCount / 60));
      if (!looksLikeGoodUtf8 && gbReplacementCount < replacementCount && gbCjkCount >= cjkCount) return gbDecoded;
    }
    return decoded;
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const maxRedirects = options.maxRedirects ?? 4;
  const referer = options.referer || DEFAULT_REFERER;
  const idleCompleteMs = Number(options.idleCompleteMs ?? 1800);

  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const transport = requestUrl.protocol === "http:" ? http : https;
    let hardTimer;
    let idleTimer;
    let settled = false;
    const clearHardTimer = () => {
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
    };
    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };
    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      clearHardTimer();
      clearIdleTimer();
      handler(value);
    };

    const req = transport.request(
      requestUrl,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: buildHeaders(referer, options),
      },
      (res) => {
        const statusCode = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
          if (maxRedirects <= 0) {
            settle(reject, new Error(`Too many redirects while fetching ${url}`));
            res.resume();
            return;
          }
          const redirected = new URL(res.headers.location, requestUrl).toString();
          res.resume();
          clearHardTimer();
          clearIdleTimer();
          fetchText(redirected, { ...options, maxRedirects: maxRedirects - 1, referer: url })
            .then((value) => settle(resolve, value))
            .catch((error) => settle(reject, error));
          return;
        }

        const chunks = [];
        const finish = (incomplete = false) => {
          const buffer = Buffer.concat(chunks);
          const text = decodeBuffer(buffer, res.headers["content-type"] || "", options.forceCharset);

          if (statusCode >= 400) {
            const error = new Error(`HTTP ${statusCode} while fetching ${url}`);
            error.statusCode = statusCode;
            error.incomplete = incomplete;
            error.text = text;
            settle(reject, error);
            return;
          }

          settle(resolve, {
            url,
            statusCode,
            headers: res.headers,
            text,
            incomplete,
          });
        };
        const scheduleIdleComplete = () => {
          if (!idleCompleteMs || idleCompleteMs <= 0) return;
          clearIdleTimer();
          idleTimer = setTimeout(() => {
            if (!chunks.length || settled) return;
            finish(true);
            res.destroy();
            req.destroy();
          }, idleCompleteMs);
        };
        res.on("data", (chunk) => {
          chunks.push(chunk);
          scheduleIdleComplete();
        });
        res.on("end", () => finish(false));
        res.on("aborted", () => {
          if (chunks.length) finish(true);
        });
        res.on("error", (error) => {
          if (chunks.length) {
            finish(true);
            return;
          }
          settle(reject, error);
        });
      }
    );

    hardTimer = setTimeout(() => {
      if (settled) return;
      req.destroy(new Error(`Total timeout while fetching ${url}`));
    }, timeoutMs);

    req.on("timeout", () => req.destroy(new Error(`Timeout while fetching ${url}`)));
    req.on("error", (error) => {
      settle(reject, error);
    });
    req.end();
  });
}

function fetchTextWithCurl(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const curlTimeoutMs = Number(options.curlTimeoutMs || Math.min(timeoutMs, 18000));
  const referer = options.referer || DEFAULT_REFERER;
  const timeoutSeconds = Math.max(3, Math.ceil(curlTimeoutMs / 1000));
  const connectTimeoutSeconds = Math.min(10, timeoutSeconds);
  const args = [
    "-sS",
    "-L",
    "--connect-timeout",
    String(connectTimeoutSeconds),
    "--max-time",
    String(timeoutSeconds),
    "-A",
    options.userAgent || USER_AGENT,
    "-e",
    referer,
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H",
    "Accept-Language: zh-HK,zh;q=0.9,zh-CN;q=0.8,en;q=0.7",
    "-H",
    "Cache-Control: no-cache",
    url,
  ];

  return new Promise((resolve, reject) => {
    execFile(
      process.platform === "win32" ? "curl.exe" : "curl",
      args,
      {
        encoding: "buffer",
        maxBuffer: options.maxBuffer || 12 * 1024 * 1024,
        timeout: curlTimeoutMs + 5000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (stdout?.length) {
          resolve({
            url,
            statusCode: 200,
            headers: {},
            text: decodeBuffer(stdout, "", options.forceCharset),
            incomplete: Boolean(error),
            transport: "curl",
          });
          return;
        }

        const message = [
          error?.message || "curl returned no data",
          stderr?.length ? decodeBuffer(stderr, "") : "",
        ]
          .filter(Boolean)
          .join(": ");
        reject(new Error(message));
      }
    );
  });
}

function isFetchRecoverable(error) {
  return /timeout|socket|ECONN|EAI_|EACCES|TLS|network/i.test(String(error?.message || error || ""));
}

async function fetchFirstAvailable(urls, options = {}) {
  const errors = [];
  for (const url of urls) {
    const attempts = options.attempts || 2;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = options.preferCurl
          ? await fetchTextWithCurl(url, options).catch((error) => {
              if (options.curlOnly) throw error;
              return fetchText(url, options);
            })
          : await fetchText(url, options).catch((error) => {
              if (options.curlFallback !== false && isFetchRecoverable(error)) {
                return fetchTextWithCurl(url, options);
              }
              throw error;
            });
        assertUsefulHtml(response.text, url);
        if (options.rejectIncomplete && response.incomplete) {
          throw new Error(`Incomplete response while fetching ${url}`);
        }
        return response;
      } catch (error) {
        const suffix = attempts > 1 ? ` (attempt ${attempt}/${attempts})` : "";
        errors.push(`${url}${suffix}: ${error.message}`);
      }
    }
  }

  throw new Error(errors.join(" | "));
}

function assertUsefulHtml(html, url) {
  const head = String(html || "").slice(0, 12000);
  const plainHead = head
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const hasUsefulMatchData = /freshJsonData|oddsData|概率事件|compDiv|scheduleId/i.test(html);
  const hasServerError = /500\s*-\s*Internal server error|URL Rewrite Module Error|Server Error/i.test(plainHead);
  const hasNotFoundTitle = /<title>[^<]*(?:404|Not Found|頁面不存在|页面不存在)[^<]*<\/title>/i.test(head);
  const hasNotFoundBody = /(?:404\s*(?:Not Found|錯誤|错误)|頁面不存在|页面不存在|no-match)/i.test(plainHead);
  const hasObjectReferenceError = /未将对象引用设置到对象的实例|Object reference not set/i.test(plainHead);

  if (hasServerError || (!hasUsefulMatchData && (hasNotFoundTitle || hasNotFoundBody || hasObjectReferenceError))) {
    throw new Error(`Titan007 returned an error page for ${url}`);
  }
}

function stripTags(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function cellText(html) {
  return decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();
}

function cleanMatchText(value) {
  return cellText(String(value || ""))
    .replace(/\s*\((?:中|neutral)\)\s*/gi, "(中)")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDivBlockByClass(html, className) {
  const regex = new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i");
  const match = regex.exec(html);
  return match ? match[1] : "";
}

function parseOddsPageMeta(html, matchId = "") {
  const source = String(html || "");
  if (!source) return {};

  const leagueMatch = /<a\b[^>]*class=["'][^"']*\bLName\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(source);
  const timeMatch = /<span\b[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(source);
  const homeBlock = extractDivBlockByClass(source, "home");
  const guestBlock = extractDivBlockByClass(source, "guest");
  const homeLinks = [...homeBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((item) => cleanMatchText(item[1])).filter(Boolean);
  const guestLinks = [...guestBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((item) => cleanMatchText(item[1])).filter(Boolean);
  const kickoffRaw = cleanMatchText(timeMatch?.[1] || "").replace(/\s*星期.*/u, "").trim();

  const meta = {
    matchId: String(matchId || "").trim(),
    league: cleanMatchText(leagueMatch?.[1] || ""),
    kickoffTime: kickoffRaw,
    home: cleanMatchText(homeLinks[homeLinks.length - 1] || "").replace(/\(主\)$/u, ""),
    away: cleanMatchText(guestLinks[guestLinks.length - 1] || "").replace(/\(客\)$/u, ""),
  };

  return Object.fromEntries(Object.entries(meta).filter(([, value]) => value));
}

function parseAttrs(attrText = "") {
  const attrs = {};
  const regex = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
  let match;
  while ((match = regex.exec(attrText))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function extractRows(tableHtml) {
  const rows = [];
  const regex = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = regex.exec(tableHtml))) {
    rows.push({
      attrs: parseAttrs(match[1]),
      html: match[2],
    });
  }
  return rows;
}

function extractCells(rowHtml) {
  const cells = [];
  const regex = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
  let match;
  while ((match = regex.exec(rowHtml))) {
    const attrs = parseAttrs(match[1]);
    const html = match[2];
    cells.push({
      attrs,
      html,
      outerHtml: match[0],
      text: cellText(html),
    });
  }
  return cells;
}

function extractTableById(html, id) {
  const regex = new RegExp(`<table\\b[^>]*\\bid\\s*=\\s*["']?${id}["']?[^>]*>`, "i");
  const match = regex.exec(html);
  if (!match) return "";

  const start = match.index;
  const end = html.indexOf("</table>", start);
  if (end === -1) return html.slice(start);
  return html.slice(start, end + "</table>".length);
}

function extractFlatOddsRows(tableHtml) {
  const cells = extractCells(tableHtml);
  const rows = [];
  let current = [];
  const isRowStart = (cell) => /\bname\s*=\s*["']?oddsShow\b/i.test(cell.html) || /\bdata-id\s*=\s*["']?\d+/i.test(cell.html);

  for (const cell of cells) {
    if (isRowStart(cell)) {
      if (current.length >= 6) {
        rows.push({ attrs: {}, html: current.map((item) => item.outerHtml || item.html).join("") });
      }
      current = [cell];
      continue;
    }

    if (current.length) current.push(cell);
  }

  if (current.length >= 6) {
    rows.push({ attrs: {}, html: current.map((item) => item.outerHtml || item.html).join("") });
  }

  return rows;
}

function isHiddenRow(row) {
  return /display\s*:\s*none/i.test(row.attrs.style || "") || /blue_txt/i.test(row.attrs.class || "");
}

function readInputDataId(html) {
  const match = /\bdata-id\s*=\s*["']?(\d+)/i.exec(html);
  return match ? match[1] : "";
}

function cleanCompanyName(text) {
  return text.replace(/封/g, "").replace(/\s+/g, " ").trim();
}

function readTriplet(cells, config) {
  const [first, line, third] = cells;
  const output = {
    [config.names[0]]: first?.text || "",
    [config.names[1]]: line?.text || "",
    [config.names[2]]: third?.text || "",
    [config.lineValueKey]: line?.attrs.goals || "",
    time: line?.attrs.title || first?.attrs.title || third?.attrs.title || "",
  };
  return output;
}

function parseOddsTable(html, market, period, options = {}) {
  const config = MARKET_CONFIG[market];
  if (!config) throw new Error(`Unsupported market ${market}`);

  const tableHtml = extractTableById(html, "odds");
  if (!tableHtml) {
    throw new Error(`${config.label} ${period} 找不到 odds table。`);
  }

  const rows = extractRows(tableHtml);
  const effectiveRows = rows.length ? rows : extractFlatOddsRows(tableHtml);
  const records = [];
  let currentCompany = null;

  for (const row of effectiveRows) {
    const cells = extractCells(row.html);
    if (cells.length < 12 || cells.some((cell) => cell.attrs.colspan)) continue;

    const hidden = isHiddenRow(row);
    if (hidden && !options.includeMulti) continue;

    const visibleWholeOdds = cells.filter((cell) => (cell.attrs.oddstype || "").toLowerCase() === "wholeodds");
    const lastWholeOdds = cells.filter((cell) => (cell.attrs.oddstype || "").toLowerCase() === "wholelastodds");

    const companyId = readInputDataId(cells[0].html) || row.attrs.companyid || currentCompany?.companyId || "";
    const rawCompany = cells[1].text || currentCompany?.company || "";
    const company = cleanCompanyName(rawCompany || currentCompany?.company || "");
    const isClosed = /封/.test(cells[1].text || "");

    if (!hidden && company) {
      currentCompany = { company, companyId };
    }

    if (!company && !currentCompany) continue;

    const initialCells = cells.slice(3, 6);
    const currentCells = visibleWholeOdds.length >= 3 ? visibleWholeOdds.slice(0, 3) : cells.slice(9, 12);
    const lastCells = lastWholeOdds.length >= 3 ? lastWholeOdds.slice(0, 3) : [];

    records.push({
      market,
      period,
      companyId: companyId || currentCompany?.companyId || "",
      company: company || currentCompany?.company || "",
      isClosed,
      isMultiLine: hidden,
      multiLabel: cells[2]?.text || "",
      initial: readTriplet(initialCells, config),
      current: readTriplet(currentCells, config),
      lastBeforeCurrent: lastCells.length ? readTriplet(lastCells, config) : null,
    });
  }

  return records;
}

function parseEuropeOdds(html) {
  assertUsefulHtml(html, "europe odds");

  const candidateTables = [
    extractTableById(html, "odds"),
    extractTableById(html, "datatb"),
    extractTableById(html, "data"),
  ].filter(Boolean);

  const tableHtml = candidateTables[0] || html;
  const rows = extractRows(tableHtml);
  const records = [];

  for (const row of rows) {
    const cells = extractCells(row.html).filter((cell) => cell.text !== "");
    if (cells.length < 10) continue;

    const first = cells[0].text;
    if (/公司|所有|主胜|主勝|凱利|凯利|返还|返還/.test(first)) continue;

    records.push({
      market: "europe",
      company: first,
      win: cells[1]?.text || "",
      draw: cells[2]?.text || "",
      loss: cells[3]?.text || "",
      winRate: cells[4]?.text || "",
      drawRate: cells[5]?.text || "",
      lossRate: cells[6]?.text || "",
      returnRate: cells[7]?.text || "",
      kellyWin: cells[8]?.text || "",
      kellyDraw: cells[9]?.text || "",
      kellyLoss: cells[10]?.text || "",
      changedAt: cells[11]?.text || "",
      raw: cells.map((cell) => cell.text),
    });
  }

  return records;
}

function extractJsArrayStrings(scriptText, variableName) {
  const regex = new RegExp(`var\\s+${variableName}\\s*=\\s*Array\\(([^]*?)\\);`);
  const match = regex.exec(scriptText);
  let source = match?.[1] || "";
  if (!source) {
    const startRegex = new RegExp(`var\\s+${variableName}\\s*=\\s*Array\\(`);
    const startMatch = startRegex.exec(scriptText);
    if (!startMatch) return [];
    const start = startMatch.index + startMatch[0].length;
    const end = scriptText.indexOf(");", start);
    source = end >= 0 ? scriptText.slice(start, end) : scriptText.slice(start);
  }

  const values = [];
  const stringRegex = /"((?:\\.|[^"\\])*)"/g;
  let item;
  while ((item = stringRegex.exec(source))) {
    values.push(item[1].replace(/\\"/g, "\"").replace(/\\\\/g, "\\"));
  }
  return values;
}

function formatTitanDateTime(value) {
  if (!value) return "";
  const parts = value.split(",");
  if (parts.length !== 6) return value;

  const year = parts[0];
  const month = parts[1].split("-")[0].padStart(2, "0");
  const day = parts[2].padStart(2, "0");
  const hour = parts[3].padStart(2, "0");
  const minute = parts[4].padStart(2, "0");
  const second = parts[5].padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function europeRowTime(row, fallbackIndex = 0) {
  const value = String(row?.changedAt || "").trim();
  if (!value) return fallbackIndex;
  const normalized = value.replace(/-/g, "/");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : fallbackIndex;
}

function latestEuropeRows(rows) {
  const latestByBookmaker = new Map();
  rows.forEach((row, index) => {
    const key = row.bookmakerKey || row.companyId || row.company || row.englishName || `row-${index}`;
    const current = latestByBookmaker.get(key);
    if (!current || europeRowTime(row, index) >= europeRowTime(current, current.__sourceIndex || 0)) {
      latestByBookmaker.set(key, { ...row, __sourceIndex: index });
    }
  });
  return [...latestByBookmaker.values()]
    .sort((a, b) => (a.__sourceIndex || 0) - (b.__sourceIndex || 0))
    .map(({ __sourceIndex, ...row }) => row);
}

function parseEuropeDataJs(scriptText) {
  const rows = extractJsArrayStrings(scriptText, "game");

  return rows
    .map((row) => {
      const fields = row.split("|");
      if (fields.length < 22) return null;

      return {
        market: "europe",
        companyId: fields[0] || "",
        oddsId: fields[1] || "",
        englishName: fields[2] || "",
        company: fields[21] || fields[2] || "",
        initial: {
          win: fields[3] || "",
          draw: fields[4] || "",
          loss: fields[5] || "",
          winRate: fields[6] || "",
          drawRate: fields[7] || "",
          lossRate: fields[8] || "",
          returnRate: fields[9] || "",
          kellyWin: fields[24] || "",
          kellyDraw: fields[25] || "",
          kellyLoss: fields[26] || "",
        },
        current: {
          win: fields[10] || "",
          draw: fields[11] || "",
          loss: fields[12] || "",
          winRate: fields[13] || "",
          drawRate: fields[14] || "",
          lossRate: fields[15] || "",
          returnRate: fields[16] || "",
          kellyWin: fields[17] || "",
          kellyDraw: fields[18] || "",
          kellyLoss: fields[19] || "",
        },
        changedAt: formatTitanDateTime(fields[20] || ""),
        isPrimary: fields[22] === "1",
        isExchange: fields[23] === "1",
        win: fields[10] || "",
        draw: fields[11] || "",
        loss: fields[12] || "",
        winRate: fields[13] || "",
        drawRate: fields[14] || "",
        lossRate: fields[15] || "",
        returnRate: fields[16] || "",
        kellyWin: fields[17] || "",
        kellyDraw: fields[18] || "",
        kellyLoss: fields[19] || "",
        raw: fields,
      };
    })
    .filter(Boolean);
}

function extractEuropeDataUrl(html, matchId, pageUrl) {
  const scriptRegex = /<script\b[^>]*\bsrc\s*=\s*["']([^"']*1x2d\.titan007\.com\/[^"']+\.js[^"']*)["'][^>]*>/i;
  const match = scriptRegex.exec(html);
  if (match) return new URL(match[1], pageUrl).toString();
  return `https://1x2d.titan007.com/${matchId}.js?r=007${Date.now()}`;
}

function directEuropeDataUrls(matchId) {
  return [
    `https://1x2d.titan007.com/${matchId}.js?r=007${Date.now()}`,
    `https://1x2d.titan007.com/${matchId}.js`,
  ];
}

function parseLiveMatches(scriptText, options = {}) {
  const records = [];
  const regex = /A\[(\d+)]\s*=\s*"([\s\S]*?)"\.split\('\^'\);/g;
  const allowedLeagueSet = buildAllowedLeagueSet(options.allowedLeagues);
  let match;

  while ((match = regex.exec(scriptText))) {
    const fields = match[2].split("^");
    const record = {
      index: Number(match[1]),
      matchId: fields[0] || "",
      league: cleanMatchText(fields[3] || fields[2] || ""),
      leagueSimplified: cleanMatchText(fields[2] || ""),
      leagueTraditional: cleanMatchText(fields[3] || ""),
      home: cleanMatchText(fields[6] || fields[5] || ""),
      homeSimplified: cleanMatchText(fields[5] || ""),
      homeTraditional: cleanMatchText(fields[6] || ""),
      away: cleanMatchText(fields[9] || fields[8] || ""),
      awaySimplified: cleanMatchText(fields[8] || ""),
      awayTraditional: cleanMatchText(fields[9] || ""),
      kickoffTime: fields[11] || "",
      stateCode: fields[13] || "",
      state: stateLabel(fields[13]),
      score: scoreText(fields[14], fields[15]),
      halfScore: scoreText(fields[18], fields[19]),
      asianInitialLine: fields[29] || "",
      totalInitialLine: fields[46] || "",
    };

    if (!recordMatchesAllowedLeagues(record, allowedLeagueSet)) continue;
    if (!recordMatchesLeagueSearch(record, options.league)) continue;

    records.push(record);
  }

  const limit = Number(options.limit || records.length);
  return records.slice(0, Number.isFinite(limit) ? limit : records.length);
}

function scoreText(home, away) {
  if (home === undefined || away === undefined || home === "" || away === "") return "";
  return `${home}-${away}`;
}

function stateLabel(code) {
  const map = {
    "-1": "完場",
    "0": "未開",
    "1": "上半場",
    "2": "中場",
    "3": "下半場",
    "4": "加時",
    "5": "點球",
  };
  return map[String(code)] || String(code || "");
}

function oddsUrls(matchId) {
  const base = "https://vip.titan007.com";
  return {
    asianFull: `${base}/AsianOdds_n.aspx?id=${matchId}&t=0&l=1`,
    asianHalf: `${base}/AsianOdds_n.aspx?id=${matchId}&t=1&l=1`,
    overUnderFull: `${base}/OverDown_n.aspx?id=${matchId}&t=0&l=1`,
    overUnderHalf: `${base}/OverDown_n.aspx?id=${matchId}&t=1&l=1`,
    europe: [
      `https://1x2.titan007.com/oddslist/${matchId}_2.htm`,
      `https://op1.titan007.com/oddslist/${matchId}_2.htm`,
      `https://vip.titan007.com/EuropeOdds.aspx?id=${matchId}&l=1`,
    ],
  };
}

async function fetchLiveMatches(options = {}) {
  const url = `https://live.titan007.com/VbsXml/bfdata_ut.js?r=007&_${Date.now()}`;
  const attempts = [
    {
      referer: DEFAULT_REFERER,
      preferCurl: true,
      curlOnly: true,
      rejectIncomplete: true,
      timeoutMs: 65000,
      curlTimeoutMs: 55000,
      attempts: 1,
    },
    {
      referer: DEFAULT_REFERER,
      preferCurl: false,
      rejectIncomplete: true,
      timeoutMs: 65000,
      attempts: 1,
      idleCompleteMs: 0,
    },
    {
      referer: DEFAULT_REFERER,
      preferCurl: true,
      timeoutMs: 65000,
      curlTimeoutMs: 55000,
      attempts: 1,
    },
  ];
  const errors = [];

  for (const attemptOptions of attempts) {
    try {
      const response = await fetchFirstAvailable([url], attemptOptions);
      return parseLiveMatches(response.text, options);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.join(" | "));
}

function summarizeTargetCoverage(rows, options = {}) {
  const targetRows = filterBookmakerRows(rows, {
    ...options,
    bookmakers: undefined,
    filterBookmakers: undefined,
    dedupeBookmakers: true,
  });
  const bookmakerKeys = [...new Set(targetRows.map((row) => row.bookmakerKey).filter(Boolean))];
  return {
    rows: targetRows,
    bookmakerKeys,
    bookmakerCount: bookmakerKeys.length,
  };
}

function expectedBookmakerKeysForMarket(market, options = {}) {
  if (Array.isArray(options.bookmakers) && options.bookmakers.length) {
    return options.bookmakers.map(resolveBookmakerKey).filter(Boolean);
  }
  return requiredBookmakerKeysForMarket(market);
}

function bookmakerLabelsForKeys(keys) {
  return keys.map((key) => BOOKMAKER_GROUP_BY_KEY.get(key)?.label || key);
}

function matchIdFromOddsUrl(url) {
  try {
    return new URL(url).searchParams.get("id") || "";
  } catch {
    return "";
  }
}

function buildMarketCandidate(url, response, rows, market, period, options = {}) {
  const filteredRows = filterBookmakerRows(rows, options);
  const coverage = summarizeTargetCoverage(rows, options);
  const expectedBookmakers = expectedBookmakerKeysForMarket(market, options);
  const missingTargetBookmakers = expectedBookmakers.filter((key) => !coverage.bookmakerKeys.includes(key));
  const coveredExpectedBookmakers = expectedBookmakers.filter((key) => coverage.bookmakerKeys.includes(key));
  const score = coverage.bookmakerCount * 1000 + filteredRows.length * 10 + rows.length - (response.incomplete ? 5000 : 0);

  return {
    sourceUrl: response.url || url,
    rows: filteredRows,
    rawRowCount: rows.length,
    targetBookmakerCount: coveredExpectedBookmakers.length,
    targetBookmakers: coverage.bookmakerKeys,
    expectedTargetBookmakers: expectedBookmakers,
    optionalTargetBookmakers: coverage.bookmakerKeys.filter((key) => !expectedBookmakers.includes(key)),
    missingTargetBookmakers,
    coverageLabel: `${coveredExpectedBookmakers.length}/${expectedBookmakers.length}`,
    missingTargetBookmakerLabels: bookmakerLabelsForKeys(missingTargetBookmakers),
    matchMeta: parseOddsPageMeta(response.text, matchIdFromOddsUrl(response.url || url)),
    incomplete: Boolean(response.incomplete),
    score,
    market,
    period,
  };
}

function marketCandidateNeedsRetry(candidate) {
  if (!candidate) return true;
  if (candidate.incomplete) return true;
  if (!candidate.rawRowCount) return true;

  const expectedTargetCount = Math.min(7, candidate.expectedTargetBookmakers?.length || 7);
  const broadEnoughRawTable = candidate.rawRowCount >= 20;
  return candidate.targetBookmakerCount < expectedTargetCount && !broadEnoughRawTable;
}

async function fetchAndParseMarket(url, market, period, options) {
  const deepMode = options?.extractionMode === "deep";
  const attempts = deepMode
    ? [
        {
          referer: DEFAULT_REFERER,
          timeoutMs: 30000,
          attempts: 2,
          preferCurl: true,
          curlOnly: true,
          curlTimeoutMs: 18000,
          rejectIncomplete: true,
        },
        {
          referer: DEFAULT_REFERER,
          timeoutMs: 45000,
          attempts: 1,
          preferCurl: true,
          curlOnly: true,
          curlTimeoutMs: 35000,
          rejectIncomplete: true,
        },
        {
          referer: DEFAULT_REFERER,
          timeoutMs: 30000,
          attempts: 1,
          preferCurl: false,
          idleCompleteMs: 0,
        },
      ]
    : [
        {
          referer: DEFAULT_REFERER,
          timeoutMs: 16000,
          attempts: 1,
          preferCurl: true,
          curlOnly: true,
          curlTimeoutMs: 15000,
          rejectIncomplete: false,
        },
      ];
  const errors = [];
  let bestCandidate = null;

  for (const attemptOptions of attempts) {
    try {
      const response = await fetchFirstAvailable([url], attemptOptions);
      const rows = parseOddsTable(response.text, market, period, options);
      const candidate = buildMarketCandidate(url, response, rows, market, period, options);
      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
      const shouldRetry = deepMode ? marketCandidateNeedsRetry(candidate) : !candidate.rawRowCount;
      if (!shouldRetry) {
        const { score, incomplete, ...output } = candidate;
        return output;
      }
      errors.push(
        `${url}: weak ${market} ${period} response (${candidate.coverageLabel} target bookmakers, ${candidate.rawRowCount} raw rows)`
      );
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (bestCandidate) {
    const { score, incomplete, ...output } = bestCandidate;
    return {
      ...output,
      warning: errors.join(" | "),
    };
  }

  throw new Error(errors.join(" | "));
}

async function safeFetchAndParseMarket(url, market, period, options) {
  try {
    return await fetchAndParseMarket(url, market, period, options);
  } catch (error) {
    return {
      sourceUrl: url,
      rows: [],
      error: error.message,
    };
  }
}

async function fetchEurope(matchId, urls, options = {}) {
  const deepMode = options.extractionMode === "deep";
  const directFetchOptions = deepMode
    ? {
        referer: "https://1x2.titan007.com/",
        timeoutMs: 40000,
        attempts: 2,
        preferCurl: true,
        curlOnly: true,
        curlTimeoutMs: 35000,
      }
    : {
        referer: "https://1x2.titan007.com/",
        timeoutMs: 16000,
        attempts: 1,
        preferCurl: true,
        curlOnly: true,
        curlTimeoutMs: 15000,
      };
  const directErrors = [];
  const parseDirectEuropeResponse = (dataUrl, response) => {
    const dataRows = parseEuropeDataJs(response.text);
    if (!dataRows.length) {
      throw new Error(`${dataUrl}: no Europe rows`);
    }
    return {
      sourceUrl: dataUrl,
      dataUrl: response.url,
      rows: filterBookmakerRows(latestEuropeRows(dataRows), options),
      error: "",
    };
  };

  if (!deepMode) {
    try {
      return await Promise.any(
        directEuropeDataUrls(matchId).map((dataUrl) =>
          fetchFirstAvailable([dataUrl], directFetchOptions).then((response) =>
            parseDirectEuropeResponse(dataUrl, response)
          )
        )
      );
    } catch (error) {
      const errors = error?.errors?.length ? error.errors.map((item) => item.message || String(item)) : [error.message || String(error)];
      return {
        sourceUrl: directEuropeDataUrls(matchId)[0],
        dataUrl: "",
        rows: [],
        error: errors.join(" | "),
      };
    }
  }

  for (const dataUrl of directEuropeDataUrls(matchId)) {
    try {
      const response = await fetchFirstAvailable([dataUrl], directFetchOptions);
      return parseDirectEuropeResponse(dataUrl, response);
    } catch (error) {
      directErrors.push(`${dataUrl}: ${error.message}`);
    }
  }

  try {
    const page = await fetchFirstAvailable(urls, {
      referer: DEFAULT_REFERER,
      timeoutMs: 20000,
      attempts: 1,
      preferCurl: true,
    });
    const dataUrl = extractEuropeDataUrl(page.text, matchId, page.url);
    const response = await fetchFirstAvailable([dataUrl], {
      referer: page.url,
      timeoutMs: 45000,
      attempts: 2,
      preferCurl: true,
    });
    const dataRows = parseEuropeDataJs(response.text);
    const rows = latestEuropeRows(dataRows.length ? dataRows : parseEuropeOdds(page.text));

    return {
      sourceUrl: page.url,
      dataUrl: response.url,
      rows: filterBookmakerRows(rows, options),
      error: "",
    };
  } catch (error) {
    return {
      sourceUrl: urls[0],
      dataUrl: "",
      rows: [],
      error: [...directErrors, error.message].filter(Boolean).join(" | "),
    };
  }
}

function mergeMatchMeta(...items) {
  const merged = {};
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    for (const key of ["matchId", "league", "kickoffTime", "home", "away", "state", "score", "halfScore"]) {
      const value = String(item[key] || "").trim();
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

async function extractMatchOdds(matchId, options = {}) {
  const urls = oddsUrls(matchId);
  const deepMode = options.extractionMode === "deep";
  let asianFull;
  let asianHalf;
  let overUnderFull;
  let overUnderHalf;
  let europe;

  if (deepMode) {
    [asianFull, asianHalf] = await Promise.all([
      safeFetchAndParseMarket(urls.asianFull, "asian", "full", options),
      safeFetchAndParseMarket(urls.asianHalf, "asian", "half", options),
    ]);
    [overUnderFull, overUnderHalf] = await Promise.all([
      safeFetchAndParseMarket(urls.overUnderFull, "overUnder", "full", options),
      safeFetchAndParseMarket(urls.overUnderHalf, "overUnder", "half", options),
    ]);
    europe = await fetchEurope(matchId, urls.europe, options);
  } else {
    [asianFull, asianHalf, overUnderFull, overUnderHalf, europe] = await Promise.all([
      safeFetchAndParseMarket(urls.asianFull, "asian", "full", options),
      safeFetchAndParseMarket(urls.asianHalf, "asian", "half", options),
      safeFetchAndParseMarket(urls.overUnderFull, "overUnder", "full", options),
      safeFetchAndParseMarket(urls.overUnderHalf, "overUnder", "half", options),
      fetchEurope(matchId, urls.europe, options),
    ]);
  }
  const match = mergeMatchMeta(
    asianFull?.matchMeta,
    asianHalf?.matchMeta,
    overUnderFull?.matchMeta,
    overUnderHalf?.matchMeta,
    { matchId }
  );

  return {
    matchId,
    match,
    fetchedAt: new Date().toISOString(),
    extractionMode: options.extractionMode === "deep" ? "deep" : "fast",
    includeMulti: Boolean(options.includeMulti),
    urls: {
      asianFull: urls.asianFull,
      asianHalf: urls.asianHalf,
      overUnderFull: urls.overUnderFull,
      overUnderHalf: urls.overUnderHalf,
      europe: urls.europe,
    },
    asian: {
      full: asianFull,
      half: asianHalf,
    },
    overUnder: {
      full: overUnderFull,
      half: overUnderHalf,
    },
    europe,
  };
}

async function checkTitanConnection(options = {}) {
  const startedAt = Date.now();
  const matchLimit = Number(options.matchLimit || 20);
  const tryMatches = Math.max(1, Math.min(Number(options.tryMatches || 8), 20));
  let matches = await fetchLiveMatches({
    limit: Number.isFinite(matchLimit) ? matchLimit : 20,
    allowedLeagues: options.allowedLeagues,
  });

  if (!matches.length) {
    matches = await fetchLiveMatches({
      limit: Number.isFinite(matchLimit) ? matchLimit : 20,
      allowedLeagues: false,
    });
  }

  const candidates = matches.filter((item) => /^\d+$/.test(String(item.matchId || ""))).slice(0, tryMatches);
  if (!candidates.length) {
    throw new Error("Titan007 live list responded but no usable match id was found");
  }

  const errors = [];
  let fallbackResult = null;
  for (const match of candidates) {
    const url = oddsUrls(match.matchId).asianFull;
    try {
      const response = await fetchFirstAvailable([url], {
        referer: DEFAULT_REFERER,
        timeoutMs: Number(options.timeoutMs || 15000),
        attempts: 1,
        preferCurl: true,
      });
      const rows = parseOddsTable(response.text, "asian", "full", options);
      const filteredRows = filterBookmakerRows(rows, options);
      const result = {
        ok: true,
        status: filteredRows.length ? "online" : rows.length ? "online_no_target_bookmakers" : "online_no_rows",
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        market: "asianFull",
        sourceUrl: response.url || url,
        rowCount: filteredRows.length,
        rawRowCount: rows.length,
        triedMatches: candidates.length,
        sampleBookmakers: filteredRows.slice(0, 5).map((row) => row.bookmaker || row.bookmakerKey || "").filter(Boolean),
        match: {
          matchId: match.matchId,
          league: match.league,
          kickoffTime: match.kickoffTime,
          home: match.home,
          away: match.away,
          state: match.state,
          score: match.score,
        },
      };
      if (filteredRows.length || rows.length) return result;
      fallbackResult = fallbackResult || result;
    } catch (error) {
      errors.push(`${match.matchId}: ${error.message || String(error)}`);
    }
  }

  if (fallbackResult) {
    return {
      ...fallbackResult,
      errors,
    };
  }

  throw new Error(`Titan007 health check failed after ${candidates.length} matches: ${errors.slice(0, 3).join(" | ")}`);
}

function normalizeMatchItems(items) {
  const source = Array.isArray(items) ? items : [items];
  const seen = new Set();
  const output = [];

  for (const item of source) {
    const rawMatchId = typeof item === "object" && item !== null ? item.matchId : item;
    const matchId = String(rawMatchId || "").trim();
    if (!/^\d+$/.test(matchId) || seen.has(matchId)) continue;

    seen.add(matchId);
    output.push({
      ...(typeof item === "object" && item !== null ? item : {}),
      matchId,
    });
  }

  return output;
}

async function extractBatchOdds(matchItems, options = {}) {
  const items = normalizeMatchItems(matchItems);
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 1), 3));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      const match = items[index];
      try {
        const data = await extractMatchOdds(match.matchId, options);
        const enrichedMatch = mergeMatchMeta(match, data.match, { matchId: match.matchId });
        results[index] = {
          ok: true,
          matchId: match.matchId,
          match: enrichedMatch,
          data,
          error: "",
        };
      } catch (error) {
        results[index] = {
          ok: false,
          matchId: match.matchId,
          match,
          data: null,
          error: error.message || String(error),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  return {
    fetchedAt: new Date().toISOString(),
    total: items.length,
    okCount: results.filter((result) => result?.ok).length,
    errorCount: results.filter((result) => result && !result.ok).length,
    results,
  };
}

function titanProbabilityUrl(matchId) {
  return `https://m.titan007.com/analy/Analysis/${encodeURIComponent(matchId)}.htm`;
}

function probabilitySectionHtml(html) {
  const marker = /概率事件|概率|Probability\s*Events?/i.exec(html);
  if (!marker) return "";
  return html.slice(marker.index, marker.index + 50000);
}

function probabilityTextLines(html) {
  return decodeEntities(
    stripTags(
      html
        .replace(/<\/(?:div|li|p|tr|td|dd|dt|section|article|h[1-6])>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
    )
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function probabilityDescription(line, matches, nextLine = "") {
  const last = matches[matches.length - 1];
  const afterLastPercent = line.slice(last.index + last[0].length).replace(/^[\s,，;；|/·•-]+/, "").trim();
  if (afterLastPercent) return afterLastPercent;
  if (nextLine && !/%/.test(nextLine)) return nextLine.trim();
  return "";
}

function extractJsObjectLiteral(html, variableName) {
  const marker = new RegExp(`\\bvar\\s+${variableName}\\s*=`, "i").exec(html);
  if (!marker) return "";
  const start = html.indexOf("{", marker.index + marker[0].length);
  if (start < 0) return "";

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  return "";
}

function parseFreshJsonData(html) {
  const literal = extractJsObjectLiteral(html, "freshJsonData");
  if (!literal) return null;
  try {
    return JSON.parse(literal);
  } catch {
    return null;
  }
}

function probabilityScaleEvents(stat, typeConfig) {
  return [
    { type: typeConfig.win, percent: Number(stat.winScale) },
    { type: typeConfig.draw, percent: Number(stat.drawScale) },
    { type: typeConfig.loss, percent: Number(stat.lossScale) },
  ];
}

function probabilitySampleCountFromText(value) {
  const match = /近\s*(\d+)\s*[场場]/.exec(String(value || ""));
  return match ? Number(match[1]) : null;
}

function probabilitySampleCount(stat, description = "") {
  const statCount = Number(stat?.count);
  if (Number.isFinite(statCount) && statCount > 0) return statCount;
  const textCount = probabilitySampleCountFromText(description);
  return Number.isFinite(textCount) ? textCount : 0;
}

function hasProbabilityJsonData(html) {
  const data = parseFreshJsonData(html);
  return Array.isArray(data?.probabilityDatas?.dataList);
}

function probabilityMarketAllowed(text) {
  const value = String(text || "");
  if (/胜平负|勝平負/i.test(value)) return false;
  return /让球|讓球|总进球数|總進球數|进球数|進球數/i.test(value);
}

function parseProbabilityEventsFromJson(html, options = {}) {
  const threshold = Number(options.threshold ?? 80);
  const minSampleCount = Number(options.minSampleCount ?? 10);
  const data = parseFreshJsonData(html);
  const dataList = data?.probabilityDatas?.dataList;
  if (!Array.isArray(dataList)) return [];

  const typeLabels = {
    LETGOAL: { market: "让球", win: "赢", draw: "走", loss: "输" },
    OU: { market: "总进球数", win: "大", draw: "走", loss: "小" },
  };
  const events = [];
  const seen = new Set();

  for (const company of dataList) {
    for (const typeData of company.typeDatas || []) {
      if (typeData.kind !== "ALL") continue;
      const typeConfig = typeLabels[typeData.oddsType];
      if (!typeConfig) continue;

      const stats = typeData.probStatistics || [];
      const stat =
        stats.find((item) => item.countType === "Ten" && probabilitySampleCount(item) >= minSampleCount) ||
        stats.find((item) => probabilitySampleCount(item) >= minSampleCount);
      if (!stat) continue;
      const sampleCount = probabilitySampleCount(stat);

      const scales = probabilityScaleEvents(stat, typeConfig);
      const rawLine = scales.map((item) => `${item.type}:${Number.isFinite(item.percent) ? item.percent : 0}%`).join(" ");
      const description = `近${sampleCount}场${company.companyName || ""}相同${typeConfig.market}`;

      for (const item of scales) {
        if (!Number.isFinite(item.percent) || item.percent < threshold) continue;
        const key = `${company.companyId}|${typeData.oddsType}|${item.type}|${item.percent}|${description}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
          type: item.type,
          percent: item.percent,
          description,
          rawLine,
          companyName: company.companyName || "",
          companyId: company.companyId || "",
          market: typeConfig.market,
          oddsType: typeData.oddsType,
          count: sampleCount,
          kind: typeData.kind,
        });
      }
    }
  }

  return events;
}

function parseProbabilityEvents(html, options = {}) {
  const threshold = Number(options.threshold ?? 80);
  const minSampleCount = Number(options.minSampleCount ?? 10);
  const jsonEvents = parseProbabilityEventsFromJson(html, options);
  if (jsonEvents.length || hasProbabilityJsonData(html)) return jsonEvents;

  const section = probabilitySectionHtml(html);
  if (!section) return [];

  const lines = probabilityTextLines(section);
  const events = [];
  const seen = new Set();
  const percentRegex = /([^\s:：,，;；|/]+)\s*[:：]\s*(\d+(?:\.\d+)?)\s*%/g;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matches = [...line.matchAll(percentRegex)].filter((match) => Number.isFinite(Number(match[2])));
    if (!matches.length) continue;

    const description = probabilityDescription(line, matches, lines[index + 1] || "");
    if (!probabilityMarketAllowed(description || line)) continue;
    if (probabilitySampleCountFromText(description) < minSampleCount) continue;
    for (const match of matches) {
      const percent = Number(match[2]);
      if (percent < threshold) continue;

      const type = match[1].replace(/^[·•\-\s]+/, "").trim();
      const key = `${type}|${percent}|${description}|${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        type,
        percent,
        description,
        rawLine: line,
      });
    }
  }

  return events;
}

async function fetchTitanProbabilityEvents(match, options = {}) {
  const threshold = Number(options.threshold ?? 80);
  const sourcePage = titanProbabilityUrl(match.matchId);
  const page = await fetchFirstAvailable([sourcePage], {
    referer: "https://m.titan007.com/",
    userAgent: MOBILE_USER_AGENT,
    timeoutMs: options.timeoutMs || 30000,
    attempts: options.attempts || 1,
    preferCurl: true,
  });
  const events = parseProbabilityEvents(page.text, { threshold }).map((event) => ({
    matchId: match.matchId,
    league: match.league || "",
    kickoffTime: match.kickoffTime || "",
    state: match.state || "",
    score: match.score || "",
    home: match.home || "",
    away: match.away || "",
    type: event.type,
    percent: event.percent,
    description: event.description,
    rawLine: event.rawLine,
    companyName: event.companyName || "",
    companyId: event.companyId || "",
    market: event.market || "",
    oddsType: event.oddsType || "",
    count: event.count || "",
    kind: event.kind || "",
    sourcePage,
  }));

  return {
    matchId: match.matchId,
    match,
    sourcePage,
    events,
  };
}

async function scanTitanProbabilityEvents(matchItems, options = {}) {
  const items = normalizeMatchItems(matchItems);
  const threshold = Number(options.threshold ?? 80);
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 2), 3));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      const match = items[index];
      try {
        const data = await fetchTitanProbabilityEvents(match, { ...options, threshold });
        results[index] = {
          ok: true,
          matchId: match.matchId,
          match,
          sourcePage: data.sourcePage,
          hits: data.events,
          error: "",
        };
      } catch (error) {
        const message = error.message || String(error);
        const noData =
          /Titan007 returned an error page|HTTP 404|no-match|Object reference|暂无相关数据|暂无数据/i.test(message);
        results[index] = {
          ok: noData,
          noData,
          matchId: match.matchId,
          match,
          sourcePage: titanProbabilityUrl(match.matchId),
          hits: [],
          error: noData ? "" : message,
          note: noData ? "Titan007 Mobile 未提供此場概率事件資料" : "",
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  const hits = results.flatMap((result) => result?.hits || []);
  return {
    fetchedAt: new Date().toISOString(),
    threshold,
    total: items.length,
    okCount: results.filter((result) => result?.ok).length,
    errorCount: results.filter((result) => result && !result.ok).length,
    noDataCount: results.filter((result) => result?.noData).length,
    hitCount: hits.length,
    matchHitCount: new Set(hits.map((hit) => hit.matchId)).size,
    hits,
    results,
  };
}

module.exports = {
  BOOKMAKER_GROUPS,
  DEFAULT_ALLOWED_LEAGUES,
  checkTitanConnection,
  extractBatchOdds,
  extractMatchOdds,
  filterBookmakerRows,
  fetchLiveMatches,
  identifyBookmaker,
  identifyBookmakerFromRow,
  normalizeMatchItems,
  parseBoolean,
  parseLiveMatches,
  parseProbabilityEvents,
  parseOddsTable,
  parseEuropeDataJs,
  parseEuropeOdds,
  scanTitanProbabilityEvents,
  _internals: {
    bufferDeclaresUtf8,
    countTitanMojibakeChars,
    decodeBuffer,
    extractCells,
    extractRows,
    extractTableById,
    extractFlatOddsRows,
    extractJsObjectLiteral,
    assertUsefulHtml,
    buildAllowedLeagueSet,
    expectedBookmakerKeysForMarket,
    latestEuropeRows,
    normalizeComparableText,
    normalizeMatchItems,
    parseOddsPageMeta,
    parseProbabilityEvents,
    parseProbabilityEventsFromJson,
    probabilityTextLines,
    recordMatchesAllowedLeagues,
    titanProbabilityUrl,
  },
};
