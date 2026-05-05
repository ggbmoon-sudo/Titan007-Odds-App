(function () {
  const WATER_LOW = 0.82;
  const WATER_HIGH = 1.0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const text = String(value).replace(/,/g, "").trim();
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  function round(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(digits));
  }

  function compactNumber(value, digits = 2) {
    const rounded = round(value, digits);
    return rounded === null ? "" : String(rounded);
  }

  function average(values) {
    const numbers = values.filter((value) => Number.isFinite(value));
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }

  function median(values) {
    const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!numbers.length) return null;
    const middle = Math.floor(numbers.length / 2);
    if (numbers.length % 2) return numbers[middle];
    return (numbers[middle - 1] + numbers[middle]) / 2;
  }

  function stdev(values) {
    const numbers = values.filter((value) => Number.isFinite(value));
    if (numbers.length < 2) return 0;
    const mean = average(numbers);
    const variance = average(numbers.map((value) => (value - mean) ** 2));
    return Math.sqrt(variance);
  }

  function groupBy(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean).map((value) => String(value)))];
  }

  function riskLabel(score) {
    if (score >= 70) return "高";
    if (score >= 40) return "中";
    return "低";
  }

  function confidenceLabel(score) {
    if (score >= 72) return "高";
    if (score >= 50) return "中";
    return "低";
  }

  function pressureLabel(score) {
    if (score >= 70) return "強";
    if (score >= 40) return "中";
    return "弱";
  }

  function titanCoverageScore(europe, asianFull, asianHalf, overFull, overHalf) {
    let score = 0;
    if (europe.rows) score += 24;
    if (asianFull.rows) score += 24;
    if (overFull.rows) score += 24;
    if (asianHalf.rows) score += 8;
    if (overHalf.rows) score += 8;
    score += Math.min(12, Math.max(europe.bookmakerCount, asianFull.bookmakerCount, overFull.bookmakerCount) * 2);
    return clamp(score, 0, 100);
  }

  function titanClarityScore(europe, asianFull, overFull) {
    let score = 25;
    if (["主", "客"].includes(europe.favorite)) score += 22;
    if (Number.isFinite(asianFull.lineMedian)) score += 18;
    if (Number.isFinite(overFull.lineMedian)) score += 15;
    if (europe.disagreement <= 0.08 && asianFull.disagreement <= 0.06 && overFull.disagreement <= 0.06) score += 20;
    return clamp(score, 0, 100);
  }

  function titanConfidenceScore(conflictScore, europe, asianFull, asianHalf, overFull, overHalf) {
    const coverage = titanCoverageScore(europe, asianFull, asianHalf, overFull, overHalf);
    const clarity = titanClarityScore(europe, asianFull, overFull);
    return round(clamp(coverage * 0.42 + (100 - conflictScore) * 0.38 + clarity * 0.2, 0, 100), 1);
  }

  function hkjcConfidenceScore(conflictScore, hits, pools, rules) {
    let score = 35;
    score += Math.min(20, hits.length * 5);
    score += Math.min(16, pools.length * 8);
    score += Math.min(14, rules.length * 4);
    if (rules.some((rule) => rule.startsWith("HAD_"))) score += 12;
    if (rules.some((rule) => rule.startsWith("HIL_") || rule.startsWith("FHL_"))) score += 6;
    score -= Math.max(0, conflictScore - 75) * 0.25;
    return round(clamp(score, 0, 100), 1);
  }

  function currentOdds(row, key) {
    return numberValue(row[key]);
  }

  function averageByKey(rows, key) {
    return average(rows.map((row) => currentOdds(row, key)));
  }

  function medianByKey(rows, key) {
    return median(rows.map((row) => currentOdds(row, key)));
  }

  function stdevByKey(rows, key) {
    return stdev(rows.map((row) => currentOdds(row, key)));
  }

  function averageMove(rows, currentKey, initialKey) {
    return average(
      rows
        .map((row) => {
          const current = numberValue(row[currentKey]);
          const initial = numberValue(row[initialKey]);
          if (!Number.isFinite(current) || !Number.isFinite(initial)) return null;
          return Math.abs(current - initial);
        })
        .filter((value) => value !== null)
    );
  }

  function europeFeatures(rows) {
    const validRows = rows.filter(
      (row) => numberValue(row.currentWin) && numberValue(row.currentDraw) && numberValue(row.currentLoss)
    );
    const perBook = validRows.map((row) => {
      const home = numberValue(row.currentWin);
      const draw = numberValue(row.currentDraw);
      const away = numberValue(row.currentLoss);
      const rawHome = 1 / home;
      const rawDraw = 1 / draw;
      const rawAway = 1 / away;
      const overround = rawHome + rawDraw + rawAway;
      return {
        overround,
        fairHome: rawHome / overround,
        fairDraw: rawDraw / overround,
        fairAway: rawAway / overround,
      };
    });
    const fairHome = average(perBook.map((item) => item.fairHome));
    const fairDraw = average(perBook.map((item) => item.fairDraw));
    const fairAway = average(perBook.map((item) => item.fairAway));
    let favorite = "不明";
    if (Number.isFinite(fairHome) && Number.isFinite(fairAway)) {
      if (fairHome - fairAway > 0.06) favorite = "主";
      else if (fairAway - fairHome > 0.06) favorite = "客";
      else favorite = "接近";
    }

    return {
      rows: rows.length,
      bookmakerCount: unique(rows.map((row) => row.bookmaker || row.company)).length,
      avgWin: round(averageByKey(rows, "currentWin")),
      avgDraw: round(averageByKey(rows, "currentDraw")),
      avgLoss: round(averageByKey(rows, "currentLoss")),
      avgOverround: round(average(perBook.map((item) => item.overround)), 4),
      fairHome: round(fairHome, 4),
      fairDraw: round(fairDraw, 4),
      fairAway: round(fairAway, 4),
      favorite,
      disagreement: round(
        average([
          stdevByKey(rows, "currentWin"),
          stdevByKey(rows, "currentDraw"),
          stdevByKey(rows, "currentLoss"),
        ]),
        4
      ),
      oddsMove: round(
        average([
          averageMove(rows, "currentWin", "initialWin"),
          averageMove(rows, "currentDraw", "initialDraw"),
          averageMove(rows, "currentLoss", "initialLoss"),
        ]),
        4
      ),
    };
  }

  function asianFeatures(rows) {
    const homeOdds = rows.map((row) => numberValue(row.currentHomeOdds)).filter(Number.isFinite);
    const awayOdds = rows.map((row) => numberValue(row.currentAwayOdds)).filter(Number.isFinite);
    const lowWater = rows.filter((row) => {
      const home = numberValue(row.currentHomeOdds);
      const away = numberValue(row.currentAwayOdds);
      return home <= WATER_LOW || away <= WATER_LOW;
    }).length;
    const highWater = rows.filter((row) => {
      const home = numberValue(row.currentHomeOdds);
      const away = numberValue(row.currentAwayOdds);
      return home >= WATER_HIGH || away >= WATER_HIGH;
    }).length;

    return {
      rows: rows.length,
      bookmakerCount: unique(rows.map((row) => row.bookmaker || row.company)).length,
      lineMedian: round(medianByKey(rows, "currentHandicapValue"), 3),
      lineMove: round(averageMove(rows, "currentHandicapValue", "initialHandicapValue"), 3),
      homeOddsAvg: round(average(homeOdds), 3),
      awayOddsAvg: round(average(awayOdds), 3),
      lowWater,
      highWater,
      multiLine: rows.filter((row) => row.isMultiLine === "1").length,
      closed: rows.filter((row) => row.isClosed === "1").length,
      disagreement: round(average([stdev(homeOdds), stdev(awayOdds), stdevByKey(rows, "currentHandicapValue")]), 4),
      oddsMove: round(
        average([
          averageMove(rows, "currentHomeOdds", "initialHomeOdds"),
          averageMove(rows, "currentAwayOdds", "initialAwayOdds"),
        ]),
        4
      ),
    };
  }

  function overUnderFeatures(rows) {
    const overOdds = rows.map((row) => numberValue(row.currentOverOdds)).filter(Number.isFinite);
    const underOdds = rows.map((row) => numberValue(row.currentUnderOdds)).filter(Number.isFinite);
    const lowWater = rows.filter((row) => {
      const over = numberValue(row.currentOverOdds);
      const under = numberValue(row.currentUnderOdds);
      return over <= WATER_LOW || under <= WATER_LOW;
    }).length;
    const highWater = rows.filter((row) => {
      const over = numberValue(row.currentOverOdds);
      const under = numberValue(row.currentUnderOdds);
      return over >= WATER_HIGH || under >= WATER_HIGH;
    }).length;

    return {
      rows: rows.length,
      bookmakerCount: unique(rows.map((row) => row.bookmaker || row.company)).length,
      lineMedian: round(medianByKey(rows, "currentTotalValue"), 3),
      lineMove: round(averageMove(rows, "currentTotalValue", "initialTotalValue"), 3),
      overOddsAvg: round(average(overOdds), 3),
      underOddsAvg: round(average(underOdds), 3),
      lowWater,
      highWater,
      multiLine: rows.filter((row) => row.isMultiLine === "1").length,
      closed: rows.filter((row) => row.isClosed === "1").length,
      disagreement: round(average([stdev(overOdds), stdev(underOdds), stdevByKey(rows, "currentTotalValue")]), 4),
      oddsMove: round(
        average([
          averageMove(rows, "currentOverOdds", "initialOverOdds"),
          averageMove(rows, "currentUnderOdds", "initialUnderOdds"),
        ]),
        4
      ),
    };
  }

  function addFlag(flags, title, level = "info", evidence = "") {
    flags.push({ title, level, evidence });
  }

  function buildTitanMatchFeature(match, rows) {
    const europeRows = rows.filter((row) => row.market === "europe");
    const asianFullRows = rows.filter((row) => row.market === "asian" && row.period === "full");
    const asianHalfRows = rows.filter((row) => row.market === "asian" && row.period === "half");
    const overFullRows = rows.filter((row) => row.market === "over_under" && row.period === "full");
    const overHalfRows = rows.filter((row) => row.market === "over_under" && row.period === "half");

    const europe = europeFeatures(europeRows);
    const asianFull = asianFeatures(asianFullRows);
    const asianHalf = asianFeatures(asianHalfRows);
    const overFull = overUnderFeatures(overFullRows);
    const overHalf = overUnderFeatures(overHalfRows);

    const flags = [];
    let score = 0;

    if (!europe.rows) addFlag(flags, "缺少歐洲賠率，真實價格層不足", "warning");
    if (!asianFull.rows) addFlag(flags, "缺少亞盤全場，讓球驗證不足", "warning");
    if (!overFull.rows) addFlag(flags, "缺少大小全場，入球節奏驗證不足", "warning");

    if (europe.avgOverround && europe.avgOverround > 1.08) {
      score += 10;
      addFlag(flags, "歐賠 overround 偏高", "warning", `平均 ${compactNumber(europe.avgOverround, 4)}`);
    }

    if (europe.disagreement > 0.12 || asianFull.disagreement > 0.08 || overFull.disagreement > 0.08) {
      score += 18;
      addFlag(flags, "莊家分歧偏高", "danger", `歐 ${compactNumber(europe.disagreement, 3)} / 亞 ${compactNumber(asianFull.disagreement, 3)} / 大小 ${compactNumber(overFull.disagreement, 3)}`);
    }

    if (asianFull.lineMove >= 0.25 || overFull.lineMove >= 0.25) {
      score += 16;
      addFlag(flags, "盤口有明顯移動", "warning", `亞 ${compactNumber(asianFull.lineMove, 2)} / 大小 ${compactNumber(overFull.lineMove, 2)}`);
    }

    if (asianFull.oddsMove >= 0.08 || overFull.oddsMove >= 0.08 || europe.oddsMove >= 0.12) {
      score += 14;
      addFlag(flags, "水位或歐賠波動偏大", "warning", `歐 ${compactNumber(europe.oddsMove, 2)} / 亞 ${compactNumber(asianFull.oddsMove, 2)} / 大小 ${compactNumber(overFull.oddsMove, 2)}`);
    }

    if (asianFull.highWater || overFull.highWater) {
      score += 12;
      addFlag(flags, "出現 1.00+ 高水位置", "warning", `亞 ${asianFull.highWater} / 大小 ${overFull.highWater}`);
    }

    if (asianFull.lowWater || overFull.lowWater) {
      score += 8;
      addFlag(flags, "出現 0.82 或以下低水位置", "info", `亞 ${asianFull.lowWater} / 大小 ${overFull.lowWater}`);
    }

    if (asianFull.closed || overFull.closed) {
      score += 12;
      addFlag(flags, "有封盤資料列", "warning", `亞 ${asianFull.closed} / 大小 ${overFull.closed}`);
    }

    if (asianFull.multiLine || overFull.multiLine) {
      score += 10;
      addFlag(flags, "多盤資料存在，主盤需要再確認", "info", `亞 ${asianFull.multiLine} / 大小 ${overFull.multiLine}`);
    }

    if (europe.favorite === "主" && asianFull.homeOddsAvg >= WATER_HIGH) {
      score += 16;
      addFlag(flags, "歐賠偏主，但亞盤主隊水位偏高", "danger", `主隊水 ${compactNumber(asianFull.homeOddsAvg, 2)}`);
    }

    if (europe.favorite === "客" && asianFull.awayOddsAvg >= WATER_HIGH) {
      score += 16;
      addFlag(flags, "歐賠偏客，但亞盤客隊水位偏高", "danger", `客隊水 ${compactNumber(asianFull.awayOddsAvg, 2)}`);
    }

    if (overFull.lineMedian >= 3 && overFull.underOddsAvg <= WATER_LOW) {
      score += 12;
      addFlag(flags, "大球盤偏高但細球低水", "warning", `盤 ${compactNumber(overFull.lineMedian, 2)} / 細 ${compactNumber(overFull.underOddsAvg, 2)}`);
    }

    if (overFull.lineMedian <= 2.25 && overFull.overOddsAvg <= WATER_LOW) {
      score += 12;
      addFlag(flags, "入球盤偏低但大球低水", "warning", `盤 ${compactNumber(overFull.lineMedian, 2)} / 大 ${compactNumber(overFull.overOddsAvg, 2)}`);
    }

    const missingMarkets = [europe.rows, asianFull.rows, overFull.rows].filter((count) => !count).length;
    score += missingMarkets * 8;
    const conflictScore = clamp(score, 0, 100);
    const confidenceScore = titanConfidenceScore(conflictScore, europe, asianFull, asianHalf, overFull, overHalf);

    return {
      matchId: match.matchId,
      league: match.league || "",
      kickoffTime: match.kickoffTime || "",
      home: match.home || "",
      away: match.away || "",
      rowCount: rows.length,
      bookmakerCount: unique(rows.map((row) => row.bookmaker || row.company)).length,
      marketPresence: {
        europe: europe.rows,
        asianFull: asianFull.rows,
        asianHalf: asianHalf.rows,
        overFull: overFull.rows,
        overHalf: overHalf.rows,
      },
      europe,
      asianFull,
      asianHalf,
      overFull,
      overHalf,
      conflictScore,
      conflictLevel: riskLabel(conflictScore),
      confidenceScore,
      confidenceLevel: confidenceLabel(confidenceScore),
      flags,
    };
  }

  function buildTitanSnapshot(rows, matches) {
    const byMatch = groupBy(rows, (row) => row.matchId || "unknown");
    const matchMap = new Map((matches || []).map((match) => [String(match.matchId), match]));
    const features = [...byMatch.entries()].map(([matchId, matchRows]) =>
      buildTitanMatchFeature(
        matchMap.get(String(matchId)) || {
          matchId,
          league: matchRows[0]?.league || "",
          kickoffTime: matchRows[0]?.kickoffTime || "",
          home: matchRows[0]?.home || "",
          away: matchRows[0]?.away || "",
        },
        matchRows
      )
    );
    const topRisks = [...features].sort((a, b) => b.conflictScore - a.conflictScore).slice(0, 8);
    const topConfidence = [...features].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 10);
    const conflictCount = features.reduce((count, item) => count + item.flags.length, 0);
    const highRiskCount = features.filter((item) => item.conflictScore >= 70).length;
    const avgScore = round(average(features.map((item) => item.conflictScore)) || 0, 1);
    const avgConfidence = round(average(features.map((item) => item.confidenceScore)) || 0, 1);

    return {
      version: "local-feature-engine-1",
      source: "titan",
      generatedAt: new Date().toISOString(),
      summary: {
        matchCount: features.length,
        rowCount: rows.length,
        conflictCount,
        highRiskCount,
        avgConflictScore: avgScore,
        avgConfidenceScore: avgConfidence,
        pressure: pressureLabel(avgScore),
      },
      matches: features,
      topRisks,
      topConfidence,
    };
  }

  function buildHkjcMatchFeature(matchKey, hits) {
    const pools = unique(hits.map((hit) => hit.pool));
    const rules = unique(hits.map((hit) => hit.rule));
    const odds = unique(hits.map((hit) => hit.odds));
    const flags = [];
    let score = 25;

    addFlag(flags, "命中指定 HKJC 價位，需要用 Titan007 市場交叉驗證", "info", odds.join(", "));

    if (hits.length > 1) {
      score += Math.min(20, hits.length * 6);
      addFlag(flags, "同一賽事多次命中", "warning", `${hits.length} 筆`);
    }

    if (pools.length > 1) {
      score += Math.min(18, pools.length * 6);
      addFlag(flags, "多個彩池同時命中", "warning", pools.join(", "));
    }

    if (rules.some((rule) => rule.startsWith("HAD_"))) {
      score += 15;
      addFlag(flags, "主客和完整組合命中", "danger", rules.filter((rule) => rule.startsWith("HAD_")).join(", "));
    }

    if (rules.some((rule) => ["FHA_DRAW_1.76", "HHA_DRAW_3.10"].includes(rule))) {
      score += 10;
      addFlag(flags, "和局相關價位命中", "warning");
    }

    if (rules.some((rule) => rule.startsWith("HIL_") || rule.startsWith("FHL_"))) {
      score += 8;
      addFlag(flags, "入球大細價位命中", "info");
    }
    const conflictScore = clamp(score, 0, 100);
    const confidenceScore = hkjcConfidenceScore(conflictScore, hits, pools, rules);

    return {
      matchId: hits[0]?.frontEndId || hits[0]?.matchId || matchKey,
      rawMatchId: hits[0]?.matchId || "",
      league: hits[0]?.tournament || "",
      kickoffTime: hits[0]?.kickOffTime || "",
      home: hits[0]?.home || "",
      away: hits[0]?.away || "",
      hitCount: hits.length,
      pools,
      rules,
      odds,
      conflictScore,
      conflictLevel: riskLabel(conflictScore),
      confidenceScore,
      confidenceLevel: confidenceLabel(confidenceScore),
      flags,
    };
  }

  function buildHkjcSnapshot(rows, hkjc) {
    const byMatch = groupBy(rows, (hit) => hit.frontEndId || hit.matchId || "unknown");
    const features = [...byMatch.entries()].map(([matchKey, hits]) => buildHkjcMatchFeature(matchKey, hits));
    const topRisks = [...features].sort((a, b) => b.conflictScore - a.conflictScore).slice(0, 8);
    const topConfidence = [...features].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 10);
    const conflictCount = features.reduce((count, item) => count + item.flags.length, 0);
    const highRiskCount = features.filter((item) => item.conflictScore >= 70).length;
    const avgScore = round(average(features.map((item) => item.conflictScore)) || 0, 1);
    const avgConfidence = round(average(features.map((item) => item.confidenceScore)) || 0, 1);

    return {
      version: "local-feature-engine-1",
      source: "hkjc",
      generatedAt: new Date().toISOString(),
      summary: {
        matchCount: features.length,
        rowCount: rows.length,
        scannedMatches: hkjc?.scannedMatches || 0,
        conflictCount,
        highRiskCount,
        avgConflictScore: avgScore,
        avgConfidenceScore: avgConfidence,
        pressure: pressureLabel(avgScore),
      },
      matches: features,
      topRisks,
      topConfidence,
    };
  }

  function buildFeatureSnapshot({ source, rows, matches, hkjc }) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (source === "hkjc_scan") return buildHkjcSnapshot(safeRows, hkjc);
    return buildTitanSnapshot(safeRows, matches || []);
  }

  window.oddsFeatureEngine = {
    buildFeatureSnapshot,
  };
})();
