const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".tmp", "unit");
const tscBin = require.resolve("typescript/bin/tsc");

function walk(dir, matcher, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, matcher, acc);
    } else if (matcher(fullPath)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

fs.rmSync(outDir, { recursive: true, force: true });
execFileSync(process.execPath, [tscBin, "-p", "tsconfig.unit.json"], {
  cwd: root,
  stdio: "inherit",
});

const aliasRoot = path.join(outDir, "node_modules", "@");
fs.mkdirSync(aliasRoot, { recursive: true });
fs.cpSync(path.join(outDir, "src"), aliasRoot, { recursive: true });

const testFiles = walk(path.join(outDir, "tests"), (file) => file.endsWith(".test.js")).sort();
if (testFiles.length === 0) {
  throw new Error("No compiled unit tests found.");
}

for (const file of testFiles) {
  require(file);
}

console.log(`[unit] ${testFiles.length} test file(s) passed`);
