// 模擬 chrome API
global.chrome = {
    storage: {
        local: {
            set: async (data) => {
                if (data.fraudDatabase) {
                    console.log('儲存設定: fraudDatabase 包含', Object.keys(data.fraudDatabase).length, '筆資料');
                } else {
                    console.log('儲存設定:', Object.keys(data));
                }
                global.mockStorage = { ...global.mockStorage, ...data };
            },
            get: async (keys) => {
                return global.mockStorage || {};
            }
        }
    },
    runtime: {
        onInstalled: { addListener: () => { } },
        onStartup: { addListener: (cb) => { global.startupCallback = cb; } },
        onMessage: { addListener: () => { } }
    },
    alarms: {
        create: (name, alarmInfo) => {
            console.log(`建立鬧鐘: ${name}`, alarmInfo);
            global.mockAlarm = { name, ...alarmInfo };
        },
        onAlarm: { addListener: (callback) => { global.alarmCallback = callback; } }
    },
    tabs: {
        onUpdated: { addListener: () => { } },
        create: (info) => { console.log('建立分頁:', info.url); }
    }
};

global.importScripts = () => {};
global.FIREBASE_CONFIG = {};

// 模擬 fetch
global.fetch = async (url) => {
    console.log('正在擷取 URL:', url);
    // 回傳範列 CSV 內容 (5 欄位)
    // WEBSITE_NM,WEBURL,CNT,STA_SDATE,STA_EDATE
    const sampleCsv = `WEBSITE_NM,WEBURL,CNT,STA_SDATE,STA_EDATE
網站名稱,網址,件數,統計起始日期,統計結束日期
0857娛樂城,listed.example,1,2023/12/12,2023/12/18
TestFraud,test-fraud.example,5,2023/01/01,2023/01/02
"QuoteName, Inc",quote.example,1,2023/01/01,2023/01/02
WithWWW,www.bad-site.com,1,2023/01/01,2023/01/02`;

    if (url.includes('gist.githubusercontent.com')) {
        return {
            ok: true,
            json: async () => ({})
        };
    }
    if (url.includes('/dataset/165027')) {
        return {
            ok: true,
            json: async () => ({
                result: {
                    distribution: [{
                        resourceFormat: 'JSON',
                        resourceDownloadUrl: 'mock://165027'
                    }]
                }
            })
        };
    }
    if (url === 'mock://165027') {
        return {
            ok: true,
            json: async () => []
        };
    }
    if (url.includes('/dataset/176455')) {
        return {
            ok: true,
            json: async () => ({
                result: {
                    distribution: [{
                        resourceDownloadUrl: 'mock://176455'
                    }]
                }
            })
        };
    }

    return {
        ok: true,
        text: async () => sampleCsv
    };
};

// 載入 background script 內容
const fs = require('fs');
const path = require('path');
const backgroundCode = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');

// 執行 background 程式碼
eval(backgroundCode);

// IndexedDB persistence is covered separately; keep this integration test in memory.
saveToIndexedDB = async () => {};

async function runTest() {
    console.log('--- 開始測試 ---');

    // 1. 測試更新
    await updateDatabase();

    // 2. 測試檢查 URL
    console.log('正在檢查 listed.example...');
    let result = await checkUrl('https://listed.example/');
    console.log('結果:', JSON.stringify(result));
    if (result && result.name === '0857娛樂城' && result.count === '1') {
        console.log('✅ PASS');
    } else {
        console.error('❌ FAIL');
    }

    console.log('正在檢查 test-fraud.example...');
    result = await checkUrl('http://test-fraud.example/login');
    console.log('結果:', JSON.stringify(result));
    if (result && result.name === 'TestFraud' && result.count === '5') {
        console.log('✅ PASS');
    } else {
        console.error('❌ FAIL');
    }

    console.log('正在檢查 quote.example (逗號測試)...');
    result = await checkUrl('https://quote.example');
    console.log('結果:', JSON.stringify(result));
    if (result && result.name === 'QuoteName, Inc') {
        console.log('✅ PASS (CSV Quote handled)');
    } else {
        console.error('❌ FAIL (CSV Quote failed)');
    }

    console.log('正在檢查 google.com (正常網站)...');
    result = await checkUrl('https://google.com');
    console.log('結果:', result); // 應為 null
    if (result === null) {
        console.log('✅ PASS');
    } else {
        console.error('❌ FAIL');
    }

    // 3. 測試鬧鐘
    console.log('正在檢查鬧鐘...');
    if (global.startupCallback) await global.startupCallback();

    if (global.mockAlarm && global.mockAlarm.name === 'dailyUpdate') {
        // 驗證大約是從現在開始的 7 天後
        const nextRun = new Date(global.mockAlarm.when);
        const now = Date.now();
        const diff = nextRun.getTime() - now;
        const expectedDiff = 7 * 24 * 60 * 60 * 1000;

        if (Math.abs(diff - expectedDiff) < 5000) {
            console.log('✅ 鬧鐘時間正確。');
        } else {
            console.error('❌ 鬧鐘時間不正確。');
        }
    } else {
        console.error('❌ 鬧鐘未排程。');
    }
}

runTest();
