const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildVersionFile = path.join(root, '.next', 'app-build-version.json');

if (!fs.existsSync(buildVersionFile)) {
  console.error('[verify-build-version] 找不到 .next/app-build-version.json，請先執行 npm run build。');
  process.exit(1);
}

let built;
try {
  built = JSON.parse(fs.readFileSync(buildVersionFile, 'utf8'));
} catch (error) {
  console.error('[verify-build-version] build 版本標記無法解析，請刪除 .next 後重新 npm run build。');
  process.exit(1);
}

if (!built || typeof built.version !== 'string' || !built.version.trim()) {
  console.error('[verify-build-version] build 版本標記格式錯誤，請刪除 .next 後重新 npm run build。');
  process.exit(1);
}

if (built.version !== pkg.version) {
  console.error(`[verify-build-version] 偵測到 build 版本 ${built.version} 與 package.json 版本 ${pkg.version} 不一致。請刪除 .next 後重新 npm run build。`);
  process.exit(1);
}

console.log(`[verify-build-version] build 版本一致：${pkg.version}`);
