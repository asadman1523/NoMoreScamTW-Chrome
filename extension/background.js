// IndexedDB Helper
const DB_NAME = 'FraudDB';
const STORE_NAME = 'sites';
const DB_VERSION = 1;

// Import Firebase Config
try {
    importScripts('firebase_config.js');
} catch (e) {
    console.error('Failed to load firebase_config.js');
}

// Firebase Increment Helper (REST API)
async function incrementStat(statName) {
    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT_ID')) {
        console.log('Firebase not configured, skipping stat:', statName);
        return;
    }

    const url = `${FIREBASE_CONFIG.databaseURL}/stats/${statName}.json`;

    try {
        // We use a transaction-like approach or just simple GET+PUT if we want to be exact, 
        // but for a simple counter, we can just signal an increment if the API supports it,
        // or effectively we have to do a "Server Value Increment" which REST API supports via special syntax 
        // OR simpler: just POST a new event and aggregate later, BUT user wanted "Realtime Counter".
        // The REST API "increment" is tricky without auth.
        // Actually, for a public uncontrolled counter, using a simple "transaction" via REST is hard.
        // EASIEST WAY IS: GET current -> PUT current + 1. 
        // (Concurrency issues exist but acceptable for this scale/use case).

        // Let's try to do it safely.
        // 1. GET
        const response = await fetch(url);
        let count = 0;
        if (response.ok) {
            const data = await response.json();
            count = data || 0;
        }

        // 2. PUT (count + 1)
        await fetch(url, {
            method: 'PUT',
            body: JSON.stringify(count + 1)
        });

    } catch (e) {
        console.error('Failed to increment stat:', statName, e);
    }
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToIndexedDB(data) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear old data first
    await new Promise((resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => reject(clearReq.error);
    });

    // Bulk add
    for (const [url, info] of Object.entries(data)) {
        store.put(info, url);
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getFromIndexedDB(url) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(url);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

const CONFIG_URL = 'https://cdn.jsdelivr.net/gh/asadman1523/NoMoreScamTW@main/server_config.json';



async function fetchDataset165027(config) {
    const data = {};
    let rawCount = 0;
    try {
        let govApiUrl = 'https://data.gov.tw/api/v2/rest/dataset/165027';

        if (config && config.datasets && Array.isArray(config.datasets)) {
            const ds = config.datasets.find(d => d.id === '165027');
            if (ds && ds.url) {
                govApiUrl = ds.url;
            }
        }

        console.log(`Fetching metadata from Gov API 165027: ${govApiUrl}`);

        const govResponse = await fetch(govApiUrl);
        if (!govResponse.ok) throw new Error('Gov API fetch failed');

        const govJson = await govResponse.json();
        // Find JSON distribution
        let downloadUrl = null;
        const distributions = govJson?.result?.distribution || [];
        for (const dist of distributions) {
            if (dist.resourceFormat === 'JSON') {
                downloadUrl = dist.resourceDownloadUrl;
                break;
            }
        }
        // Fallback to first if no JSON specific found (though we expect JSON)
        if (!downloadUrl) downloadUrl = distributions[0]?.resourceDownloadUrl;

        if (!downloadUrl) throw new Error('Could not find download URL for 165027');

        console.log(`Downloading JSON 165027 from: ${downloadUrl}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error('JSON download failed');

        const jsonList = await response.json();

        for (const item of jsonList) {
            const domain = item['網域名稱'];
            if (domain) {
                rawCount++;
                data[domain] = {
                    name: 'TWNIC Suspicious Domain', // Default name/description
                    url: item['偽冒網址'] || domain,
                    count: '0',
                    startDate: item['詐騙網站創建日期'] || '',
                    endDate: ''
                };
            }
        }

    } catch (e) {
        console.error('Error fetching dataset 165027:', e);
    }
    return { data, count: rawCount };
}

async function fetchDataset176455(config) {
    const data = {};
    let rawCount = 0;
    try {
        console.log('Fetching remote config for 176455...');
        let govApiUrl = 'https://data.gov.tw/api/v2/rest/dataset/176455';

        if (config) {
            if (config.datasets && Array.isArray(config.datasets)) {
                const ds = config.datasets.find(d => d.id === '176455');
                if (ds && ds.url) {
                    govApiUrl = ds.url;
                }
            }
        }

        console.log(`Fetching metadata from Gov API 176455: ${govApiUrl}`);
        const govResponse = await fetch(govApiUrl);
        if (!govResponse.ok) throw new Error('Gov API 176455 fetch failed');

        const govJson = await govResponse.json();
        const downloadUrl = govJson?.result?.distribution?.[0]?.resourceDownloadUrl;

        if (!downloadUrl) throw new Error('Could not find download URL in Gov API JSON 176455');

        console.log(`Downloading CSV 176455 from: ${downloadUrl}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error('CSV 176455 download failed');

        const text = await response.text();
        const lines = text.split(/\r?\n/);

        // CSV Header: WEBSITE_NM,WEBURL,CNT,STA_SDATE,STA_EDATE
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

            if (parts.length >= 2) {
                const cleanParts = parts.map(p => p.trim().replace(/^"|"$/g, ''));
                const name = cleanParts[0];
                let rawUrl = cleanParts[1];
                const count = cleanParts[2] || '0';
                const startDate = cleanParts[3] || '';
                const endDate = cleanParts[4] || '';

                if (!rawUrl) continue;

                let url = rawUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

                if (url) {
                    rawCount++;
                    data[url] = {
                        name: name,
                        url: rawUrl,
                        count: count,
                        startDate: startDate,
                        endDate: endDate
                    };
                }
            }
        }
    } catch (e) {
        console.error('Error fetching dataset 176455:', e);
    }
    return { data, count: rawCount };
}

// 擷取並更新詐騙資料庫
async function updateDatabase() {
    try {
        console.log('Starting full database update...');

        // 1. Fetch Config Once
        let config = null;
        try {
            const configResponse = await fetch(CONFIG_URL);
            if (configResponse.ok) {
                config = await configResponse.json();
            }
        } catch (configError) {
            console.warn('Failed to fetch config, using defaults', configError);
        }

        // Parallel fetch
        const [result2, result3] = await Promise.all([
            fetchDataset165027(config),
            fetchDataset176455(config)
        ]);

        const data2 = result2.data;
        const data3 = result3.data;
        const totalRawCount = result2.count + result3.count;

        const mergedData = { ...data2, ...data3 };
        const uniqueEntries = Object.keys(mergedData).length;

        if (uniqueEntries === 0) {
            throw new Error('No data fetched from any source');
        }

        // Save metadata to storage.local
        await chrome.storage.local.set({
            lastUpdated: Date.now(),
            totalEntries: totalRawCount, // Use raw count as requested
            lastError: null // Clear error
        });

        // Save big data to IndexedDB
        await saveToIndexedDB(mergedData);

        cachedDatabase = mergedData; // Update cache

        // 確保下次更新已排程並顯示
        scheduleDailyUpdate();
        console.log(`Database updated. Loaded ${totalRawCount} raw records (${uniqueEntries} unique sites).`);
        return { success: true, count: totalRawCount };

    } catch (error) {
        console.error('Failed to update database:', error);
        // Log error to storage for debugging in popup
        chrome.storage.local.set({
            lastError: error.message || 'Unknown error',
            lastErrorTs: Date.now()
        });
        return { success: false, error: error.message || 'Unknown error' };
    }
}

// 檢查 URL 是否在資料庫中
async function checkUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        // Clean URL: remove protocol and trailing slash, keep path
        // e.g. https://example.com/foo -> example.com/foo
        const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

        // Use cache if available
        if (cachedDatabase && Object.keys(cachedDatabase).length > 0) {
            const checkCache = (key) => cachedDatabase[key] || null;

            // 1. Check Full URL (Clean)
            let res = checkCache(cleanUrl);
            if (res) return res;

            // 2. Check Hostname
            if (cleanUrl !== hostname) {
                res = checkCache(hostname);
                if (res) return res;
            }

            // 3. WWW variations for Hostname
            if (hostname.startsWith('www.')) {
                res = checkCache(hostname.slice(4));
            } else {
                res = checkCache('www.' + hostname);
            }
            if (res) return res;
        }

        // Fallback or Initial check from IndexedDB
        const checkDB = async (key) => {
            try {
                return await getFromIndexedDB(key);
            } catch (e) { return null; }
        };

        // 1. Check Full URL
        let result = await checkDB(cleanUrl);
        if (result) return result;

        // 2. Check Hostname
        if (cleanUrl !== hostname) {
            result = await checkDB(hostname);
            if (result) return result;
        }

        // 3. Check w/o 'www.' if present
        if (hostname.startsWith('www.')) {
            result = await checkDB(hostname.slice(4));
            if (result) return result;
        }

        // 4. Check w/ 'www.' if missing
        if (!hostname.startsWith('www.')) {
            result = await checkDB('www.' + hostname);
            if (result) return result;
        }

        // 5. Check Parent Domain (Simple level)
        // e.g. sub.example.com -> example.com (if distinct from hostname check)
        const parts = hostname.split('.');
        if (parts.length > 2) {
            const parentDomain = parts.slice(1).join('.');
            // Avoid re-checking if we just stripped www
            if (parentDomain !== hostname && parentDomain !== hostname.slice(4)) {
                result = await checkDB(parentDomain);
                if (result) return result;
            }
        }

        return null;
    } catch (e) {
        console.error('Check URL Failed', e);
        return null;
    }
}

