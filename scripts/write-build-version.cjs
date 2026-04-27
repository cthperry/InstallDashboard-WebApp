const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outDir = path.join(root, '.next');

if (!fs.existsSync(outDir)) {
  console.error('[write-build-version] 找不到 .next 目錄，請先完成 next build。');
  process.exit(1);
}

const payload = {
  version: pkg.version,
};

fs.writeFileSync(
  path.join(outDir, 'app-build-version.json'),
  JSON.stringify(payload, null, 2) + '\n',
  'utf8',
);

console.log(`[write-build-version] 已寫入 build 版本標記：${pkg.version}`);
