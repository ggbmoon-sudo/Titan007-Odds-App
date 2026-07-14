const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  DEFAULT_ALLOWED_LEAGUES,
  filterBookmakerRows,
  identifyBookmaker,
  normalizeMatchItems,
  parseEuropeDataJs,
  parseLiveMatches,
  parseOddsTable,
  _internals: titanInternals,
} = require("../src/titan");
const { normalizeOdds, _internals: hkjcInternals } = require("../src/hkjc");
const { _internals: aiInternals } = require("../src/ai");
const { _internals: diagnosticInternals } = require("../src/diagnostics");
const { parseTitanGuessHomePage, parseTitanGuessIndexPage } = require("../src/titanGuess");

test("Titan useful HTML checker keeps valid mobile analysis pages with 404-like data", () => {
  const validHtml = [
    "<!DOCTYPE html><html><head><title>Analysis</title></head><body>",
    '<div id="compDiv">概率事件</div>',
    '<script>var freshJsonData = {"scheduleId":2798549,"oddsId":404123};</script>',
    "</body></html>",
  ].join("");

  assert.doesNotThrow(() => titanInternals.assertUsefulHtml(validHtml, "https://m.titan007.com/analy/Analysis/2798549.htm"));
  assert.throws(() =>
    titanInternals.assertUsefulHtml(
      "<!DOCTYPE html><html><head><title>404 Not Found</title></head><body>404 Not Found</body></html>",
      "https://m.titan007.com/analy/Analysis/0.htm"
    )
  );
});

test("Titan decoder falls back to gb18030 when utf8 has replacement chars", () => {
  const gbCompanyBytes = Buffer.from([176, 196, 42]);
  assert.equal(titanInternals.decodeBuffer(gbCompanyBytes, ""), "澳*");
});

test("Titan decoder keeps mostly valid utf8 pages with a broken trailing byte", () => {
  const html = `${"公司澳門彩票威廉希爾立博香港馬".repeat(3)}\n`;
  const broken = Buffer.concat([Buffer.from(html, "utf8"), Buffer.from([0xff])]);
  const decoded = titanInternals.decodeBuffer(broken, "");
  assert.match(decoded, /澳門彩票/);
  assert.doesNotMatch(decoded, /婢|鏄|棣欐腐/);
});

test("Titan decoder trusts utf8-declared pages even when trailing bytes are broken", () => {
  const html = `<meta charset="utf-8">${"\u516c\u53f8\u6fb3\u9580\u5f69\u7968\u5a01\u5ec9\u5e0c\u723e\u7acb\u535a\u9999\u6e2f\u8cfd\u99ac\u6703".repeat(3)}`;
  const broken = Buffer.concat([Buffer.from(html, "utf8"), Buffer.from([0xff])]);
  const decoded = titanInternals.decodeBuffer(broken, "");

  assert.equal(titanInternals.bufferDeclaresUtf8(broken, ""), true);
  assert.match(decoded, /\u6fb3\u9580\u5f69\u7968/);
  assert.match(decoded, /\u9999\u6e2f\u8cfd\u99ac\u6703/);
});

test("Titan decoder overrides stale gb declarations when body is utf8", () => {
  const html = `<meta charset="gb2312">${"\u5409\u5c3c\u65af\u5766VS\u82f1\u7279\u675c\u53e4 \u516c\u53f8 \u6fb3\u9580\u5f69\u7968".repeat(3)}`;
  const decoded = titanInternals.decodeBuffer(Buffer.from(html, "utf8"), "");

  assert.match(decoded, /\u5409\u5c3c\u65af\u5766/);
  assert.match(decoded, /\u6fb3\u9580\u5f69\u7968/);
  assert.equal(titanInternals.countTitanMojibakeChars(decoded), 0);
});

test("network diagnostics classifier flags common IP blocks and rate limits", () => {
  const forbidden = diagnosticInternals.classifyProbeResult({
    name: "target",
    statusCode: 403,
    text: "Access Denied",
  });
  assert.equal(forbidden.state, "error");
  assert.match(forbidden.diagnosis, /403|風控/);

  const limited = diagnosticInternals.classifyProbeResult({
    name: "target",
    statusCode: 429,
    text: "Too Many Requests",
  });
  assert.equal(limited.state, "error");
  assert.match(limited.diagnosis, /429/);

  const softBlock = diagnosticInternals.classifyProbeResult({
    name: "target",
    statusCode: 200,
    text: "<html>captcha required</html>",
  });
  assert.equal(softBlock.state, "warn");
});

test("Titan V guess homepage parser reads support percentages", () => {
  const html = `
    <div class="title matchinfo" id="matchinfo_2916078" data-time="2026,4,6,12,00,00">
      <span class="league">日职联</span>
      <span class="L-time">12:00</span>
      <a class="tit">清水鼓动 <span>VS</span> 大阪樱花</a>
      <a class="time blue"><span>已开场</span></a>
    </div><ul></ul>
    <div class="panel guess"><h3>V猜球</h3><div class="info">
      <div class="guessBar" onclick="window.open('//guess2.titan007.com/tuijian/2916078.html', '_blank')">
        <div class="team"><div class="icon"><img src="//zq.titan007.com/home.png" /></div><span>清水鼓动</span></div>
        <div class="guessBox">
          <div class="guessData"><span class="hCount">28%</span><span>亚让</span><span class="gCount">72%</span></div>
          <div class="guessData"><span class="hCount">67%</span><span>大小</span><span class="gCount">33%</span></div>
        </div>
        <div class="team"><div class="icon"><img src="//zq.titan007.com/away.png" /></div><span>大阪樱花</span></div>
      </div>
    </div></div>
  `;

  const parsed = parseTitanGuessHomePage(html);
  assert.equal(parsed.total, 1);
  assert.equal(parsed.hitCount, 1);
  assert.equal(parsed.matches[0].matchId, "2916078");
  assert.equal(parsed.matches[0].league, "日职联");
  assert.equal(parsed.matches[0].home, "清水鼓动");
  assert.equal(parsed.matches[0].away, "大阪樱花");
  assert.equal(parsed.matches[0].asianAwayPercent, 72);
  assert.equal(parsed.matches[0].asianLean, "away");
  assert.equal(parsed.matches[0].overPercent, 67);
  assert.equal(parsed.matches[0].totalLean, "over");
  assert.equal(parsed.matches[0].detailUrl, "https://guess2.titan007.com/tuijian/2916078.html");
});

test("Titan V guess index parser keeps all target-league rows with hidden values", () => {
  const html = `
    <div class="match" id="match_position_1597007">
      <div class="status">
        <div class="game_guess">\u65e5\u804c\u8054<i>05-06 13:00</i><p></p></div>
        <span class="time blue" id="time_2916078" timestate="0">未</span>
      </div>
      <div class="guessBox">
        <div class="HTeam team" id="home_2916078" teamname="\u540d\u53e4\u5c4b\u9cb8\u516b"><span>[2]</span>\u540d\u53e4\u5c4b\u9cb8\u516b</div>
        <div class="guessInfo">
          <div id="let_jd_2916078" data-count="59" class="guessBar ">
            <div id="let_h_2916078" class="btn off cz1">\u652f\u6301\u4e3b<span class="btnZS">0.96</span></div>
            <div class="guessData"><span class="hCount">51%</span><span id="2916078_let" odds="0.5">\u53d7\u534a\u7403</span><span class="gCount">49%</span><div class="barBG"><div class="bar" style="width:51%"></div></div></div>
            <div id="let_g_2916078" class="btn off cz2">\u652f\u6301\u5ba2<span class="btnZS">0.92</span></div>
          </div>
          <div id="ou_jd_2916078" data-count="38" class="guessBar ">
            <div id="ou_o_2916078" class="btn off">\u652f\u6301\u5927<span class="btnZS">0.88</span></div>
            <div class="guessData"><span class="hCount">88%</span><span id="2916078_ou" odds="2.5">2.5</span><span class="gCount">12%</span><div class="barBG"><div class="bar" style="width:88%"></div></div></div>
            <div id="ou_u_2916078" class="btn off">\u652f\u6301\u5c0f<span class="btnZS">0.98</span></div>
          </div>
        </div>
        <div class="GTeam team" id="guest_2916078" teamname="\u5927\u962a\u94a2\u5df4">\u5927\u962a\u94a2\u5df4<span>[3]</span></div>
      </div>
    </div>
    <div class="popupGuessTD"></div>
    <div class="match" id="match_position_999">
      <div class="status"><div class="game_guess">\u6fb3\u8d85<i>05-06 14:00</i></div><span class="time blue" id="time_3000000">未</span></div>
      <div class="guessBox">
        <div class="HTeam team" id="home_3000000" teamname="A">A</div>
        <div class="guessInfo"></div>
        <div class="GTeam team" id="guest_3000000" teamname="B">B</div>
      </div>
    </div>
    <div class="popupGuessTD"></div>
  `;

  const parsed = parseTitanGuessIndexPage(html, { allowedLeagues: ["\u65e5\u804c\u8054"] });
  assert.equal(parsed.total, 1);
  assert.equal(parsed.hitCount, 1);
  assert.equal(parsed.matches[0].matchId, "2916078");
  assert.equal(parsed.matches[0].league, "\u65e5\u804c\u8054");
  assert.equal(parsed.matches[0].home, "\u540d\u53e4\u5c4b\u9cb8\u516b");
  assert.equal(parsed.matches[0].away, "\u5927\u962a\u94a2\u5df4");
  assert.equal(parsed.matches[0].asianLine, "\u53d7\u534a\u7403");
  assert.equal(parsed.matches[0].asianCount, 59);
  assert.equal(parsed.matches[0].asianHomeSupportOdds, 0.96);
  assert.equal(parsed.matches[0].asianAwaySupportOdds, 0.92);
  assert.equal(parsed.matches[0].totalCount, 38);
  assert.equal(parsed.matches[0].overSupportOdds, 0.88);
  assert.equal(parsed.matches[0].underSupportOdds, 0.98);
  assert.equal(parsed.matches[0].overPercent, 88);
  assert.equal(parsed.matches[0].hot, true);
});

