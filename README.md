# NoMoreScamTW Chrome

NoMoreScamTW 的 Chrome 瀏覽器外掛原始碼。網頁與 Gmail 的偵測、警示、白名單及回報功能位於 `extension/`。

## 安裝

- [Chrome 線上應用程式商店](https://chromewebstore.google.com/detail/emhndljhamhamjilimolbbinpipbkjlh)
- 從原始碼安裝：下載本庫，在 `chrome://extensions` 開啟開發人員模式，選擇「載入未封裝項目」，指定 `extension/` 資料夾。

本庫目前原始碼版本為 2.8.0；商店上架進度由維護者管理。

## 使用

點擊外掛圖示可查看資料庫狀態、管理白名單及回報目前網站或 Gmail 郵件。警示提供離開網站、當日略過、回報誤判與永久加入白名單等操作。Gmail 白名單可指定寄件者或寄件網域。

## 專案內容

| 位置 | 內容 |
| --- | --- |
| `extension/` | 外掛執行檔、圖示與語系 |
| `tests/` | 使用模擬資料的測試 |
| `tools/` | 測試與打包工具 |
| `docs/` | 過濾邏輯、權限與外部服務說明 |

## 開發與打包

需要 Node.js 22 及 Python 3。沒有需要安裝的 npm 套件。

```sh
npm test
python3 -X utf8 tools/package.py
```

Windows 的打包指令：

```powershell
py -3 -X utf8 tools/package.py
```

ZIP 產物位於 `dist/`，只包含明確列出的外掛執行檔。

## 每月封存包

[Releases](https://github.com/asadman1523/NoMoreScamTW-Chrome/releases) 保存每月的 Chrome 外掛 ZIP。自 2026 年 1 月起的舊包取自該月底前最後一筆 Chrome 提交；若當月沒有新提交，沿用上一版。另保留 2026 年 9 月初的 2.7.15 舊版。往後每月 1 日台灣時間 11:17 由 GitHub 自動測試、打包並建立 Release，也可手動執行。月份是打包標籤，外掛版本仍以 `manifest.json` 為準。舊包可能包含已停用的付費功能，僅供歷史查閱；Chrome 商店上架由維護者另行處理。

## 文件

- [過濾邏輯](docs/FILTERING_LOGIC.md)
- [權限用途](docs/PERMISSIONS.md)
- [外部服務與開發設定](docs/SERVICES.md)
- [每月封存紀錄](docs/RELEASES.md)
- [資料處理說明](PRIVACY.md)
- [貢獻方式](CONTRIBUTING.md)
- [安全問題回報](SECURITY.md)

## 授權

程式碼採用 [MIT](LICENSE) 授權。政府開放資料及遠端名單仍適用各自的資料來源條件。
