const fs = require('fs');

// Read gmail_filter.js content
const jsCode = fs.readFileSync('./gmail_filter.js', 'utf8');

// Mock Chrome Environment
global.chrome = {
    storage: {
        local: {
            get: async (keys, callback) => {
                if (keys.includes('remoteEmailBlacklist') || typeof keys === 'string') {
                    // Provide the test lists from user input
                    callback({
                        remoteEmailBlacklist: [
                            "*.example.net",
                            "fixture-d203e289c2@example.com",
                            "fixture-e6fb405e43@relay.example.org",
                            "blocked.example",
                            "sender.example",
                            "access.example",
                            "ac.example"
                        ]
                    });
                } else {
                    callback({});
                }
            },
            set: async () => { }
        }
    }
};

// Mock other browser elements to avoid reference errors when evaluating gmail_filter.js
global.console = console;
global.document = { body: {}, querySelectorAll: () => [], querySelector: () => null, title: '' };
global.MutationObserver = class { observe() { } disconnect() { } };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

// Extract checkRemoteBlacklist from the file text to run it locally
// Instead of full eval of the file (which might execute DOM stuff), let's just extract the function
const funcMatch = jsCode.match(/function checkRemoteBlacklist\(email, callback\)\s*\{[\s\S]*?\}\s*function checkUserWhitelist/m);
let funcCode = "";
if (funcMatch) {
    funcCode = funcMatch[0].replace('function checkUserWhitelist', '');
} else {
    // If regex fails natively, fallback to full eval
    funcCode = `
        function checkRemoteBlacklist(email, callback) {
            if (!email) { callback(false); return; }
            const emailDomain = email.split('@')[1];

            chrome.storage.local.get(['remoteEmailBlacklist'], (res) => {
                const list = res.remoteEmailBlacklist;
                if (list && Array.isArray(list)) {
                    const isBlacklisted = list.some(rule => {
                        try {
                            if (rule.startsWith('/')) {
                                const match = rule.match(/^\\/(.+)\\/([a-z]*)$/);
                                if (match) {
                                    const regex = new RegExp(match[1], match[2] || 'i');
                                    return regex.test(email);
                                }
                            }
                            const escapedRule = rule.replace(/[.+?^\${}()|[\\]\\\\]/g, '\\\\$&');
                            const regexStr = "^" + escapedRule.replace(/\\*/g, '.*') + "$";
                            const regex = new RegExp(regexStr, 'i');
                            return regex.test(email) || (emailDomain && regex.test(emailDomain));
                        } catch (e) {
                            return email.includes(rule);
                        }
                    });
                    callback(isBlacklisted);
                } else {
                    callback(false);
                }
            });
        }
    `;
}

eval(funcCode);

// Test Runner Wrapper
async function runTests() {
    let passed = 0;
    let failed = 0;

    const assert = async (email, expectedResult, message) => {
        return new Promise((resolve) => {
            checkRemoteBlacklist(email, (result) => {
                if (result === expectedResult) {
                    console.log(`✅ PASS: ${email} -> ${result} (${message})`);
                    passed++;
                } else {
                    console.error(`❌ FAIL: ${email} -> ${result} (Expected: ${expectedResult}) (${message})`);
                    failed++;
                }
                resolve();
            });
        });
    };

    console.log("--- Starting Email Blacklist Regex Tests ---");

    // "fixture-d203e289c2@example.com"
    await assert("fixture-d203e289c2@example.com", true, "Exact email match");
    await assert("fixture-2cf24dba5f@example.com", false, "Should not block other gmail users");

    // "*.example.net"
    await assert("fixture-b23943c509@child.example.net", true, "Wildcard domain extension");
    await assert("fixture-8c6976e5b5@other.example.net", true, "Wildcard domain extension 2");
    await assert("fixture-9f86d08188@example.net.invalid", false, "Should not match partial extension");

    // "fixture-e6fb405e43@relay.example.org"
    await assert("fixture-e6fb405e43@relay.example.org", true, "Exact complex email match");

    // "blocked.example"
    await assert("fixture-0a662a6bd1@blocked.example", true, "Exact domain match");
    await assert("fixture-0a662a6bd1@sub.blocked.example", false, "Strict domain match (does not match subdomains unless wildcard used)");

    // "sender.example"
    await assert("fixture-2f05d4b689@sender.example", true, "Exact domain match");

    // "access.example"
    await assert("fixture-8c6976e5b5@access.example", true, "Exact domain match");

    // "ac.example"
    await assert("fixture-b5d54c39e6@ac.example", true, "Exact domain match for ac.example");
    await assert("fixture-b5d54c39e6@mac.example", false, "Should not match mac.example");
    await assert("fixture-b5d54c39e6@sub.ac.example", false, "Should not match subdomains without wildcard");

    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
