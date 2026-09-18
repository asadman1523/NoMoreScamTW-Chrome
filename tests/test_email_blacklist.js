const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = ['*.example.net', 'blocked@example.com', 'long.sender@relay.example.org', 'blocked.example', 'ac.example'];
const area = { get(keys, callback) { const data = { remoteEmailBlacklist: rules }; if (callback) callback(data); return Promise.resolve(data); }, set() { return Promise.resolve(); } };
const listener = { addListener() {} };
const context = {
    console, URL, setTimeout() {}, clearTimeout() {},
    window: { location: { hostname: 'mail.google.com' } },
    document: { body: {}, title: '', querySelector() { return null; }, querySelectorAll() { return []; } },
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: { runtime: { onMessage: listener, sendMessage() {} }, storage: { local: area, sync: area, onChanged: listener } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'gmail_filter.js'), 'utf8'), context);
for (const [email, expected] of [
    ['blocked@example.com', true], ['other@example.com', false],
    ['person@child.example.net', true], ['person@other.example.net', true],
    ['person@example.net.invalid', false], ['long.sender@relay.example.org', true],
    ['person@blocked.example', true], ['person@sub.blocked.example', false],
    ['person@ac.example', true], ['person@mac.example', false], ['person@sub.ac.example', false]
]) {
    let called = false;
    context.checkRemoteBlacklist(email, result => { called = true; assert.equal(result, expected, email); });
    assert.ok(called, 'Source callback must run');
}
console.log('PASS: email blacklist tests use actual extension code and synthetic addresses.');
