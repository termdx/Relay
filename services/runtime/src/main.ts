#!/usr/bin/env -S npx tsx
import { startRuntimeServer } from './server';

const port = Number(process.env.RELAY_RUNTIME_PORT ?? 51720);

startRuntimeServer(port)
  .then(() => {
    console.log(`Relay Runtime API listening on http://127.0.0.1:${port}`);
  })
  .catch((error: unknown) => {
    console.error('Failed to start Relay Runtime API:', error);
    process.exit(1);
  });
