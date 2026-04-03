import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "@playwright/test";

const baseUrl = process.env.PLAYTEST_BASE_URL || "http://127.0.0.1:4174/";
const mode = process.env.PLAYTEST_MODE || "desktop";
const outDir = path.resolve(process.cwd(), process.env.PLAYTEST_OUT_DIR || "playtest-out");

const ROOM_LABELS = ["Slots", "Carte", "Chasse", "Blackjack", "Poker", "Roulette"];

function getViewportOptions(currentMode) {
  if (currentMode === "mobile") {
    return {
      ...devices["iPhone 13"],
      viewport: { width: 390, height: 844 },
    };
  }

  return {
    viewport: { width: 1366, height: 768 },
    userAgent: "Codex Playtest Desktop",
  };
}

async function ensureAuthenticated(page) {
  const logoutButton = page.getByRole("button", { name: /quitter|deconnexion/i });
  if (await logoutButton.isVisible().catch(() => false)) {
    return;
  }

  const registerTab = page.getByRole("button", { name: /inscription/i });
  await registerTab.click();

  const stamp = `${Date.now()}`;
  const username = `codex${stamp}`;
  const email = `codex${stamp}@example.com`;
  const password = "Funesterie42!";

  await page.getByLabel(/nom de joueur/i).fill(username);
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^mot de passe$/i).fill(password);
  await page.getByLabel(/confirmer le mot de passe/i).fill(password);
  await page.getByRole("button", { name: /creer le compte/i }).click();

  await logoutButton.waitFor({ timeout: 20000 });
}

async function captureRoom(page, roomLabel, currentMode, metrics) {
  await page.getByRole("tab", { name: new RegExp(roomLabel, "i") }).click();
  await page.waitForTimeout(roomLabel === "Roulette" ? 1400 : 700);

  const roomMetrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const room = document.querySelector(".casino-floor__room");
    const table = document.querySelector(".casino-table-layout");
    const topdeck = document.querySelector(".casino-topdeck");
    const header = document.querySelector(".casino-account-bar");
    const sideRail = document.querySelector(".casino-side-rail");
    const stageSidebar = document.querySelector(".casino-stage-sidebar");

    function rect(node) {
      if (!(node instanceof HTMLElement)) return null;
      const box = node.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        left: Math.round(box.left),
      };
    }

    return {
      viewportHeight: window.innerHeight,
      bodyScrollHeight: body.scrollHeight,
      documentScrollHeight: root.scrollHeight,
      room: rect(room),
      table: rect(table),
      topdeck: rect(topdeck),
      header: rect(header),
      sideRail: rect(sideRail),
      stageSidebar: rect(stageSidebar),
    };
  });

  metrics.push({
    room: roomLabel,
    mode: currentMode,
    metrics: roomMetrics,
  });

  await page.screenshot({
    path: path.join(outDir, `${currentMode}-${roomLabel.toLowerCase()}.png`),
    fullPage: false,
  });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(getViewportOptions(mode));
  const page = await context.newPage();

  const consoleEntries = [];
  const pageErrors = [];
  page.on("console", (message) => {
    consoleEntries.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  page.on("requestfailed", (request) => {
    consoleEntries.push({
      type: "requestfailed",
      text: `${request.url()} :: ${request.failure()?.errorText || "failed"}`,
    });
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
    await ensureAuthenticated(page);
    await page.waitForTimeout(1200);

    const metrics = [];
    for (const roomLabel of ROOM_LABELS) {
      await captureRoom(page, roomLabel, mode, metrics);
    }

    await fs.writeFile(
      path.join(outDir, `${mode}-results.json`),
      JSON.stringify(
        {
          baseUrl,
          mode,
          consoleEntries,
          pageErrors,
          metrics,
        },
        null,
        2,
      ),
      "utf8",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
