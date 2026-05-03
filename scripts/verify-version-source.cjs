const fs = require('fs');
const path = require('path');
const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const targets = ['.env.example', 'README.md', path.join('src','app','layout.tsx'), path.join('src','config','appVersion.ts')];
const problems = [];
for (const rel of targets) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  if (/NEXT_PUBLIC_APP_VERSION/.test(content)) problems.push(`${rel} 不可再出現 NEXT_PUBLIC_APP_VERSION`);
  if (rel !== path.join('src','config','appVersion.ts') && /20\d{6}-F\d+/u.test(content)) problems.push(`${rel} 不可手寫 App 版本字串`);
}

const generatedVersionPath = path.join(root, 'src', 'generated', 'appBuild.ts');
if (fs.existsSync(generatedVersionPath)) {
  const content = fs.readFileSync(generatedVersionPath, 'utf8');
  if (!content.includes(`APP_VERSION = ${JSON.stringify(packageVersion)}`)) {
    problems.push(`src/generated/appBuild.ts 版本需等於 package.json (${packageVersion})`);
  }
}

const publicVersionPath = path.join(root, 'public', 'version.json');
if (fs.existsSync(publicVersionPath)) {
  const content = JSON.parse(fs.readFileSync(publicVersionPath, 'utf8'));
  if (content.version !== packageVersion) {
    problems.push(`public/version.json 版本需等於 package.json (${packageVersion})`);
  }
}

const swPath = path.join(root, 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  const content = fs.readFileSync(swPath, 'utf8');
  if (!content.includes(`const APP_VERSION = ${JSON.stringify(packageVersion)};`)) {
    problems.push(`public/sw.js 版本需等於 package.json (${packageVersion})`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
