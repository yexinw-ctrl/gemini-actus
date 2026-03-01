import { spawn, execSync } from 'child_process';
import type { CommandModule } from 'yargs';
import prompts from 'prompts';
import { resolve } from 'path';

export const onboardCommand: CommandModule = {
  command: 'onboard',
  describe: 'Interactive wizard to configure Gemini Actus background servers',
  builder: (yargs) => {
    return yargs
      .middleware((argv) => {
        argv['isCommand'] = true;
      })
      .option('install-daemon', {
        type: 'boolean',
        description: 'Run the servers automatically as a systemd background daemon',
        default: false,
      })
      .option('yolo', {
        type: 'boolean',
        description: 'Run the servers in YOLO (no-confirmation) mode',
        default: false,
      });
  },
  handler: async (argv) => {


    const installDaemonFlag = argv['install-daemon'] as boolean;
    const yoloFlag = argv['yolo'] as boolean;

    console.log('\n==============================================');
    console.log('      🚀 Welcome to Gemini Actus Onboarding 🚀');
    console.log('==============================================\n');

    let confirmDaemon = installDaemonFlag;

    if (!installDaemonFlag) {
      // If not a TTY, fail gracefully
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error(
          '\x1b[31m[ERROR] This command requires an interactive terminal to prompt.\x1b[0m\n' +
            'If you are using npx, try running the binary directly, or use --install-daemon to skip prompts.',
        );
        process.exitCode = 1;
        return;
      }

      const response = await prompts({
        type: 'confirm',
        name: 'installDaemonPrompt',
        message: 'Would you like to install Gemini Actus as a background daemon service (Systemd)?',
        initial: false,
      });

      if (response.installDaemonPrompt === undefined) {
        console.log('Onboarding cancelled.');
        process.exitCode = 0;
        return;
      }
      
      confirmDaemon = response.installDaemonPrompt;
    }

    console.log('\n==============================================');
    console.log('🎉 Starting centralized servers 🎉');
    console.log('==============================================\n');

    if (confirmDaemon) {
      console.log('\nInstalling and starting daemon...');
      try {
        const installCommand = yoloFlag 
          ? 'npm run start -- daemon install --yolo' 
          : 'npm run start -- daemon install';
        execSync(installCommand, { stdio: 'inherit' });
        execSync('npm run start -- daemon start', { stdio: 'inherit' });
      } catch (err) {
        console.error('\nError linking daemon to Systemd:', err);
      }
      console.log('\n🎉 Services are securely running in the background. 🎉\n');
      process.exitCode = 0;
      return;
    }

    console.log('\nStarting servers in foreground (Press Ctrl+C to stop)...');

    // Run the process manager script
    const servers = spawn('npm', ['run', 'start:servers'], {
      stdio: 'inherit',
      cwd: resolve(import.meta.url ? new URL(import.meta.url).pathname : '', '../../../..'),
      shell: true,
    });

    servers.on('exit', (code) => {
      console.log(`Servers exited with code ${code}`);
      process.exitCode = code || 0;
    });
  },
};
