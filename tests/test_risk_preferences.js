const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createStorageArea(store) {
    return {
        get(keys, callback) {
            const keyList = keys == null
                ? Object.keys(store)
                : (Array.isArray(keys) ? keys : [keys]);
            const result = {};
            keyList.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(store, key)) {
                    result[key] = store[key];
                }
            });
            if (callback) callback(result);
            return Promise.resolve(result);
        },
        set(updates, callback) {
            Object.assign(store, updates);
            if (callback) callback();
            return Promise.resolve();
        }
    };
}

function loadBackgroundContext() {
    const localStore = {};
    const syncStore = {};
    let isPremium = false;
    const noopListener = { addListener() {} };
    const context = {
        console,
        URL,
        AbortController,
        setTimeout,
        clearTimeout,
        importScripts() {},
        FIREBASE_CONFIG: {},
        indexedDB: {},
        LicenseManager: {
            async init() {},
            async getStats() {
                return { isPremium };
            },
            isDomainScannedToday() {
                return false;
            },
            async canScan() {
                return true;
            },
            async incrementUsage() {},
            addScannedDomain() {}
        },
        chrome: {
            runtime: {
                onStartup: noopListener,
                onInstalled: noopListener,
                onMessage: noopListener
            },
            storage: {
                local: createStorageArea(localStore),
                sync: createStorageArea(syncStore)
            },
            alarms: {
                create() {},
                onAlarm: noopListener
            },
            tabs: {
                onUpdated: noopListener,
                create() {},
                sendMessage: async () => {}
            },
            notifications: {
                create() {}
            },
            action: {
                setBadgeText() {},
                setBadgeBackgroundColor() {}
            }
        }
    };
    context.setPremium = value => {
        isPremium = value;
    };

    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
    vm.runInContext(source, context);
    return { context, localStore, syncStore };
}

function loadGmailContext() {
    const localStore = {};
    const noopListener = { addListener() {} };
    const context = {
        console,
        URL,
        document: {
            body: {},
            title: 'Gmail',
            querySelector() {
                return null;
            },
            querySelectorAll() {
                return [];
            }
        },
        window: {
            location: { hostname: 'mail.google.com' },
            open() {}
        },
        MutationObserver: class {
            observe() {}
        },
        setTimeout() {
            return 0;
        },
        clearTimeout() {},
        chrome: {
            runtime: {
                lastError: null,
                onMessage: noopListener,
                sendMessage() {}
            },
            storage: {
                local: createStorageArea(localStore),
                sync: createStorageArea({}),
                onChanged: noopListener
            }
        }
    };

    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'gmail_filter.js'), 'utf8');
    vm.runInContext(source, context);
    return context;
}

function loadContentContext() {
    const noopListener = { addListener() {} };
    const context = {
        console,
        document: {
            body: { style: {} },
            querySelector() {
                return {};
            },
            getElementById() {
                return null;
            }
        },
        window: {
            location: {
                hostname: 'example.com',
                href: 'https://example.com/'
            }
        },
        MutationObserver: class {
            observe() {}
        },
        setTimeout() {
            return 0;
        },
        clearTimeout() {},
        setInterval() {
            return 0;
        },
        clearInterval() {},
        chrome: {
            runtime: {
                lastError: null,
                onMessage: noopListener,
                sendMessage() {}
            },
            storage: {
                local: createStorageArea({}),
                onChanged: noopListener
            }
        }
    };

    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
    vm.runInContext(source, context);
    return context;
}

function testContentAndGmailCoexistence() {
    const noopListener = { addListener() {} };
    const storage = createStorageArea({});
    const context = {
        console,
        URL,
        document: {
            body: { style: {} },
            title: 'Gmail',
            querySelector(selector) {
                return selector === 'title' ? {} : null;
            },
            querySelectorAll() {
                return [];
            },
            getElementById() {
                return null;
            }
        },
        window: {
            location: {
                hostname: 'mail.google.com',
                href: 'https://mail.google.com/'
            },
            open() {}
        },
        MutationObserver: class {
            observe() {}
        },
        setTimeout() {
            return 0;
        },
        clearTimeout() {},
        setInterval() {
            return 0;
        },
        clearInterval() {},
        chrome: {
            runtime: {
                lastError: null,
                onMessage: noopListener,
                sendMessage() {}
            },
            storage: {
                local: storage,
                sync: createStorageArea({}),
                onChanged: noopListener
            }
        }
    };

    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8'),
        context
    );
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '..', 'extension', 'gmail_filter.js'), 'utf8'),
        context
    );
}

