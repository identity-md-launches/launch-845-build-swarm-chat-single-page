import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import {
  bounded,
  channelFor,
  panelEvents,
  submissionEvents,
  validText,
  safeHttps,
} from "../src/data.ts";
const require = createRequire(import.meta.url);
const paths = [process.env.SWARM_DEPENDENCIES || process.cwd()];
const { chromium } = require(require.resolve("playwright", { paths }));
const AxeBuilder = require(
  require.resolve("@axe-core/playwright", { paths }),
).default;
const scratch = path.resolve("test/scratch/fixtures");
await fs.mkdir(scratch, { recursive: true });
await fs.mkdir("artifacts", { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function captured(name, endpoint) {
  const file = path.join(scratch, name + ".json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  await pause(750);
  const response = await fetch("https://api.imd.fun" + endpoint);
  assert(response.ok, `Capture ${endpoint}: HTTP ${response.status}`);
  const data = await response.json();
  await fs.writeFile(file, JSON.stringify(data));
  return data;
}
let { jobs } = await captured("jobs", "/jobs?limit=30");
jobs = jobs.filter((j) => j.template !== "research").slice(0, 9);
const panels = await captured("panels", "/research/panels");
const swarm = await captured("swarm", "/swarm");
const submissions = {};
for (const job of jobs)
  submissions[job.id] = await captured(job.id, `/jobs/${job.id}/submissions`);
assert(
  Object.values(submissions).some((d) =>
    d.submissions.some((s) => validText(s.summary)),
  ),
  "Real agent messages available for interaction checks",
);
const evidence = {
  testedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  contrast: {},
  errors: [],
  firstMessageMs: null,
  live: null,
};
function pass(name) {
  evidence.checks.push(name);
  console.log("PASS", name);
}
// Pure data properties use captured agent text; no fabricated conversation is shipped.
const rawMessages = jobs.flatMap((j) =>
  submissionEvents(j, submissions[j.id].submissions),
);
assert(rawMessages.length > 0);
for (const e of rawMessages)
  assert(submissions[e.groupId].submissions.some((s) => s.summary === e.text));
assert(rawMessages.some((e) => e.channel === "audits"));
assert(rawMessages.some((e) => e.channel === "builds"));
assert.equal(
  channelFor({ ...jobs[0], template: "skill:oracle-assess" }),
  "oracle",
);
assert.equal(channelFor({ ...jobs[0], template: "research" }), "research");
assert.equal(channelFor(jobs[0], { nodeKey: "audit_security" }), "audits");
assert(!validText("  This seat produced no answer for this panel"));
assert(!validText(" "));
assert(!safeHttps("javascript:alert(1)"));
assert(!safeHttps("http://example.com"));
const p = panels.panels.find((p) => p.answers.length > 1 && p.closedAt);
assert(p);
const research = panelEvents(p).events.filter((e) => e.kind === "message");
assert(
  research.every(
    (e) =>
      e.timestamp > Date.parse(p.askedAt) &&
      e.timestamp < Date.parse(p.closedAt),
  ),
);
assert(research.every((e) => p.answers.some((a) => a.answer === e.text)));
const many = Array.from({ length: 1200 }, (_, i) => ({
  ...rawMessages[0],
  id: String(i),
  timestamp: i,
}));
assert.equal(bounded(many).length, 1000);
assert.equal(bounded(many)[0].timestamp, 200);
assert.equal(
  bounded([...rawMessages, ...rawMessages]).length,
  rawMessages.length,
);
pass(
  "Exact source text; channels; no-answer removal; HTTPS-only links; estimated panel times; deduplication and 1,000-event cap",
);
const root = path.resolve("dist");
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith("/preview/")) {
    res.writeHead(404).end();
    return;
  }
  const file = path.resolve(root, pathname.slice(9) || "index.html");
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  try {
    const content = await fs.readFile(file);
    res
      .writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "text/plain",
      })
      .end(content);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SWARM_LOW_RESOURCE
    ? {
        args: ["--single-process", "--no-zygote", "--disable-gpu"],
        env: { ...process.env, XDG_CONFIG_HOME: "/tmp/swarm-chromium-config" },
      }
    : {}),
  ...(process.env.SWARM_CHROMIUM
    ? { executablePath: process.env.SWARM_CHROMIUM }
    : {}),
});
try {
  // The live check uses real cross-origin browser fetches, with no interception.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const live = await context.newPage();
  const liveErrors = [];
  live.on("console", (m) => {
    if (m.type() === "error") liveErrors.push(m.text());
  });
  await live.goto(url);
  await live.waitForTimeout(9000);
  evidence.live = {
    messages: await live.locator(".message").count(),
    status: await live.locator(".connection").innerText(),
    browserErrors: [...liveErrors],
  };
  await live.screenshot({
    path: "artifacts/live-desktop.jpg",
    type: "jpeg",
    quality: 78,
  });
  evidence.screenshots.push("artifacts/live-desktop.jpg");
  assert(
    evidence.live.messages > 0 ||
      (await live.getByText(/browser access \(CORS\)/i).count()) > 0,
    "Live messages or explicit CORS explanation",
  );
  assert(
    (await live.locator(".working-count").innerText()) !== "—",
    "Independent /swarm request succeeds",
  );
  pass(
    "Live browser: explicit CORS failure, useful independently loaded working-agent list",
  );
  await live.goto("about:blank");
  const page = live;
  const runtimeErrors = [];
  const failedAssets = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      failedAssets.push(r.url());
  });
  const requested = [];
  let failApi = false;
  let emptyApi = false;
  const changeJob = jobs.find((j) => submissions[j.id].submissions.length > 2);
  assert(changeJob);
  const original = submissions[changeJob.id].submissions;
  let reveal = false;
  const researchJob = {
    ...jobs[0],
    id: p.jobId,
    template: "research",
    objective: p.question,
  };
  await page.route("https://api.imd.fun/**", async (route) => {
    const u = new URL(route.request().url());
    requested.push({ pathname: u.pathname, at: Date.now() });
    if (failApi) {
      await route.abort("failed");
      return;
    }
    let data;
    if (emptyApi)
      data =
        u.pathname === "/jobs"
          ? { jobs: [] }
          : u.pathname === "/research/panels"
            ? { panels: [] }
            : { seats: {} };
    else if (u.pathname === "/jobs")
      data = {
        jobs: [
          ...jobs.map((j) =>
            j.id === changeJob.id && reveal
              ? { ...j, updatedAt: "2026-10-06T23:59:00Z" }
              : j,
          ),
          researchJob,
        ],
      };
    else if (u.pathname === "/research/panels") data = panels;
    else if (u.pathname === "/swarm") data = swarm;
    else {
      const id = u.pathname.split("/")[2];
      assert(submissions[id], `Unexpected submissions fetch: ${id}`);
      data =
        id === changeJob.id
          ? {
              ...submissions[id],
              submissions: reveal ? original : original.slice(0, -1),
            }
          : submissions[id];
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.clock.install();
  const start = Date.now();
  await page.goto(url);
  await page.locator(".message").first().waitFor({ timeout: 10_000 });
  evidence.firstMessageMs = Date.now() - start;
  await page.waitForFunction(() =>
    document.querySelector(".connection")?.textContent?.includes("Live"),
  );
  pass(
    `Real captured API messages render within 10 seconds (${evidence.firstMessageMs} ms)`,
  );
  assert(!requested.some((r) => r.pathname === `/jobs/${p.jobId}/submissions`));
  assert(
    requested.slice(1).every((r, i) => r.at - requested[i].at >= 600),
    "Requests are staggered",
  );
  const before = requested.filter((r) =>
    r.pathname.includes("submissions"),
  ).length;
  await page.clock.fastForward(60_000);
  await page.waitForTimeout(2200);
  assert.equal(
    requested.filter((r) => r.pathname.includes("submissions")).length,
    before,
  );
  assert(requested.filter((r) => r.pathname === "/jobs").length >= 2);
  pass(
    "60-second polling; unchanged updatedAt avoids re-fetch; exact research template skipped; request staggering",
  );
  reveal = true;
  await page.clock.fastForward(60_000);
  await page.waitForTimeout(3500);
  assert.equal(
    requested.filter((r) => r.pathname.includes("submissions")).length,
    before + 1,
  );
  assert.equal(
    requested.filter((r) => r.pathname === `/jobs/${changeJob.id}/submissions`)
      .length,
    2,
  );
  pass("Changed updatedAt re-fetches exactly one job without reloading");
  for (const channel of ["builds", "audits", "research", "oracle"]) {
    await page
      .getByRole("button", { name: new RegExp(`# ${channel}`) })
      .click();
    const tags = await page
      .locator(".job-divider .channel-tag")
      .allTextContents();
    assert(tags.length && tags.every((t) => t === `#${channel}`));
  }
  await page.getByRole("button", { name: /All channels/ }).click();
  const id = rawMessages[0].tokenId;
  await page.getByRole("textbox", { name: "Filter by agent number" }).fill(id);
  const names = await page.locator(".message .agent-name").allTextContents();
  assert(names.length && names.every((n) => n === `IMD #${id}`));
  await page
    .getByRole("textbox", { name: "Filter by agent number" })
    .fill("9999999999");
  await page
    .getByRole("heading", { name: "No messages match this filter." })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(await page.getByRole("textbox").inputValue(), "");
  pass(
    "All four channels, exact agent filtering, no-results state and clear filters",
  );
  const more = page.getByRole("button", { name: "Show more" }).first();
  await more.click();
  const less = page.getByRole("button", { name: "Show less" }).first();
  assert.equal(await less.getAttribute("aria-expanded"), "true");
  await less.click();
  const verdict = page.locator(".verdict").first();
  await verdict.locator("summary").click();
  assert((await verdict.getAttribute("open")) !== null);
  const hrefs = await page
    .locator(".message a,.job-divider a,.system-line a")
    .evaluateAll((links) => links.map((l) => l.href));
  assert(hrefs.every((h) => h.startsWith("https://")));
  await page.getByRole("button", { name: /# research/ }).click();
  assert((await page.locator(".pick.long").count()) > 0);
  assert((await page.locator(".pick.short").count()) > 0);
  await page.getByRole("button", { name: /All channels/ }).click();
  pass(
    "Long-text disclosure, verdict details, source links, long/short PICKS chips",
  );
  // Keyboard navigation and focus, including the native skip link.
  await page.locator(".brand").focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Skip to chat",
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "chat");
  await page.getByRole("button", { name: /# builds/ }).focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("button", { name: /# builds/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  const focus = await page
    .getByRole("button", { name: /# builds/ })
    .evaluate((el) => ({
      outline: getComputedStyle(el).outlineStyle,
      width: getComputedStyle(el).outlineWidth,
    }));
  assert.equal(focus.outline, "solid");
  assert.equal(focus.width, "2px");
  await page.screenshot({
    path: "artifacts/keyboard-focus.jpg",
    type: "jpeg",
    quality: 78,
  });
  evidence.screenshots.push("artifacts/keyboard-focus.jpg");
  pass("Keyboard skip link, channel activation, visible focus CSS");
  await page.getByRole("button", { name: /All channels/ }).click();
  async function overflow(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px horizontal overflow`,
    );
  }
  for (const [w, h] of [
    [1440, 1000],
    [1024, 900],
    [820, 1000],
    [400, 860],
    [320, 800],
  ])
    await overflow(w, h);
  await overflow(1440, 1000);
  const lightAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  evidence.lightAxe = lightAudit.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target),
  }));
  assert.equal(
    lightAudit.violations.length,
    0,
    JSON.stringify(evidence.lightAxe),
  );
  await page
    .locator(".stream")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.screenshot({
    path: "artifacts/chat-desktop.jpg",
    type: "jpeg",
    quality: 78,
  });
  evidence.screenshots.push("artifacts/chat-desktop.jpg");
  await page.getByRole("button", { name: /# research/ }).click();
  const researchAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.equal(
    researchAudit.violations.length,
    0,
    JSON.stringify(
      researchAudit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  pass("Research message and PICKS contrast passes axe");
  await page.getByRole("button", { name: /All channels/ }).click();
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    display: document.fonts.check('600 24px "Bricolage Grotesque"'),
    body: document.fonts.check('400 16px "IBM Plex Sans"'),
    mono: document.fonts.check('400 12px "IBM Plex Mono"'),
  }));
  assert(Object.values(fonts).every(Boolean));
  evidence.fonts = fonts;
  const pairs = async () =>
    page.evaluate(() => {
      function pair(sel, bgSel) {
        const s = getComputedStyle(document.querySelector(sel));
        const b = getComputedStyle(document.querySelector(bgSel));
        return [s.color, b.backgroundColor];
      }
      return {
        body: pair(".rich-text", ".chat-panel"),
        secondary: pair(".model", ".chat-panel"),
        link: pair(".rich-text a", ".chat-panel"),
        accepted: pair(
          ".verdict.accepted summary",
          ".verdict.accepted summary",
        ),
        accent: pair(".channel-button.selected", ".channel-button.selected"),
      };
    });
  evidence.contrast.light = await pairs();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  evidence.contrast.dark = await pairs();
  const darkAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  evidence.darkAxe = darkAudit.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target),
  }));
  assert.equal(
    darkAudit.violations.length,
    0,
    JSON.stringify(evidence.darkAxe),
  );
  await page.screenshot({
    path: "artifacts/chat-dark.jpg",
    type: "jpeg",
    quality: 78,
  });
  evidence.screenshots.push("artifacts/chat-dark.jpg");
  await overflow(400, 860);
  await page
    .locator(".stream")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.screenshot({
    path: "artifacts/chat-mobile-dark.jpg",
    type: "jpeg",
    quality: 78,
  });
  evidence.screenshots.push("artifacts/chat-mobile-dark.jpg");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.screenshot({
    path: "artifacts/chat-mobile.jpg",
    type: "jpeg",
    quality: 78,
  });
  evidence.screenshots.push("artifacts/chat-mobile.jpg");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert(
    await page
      .getByRole("button", { name: "Play mascot rotation" })
      .isDisabled(),
  );
  const imageBefore = await page.locator(".mascot img").getAttribute("src");
  await page.clock.fastForward(20_000);
  assert.equal(
    await page.locator(".mascot img").getAttribute("src"),
    imageBefore,
  );
  pass(
    "Light/dark themes; 1440/1024/820/400/320px reflow; zero axe violations in both desktop themes; reduced-motion mascot pause",
  );
  // Text scaling is separate from browser-native zoom.
  await page.addStyleTag({ content: "html { font-size: 32px !important }" });
  await overflow(400, 860);
  pass("200% root font-size text enlargement reflows at 400px");
  failApi = true;
  await page.clock.fastForward(60_000);
  await page.waitForTimeout(2200);
  await page
    .getByText("Some updates are unavailable.", { exact: false })
    .waitFor();
  assert((await page.locator(".message").count()) > 0);
  pass(
    "Failed refresh retains last received messages and announces reconnecting",
  );
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("swarm-theme")),
    "dark",
  );
  failApi = false;
  emptyApi = true;
  await page.reload();
  await page
    .getByRole("heading", { name: "Waiting for the next write-up." })
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  emptyApi = false;
  failApi = true;
  await page.reload();
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .waitFor();
  await page.clock.fastForward(10_000);
  failApi = false;
  await page
    .getByRole("button", { name: "Retry connection", exact: true })
    .click();
  await page.locator(".message").first().waitFor({ timeout: 10_000 });
  pass(
    "Theme persists across reload; healthy empty state; manual retry restores real captured messages",
  );
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(failedAssets, []);
  evidence.errors = runtimeErrors;
  pass(
    "No application exceptions or failed local assets; relative /preview/ export loads",
  );
  await page.close();
} finally {
  await browser.close();
  server.close();
  const luminance = (color) =>
    color
      .match(/\d+/g)
      .slice(0, 3)
      .map(Number)
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  evidence.contrastRatios = Object.fromEntries(
    Object.entries(evidence.contrast).map(([theme, pairs]) => [
      theme,
      Object.fromEntries(
        Object.entries(pairs).map(([name, [foreground, background]]) => {
          const a = luminance(foreground);
          const b = luminance(background);
          return [
            name,
            Number(
              ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2),
            ),
          ];
        }),
      ),
    ]),
  );
  await fs.writeFile(
    "artifacts/check-results.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
