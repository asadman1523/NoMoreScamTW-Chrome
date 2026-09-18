# Chrome 權限用途

| 權限／範圍 | 程式用途 |
| --- | --- |
| `storage` | 儲存名單、設定、白名單與當日略過狀態；部分白名單使用 Chrome 同步 |
| `alarms` | 每日更新防詐資料庫 |
| `http://*/*`、`https://*/*` | 在一般網站執行警示腳本、讀取目前網址，以及連接資料與回報服務 |
| Gmail 的內容腳本 | 讀取 Gmail 畫面中的寄件者、標題、內文及連結，加入風險提示與回報操作 |

2.8.0 不要求 `tabs` 或 `notifications` 權限。一般網站的頁籤網址由對應的網站存取權限提供；`chrome.tabs` 的使用不代表一定需要 `tabs` 權限。

參考：[Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[網站比對範圍](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)。
