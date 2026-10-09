// Playtest harness for the UI/UX pass (Pass 0, agent 0B).
//
// Gives one playtester agent an isolated, persona-configured Playwright browser
// context plus the evidence helpers it needs (screenshots, traces, diary).
//
// HARD RULES (docs/perfect/ux-pass/FOR-AGENTS.md U2/U4/U5, task spec):
//   * This file drives NOTHING in the game. It has zero game selectors, zero
//     game flows and zero shortcuts. The calling agent decides every action
//     from what it sees (screenshots + the accessibility snapshot).
//   * It never imports or reads game source, specs or docs. The only file it
//     reads is `docs/perfect/ux-pass/INSTANCE-LOG.md`, and only to discover the
//     client URL the lead recorded there.
//   * All evidence lands under `docs/perfect/ux-pass/playtest/<id>/`.
//
// The playtester agent is expected to write a tiny throwaway script per step:
//   const s = await personaContext('P01');
//   await s.page.goto(s.url);          // open the client
//   console.log(await s.ariaSnapshot());// read the a11y tree
//   await s.shot('01-landing');         // capture evidence
//   await s.decide('...');              // one-line decision in the diary
//   // ...the agent acts with the page, then:
//   await s.close();                    // saves login state + stops tracing
// The session persists cookies/localStorage to `<id>/state.json`, so the next
// step script stays logged in. See README.md and example-session.mjs.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const PLAYTEST_ROOT = path.join(REPO_ROOT, 'docs', 'perfect', 'ux-pass', 'playtest');
const INSTANCE_LOG = path.join(REPO_ROOT, 'docs', 'perfect', 'ux-pass', 'INSTANCE-LOG.md');

export const DEFAULT_CLIENT_URL = 'http://localhost:8080';

/**
 * Persona table, verbatim from FOR-AGENTS.md §3. Only the browser-visible
 * knobs live here: viewport, pointer/touch, throttling and reduced motion.
 * `mobile` mirrors Chromium's isMobile; tablets are touch but not mobile.
 */
export const PERSONAS = {
  P01: { id: 'P01', label: 'First-time casual', viewport: { width: 390, height: 844 }, touch: true, mobile: true },
  P02: { id: 'P02', label: 'Football Manager veteran', viewport: { width: 1440, height: 900 }, touch: false, mobile: false },
  P03: { id: 'P03', label: 'Min-maxer economist', viewport: { width: 1440, height: 900 }, touch: false, mobile: false },
  P04: { id: 'P04', label: 'Impatient skipper', viewport: { width: 390, height: 844 }, touch: true, mobile: true },
  P05: { id: 'P05', label: 'Keyboard-only + screen reader', viewport: { width: 1440, height: 900 }, touch: false, mobile: false },
  P06: {
    id: 'P06',
    label: 'Low-end phone, slow network',
    viewport: { width: 360, height: 740 },
    touch: true,
    mobile: true,
    cpuThrottle: 4,
    network: 'Slow 4G',
    reducedMotion: 'reduce',
  },
  P07: { id: 'P07', label: 'Non-native English reader', viewport: { width: 1280, height: 800 }, touch: false, mobile: false },
  P08: { id: 'P08', label: 'Joins through an invite', viewport: { width: 390, height: 844 }, touch: true, mobile: true },
  P09: { id: 'P09', label: 'Tablet player', viewport: { width: 768, height: 1024 }, touch: true, mobile: false },
  P10: { id: 'P10', label: 'Completionist explorer', viewport: { width: 1920, height: 1080 }, touch: false, mobile: false },
  A01: { id: 'A01', label: 'Admin running the world', viewport: { width: 1440, height: 900 }, touch: false, mobile: false },
};

// Lighthouse mobile "Slow 4G" profile (bytes/s + ms), the same preset Chrome
// DevTools ships. Used by P06.
const NETWORK_PRESETS = {
  'Slow 4G': {
    latency: 150,
    downloadThroughput: (1638.4 * 1024) / 8,
    uploadThroughput: (675 * 1024) / 8,
  },
};

/**
 * The client URL: explicit env override, else the first client-looking URL in
 * INSTANCE-LOG.md (written by Pass 0 agent 0A), else the dev placeholder.
 */
