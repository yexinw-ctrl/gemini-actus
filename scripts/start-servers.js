#!/usr/bin/env node

import { spawn } from 'child_process';
import { resolve } from 'path';

/**
 * Basic Process Manager to spin up both a2a-server and google-chat-gateway.
 * This script ensures both servers run synchronously and pipe their stdout/stderr correctly.
 * If one server crashes, it will kill the other and exit with an error.
 */

const rootDir = resolve(process.cwd());

console.log('Starting Gemini Actus Servers...');

const a2aServer = spawn('npm', ['run', 'start:a2a-server'], {
  stdio: 'inherit',
  cwd: rootDir,
  shell: true,
});

const gatewayServer = spawn('npm', ['run', 'start', '-w', '@google/gemini-actus-google-chat-gateway'], {
  stdio: 'inherit',
  cwd: rootDir,
  shell: true,
});

// Setup graceful shutdown handlers
const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down servers...`);
  if (!a2aServer.killed) a2aServer.kill(signal);
  if (!gatewayServer.killed) gatewayServer.kill(signal);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// If either process exits unexpectedly, terminate the whole array to avoid zombie services.
a2aServer.on('exit', (code) => {
  if (code !== 0) {
    console.error(`a2a-server exited with code ${code}. Terminating...`);
    if (!gatewayServer.killed) gatewayServer.kill('SIGTERM');
    process.exit(code || 1);
  }
});

gatewayServer.on('exit', (code) => {
  if (code !== 0) {
    console.error(`google-chat-gateway exited with code ${code}. Terminating...`);
    if (!a2aServer.killed) a2aServer.kill('SIGTERM');
    process.exit(code || 1);
  }
});

console.log('All servers started successfully.');
