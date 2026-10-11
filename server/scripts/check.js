/**
 * "Build" check for the server (Node runs the source directly, so there is
 * nothing to compile): syntax-checks every source file, then loads the whole
 * Express app so missing modules or bad imports fail here rather than at runtime.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'samples']);

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
};
walk(root);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    console.error(`✗ ${path.relative(root, file)}\n${err.stderr?.toString() || err.message}`);
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed the syntax check`);
  process.exit(1);
}

// Loading the app wires every route, controller, model and service (no DB connection needed)
process.env.JWT_SECRET ||= 'x'.repeat(32);
require(path.join(root, 'app.js'));
console.log(`✓ ${files.length} files passed the syntax check and the app loaded successfully`);
process.exit(0);
