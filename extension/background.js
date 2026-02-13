// IndexedDB Helper
const DB_NAME = 'FraudDB';
const STORE_NAME = 'sites';
const DB_VERSION = 1;

// Import Firebase Config
try {
    importScripts('firebase_config.js');
    importScripts('report_handler.js');
    importScripts('trusted_domains.js'); // Import Trusted Domains
    importScripts('license_manager.js'); // Import License Manager
} catch (e) {
    console.error('Failed to load scripts', e);
}

// Global Cache
let cachedDatabase = {};
let cachedRemoteWhitelist = [];

// ... (Existing Firebase Helper) ...

// Initialize License Manager on Startup
chrome.runtime.onStartup.addListener(async () => {
    if (typeof LicenseManager !== 'undefined') {
        await LicenseManager.init();
    }
    // ... existing logic ...
});

// Also on Installed
chrome.runtime.onInstalled.addListener(async (details) => {
    if (typeof LicenseManager !== 'undefined') {
        await LicenseManager.init();
    }
});

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
    console.log('[DEBUG] Saving to IndexedDB...');
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
    // Note: For very large datasets (e.g. 100k+), individual put can be slow.
    // But for <10k it's fine.
    let count = 0;
    for (const [url, info] of Object.entries(data)) {
        store.put(info, url);
        count++;
    }
    console.log(`[DEBUG] IndexedDB: Put ${count} records.`);

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
            console.log('[DEBUG] IndexedDB Transaction Complete.');
            resolve();
        };
        tx.onerror = () => {
            console.error('[ERROR] IndexedDB Transaction Failed:', tx.error);
            reject(tx.error);
        };
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

const CONFIG_URL = 'https://gist.githubusercontent.com/asadman1523/bec9509e0032170e0d0786a4a4fe3952/raw/gistfile1.txt';



