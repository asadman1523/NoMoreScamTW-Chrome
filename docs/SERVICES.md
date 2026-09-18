# 外部服務與開發設定

本庫保存官方 Chrome 外掛的客戶端原始碼，預設連接官方服務。回報審核、名單發布與伺服器維運不在本庫內。

| 功能 | 設定位置 | 傳送／下載內容 |
| --- | --- | --- |
| 政府資料 165027、176455 | `extension/background.js` | 下載資料集內容 |
| 遠端 Gist 名單 | `extension/background.js` 的 `CONFIG_URL` | 下載黑白名單與辨識規則 |
| RDAP 查詢 | `extension/background.js` | 傳送網域名稱 |
| 回報、統計 | `extension/firebase_config.js`、`extension/report_handler.js`、`extension/popup.js` | 官方 Realtime Database 的客戶端操作 |
| 疑似詐騙回報 | `extension/background.js` 的 `reportToAI` 分支 | 呼叫官方 `analyzeReport` 接口；目前交由維護者審核 |

Firebase 設定檔目前只包含資料庫網址。資料庫網址及專案 ID 是公開客戶端設定，不是管理員憑證；存取控制應由服務端權限處理。[Firebase 官方說明](https://firebase.google.com/support/guides/security-checklist#understand_api_keys)

## 開發與自行部署

- `npm test` 全程使用模擬資料，不連接正式服務。
- 自行安裝的開發版仍使用上述官方端點；不要向正式服務提交測試回報或負載測試。
- 若改用自有服務，需同時調整 RTDB、`analyzeReport` 與 Gist 設定；只改 `firebase_config.js` 不會切換所有端點。
- 目前尚未提供完整的自架後端套件。缺少服務時，下載、回報或統計功能可能無法運作。
- 不要把 Admin SDK 私鑰、OpenAI 金鑰、GitHub token 或 OAuth 憑證加入外掛。