test("Titan V guess index parser includes Europa, Conference, Chile, and Scotland League Cup targets", () => {
  const makeBlock = ({ position, matchId, league }) => `
    <div class="match" id="match_position_${position}">
      <div class="status">
        <div class="game_guess">${league}<i>05-06 13:00</i><p></p></div>
        <span class="time blue" id="time_${matchId}" timestate="0">未</span>
      </div>
      <div class="guessBox">
        <div class="HTeam team" id="home_${matchId}" teamname="Home ${matchId}">Home ${matchId}</div>
        <div class="guessInfo">
          <div id="let_jd_${matchId}" data-count="59" class="guessBar ">
            <div class="guessData"><span class="hCount">72%</span><span id="${matchId}_let" odds="0.5">半球</span><span class="gCount">28%</span></div>
          </div>
        </div>
        <div class="GTeam team" id="guest_${matchId}" teamname="Away ${matchId}">Away ${matchId}</div>
      </div>
    </div>
    <div class="popupGuessTD"></div>
  `;
  const html = [
    makeBlock({ position: 1, matchId: "3101", league: "欧罗巴杯" }),
    makeBlock({ position: 2, matchId: "3102", league: "欧会杯" }),
    makeBlock({ position: 3, matchId: "3103", league: "智利联杯" }),
    makeBlock({ position: 4, matchId: "3104", league: "蘇格蘭聯賽盃" }),
    makeBlock({ position: 5, matchId: "3105", league: "其他聯賽" }),
  ].join("");

  const parsed = parseTitanGuessIndexPage(html);
  assert.deepEqual(
    parsed.matches.map((match) => match.matchId),
    ["3101", "3102", "3103", "3104"]
  );
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("智利聯杯"));
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("蘇聯盃"));
});

test("Titan V guess index parser filters live and finished rows for prematch scan", () => {
  const makeBlock = ({ position, matchId, state, kickoff, home, away }) => `
    <div class="match" id="match_position_${position}">
      <div class="status">
        <div class="game_guess">德乙<i>${kickoff}</i><p></p></div>
        <span class="time blue" id="time_${matchId}" timestate="0">${state}</span>
      </div>
      <div class="guessBox">
        <div class="HTeam team" id="home_${matchId}" teamname="${home}">${home}</div>
        <div class="guessInfo">
          <div id="let_jd_${matchId}" data-count="60" class="guessBar ">
            <div class="guessData"><span class="hCount">80%</span><span id="${matchId}_let" odds="0.5">半球</span><span class="gCount">20%</span></div>
          </div>
          <div id="ou_jd_${matchId}" data-count="40" class="guessBar ">
            <div class="guessData"><span class="hCount">55%</span><span id="${matchId}_ou" odds="2.5">2.5</span><span class="gCount">45%</span></div>
          </div>
        </div>
        <div class="GTeam team" id="guest_${matchId}" teamname="${away}">${away}</div>
      </div>
    </div>
    <div class="popupGuessTD"></div>
  `;
  const html = [
    makeBlock({ position: 1, matchId: "1001", state: "上", kickoff: "05-08 23:00", home: "Live A", away: "Live B" }),
    makeBlock({ position: 2, matchId: "1002", state: "完場", kickoff: "05-08 18:30", home: "Done A", away: "Done B" }),
    makeBlock({ position: 3, matchId: "1003", state: "未", kickoff: "05-09 00:30", home: "Next A", away: "Next B" }),
  ].join("");

  const parsed = parseTitanGuessIndexPage(html, {
    allowedLeagues: ["德乙"],
    prematchOnly: true,
    hours: 24,
    now: new Date(2026, 4, 8, 22, 40),
  });

  assert.equal(parsed.total, 1);
  assert.equal(parsed.hitCount, 1);
  assert.equal(parsed.matches[0].matchId, "1003");
  assert.equal(parsed.matches[0].state, "未");
});

test("Titan V guess index parser keeps kickoff order while preserving max percentage", () => {
  const makeBlock = ({ position, matchId, kickoff, percent }) => `
    <div class="match" id="match_position_${position}">
      <div class="status">
        <div class="game_guess">德乙<i>${kickoff}</i><p></p></div>
        <span class="time blue" id="time_${matchId}" timestate="0">未</span>
      </div>
      <div class="guessBox">
        <div class="HTeam team" id="home_${matchId}" teamname="Home ${matchId}">Home ${matchId}</div>
        <div class="guessInfo">
          <div id="let_jd_${matchId}" data-count="60" class="guessBar ">
            <div class="guessData"><span class="hCount">${percent}%</span><span id="${matchId}_let" odds="0.5">半球</span><span class="gCount">${100 - percent}%</span></div>
          </div>
        </div>
        <div class="GTeam team" id="guest_${matchId}" teamname="Away ${matchId}">Away ${matchId}</div>
      </div>
    </div>
    <div class="popupGuessTD"></div>
  `;
  const html = [
    makeBlock({ position: 1, matchId: "2001", kickoff: "05-09 02:30", percent: 72 }),
    makeBlock({ position: 2, matchId: "2002", kickoff: "05-09 04:30", percent: 91 }),
    makeBlock({ position: 3, matchId: "2003", kickoff: "05-09 03:30", percent: 80 }),
  ].join("");

  const parsed = parseTitanGuessIndexPage(html, {
    allowedLeagues: ["德乙"],
    prematchOnly: true,
    hours: 24,
    now: new Date(2026, 4, 8, 22, 40),
  });

  assert.deepEqual(
    parsed.matches.map((match) => match.matchId),
    ["2001", "2003", "2002"]
  );
  assert.equal(parsed.matches[2].maxPercent, 91);
});

test("AI chat completions URL accepts qweapi root, base, and full endpoint", () => {
  assert.equal(
    aiInternals.chatCompletionsUrl("https://qweapi.com").toString(),
    "https://qweapi.com/v1/chat/completions"
  );
  assert.equal(
    aiInternals.chatCompletionsUrl("https://qweapi.com/v1").toString(),
    "https://qweapi.com/v1/chat/completions"
  );
  assert.equal(
    aiInternals.chatCompletionsUrl("https://qweapi.com/v1/chat/completions").toString(),
    "https://qweapi.com/v1/chat/completions"
  );
});

test("AI response parser accepts OpenAI and Gemini style text", () => {
  assert.equal(
    aiInternals.extractAssistantText({ choices: [{ message: { content: "OK" } }] }),
    "OK"
  );
  assert.equal(
    aiInternals.extractAssistantText({
      candidates: [{ content: { parts: [{ text: "Gemini " }, { text: "OK" }] } }],
    }),
    "Gemini OK"
  );
});