// Helper to yield to event loop
const yieldToLoop = () => new Promise(resolve => setTimeout(resolve, 0));

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

        console.log(`[DEBUG] Downloading JSON 165027 from: ${downloadUrl}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error('JSON download failed: ' + response.statusText);

        console.log('[DEBUG] 165027 Downloaded. Parsing JSON...');
        const jsonList = await response.json();
        console.log(`[DEBUG] 165027 Parsed. Items: ${jsonList.length}`);

        // Chunked Processing
        for (let i = 0; i < jsonList.length; i++) {
            const item = jsonList[i];
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
            // Yield every 500 items to keep SW responsive
            if (i % 500 === 0) await yieldToLoop();
        }
        console.log(`[DEBUG] 165027 Processed. Valid Count: ${rawCount}`);

    } catch (e) {
        console.error('[ERROR] Error fetching dataset 165027:', e);
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

        console.log(`[DEBUG] Downloading CSV 176455 from: ${downloadUrl}`);
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error('CSV 176455 download failed: ' + response.statusText);

        console.log('[DEBUG] 176455 Downloaded. Parsing Text...');
        const text = await response.text();
        const lines = text.split(/\r?\n/);
        console.log(`[DEBUG] 176455 Parsed. Lines: ${lines.length}`);

        // CSV Header: WEBSITE_NM,WEBURL,CNT,STA_SDATE,STA_EDATE
        // Chunked Processing
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
            // Yield every 500 items logic
            if (i % 500 === 0) await yieldToLoop();
        }
        console.log(`[DEBUG] 176455 Processed. Valid Count: ${rawCount}`);
    } catch (e) {
        console.error('[ERROR] Error fetching dataset 176455:', e);
    }
    return { data, count: rawCount };
}

// Global Update Lock (Timestamp)
let lastUpdateStart = 0;

// 擷取並更新詐騙資料庫
async function updateDatabase(force = false) {
    const now = Date.now();
    // Check lock (Expire after 60 seconds)
    if (!force && lastUpdateStart > 0 && (now - lastUpdateStart < 60000)) {
        console.log('Update in progress (locked), skipping...');
        return { success: false, error: 'Update in progress' };
    }

    lastUpdateStart = now;

    // Timeout Helper
    const fetchWithTimeout = (url, options = {}, timeout = 30000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(id));
    };

    try {
        console.log('Starting full database update...');

        let gistBlacklist = [];
        // 1. Fetch Config Once
        let config = null;
        try {
            // Add cache-busting timestamp
            const configUrlWithTs = `${CONFIG_URL}?t=${Date.now()}`;
            const configResponse = await fetchWithTimeout(configUrlWithTs, {}, 5000); // 5s timeout for config
            if (configResponse.ok) {
                config = await configResponse.json();

                // Save Whitelist & Brand Rules if present
                const updates = {};
                if (config && config.whitelist && Array.isArray(config.whitelist)) {
                    console.log('Updating Whitelist from Remote:', config.whitelist);
                    updates.remoteWhitelist = config.whitelist;
                    cachedRemoteWhitelist = config.whitelist; // Update memory cache
                }
                if (config && config.brand_rules && Array.isArray(config.brand_rules)) {
                    console.log('Updating Brand Rules from Remote:', config.brand_rules);
                    updates.brandRules = config.brand_rules;
                }
                if (config && config.email_whitelist && Array.isArray(config.email_whitelist)) {
                    console.log('Updating Email Whitelist from Remote:', config.email_whitelist);
                    updates.remoteEmailWhitelist = config.email_whitelist;
                }
                if (config && config.email_blacklist && Array.isArray(config.email_blacklist)) {
                    console.log('Updating Email Blacklist from Remote:', config.email_blacklist);
                    updates.remoteEmailBlacklist = config.email_blacklist;
                }

                if (Object.keys(updates).length > 0) {
                    await chrome.storage.local.set(updates);
                }

                // Process Blacklist (Add to data flow)
                if (config && config.blacklist && Array.isArray(config.blacklist)) {
                    console.log('Found Blacklist in Gist:', config.blacklist);
                    gistBlacklist = config.blacklist;
                }
            }
        } catch (configError) {
            console.warn('Failed to fetch config, using defaults', configError);
        }

        // Parallel fetch with timeout wrapper
        // Note: We need to modify helper functions or simply wrap them?
        // Since helper functions use `fetch` internally, we need to pass the timeout logic or modify them.
        // For simplicity, let's just let them run but we race against a global timeout here?
        // No, Promises don't cancel nicely without AbortController passing down.
        // Since I can't easily modify the helpers without rewriting them fully,
        // I will wrap the Promise.all in a generic timeout race. 
        // This won't stop the background fetch but will release the UI/Logic flow.

        const updatePromise = Promise.all([
            fetchDataset165027(config),
            fetchDataset176455(config)
        ]);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Update timed out (30s)')), 30000)
        );

        const [result2, result3] = await Promise.race([updatePromise, timeoutPromise]);

        const data2 = result2.data;
        const data3 = result3.data;

        // Convert Gist Blacklist to Database Format
        const blacklistData = {};
        gistBlacklist.forEach(item => {
            if (item.url) {
                let messages = [];
                if (item.reasons && Array.isArray(item.reasons)) {
                    messages = item.reasons;
                } else if (item.reason) {
                    messages = [item.reason];
                } else {
                    messages = ['疑似詐騙'];
                }

                blacklistData[item.url] = {
                    name: 'Manual Blacklist',
                    url: item.url,
                    count: '⚠️',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: '',
                    customMessages: messages,
                    customMessage: messages[0] // Backward compatibility
                };
            }
        });

        const totalRawCount = result2.count + result3.count + gistBlacklist.length;

        const mergedData = { ...data2, ...data3, ...blacklistData };
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
        await scheduleDailyUpdate();
        console.log(`Database updated. Loaded ${totalRawCount} raw records (${uniqueEntries} unique sites).`);

        lastUpdateStart = 0; // Unlock
        return { success: true, count: totalRawCount };

    } catch (error) {
        console.error('Failed to update database:', error);
        // Log error to storage for debugging in popup
        chrome.storage.local.set({
            lastError: error.message || 'Unknown error',
            lastErrorTs: Date.now()
        });
        lastUpdateStart = 0; // Unlock
        return { success: false, error: error.message || 'Unknown error' };
    }
}

// 檢查 URL 是否在資料庫中
async function checkUrl(url) {
    try {
        let hostname = '';
        let cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

        try {
            const urlObj = new URL(url);
            hostname = urlObj.hostname.toLowerCase();
            // If mailto, use the email address as "hostname" or key
            if (urlObj.protocol === 'mailto:') {
                hostname = urlObj.pathname; // email address
                cleanUrl = hostname;
            }
        } catch (e) {
            // Not a valid URL, treat entire string as key (e.g. user entered email or partial domain)
            hostname = cleanUrl.split('/')[0];
        }

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

// RDAP Cache
const rdapCache = {};

// 檢查網域註冊時間 (RDAP)
async function checkDomainAge(url) {
    try {
        let hostname = '';
        try {
            const urlObj = new URL(url);
            hostname = urlObj.hostname.toLowerCase();
        } catch (e) {
            return null;
        }

        // Skip known major domains or if local whitelist
        // Note: For comprehensive check, we rely on the caller to filter whitelist first.
        // But double check here for safety.
        if (hostname.endsWith('google.com') || hostname.endsWith('facebook.com') || hostname.endsWith('youtube.com')) {
            return null;
        }

        // Check Remote Whitelist (Gist)
        if (cachedRemoteWhitelist.includes(hostname) || cachedRemoteWhitelist.includes('www.' + hostname)) {
            return null;
        }

        // Check Static Trusted Domains (trusted_domains.js)
        if (typeof isTrustedDomain === 'function') {
            // Note: isTrustedDomain typically checks title too, but here we only have hostname.
            // We can check if it matches any trusted domain pattern regardless of title.
            // However, isTrustedDomain(title, hostname) implementation needs to be checked.
            // Looking at trusted_domains.js, it checks:
            // if (keywords matches title) AND (hostname matches domain) -> return true
            // We want: if (hostname matches domain) -> return true (skip RDAP)
            // Let's create a helper or modify isTrustedDomain?
            // Actually, for RDAP exemption, we just want to know if the HOSTNAME is in the likely trusted list.
            // Let's look at TRUSTED_DOMAINS structure.
            // It is an array of objects { keywords, domains }.
            // We can iterate TRUSTED_DOMAINS directly if available.

            if (typeof TRUSTED_DOMAINS !== 'undefined') {
                for (const group of TRUSTED_DOMAINS) {
                    for (const domain of group.domains) {
                        if (hostname === domain || hostname.endsWith('.' + domain)) {
                            return null; // Exempt from RDAP
                        }
                    }
                }
            }
        }

        // Check Cache
        const now = Date.now();
        if (rdapCache[hostname]) {
            const cached = rdapCache[hostname];
            // Cache valid for 24 hours (or maybe longer for old domains?)
            // Let's say if result was 'safe' (old domain), cache for 7 days.
            // If result was 'new' (risky), cache for 1 hour to re-check later?
            // Actually, creation date doesn't change. So we can cache indefinitely or long term.
            // Only 'error' needs short cache.
            if (cached.error && (now - cached.timestamp < 3600000)) { // 1 hour for errors
                return null; // Skip on error
            }
            if (!cached.error && (now - cached.timestamp < 7 * 24 * 60 * 60 * 1000)) { // 7 days for valid
                return cached.result;
            }
        }

        // Query RDAP
        // 1. Determine RDAP Endpoint based on TLD
        let rdapUrl = `https://rdap.org/domain/${hostname}`;

        if (hostname.endsWith('.tw') || hostname.endsWith('.xn--kpry57d')) { // .tw or .台灣
            rdapUrl = `https://ccrdap.twnic.tw/tw/domain/${hostname}`;
        } else if (hostname.endsWith('.com') || hostname.endsWith('.net')) {
            rdapUrl = `https://rdap.verisign.com/com/v1/domain/${hostname}`;
        }

        console.log(`[RDAP] Checking: ${hostname} via ${rdapUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(rdapUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[RDAP] Fetch failed for ${hostname}: ${response.status} ${response.statusText}`);
            // Cache error to avoid spamming
            rdapCache[hostname] = { timestamp: now, error: true };
            return null;
        }

        const data = await response.json();
        let creationDate = null;

        // Parse events
        if (data.events && Array.isArray(data.events)) {
            const registrationEvent = data.events.find(e => e.eventAction === 'registration' || e.eventAction === 'creation');
            if (registrationEvent) {
                creationDate = new Date(registrationEvent.eventDate);
            }
        }

        console.log(`[RDAP] Creation Date for ${hostname}:`, creationDate);

        // Fallback: strictly for 'domain' object, sometimes 'events' are at top level

        if (!creationDate) {
            rdapCache[hostname] = { timestamp: now, error: true }; // Can't parse, treat as error
            return null;
        }

        // Calculate Age
        const ageInMs = now - creationDate.getTime();
        const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

        let result = null;
        if (ageInDays < 30) {
            result = {
                type: 'newly_registered',
                name: '疑似新建網站',
                url: hostname,
                count: '⚠️',
                startDate: creationDate.toISOString().split('T')[0], // YYYY-MM-DD
                endDate: '註冊未滿 30 天',
                age: Math.floor(ageInDays)
            };
        }

        // Cache result (even if null/safe)
        rdapCache[hostname] = { timestamp: now, result: result, error: false };
        return result;

    } catch (e) {
        console.error('RDAP Check Failed', e);
        return null;
    }
}

