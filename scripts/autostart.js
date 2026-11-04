// Installs a macOS LaunchAgent that starts Hub when you log in and opens it in
// your browser. Usage: npm run autostart:install | npm run autostart:uninstall
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LABEL = 'com.hub.dashboard';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const logDir = path.join(root, 'data');

function unload() {
  try {
    execSync(`launchctl bootout gui/${process.getuid()} "${plistPath}"`, { stdio: 'ignore' });
  } catch {
    // not loaded
  }
}

const cmd = process.argv[2];

if (cmd === 'uninstall') {
  unload();
  fs.rmSync(plistPath, { force: true });
  console.log('Removed Hub from login items.');
  process.exit(0);
}

if (cmd !== 'install') {
  console.log('Usage: node scripts/autostart.js install|uninstall');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('Building the client first…');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}

const protectedDirs = ['Desktop', 'Documents', 'Downloads'].map((d) => path.join(os.homedir(), d));
if (protectedDirs.some((d) => root.startsWith(d + path.sep))) {
  console.warn(
    `\n⚠️  Hub lives in ${root}.\n` +
      '   macOS privacy protection can block background apps from reading Desktop/Documents/Downloads.\n' +
      '   If Hub does not open after you log in, check data/hub.log, then either move this folder\n' +
      '   (e.g. to ~/Developer/hub) and run this again, or allow "node" under\n' +
      '   System Settings → Privacy & Security → Files and Folders.\n',
  );
}

fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(path.dirname(plistPath), { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(root, 'server', 'index.js')}</string>
    <string>--open</string>
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${path.join(logDir, 'hub.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, 'hub.log')}</string>
</dict>
</plist>
`;

unload();
fs.writeFileSync(plistPath, plist);
execSync(`launchctl bootstrap gui/${process.getuid()} "${plistPath}"`);
console.log(`Installed. Hub now starts at login and opens http://localhost:${process.env.PORT || 4321}.`);
console.log(`Logs: ${path.join(logDir, 'hub.log')}`);
