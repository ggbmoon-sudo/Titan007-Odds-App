const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_TIMEZONE = "Asia/Hong_Kong";
const MAX_CONTEXT_MATCHES = 8;
const MAX_FIXTURES_PER_DATE = 500;

function todayInTimezone(timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeComparable(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .toLowerCase();
}

function textTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter((token) => token.length >= 3);
}

function parseDateFromKickoff(kickoffTime, timezone = DEFAULT_TIMEZONE) {
  const raw = String(kickoffTime || "").trim();
  const iso = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthDay = raw.match(/\b(\d{1,2})[-/](\d{1,2})\b/);
  if (monthDay) {
    const today = todayInTimezone(timezone);
    const year = today.slice(0, 4);
    const [, month, day] = monthDay;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

function candidateDatesForMatches(matches, timezone = DEFAULT_TIMEZONE) {
  const today = todayInTimezone(timezone);
  const dates = new Set([today, addDays(today, 1)]);

  for (const match of matches || []) {
    const parsed = parseDateFromKickoff(match.kickoffTime, timezone);
    if (parsed) {
      dates.add(parsed);
      dates.add(addDays(parsed, -1));
      dates.add(addDays(parsed, 1));
    }
  }

  return [...dates].sort();
}

function scoreTeamName(inputName, candidateName) {
  const input = normalizeComparable(inputName);
  const candidate = normalizeComparable(candidateName);
  if (!input || !candidate) return 0;
  if (input === candidate) return 1;
  if (input.includes(candidate) || candidate.includes(input)) return 0.82;

  const inputTokens = new Set(textTokens(inputName));
  const candidateTokens = new Set(textTokens(candidateName));
  if (!inputTokens.size || !candidateTokens.size) return 0;
  const overlap = [...inputTokens].filter((token) => candidateTokens.has(token)).length;
  return overlap / Math.max(inputTokens.size, candidateTokens.size);
}

function scoreFixtureMatch(match, fixture) {
  const homeScore = Math.max(
    scoreTeamName(match.home, fixture.teams?.home?.name),
    scoreTeamName(match.homeSimplified, fixture.teams?.home?.name),
    scoreTeamName(match.homeTraditional, fixture.teams?.home?.name)
  );
  const awayScore = Math.max(
    scoreTeamName(match.away, fixture.teams?.away?.name),
    scoreTeamName(match.awaySimplified, fixture.teams?.away?.name),
    scoreTeamName(match.awayTraditional, fixture.teams?.away?.name)
  );
  const reverseHomeScore = Math.max(
    scoreTeamName(match.home, fixture.teams?.away?.name),
    scoreTeamName(match.homeSimplified, fixture.teams?.away?.name),
    scoreTeamName(match.homeTraditional, fixture.teams?.away?.name)
  );
  const reverseAwayScore = Math.max(
    scoreTeamName(match.away, fixture.teams?.home?.name),
    scoreTeamName(match.awaySimplified, fixture.teams?.home?.name),
    scoreTeamName(match.awayTraditional, fixture.teams?.home?.name)
  );
  const direct = (homeScore + awayScore) / 2;
  const reversed = (reverseHomeScore + reverseAwayScore) / 2;
  return {
    score: Math.max(direct, reversed),
    reversed: reversed > direct,
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const response = await fetch(url, {
      headers: options.headers || {},
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.message || body?.errors?.requests || `HTTP ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiFootballGet(pathname, apiKey, params = {}) {
  const url = new URL(`${API_FOOTBALL_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const body = await fetchJson(url, {
    headers: {
      "x-apisports-key": apiKey,
      accept: "application/json",
    },
  });
  return {
    results: body.results || 0,
    response: Array.isArray(body.response) ? body.response : [],
    errors: body.errors || {},
  };
}

async function openMeteoGet(baseUrl, params = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return fetchJson(url, { timeoutMs: 15000 });
}

async function fetchFixturesByDates(apiKey, dates, timezone = DEFAULT_TIMEZONE) {
  const fixtures = [];
  const errors = [];

  for (const date of dates) {
    try {
      const data = await apiFootballGet("/fixtures", apiKey, { date, timezone });
      fixtures.push(...data.response.slice(0, MAX_FIXTURES_PER_DATE));
      if (Object.keys(data.errors || {}).length) {
        errors.push({ source: "api-football", endpoint: "fixtures", date, error: data.errors });
      }
    } catch (error) {
      errors.push({ source: "api-football", endpoint: "fixtures", date, error: error.message });
    }
  }

  return { fixtures, errors };
}

function matchFixture(match, fixtures) {
  let best = null;
  for (const fixture of fixtures) {
    const result = scoreFixtureMatch(match, fixture);
    if (!best || result.score > best.score) {
      best = { fixture, ...result };
    }
  }
  if (!best || best.score < 0.58) return null;
  return best;
}

function summarizeFixture(fixture) {
  return {
    fixtureId: fixture.fixture?.id || "",
    date: fixture.fixture?.date || "",
    status: fixture.fixture?.status || null,
    league: fixture.league
      ? {
          id: fixture.league.id,
          name: fixture.league.name,
          country: fixture.league.country,
          season: fixture.league.season,
          round: fixture.league.round,
        }
      : null,
    teams: fixture.teams || null,
    goals: fixture.goals || null,
    score: fixture.score || null,
    venue: fixture.fixture?.venue || null,
  };
}

function summarizeInjuries(rows) {
  return (rows || []).slice(0, 30).map((item) => ({
    player: item.player?.name || "",
    playerId: item.player?.id || "",
    team: item.team?.name || "",
    teamId: item.team?.id || "",
    type: item.player?.type || "",
    reason: item.player?.reason || "",
    fixtureId: item.fixture?.id || "",
  }));
}

function summarizeLineups(rows) {
  return (rows || []).slice(0, 4).map((item) => ({
    team: item.team?.name || "",
    teamId: item.team?.id || "",
    formation: item.formation || "",
    coach: item.coach?.name || "",
    startXI: (item.startXI || []).slice(0, 11).map((entry) => ({
      name: entry.player?.name || "",
      number: entry.player?.number || "",
      position: entry.player?.pos || "",
      grid: entry.player?.grid || "",
    })),
    substitutes: (item.substitutes || []).slice(0, 12).map((entry) => ({
      name: entry.player?.name || "",
      number: entry.player?.number || "",
      position: entry.player?.pos || "",
    })),
  }));
}

async function fetchFixtureContext(apiKey, fixtureId) {
  const [injuriesResult, lineupsResult] = await Promise.allSettled([
    apiFootballGet("/injuries", apiKey, { fixture: fixtureId }),
    apiFootballGet("/fixtures/lineups", apiKey, { fixture: fixtureId }),
  ]);

  const context = {
    fixtureId,
    injuries: [],
    lineups: [],
    errors: [],
  };

  if (injuriesResult.status === "fulfilled") {
    context.injuries = summarizeInjuries(injuriesResult.value.response);
    if (Object.keys(injuriesResult.value.errors || {}).length) {
      context.errors.push({ endpoint: "injuries", error: injuriesResult.value.errors });
    }
  } else {
    context.errors.push({ endpoint: "injuries", error: injuriesResult.reason.message });
  }

  if (lineupsResult.status === "fulfilled") {
    context.lineups = summarizeLineups(lineupsResult.value.response);
    if (Object.keys(lineupsResult.value.errors || {}).length) {
      context.errors.push({ endpoint: "lineups", error: lineupsResult.value.errors });
    }
  } else {
    context.errors.push({ endpoint: "lineups", error: lineupsResult.reason.message });
  }

  return context;
}

async function fetchWeatherContext(venue, kickoffDate) {
  const city = String(venue?.city || "").trim();
  if (!city) {
    return { available: false, reason: "未有球場城市，不能查天氣。" };
  }

  const geocode = await openMeteoGet(OPEN_METEO_GEOCODE_URL, {
    name: city,
    count: 1,
    language: "en",
    format: "json",
  });
  const location = geocode.results?.[0];
  if (!location) {
    return { available: false, city, reason: "Open-Meteo 找不到城市座標。" };
  }

  const forecast = await openMeteoGet(OPEN_METEO_FORECAST_URL, {
    latitude: location.latitude,
    longitude: location.longitude,
    hourly: "temperature_2m,precipitation,wind_speed_10m",
    forecast_days: 3,
    timezone: DEFAULT_TIMEZONE,
  });

  const times = forecast.hourly?.time || [];
  const targetDate = String(kickoffDate || "").slice(0, 13);
  let index = times.findIndex((time) => String(time).startsWith(targetDate));
  if (index < 0) index = 0;

  return {
    available: true,
    city,
    location: {
      name: location.name,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    forecast: {
      time: times[index] || "",
      temperatureC: forecast.hourly?.temperature_2m?.[index] ?? null,
      precipitationMm: forecast.hourly?.precipitation?.[index] ?? null,
      windSpeedKmh: forecast.hourly?.wind_speed_10m?.[index] ?? null,
    },
  };
}

async function buildContextForMatches(options = {}) {
  const apiFootballKey = String(options.apiFootballKey || "").trim();
  const timezone = options.timezone || DEFAULT_TIMEZONE;
  const matches = Array.isArray(options.matches) ? options.matches.slice(0, MAX_CONTEXT_MATCHES) : [];
  const includeWeather = options.includeWeather !== false;

  const context = {
    generatedAt: new Date().toISOString(),
    mode: "app_collected_context",
    sourceStatus: [],
    fixtureMatches: [],
    injuries: [],
    lineups: [],
    weather: [],
    missing: [],
    limits: {
      maxMatches: MAX_CONTEXT_MATCHES,
      requestedMatches: Array.isArray(options.matches) ? options.matches.length : 0,
      processedMatches: matches.length,
    },
  };

  if (!matches.length) {
    context.missing.push({ type: "matches", reason: "未有可用賽事資料。" });
    return context;
  }

  if (!apiFootballKey) {
    context.sourceStatus.push({ source: "api-football", ok: false, reason: "未提供 API-Football key。" });
    context.missing.push({ type: "api-football", reason: "未提供 API-Football key，未能查 fixture、傷停、陣容。" });
    return context;
  }

  const dates = candidateDatesForMatches(matches, timezone);
  const fixtureData = await fetchFixturesByDates(apiFootballKey, dates, timezone);
  context.sourceStatus.push({
    source: "api-football",
    ok: fixtureData.errors.length === 0,
    dates,
    fixtureCount: fixtureData.fixtures.length,
    errors: fixtureData.errors,
  });

  for (const match of matches) {
    const matched = matchFixture(match, fixtureData.fixtures);
    if (!matched) {
      context.missing.push({
        type: "fixture_match",
        matchId: match.matchId,
        title: [match.league, match.home, match.away].filter(Boolean).join(" · "),
        reason: "API-Football fixture 未能可靠配對。中文隊名可能需要手動映射英文隊名。",
      });
      continue;
    }

    const fixture = summarizeFixture(matched.fixture);
    context.fixtureMatches.push({
      matchId: match.matchId,
      titanLeague: match.league || "",
      titanHome: match.home || "",
      titanAway: match.away || "",
      matchScore: Number(matched.score.toFixed(3)),
      reversed: matched.reversed,
      fixture,
    });

    const fixtureContext = await fetchFixtureContext(apiFootballKey, fixture.fixtureId);
    context.injuries.push(...fixtureContext.injuries.map((item) => ({ ...item, matchId: match.matchId })));
    context.lineups.push(...fixtureContext.lineups.map((item) => ({ ...item, matchId: match.matchId })));
    for (const error of fixtureContext.errors) {
      context.sourceStatus.push({
        source: "api-football",
        ok: false,
        matchId: match.matchId,
        fixtureId: fixture.fixtureId,
        ...error,
      });
    }

    if (includeWeather) {
      try {
        const weather = await fetchWeatherContext(fixture.venue, fixture.date);
        context.weather.push({ matchId: match.matchId, fixtureId: fixture.fixtureId, ...weather });
      } catch (error) {
        context.weather.push({
          matchId: match.matchId,
          fixtureId: fixture.fixtureId,
          available: false,
          reason: error.message,
        });
      }
    }
  }

  if (includeWeather) {
    context.sourceStatus.push({
      source: "open-meteo",
      ok: true,
      note: "只在 API-Football 配對到 fixture 並有球場城市時查詢。",
    });
  }

  return context;
}

module.exports = {
  buildContextForMatches,
  _internals: {
    addDays,
    candidateDatesForMatches,
    matchFixture,
    normalizeComparable,
    parseDateFromKickoff,
    scoreFixtureMatch,
    todayInTimezone,
  },
};
