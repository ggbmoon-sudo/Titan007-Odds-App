const https = require("node:https");
const zlib = require("node:zlib");

const HKJC_GRAPHQL_URL = "https://info.cld.hkjc.com/graphql/base/";
const HKJC_REFERER = "https://bet.hkjc.com/ch/football/had";

const HKJC_POOLS = {
  HAD: {
    page: "had",
    oddsTypes: ["HAD"],
  },
  FHA: {
    page: "fha",
    oddsTypes: ["FHA"],
  },
  HHA: {
    page: "hha",
    oddsTypes: ["HHA", "EHH"],
  },
  HIL: {
    page: "hil",
    oddsTypes: ["HIL", "EHL"],
  },
  FHL: {
    page: "fhl",
    oddsTypes: ["FHL"],
  },
  FCS: {
    page: "fcs",
    oddsTypes: ["FCS"],
  },
  CRS: {
    page: "crs",
    oddsTypes: ["CRS"],
  },
};

const HKJC_SPECIAL_RULES = [
  { pool: "HAD", label: "主客和：主/客 1.73 或 1.76" },
  { pool: "HAD", label: "主客和：2.14 / 3.00 / 3.00" },
  { pool: "HAD", label: "主客和：3.00 / 3.00 / 2.14" },
  { pool: "FHA", label: "半場主客和：和 1.76" },
  { pool: "FHA", label: "半場主客和：主/客 2.03" },
  { pool: "HHA", label: "讓球主客和：和 3.10" },
  { pool: "HIL", label: "入球大細：1.66 或 1.69" },
  { pool: "FHL", label: "半場入球大細：1.66 / 1.69 / 1.94" },
];

const MAX_CORRECT_SCORE_EQUAL_ODDS = 15;

const HKJC_MATCH_QUERY = `
      query matchList($startIndex: Int, $endIndex: Int,$startDate: String, $endDate: String, $matchIds: [String], $tournIds: [String], $fbOddsTypes: [FBOddsType]!, $fbOddsTypesM: [FBOddsType]!, $inplayOnly: Boolean, $featuredMatchesOnly: Boolean, $frontEndIds: [String], $earlySettlementOnly: Boolean, $showAllMatch: Boolean) {
        matches(startIndex: $startIndex,endIndex: $endIndex, startDate: $startDate, endDate: $endDate, matchIds: $matchIds, tournIds: $tournIds, fbOddsTypes: $fbOddsTypesM, inplayOnly: $inplayOnly, featuredMatchesOnly: $featuredMatchesOnly, frontEndIds: $frontEndIds, earlySettlementOnly: $earlySettlementOnly, showAllMatch: $showAllMatch) {
          id
          frontEndId
          matchDate
          kickOffTime
          status
          updateAt
          sequence
          esIndicatorEnabled
          homeTeam { id name_en name_ch }
          awayTeam { id name_en name_ch }
          tournament { id frontEndId nameProfileId isInteractiveServiceAvailable code name_en name_ch }
          isInteractiveServiceAvailable
          inplayDelay
          venue { code name_en name_ch }
          tvChannels { code name_en name_ch }
          liveEvents { id code }
          featureStartTime
          featureMatchSequence
          poolInfo { normalPools inplayPools sellingPools ntsInfo entInfo definedPools }
          runningResult { homeScore awayScore corner homeCorner awayCorner }
          runningResultExtra { homeScore awayScore corner homeCorner awayCorner }
          adminOperation { remark { typ } }
          foPools(fbOddsTypes: $fbOddsTypes) { id status oddsType instNo inplay name_ch name_en updateAt expectedSuspendDateTime lines { lineId status condition main combinations { combId str status offerEarlySettlement currentOdds selections { selId str name_ch name_en } } } }
        }
      }
      `;

function normalizeOdds(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value).trim();
  return number.toFixed(2);
}

function sameOdds(value, target) {
  return normalizeOdds(value) === normalizeOdds(target);
}

function decodeResponse(buffer, encoding) {
  if (encoding === "gzip") return zlib.gunzipSync(buffer).toString("utf8");
  if (encoding === "deflate") return zlib.inflateSync(buffer).toString("utf8");
  if (encoding === "br") return zlib.brotliDecompressSync(buffer).toString("utf8");
  return buffer.toString("utf8");
}

function postGraphql(body, options = {}) {
  const payload = JSON.stringify(body);
  const timeoutMs = options.timeoutMs || 20000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      callback(value);
    };
    const hardTimer = setTimeout(() => {
      if (req) req.destroy(new Error("Timeout while fetching HKJC odds"));
    }, timeoutMs);

    req = https.request(
      HKJC_GRAPHQL_URL,
      {
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          "accept-encoding": "gzip, deflate, br",
          "origin": "https://bet.hkjc.com",
          "referer": HKJC_REFERER,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const text = decodeResponse(Buffer.concat(chunks), res.headers["content-encoding"]);
            const json = JSON.parse(text);
            if (json.errors?.length) {
              finish(reject, new Error(json.errors.map((error) => error.message).join(" | ")));
              return;
            }
            finish(resolve, json);
          } catch (error) {
            finish(reject, error);
          }
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("Timeout while fetching HKJC odds")));
    req.on("error", (error) => finish(reject, error));
    req.end(payload);
  });
}

async function fetchHkjcPool(poolKey, options = {}) {
  const config = HKJC_POOLS[poolKey];
  if (!config) throw new Error(`Unsupported HKJC pool ${poolKey}`);

  const response = await postGraphql(
    {
      query: HKJC_MATCH_QUERY,
      variables: {
        startIndex: 0,
        endIndex: 200,
        startDate: null,
        endDate: null,
        matchIds: Array.isArray(options.matchIds) ? options.matchIds : null,
        tournIds: null,
        fbOddsTypes: config.oddsTypes,
        fbOddsTypesM: config.oddsTypes,
        inplayOnly: Boolean(options.inplayOnly),
        featuredMatchesOnly: false,
        frontEndIds: Array.isArray(options.frontEndIds) ? options.frontEndIds : null,
        earlySettlementOnly: false,
        showAllMatch: Boolean(options.showAllMatch),
      },
    },
    { timeoutMs: options.timeoutMs || 20000 }
  );

  return response.data?.matches || [];
}

function isWithinWindow(match, startTime, endTime) {
  const kickoff = new Date(match.kickOffTime);
  if (!Number.isFinite(kickoff.getTime())) return false;
  return kickoff >= startTime && kickoff <= endTime;
}

