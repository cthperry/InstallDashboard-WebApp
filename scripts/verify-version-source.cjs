const fs = require('fs');
const path = require('path');
const root = process.cwd();
const targets = ['.env.example', 'README.md', path.join('src','app','layout.tsx'), path.join('src','config','appVersion.ts')];
const problems = [];
for (const rel of targets) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  if (/NEXT_PUBLIC_APP_VERSION/.test(content)) problems.push(`${rel} 不可再出現 NEXT_PUBLIC_APP_VERSION`);
  if (rel !== path.join('src','config','appVersion.ts') && /20\d{6}-F\d+/u.test(content)) problems.push(`${rel} 不可手寫 App 版本字串`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
