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
        remove(keys) {
            for (const key of keys) delete store[key];
            return Promise.resolve();
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
                onUpdated: { addListener(callback) { context.handleTabUpdate = callback; } },
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

async function testUnlimitedWhitelist() {
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
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.total, 21);
    result = await context.addUserWhitelistEntry('email_domain', '@EXAMPLE.ORG');
    assert.strictEqual(result.status, 'exists');
    for (let index = 0; index < 30; index++) {
        result = await context.addUserWhitelistEntry('domain', `more${index}.example`);
        assert.strictEqual(result.success, true);
    }
    assert.strictEqual(result.total, 51);
    assert.ok(syncStore.userDomainWhitelist.includes('full.example'));
    context.chrome.storage.sync.set = async () => { throw new Error('Sync capacity exceeded'); };
    result = await context.addUserWhitelistEntry('domain', 'local-only.example');
    assert.strictEqual(result.success, true);
    assert.ok(localStore.userDomainWhitelist.includes('local-only.example'));

}

async function testFreeScanningAndMigration() {
    const { context, localStore, syncStore } = loadBackgroundContext();
    localStore.termsAccepted = true;
    localStore.userLicense = { isPremium: false };
    localStore.usageStats = { webScansToday: 9999, emailScansToday: 9999 };
    syncStore.userLicense = { isPremium: true, key: 'old-test-key' };
    syncStore.usageStats = { webScansToday: 9999 };
    localStore.userWhitelist = ['keep@example.org'];
    await context.clearRetiredBillingState();
    assert.ok(!('userLicense' in localStore));
    assert.ok(!('usageStats' in localStore));
    assert.ok(!('userLicense' in syncStore));
    assert.ok(!('usageStats' in syncStore));
    assert.deepStrictEqual(localStore.userWhitelist, ['keep@example.org']);
    let scans = 0;
    let warnings = 0;
    context.ensureRemoteWhitelistFresh = async () => {};
    context.checkUrl = async () => { scans++; return { name: 'Synthetic test site' }; };
    context.incrementStat = async () => {};
    context.chrome.tabs.sendMessage = async () => { warnings++; };
    context.console = { ...console, log() {} };
    for (let index = 0; index < 250; index++) {
        await context.handleTabUpdate(index, { status: 'complete' }, { url: `https://scan${index}.example/` });
    }
    assert.strictEqual(scans, 250);
    assert.strictEqual(warnings, 250);
}

function testUnlimitedGmailScanning() {
    const context = loadGmailContext();
    context.console = { ...console, log() {} };
    let sender;
    let warnings = 0;
    context.document.querySelector = selector => selector === 'span.gD[email]' ? sender : null;
    context.checkGmailRiskDismissed = (_, callback) => callback(false);
    context.checkUserWhitelist = (_, callback) => callback(false);
    context.checkRemoteBlacklist = (_, callback) => callback(true);
    context.markBlacklistedSender = () => { warnings++; };
    context.chrome.runtime.sendMessage = request => {
        assert.ok(!['checkQuota', 'incrementQuota'].includes(request.action));
    };
    for (let index = 0; index < 30; index++) {
        const attributes = { email: `sender${index}@example.org` };
        sender = {
            name: 'Synthetic sender',
            getAttribute(key) { return attributes[key]; },
            setAttribute(key, value) { attributes[key] = value; }
        };
        context.scanOpenedEmail();
    }
    assert.strictEqual(warnings, 30);
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
    assert.ok(popupSource.includes("action: 'getWhitelistSummary'"));
    assert.ok(!popupSource.includes('activateLicense'));
}

async function run() {
    await testUnlimitedWhitelist();
    await testFreeScanningAndMigration();
    testUnlimitedGmailScanning();
    await testDailyDismissals();
    testGmailMatching();
    testWebMatching();
    testContentAndGmailCoexistence();
    testUiWiring();
    console.log('✅ 每日略過、Gmail 精確範圍與免費無上限白名單測試通過');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