function baseMatch(match) {
  return {
    matchId: match.id || "",
    frontEndId: match.frontEndId || "",
    kickOffTime: match.kickOffTime || "",
    status: match.status || "",
    tournament: match.tournament?.name_ch || match.tournament?.name_en || "",
    tournamentCh: match.tournament?.name_ch || "",
    tournamentEn: match.tournament?.name_en || "",
    tournamentCode: match.tournament?.code || "",
    home: match.homeTeam?.name_ch || match.homeTeam?.name_en || "",
    homeCh: match.homeTeam?.name_ch || "",
    homeEn: match.homeTeam?.name_en || "",
    away: match.awayTeam?.name_ch || match.awayTeam?.name_en || "",
    awayCh: match.awayTeam?.name_ch || "",
    awayEn: match.awayTeam?.name_en || "",
  };
}

const TEXT_FOLD_MAP = {
  亞: "亚",
  盃: "杯",
  會: "会",
  聯: "联",
  隊: "队",
  賽: "赛",
  國: "国",
  聖: "圣",
  奧: "奥",
  費: "费",
  賴: "赖",
  頓: "顿",
  騰: "腾",
  學: "学",
  馬: "马",
  羅: "罗",
  爾: "尔",
  納: "纳",
  倫: "伦",
  華: "华",
  達: "达",
  維: "维",
  貝: "贝",
  門: "门",
  莊: "庄",
  頭: "头",
  龍: "龙",
  麥: "麦",
  魯: "鲁",
  蘭: "兰",
  諾: "诺",
  薩: "萨",
  歐: "欧",
  擊: "击",
  體: "体",
  運: "运",
  務: "务",
  萊: "莱",
  堅: "坚",
  錫: "锡",
  領: "领",
  萬: "万",
  當: "当",
};

const CLUB_PREFIXES = [
  "ca",
  "cd",
  "cf",
  "fc",
  "sc",
  "ac",
  "afc",
  "cs",
  "ec",
  "fk",
  "club",
  "clubatletico",
  "deportivo",
  "universidad",
];

const COMPETITION_ALIAS_GROUPS = [
  ["解放者杯", "南美自由杯", "南美自由盃", "libertadores", "copa libertadores"],
  ["南美杯", "南美盃", "南美球会杯", "南美球會盃", "sudamericana", "copa sudamericana"],
  ["欧霸杯", "歐霸盃", "欧罗巴杯", "歐羅巴盃", "欧洲联赛", "歐洲聯賽", "europa league"],
  ["欧会杯", "歐會盃", "欧洲协会联赛", "歐洲協會聯賽", "conference league"],
  ["日职联", "日職聯", "日职百年构想联赛", "日職百年構想聯賽", "j1 league"],
  ["澳昆超", "澳洲全國聯賽昆士蘭", "澳洲全國聯賽 - 昆士蘭", "npl queensland"],
  ["澳威超", "澳洲全國聯賽新南威爾斯", "澳洲全國聯賽 - 新南威爾斯", "npl new south wales", "npl nsw"],
  ["智利盃", "智利杯", "智利足總盃", "智利足总杯", "chile cup", "copa chile"],
  ["巴西乙", "巴乙", "巴西乙組聯賽", "巴西乙组联赛", "brazil serie b", "brazilian serie b", "brasileiro serie b"],
];

const TEAM_ALIAS_GROUPS = [
  ["費雷堡", "弗賴堡", "弗赖堡", "freiburg"],
  ["普拉騰斯", "普拉坦斯", "CA普拉坦斯", "platense"],
  ["彭拿路", "佩纳罗尔", "penarol"],
  ["科金博", "哥甘保", "coquimbo", "coquimbo unido"],
  ["秘魯體育大學", "秘鲁体育大学", "universitario", "universitario deportes"],
  ["伯明翰軍團", "伯明翰军团", "birmingham legion"],
  ["奧特黎獨立", "曼特寧獨立", "麥德林獨立", "麦德林独立", "independiente medellin"],
  ["法林明高", "弗拉门戈", "flamengo"],
  ["邦明", "布鲁明", "blooming"],
  ["波坦奴", "波特諾", "波特诺山丘", "cerro porteno"],
  ["青年體育會", "巴兰基亚青年", "atletico junior", "junior barranquilla"],
  ["卡拉波波", "卡拉保保", "carabobo"],
  ["河床", "river plate"],
  ["巴拉干天奴", "巴拉干天奴紅牛", "布拉干蒂诺RB", "bragantino", "rb bragantino", "red bull bragantino"],
  ["奧希金斯", "希金斯", "o higgins", "ohiggins"],
  ["聖保羅", "圣保罗", "sao paulo"],
  ["FC邁亞密", "邁亞密FC", "迈阿密FC", "miami fc"],
];

function foldComparableText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u4e00-\u9fff]/g, (char) => TEXT_FOLD_MAP[char] || char);
}

function normalizeTeamName(value) {
  const clubPrefixPattern = new RegExp(`^(?:${CLUB_PREFIXES.join("|")})(?=[\\u4e00-\\u9fff])`, "i");
  return foldComparableText(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(clubPrefixPattern, "")
    .replace(/\b(fc|sc|afc|cf|cd|ac|u19|u20|u21|u23)\b/gi, "")
    .replace(/([\u4e00-\u9fff])(?:fc|sc|afc|cf|cd|ac|fk)$/gi, "$1")
    .replace(/足球会|足球俱乐部|球会|俱乐部|女子|女足|青年队|预备队/g, "")
    .replace(/[^0-9a-z\u4e00-\u9fff]+/gi, "");
}

function ngrams(value) {
  const text = normalizeTeamName(value);
  if (!text) return [];
  if (text.length <= 2) return [...new Set([...text])];
  const grams = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.push(text.slice(index, index + 2));
  }
  return [...new Set(grams)];
}

function diceSimilarity(leftItems, rightItems) {
  if (!leftItems.length || !rightItems.length) return 0;
  const rightSet = new Set(rightItems);
  const overlap = leftItems.filter((item) => rightSet.has(item)).length;
  return (2 * overlap) / (leftItems.length + rightSet.size);
}

function editDistance(left, right) {
  const a = [...left];
  const b = [...right];
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost
      );
    }
    for (let column = 0; column <= b.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[b.length];
}

function editSimilarity(left, right) {
  if (!left || !right) return 0;
  const maxLength = Math.max([...left].length, [...right].length);
  if (!maxLength) return 0;
  return 1 - editDistance(left, right) / maxLength;
}

function aliasGroupMatch(left, right) {
  for (const group of TEAM_ALIAS_GROUPS) {
    const normalizedGroup = group.map(normalizeTeamName).filter(Boolean);
    if (normalizedGroup.includes(left) && normalizedGroup.includes(right)) return true;
  }
  return false;
}

