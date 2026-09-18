const assert = require('assert');
const fs = require('fs');
const path = require('path');

const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8');

assert.match(
    popupHtml,
    /html\s*\{[^}]*width:\s*360px;[^}]*min-width:\s*360px;[^}]*max-width:\s*360px;/s,
    'Popup root must keep a fixed width so the browser does not repeatedly resize it.'
);
assert.match(
    popupHtml,
    /html\s*\{[^}]*scrollbar-gutter:\s*stable;/s,
    'Popup root must reserve scrollbar space while async content settles.'
);
assert.match(
    popupHtml,
    /body\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*margin:\s*0;/s,
    'Popup body must fit the fixed root without the default body margin.'
);
assert.doesNotMatch(
    popupHtml,
    /body\s*\{[^}]*min-width:\s*320px;/s,
    'Popup body must not impose a competing intrinsic width.'
);

console.log('✅ Popup 固定寬度與捲軸穩定性測試通過');
