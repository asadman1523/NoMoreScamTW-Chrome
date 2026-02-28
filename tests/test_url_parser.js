const fs = require('fs');

// Read background.js content
const bgCode = fs.readFileSync('./background.js', 'utf8');

// Mock global functions
global.importScripts = () => { };

// Mock Chrome Environment
global.chrome = {
    storage: {
        local: {
            get: async (keys) => {
                if (keys === 'userDomainWhitelist') {
                    return { userDomainWhitelist: ['goodguy.com', 'safe.kr'] };
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
        "*.kr": { name: "Korean Domains Blocked" }
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

    // Test 2: Wildcard Match (Not in Whitelist)
    res = await checkUrl("https://scam.kr/login");
    assert(res && res.name === "Korean Domains Blocked", "Should block .kr domains using wildcard *.kr");

    res = await checkUrl("http://sub.deep.scam.kr");
    assert(res && res.name === "Korean Domains Blocked", "Should block deep subdomains using wildcard *.kr");

    // Test 3: Whitelist Override (User Whitelist > Blacklist)
    res = await checkUrl("https://safe.kr/path");
    assert(res === null, "Should NOT block safe.kr because it is in userDomainWhitelist (Whitelist Priority)");

    res = await checkUrl("https://www.goodguy.com");
    assert(res === null, "Should NOT block goodguy.com because it is in userDomainWhitelist");

    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
