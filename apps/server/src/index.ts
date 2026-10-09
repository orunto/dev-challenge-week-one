import { existsSync } from 'node:fs';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

async function main() {
  const config = readConfig();
  const app = await buildApp(config, {
    log: (event) => console.log(JSON.stringify(event)),
  });
  const stop = async () => {
    try {
      await app.close();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(
    JSON.stringify({
      event: 'server_started',
      port: config.PORT,
      model: config.OLLAMA_MODEL,
    }),
  );
}

main().catch(() => {
  // Configuration/upstream exception strings are not safe public log material.
  console.error(
    JSON.stringify({
      event: 'startup_failed',
      message: 'Check configuration and port availability.',
    }),
  );
  process.exitCode = 1;
});
