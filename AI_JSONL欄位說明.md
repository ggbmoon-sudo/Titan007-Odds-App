# Titan007 JSONL 欄位說明

以下資料為 Titan007 盤口 JSONL，每一行代表「一場賽事 + 一個市場 + 一個時段 + 一間莊家」的盤口紀錄。

AI 分析時請先用 `matchId` 將同一場賽事的所有資料合併後再分析，不要把每一行當成不同賽事。

## 基本欄位

- `matchId`：Titan007 賽事 ID，用於識別同一場比賽。
- `league`：聯賽或盃賽名稱。
- `kickoffTime`：開賽時間。
- `state`：賽事狀態，例如未開賽、進行中、完場。
- `score`：即時比分或目前比分。
- `home` / `away`：主隊與客隊。
- `market`：盤口類型。
  - `asian` = 亞洲讓球盤
  - `over_under` = 入球大小盤
  - `europe` = 歐洲賠率
- `period`：盤口時段。
  - `full` = 全場
  - `half` = 半場
- `bookmaker` / `bookmakerKey`：莊家名稱及標準化莊家代碼。
- `company` / `companyId`：Titan007 原始莊家名稱及公司 ID。
- `isClosed`：該盤是否封盤。`1` = 封盤，`0` = 未封盤。
- `isMultiLine` / `multi`：是否多盤資料及多盤標籤。主盤通常 `isMultiLine = 0`。

## 亞盤欄位

- `initialHomeOdds`：初盤主隊水位。
- `initialHandicap`：初盤讓球盤口文字。
- `initialHandicapValue`：初盤讓球數值，正負方向以 Titan007 原始資料為準。
- `initialAwayOdds`：初盤客隊水位。
- `currentHomeOdds`：最新主隊水位。
- `currentHandicap`：最新讓球盤口文字。
- `currentHandicapValue`：最新讓球數值。
- `currentAwayOdds`：最新客隊水位。

## 大小盤欄位

- `initialOverOdds`：初盤大球水位。
- `initialTotal`：初盤入球數盤口文字。
- `initialTotalValue`：初盤入球數數值。
- `initialUnderOdds`：初盤小球水位。
- `currentOverOdds`：最新大球水位。
- `currentTotal`：最新入球數盤口文字。
- `currentTotalValue`：最新入球數數值。
- `currentUnderOdds`：最新小球水位。

## 歐洲賠率欄位

- `initialWin`：初始主勝賠率。
- `initialDraw`：初始和局賠率。
- `initialLoss`：初始客勝賠率。
- `currentWin`：最新主勝賠率。
- `currentDraw`：最新和局賠率。
- `currentLoss`：最新客勝賠率。
- `currentWinRate`：Titan007 計算的最新主勝隱含概率或分佈。
- `currentDrawRate`：Titan007 計算的最新和局隱含概率或分佈。
- `currentLossRate`：Titan007 計算的最新客勝隱含概率或分佈。
- `currentReturnRate`：最新返還率。
- `kellyWin`：主勝 Kelly 指數。
- `kellyDraw`：和局 Kelly 指數。
- `kellyLoss`：客勝 Kelly 指數。
- `changedAt`：歐賠最後變化時間。

## 指定莊家

只需要重點比較以下指定莊家：

- `pinna`：Pinna / Pinnacle / 平博
- `macau`：澳門彩票
- `betfair`：Betfair
- `bet365`：Bet365
- `william_hill`：威廉希爾
- `ladbrokes`：立博
- `interwetten`：Interwetten / Interwet
- `hk_jockey`：香港賽馬會

## AI 分析要求

請按 `matchId` 聚合資料。同一場比賽應同時比較：

- 亞盤全場
- 亞盤半場
- 大小全場
- 大小半場
- 歐洲賠率
- 不同莊家之間的分歧
- 不同市場之間的同步或衝突
- 低水 / 高水
- 升盤 / 降盤
- 歐亞盤是否一致

若某些欄位或某些莊家資料缺失，請明確標記為「未提供」，不要自行假設。

此 JSONL 只包含 Titan007 盤口資料，不包含 xG、傷停、天氣、首發、HKJC 指定賠率或概率事件。若分析需要這些資料，必須另行提供或標記為缺失。