function normalizedSimilarity(left, right) {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (aliasGroupMatch(a, b)) return 1;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.max(0.82, Math.min(0.96, ratio + 0.18));
  }

  const gramsA = ngrams(a);
  const gramsB = new Set(ngrams(b));
  const ngramScore = diceSimilarity(gramsA, [...gramsB]);
  const charScore = diceSimilarity([...new Set([...a])], [...new Set([...b])]);
  const editScore = editSimilarity(a, b);

  return Math.max(ngramScore, charScore * 0.96, editScore * 0.92);
}

function uniqueTeamNames(names) {
  const seen = new Set();
  const values = [];
  for (const name of names) {
    const raw = String(name || "").trim();
    const normalized = normalizeTeamName(raw);
    if (!raw || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(raw);
  }
  return values;
}

function teamNameCandidates(match, side) {
  if (!match) return [];
  const prefix = side === "away" ? "away" : "home";
  const team = match[`${prefix}Team`] || {};
  return uniqueTeamNames([
    match[prefix],
    match[`${prefix}Ch`],
    match[`${prefix}En`],
    match[`${prefix}Simplified`],
    match[`${prefix}Traditional`],
    match[`${prefix}English`],
    match[`${prefix}Name`],
    match[`${prefix}_team`],
    team.name_ch,
    team.name_en,
  ]);
}

function bestTeamSimilarity(leftNames, rightNames) {
  let best = 0;
  for (const left of leftNames) {
    for (const right of rightNames) {
      best = Math.max(best, normalizedSimilarity(left, right));
      if (best >= 1) return 1;
    }
  }
  return best;
}

function teamSimilarity(left, right) {
  return bestTeamSimilarity(uniqueTeamNames([left]), uniqueTeamNames([right]));
}

function sideSimilarity(titanMatch, hkjcMatch, titanSide, hkjcSide) {
  return bestTeamSimilarity(teamNameCandidates(titanMatch, titanSide), teamNameCandidates(hkjcMatch, hkjcSide));
}

function normalizeCompetitionName(value) {
  return foldComparableText(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/[^0-9a-z\u4e00-\u9fff]+/gi, "");
}

function competitionAliases(value) {
  const normalized = normalizeCompetitionName(value);
  if (!normalized) return new Set();
  for (const group of COMPETITION_ALIAS_GROUPS) {
    const normalizedGroup = group.map(normalizeCompetitionName).filter(Boolean);
    if (
      normalizedGroup.some(
        (alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized)
      )
    ) {
      return new Set(normalizedGroup);
    }
  }
  return new Set([normalized]);
}

function competitionSimilarity(titanMatch, hkjcMatch) {
  const titan = normalizeCompetitionName(titanMatch?.league || titanMatch?.tournament || "");
  const hkjc = normalizeCompetitionName(
    hkjcMatch?.tournament || hkjcMatch?.tournamentCh || hkjcMatch?.tournamentEn || hkjcMatch?.league || ""
  );
  if (!titan || !hkjc) return 0.5;
  if (titan === hkjc || titan.includes(hkjc) || hkjc.includes(titan)) return 1;

  const titanAliases = competitionAliases(titan);
  const hkjcAliases = competitionAliases(hkjc);
  if ([...titanAliases].some((alias) => hkjcAliases.has(alias))) return 1;

  const ngramScore = diceSimilarity(ngrams(titan), ngrams(hkjc));
  const charScore = diceSimilarity([...new Set([...titan])], [...new Set([...hkjc])]);
  return Math.max(ngramScore, charScore * 0.9);
}

function parseTitanTime(match) {
  const raw = String(match?.kickoffTime || match?.kickOffTime || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) return parsed;

  const time = raw.match(/(\d{1,2}):(\d{2})/);
  if (!time) return null;
  return {
    hour: Number(time[1]),
    minute: Number(time[2]),
    raw,
  };
}

function timeScore(titanMatch, hkjcMatch) {
  const titanTime = parseTitanTime(titanMatch);
  const hkjcTime = new Date(hkjcMatch.kickOffTime || hkjcMatch.kickoffTime || "");
  if (!titanTime || !Number.isFinite(hkjcTime.getTime())) return 0.5;

  if (titanTime instanceof Date) {
    const diffMinutes = Math.abs(titanTime.getTime() - hkjcTime.getTime()) / 60000;
    if (diffMinutes <= 10) return 1;
    if (diffMinutes <= 60) return 0.8;
    if (diffMinutes <= 180) return 0.55;
    return 0;
  }

  const hkjcMinutes = hkjcTime.getHours() * 60 + hkjcTime.getMinutes();
  const titanMinutes = titanTime.hour * 60 + titanTime.minute;
  const diff = Math.min(Math.abs(hkjcMinutes - titanMinutes), 1440 - Math.abs(hkjcMinutes - titanMinutes));
  if (diff <= 10) return 1;
  if (diff <= 60) return 0.8;
  if (diff <= 120) return 0.55;
  return 0.25;
}

function scoreMatchPair(titanMatch, hkjcMatch) {
  const directHome = sideSimilarity(titanMatch, hkjcMatch, "home", "home");
  const directAway = sideSimilarity(titanMatch, hkjcMatch, "away", "away");
  const swappedHome = sideSimilarity(titanMatch, hkjcMatch, "home", "away");
  const swappedAway = sideSimilarity(titanMatch, hkjcMatch, "away", "home");
  const directTeamScore = (directHome + directAway) / 2;
  const swappedTeamScore = (swappedHome + swappedAway) / 2;
  const swapped = swappedTeamScore > directTeamScore;
  const teamScore = Math.max(directTeamScore, swappedTeamScore);
  const kickoffScore = timeScore(titanMatch, hkjcMatch);
  const leagueScore = competitionSimilarity(titanMatch, hkjcMatch);
  let score = Math.round((teamScore * 0.74 + kickoffScore * 0.18 + leagueScore * 0.08) * 100);
  const alignedHome = swapped ? swappedHome : directHome;
  const alignedAway = swapped ? swappedAway : directAway;

  if (kickoffScore >= 0.98 && leagueScore >= 0.92) {
    const strongSide = Math.max(alignedHome, alignedAway);
    const weakSide = Math.min(alignedHome, alignedAway);

    if (strongSide >= 0.92 && weakSide >= 0.28) {
      score = Math.max(score, 82);
    }
  }

  return {
    score,
    teamScore: Math.round(teamScore * 100),
    timeScore: Math.round(kickoffScore * 100),
    leagueScore: Math.round(leagueScore * 100),
    homeScore: Math.round(alignedHome * 100),
    awayScore: Math.round(alignedAway * 100),
    swapped,
  };
}

function isOpenPool(pool) {
  const status = String(pool?.status || "").toUpperCase();
  if (!status) return false;
  if (["CLOSED", "REFUND", "ABANDONED", "CANCELLED", "SUSPENDED"].includes(status)) return false;
  return true;
}

function hkjcOpenRecord(match, poolKeys) {
  const base = baseMatch(match);
  const pools = (match.foPools || [])
    .filter((pool) => isOpenPool(pool))
    .map((pool) => ({
      pool: pool.oddsType || "",
      status: pool.status || "",
      lineCount: pool.lines?.length || 0,
      sourcePage: `https://bet.hkjc.com/ch/football/${String(pool.oddsType || "").toLowerCase()}`,
    }));

  return {
    ...base,
    pools,
    poolTypes: [...new Set(pools.map((pool) => pool.pool).filter(Boolean))],
    sourcePools: poolKeys,
  };
}

async function fetchHkjcOpenMatches(options = {}) {
  const poolKeys = options.poolKeys || ["HAD", "FHA", "HHA", "HIL", "FHL"];
  const hours = Number(options.hours || 72);
  const poolTimeoutMs = Number(options.poolTimeoutMs || options.timeoutMs || 15000);
  const startTime = options.now ? new Date(options.now) : new Date();
  const endTime = new Date(startTime.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  const matchesById = new Map();
  const errors = [];

  const results = await Promise.all(
    poolKeys.map(async (poolKey) => {
      try {
        return { poolKey, matches: await fetchHkjcPool(poolKey, { timeoutMs: poolTimeoutMs }), error: "" };
      } catch (error) {
        return { poolKey, matches: [], error: error.message || String(error) };
      }
    })
  );

  for (const result of results) {
    if (result.error) {
      errors.push({ pool: result.poolKey, error: result.error });
      continue;
    }

    for (const match of result.matches) {
      if (!isWithinWindow(match, startTime, endTime)) continue;
      const current = matchesById.get(match.id) || { ...match, foPools: [] };
      current.foPools.push(...(match.foPools || []));
      matchesById.set(match.id, current);
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    windowStart: startTime.toISOString(),
    windowEnd: endTime.toISOString(),
    hours,
    matches: [...matchesById.values()]
      .map((match) => hkjcOpenRecord(match, poolKeys))
      .filter((match) => match.pools.length),
    errors,
  };
}

function compareTitanMatchToHkjc(titanMatch, hkjcMatches, options = {}) {
  const openThreshold = Number(options.openThreshold || 72);
  const possibleThreshold = Number(options.possibleThreshold || 58);
  let best = null;

  for (const hkjcMatch of hkjcMatches || []) {
    const scored = scoreMatchPair(titanMatch, hkjcMatch);
    if (!best || scored.score > best.score) {
      best = {
        ...scored,
        match: hkjcMatch,
      };
    }
  }

  if (!best || best.score < possibleThreshold) {
    return {
      matchId: titanMatch.matchId || "",
      status: "not_found",
      label: "HKJC 未見",
      score: best?.score || 0,
      matched: null,
    };
  }

  const status = best.score >= openThreshold ? "open" : "possible";
  return {
    matchId: titanMatch.matchId || "",
    status,
    label: status === "open" ? "HKJC 已開" : "HKJC 疑似",
    score: best.score,
    teamScore: best.teamScore,
    timeScore: best.timeScore,
    leagueScore: best.leagueScore,
    homeScore: best.homeScore,
    awayScore: best.awayScore,
    swapped: best.swapped,
    matched: best.match,
  };
}

async function checkTitanMatchesInHkjc(options = {}) {
  const titanMatches = Array.isArray(options.matches) ? options.matches : [];
  if (!titanMatches.length) {
    const now = new Date();
    return {
      fetchedAt: now.toISOString(),
      windowStart: now.toISOString(),
      windowEnd: now.toISOString(),
      hours: Number(options.hours || 72),
      hkjcOpenMatches: 0,
      checkedMatches: 0,
      openCount: 0,
      possibleCount: 0,
      checks: [],
      errors: [],
    };
  }
  const hkjc = await fetchHkjcOpenMatches(options);
  const checks = titanMatches.map((match) => compareTitanMatchToHkjc(match, hkjc.matches, options));
  return {
    fetchedAt: hkjc.fetchedAt,
    windowStart: hkjc.windowStart,
    windowEnd: hkjc.windowEnd,
    hours: hkjc.hours,
    hkjcOpenMatches: hkjc.matches.length,
    checkedMatches: checks.length,
    openCount: checks.filter((check) => check.status === "open").length,
    possibleCount: checks.filter((check) => check.status === "possible").length,
    checks,
    errors: hkjc.errors,
  };
}

function selectionStr(combination) {
  return combination.str || combination.selections?.[0]?.str || "";
}

function selectionName(combination) {
  return combination.selections?.[0]?.name_ch || combination.selections?.[0]?.name_en || selectionStr(combination);
}

function lineOddsMap(line) {
  const map = {};
  for (const combination of line.combinations || []) {
    map[selectionStr(combination)] = normalizeOdds(combination.currentOdds);
  }
  return map;
}

function readableRuleLabel(rule, fallback) {
  const value = String(rule || "");
  const hadSingle = value.match(/^HAD_HOME_AWAY_(.+)$/);
  if (hadSingle) return `主客和 主/客 ${hadSingle[1]}`;
  if (value === "HAD_2.14_3.00_3.00") return "主客和 2.14 / 3.00 / 3.00";
  if (value === "HAD_3.00_3.00_2.14") return "主客和 3.00 / 3.00 / 2.14";
  if (/^FHA_DRAW_1\.76$/.test(value)) return "半場主客和 和 1.76";
  if (/^FHA_HOME_AWAY_2\.03$/.test(value)) return "半場主客和 主/客 2.03";
  if (/^(HHA|EHH)_DRAW_3\.10$/.test(value)) return "讓球主客和 和 3.10";
  if (/^(HIL|EHL)_ANY_(1\.66|1\.69)$/.test(value)) return `入球大細 ${value.slice(-4)}`;
  if (/^FHL_ANY_(1\.66|1\.69|1\.94)$/.test(value)) return `半場入球大細 ${value.slice(-4)}`;
  return fallback || value;
}

function sourcePageFromOddsType(oddsType) {
  const value = String(oddsType || "");
  const entry = Object.values(HKJC_POOLS).find((config) => config.oddsTypes.includes(value));
  return entry?.page || value.toLowerCase();
}

function hitRecord(match, pool, line, combination, rule, ruleLabel, extra = {}) {
  return {
    ...baseMatch(match),
    sourcePage: `https://bet.hkjc.com/ch/football/${sourcePageFromOddsType(pool.oddsType)}`,
    pool: pool.oddsType || "",
    poolName: pool.name_ch || pool.name_en || "",
    rule,
    ruleLabel: readableRuleLabel(rule, ruleLabel),
    lineId: line.lineId || "",
    line: line.condition || "",
    lineStatus: line.status || "",
    selection: combination ? selectionStr(combination) : "",
    selectionName: combination ? selectionName(combination) : "",
    odds: combination ? normalizeOdds(combination.currentOdds) : "",
    poolStatus: pool.status || "",
    combinationStatus: combination?.status || "",
    updateAt: pool.updateAt || "",
    ...extra,
  };
}

function scanHad(match, pool) {
  const hits = [];

  for (const line of pool.lines || []) {
    const odds = lineOddsMap(line);
    const home = odds.H || "";
    const draw = odds.D || "";
    const away = odds.A || "";
    const homeComb = (line.combinations || []).find((combination) => selectionStr(combination) === "H");
    const awayComb = (line.combinations || []).find((combination) => selectionStr(combination) === "A");

    for (const target of ["1.73", "1.76"]) {
      if (sameOdds(home, target) && homeComb) {
        hits.push(
          hitRecord(match, pool, line, homeComb, `HAD_HOME_AWAY_${target}`, `主客和 主/客任何 ${target}`, {
            homeOdds: home,
            drawOdds: draw,
            awayOdds: away,
          })
        );
      }
      if (sameOdds(away, target) && awayComb) {
        hits.push(
          hitRecord(match, pool, line, awayComb, `HAD_HOME_AWAY_${target}`, `主客和 主/客任何 ${target}`, {
            homeOdds: home,
            drawOdds: draw,
            awayOdds: away,
          })
        );
      }
    }

    if (sameOdds(home, "2.14") && sameOdds(draw, "3.00") && sameOdds(away, "3.00")) {
      hits.push(
        hitRecord(match, pool, line, homeComb, "HAD_2.14_3.00_3.00", "主客和 2.14 / 3.00 / 3.00", {
          homeOdds: home,
          drawOdds: draw,
          awayOdds: away,
        })
      );
    }

    if (sameOdds(home, "3.00") && sameOdds(draw, "3.00") && sameOdds(away, "2.14")) {
      hits.push(
        hitRecord(match, pool, line, awayComb, "HAD_3.00_3.00_2.14", "主客和 3.00 / 3.00 / 2.14", {
          homeOdds: home,
          drawOdds: draw,
          awayOdds: away,
        })
      );
    }
  }

  return hits;
}

function scanDrawOdds(match, pool, target, ruleLabel) {
  const hits = [];
  for (const line of pool.lines || []) {
    for (const combination of line.combinations || []) {
      if (selectionStr(combination) === "D" && sameOdds(combination.currentOdds, target)) {
        hits.push(hitRecord(match, pool, line, combination, `${pool.oddsType}_DRAW_${target}`, ruleLabel));
      }
    }
  }
  return hits;
}

function scanHomeAwayOdds(match, pool, target, ruleLabel) {
  const hits = [];
  for (const line of pool.lines || []) {
    for (const combination of line.combinations || []) {
      const side = selectionStr(combination);
      if ((side === "H" || side === "A") && sameOdds(combination.currentOdds, target)) {
        hits.push(hitRecord(match, pool, line, combination, `${pool.oddsType}_HOME_AWAY_${target}`, ruleLabel));
      }
    }
  }
  return hits;
}

function scanAnyOdds(match, pool, targets, labelPrefix) {
  const hits = [];
  for (const line of pool.lines || []) {
    for (const combination of line.combinations || []) {
      const matchedTarget = targets.find((target) => sameOdds(combination.currentOdds, target));
      if (matchedTarget) {
        hits.push(
          hitRecord(match, pool, line, combination, `${pool.oddsType}_ANY_${matchedTarget}`, `${labelPrefix} ${matchedTarget}`)
        );
      }
    }
  }
  return hits;
}

function isDisplayableCorrectScoreOdds(odds) {
  const number = Number(odds);
  return Number.isFinite(number) && number < MAX_CORRECT_SCORE_EQUAL_ODDS;
}

function isInplayMatch(match) {
  const status = String(match?.status || "").toUpperCase();
  if (status.includes("INPLAY") || status.includes("LIVE") || status.includes("RUNNING")) return true;
  return false;
}

function isWithinWindowOrInplay(match, startTime, endTime) {
  const kickoff = new Date(match.kickOffTime);
  if (!Number.isFinite(kickoff.getTime())) return false;
  if (kickoff >= startTime && kickoff <= endTime) return true;

  const recentLiveStart = new Date(startTime.getTime() - 4 * 60 * 60 * 1000);
  return isInplayMatch(match) && kickoff >= recentLiveStart && kickoff <= startTime;
}

function parseCorrectScore(combination) {
  const candidates = [
    selectionName(combination),
    selectionStr(combination),
    ...(combination?.selections || []).flatMap((selection) => [selection?.name_ch, selection?.name_en, selection?.str]),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const text = String(candidate).normalize("NFKC").trim();
    const delimited = text.match(/(\d{1,2})\s*[:：\-]\s*(\d{1,2})/);
    if (delimited) {
      const home = Number(delimited[1]);
      const away = Number(delimited[2]);
      return { home, away, label: `${home}:${away}` };
    }

    if (/^\d{2}$/.test(text)) {
      const home = Number(text[0]);
      const away = Number(text[1]);
      return { home, away, label: `${home}:${away}` };
    }

    if (/^\d{4}$/.test(text)) {
      const home = Number(text.slice(0, 2));
      const away = Number(text.slice(2, 4));
      if (home <= 20 && away <= 20) return { home, away, label: `${home}:${away}` };
    }
  }

  return null;
}

function correctScoreEqualOddsRecord(match, pool, line, totalGoals, odds, scoreItems) {
  const scores = scoreItems.map((item) => item.scoreLabel);
  return {
    ...baseMatch(match),
    sourcePage: "https://bet.hkjc.com/ch/football/crs",
    pool: pool.oddsType || "CRS",
    poolName: pool.name_ch || pool.name_en || "Correct Score",
    rule: `CRS_SAME_TOTAL_${totalGoals}_ODDS_${odds}`,
    ruleLabel: `全場波膽：同總入球 ${totalGoals} 同賠率`,
    lineId: line.lineId || "",
    line: `總入球 ${totalGoals}`,
    lineStatus: line.status || "",
    selection: scores.join(" / "),
    selectionName: scores.join(" / "),
    odds,
    poolStatus: pool.status || "",
    combinationStatus: scoreItems.map((item) => item.status).filter(Boolean).join(" / "),
    updateAt: pool.updateAt || "",
    totalGoals,
    scoreCount: scores.length,
    scoreOddsGroup: scoreItems.map((item) => ({
      score: item.scoreLabel,
      odds: item.odds,
      status: item.status,
    })),
  };
}

function hkjcHitDedupeKey(hit) {
  return [
    hit.matchId,
    hit.frontEndId,
    hit.pool,
    hit.rule,
    hit.lineId,
    hit.totalGoals,
    hit.odds,
    hit.selectionName,
    hit.kickOffTime,
  ].join("|");
}

function correctScoreOddsGroups(pool) {
  const groups = new Map();

  for (const line of pool?.lines || []) {
    for (const combination of line.combinations || []) {
      const score = parseCorrectScore(combination);
      const odds = normalizeOdds(combination.currentOdds);
      if (!score || !odds || !isDisplayableCorrectScoreOdds(odds)) continue;

      const totalGoals = score.home + score.away;
      const key = `${score.label}|${odds}`;
      const items = groups.get(key) || [];
      items.push({
        scoreLabel: score.label,
        odds,
        status: combination.status || "",
        lineId: line.lineId || "",
        totalGoals,
      });
      groups.set(key, items);
    }
  }

  return groups;
}

function uniqueScoreItems(items) {
  return [...new Map((items || []).map((item) => [item.scoreLabel, item])).values()];
}

function fullHalfCorrectScoreSameOddsRecord(match, crsPool, fcsPool, scoreLabel, odds, fullItems, halfItems) {
  const fullScores = uniqueScoreItems(fullItems);
  const halfScores = uniqueScoreItems(halfItems);
  const fullLabels = fullScores.map((item) => item.scoreLabel);
  const halfLabels = halfScores.map((item) => item.scoreLabel);
  const totalGoals = fullScores[0]?.totalGoals ?? halfScores[0]?.totalGoals ?? "";
  const lineIds = [
    ...new Set([...fullScores, ...halfScores].map((item) => item.lineId).filter(Boolean)),
  ];

  return {
    ...baseMatch(match),
    sourcePage: "https://bet.hkjc.com/ch/football/crs",
    secondarySourcePage: "https://bet.hkjc.com/ch/football/fcs",
    pool: "CRS/FCS",
    poolName: "Correct Score / First Half Correct Score",
    rule: `CRS_FCS_SAME_SCORE_${scoreLabel.replace(":", "")}_ODDS_${odds}`,
    ruleLabel: "全場/半場波膽同比分同賠率",
    lineId: lineIds.join(" / "),
    line: `比分 ${scoreLabel}：全場 vs 半場`,
    lineStatus: "",
    selection: `全場 ${fullLabels.join(" / ")} | 半場 ${halfLabels.join(" / ")}`,
    selectionName: `全場 ${fullLabels.join(" / ")} | 半場 ${halfLabels.join(" / ")}`,
    odds,
    poolStatus: [crsPool?.status, fcsPool?.status].filter(Boolean).join(" / "),
    combinationStatus: "",
    updateAt: [crsPool?.updateAt, fcsPool?.updateAt].filter(Boolean).join(" / "),
    totalGoals,
    scoreCount: fullScores.length + halfScores.length,
    scoreOddsGroup: [
      ...fullScores.map((item) => ({
        period: "full",
        score: item.scoreLabel,
        odds: item.odds,
        status: item.status,
      })),
      ...halfScores.map((item) => ({
        period: "half",
        score: item.scoreLabel,
        odds: item.odds,
        status: item.status,
      })),
    ],
  };
}

function scanFullHalfCorrectScoreEqualOdds(match, crsPool, fcsPool) {
  const hits = [];
  const fullGroups = correctScoreOddsGroups(crsPool);
  const halfGroups = correctScoreOddsGroups(fcsPool);

  for (const [key, fullItems] of fullGroups.entries()) {
    const halfItems = halfGroups.get(key);
    if (!halfItems?.length) continue;
    const [scoreLabel, odds] = key.split("|");
    hits.push(fullHalfCorrectScoreSameOddsRecord(match, crsPool, fcsPool, scoreLabel, odds, fullItems, halfItems));
  }

  return hits;
}

function halfCorrectScorePairRecord(match, pool, line, baseItem, pairedItem, side) {
  const scores = [baseItem.scoreLabel, pairedItem.scoreLabel];
  const odds = baseItem.odds;
  return {
    ...baseMatch(match),
    sourcePage: "https://bet.hkjc.com/ch/football/fcs",
    pool: pool.oddsType || "FCS",
    poolName: pool.name_ch || pool.name_en || "First Half Correct Score",
    rule: `FCS_${side}_SAME_ODDS_00_${pairedItem.scoreLabel.replace(":", "")}_${odds}`,
    ruleLabel: side === "home" ? "半場波膽：1:0 與 0:0 同賠率" : "半場波膽：0:1 與 0:0 同賠率",
    lineId: line.lineId || "",
    line: "半場波膽",
    lineStatus: line.status || "",
    selection: scores.join(" / "),
    selectionName: scores.join(" / "),
    odds,
    poolStatus: pool.status || "",
    combinationStatus: [baseItem.status, pairedItem.status].filter(Boolean).join(" / "),
    updateAt: pool.updateAt || "",
    totalGoals: pairedItem.totalGoals,
    scoreCount: scores.length,
    scoreOddsGroup: [baseItem, pairedItem].map((item) => ({
      score: item.scoreLabel,
      odds: item.odds,
      status: item.status,
    })),
  };
}

function sameOddsScorePairRecord(match, pool, line, firstItem, pairedItem, labelPrefix) {
  const scores = [firstItem.scoreLabel, pairedItem.scoreLabel];
  const odds = firstItem.odds;
  const poolType = pool.oddsType || "";
  return {
    ...baseMatch(match),
    sourcePage: `https://bet.hkjc.com/ch/football/${sourcePageFromOddsType(poolType)}`,
    pool: poolType,
    poolName: pool.name_ch || pool.name_en || "",
    rule: `${poolType}_PAIR_${firstItem.scoreLabel.replace(":", "")}_${pairedItem.scoreLabel.replace(":", "")}_ODDS_${odds}`,
    ruleLabel: `${labelPrefix}：${scores.join(" / ")}`,
    lineId: line.lineId || "",
    line: labelPrefix,
    lineStatus: line.status || "",
    selection: scores.join(" / "),
    selectionName: scores.join(" / "),
    odds,
    poolStatus: pool.status || "",
    combinationStatus: [firstItem.status, pairedItem.status].filter(Boolean).join(" / "),
    updateAt: pool.updateAt || "",
    totalGoals: "",
    scoreCount: scores.length,
    scoreOddsGroup: [firstItem, pairedItem].map((item) => ({
      score: item.scoreLabel,
      odds: item.odds,
      status: item.status,
    })),
  };
}

function scanSpecificCorrectScorePairs(match, pool, pairs, labelPrefix) {
  const hits = [];
  for (const line of pool.lines || []) {
    const scores = new Map();
    for (const combination of line.combinations || []) {
      const score = parseCorrectScore(combination);
      const odds = normalizeOdds(combination.currentOdds);
      if (!score || !odds || !isDisplayableCorrectScoreOdds(odds)) continue;

      scores.set(score.label, {
        scoreLabel: score.label,
        odds,
        status: combination.status || "",
        totalGoals: score.home + score.away,
      });
    }

    for (const [firstScore, pairedScore] of pairs) {
      const firstItem = scores.get(firstScore);
      const pairedItem = scores.get(pairedScore);
      if (firstItem && pairedItem && firstItem.odds === pairedItem.odds) {
        hits.push(sameOddsScorePairRecord(match, pool, line, firstItem, pairedItem, labelPrefix));
      }
    }
  }
  return hits;
}

function scanCorrectScoreEqualOdds(match, pool) {
  const hits = [];

  for (const line of pool.lines || []) {
    const groups = new Map();
    for (const combination of line.combinations || []) {
      const score = parseCorrectScore(combination);
      const odds = normalizeOdds(combination.currentOdds);
      if (!score || !odds || !isDisplayableCorrectScoreOdds(odds)) continue;

      const totalGoals = score.home + score.away;
      const key = `${totalGoals}|${odds}`;
      const items = groups.get(key) || [];
      items.push({
        scoreLabel: score.label,
        odds,
        status: combination.status || "",
      });
      groups.set(key, items);
    }

    for (const [key, items] of groups.entries()) {
      const uniqueItems = [...new Map(items.map((item) => [item.scoreLabel, item])).values()];
      if (uniqueItems.length < 2) continue;
      const [totalGoals, odds] = key.split("|");
      hits.push(correctScoreEqualOddsRecord(match, pool, line, Number(totalGoals), odds, uniqueItems));
    }
  }

  return hits;
}

function scanHalfCorrectScoreTargetPairs(match, pool) {
  const hits = [];

  for (const line of pool.lines || []) {
    const scores = new Map();
    for (const combination of line.combinations || []) {
      const score = parseCorrectScore(combination);
      const odds = normalizeOdds(combination.currentOdds);
      if (!score || !odds || !isDisplayableCorrectScoreOdds(odds)) continue;

      scores.set(score.label, {
        scoreLabel: score.label,
        odds,
        status: combination.status || "",
        totalGoals: score.home + score.away,
      });
    }

    const zeroZero = scores.get("0:0");
    if (!zeroZero) continue;

    const homeOne = scores.get("1:0");
    if (homeOne && homeOne.odds === zeroZero.odds) {
      hits.push(halfCorrectScorePairRecord(match, pool, line, zeroZero, homeOne, "home"));
    }

    const awayOne = scores.get("0:1");
    if (awayOne && awayOne.odds === zeroZero.odds) {
      hits.push(halfCorrectScorePairRecord(match, pool, line, zeroZero, awayOne, "away"));
    }
  }

  return hits;
}

function scanPool(match, pool) {
  switch (pool.oddsType) {
    case "HAD":
      return scanHad(match, pool);
    case "FHA":
      return [
        ...scanDrawOdds(match, pool, "1.76", "半場主客和 和 1.76"),
        ...scanHomeAwayOdds(match, pool, "2.03", "半場主客和 主/客 2.03"),
      ];
    case "EHH":
    case "HHA":
      return scanDrawOdds(match, pool, "3.10", "讓球主客和 和 3.10");
    case "EHL":
    case "HIL":
      return scanAnyOdds(match, pool, ["1.66", "1.69"], "入球大細");
    case "FHL":
      return scanAnyOdds(match, pool, ["1.66", "1.69", "1.94"], "半場入球大細");
    case "FCS":
      return [
        ...scanHalfCorrectScoreTargetPairs(match, pool),
        ...scanSpecificCorrectScorePairs(match, pool, [["1:0", "1:1"]], "半場波膽同賠率"),
      ];
    case "CRS":
      return [
        ...scanCorrectScoreEqualOdds(match, pool),
        ...scanSpecificCorrectScorePairs(match, pool, [["1:0", "1:1"]], "全場波膽同賠率"),
      ];
    default:
      return [];
  }
}

async function scanHkjcOdds(options = {}) {
  const hours = Number(options.hours || 24);
  const startTime = options.now ? new Date(options.now) : new Date();
  const endTime = new Date(startTime.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  const poolKeys = ["HAD", "FHA", "HHA", "HIL", "FHL"];
  const hits = [];
  const errors = [];
  const scannedMatchIds = new Set();

  const results = await Promise.all(
    poolKeys.map(async (poolKey) => {
      try {
        return { poolKey, matches: await fetchHkjcPool(poolKey), error: "" };
      } catch (error) {
        return { poolKey, matches: [], error: error.message || String(error) };
      }
    })
  );

  for (const result of results) {
    if (result.error) {
      errors.push({ pool: result.poolKey, error: result.error });
      continue;
    }

    for (const match of result.matches) {
      if (!isWithinWindow(match, startTime, endTime)) continue;
      scannedMatchIds.add(match.id);

      const acceptedOddsTypes = HKJC_POOLS[result.poolKey]?.oddsTypes || [result.poolKey];
      for (const pool of match.foPools || []) {
        if (!acceptedOddsTypes.includes(pool.oddsType)) continue;
        hits.push(...scanPool(match, pool));
      }
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    scanType: "special_odds",
    label: "HKJC 指定賠率",
    rules: HKJC_SPECIAL_RULES,
    windowStart: startTime.toISOString(),
    windowEnd: endTime.toISOString(),
    hours,
    sources: poolKeys.map((poolKey) => `https://bet.hkjc.com/ch/football/${HKJC_POOLS[poolKey].page}`),
    scannedMatches: scannedMatchIds.size,
    hitCount: hits.length,
    hits,
    errors,
  };
}

async function scanHkjcCorrectScoreEqualOdds(options = {}) {
  const hours = Number(options.hours || 24);
  const startTime = options.now ? new Date(options.now) : new Date();
  const endTime = new Date(startTime.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
  const candidateRequests = [
    { poolKey: "HAD", targetPoolKey: "CRS", source: "crs", options: { inplayOnly: false, showAllMatch: false } },
    { poolKey: "HAD", targetPoolKey: "CRS", source: "inplay_all", options: { inplayOnly: true, showAllMatch: true } },
    { poolKey: "HAD", targetPoolKey: "FCS", source: "fcs", options: { inplayOnly: false, showAllMatch: false } },
  ];
  const hits = [];
  const errors = [];
  const scannedMatchIds = new Set();
  const seenHits = new Set();
  const candidateMatches = [];
  const seenCandidates = new Set();
  const correctScorePoolsByMatch = new Map();

  const rememberCorrectScorePool = (detail, pool, targetPoolKey, source) => {
    if (targetPoolKey !== "CRS" && targetPoolKey !== "FCS") return;
    const key = detail.id || detail.frontEndId || "";
    if (!key) return;
    const entry = correctScorePoolsByMatch.get(key) || { match: detail, crs: null, fcs: null };
    entry.match = detail;
    if (targetPoolKey === "CRS" && (!entry.crs || (entry.crs.source === "inplay_all" && source === "crs"))) {
      entry.crs = { pool, source };
    }
    if (targetPoolKey === "FCS" && !entry.fcs) {
      entry.fcs = { pool, source };
    }
    correctScorePoolsByMatch.set(key, entry);
  };

  const candidateResults = await Promise.all(
    candidateRequests.map(async (request) => {
      try {
        return {
          ...request,
          matches: await fetchHkjcPool(request.poolKey, request.options),
          error: "",
        };
      } catch (error) {
        return { ...request, matches: [], error: error.message || String(error) };
      }
    })
  );

  for (const result of candidateResults) {
    if (result.error) {
      errors.push({ pool: result.poolKey, source: result.source, error: result.error });
      continue;
    }

    for (const match of result.matches) {
      if (!isWithinWindowOrInplay(match, startTime, endTime)) continue;
      const sellingPools = match.poolInfo?.sellingPools || match.poolInfo?.normalPools || [];
      if (!sellingPools.includes(result.targetPoolKey)) continue;
      const key = `${match.id}|${result.source}|${result.targetPoolKey}`;
      if (seenCandidates.has(key)) continue;
      seenCandidates.add(key);
      candidateMatches.push({ match, source: result.source, targetPoolKey: result.targetPoolKey });
    }
  }

  const concurrency = Math.max(1, Number(options.concurrency || 4));
  let nextIndex = 0;

  const scanCandidate = async ({ match, source, targetPoolKey }) => {
    try {
      const matches = await fetchHkjcPool(targetPoolKey, {
        matchIds: [match.id],
        inplayOnly: source === "inplay_all",
        showAllMatch: true,
      });

      for (const detail of matches) {
        if (!isWithinWindowOrInplay(detail, startTime, endTime)) continue;
        scannedMatchIds.add(detail.id);
        for (const pool of detail.foPools || []) {
          if (!HKJC_POOLS[targetPoolKey].oddsTypes.includes(pool.oddsType)) continue;
          rememberCorrectScorePool(detail, pool, targetPoolKey, source);
          for (const hit of scanPool(detail, pool)) {
            const key = hkjcHitDedupeKey(hit);
            if (seenHits.has(key)) continue;
            seenHits.add(key);
            hits.push({
              ...hit,
              source,
              sourcePage:
                source === "inplay_all"
                  ? `https://bet.hkjc.com/ch/football/inplay_all/${detail.frontEndId || detail.id || ""}`
                  : hit.sourcePage,
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        pool: targetPoolKey,
        source,
        matchId: match.id,
        frontEndId: match.frontEndId || "",
        error: error.message || String(error),
      });
    }
  };

  const worker = async () => {
    while (nextIndex < candidateMatches.length) {
      const index = nextIndex;
      nextIndex += 1;
      await scanCandidate(candidateMatches[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, candidateMatches.length) }, () => worker()));

  for (const entry of correctScorePoolsByMatch.values()) {
    if (!entry.crs?.pool || !entry.fcs?.pool) continue;
    for (const hit of scanFullHalfCorrectScoreEqualOdds(entry.match, entry.crs.pool, entry.fcs.pool)) {
      const key = hkjcHitDedupeKey(hit);
      if (seenHits.has(key)) continue;
      seenHits.add(key);
      hits.push({
        ...hit,
        source: "crs_fcs",
      });
    }
  }

  for (const { match } of candidateMatches) {
    if (!scannedMatchIds.has(match.id)) scannedMatchIds.add(match.id);
  }

  return {
    fetchedAt: new Date().toISOString(),
    scanType: "crs_equal_odds",
    label: "HKJC 波膽同賠率",
    rules: [
      {
        pool: "CRS",
        label: "全場波膽同一總入球數內，兩個或以上比分出現同一賠率",
      },
      {
        pool: "FCS",
        label: "半場波膽 1:0 與 0:0，或 0:1 與 0:0 出現同一賠率",
      },
      {
        pool: "CRS/FCS",
        label: "同一場全場波膽與半場波膽出現相同比分及相同賠率",
      },
    ],
    windowStart: startTime.toISOString(),
    windowEnd: endTime.toISOString(),
    hours,
    sources: [
      "https://bet.hkjc.com/ch/football/crs",
      "https://bet.hkjc.com/ch/football/fcs",
      "https://bet.hkjc.com/ch/football/inplay_all/{matchId}",
    ],
    candidateMatches: candidateMatches.length,
    scannedMatches: scannedMatchIds.size,
    hitCount: hits.length,
    hits,
    errors,
  };
}

module.exports = {
  checkTitanMatchesInHkjc,
  normalizeOdds,
  scanHkjcOdds,
  scanHkjcCorrectScoreEqualOdds,
  _internals: {
    HKJC_MATCH_QUERY,
    compareTitanMatchToHkjc,
    fetchHkjcOpenMatches,
    isWithinWindowOrInplay,
    normalizeTeamName,
    parseCorrectScore,
    scanHad,
    scanAnyOdds,
    scanCorrectScoreEqualOdds,
    scanDrawOdds,
    scanFullHalfCorrectScoreEqualOdds,
    scanHalfCorrectScoreTargetPairs,
    hkjcHitDedupeKey,
    scanPool,
    scoreMatchPair,
    teamSimilarity,
  },
};
