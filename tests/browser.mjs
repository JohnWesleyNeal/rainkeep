import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer, preview } from "vite";
import { createStage } from "../src/stages.js";
import { advanceGrowth } from "../src/growth.js";
import { createGame, LIMIT } from "../src/simulation.js";

// Independent browser profiles; fixtures enter through the real saved-run reader.
// All gameplay actions below use keyboard or touch controls, not internal setters.
const production = process.argv.includes("--production");
const server = production
  ? await preview({
      preview: { host: "127.0.0.1", port: 5175, strictPort: true },
    })
  : await createServer({
      server: { host: "127.0.0.1", port: 5175, strictPort: true },
    });
if (!production) await server.listen();
const browser = await chromium
  .launch({
    channel: process.env.RAINKEEP_BROWSER_CHANNEL || "chrome",
    headless: true,
  })
  .catch(async (error) => {
    if (production)
      await new Promise((resolve) => server.httpServer.close(resolve));
    else await server.close();
    throw error;
  });
const root = "http://127.0.0.1:5175/";
const output = "output/playwright/rework";
await mkdir(output, { recursive: true });
const results = [],
  errors = [];
let active;
const ok = (label, condition = true) => {
  assert.ok(condition, label);
  results.push(label);
  if (!label.includes(":")) console.log("✓ " + label);
};
async function open({
  fixture,
  width = 390,
  height = 650,
  canvas = false,
  reduced = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width < 1000,
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  active = page;
  page.on("pageerror", (e) => errors.push(e.message));
  if (fixture)
    await page.addInitScript((s) => {
      if (!sessionStorage.getItem("test-seeded")) {
        localStorage.setItem("rainkeep.run.v1", JSON.stringify(s));
        sessionStorage.setItem("test-seeded", "yes");
      }
    }, fixture);
  await page.goto(root + (canvas ? "?graphics=canvas" : ""));
  await page.locator("#start").waitFor();
  return { page, context };
}
const state = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("rainkeep.run.v1")));
async function play(page) {
  await page.locator("#start").tap();
  await page.waitForFunction(() => document.querySelector("#overlay").hidden);
}
async function aim(page, x, y) {
  const s = await state(page);
  await page.locator("#board").focus();
  for (const [delta, positive, negative] of [
    [x - s.aim.x, "ArrowRight", "ArrowLeft"],
    [y - s.aim.y, "ArrowDown", "ArrowUp"],
  ]) {
    const key = delta >= 0 ? positive : negative;
    for (let n = 0; n < Math.floor(Math.abs(delta) + 1e-6); n++)
      await page.keyboard.press("Shift+" + key);
    const rest = Math.abs(delta) - Math.floor(Math.abs(delta) + 1e-6);
    for (let n = 0; n < Math.round(rest / 0.2); n++)
      await page.keyboard.press(key);
  }
}
async function drop(page, x, y) {
  if (x !== undefined) await aim(page, x, y);
  const turn = (await state(page)).turn;
  await page.locator("#drop").tap();
  await page.waitForFunction(
    (n) => JSON.parse(localStorage.getItem("rainkeep.run.v1")).turn > n,
    turn,
  );
  await page.waitForTimeout(700);
}
async function fit(page, label) {
  const v = await page.evaluate(() => {
    const selectors = [
      "#rotate",
      "#drop",
      "#precision-toggle",
      ".objective-row",
      ".risk-rail",
      "#piece-desc",
      "#upcoming",
    ];
    return {
      width: innerWidth,
      height: innerHeight,
      scroll: document.documentElement.scrollWidth,
      items: selectors.map((q) => {
        const e = document.querySelector(q),
          r = e.getBoundingClientRect();
        return {
          q,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          bottom: r.bottom,
          right: r.right,
          font: parseFloat(getComputedStyle(e).fontSize),
          visible: !!(r.width && r.height),
        };
      }),
    };
  });
  for (const e of v.items.filter((x) => x.visible))
    ok(
      `${label}: ${e.q} fits`,
      e.x >= -1 &&
        e.y >= -1 &&
        e.right <= v.width + 1 &&
        e.bottom <= v.height + 1,
    );
  ok(`${label}: no horizontal scrolling`, v.scroll <= v.width);
  ok(
    `${label}: readable instruction`,
    v.items.find((x) => x.q === "#piece-desc").font >= 14,
  );
  for (const q of ["#rotate", "#drop", "#precision-toggle"]) {
    const e = v.items.find((x) => x.q === q);
    if (e.visible) ok(`${label}: ${q} touch target`, e.h >= 44 && e.w >= 44);
  }
}
try {
  {
    const { page, context } = await open({ height: 844 });
    ok(
      "first launch recommends First Pond",
      (await page.locator("#start").innerText()).includes("First Pond"),
    );
    await page.screenshot({ path: output + "/welcome.png" });
    await play(page);
    ok(
      "first launch starts the recommended island",
      (await state(page)).campaign.id === 0,
    );
    await fit(page, "390x844");
    await page.screenshot({ path: output + "/first-pond.png" });
    await drop(page);
    ok(
      "bank progress advances to filling",
      (await page.locator("#piece-desc").innerText()).includes("Water"),
    );
    await drop(page, 15, 15);
    await page.waitForFunction(() =>
      document
        .querySelector("#placement-text")
        .textContent.includes("Evaporates"),
    );
    ok(
      "Fire identifies its actual connected lake",
      (await page.locator("#placement-text").innerText()).includes(
        "Evaporates",
      ),
    );
    await page.screenshot({ path: output + "/fire-preview.png" });
    await drop(page, 15, 15);
    ok(
      "first lesson completes through normal controls",
      (await state(page)).campaign.status === "complete",
    );
    ok(
      "completion keeps island visible",
      await page.locator("#overlay").isHidden(),
    );
    ok(
      "completion explains medals",
      (await page.locator("#result-detail").innerText()).includes("15%"),
    );
    await page.reload();
    ok(
      "completed run and medals survive reload",
      (await state(page)).campaign.status === "complete" &&
        (await page.locator("#overlay").isHidden()),
    );
    await page.locator("#drop").tap();
    await page.waitForTimeout(200);
    ok(
      "Next directly starts the next island",
      (await state(page)).campaign.id === 1,
    );
    await page.locator("#pause").tap();
    const elapsed = (await state(page)).elapsed;
    await page.waitForTimeout(350);
    ok("pause stops simulation", (await state(page)).elapsed === elapsed);
    await page.locator("#campaign-menu").tap();
    ok(
      "all Home stages selectable",
      (await page.locator("#stage-picker button:disabled").count()) === 0,
    );
    await page.locator("[data-region=meadow]").tap();
    ok(
      "Meadow accessible without completing Home",
      (await page.locator("#stage-picker button:disabled").count()) === 0,
    );
    await page.locator('[data-stage="15"]').tap();
    await play(page);
    ok(
      "advanced island starts directly",
      (await state(page)).campaign.id === 15,
    );
    ok(
      "advanced island gives contextual guidance",
      (await page.locator("#piece-desc").innerText()).includes("opening"),
    );
    await context.close();
  }
  for (const [width, height] of [
    [320, 568],
    [390, 650],
    [844, 390],
    [1440, 900],
  ]) {
    const { page, context } = await open({
      fixture: createStage(0),
      width,
      height,
    });
    await play(page);
    await fit(page, `${width}x${height}`);
    await page.screenshot({ path: `${output}/layout-${width}x${height}.png` });
    await page.locator("#precision-toggle").tap();
    await fit(page, `${width}x${height} fine controls`);
    const before = (await state(page)).aim;
    await page.locator('[data-nudge="1,0"]').tap();
    ok(`${width}x${height}: fine nudge`, (await state(page)).aim.x > before.x);
    await page.locator("#help").tap();
    ok(
      `${width}x${height}: Help scrolls`,
      await page.locator(".instructions").isVisible(),
    );
    await page.locator("#start").tap();
    ok(
      `${width}x${height}: return from Help`,
      await page.locator("#overlay").isHidden(),
    );
    await context.close();
  }
  {
    const { page, context } = await open({
      fixture: createStage(0),
      height: 844,
    });
    await play(page);
    const cdp = await context.newCDPSession(page),
      r = await page.locator("#board").boundingBox();
    const point = {
      x: r.x + r.width * 0.5,
      y: r.y + r.height * 0.6,
      id: 1,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    };
    const before = (await state(page)).aim;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, x: point.x + 35 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const after = (await state(page)).aim;
    ok(
      "real touch drag changes continuous aim",
      Math.abs(after.x - before.x) > 0.1,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    ok(
      "re-touch preserves aim",
      JSON.stringify((await state(page)).aim) === JSON.stringify(after),
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await page.setViewportSize({ width: 390, height: 780 });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    ok(
      "resize while steering preserves aim",
      JSON.stringify((await state(page)).aim) === JSON.stringify(after),
    );
    const action = await page.locator("#rotate").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        point,
        {
          x: action.x + action.width / 2,
          y: action.y + action.height / 2,
          id: 2,
        },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    ok(
      "second thumb rotates while steering",
      (await state(page)).current.rotation === 1,
    );
    await context.close();
  }
  {
    const { page, context } = await open({ fixture: createStage(3) });
    await play(page);
    await drop(page);
    ok(
      "repair uses the real connected opening",
      !(await state(page)).holes.some(Boolean),
    );
    await page.screenshot({ path: output + "/repaired.png" });
    await context.close();
  }
  {
    const fixture = createStage(0);
    fixture.spill = LIMIT - 0.1;
    fixture.water[0] = 50;
    const { page, context } = await open({ fixture });
    await play(page);
    await page.waitForFunction(
      () => document.querySelector(".app").dataset.result === "true",
    );
    ok(
      "failure preserves visible island",
      await page.locator("#overlay").isHidden(),
    );
    ok(
      "failure explains drain",
      (await page.locator("#piece-desc").innerText()).includes("drain"),
    );
    await page.locator("#rotate").tap();
    await page.waitForTimeout(250);
    ok(
      "one-tap Retry resets the failed stage",
      !(await state(page)).over && (await state(page)).turn === 0,
    );
    await context.close();
  }
  {
    const { page, context } = await open({ fixture: createStage(12) });
    await play(page);
    await drop(page, 11, 6);
    await drop(page, 15, 15);
    await drop(page, 0, 24);
    // Slower renderers may reach natural rain while the bank is being built.
    // Wait for a dry phase, then require a new complete shower after the tap.
    await page.locator("#bring-rain").waitFor({
      state: "visible",
      timeout: 90000,
    });
    const keptBefore = (await state(page)).campaign.keptShowers;
    await page.locator("#bring-rain").tap();
    const phase = (await state(page)).weather.clock % 64;
    ok("Bring rain begins the cloud warning", phase >= 18 && phase < 26);
    await page.waitForFunction(
      (previous) =>
        JSON.parse(localStorage.getItem("rainkeep.run.v1")).campaign
          .keptShowers > previous,
      keptBefore,
      { timeout: 90000 },
    );
    await drop(page, 15, 15);
    ok(
      "full shower challenge completes through controls",
      (await state(page)).campaign.status === "complete",
    );
    await page.screenshot({ path: output + "/meadow-kept.png" });
    await context.close();
  }
  {
    const fixture = createGame("daydream", 31);
    fixture.spill = 480;
    const { page, context } = await open({ fixture });
    await play(page);
    await drop(page, 15, 15);
    await drop(page, 15, 15);
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("rainkeep.run.v1")).growth.charms > 0,
    );
    const grown = await state(page);
    ok(
      "real scoring earns a visible score chapter and rain charms",
      grown.growth.milestone > 0 &&
        !(await page.locator("#growth-progress").isHidden()),
    );
    ok(
      "contained clears feed permanent discoveries",
      (
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("rainkeep.keeper.v1")),
        )
      ).discoveries.includes("lake"),
    );
    await fit(page, "growing Daydream");
    await page.locator("#rain-charm").tap();
    const spent = await state(page);
    ok(
      "rain charm clears real drain and spends exactly one reward",
      Math.abs(spent.spill - Math.max(0, grown.spill - 160)) < 0.1 &&
        spent.growth.charms === grown.growth.charms - 1,
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#growth-banner").hidden &&
        !document.querySelector("#toast").classList.contains("visible"),
    );
    await page.screenshot({ path: output + "/growing-haven.png" });
    await page.locator("#keeper-link").tap();
    const elapsed = (await state(page)).elapsed;
    ok(
      "journal shows permanent rank and collected discoveries",
      (await page.locator(".keeper-card").isVisible()) &&
        (await page.locator(".discovery.earned").count()) > 0,
    );
    await page.waitForTimeout(300);
    ok("journal pauses the landscape", (await state(page)).elapsed === elapsed);
    await page.screenshot({ path: output + "/keeper-journal.png" });
    await page.locator("#journal-close").tap();
    await page.waitForFunction(() => document.querySelector("#overlay").hidden);
    const profile = await page.evaluate(() =>
      localStorage.getItem("rainkeep.keeper.v1"),
    );
    await page.reload();
    await play(page);
    ok(
      "reload preserves spent charms and does not award growth twice",
      (await state(page)).growth.charms === spent.growth.charms &&
        (await page.evaluate(() =>
          localStorage.getItem("rainkeep.keeper.v1"),
        )) === profile,
    );
    await context.close();
  }
  for (const [width, height, canvas] of [
    [320, 568, false],
    [390, 844, false],
    [844, 390, false],
    [390, 650, true],
  ]) {
    const fixture = createGame("daydream", 23);
    fixture.score = 70000;
    advanceGrowth(fixture);
    fixture.spill = 180;
    const { page, context } = await open({
      fixture,
      width,
      height,
      canvas,
      reduced: true,
    });
    await play(page);
    await fit(
      page,
      `late haven ${width}x${height} ${canvas ? "Canvas" : "WebGL"}`,
    );
    ok(
      `late haven ${width}: reward control fits`,
      await page.locator("#rain-charm").evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width >= 44 &&
          r.height >= 44 &&
          r.right <= innerWidth &&
          r.bottom <= innerHeight
        );
      }),
    );
    await page.waitForFunction(
      () => !document.querySelector("#toast").classList.contains("visible"),
    );
    await page.screenshot({
      path: `${output}/late-haven-${width}-${canvas ? "canvas" : "webgl"}.png`,
    });
    await page.locator("#keeper-link").tap();
    ok(
      `late haven ${width}: journal fits without horizontal scrolling`,
      await page.evaluate(
        () =>
          document.querySelector(".modal").scrollWidth <=
          document.querySelector(".modal").clientWidth + 1,
      ),
    );
    await page.locator("#journal-close").tap();
    await context.close();
  }
  {
    const { page, context } = await open({
      fixture: createGame("daydream", 7, 2),
    });
    await play(page);
    ok(
      "earlier three-piece runs retain their original balance",
      (await state(page)).version === 4 &&
        (await state(page)).growth === undefined &&
        (await page.locator("#rain-charm").isHidden()),
    );
    await context.close();
  }
  for (const canvas of [false, true]) {
    const { page, context } = await open({
      fixture: createGame("daydream", 123),
      canvas,
      reduced: true,
    });
    await play(page);
    ok(
      `${canvas ? "Canvas" : "WebGL"}: actual three-piece queue`,
      (await page.locator(".queue-piece").count()) === 3,
    );
    await drop(page, 15, 15);
    await drop(page, 15, 15);
    ok(
      `${canvas ? "Canvas" : "WebGL"}: Daydream scores early`,
      (await state(page)).score > 100,
    );
    await page.reload();
    await play(page);
    ok(
      `${canvas ? "Canvas" : "WebGL"}: v5 reload`,
      (await state(page)).version === 5,
    );
    await page.locator("#sound").tap();
    ok(
      `${canvas ? "Canvas" : "WebGL"}: sound preference`,
      (await page.evaluate(() => localStorage.getItem("rainkeep.sound"))) ===
        "on",
    );
    await page.locator("#sound").tap();
    await page.screenshot({
      path: `${output}/${canvas ? "canvas" : "webgl"}-daydream.png`,
    });
    if (production && !canvas) {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await context.setOffline(true);
      await page.reload();
      ok("production offline reload", await page.locator("#start").isVisible());
      await context.setOffline(false);
    }
    await context.close();
  }
  {
    const fixture = createGame("daydream", 123, 1);
    const { page, context } = await open({ fixture });
    await play(page);
    ok(
      "legacy run keeps one truthful upcoming piece",
      (await page.locator(".queue-piece").count()) === 1,
    );
    await drop(page, 0, 0);
    await page.reload();
    await play(page);
    ok(
      "legacy run keeps version and state",
      (await state(page)).version === 3 && (await state(page)).turn === 1,
    );
    await context.close();
  }
  for (let id = 0; id < 16; id++) {
    const { page, context } = await open({
      fixture: createStage(id),
      width: 320,
      height: 568,
    });
    await play(page);
    await fit(page, `island ${id + 1} at 320x568`);
    await context.close();
  }
  {
    const fixture = createStage(8);
    fixture.mines = [];
    const { page, context } = await open({ fixture, width: 320, height: 568 });
    await play(page);
    await page.waitForFunction(
      () => document.querySelector(".app").dataset.result === "true",
    );
    await fit(page, "mine failure at 320x568");
    await context.close();
  }
  {
    const { page, context } = await open({
      fixture: createStage(0),
      height: 844,
    });
    await play(page);
    await page.evaluate(() => {
      window.testLoss = document
        .querySelector("#board")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context");
      window.testLoss.loseContext();
    });
    await page.waitForFunction(
      () => !document.querySelector("#overlay").hidden,
    );
    ok(
      "graphics context loss pauses and retains the run",
      (await state(page)).campaign.id === 0,
    );
    await page.waitForTimeout(300);
    await page.evaluate(() => window.testLoss.restoreContext());
    await page.waitForTimeout(500);
    await page.locator("#start").tap();
    await drop(page);
    ok(
      "graphics restoration retains playable controls",
      (await state(page)).turn === 1,
    );
    if (!production) {
      const initial = await page.evaluate(
        () => window.__rainkeep.graphics.geometries,
      );
      for (let n = 0; n < 12; n++) {
        await page.locator("#view").tap();
        await aim(page, 12 + (n % 4), 12);
      }
      const after = await page.evaluate(() => window.__rainkeep.graphics);
      ok(
        "preview GPU resources remain bounded",
        after.geometries <= initial + 3 && after.previewCells <= 1024,
      );
    }
    await context.close();
  }
  ok("no browser exceptions", errors.length === 0);
  await writeFile(
    output + (production ? "/production.json" : "/development.json"),
    JSON.stringify(
      {
        production,
        checkedAt: new Date().toISOString(),
        passed: results.length,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `${results.length} browser checks passed (${production ? "production" : "development"}).`,
  );
} catch (error) {
  if (active && !active.isClosed())
    await active
      .screenshot({ path: output + "/failure.png", fullPage: true })
      .catch(() => {});
  const failure = {
    production,
    checkedAt: new Date().toISOString(),
    passed: results.length,
    last: results.at(-1),
    errors,
    failure: String(error),
    savedState:
      active && !active.isClosed()
        ? await state(active).catch(() => null)
        : null,
  };
  await writeFile(
    output + (production ? "/production.json" : "/development.json"),
    JSON.stringify(failure, null, 2),
  );
  console.error(JSON.stringify(failure, null, 2));
  throw error;
} finally {
  await browser.close();
  if (production)
    await new Promise((resolve) => server.httpServer.close(resolve));
  else await server.close();
}