test("AI stream parser combines chat completion delta chunks", () => {
  const streamed = [
    'data: {"choices":[{"delta":{"content":"O"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"K"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  assert.equal(aiInternals.extractAssistantText(aiInternals.parseStreamingChatCompletion(streamed)), "OK");
});

test("AI request parser accepts SSE chunks even when stream was not requested", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":0,"total_tokens":2}}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"O"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"K"}}]}\n\n');
    res.end("data: [DONE]\n\n");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await aiInternals.requestJson(
      new URL(`http://127.0.0.1:${port}/v1/chat/completions`),
      { model: "gpt-5.5", stream: false, messages: [{ role: "user", content: "OK" }] },
      "sk-test",
      5000
    );

    assert.equal(response.streamed, true);
    assert.equal(response.usage.total_tokens, 2);
    assert.equal(aiInternals.extractAssistantText(response), "OK");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("AI JSON parser prefers Part D single-match JSON over earlier fenced blocks", () => {
  const text = [
    "Part B",
    "```json",
    '{"chart_only":true}',
    "```",
    "Part D",
    "```json",
    '{"match_meta":{"home_team":"A"},"recommendation":{"recommendation":"observe"},"missing_fields":[]}',
    "```",
  ].join("\n");
  const parsed = require("../src/ai").parseJsonObjectFromText(text);
  assert.equal(parsed.recommendation.recommendation, "observe");
});

test("AI JSON parser prefers structured Top 10 JSON when report contains earlier JSON examples", () => {
  const text = [
    "資料限制：以下只是例子。",
    "```json",
    '{"example":true,"top10":[]}',
    "```",
    "Part D",
    "```json",
    '{"schemaVersion":"odds-analysis-v1","dataQuality":{"level":"medium"},"top10":[{"matchId":"m1","confidenceScore":81}],"top3Candidates":[],"highRiskMatches":[]}',
    "```",
  ].join("\n");
  const parsed = require("../src/ai").parseJsonObjectFromText(text);
  assert.equal(parsed.schemaVersion, "odds-analysis-v1");
  assert.equal(parsed.top10[0].matchId, "m1");
});

test("AI structured output validator flags global and single-match contract gaps", () => {
  const globalValidation = aiInternals.validateStructuredAnalysis(
    {
      schemaVersion: "odds-analysis-v1",
      dataQuality: {},
      top10: [{ matchId: "m1", confidenceScore: 80 }],
      top3Candidates: [],
    },
    "top10_ai_ranking"
  );
  assert.equal(globalValidation.level, "ok");
  assert.equal(globalValidation.score, 100);

  const singleValidation = aiInternals.validateStructuredAnalysis(
    {
      schemaVersion: "odds-analysis-v1",
      match_meta: {},
      recommendation: { recommendation: "observe" },
    },
    "single_match_deep_analysis"
  );
  assert.equal(singleValidation.level, "warn");
  assert.ok(singleValidation.missing.includes("pitch_reality"));
  assert.ok(singleValidation.missing.includes("singleMatch"));

  const missingJsonValidation = aiInternals.validateStructuredAnalysis(null, "top10_ai_ranking");
  assert.equal(missingJsonValidation.level, "error");
  assert.equal(missingJsonValidation.ok, false);
});

test("AI message builder uses single-match prompt only for single workflow", () => {
  const singleMessages = require("../src/ai").buildAnalysisMessages({
    workflow: "single_match_deep_analysis",
    focusMatchId: "123",
    rows: [],
  });
  assert.match(singleMessages[1].content, /Football Match Multi-Track Analysis Engine/);
  assert.match(singleMessages[1].content, /Part D/);

  const compactSingleMessages = require("../src/ai").buildAnalysisMessages(
    {
      workflow: "single_match_deep_analysis",
      focusMatchId: "123",
      rows: [],
    },
    { compactSingleMatch: true }
  );
  assert.match(compactSingleMessages[1].content, /連線降載模式/);
  assert.ok(compactSingleMessages[1].content.length < singleMessages[1].content.length);

  const topMessages = require("../src/ai").buildAnalysisMessages({
    workflow: "top10_ai_ranking",
    rows: [],
  });
  assert.match(topMessages[0].content, /只做全局掃描與 Top 10/);
  assert.doesNotMatch(topMessages[0].content, /Football Match Multi-Track Analysis Engine/);
});

test("AI fast combine prompt uses compact summaries and retry helpers detect socket resets", () => {
  const messages = require("../src/ai").buildAnalysisMessages({
    workflow: "top10_ai_ranking",
    fastCombine: true,
    matchSummaries: [{ matchId: "m1", matchTitle: "A vs B", summary: "AI chunk summary" }],
  });
  assert.match(messages[0].content, /Batch Result Combiner/);
  assert.match(messages[1].content, /matchSummaries/);
  assert.equal(aiInternals.analysisMaxCompletionTokens({ fastCombine: true }), 3072);
  assert.equal(aiInternals.analysisMaxCompletionTokens({ workflow: "single_match_deep_analysis" }, { compactSingleMatch: true }), 4096);
  assert.equal(aiInternals.isRetryableAiError(new Error("socket hang up")), true);
  assert.equal(aiInternals.isRetryableAiError(new Error("AI HTTP 554")), true);
  assert.equal(aiInternals.isRetryableAiError(new Error("AI HTTP 401")), false);
});

test("AI single-match input keeps the same match market blocks together", () => {
  const input = aiInternals.buildSingleMatchInput({
    source: "titan007",
    workflow: "single_match_deep_analysis",
    focusMatchId: "m1",
    context: {
      injuries: [{ matchId: "m1", player: "Forward A", team: "Home" }],
      lineups: [
        {
          matchId: "m1",
          team: "Home",
          formation: "4-3-3",
          startXI: [{ name: "Player One", position: "F" }],
          substitutes: [],
        },
      ],
      weather: [{ matchId: "m1", available: true, temperature: 21 }],
    },
    matchGroups: [
      {
        matchId: "m1",
        match: {
          matchId: "m1",
          league: "Test League",
          home: "Home",
          away: "Away",
          kickoffTime: "2026-05-02 20:00",
          state: "",
          score: "0-0",
        },
        marketCounts: {
          asianFull: 1,
          asianHalf: 1,
          overUnderFull: 1,
          overUnderHalf: 1,
          europe: 1,
        },
        markets: {
          asianFull: {
            rows: [
              {
                bookmaker: "Pinna",
                initialHomeOdds: "0.80",
                initialHandicap: "半球",
                initialAwayOdds: "0.98",
                currentHomeOdds: "0.90",
                currentHandicap: "半球",
                currentAwayOdds: "0.86",
              },
            ],
          },
          asianHalf: {
            rows: [
              {
                bookmaker: "Pinna",
                initialHomeOdds: "0.92",
                initialHandicap: "平手/半球",
                initialAwayOdds: "0.84",
                currentHomeOdds: "1.00",
                currentHandicap: "平手/半球",
                currentAwayOdds: "0.74",
              },
            ],
          },
          overUnderFull: {
            rows: [
              {
                bookmaker: "Bet365",
                initialOverOdds: "0.83",
                initialTotal: "3",
                initialUnderOdds: "0.97",
                currentOverOdds: "0.90",
                currentTotal: "3",
                currentUnderOdds: "0.96",
              },
            ],
          },
          overUnderHalf: {
            rows: [
              {
                bookmaker: "Bet365",
                initialOverOdds: "0.95",
                initialTotal: "1/1.5",
                initialUnderOdds: "0.85",
                currentOverOdds: "1.19",
                currentTotal: "1/1.5",
                currentUnderOdds: "0.70",
              },
            ],
          },
          europe: {
            rows: [
              {
                bookmaker: "Bet365",
                initialWin: "1.80",
                initialDraw: "3.50",
                initialLoss: "4.00",
                currentWin: "1.83",
                currentDraw: "3.60",
                currentLoss: "4.10",
                currentReturnRate: "92.10",
              },
            ],
          },
        },
      },
    ],
    rows: [{ matchId: "m1", market: "asian", period: "full" }],
  });

  assert.equal(input.match_meta.match_id, "m1");
  assert.equal(input.match_meta.home_team, "Home");
  assert.equal(input.asian_handicap_series.length, 2);
  assert.equal(input.totals_ou_series.length, 2);
  assert.equal(input.odds_1x2_live[0].odds.home, "1.83");
  assert.equal(input.full_squad_list[0].name, "Player One");
  assert.equal(input.input_audit.asian_handicap_series, "derived");
  assert.equal(input.input_audit.totals_ou_series, "derived");
  assert.equal(input.input_audit["odds_1x2_open/live"], "derived");
  assert.equal(input.input_audit["recent_10_matches.xg"], "missing");
});

test("AI input preview exposes the actual single-match prompt JSON", () => {
  const preview = aiInternals.buildAiInputPreview({
    source: "titan007",
    workflow: "single_match_deep_analysis",
    focusMatchId: "m2",
    matchGroups: [
      {
        matchId: "m2",
        match: { matchId: "m2", home: "Home", away: "Away", league: "League" },
        markets: {},
      },
    ],
  });

  assert.equal(preview.type, "single_match_input");
  assert.equal(preview.matchId, "m2");
  assert.equal(preview.data.match_meta.home_team, "Home");
  assert.ok(preview.missingFields.includes("asian_handicap_series"));
});

test("AI Gemini native URL redacts query key for display", () => {
  const url = aiInternals.geminiGenerateContentUrl("https://qweapi.com", "gemini-2.5-flash", "sk-secret");
  assert.equal(url.toString(), "https://qweapi.com/v1/models/gemini-2.5-flash:generateContent?key=sk-secret");
  assert.equal(
    aiInternals.redactApiKeyFromUrl(url),
    "https://qweapi.com/v1/models/gemini-2.5-flash:generateContent?key=sk-***"
  );

  const bearerUrl = aiInternals.geminiGenerateContentUrl("https://qweapi.com", "gemini-2.5-flash", "sk-secret", {
    version: "v1beta",
    keyInQuery: false,
  });
  assert.equal(bearerUrl.toString(), "https://qweapi.com/v1beta/models/gemini-2.5-flash:generateContent");
});

test("parseLiveMatches reads Titan007 A records", () => {
  const script = `
    var A=Array(2);
    A[1]="2980859^#5ca39a^阿后备^阿後備^^洛斯安第斯后备队^洛斯安第斯後備隊^^阿马格罗后备队^阿爾馬格羅後備隊^^22:00^2026,3,28,23,07,38^3^1^2^1^1^0^1^1^6^^^0^0^^^True^0.5^^^^^^^^4-28^30029^30006^^38^0^^2026^0^1634^2^0^6^2^1^1^^0^^^7^^^^0^0^0^0^0^^^^0".split('^');
  `;

  const matches = parseLiveMatches(script, { allowedLeagues: false });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchId, "2980859");
  assert.equal(matches[0].league, "阿後備");
  assert.equal(matches[0].home, "洛斯安第斯後備隊");
  assert.equal(matches[0].away, "阿爾馬格羅後備隊");
  assert.equal(matches[0].state, "下半場");
  assert.equal(matches[0].score, "1-2");
});

test("parseLiveMatches strips Titan HTML tags from team names", () => {
  const script = `
    var A=Array(1);
    A[1]="1001^#5ca39a^卡亲王杯^卡亲王盃^^卡亲王盃^卡親王盃^^華卡拉<font color=#880000>(中)</font>^華卡拉<font color=#880000>(中)</font>^^22:15^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const matches = parseLiveMatches(script, { allowedLeagues: false });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].home, "卡親王盃");
  assert.equal(matches[0].away, "華卡拉(中)");
});

test("parseLiveMatches defaults to the configured leagues only", () => {
  const script = `
    var A=Array(2);
    A[1]="1001^#5ca39a^英超^英超^^阿仙奴^阿仙奴^^車路士^車路士^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="1002^#5ca39a^阿后备^阿後備^^洛斯安第斯后备队^洛斯安第斯後備隊^^阿马格罗后备队^阿爾馬格羅後備隊^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const matches = parseLiveMatches(script);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchId, "1001");
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes(matches[0].league));
});