// 根據上次更新時間排程每日更新
function scheduleDailyUpdate(lastUpdatedTime) {
    const baseTime = lastUpdatedTime || Date.now();
    const nextRun = baseTime + 24 * 60 * 60 * 1000;

    chrome.alarms.create('dailyUpdate', {
        when: nextRun,
        periodInMinutes: 1440 // 24 小時
    });
    chrome.storage.local.set({ nextUpdateTime: nextRun });
}

// 事件監聽器
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        incrementStat('total_installs');
    }

    updateDatabase();

    // Check acceptance
    const { termsAccepted } = await chrome.storage.local.get('termsAccepted');
    if (!termsAccepted) {
        chrome.tabs.create({ url: 'welcome.html' });
    }
});

chrome.runtime.onStartup.addListener(async () => {
    // Populate cache on startup
    const { fraudDatabase, lastUpdated, termsAccepted } = await chrome.storage.local.get(['fraudDatabase', 'lastUpdated', 'termsAccepted']);

    if (!termsAccepted) {
        // Optional: Open welcome page every startup if not accepted?
        // Let's just rely on onInstalled or user clicking extension icon.
        // Actually, for better visibility:
        chrome.tabs.create({ url: 'welcome.html' });
    }

    if (fraudDatabase) {
        cachedDatabase = fraudDatabase;
    }

    const now = Date.now();
    // 如果從未更新或距離上次更新超過 24 小時
    if (!lastUpdated || (now - lastUpdated) >= 24 * 60 * 60 * 1000) {
        console.log('Startup: Database outdated, updating...');
        await updateDatabase();
    } else {
        console.log('Startup: Database is fresh. Ensuring schedule is set.');
        scheduleDailyUpdate(lastUpdated);
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailyUpdate') {
        console.log('Running daily update...');
        updateDatabase();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Enforce Terms: Check if user agreed
        // Since this hotpath runs often, we should cache termsAccepted too, but storage.get is fast enough for now locally.
        const { termsAccepted } = await chrome.storage.local.get('termsAccepted');

        if (!termsAccepted) {
            return; // Do not protect if not agreed
        }

        const fraudInfo = await checkUrl(tab.url);
        if (fraudInfo) {
            console.log(`Fraud detected: ${tab.url}`, fraudInfo);

            // Log Warning
            incrementStat('total_warnings');

            chrome.tabs.sendMessage(tabId, {
                action: 'showWarning',
                fraudInfo: fraudInfo
            }).catch(() => {
                // Content script 可能尚未準備好或未注入某些頁面 (例如 chrome://)
            });
        }
    }
});

// popup 的訊息監聽器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateDatabase' || request.action === 'forceUpdate') {
        updateDatabase()
            .then((result) => {
                sendResponse(result);
            })
            .catch((err) => {
                console.error('updateDatabase threw error:', err);
                sendResponse({ success: false, error: err.message });
            });

        return true; // 保持通道開啟
    }
});
