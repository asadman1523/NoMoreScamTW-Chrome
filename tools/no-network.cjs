const deny = () => { throw new Error('Tests must mock network requests; live requests are disabled.'); };
global.fetch = deny;
for (const protocol of ['http', 'https']) {
    const api = require(protocol);
    api.request = deny;
    api.get = deny;
}
