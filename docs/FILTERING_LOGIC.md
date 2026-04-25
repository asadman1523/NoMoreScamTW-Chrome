# 麥騙 (NoMoreScamTW) 過濾邏輯說明

本文件說明擴充功能如何決定是否封鎖特定網址，以及資料庫的運作方式。

## 1. 資料來源

擴充功能彙整以下來源的詐騙資料：

1.  **政府開放資料平臺 (Dataset 165027)**：
    *   主要來源，通常提供「網域名稱」 (Domain)。
    *   **封鎖方式**：若資料包含 `example.com`，則整個 `example.com` 及其子網域都會被視為詐騙。
    *   **安全機制**：為了避免誤殺大型平台 (如 GitHub, Bitbucket)，系統內建 `SAFE_ROOT_DOMAINS` 白名單。若政府資料誤將 `bitbucket.org` 列入，系統會自動忽略該筆資料，避免封鎖整個平台。

2.  **政府開放資料平臺 (Dataset 176455)**：
    *   提供完整的 CSV 資料，包含 URL。
    *   **封鎖方式**：解析 CSV 中的 URL，去除協定 (http/https) 後作為鍵值。

3.  **手動黑名單 (Gist)**：
    *   由社群維護的即時黑名單，位於 Gist JSON 設定檔中。
    *   **封鎖方式**：支援**完整路徑**或**網域**。

## 2. 網址比對邏輯 (checkUrl)

當使用者造訪網頁時，系統會依照以下順序進行比對：

### A. 前置處理
系統將網址標準化 (Normalization)：
*   去除 `http://` 或 `https://`
*   轉為小寫
*   去除結尾斜線 `/`

### B. 路徑前綴比對 (Prefix Matching)
系統會檢查該網址的**所有父路徑**是否在黑名單中。

**範例**：
假設黑名單中有：`bitbucket.org/bad-user/scam-repo`

當使用者造訪：
1.  `https://bitbucket.org/bad-user/scam-repo/src/main.js`
    *   系統檢查 `bitbucket.org/bad-user/scam-repo/src/main.js` -> ❌ (未命中)
    *   系統檢查 `bitbucket.org/bad-user/scam-repo/src` -> ❌ (未命中)
    *   系統檢查 `bitbucket.org/bad-user/scam-repo` -> ✅ **命中黑名單！顯示警告**
    
2.  `https://bitbucket.org/good-user/project`
    *   系統檢查各層路徑 -> ❌ (皆未命中) -> **允許通行**

### C. 網域層級比對
如果路徑比對未命中，系統會檢查純網域 (Hostname)：
1.  完整網域 (e.g., `sub.example.com`)
2.  去除/加上 `www.` 的網域
3.  父網域 (e.g., `example.com`)
4.  針對較具體的子網域樣式 wildcard (e.g., `*.example.kr`, `*.com.tw`)

**注意**：系統不會自動產生 `*.kr`、`*.tw`、`*.com` 這種涵蓋整個頂級網域的 wildcard，以避免把整個國碼或通用網域一律視為詐騙。

## 3. 安全防護機制 (Safe Root Domains)

為了防止大型公共平台因為單一惡意頁面而被全站封鎖，以下網域**不會**因為出現在政府資料庫的「網域」欄位而被封鎖 (除非該筆資料指定了更詳細的路徑)：

*   `bitbucket.org`
*   `github.com`
*   `facebook.com`
*   `instagram.com`
*   `twitter.com`
*   `google.com`
*   `youtube.com`
*   `line.me`

**注意**：這不影響手動黑名單針對該平台**特定路徑** (如 `bitbucket.org/evil-repo`) 的封鎖，只保護根網域不被誤殺。
