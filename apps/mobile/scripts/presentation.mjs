// Présentation à distance : rend l'API et l'app joignables depuis Internet (npm run presentation).
// - API : tunnel ngrok à adresse fixe (celle inscrite dans l'APK Android) ;
// - iPhone : Expo Go charge l'app depuis ce PC par un tunnel cloudflared ; QR code sur le Bureau.
// L'API (npm run api) doit déjà tourner. Ctrl+C arrête tout.
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import QRCode from 'qrcode';

const API_URL = 'https://encounter-captive-shrubbery.ngrok-free.dev';
const METRO_PORT = 8082;
const children = [];

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { shell: true, ...opts });
  children.push(child);
  return child;
}

function stopAll() {
  for (const c of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']);
    else c.kill();
  }
}
process.on('SIGINT', () => {
  console.log('\nArrêt de la présentation…');
  stopAll();
  process.exit(0);
});

function desktop() {
  const candidates = [join(homedir(), 'OneDrive - MASOFT', 'Bureau'), join(homedir(), 'OneDrive', 'Bureau'), join(homedir(), 'Desktop')];
  return candidates.find((d) => existsSync(d)) ?? homedir();
}

async function main() {
  const api = await fetch('http://localhost:4000/v1/home').catch(() => null);
  if (!api?.ok) {
    console.error("L'API ne répond pas sur le port 4000 : lancez d'abord « npm run api », puis relancez cette commande.");
    process.exit(1);
  }

  const tunnelUp = await fetch(`${API_URL}/v1/home`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
    .then((r) => r.ok)
    .catch(() => false);
  if (tunnelUp) {
    console.log('1/3  Tunnel ngrok de l’API : déjà ouvert.');
  } else {
    console.log('1/3  Tunnel ngrok de l’API…');
    run('ngrok', ['http', `--url=${API_URL.replace('https://', '')}`, '4000', '--log=stdout', '--log-level=warn'], { stdio: 'ignore' });
  }

  console.log('2/3  Tunnel cloudflared pour les iPhone…');
  const cf = run('cloudflared', ['tunnel', '--url', `http://localhost:${METRO_PORT}`, '--no-autoupdate']);
  const appUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloudflared n’a pas donné d’adresse (60 s).')), 60_000);
    const onData = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    cf.stdout.on('data', onData);
    cf.stderr.on('data', onData);
  });

  console.log('3/3  Préparation de l’app (Expo)…');
  run('npx', ['expo', 'start', '--no-dev', '--minify', '--port', String(METRO_PORT)], {
    stdio: 'ignore',
    env: { ...process.env, EXPO_PACKAGER_PROXY_URL: appUrl, EXPO_PUBLIC_API_URL: API_URL, EXPO_PUBLIC_API_MOCK: 'false' },
  });
  for (let i = 0; i < 90; i++) {
    const ok = await fetch(`http://localhost:${METRO_PORT}/status`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const link = appUrl.replace('https://', 'exps://');
  const file = join(desktop(), 'AfriSime-iPhone-QR.png');
  await QRCode.toFile(file, link, { width: 600, margin: 2 });
  console.log('\n✔ Tout est prêt.\n');
  console.log(`  API (téléphones) : ${API_URL}`);
  console.log(`  iPhone (Expo Go) : ${link}`);
  console.log(`  QR code iPhone   : ${file}\n`);
  console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
  console.log('Laissez cette fenêtre ouverte pendant la présentation. Ctrl+C pour tout arrêter.');
}

main().catch((error) => {
  console.error('Échec :', error.message);
  stopAll();
  process.exit(1);
});