test("parseLiveMatches searches inside the allowed league set", () => {
  const script = `
    var A=Array(2);
    A[1]="1001^#5ca39a^英超^英超^^阿仙奴^阿仙奴^^車路士^車路士^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="1002^#5ca39a^韓K聯^韓K聯^^首爾^首爾^^蔚山^蔚山^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const matches = parseLiveMatches(script, { league: "韩K联" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].league, "韓K聯");
});

test("parseLiveMatches includes Chile Cup and Brazil Serie B aliases", () => {
  const script = `
    var A=Array(5);
    A[1]="2501^#5ca39a^智利杯^智利杯^^主隊A^主隊A^^客隊A^客隊A^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="2502^#5ca39a^Copa Chile^Copa Chile^^主隊B^主隊B^^客隊B^客隊B^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[3]="2503^#5ca39a^巴西乙組聯賽^巴西乙組聯賽^^主隊C^主隊C^^客隊C^客隊C^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[4]="2504^#5ca39a^Brazilian Serie B^Brazilian Serie B^^主隊D^主隊D^^客隊D^客隊D^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[5]="2505^#5ca39a^其他聯賽^其他聯賽^^主隊E^主隊E^^客隊E^客隊E^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const defaultMatches = parseLiveMatches(script);
  assert.deepEqual(
    defaultMatches.map((match) => match.matchId),
    ["2501", "2502", "2503", "2504"]
  );
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("智利盃"));
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("巴西乙"));

  const brazilSearch = parseLiveMatches(script, { league: "巴西乙組聯賽" });
  assert.deepEqual(
    brazilSearch.map((match) => match.matchId),
    ["2503", "2504"]
  );
});

test("parseLiveMatches includes international friendlies and World Cup short names", () => {
  const script = `
    var A=Array(4);
    A[1]="2401^#5ca39a^國際友誼^國際友誼^^主隊A^主隊A^^客隊A^客隊A^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="2402^#5ca39a^国际友谊^國際友誼^^主隊B^主隊B^^客隊B^客隊B^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[3]="2403^#5ca39a^世盃^世盃^^主隊C^主隊C^^客隊C^客隊C^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[4]="2404^#5ca39a^世界杯^世界杯^^主隊D^主隊D^^客隊D^客隊D^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const defaultMatches = parseLiveMatches(script);
  assert.deepEqual(
    defaultMatches.map((match) => match.matchId),
    ["2401", "2402", "2403", "2404"]
  );
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("國際賽"));

  const internationalSearch = parseLiveMatches(script, { league: "國際賽" });
  assert.deepEqual(
    internationalSearch.map((match) => match.matchId),
    ["2401", "2402"]
  );

  const worldCupSearch = parseLiveMatches(script, { league: "世盃" });
  assert.deepEqual(
    worldCupSearch.map((match) => match.matchId),
    ["2403", "2404"]
  );
});

test("parseLiveMatches includes Japan top league current-year aliases", () => {
  const script = `
    var A=Array(1);
    A[1]="1001^#5ca39a^日職百年構想聯賽^日職百年構想聯賽^^橫濱水手^橫濱水手^^川崎前鋒^川崎前鋒^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const defaultMatches = parseLiveMatches(script);
  assert.equal(defaultMatches.length, 1);
  assert.equal(defaultMatches[0].league, "日職百年構想聯賽");
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("日職聯"));

  const searchedMatches = parseLiveMatches(script, { league: "日職聯" });
  assert.equal(searchedMatches.length, 1);
  assert.equal(searchedMatches[0].league, "日職百年構想聯賽");
});

test("parseLiveMatches includes added women and regional leagues", () => {
  const script = `
    var A=Array(18);
    A[1]="2001^#5ca39a^智利女甲^智利女甲^^主隊A^主隊A^^客隊A^客隊A^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="2002^#5ca39a^澳维超^澳維超^^主隊B^主隊B^^客隊B^客隊B^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[3]="2003^#5ca39a^欧女霸杯^歐女霸盃^^主隊C^主隊C^^客隊C^客隊C^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[4]="2004^#5ca39a^美冠聯^美冠聯^^主隊D^主隊D^^客隊D^客隊D^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[5]="2005^#5ca39a^美女職^美女職^^主隊E^主隊E^^客隊E^客隊E^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[6]="2006^#5ca39a^墨西聯^墨西聯^^主隊F^主隊F^^客隊F^客隊F^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[7]="2007^#5ca39a^墨西女足联^墨西女足聯^^主隊G^主隊G^^客隊G^客隊G^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[8]="2008^#5ca39a^澳威超^澳威超^^主隊H^主隊H^^客隊H^客隊H^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[9]="2009^#5ca39a^日女联^日女聯^^主隊I^主隊I^^客隊I^客隊I^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[10]="2010^#5ca39a^韩K2^韓K2^^主隊J^主隊J^^客隊J^客隊J^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[11]="2011^#5ca39a^阿联酋超^阿聯酋聯^^主隊K^主隊K^^客隊K^客隊K^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[12]="2012^#5ca39a^卡塔尔王子杯^卡塔爾王子盃^^主隊L^主隊L^^客隊L^客隊L^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[13]="2013^#5ca39a^美冠杯^美冠盃^^主隊M^主隊M^^客隊M^客隊M^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[14]="2014^#5ca39a^南美杯^南美盃^^主隊N^主隊N^^客隊N^客隊N^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[15]="2015^#5ca39a^卡亲王盃^卡塔爾王子盃^^主隊O^主隊O^^客隊O^客隊O^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[16]="2016^#5ca39a^其他女足^其他女足^^主隊P^主隊P^^客隊P^客隊P^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[17]="2017^#5ca39a^澳洲全國聯賽 - 昆士蘭^澳洲全國聯賽 - 昆士蘭^^主隊Q^主隊Q^^客隊Q^客隊Q^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[18]="2018^#5ca39a^澳洲全國聯賽 - 新南威爾斯^澳洲全國聯賽 - 新南威爾斯^^主隊R^主隊R^^客隊R^客隊R^^22:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const matches = parseLiveMatches(script);
  assert.deepEqual(
    matches.map((match) => match.matchId),
    [
      "2001",
      "2002",
      "2003",
      "2004",
      "2005",
      "2006",
      "2007",
      "2008",
      "2009",
      "2010",
      "2011",
      "2012",
      "2013",
      "2014",
      "2015",
      "2017",
      "2018",
    ]
  );
  assert.ok(DEFAULT_ALLOWED_LEAGUES.includes("澳昆超"));
});

test("parseLiveMatches includes Uruguay split and playoff league aliases", () => {
  const uruguayA = "\u70cf\u62c9\u7532A";
  const uruguayB = "\u70cf\u62c9\u7532B";
  const uruguayPlayoff = "\u4e4c\u62c9\u7532\u9644\u52a0\u8d5b";
  const uruguayPrimera = "\u4e4c\u62c9\u572d\u7532\u7ea7\u8054\u8d5b";
  const script = `
    var A=Array(5);
    A[1]="2201^#5ca39a^${uruguayA}^${uruguayA}^^Home A^Home A^^Away A^Away A^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="2202^#5ca39a^${uruguayB}^${uruguayB}^^Home B^Home B^^Away B^Away B^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[3]="2203^#5ca39a^${uruguayPlayoff}^${uruguayPlayoff}^^Home C^Home C^^Away C^Away C^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[4]="2204^#5ca39a^${uruguayPrimera}^${uruguayPrimera}^^Home D^Home D^^Away D^Away D^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[5]="2205^#5ca39a^Other^Other^^Home E^Home E^^Away E^Away E^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const defaultMatches = parseLiveMatches(script);
  assert.deepEqual(
    defaultMatches.map((match) => match.matchId),
    ["2201", "2202", "2203", "2204"]
  );

  const searchedMatches = parseLiveMatches(script, { league: "\u70cf\u62c9\u7532" });
  assert.deepEqual(
    searchedMatches.map((match) => match.matchId),
    ["2201", "2202", "2203", "2204"]
  );
});

