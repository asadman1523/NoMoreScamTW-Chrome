document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    // const updateBtn = document.getElementById('updateBtn');

    // Load initial status
    updateStatus();
    updateLicenseStatus(); // New: Check License

    /*
    document.getElementById('updateBtn').addEventListener('click', () => {
        // ... (Removed) ...
    });
    */

    // License Activation
    document.getElementById('activateBtn').addEventListener('click', () => {
        const input = document.getElementById('licenseInput');
        const msgDiv = document.getElementById('activationMsg');
        const key = input.value.trim();

        if (!key) {
            msgDiv.textContent = '請輸入序號';
            return;
        }

        msgDiv.textContent = '啟用中...';
        document.getElementById('activateBtn').disabled = true;

        chrome.runtime.sendMessage({ action: 'activateLicense', key: key }, (response) => {
            document.getElementById('activateBtn').disabled = false;

            if (response && response.success) {
                msgDiv.textContent = '';
                const days = response.days || 365;
                alert(`🎉 啟用成功！您現在擁有 ${days} 天無限次防護。`);
                updateLicenseStatus();
                input.value = '';
            } else {
                msgDiv.textContent = '❌ ' + (response ? response.error : '啟用失敗');
            }
        });

    });

    // Buy Button Listener
    const buyBtn = document.getElementById('buyBtn');
    if (buyBtn) {
        buyBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: 'https://nomorescamtw.web.app/' });
        });
    }

    function updateLicenseStatus() {
        chrome.runtime.sendMessage({ action: 'getLicenseStatus' }, (stats) => {
            if (!stats) return;

            const planLabel = document.getElementById('planLabel');
            const expiryLabel = document.getElementById('expiryLabel');
            const activationArea = document.getElementById('activationArea');

            // 1. Plan Status
            if (stats.isPremium) {
                planLabel.textContent = '👑 版本: 進階版 (Premium)';
                planLabel.style.color = '#2e7d32'; // Green

                if (stats.expiryDate) {
                    const expiry = new Date(stats.expiryDate).toLocaleDateString('zh-TW');
                    expiryLabel.textContent = `到期日: ${expiry}`;
                }

                // Hide Activation
                activationArea.style.display = 'none';

                // Unlimited Usage UI
                document.getElementById('webUsage').textContent = '無限';
                document.getElementById('webProgress').style.width = '100%';
                document.getElementById('webProgress').style.background = '#4caf50'; // Green

                document.getElementById('emailUsage').textContent = '無限';
                document.getElementById('emailProgress').style.width = '100%';
                document.getElementById('emailProgress').style.background = '#4caf50'; // Green

            } else {
                planLabel.textContent = '💎 版本: 免費版';
                planLabel.style.color = '#e65100'; // Orange
                expiryLabel.textContent = '';

                activationArea.style.display = 'block';

                // Web Usage
                const webPct = Math.min((stats.web.current / stats.web.limit) * 100, 100);
                document.getElementById('webUsage').textContent = `${stats.web.current} / ${stats.web.limit}`;
                document.getElementById('webProgress').style.width = `${webPct}%`;

                if (stats.web.current >= stats.web.limit) {
                    document.getElementById('webProgress').style.background = '#d32f2f'; // Red
                } else {
                    document.getElementById('webProgress').style.background = '#fb8c00'; // Orange
                }

                // Email Usage
                const emailPct = Math.min((stats.email.current / stats.email.limit) * 100, 100);
                document.getElementById('emailUsage').textContent = `${stats.email.current} / ${stats.email.limit}`;
                document.getElementById('emailProgress').style.width = `${emailPct}%`;

                if (stats.email.current >= stats.email.limit) {
                    document.getElementById('emailProgress').style.background = '#d32f2f'; // Red
                } else {
                    document.getElementById('emailProgress').style.background = '#fb8c00'; // Orange
                }
            }
        });
    }

    /*
    // Manual Query Handler (Removed)
    document.getElementById('manualQueryBtn').addEventListener('click', () => {
        const input = document.getElementById('manualQueryInput');
        const resultDiv = document.getElementById('manualQueryResult');
        const url = input.value.trim();

        if (!url) {
            resultDiv.innerHTML = '<span style="color: #d32f2f;">請輸入網址</span>';
            return;
        }

        // Firebase Logging (Manual Query)
        if (typeof FIREBASE_CONFIG !== 'undefined') {
            // Simple version reusing the logic if possible, or duplicate fetch here since popup.js is separate context
            // popup.js can access background page via chrome.extension.getBackgroundPage() but it's MV3...
            // In MV3, getBackgroundPage is not reliable for Service Workers.
            // We should send a message to background to log it, OR just do fetch here.
            // Fetch here is easier as we don't need to wake up SW if not needed.
            // But we need config. Let's assume config is loaded in popup.html or we fetch it.
            // Let's add <script src="firebase_config.js"></script> to popup.html first.
            // For now, let's implement the fetch inline assuming config global exists.
            if (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL && !FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT_ID')) {
                const statUrl = `${FIREBASE_CONFIG.databaseURL}/stats/total_queries.json`;
                fetch(statUrl).then(res => res.json()).then(count => {
                    fetch(statUrl, { method: 'PUT', body: JSON.stringify((count || 0) + 1) });
                }).catch(e => console.error('Log query failed', e));
            }
        }

        resultDiv.innerHTML = '<span style="color: #666;">查詢中...</span>';

        chrome.storage.local.get(['fraudDatabase'], (items) => {
            const db = items.fraudDatabase || {};
            // Basic URL cleaning to get hostname AND full path
            const cleanFullUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
            let hostname = cleanFullUrl.split('/')[0].split(':')[0];

            // Helper function to check variations
            const checkDB = (key) => {
                if (db[key]) return db[key];
                if (key.startsWith('www.') && db[key.slice(4)]) return db[key.slice(4)];
                if (!key.startsWith('www.') && db['www.' + key]) return db['www.' + key];
                return null;
            };

            // 1. Direct check (Full URL)
            let info = checkDB(cleanFullUrl);

            // 2. Hostname check (if different)
            if (!info && cleanFullUrl !== hostname) {
                info = checkDB(hostname);
            }

            // 3. Parent domain check (if not found)
            if (!info) {
                const parts = hostname.split('.');
                // ... same as before
                if (parts.length > 2) {
                    const parentDomain = parts.slice(1).join('.');
                    info = checkDB(parentDomain);
                }
            }

            // 3. Fallback Fetch 165 API (Online Check)
            if (!info) {
                // Fetch both 160055 and 165027
                Promise.all([
                    // 176455 CSV
                    fetch('https://data.gov.tw/api/v2/rest/dataset/176455')
                        .then(res => res.json())
                        .then(json => fetch(json.result.distribution[0].resourceDownloadUrl))
                        .then(res => res.text()),

                    // 165027 JSON
                    fetch('https://data.gov.tw/api/v2/rest/dataset/165027')
                        .then(res => res.json())
                        .then(json => {
                            // Find JSON resource
                            const dist = json.result.distribution.find(d => d.resourceFormat === 'JSON') || json.result.distribution[0];
                            return fetch(dist.resourceDownloadUrl);
                        })
                        .then(res => res.json())
                ])
                    .then(([csvText, jsonList]) => {
                        let found = false;
                        let source = '';
                        const lowerText = csvText.toLowerCase();

                        // --- Check CSV (176455) ---
                        // Check Full URL
                        if (lowerText.includes(',' + cleanFullUrl) || lowerText.includes('//' + cleanFullUrl)) {
                            found = true;
                            source = '165反詐騙';
                        } else {
                            // Check Hostname if different
                            if (!found && cleanFullUrl !== hostname) {
                                if (lowerText.includes(',' + hostname) || lowerText.includes('//' + hostname)) {
                                    found = true;
                                    source = '165反詐騙';
                                }
                            }

                            // Check Parent Domain
                            if (!found) {
                                const parts = hostname.split('.');
                                if (parts.length > 2) {
                                    const parentDomain = parts.slice(1).join('.');
                                    if (lowerText.includes(',' + parentDomain) || lowerText.includes('//' + parentDomain)) {
                                        found = true;
                                        source = '165反詐騙';
                                    }
                                }
                            }
                        }

                        // --- Check JSON (165027) ---
                        if (!found) {
                            const entry = jsonList.find(item => {
                                const domain = (item['網域名稱'] || '').toLowerCase();
                                const url2 = (item['偽冒網址'] || '').toLowerCase();

                                // Check Full URL Match
                                if (domain === cleanFullUrl || url2.includes(cleanFullUrl)) return true;

                                // Check Hostname Match
                                if (domain === hostname || url2.includes(hostname)) return true;

                                // Check Parent Domain
                                const parts = hostname.split('.');
                                if (parts.length > 2) {
                                    const parentDomain = parts.slice(1).join('.');
                                    if (domain === parentDomain || url2.includes(parentDomain)) return true;
                                }
                                return false;
                            });

                            if (entry) {
                                found = true;
                                source = 'TWNIC';
                            }
                        }

                        if (found) {
                            resultDiv.innerHTML = `
                            <div style="color: #c62828; font-weight: bold;">⚠️ 警告！疑似詐騙網站</div>
                            <div style="font-size:11px; color:#555;">(來源: ${source})</div>
                        `;
                        } else {
                            resultDiv.innerHTML = `
                            <div style="color: #2e7d32; font-weight: bold; margin-bottom: 8px;">資料庫無紀錄</div>
                            <button id="btnAiReport" style="background:#d93025; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">回報為詐騙 (AI 分析)</button>
                            <div id="aiReportStatus" style="font-size:11px; color:#666; margin-top:5px;"></div>
                        `;
                            // Bind click event for the new button
                            setTimeout(() => {
                                const btn = document.getElementById('btnAiReport');
                                if (btn) {
                                    btn.addEventListener('click', () => {
                                        const status = document.getElementById('aiReportStatus');
                                        status.innerHTML = '🤖 AI 正在分析中...<br>(請稍候約 3-5 秒)';
                                        btn.disabled = true;
                                        btn.style.opacity = '0.7';

                                        chrome.runtime.sendMessage({
                                            action: 'analyzeAndReport',
                                            content: cleanFullUrl
                                        }, (response) => {
                                            if (response && response.success) {
                                                const result = response.result;
                                                if (result.isScam) {
                                                    status.innerHTML = `
                                                    <span style="color:#d93025; font-weight:bold;">✅ 已確認為詐騙！</span><br>
                                                    信心指數: ${result.confidence}%<br>
                                                    類型: ${result.type}<br>
                                                    <span style="color:#555;">已自動加入雲端資料庫。</span>
                                                `;
                                                } else {
                                                    status.innerHTML = `
                                                    <span style="color:#2e7d32; font-weight:bold;">ℹ️ AI 判定安全</span><br>
                                                    信心指數: ${result.confidence}%<br>
                                                    理由: ${result.reason || '未發現異常'}
                                                `;
                                                }
                                            } else {
                                                status.innerText = '❌ 分析失敗: ' + (response ? response.error : '未知錯誤');
                                                btn.disabled = false;
                                                btn.style.opacity = '1';
                                            }
                                        });
                                    });
                                }
                            }, 100);
                        }
                    })
                    .catch(err => {
                        console.error(err);
                        resultDiv.innerHTML = '<span style="color: #d32f2f;">連線失敗</span>';
                    });
            } else {
                resultDiv.innerHTML = `
                    <div style="color: #c62828; font-weight: bold;">
                        ⚠️ 警告！資料庫中有紀錄
                    </div>
                `;
            }
        });
    });
    */

    // Set text dynamically to prevent flash
    document.getElementById('appName').textContent = chrome.i18n.getMessage('appName');

    // Set Version
    const manifest = chrome.runtime.getManifest();
    document.getElementById('version').textContent = `v${manifest.version}`;

    async function updateStatus() {
        const { lastUpdated, nextUpdateTime, termsAccepted, totalEntries } = await chrome.storage.local.get(['lastUpdated', 'nextUpdateTime', 'termsAccepted', 'totalEntries']);

        // Set Default Button Text if nothing else happens
        // updateBtn.textContent = chrome.i18n.getMessage('btnUpdate') || 'Update Database';

        if (!termsAccepted) {
            statusDiv.innerHTML = `
                <div style="color: #d93025; margin-bottom: 10px;">${chrome.i18n.getMessage('termsNotAccepted') || '⚠️ Disclaimer not accepted'}</div>
                <button id="openTermsBtn" style="background:#4285f4; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">${chrome.i18n.getMessage('btnOpenTerms') || 'Open Terms'}</button>
            `;
            document.getElementById('openTermsBtn').addEventListener('click', () => {
                chrome.tabs.create({ url: 'welcome.html' });
            });
            // updateBtn.disabled = true;
            return;
        }

        if (lastUpdated) {
            const lastDate = new Date(lastUpdated).toLocaleString('zh-TW'); // Use locale string
            const nextDate = nextUpdateTime ? new Date(nextUpdateTime).toLocaleString('zh-TW') : '...';
            const count = totalEntries || 0;

            /*
            // Check cooldown (5 minutes = 300000 ms)
            const now = Date.now();
            const timeDiff = now - lastUpdated;
            const cooldown = 5 * 60 * 1000;

            if (timeDiff < cooldown) {
                const remainingMinutes = Math.ceil((cooldown - timeDiff) / 60000);
                updateBtn.disabled = true;
                updateBtn.textContent = `${chrome.i18n.getMessage('cooldownLabel') || 'Cooldown'} (${remainingMinutes})`;
            } else {
                updateBtn.disabled = false;
                updateBtn.textContent = chrome.i18n.getMessage('btnUpdate') || 'Update Database';
            }
            */

            statusDiv.innerHTML = `
        <strong>${chrome.i18n.getMessage('databaseStatus') || 'Status: Online'}</strong><br>
        <span style="font-size:12px">
        ${chrome.i18n.getMessage('lastUpdatedLabel') || 'Last Updated:'} ${lastDate}<br>
        ${chrome.i18n.getMessage('nextUpdateLabel') || 'Next Update:'} ${nextDate}<br>
        ${chrome.i18n.getMessage('totalRecordsLabel') || 'Total Records:'} ${count}
        </span>
      `;
        } else {
            const { lastError } = await chrome.storage.local.get('lastError');
            if (lastError) {
                statusDiv.innerHTML = `
                    <div style="color: #d93025; margin-bottom: 5px;">${chrome.i18n.getMessage('dbInitializing') || 'Initialization Failed'}</div>
                    <div style="font-size: 11px; color: #999;">Error: ${lastError}</div>
                    <button id="retryBtn" style="margin-top:5px; padding:4px 8px; font-size:11px;">Retry</button>
                `;
                document.getElementById('retryBtn').addEventListener('click', () => {
                    statusDiv.textContent = 'Retrying...';
                    chrome.runtime.sendMessage({ action: 'forceUpdate' }, () => updateStatus());
                });
            } else {
                statusDiv.innerHTML = `
                    <div id="initMsg">${chrome.i18n.getMessage('dbInitializing') || '正在下載反詐騙資料庫...'}</div>
                    <div style="font-size: 10px; color: #888; margin-top: 4px;">(首次下載需時約 10-20 秒，請稍候)</div>
                `;

                // Trigger update silently if needed
                chrome.runtime.sendMessage({ action: 'forceUpdate' });
            }
        }
    }
    /* Footer Removed
    // Footer Links Handlers
    */
});
