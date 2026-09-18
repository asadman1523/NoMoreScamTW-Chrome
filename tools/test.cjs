const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const test of fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.js')).sort()) {
    const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'no-network.cjs'), path.join(root, 'tests', test)], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