export function resolveClientUrl() {
  const override = process.env.PLAYTEST_BASE_URL || process.env.E2E_BASE_URL;
  if (override) return override.replace(/\/+$/, '');
  try {
    if (fs.existsSync(INSTANCE_LOG)) {
      const text = fs.readFileSync(INSTANCE_LOG, 'utf8');
      const urls = [...text.matchAll(/https?:\/\/[^\s`)\]>"']+/g)].map((m) => m[0].replace(/[.,;]+$/, ''));
      const client = urls.find((u) => /client|preview|:8080|:4173/i.test(u));
      if (client) return client.replace(/\/+$/, '');
    }
  } catch {
    /* fall through to the placeholder */
  }
  return DEFAULT_CLIENT_URL;
}

/** Resolve a persona id or inline spec object. Unknown ids are an error. */
function normalisePersona(persona) {
  if (persona && typeof persona === 'object') return { ...persona, id: persona.id ?? 'adhoc' };
  const spec = PERSONAS[persona];
  if (!spec) {
    throw new Error(`Unknown persona "${persona}". Known: ${Object.keys(PERSONAS).join(', ')}`);
  }
  return spec;
}

const sanitise = (name) => String(name).replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').trim() || 'shot';
const withPng = (name) => (name.toLowerCase().endsWith('.png') ? name : `${name}.png`);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * Create the persona's browser context and return a session handle.
 *
 * The returned object exposes the raw Playwright `context` (BrowserContext) and
 * `page`, plus the evidence helpers. Nothing here touches the game.
 *
 * @param {string|object} persona persona id from PERSONAS, or an inline spec
 *   `{ id, viewport, touch?, mobile?, cpuThrottle?, network?, reducedMotion? }`
 * @param {object} [opts]
 * @param {string} [opts.url] override the client URL for this session
 * @returns {Promise<object>} the playtest session
 */
export async function personaContext(persona, opts = {}) {
  const spec = normalisePersona(persona);
  const id = sanitise(spec.id);
  const dir = path.join(PLAYTEST_ROOT, id);
  const screenshotsDir = path.join(dir, 'screenshots');
  const tracesDir = path.join(dir, 'traces');
  const diaryPath = path.join(dir, 'DIARY.md');
  const statePath = path.join(dir, 'state.json');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(tracesDir, { recursive: true });

  const url = (opts.url ?? resolveClientUrl()).replace(/\/+$/, '');
  const browser = await chromium.launch({ headless: process.env.PLAYTEST_HEADED !== '1' });
  const context = await browser.newContext({
    viewport: spec.viewport,
    hasTouch: !!spec.touch,
    isMobile: !!spec.mobile,
    deviceScaleFactor: 1,
    reducedMotion: spec.reducedMotion === 'reduce' ? 'reduce' : 'no-preference',
    baseURL: url,
    storageState: fs.existsSync(statePath) ? statePath : undefined,
  });

  // Tracing is on for the whole session, per D7.
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  let tracingActive = true;

  const page = await context.newPage();

  // P06's low-end profile: CPU 4x + Slow 4G over CDP (Chromium only).
  let cdp = null;
  if (spec.cpuThrottle || spec.network) {
    cdp = await context.newCDPSession(page);
    if (spec.cpuThrottle) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: spec.cpuThrottle });
    }
    const preset = NETWORK_PRESETS[spec.network];
    if (preset) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: preset.latency,
        downloadThroughput: preset.downloadThroughput,
        uploadThroughput: preset.uploadThroughput,
      });
    }
  }

  async function shot(name, options = {}) {
    const file = path.join(screenshotsDir, withPng(sanitise(name)));
    await page.screenshot({ path: file, fullPage: !!options.fullPage });
    return file;
  }

  async function ariaSnapshot() {
    try {
      return await page.locator('body').ariaSnapshot();
    } catch {
      const snap = page.accessibility?.snapshot ? await page.accessibility.snapshot() : null;
      return snap ? JSON.stringify(snap, null, 2) : '(no accessibility snapshot available)';
    }
  }

  async function startTracing() {
    if (tracingActive) return;
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    tracingActive = true;
  }

  async function stopTracing(name) {
    if (!tracingActive) return null;
    const file = path.join(tracesDir, sanitise(name ?? `trace-${stamp()}`).replace(/\.zip$/i, '') + '.zip');
    await context.tracing.stop({ path: file });
    tracingActive = false;
    return file;
  }

  /** Append one line to the diary. One line means one line: newlines are collapsed. */
  async function decide(note) {
    const line = String(note).replace(/\s+/g, ' ').trim();
    const entry = `- [${new Date().toISOString()}] ${line}\n`;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(diaryPath, entry, 'utf8');
    console.log(`[diary ${id}] ${line}`);
    return diaryPath;
  }

  async function saveState() {
    await context.storageState({ path: statePath });
    return statePath;
  }

  async function close({ keepTracing = false } = {}) {
    try {
      await saveState();
    } catch {
      /* nothing worth failing the session over */
    }
    if (tracingActive && !keepTracing) {
      try {
        await stopTracing(`trace-${stamp()}`);
      } catch {
        /* ignore */
      }
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return {
    id,
    label: spec.label ?? id,
    spec,
    url,
    browser,
    context, // the configured Playwright BrowserContext
    page, // the persona's page
    cdp,
    dir,
    screenshotsDir,
    tracesDir,
    diaryPath,
    shot,
    ariaSnapshot,
    startTracing,
    stopTracing,
    decide,
    saveState,
    close,
  };
}
