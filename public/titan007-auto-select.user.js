// ==UserScript==
// @name         Titan007 App League Selector
// @namespace    local.titan007-odds-extractor
// @version      1.0.0
// @description  Select the leagues supported by the local odds extractor.
// @match        https://live.titan007.com/indexall_big.aspx*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const PORTS = Array.from({ length: 21 }, (_, index) => 3000 + index);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalize(value) {
    return String(value || "")
      .replace(/\[\s*\d+(?:\s*\+\s*\d+)?\s*\]\s*$/, "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\s\u3000·・,，.。:：()（）\[\]【】_-]/g, "")
      .trim();
  }

  function request(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 1800,
        onload: (response) => {
          try {
            const payload = JSON.parse(response.responseText);
            if (response.status >= 200 && response.status < 300 && payload.ok && Array.isArray(payload.leagueNames)) {
              resolve(payload.leagueNames);
            } else {
              reject(new Error("本機 App 未回傳聯賽清單"));
            }
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error("無法連接本機 App")),
        ontimeout: () => reject(new Error("連接本機 App 逾時")),
      });
    });
  }

  async function getLeagueNames() {
    for (const port of PORTS) {
      try {
        return await request(`http://127.0.0.1:${port}/api/leagues`);
      } catch {
        // The local server may have moved to the next available port.
      }
    }
    throw new Error("找不到本機 App。請先啟動 App，再重新載入 Titan007。");
  }

  async function waitForLeagueList() {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const root = document.getElementById("myleague");
      const spans = root?.querySelectorAll('span[id^="myleague_"]');
      if (root && spans?.length && typeof unsafeWindow.SelectOK === "function") return { root, spans };
      await sleep(500);
    }
    throw new Error("Titan007 聯賽清單載入逾時，請重新整理頁面。");
  }

  function applyLeagueSelection(spans, leagueNames) {
    const allowed = new Set(leagueNames.map(normalize).filter(Boolean));
    const entriesById = new Map();
    for (const span of spans) {
      if (!entriesById.has(span.id)) entriesById.set(span.id, []);
      entriesById.get(span.id).push(span);
    }
    let matched = 0;

    for (const entries of entriesById.values()) {
      const span = entries[0];
      const label = span.textContent || "";
      const leagueName = normalize(label);
      const shouldSelect = allowed.has(leagueName);
      const specialMenu = span.parentElement?.querySelector(":scope > ul.sclassPopUl");

      if (shouldSelect) matched += 1;

      if (specialMenu) {
        const target = [...specialMenu.querySelectorAll("li")].find((item) =>
          shouldSelect ? /全部/.test(item.textContent || "") : /不選/.test(item.textContent || "")
        );
        if (target && !target.classList.contains("on")) target.click();
      } else if (span.classList.contains("on") !== shouldSelect) {
        span.click();
      }

      for (const duplicate of entries) {
        duplicate.classList.toggle("on", shouldSelect);
        const duplicateMenu = duplicate.parentElement?.querySelector(":scope > ul.sclassPopUl");
        if (!duplicateMenu) continue;
        for (const item of duplicateMenu.querySelectorAll("li")) {
          item.classList.toggle("on", shouldSelect ? /全部/.test(item.textContent || "") : /不選/.test(item.textContent || ""));
        }
      }
    }

    if (!matched) throw new Error("目前頁面未找到 App 支援的聯賽，沒有更改 Titan007 篩選。");
    unsafeWindow.SelectOK(1);
    return matched;
  }

  function showNotice(message, isError = false) {
    const notice = document.createElement("div");
    notice.textContent = `App 聯賽篩選：${message}`;
    Object.assign(notice.style, {
      position: "fixed",
      zIndex: "2147483647",
      top: "10px",
      right: "10px",
      maxWidth: "min(420px, calc(100vw - 20px))",
      padding: "10px 14px",
      color: "#fff",
      background: isError ? "#9b2c2c" : "#236b45",
      borderRadius: "4px",
      font: "14px/1.45 sans-serif",
      boxShadow: "0 2px 8px #0005",
    });
    document.body.append(notice);
    setTimeout(() => notice.remove(), 7000);
  }

  (async () => {
    try {
      const [{ spans }, leagueNames] = await Promise.all([waitForLeagueList(), getLeagueNames()]);
      const matched = applyLeagueSelection(spans, leagueNames);
      showNotice(`已選取 ${matched} 項 App 支援聯賽`);
    } catch (error) {
      showNotice(error.message || "自動選取失敗", true);
    }
  })();
})();
