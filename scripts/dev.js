/**
 * `npm run dev`: starts the API (nodemon, :5000) and the client (Vite, :5173)
 * together with prefixed output. Ctrl+C stops both. No extra dependencies.
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const COLORS = { server: '\x1b[36m', client: '\x1b[35m' };
const RESET = '\x1b[0m';

const children = ['server', 'client'].map((name) => {
  const child = spawn(npm, ['run', 'dev', '--prefix', name], {
    cwd: root,
    shell: process.platform === 'win32', // .cmd files need a shell on Windows
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  const prefix = `${COLORS[name]}[${name}]${RESET} `;
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // On Windows the child is a shell; kill the whole tree so nodemon/Vite don't linger on their ports
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGINT');
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