// 根據上次更新時間排程每日更新
async function scheduleDailyUpdate(lastUpdatedTime) {
    const baseTime = lastUpdatedTime || Date.now();
    const nextRun = baseTime + 7 * 24 * 60 * 60 * 1000;

    chrome.alarms.create('dailyUpdate', {
        when: nextRun,
        periodInMinutes: 10080 // 7 天
    });
    await chrome.storage.local.set({ nextUpdateTime: nextRun });
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
    const { fraudDatabase, lastUpdated, termsAccepted, remoteWhitelist } = await chrome.storage.local.get(['fraudDatabase', 'lastUpdated', 'termsAccepted', 'remoteWhitelist']);

    if (remoteWhitelist && Array.isArray(remoteWhitelist)) {
        cachedRemoteWhitelist = remoteWhitelist;
    }

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
    if (!lastUpdated || (now - lastUpdated) >= 7 * 24 * 60 * 60 * 1000) {
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

        // Exclude Whitelisted Domains (Save Quota)
        const whitelist = ['facebook.com', 'www.facebook.com', 'google.com', 'www.google.com', 'youtube.com', 'www.youtube.com', 'instagram.com', 'www.instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'github.com', 'threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'];
        try {
            // Safe URL Parsing
            const urlObj = new URL(tab.url);
            if (whitelist.includes(urlObj.hostname) || urlObj.hostname.endsWith('google.com') || urlObj.hostname.endsWith('facebook.com')) {
                // Skip check for trusted giants
                return;
            }

            // Check Remote Whitelist (save quota)
            if (cachedRemoteWhitelist && Array.isArray(cachedRemoteWhitelist)) {
                const isRemoteWhitelisted = cachedRemoteWhitelist.some(allowed =>
                    urlObj.hostname === allowed || urlObj.hostname.endsWith('.' + allowed)
                );
                if (isRemoteWhitelisted) return;
            }
        } catch (e) {
            // Invalid URL, skip check
            return;
        }

        // Check Quota (Web)
        const canScan = await LicenseManager.canScan('web');
        if (!canScan) {
            // Quota exceeded, skip check
            return;
        }

        const fraudInfo = await checkUrl(tab.url);
        if (fraudInfo) {
            await LicenseManager.incrementUsage('web');

            console.log(`Fraud detected: ${tab.url}`, fraudInfo);

            // Log Warning
            incrementStat('total_warnings');

            chrome.tabs.sendMessage(tabId, {
                action: 'showWarning',
                fraudInfo: fraudInfo
            }).catch(() => {
                // Content script 可能尚未準備好
            });
        } else {
            // 2. Check Domain Age (RDAP) if not in fraud DB
            // Only perform this check if we have quota and it's a main frame navigation (implied by tabs.onUpdated)
            // To save resources, maybe only check if NOT a sub-frame? (tab.url is top level)

            try {
                // Determine if we should check RDAP. 
                // Maybe limit to 'unknown' sites? For now, check all non-whitelisted.
                const ageInfo = await checkDomainAge(tab.url);
                if (ageInfo) {
                    await LicenseManager.incrementUsage('web'); // Consume quota? Or free? Let's consume.
                    console.log(`Newly Registered Domain detected: ${tab.url}`, ageInfo);

                    incrementStat('total_warnings');

                    chrome.tabs.sendMessage(tabId, {
                        action: 'showWarning',
                        fraudInfo: ageInfo
                    }).catch(() => { });
                    return;
                }
            } catch (e) {
                console.error('Domain Age Check Error', e);
            }

            // Increment for scan (Safe Site)
            await LicenseManager.incrementUsage('web');
        }
    }
});