async function testSharedWhitelistQuota() {
    const { context, localStore, syncStore } = loadBackgroundContext();
    localStore.userWhitelist = Array.from(
        { length: 10 },
        (_, index) => `user${index}@example.com`
    );
    localStore.userDomainWhitelist = Array.from(
        { length: 9 },
        (_, index) => `site${index}.example`
    );

    let result = await context.addUserWhitelistEntry('email_domain', 'Example.ORG');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'added');
    assert.strictEqual(result.total, 20);
    assert.ok(localStore.userWhitelist.includes('*@example.org'));

    result = await context.addUserWhitelistEntry('domain', 'full.example');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'limit_reached');
    assert.strictEqual(result.limit, 20);
    assert.strictEqual(result.upgradePriceLabel, '年費 NT$499');

    result = await context.addUserWhitelistEntry('email_domain', '@EXAMPLE.ORG');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'exists');

    context.setPremium(true);
    result = await context.addUserWhitelistEntry('domain', 'paid.example');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.total, 21);
    assert.ok(syncStore.userDomainWhitelist.includes('paid.example'));
}

async function testDailyDismissals() {
    const { context, localStore } = loadBackgroundContext();
    localStore.dailyRiskDismissals = {
        webHosts: { 'old.example': '2000-01-01' },
        gmailEmails: {},
        gmailDomains: {}
    };

    assert.strictEqual(
        (await context.dismissRiskToday('web', 'Example.COM')).success,
        true
    );
    assert.strictEqual(
        (await context.dismissRiskToday('gmail_email', ' User@Example.com ')).success,
        true
    );
    assert.strictEqual(
        (await context.dismissRiskToday('gmail_domain', 'Example.org')).success,
        true
    );

    const stored = localStore.dailyRiskDismissals;
    assert.strictEqual(stored.webHosts['old.example'], undefined);
    assert.strictEqual(await context.isWebRiskDismissedToday('example.com'), true);
    assert.strictEqual(
        stored.gmailEmails['user@example.com'],
        context.getLocalDateKey()
    );
    assert.strictEqual(
        stored.gmailDomains['example.org'],
        context.getLocalDateKey()
    );
}

function testGmailMatching() {
    const context = loadGmailContext();
    assert.strictEqual(
        context.emailWhitelistIncludes(['*@example.com'], 'person@example.com'),
        true
    );
    assert.strictEqual(
        context.emailWhitelistIncludes(['*@example.com'], 'person@sub.example.com'),
        false
    );
    assert.strictEqual(
        context.emailWhitelistIncludes(['Person@Example.com'], 'person@example.com'),
        true
    );

    const today = context.getGmailLocalDateKey();
    context.updateDailyRiskCache({
        gmailEmails: { 'one@example.com': today },
        gmailDomains: { 'example.org': today }
    });
    assert.strictEqual(context.isGmailRiskDismissedSync('ONE@example.com'), true);
    assert.strictEqual(context.isGmailRiskDismissedSync('two@example.org'), true);
    assert.strictEqual(context.isGmailRiskDismissedSync('two@sub.example.org'), false);
}

function testWebMatching() {
    const context = loadContentContext();
    const today = context.getLocalDateKey();
    const state = { webHosts: { 'example.com': today } };
    assert.strictEqual(
        context.isWebRiskDismissedInState(state, 'EXAMPLE.COM'),
        true
    );
    assert.strictEqual(
        context.isWebRiskDismissedInState(state, 'sub.example.com'),
        false
    );
    assert.strictEqual(
        context.isWebRiskDismissedInState(
            { webHosts: { 'example.com': '2000-01-01' } },
            'example.com'
        ),
        false
    );
}

function testUiWiring() {
    const gmailSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'gmail_filter.js'), 'utf8');
    const contentSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
    const popupSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8');

    const actionAttachments = gmailSource.match(/attachGmailWarningActions\(banner,/g) || [];
    assert.strictEqual(
        actionAttachments.length,
        5,
        'All four Gmail warning banners must expose shared actions.'
    );
    assert.ok(gmailSource.includes('僅此寄件者：'));
    assert.ok(gmailSource.includes('整個寄件網域：@'));
    assert.ok(gmailSource.includes("entryType: scope === 'domain' ? 'email_domain' : 'email'"));
    assert.ok(contentSource.includes('略過（今日不再提示）'));
    assert.ok(contentSource.includes('永久加入白名單'));
    assert.ok(popupSource.includes("action: 'getWhitelistQuota'"));
    assert.ok(popupSource.includes('升級年費 NT$499'));
}

async function run() {
    await testSharedWhitelistQuota();
    await testDailyDismissals();
    testGmailMatching();
    testWebMatching();
    testContentAndGmailCoexistence();
    testUiWiring();
    console.log('✅ 每日略過、Gmail 精確範圍與共用 20 組白名單測試通過');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