test("parseLiveMatches includes target league playoff and championship suffixes", () => {
  const script = `
    var A=Array(6);
    A[1]="2301^#5ca39a^比甲附^比甲附^^Home A^Home A^^Away A^Away A^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="2302^#5ca39a^荷乙附^荷乙附^^Home B^Home B^^Away B^Away B^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[3]="2303^#5ca39a^比甲冠^比甲冠^^Home C^Home C^^Away C^Away C^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[4]="2304^#5ca39a^墨西甲附^墨西甲附^^Home D^Home D^^Away D^Away D^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[5]="2305^#5ca39a^墨西聯附^墨西聯附^^Home E^Home E^^Away E^Away E^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[6]="2306^#5ca39a^Other附^Other附^^Home F^Home F^^Away F^Away F^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const matches = parseLiveMatches(script);
  assert.deepEqual(
    matches.map((match) => match.matchId),
    ["2301", "2302", "2303", "2304", "2305"]
  );
});

test("parseLiveMatches accepts Titan short cup names for default targets", () => {
  const libertadores = "\u89e3\u653e\u8005\u676f";
  const sudamericana = "\u5357\u7f8e\u76c3";
  const concacaf = "\u7f8e\u51a0\u676f";
  const script = `
    var A=Array(4);
    A[1]="2101^#5ca39a^${libertadores}^${libertadores}^^Home A^Home A^^Away A^Away A^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[2]="2102^#5ca39a^${sudamericana}^${sudamericana}^^Home B^Home B^^Away B^Away B^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[3]="2103^#5ca39a^${concacaf}^${concacaf}^^Home C^Home C^^Away C^Away C^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
    A[4]="2104^#5ca39a^Other^Other^^Home D^Home D^^Away D^Away D^^06:00^2026,3,28,23,07,38^0^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^".split('^');
  `;

  const matches = parseLiveMatches(script);
  assert.deepEqual(
    matches.map((match) => match.matchId),
    ["2101", "2102", "2103"]
  );
});

test("normalizeMatchItems accepts mixed batch inputs and removes duplicates", () => {
  const matches = normalizeMatchItems([
    "2929586",
    { matchId: "2929586", league: "英超" },
    { matchId: "2976376", league: "歐冠盃", home: "巴黎聖日門" },
    { matchId: "abc" },
    "",
  ]);

  assert.deepEqual(matches, [
    { matchId: "2929586" },
    { matchId: "2976376", league: "歐冠盃", home: "巴黎聖日門" },
  ]);
});

test("parseOddsTable maps Asian handicap rows", () => {
  const html = `
    <table id="odds">
      <tr><th>公司</th></tr>
      <tr bgcolor="#FFFFFF">
        <td><input type="checkbox" name="oddsShow" data-id="1" value="0"></td>
        <td>澳*</td>
        <td><span class="down" companyID="1"></span></td>
        <td title="2026-04-01 21:27">0.79</td>
        <td title="2026-04-01 21:27" goals="0.25">平手/半球</td>
        <td title="2026-04-01 21:27">0.99</td>
        <td oddstype="wholeLastOdds" style="display: none;">0.94</td>
        <td goals="0.25" oddstype="wholeLastOdds" style="display: none;">平手/半球</td>
        <td oddstype="wholeLastOdds" style="display: none;">0.84</td>
        <td oddstype="wholeOdds">0.94</td>
        <td goals="0.25" oddstype="wholeOdds">平手/半球</td>
        <td oddstype="wholeOdds">0.84</td>
        <td><a>詳</a></td>
      </tr>
    </table>
  `;

  const rows = parseOddsTable(html, "asian", "full");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyId, "1");
  assert.equal(rows[0].company, "澳*");
  assert.equal(rows[0].initial.homeOdds, "0.79");
  assert.equal(rows[0].initial.handicap, "平手/半球");
  assert.equal(rows[0].initial.handicapValue, "0.25");
  assert.equal(rows[0].current.awayOdds, "0.84");
});

test("parseOddsTable handles Titan flat odds tables without tr tags", () => {
  const html = `
    <table id="odds">
      <th>公司</th>
      <td><input type="checkbox" name="oddsShow" data-id="1" value="0"></td>
      <td>澳*</td>
      <td></td>
      <td title="2026-04-01 21:27">0.79</td>
      <td title="2026-04-01 21:27" goals="0.25">平手/半球</td>
      <td title="2026-04-01 21:27">0.99</td>
      <td oddstype="wholeLastOdds" style="display: none;">0.94</td>
      <td goals="0.25" oddstype="wholeLastOdds" style="display: none;">平手/半球</td>
      <td oddstype="wholeLastOdds" style="display: none;">0.84</td>
      <td oddstype="wholeOdds">0.94</td>
      <td goals="0.25" oddstype="wholeOdds">平手/半球</td>
      <td oddstype="wholeOdds">0.84</td>
      <td><a>詳</a></td>
      <td><input type="checkbox" name="oddsShow" data-id="3" value="0"></td>
      <td>Crow*</td>
      <td></td>
      <td>0.80</td>
      <td goals="0">平手</td>
      <td>1.00</td>
      <td oddstype="wholeLastOdds" style="display: none;">0.90</td>
      <td goals="0" oddstype="wholeLastOdds" style="display: none;">平手</td>
      <td oddstype="wholeLastOdds" style="display: none;">0.90</td>
      <td oddstype="wholeOdds">0.90</td>
      <td goals="0" oddstype="wholeOdds">平手</td>
      <td oddstype="wholeOdds">0.90</td>
      <td><a>詳</a></td>
    </table>
  `;

  const rows = parseOddsTable(html, "asian", "full", { filterBookmakers: false });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].company, "澳*");
  assert.equal(rows[1].company, "Crow*");
  assert.equal(rows[1].current.handicap, "平手");
});

test("parseOddsTable can include hidden multi-line rows", () => {
  const html = `
    <table id="odds">
      <tr bgcolor="#FFFFFF">
        <td><input data-id="3"></td><td>Crow*<span class="feng">封</span></td><td></td>
        <td>0.84</td><td goals="0.25">平手/半球</td><td>1.04</td>
        <td oddstype="wholeLastOdds" style="display:none">0.98</td><td oddstype="wholeLastOdds" goals="0.25" style="display:none">平手/半球</td><td oddstype="wholeLastOdds" style="display:none">0.90</td>
        <td oddstype="wholeOdds">0.98</td><td oddstype="wholeOdds" goals="0.25">平手/半球</td><td oddstype="wholeOdds">0.90</td><td></td>
      </tr>
      <tr style="display:none" companyID="3" class="blue_txt">
        <td></td><td></td><td>盘2</td>
        <td>1.09</td><td goals="0.5">半球</td><td>0.79</td>
        <td oddstype="wholeLastOdds" style="display:none">1.23</td><td oddstype="wholeLastOdds" goals="0.5" style="display:none">半球</td><td oddstype="wholeLastOdds" style="display:none">0.70</td>
        <td oddstype="wholeOdds">1.23</td><td oddstype="wholeOdds" goals="0.5">半球</td><td oddstype="wholeOdds">0.70</td><td></td>
      </tr>
    </table>
  `;

  const rows = parseOddsTable(html, "asian", "full", { includeMulti: true });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].company, "Crow*");
  assert.equal(rows[0].isClosed, true);
  assert.equal(rows[1].company, "Crow*");
  assert.equal(rows[1].isMultiLine, true);
  assert.equal(rows[1].multiLabel, "盘2");
});

test("parseOddsPageMeta reads Titan odds page header", () => {
  const html = `
    <a href="http://info.titan007.com/cn/SubLeague.aspx?SclassID=292" class="LName">沙地聯</a>
    <span class="time">2026-05-08 02:00&nbsp;星期五</span>
    <div class="home">
      <img alt="艾沙比(主)">
      <a href="//zq.titan007.com/big/team/Summary/11137.html">艾沙比(主)</a>
    </div>
    <div class="guest">
      <img alt="艾納斯">
      <a href="//zq.titan007.com/big/team/Summary/2204.html">艾納斯</a>
    </div>
  `;

  assert.deepEqual(titanInternals.parseOddsPageMeta(html, "2852349"), {
    matchId: "2852349",
    league: "沙地聯",
    kickoffTime: "2026-05-08 02:00",
    home: "艾沙比",
    away: "艾納斯",
  });
});

test("identifyBookmaker maps Titan007 short names to configured bookmakers", () => {
  assert.deepEqual(identifyBookmaker("澳*"), { key: "macau", label: "澳門彩票" });
  assert.deepEqual(identifyBookmaker("36*(英国)", "Bet 365"), { key: "bet365", label: "Bet365" });
  assert.deepEqual(identifyBookmaker("威*"), { key: "william_hill", label: "威廉希爾" });
  assert.deepEqual(identifyBookmaker("香港马*"), { key: "hk_jockey", label: "香港賽馬會" });
});

test("filterBookmakerRows keeps only configured bookmakers by default", () => {
  const rows = filterBookmakerRows([
    { company: "Pinna*", value: 1 },
    { company: "36*", value: 2 },
    { company: "Crow*", value: 3 },
    { company: "香港马*", value: 4 },
    { company: "Interwet*", value: 5 },
  ]);

  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.bookmakerKey),
    ["pinna", "bet365", "crown", "hk_jockey"]
  );
});

test("filterBookmakerRows can identify Titan target bookmakers by market company id", () => {
  const rows = filterBookmakerRows([
    { market: "asian", companyId: "1", company: "unreadable", value: 1 },
    { market: "asian", companyId: "3", company: "Crow*", value: 2 },
    { market: "overUnder", companyId: "48", company: "unreadable", value: 3 },
    { market: "europe", companyId: "177", company: "unreadable", value: 4 },
    { market: "europe", companyId: "281", company: "unreadable", value: 5 },
  ]);

  assert.deepEqual(
    rows.map((row) => row.bookmakerKey),
    ["pinna", "bet365", "crown", "hk_jockey"]
  );
});

test("filterBookmakerRows maps Titan Asian expanded pool and keeps one main row per bookmaker", () => {
  const rows = filterBookmakerRows([
    { market: "asian", companyId: "47", company: "平*", value: "main", isMultiLine: false },
    { market: "asian", companyId: "47", company: "平*", value: "multi", isMultiLine: true, multiLabel: "盘2" },
    { market: "asian", companyId: "31", company: "利*", value: "sbobet" },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookmakerKey, "pinna");
  assert.equal(rows[0].value, "main");
});

test("filterBookmakerRows keeps Crown as a target bookmaker and excludes SBOBET", () => {
  const asianRows = filterBookmakerRows([
    { market: "asian", companyId: "3", company: "Crow*", value: "crown" },
    { market: "asian", companyId: "31", company: "利*", value: "sbobet" },
  ]);
  const europeRows = filterBookmakerRows([
    { market: "europe", companyId: "3", company: "Crow*", value: "crown" },
    { market: "europe", companyId: "31", company: "利*", value: "sbobet" },
  ]);

  assert.deepEqual(
    asianRows.map((row) => row.bookmakerKey),
    ["crown"]
  );
  assert.deepEqual(
    europeRows.map((row) => row.bookmakerKey),
    ["crown"]
  );
});

test("Titan extraction target coverage is limited to four AI-friendly bookmakers", () => {
  assert.deepEqual(titanInternals.expectedBookmakerKeysForMarket("asian"), [
    "pinna",
    "bet365",
    "crown",
    "hk_jockey",
  ]);
  assert.deepEqual(titanInternals.expectedBookmakerKeysForMarket("europe"), [
    "pinna",
    "bet365",
    "crown",
    "hk_jockey",
  ]);
});

test("parseEuropeDataJs reads 1x2d game rows", () => {
  const script = `
    var game=Array("281|151930631|Bet 365|2.05|3.25|3.4|44.77|28.24|26.99|91.78|2.2|3.25|3.25|42.48|28.76|28.76|93.46|0.93|0.93|0.95|2026,04-1,04,04,56,00|36*(英国)|1|0|0.86|0.93|0.99");
  `;

  const rows = parseEuropeDataJs(script);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyId, "281");
  assert.equal(rows[0].company, "36*(英国)");
  assert.equal(rows[0].initial.win, "2.05");
  assert.equal(rows[0].current.win, "2.2");
  assert.equal(rows[0].kellyLoss, "0.95");
  assert.equal(rows[0].changedAt, "2026-04-04 04:56:00");
});

test("parseEuropeDataJs can read partial 1x2d game arrays before the JS ending arrives", () => {
  const script =
    'var matchname="Test"; var game=Array("281|151930631|Bet 365|2.05|3.25|3.4|44.77|28.24|26.99|91.78|2.2|3.25|3.25|42.48|28.76|28.76|93.46|0.93|0.93|0.95|2026,04-1,04,04,56,00|36*(英国)|1|0|0.86|0.93|0.99","80|151930632|Macauslot|2|3|4|40|30|30|90|2.1|3.1|3.8|39|31|30|91|0.9|0.9|0.9|2026,04-1,04,04,57,00|澳*|0|0|0.9|0.9|0.9"';

  const rows = parseEuropeDataJs(script);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].companyId, "281");
  assert.equal(rows[1].companyId, "80");
});

test("latestEuropeRows keeps only latest row per bookmaker", () => {
  const rows = titanInternals.latestEuropeRows([
    { bookmakerKey: "betfair", company: "Betfair", win: "2.44", changedAt: "2026-05-02 17:03:00" },
    { bookmakerKey: "libo", company: "立博", win: "2.37", changedAt: "2026-05-02 17:01:00" },
    { bookmakerKey: "betfair", company: "Betfair", win: "2.00", changedAt: "2026-05-02 14:22:00" },
    { bookmakerKey: "libo", company: "立博", win: "2.20", changedAt: "2026-05-02 17:03:00" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.bookmakerKey === "betfair").win, "2.44");
  assert.equal(rows.find((row) => row.bookmakerKey === "libo").win, "2.20");
});

test("Titan mobile probability parser returns threshold events only from 10+ match samples", () => {
  const html = `
    <section>
      <h3>概率事件</h3>
      <div class="event">
        <p>•胜:100% •平:0% •负:0%</p>
        <p>近1场Crow*相同胜平负</p>
      </div>
      <div class="event">
        <p>•胜:100% •平:0% •负:0%</p>
        <p>近10场36*相同胜平负</p>
      </div>
      <div class="event">
        <p>•赢:40% •走:0% •输:60%</p>
        <p>近10场Crow*相同让球</p>
      </div>
      <div class="event">
        <p>•大:80% •走:0% •小:20%</p>
        <p>近10场Crow*相同总进球数</p>
      </div>
    </section>
  `;

  const events = require("../src/titan").parseProbabilityEvents(html, { threshold: 80 });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "大");
  assert.equal(events[0].percent, 80);
  assert.equal(events[0].description, "近10场Crow*相同总进球数");
});

test("Titan mobile probability parser reads freshJsonData probabilityDatas with 10+ match samples", () => {
  const html = `
    <script>
      var freshJsonData = {
        "probabilityDatas": {
          "dataList": [
            {
              "companyName": "Crow*",
              "companyId": 3,
              "typeDatas": [
                {
                  "kind": "ALL",
                  "oddsType": "EURO",
                  "probStatistics": [
                    { "countType": "Ten", "count": 10, "winScale": 100, "drawScale": 0, "lossScale": 0 }
                  ]
                },
                {
                  "kind": "ALL",
                  "oddsType": "OU",
                  "probStatistics": [
                    { "countType": "Ten", "count": 10, "winScale": 80, "drawScale": 0, "lossScale": 20 }
                  ]
                }
              ]
            }
          ]
        }
      };
    </script>
  `;

  const events = require("../src/titan").parseProbabilityEvents(html, { threshold: 80 });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "大");
  assert.equal(events[0].market, "总进球数");
  assert.equal(events[0].companyName, "Crow*");
  assert.equal(events[0].description, "近10场Crow*相同总进球数");
});

test("Titan panlu parser detects head-to-head over 90 percent signals", () => {
  const script = `
    var p=new Array();
    p[0]=['比甲','#996600','26-04-19',11,22,3,1,1,0,0.5];
    p[1]=['比甲','#996600','25-03-16',22,11,2,2,1,1,-0.25];
    p[2]=['比甲','#996600','24-11-02',11,22,4,0,2,0,1];
    p[3]=['比甲','#996600','24-02-02',33,44,0,0,0,0,0];
  `;

  const records = titanInternals.parsePanluRecords(script);
  const result = titanInternals.headToHeadOverUnderStats(
    { matchId: "1001", league: "比甲", homeTeamId: "11", awayTeamId: "22", home: "主", away: "客" },
    records,
    { threshold: 90, minSampleCount: 1 }
  );

  assert.equal(records.length, 4);
  assert.equal(result.stats.sampleCount, 3);
  assert.equal(result.stats.overPercent, 100);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].type, "大球");
  assert.equal(result.hits[0].market, "過往對賽大小球");
});

test("Titan panlu parser detects head-to-head under 90 percent signals", () => {
  const script = `
    var p=new Array();
    p[0]=['荷乙','#003900','26-04-19',51,62,1,0,1,0,0.5];
    p[1]=['荷乙','#003900','25-03-16',62,51,0,0,0,0,-0.25];
    p[2]=['荷乙','#003900','24-11-02',51,62,1,1,1,0,1];
  `;

  const records = titanInternals.parsePanluRecords(script);
  const result = titanInternals.headToHeadOverUnderStats(
    { matchId: "1002", league: "荷乙附", homeTeamId: "51", awayTeamId: "62" },
    records,
    { threshold: 90, minSampleCount: 1 }
  );

  assert.equal(result.stats.underPercent, 100);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].type, "小球");
});

test("Titan panlu head-to-head over/under requires at least 8 samples", () => {
  const script = `
    var p=new Array();
    p[0]=['荷甲','#ff66aa','25-08-17',71,82,0,3,0,1,0.5];
    p[1]=['荷甲','#ff66aa','24-04-25',82,71,1,3,1,1,-0.25];
    p[2]=['荷甲','#ff66aa','23-12-07',71,82,5,1,3,1,1];
    p[3]=['荷甲','#ff66aa','23-04-18',82,71,1,0,0,0,0];
    p[4]=['荷甲','#ff66aa','23-02-26',82,71,3,1,1,1,0];
    p[5]=['荷甲','#ff66aa','22-09-04',71,82,2,1,2,0,0];
    p[6]=['荷甲','#ff66aa','22-04-03',71,82,3,3,3,1,0];
    p[7]=['荷甲','#ff66aa','21-10-30',82,71,5,2,2,2,0];
    p[8]=['荷甲','#ff66aa','21-02-06',82,71,3,0,2,0,0];
    p[9]=['荷甲','#ff66aa','20-10-25',71,82,3,1,1,0,0];
  `;

  const records = titanInternals.parsePanluRecords(script);
  const target = { matchId: "1003", league: "荷甲", homeTeamId: "71", awayTeamId: "82" };
  const sevenSample = titanInternals.headToHeadOverUnderStats(target, records.slice(0, 7), { threshold: 80 });
  const eightSample = titanInternals.headToHeadOverUnderStats(target, records.slice(0, 8), { threshold: 80 });

  assert.equal(sevenSample.noData, true);
  assert.equal(sevenSample.hits.length, 0);
  assert.match(sevenSample.note, /少於 8 場/);
  assert.equal(eightSample.noData, false);
  assert.equal(eightSample.stats.sampleCount, 8);
  assert.equal(eightSample.hits.length, 1);
  assert.equal(eightSample.hits[0].type, "大球");
});

test("HKJC odds scanner detects configured odds patterns", () => {
  const match = {
    id: "5001",
    frontEndId: "FB1",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試盃", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };
  const line = {
    lineId: "0",
    condition: "0.0",
    status: "AVAILABLE",
    combinations: [
      { str: "H", currentOdds: "2.14", status: "AVAILABLE", selections: [{ str: "H", name_ch: "主隊勝" }] },
      { str: "A", currentOdds: "3", status: "AVAILABLE", selections: [{ str: "A", name_ch: "客隊勝" }] },
      { str: "D", currentOdds: "3.00", status: "AVAILABLE", selections: [{ str: "D", name_ch: "和" }] },
    ],
  };

  const hadHits = hkjcInternals.scanHad(match, {
    oddsType: "HAD",
    status: "SELLINGSTARTED",
    updateAt: "2026-05-01T10:00:00.000+08:00",
    lines: [line],
  });
  assert.equal(hadHits.length, 1);
  assert.equal(hadHits[0].rule, "HAD_2.14_3.00_3.00");
  assert.equal(hadHits[0].homeOdds, "2.14");
  assert.equal(hadHits[0].awayOdds, "3.00");

  const drawHits = hkjcInternals.scanDrawOdds(
    match,
    {
      oddsType: "FHA",
      lines: [
        {
          lineId: "0",
          combinations: [{ str: "D", currentOdds: "1.76", selections: [{ str: "D", name_ch: "和" }] }],
        },
      ],
    },
    "1.76",
    "半場主客和 和 1.76"
  );
  assert.equal(drawHits.length, 1);
  assert.equal(drawHits[0].odds, "1.76");

  const fhaSideHits = hkjcInternals.scanPool(match, {
    oddsType: "FHA",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "H", currentOdds: "2.03", selections: [{ str: "H", name_ch: "半場主" }] },
          { str: "A", currentOdds: "2.03", selections: [{ str: "A", name_ch: "半場客" }] },
          { str: "D", currentOdds: "3.40", selections: [{ str: "D", name_ch: "半場和" }] },
        ],
      },
    ],
  });
  assert.equal(fhaSideHits.length, 2);
  assert.deepEqual(
    fhaSideHits.map((hit) => hit.selection),
    ["H", "A"]
  );
  assert.equal(fhaSideHits[0].rule, "FHA_HOME_AWAY_2.03");

  const anyHits = hkjcInternals.scanAnyOdds(
    match,
    {
      oddsType: "FHL",
      lines: [
        {
          lineId: "0",
          combinations: [{ str: "L", currentOdds: "1.94", selections: [{ str: "L", name_ch: "細" }] }],
        },
      ],
    },
    ["1.66", "1.69", "1.94"],
    "半場入球大細"
  );
  assert.equal(anyHits.length, 1);
  assert.equal(anyHits[0].selectionName, "細");
});

test("HKJC special odds labels and alias pool types are readable", () => {
  const match = {
    id: "5002",
    frontEndId: "FB2",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試盃", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };

  const hadHits = hkjcInternals.scanHad(match, {
    oddsType: "HAD",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "H", currentOdds: "2.14", selections: [{ str: "H", name_ch: "主" }] },
          { str: "D", currentOdds: "3.00", selections: [{ str: "D", name_ch: "和" }] },
          { str: "A", currentOdds: "3.00", selections: [{ str: "A", name_ch: "客" }] },
        ],
      },
    ],
  });
  assert.equal(hadHits[0].ruleLabel, "主客和 2.14 / 3.00 / 3.00");

  const ehhHits = hkjcInternals.scanPool(match, {
    oddsType: "EHH",
    lines: [
      {
        lineId: "0",
        combinations: [{ str: "D", currentOdds: "3.10", selections: [{ str: "D", name_ch: "和" }] }],
      },
    ],
  });
  assert.equal(ehhHits.length, 1);
  assert.equal(ehhHits[0].ruleLabel, "讓球主客和 和 3.10");

  const ehlHits = hkjcInternals.scanPool(match, {
    oddsType: "EHL",
    lines: [
      {
        lineId: "0",
        combinations: [{ str: "H", currentOdds: "1.69", selections: [{ str: "H", name_ch: "大" }] }],
      },
    ],
  });
  assert.equal(ehlHits.length, 1);
  assert.equal(ehlHits[0].ruleLabel, "入球大細 1.69");
});

test("HKJC CRS scanner detects equal odds in the same total-goals bucket", () => {
  const match = {
    id: "5003",
    frontEndId: "FB3",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試盃", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };

  const hits = hkjcInternals.scanCorrectScoreEqualOdds(match, {
    oddsType: "CRS",
    status: "SELLINGSTARTED",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "0201", currentOdds: "7.5", status: "AVAILABLE", selections: [{ str: "0201", name_ch: "2:1" }] },
          { str: "0300", currentOdds: "7.50", status: "AVAILABLE", selections: [{ str: "0300", name_ch: "3:0" }] },
          { str: "0101", currentOdds: "6.0", status: "AVAILABLE", selections: [{ str: "0101", name_ch: "1:1" }] },
          { str: "0002", currentOdds: "9.0", status: "AVAILABLE", selections: [{ str: "0002", name_ch: "0:2" }] },
        ],
      },
    ],
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].totalGoals, 3);
  assert.equal(hits[0].odds, "7.50");
  assert.equal(hits[0].selectionName, "2:1 / 3:0");
  assert.equal(hits[0].ruleLabel, "全場波膽：同總入球 3 同賠率");
});

test("HKJC correct score equal-odds scanner hides odds at 15 or above", () => {
  const match = {
    id: "5009",
    frontEndId: "FB9",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試聯賽", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };

  const hits = hkjcInternals.scanCorrectScoreEqualOdds(match, {
    oddsType: "CRS",
    status: "SELLINGSTARTED",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "0201", currentOdds: "15.00", status: "AVAILABLE", selections: [{ str: "0201", name_ch: "2:1" }] },
          { str: "0300", currentOdds: "15", status: "AVAILABLE", selections: [{ str: "0300", name_ch: "3:0" }] },
          { str: "0101", currentOdds: "14.50", status: "AVAILABLE", selections: [{ str: "0101", name_ch: "1:1" }] },
          { str: "0002", currentOdds: "14.5", status: "AVAILABLE", selections: [{ str: "0002", name_ch: "0:2" }] },
        ],
      },
    ],
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].odds, "14.50");
  assert.equal(hits[0].selectionName, "1:1 / 0:2");
});

test("HKJC FCS scanner detects 0-0 equal odds with 1-0 or 0-1", () => {
  const match = {
    id: "5004",
    frontEndId: "FB4",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試盃", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };

  const hits = hkjcInternals.scanHalfCorrectScoreTargetPairs(match, {
    oddsType: "FCS",
    status: "SELLINGSTARTED",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "0000", currentOdds: "3.50", status: "AVAILABLE", selections: [{ str: "0000", name_ch: "0:0" }] },
          { str: "0100", currentOdds: "3.5", status: "AVAILABLE", selections: [{ str: "0100", name_ch: "1:0" }] },
          { str: "0001", currentOdds: "3.50", status: "AVAILABLE", selections: [{ str: "0001", name_ch: "0:1" }] },
          { str: "0101", currentOdds: "7.00", status: "AVAILABLE", selections: [{ str: "0101", name_ch: "1:1" }] },
        ],
      },
    ],
  });

  assert.equal(hits.length, 2);
  assert.equal(hits[0].pool, "FCS");
  assert.equal(hits[0].selectionName, "0:0 / 1:0");
  assert.equal(hits[0].ruleLabel, "半場波膽：1:0 與 0:0 同賠率");
  assert.equal(hits[1].selectionName, "0:0 / 0:1");
  assert.equal(hits[1].ruleLabel, "半場波膽：0:1 與 0:0 同賠率");
});

test("HKJC correct-score scanner detects 1-0 and 1-1 same odds within full or half pool", () => {
  const match = {
    id: "5010",
    frontEndId: "FB10",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試聯賽", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };

  const fullHits = hkjcInternals.scanPool(match, {
    oddsType: "CRS",
    status: "SELLINGSTARTED",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "0100", currentOdds: "8.50", status: "AVAILABLE", selections: [{ str: "0100", name_ch: "1:0" }] },
          { str: "0101", currentOdds: "8.5", status: "AVAILABLE", selections: [{ str: "0101", name_ch: "1:1" }] },
          { str: "0200", currentOdds: "16.00", status: "AVAILABLE", selections: [{ str: "0200", name_ch: "2:0" }] },
          { str: "0202", currentOdds: "16.00", status: "AVAILABLE", selections: [{ str: "0202", name_ch: "2:2" }] },
        ],
      },
    ],
  });
  const halfHits = hkjcInternals.scanPool(match, {
    oddsType: "FCS",
    status: "SELLINGSTARTED",
    lines: [
      {
        lineId: "0",
        combinations: [
          { str: "0100", currentOdds: "7.50", status: "AVAILABLE", selections: [{ str: "0100", name_ch: "1:0" }] },
          { str: "0101", currentOdds: "7.5", status: "AVAILABLE", selections: [{ str: "0101", name_ch: "1:1" }] },
        ],
      },
    ],
  });

  assert.equal(fullHits.length, 1);
  assert.equal(fullHits[0].rule, "CRS_PAIR_10_11_ODDS_8.50");
  assert.equal(fullHits[0].selectionName, "1:0 / 1:1");
  assert.equal(halfHits.length, 1);
  assert.equal(halfHits[0].rule, "FCS_PAIR_10_11_ODDS_7.50");
  assert.equal(halfHits[0].selectionName, "1:0 / 1:1");
});

test("HKJC scanner detects same odds and same score between full-time and half-time correct score", () => {
  const match = {
    id: "5006",
    frontEndId: "FB6",
    kickOffTime: "2026-05-01T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: { name_ch: "測試盃", code: "TST" },
    homeTeam: { name_ch: "主隊" },
    awayTeam: { name_ch: "客隊" },
  };

  const hits = hkjcInternals.scanFullHalfCorrectScoreEqualOdds(
    match,
    {
      oddsType: "CRS",
      status: "SELLINGSTARTED",
      lines: [
        {
          lineId: "0",
          combinations: [
            { str: "0201", currentOdds: "7.5", status: "AVAILABLE", selections: [{ str: "0201", name_ch: "2:1" }] },
            { str: "0300", currentOdds: "8.0", status: "AVAILABLE", selections: [{ str: "0300", name_ch: "3:0" }] },
          ],
        },
      ],
    },
    {
      oddsType: "FCS",
      status: "SELLINGSTARTED",
      lines: [
        {
          lineId: "0",
          combinations: [
            { str: "0100", currentOdds: "7.50", status: "AVAILABLE", selections: [{ str: "0100", name_ch: "1:0" }] },
            { str: "0102", currentOdds: "7.50", status: "AVAILABLE", selections: [{ str: "0102", name_ch: "1:2" }] },
            { str: "0201", currentOdds: "7.50", status: "AVAILABLE", selections: [{ str: "0201", name_ch: "2:1" }] },
            { str: "0000", currentOdds: "4.00", status: "AVAILABLE", selections: [{ str: "0000", name_ch: "0:0" }] },
          ],
        },
      ],
    }
  );

  assert.equal(hits.length, 1);
  assert.equal(hits[0].pool, "CRS/FCS");
  assert.equal(hits[0].odds, "7.50");
  assert.equal(hits[0].totalGoals, 3);
  assert.match(hits[0].selectionName, /2:1/);
  assert.doesNotMatch(hits[0].selectionName, /1:0/);
  assert.doesNotMatch(hits[0].selectionName, /1:2/);
  assert.ok(hits[0].scoreOddsGroup.some((item) => item.period === "half" && item.score === "2:1"));
  assert.equal(hits[0].scoreCount, 2);
});

test("HKJC CRS dedupe key ignores source page duplicates", () => {
  const baseHit = {
    matchId: "5005",
    frontEndId: "FB5",
    kickOffTime: "2026-05-03T21:30:00.000+08:00",
    pool: "CRS",
    rule: "CRS_SAME_TOTAL_GOALS_EQUAL_ODDS",
    lineId: "0",
    totalGoals: 4,
    odds: "11.00",
    selectionName: "3:1 / 2:2",
  };

  const crsHit = {
    ...baseHit,
    source: "crs",
    sourcePage: "https://bet.hkjc.com/ch/football/crs",
  };
  const inplayHit = {
    ...baseHit,
    source: "inplay_all",
    sourcePage: "https://bet.hkjc.com/ch/football/inplay_all/FB5",
  };

  assert.equal(hkjcInternals.hkjcHitDedupeKey(crsHit), hkjcInternals.hkjcHitDedupeKey(inplayHit));
  assert.notEqual(
    hkjcInternals.hkjcHitDedupeKey(crsHit),
    hkjcInternals.hkjcHitDedupeKey({ ...inplayHit, selectionName: "4:0 / 2:2" })
  );
});

test("HKJC CRS scan window rejects future matches outside 24 hours", () => {
  const now = new Date("2026-05-03T10:00:00.000+08:00");
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  assert.equal(
    hkjcInternals.isWithinWindowOrInplay(
      {
        kickOffTime: "2026-05-03T20:00:00.000+08:00",
        status: "PRESALE",
      },
      now,
      end
    ),
    true
  );

  assert.equal(
    hkjcInternals.isWithinWindowOrInplay(
      {
        kickOffTime: "2026-06-01T20:00:00.000+08:00",
        status: "PRESALE",
        foPools: [{ inplay: true }],
      },
      now,
      end
    ),
    false
  );

  assert.equal(
    hkjcInternals.isWithinWindowOrInplay(
      {
        kickOffTime: "2026-05-03T08:30:00.000+08:00",
        status: "INPLAY",
      },
      now,
      end
    ),
    true
  );
});

test("HKJC match checker fuzzy-matches Titan teams and flags opened pools", () => {
  const hkjcMatch = {
    matchId: "h1",
    frontEndId: "FB9001",
    kickOffTime: "2026-05-02T20:00:00.000+08:00",
    status: "PRESALE",
    tournament: "英超",
    home: "Arsenal FC",
    away: "Chelsea FC",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };
  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "1001",
      league: "英超",
      kickoffTime: "2026-05-02T20:05:00.000+08:00",
      home: "Arsenal",
      away: "Chelsea",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "open");
  assert.equal(check.matched.frontEndId, "FB9001");
  assert.ok(check.score >= 90);
  assert.equal(hkjcInternals.normalizeTeamName("Arsenal FC"), "arsenal");
});

test("HKJC match checker uses Titan translated team aliases", () => {
  const hkjcMatch = {
    matchId: "h2",
    frontEndId: "FB8939",
    kickOffTime: "2026-05-08T03:00:00.000+08:00",
    status: "PREEVENT",
    tournament: "歐霸盃",
    home: "弗賴堡",
    away: "布拉加",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };

  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "2976658",
      league: "歐霸盃",
      kickoffTime: "03:00",
      home: "費雷堡",
      homeSimplified: "弗赖堡",
      homeTraditional: "費雷堡",
      away: "布拉加",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "open");
  assert.equal(check.matched.frontEndId, "FB8939");
  assert.ok(check.score >= 90);
});

test("HKJC match checker tolerates club prefixes and one-character transliteration drift", () => {
  const hkjcMatch = {
    matchId: "h3",
    frontEndId: "FB8971",
    kickOffTime: "2026-05-08T06:00:00.000+08:00",
    status: "PREEVENT",
    tournament: "南美自由盃",
    home: "CA普拉坦斯",
    away: "彭拿路",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };

  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "2963567",
      league: "解放者杯",
      kickoffTime: "06:00",
      home: "普拉騰斯",
      away: "彭拿路",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "open");
  assert.equal(check.matched.frontEndId, "FB8971");
  assert.ok(check.score >= 85);
  assert.equal(hkjcInternals.normalizeTeamName("CA普拉坦斯"), "普拉坦斯");
});

test("HKJC match checker applies team alias groups across all compared matches", () => {
  const hkjcMatch = {
    matchId: "h5",
    frontEndId: "FB8973",
    kickOffTime: "2026-05-08T08:00:00.000+08:00",
    status: "PREEVENT",
    tournament: "南美自由盃",
    home: "哥甘保",
    away: "秘魯體育大學",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };

  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "2963558",
      league: "解放者杯",
      kickoffTime: "08:00",
      home: "科金博",
      away: "秘魯體育大學",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "open");
  assert.equal(check.matched.frontEndId, "FB8973");
  assert.ok(check.score >= 90);
});

test("HKJC match checker matches Titan Chinese names against HKJC English names", () => {
  const hkjcMatch = {
    matchId: "h7",
    frontEndId: "FB8973",
    kickOffTime: "2026-05-08T08:00:00.000+08:00",
    status: "PREEVENT",
    tournament: "南美自由盃",
    tournamentEn: "Copa Libertadores",
    home: "",
    homeEn: "Coquimbo Unido",
    away: "",
    awayEn: "Universitario Deportes",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };

  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "2963558",
      league: "解放者杯",
      kickoffTime: "08:00",
      home: "科金博",
      away: "秘魯體育大學",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "open");
  assert.equal(check.matched.frontEndId, "FB8973");
  assert.ok(check.score >= 90);
  assert.equal(check.homeScore, 100);
  assert.equal(check.awayScore, 100);
});

test("HKJC match checker keeps same-time wrong teams below possible threshold", () => {
  const hkjcMatch = {
    matchId: "h4",
    frontEndId: "FB8964",
    kickOffTime: "2026-05-08T03:00:00.000+08:00",
    status: "PREEVENT",
    tournament: "歐霸盃",
    home: "阿士東維拉",
    away: "諾定咸森林",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };

  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "2976658",
      league: "歐霸盃",
      kickoffTime: "03:00",
      home: "費雷堡",
      homeSimplified: "弗赖堡",
      away: "布拉加",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "not_found");
  assert.ok(check.score < 58);
});

test("HKJC match checker does not open on one matching side only", () => {
  const hkjcMatch = {
    matchId: "h6",
    frontEndId: "FB8964",
    kickOffTime: "2026-05-08T03:00:00.000+08:00",
    status: "PREEVENT",
    tournament: "歐霸盃",
    home: "阿士東維拉",
    away: "諾定咸森林",
    poolTypes: ["HAD", "HIL"],
    pools: [{ pool: "HAD", status: "SELLINGSTARTED" }],
  };

  const check = hkjcInternals.compareTitanMatchToHkjc(
    {
      matchId: "x1",
      league: "歐霸盃",
      kickoffTime: "03:00",
      home: "阿士東維拉",
      away: "布拉加",
    },
    [hkjcMatch]
  );

  assert.equal(check.status, "possible");
  assert.ok(check.score < 72);
});

test("HKJC match checker short-circuits empty Titan lists", async () => {
  const { checkTitanMatchesInHkjc } = require("../src/hkjc");
  const result = await checkTitanMatchesInHkjc({ matches: [] });
  assert.equal(result.checkedMatches, 0);
  assert.deepEqual(result.checks, []);
});

test("normalizeOdds compares integer-style HKJC odds as two decimals", () => {
  assert.equal(normalizeOdds("3"), "3.00");
  assert.equal(normalizeOdds("1.760"), "1.76");
});
