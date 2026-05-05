# Titan007 Odds Extractor

本專案是一個本機 Node.js App，用於載入 Titan007 賽事、提取指定莊家的亞盤、大小盤、歐洲賠率，並支援 HKJC 掃描與 AI 分析輸出。

## Requirements

- Node.js 20 或以上

## Run

```powershell
npm start
```

然後在瀏覽器打開：

```text
http://127.0.0.1:3000/
```

## Useful Files

- `server.js`：本機 API server
- `public/`：前端 UI
- `src/titan.js`：Titan007 賽事與盤口提取
- `src/hkjc.js`：HKJC 掃描
- `src/ai.js`：AI API 連線與 prompt 組裝
- `tests/parser.test.js`：解析與掃描測試
- `AI_JSONL欄位說明.md`：給 AI 的 JSONL 欄位說明

## Notes

- API key 只應保存在本機瀏覽器或本機設定，不應提交到 GitHub。
- `.local-cache/`、log、匯出的 `.jsonl` / `.csv` 已在 `.gitignore` 排除。
- 預設提取模式為快速穩定；需要補齊莊家時可在 UI 勾選深度補齊模式。

## Test

```powershell
npm test
```
