// Design-verification helper: boots the Vite dev server (browser fallback,
// localStorage save), seeds a rich save state, and captures a handful of
// screenshots for human review under docs/screenshots-review/.
// Usage: node scripts/screenshots.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs/screenshots-review');
const PORT = 5183;
const URL = `http://localhost:${PORT}`;

mkdirSync(OUT_DIR, { recursive: true });

function seed({ crumbs = 500000, turretLevel = 5, cosmeticsEquipped = ['top-hat', 'sunglasses', 'gold-chain'] } = {}) {
  return {
    version: 1,
    devMode: true,
    providerId: 'dev',
    savedAtIso: '2026-07-08T00:00:00.000Z',
    backupId: 'screenshot-preview',
    cloudSyncEnabled: false,
    cloudServerUrl: 'https://tokidachi.bb-bbb.com',
    language: 'fr',
    notificationsEnabled: false,
    game: {
      bornAtIso: '2026-01-01T00:00:00.000Z',
      memorial: [],
      prestigePoints: 0,
      prestigeSkills: [],
      wallet: { crumbs, pea: 0 },
      capacity: { budget: 1000000, used: 0, unlimited: true },
      companion: {
        name: 'Fablou',
        genome: { seed: 42, hue: 200, shape: 1, earStyle: 1, spots: true },
        tokensEaten: 50000,
        stage: 'adult',
        xp: 2600,
        satiety: 90,
        vitality: 95,
        mood: 80,
        eggTaps: 5,
        activeSeconds: 50000,
        zeroVitalitySeconds: 0,
        sick: false,
        dead: false,
        skills: [
          { skillId: 'crumb-forage', state: 'owned', trainedSeconds: 0, level: 5, upgrading: false },
          { skillId: 'doigt-leste', state: 'owned', trainedSeconds: 0, level: 5, upgrading: false },
          { skillId: 'pince-a-miettes', state: 'owned', trainedSeconds: 0, level: 3, upgrading: false },
          { skillId: 'clic-chanceux', state: 'owned', trainedSeconds: 0, level: 3, upgrading: false },
          { skillId: 'double-clic', state: 'learning', trainedSeconds: 30, level: 0, upgrading: false },
        ],
        pendingCrumbs: 200,
        foodHeat: {},
        cosmetics: {
          owned: ['beret', 'party-hat', 'top-hat', 'bandana', 'crown', 'halo', 'sunglasses', 'monocle', 'flower', 'bow', 'scarf', 'gold-chain'],
          equipped: cosmeticsEquipped,
        },
        children: [],
        containerLevel: 0,
        turretLevel,
        activeEvent: null,
        nextEventAtActive: 999999999,
        lastPlayAtActive: 0,
      },
    },
  };
}

async function withSeed(page, seedData) {
  await page.addInitScript((data) => {
    window.localStorage.setItem('tokidachi-save', JSON.stringify(data));
    window.localStorage.setItem('tokidachi-hud', 'visible');
  }, seedData);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
}

async function main() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('vite did not start in time')), 20000);
    vite.stdout.on('data', (d) => {
      if (d.toString().includes('ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    vite.stderr.on('data', (d) => process.stderr.write(d));
  });
  await new Promise((r) => setTimeout(r, 500));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 340, height: 620 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[page error]', msg.text());
    });

    await withSeed(page, seed());
    await page.screenshot({ path: path.join(OUT_DIR, '01-pet-cosmetics-tophat-sunglasses-chain.png') });

    for (const [id, file] of [
      ['crown', '02-cosmetic-crown.png'],
      ['halo', '03-cosmetic-halo.png'],
      ['monocle', '04-cosmetic-monocle.png'],
      ['scarf', '05-cosmetic-scarf.png'],
      ['bandana', '06-cosmetic-bandana.png'],
      ['party-hat', '07-cosmetic-party-hat.png'],
    ]) {
      await withSeed(page, seed({ cosmeticsEquipped: [id] }));
      await page.screenshot({ path: path.join(OUT_DIR, file) });
    }

    await withSeed(page, seed());
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (let i = 0; i < 5; i++) {
        await page.mouse.click(cx, cy);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_DIR, '08-clicker-floating-text.png') });
    } else {
      console.warn('No canvas found for clicker screenshot');
    }

    await withSeed(page, seed());
    const skillsBtn = page.getByRole('button', { name: /compétence|skill/i }).first();
    if (await skillsBtn.count()) {
      await skillsBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, '09-skill-tree-clicker-branch.png') });
      await page.keyboard.press('Escape').catch(() => {});
    }

    await withSeed(page, seed({ crumbs: 50000 }));
    const shopBtn = page.getByRole('button', { name: /boutique|shop/i }).first();
    if (await shopBtn.count()) {
      await shopBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, '10-shop-turret-ammo-online.png') });
    }

    await withSeed(page, seed({ crumbs: 0 }));
    const shopBtn2 = page.getByRole('button', { name: /boutique|shop/i }).first();
    if (await shopBtn2.count()) {
      await shopBtn2.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, '11-shop-turret-offline.png') });
    }

    await withSeed(page, seed());
    const cloudBtn = page.getByRole('button', { name: /nuage|cloud/i }).first();
    if (await cloudBtn.count()) {
      await cloudBtn.click();
      await page.waitForTimeout(400);
      const leaderboardTab = page.getByText(/classement|leaderboard/i).first();
      if (await leaderboardTab.count()) {
        await leaderboardTab.click();
        await page.waitForTimeout(400);
      }
      await page.screenshot({ path: path.join(OUT_DIR, '12-cloud-leaderboard-panel.png') });
    }

    console.log(`Screenshots written to ${OUT_DIR}`);
  } finally {
    await browser.close();
    vite.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
