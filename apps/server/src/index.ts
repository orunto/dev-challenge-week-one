import { existsSync } from 'node:fs';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { startupFailure, type StartupStage } from './startup.js';

let stage: StartupStage = 'environment';

async function main() {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  stage = 'configuration';
  const config = readConfig();
  stage = 'application';
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
  stage = 'listen';
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (error) {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    await app.close().catch(() => {});
    throw error;
  }
  console.log(
    JSON.stringify({
      event: 'server_started',
      port: config.PORT,
      model: config.OLLAMA_MODEL,
    }),
  );
}

main().catch((error: unknown) => {
  // Configuration/upstream exception strings are not safe public log material.
  console.error(JSON.stringify(startupFailure(error, stage)));
  process.exitCode = 1;
});