// popup 的訊息監聽器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Update Database
    if (request.action === 'updateDatabase' || request.action === 'forceUpdate') {
        const force = (request.action === 'forceUpdate');
        updateDatabase(force)
            .then((result) => {
                sendResponse(result);
            })
            .catch((err) => {
                console.error('updateDatabase threw error:', err);
                sendResponse({ success: false, error: err.message });
            });
        return true; // Keep channel open for async response
    }

    // 2. Check URL (Local DB)
    if (request.action === 'checkUrl') {
        checkUrl(request.url).then((result) => {
            sendResponse(result);
        });
        return true; // Async response
    }

    // 3. Check License Status (For Premium Features)
    if (request.action === 'checkLicenseStatus') {
        LicenseManager.checkLicense().then(isActive => {
            sendResponse({ isPro: isActive });
        });
        return true; // Keep channel open
    }

    // 3. AI Analysis & Report (from Popup) - Defined in report_handler.js
    if (request.action === 'analyzeAndReport') {
        if (typeof analyzeWithAI !== 'function') {
            console.error('analyzeWithAI function not found. Script load failed?');
            sendResponse({ success: false, error: 'Internal Error: Report script not loaded.' });
            return false;
        }

        analyzeWithAI(request.content)
            .then(async (result) => {
                if (result.isScam) {
                    await addReportToFirebase(result);
                }
                sendResponse({ success: true, result: result });
            })
            .catch(err => {
                console.error("AI Analysis Error:", err);
                sendResponse({ success: false, error: err.message || 'AI Analysis Failed' });
            });
        return true; // Async response
    }

    // 4. Verify Gov Email (from Gmail Content Script) - Defined in report_handler.js
    if (request.action === 'verifyGovEmail') {
        if (typeof verifyGovWithAI !== 'function') {
            sendResponse({ success: false, error: 'Internal Error: Report script not loaded.' });
            return false;
        }

        const { name, email, subject } = request;
        verifyGovWithAI(name, email, subject)
            .then(result => {
                sendResponse({ success: true, result: result });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.message });
            });
        return true; // Async response
    }

    // === 5. License & Quota Management ===

    // === 5. License & Quota Management ===

    // Check Quota
    if (request.action === 'checkQuota') {
        LicenseManager.canScan(request.type).then(canScan => {
            sendResponse({ canScan: canScan });
        });
        return true; // Async
    }

    // Increment Quota
    if (request.action === 'incrementQuota') {
        LicenseManager.incrementUsage(request.type).then(() => {
            sendResponse({ success: true });
        });
        return true; // Async
    }

    // Get License Status (For Popup)
    if (request.action === 'getLicenseStatus') {
        LicenseManager.getStats().then(stats => {
            sendResponse(stats);
        });
        return true; // Async
    }

    // Activate License
    if (request.action === 'activateLicense') {
        LicenseManager.activateLicense(request.key)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Async
    }

    // 6. Report False Positive
    if (request.action === 'reportFalsePositive') {
        const reportData = {
            type: 'false_positive',
            source: request.source, // 'web' or 'gmail'
            timestamp: Date.now(),
            data: request.data
        };

        addReportToFirebase(reportData)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));

        return true; // Async
    }

    // 7. Increment Stat (Internal or from Content Script)
    if (request.action === 'incrementStat') {
        incrementStat(request.statName);
        sendResponse({ success: true });
        return false;
    }

    // 8. Update Badge (Visual Warning)
    if (request.action === 'updateBadge') {
        chrome.action.setBadgeText({ text: request.text || '' });
        if (request.color) {
            chrome.action.setBadgeBackgroundColor({ color: request.color });
        }
        sendResponse({ success: true });
        return false;
    }
});
