const fs = require('fs');

// Read background.js content
const bgCode = fs.readFileSync(require('path').join(__dirname, '..', 'extension', 'background.js'), 'utf8');

// All network responses are synthetic; tests never contact the official backend.
global.fetch = async () => ({ ok: true, json: async () => ({ whitelist: [] }) });

// Mock global functions
global.importScripts = () => { };

// Mock Chrome Environment
global.chrome = {
    storage: {
        local: {
            get: async (keys) => {
                if (keys === 'userDomainWhitelist') {
                    return { userDomainWhitelist: ['goodguy.com', 'safe.example.kr'] };
                }
                return {};
            },
            set: async () => { }
        }
    },
    runtime: {
        onInstalled: { addListener: () => { } },
        onStartup: { addListener: () => { } },
        onMessage: { addListener: () => { } }
    },
    alarms: {
        create: () => { },
        onAlarm: { addListener: () => { } }
    },
    tabs: {
        onUpdated: { addListener: () => { } }
    }
};

// Prepare mock background context
const bgContext = bgCode + `
    cachedDatabase = {
        "badsite.com": { name: "Bad Site" },
        "*.kr": { name: "Legacy Korean TLD Rule" },
        "*.example.kr": { name: "Targeted Korean Domain Rule" },
        "data.go.kr": { name: "Legacy GoKR Block" }
    };
    cachedRemoteWhitelist = [];
`;

// Load checkUrl function from background.js
eval(bgContext);

// Test Runner
async function runTests() {
    let passed = 0;
    let failed = 0;

    const assert = (condition, message) => {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    };

    console.log("--- Starting Unit Tests ---");

    // Test 1: Normal Blacklist Match
    let res = await checkUrl("http://badsite.com/path");
    assert(res && res.name === "Bad Site", "Should detect normal domain blacklist");

    res = await checkUrl("badsite.com");
    assert(res && res.name === "Bad Site", "Should detect normal domain blacklist even without http:// prefix");

    // Test 2: Whole-TLD Wildcards Should Not Match
    res = await checkUrl("https://scam.kr/login");
    assert(res === null, "Should NOT block scam.kr via legacy *.kr whole-TLD wildcard");

    res = await checkUrl("http://sub.deep.scam.kr");
    assert(res === null, "Should NOT block deep .kr subdomains via legacy *.kr whole-TLD wildcard");

    // Test 3: Targeted Wildcard Match Still Works
    res = await checkUrl("https://login.example.kr/path");
    assert(res && res.name === "Targeted Korean Domain Rule", "Should still block targeted wildcard domains like *.example.kr");

    // Test 4: Whitelist Override (User Whitelist > Blacklist)
    res = await checkUrl("https://safe.example.kr/path");
    assert(res === null, "Should NOT block safe.example.kr because it is in userDomainWhitelist (Whitelist Priority)");

    res = await checkUrl("https://www.goodguy.com");
    assert(res === null, "Should NOT block goodguy.com because it is in userDomainWhitelist");

    global.chrome.storage.local.get = async (keys) => {
        if (keys === 'userDomainWhitelist') {
            return { userDomainWhitelist: ['www.data.go.kr'] };
        }
        return {};
    };

    res = await checkUrl("https://data.go.kr");
    assert(res === null, "Should treat www.data.go.kr whitelist entry as matching data.go.kr");

    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
