import { spawn } from 'node:child_process';

// User-run only. Stops at the first failure; never installs, starts real inference,
// changes formatting, provisions resources, commits, or pushes automatically.
const executable = process.platform === 'win32' ? 'bun.exe' : 'bun';
const checks = ['format:check', 'typecheck', 'test', 'build'];
for (const check of checks) {
  console.log(`Checking ${check}…`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, ['run', check], { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', resolve);
  }).catch(() => 1);
  if (code !== 0) {
    console.error(`Verification stopped at ${check}. Fix that result before continuing.`);
    process.exitCode = 1;
    break;
  }
}
if (process.exitCode !== 1) {
  console.log(
    'Code checks completed. Real-model, browser, Docker, and deployment gates still require review.',
  );
}
