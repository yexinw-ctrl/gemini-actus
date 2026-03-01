import { execSync } from 'child_process';
import { dirname, resolve, join } from 'path';
import type { CommandModule } from 'yargs';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const SERVICE_NAME = 'gemini-actus.service';
const SYSTEMD_USER_DIR = resolve(process.env['HOME'] || '', '.config/systemd/user');
const SERVICE_PATH = resolve(SYSTEMD_USER_DIR, SERVICE_NAME);
let currentDir = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(currentDir, 'package.json')) || !existsSync(join(currentDir, 'scripts/start-servers.js'))) {
  const parent = resolve(currentDir, '..');
  if (parent === currentDir) break; 
  currentDir = parent;
}
const PROJECT_ROOT = currentDir;

const generateServiceFile = (isYolo: boolean = false) => `[Unit]
Description=Gemini Actus Centralized Servers (A2A & Gateway)
After=network.target

[Service]
Type=simple
Environment="${isYolo ? 'GEMINI_YOLO_MODE=true ' : ''}PATH=${process.env['PATH']}"
ExecStart=${process.execPath} scripts/start-servers.js
WorkingDirectory=${PROJECT_ROOT}
Restart=on-failure
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=gemini-actus

[Install]
WantedBy=default.target
`;

export const daemonCommand: CommandModule = {
  command: 'daemon <action>',
  describe: 'Manage Gemini Actus background daemon (Systemd)',
  builder: (yargs) => {
    return yargs
      .middleware((argv) => {
        argv['isCommand'] = true;
      })
      .positional('action', {
        describe: 'Action to perform (install, start, stop, restart, status)',
        type: 'string',
        choices: ['install', 'start', 'stop', 'restart', 'status'],
      })
      .option('yolo', {
        type: 'boolean',
        description: 'Install daemon in YOLO (no-confirmation) mode',
        default: false,
      });
  },
  handler: async (argv) => {
    const action = argv['action'] as string;
    const isYolo = argv['yolo'] as boolean;

    if (action === 'install') {
      try {
        if (!existsSync(SYSTEMD_USER_DIR)) {
          execSync(`mkdir -p ${SYSTEMD_USER_DIR}`);
        }
        writeFileSync(SERVICE_PATH, generateServiceFile(isYolo));
        execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
        execSync('systemctl --user enable gemini-actus', { stdio: 'inherit' });
        console.log(
          '\x1b[32m✓ Enabled gemini-actus service to start on boot.\x1b[0m',
        );
      } catch (err) {
        console.error('\x1b[31mError installing daemon.\x1b[0m', err);
        process.exitCode = 1;
      }
      return;
    }

    if (action === 'start') {
      try {
        execSync('systemctl --user start gemini-actus', { stdio: 'inherit' });
        console.log('\x1b[32m✓ Started gemini-actus service.\x1b[0m');
      } catch (err) {
        console.error('\x1b[31mError starting daemon.\x1b[0m', err);
        process.exitCode = 1;
      }
      return;
    }

    if (['stop', 'restart', 'status'].includes(action)) {
      try {
        execSync(`systemctl --user ${action} gemini-actus`, {
          stdio: 'inherit',
        });
      } catch (err) {
        // Systemctl will output its own error
        process.exitCode = 1;
      }
      return;
    }
  },
};
