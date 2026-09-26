#!/usr/bin/env node
// Replay native browser media checks without installing application dependencies.
// Usage: node playback-smoke.mjs <bundle-dir> <playwright-package.json> <evidence-dir> [--loops 1..3] [--serve]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";

const args = process.argv.slice(2);
const positional = [];
let serve = false;
let requiredLoops = 1;
let loopsProvided = false;
const usage = () => {
  console.error(
    "Usage: node playback-smoke.mjs <bundle-dir> <playwright-package.json> <evidence-dir> [--loops 1..3] [--serve]",
  );
  process.exit(2);
};
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--") {
    positional.push(...args.slice(index + 1));
    break;
  }
  if (arg === "--serve") {
    if (serve) usage();
    serve = true;
  } else if (arg === "--loops" || arg.startsWith("--loops=")) {
    if (loopsProvided) usage();
    const value = arg === "--loops" ? args[++index] : arg.slice(8);
    if (!/^[1-3]$/.test(value ?? "")) usage();
    requiredLoops = Number(value);
    loopsProvided = true;
  } else if (arg.startsWith("-")) {
    usage();
  } else {
    positional.push(arg);
  }
}
if (positional.length !== 3) usage();
const [bundleArgument, packageArgument, evidenceArgument] = positional;
const bundle = await realpath(resolve(bundleArgument));
const evidence = resolve(evidenceArgument);
const packageFile = resolve(packageArgument);
const packageInfo = JSON.parse(await readFile(packageFile, "utf8"));
assert.ok(
  ["@playwright/test", "playwright"].includes(packageInfo.name),
  "Supply an installed Playwright package.json.",
);
const { chromium } = createRequire(packageFile)(packageInfo.name);
const manifestBytes = await readFile(resolve(bundle, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.ok(Array.isArray(manifest.assets));
const roles = ["primary", "compact", "alternate", "poster"];
const mimeByRole = {
  primary: "video/mp4",
  compact: "video/mp4",
  alternate: "video/webm",
  poster: "image/webp",
};
const assets = [];
for (const role of roles) {
  const matches = manifest.assets.filter((asset) => asset.role === role);
  assert.equal(
    matches.length,
    1,
    `Manifest must contain exactly one ${role} asset.`,
  );
  const asset = matches[0];
  assert.match(asset.filename, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
  assert.equal(asset.mimeType, mimeByRole[role]);
  assert.match(asset.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0);
  assert.ok(Number.isSafeInteger(asset.width) && asset.width > 0);
  assert.ok(Number.isSafeInteger(asset.height) && asset.height > 0);
  if (role !== "poster")
    assert.ok(
      Number.isFinite(asset.durationSeconds) &&
        asset.durationSeconds > 4 &&
        asset.durationSeconds <= 600,
      "Video duration must be greater than 4 and at most 600 seconds.",
    );
  const file = await realpath(resolve(bundle, asset.filename));
  assert.ok(
    file.startsWith(bundle + sep),
    "Media must resolve inside the bundle directory.",
  );
  assets.push({ ...asset, file });
}
assert.equal(
  new Set(assets.map((asset) => asset.filename)).size,
  assets.length,
);
const byRole = new Map(assets.map((asset) => [asset.role, asset]));
const byName = new Map(assets.map((asset) => [asset.filename, asset]));
const fingerprint = async (asset) => {
  const before = await stat(asset.file);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(asset.file)) hash.update(chunk);
  const after = await stat(asset.file);
  assert.equal(after.size, before.size, "File size changed while hashing.");
  assert.equal(
    after.mtimeMs,
    before.mtimeMs,
    "File timestamp changed while hashing.",
  );
  return {
    role: asset.role,
    filename: asset.filename,
    bytes: after.size,
    lastWriteTimeUtc: after.mtime.toISOString(),
    sha256: hash.digest("hex"),
  };
};
const beforeFiles = await Promise.all(assets.map(fingerprint));
for (const file of beforeFiles) {
  const expected = byRole.get(file.role);
  assert.equal(
    file.bytes,
    expected.bytes,
    `${file.role} size differs from manifest.`,
  );
  assert.equal(
    file.sha256,
    expected.sha256,
    `${file.role} SHA-256 differs from manifest.`,
  );
}
const publicAssets = assets.map(({ role, filename }) => ({ role, filename }));
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Valkyria — Media QA</title>
<style>*{box-sizing:border-box}body{margin:0;background:#10110f;color:#eee8db;font-family:Arial,sans-serif}header{padding:28px 40px;border-bottom:1px solid #78633b}h1{font-size:25px;margin:0 0 8px;letter-spacing:3px}p{margin:0;color:#bdb5a4;font-size:14px;line-height:1.55}.tag{color:#e7b650;font-size:12px;letter-spacing:2px;margin-bottom:12px}main{padding:26px 40px}.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap}select{max-width:100%;padding:10px 12px;background:#24251f;color:#fff;border:1px solid #71694f;font-size:14px}.frame{max-width:1540px;margin:auto;border:1px solid #685d44;background:#090a08}video{display:block;width:100%;max-height:calc(100vh - 285px);aspect-ratio:16/9;object-fit:contain;background:#090a08}.caption{padding:13px 16px;border-top:1px solid #685d44;color:#c5beae;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.stats{font-family:monospace;font-size:13px;color:#d9bd7b;overflow-wrap:anywhere}.note{margin:20px auto 0;max-width:1540px}@media(max-width:600px){header{padding:22px 18px}h1{font-size:21px}main{padding:22px 14px}video{max-height:none}.bar{align-items:flex-start}.stats{font-size:12px}.caption{font-size:12px}.note{font-size:13px}}</style>
<header><div class="tag">LOCAL PLAYBACK CHECK</div><h1>VALKYRIA / MEDIA QA</h1><p>Real video bytes in Chromium. Not website integration or the finished game-menu interface.</p></header>
<main><div class="bar"><label>Rendition <select id="asset"><option value="compact">Compact MP4</option><option value="primary">Primary MP4</option><option value="alternate">Alternate WebM</option></select></label><div class="stats" id="stats">Loading media…</div></div><div class="frame"><video id="video" controls autoplay muted loop playsinline preload="auto"></video><div class="caption" id="caption">Native video playback · muted · loop · playsinline</div></div><p class="note">This page checks encoding, decoded frames and playback controls. It does not test the website's accessibility settings, reduced-motion behavior, navigation or responsive interface.</p></main>
<script>const assets=${JSON.stringify(publicAssets)};const requested=new URL(location.href).searchParams.get('role');const role=['primary','compact','alternate'].includes(requested)?requested:'compact';const asset=assets.find(a=>a.role===role);const video=document.querySelector('#video');const selector=document.querySelector('#asset');selector.value=role;selector.addEventListener('change',()=>{location.search='role='+selector.value});video.muted=true;video.poster='/media/'+assets.find(a=>a.role==='poster').filename;video.src='/media/'+asset.filename;document.querySelector('#caption').textContent=asset.filename+' · native video playback · muted · loop · playsinline';setInterval(()=>{const q=video.getVideoPlaybackQuality();document.querySelector('#stats').textContent=video.videoWidth+' × '+video.videoHeight+' | '+video.currentTime.toFixed(2)+' / '+(Number.isFinite(video.duration)?video.duration.toFixed(2):'—')+' s | decoded '+q.totalVideoFrames+' | '+(video.paused?'paused':'playing')},200);</script></html>`;
const httpRequests = [];
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  if (!["GET", "HEAD"].includes(request.method ?? ""))
    return response.writeHead(405).end();
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (path === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    return response.end(request.method === "HEAD" ? undefined : html);
  }
  const asset = byName.get(path.startsWith("/media/") ? path.slice(7) : "");
  if (!asset) return response.writeHead(404).end();
  try {
    const { size } = await stat(asset.file);
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Accept-Ranges", "bytes");
    let start = 0,
      end = size - 1,
      status = 200;
    if (request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      const invalid = () =>
        response.writeHead(416, { "Content-Range": "bytes */" + size }).end();
      if (!match || (!match[1] && !match[2])) return invalid();
      const suffix = !match[1];
      if (
        suffix &&
        (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0)
      )
        return invalid();
      start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
      end =
        !suffix && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        start >= size
      )
        return invalid();
      status = 206;
      response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    response.setHeader("Content-Length", end - start + 1);
    httpRequests.push({
      filename: asset.filename,
      method: request.method,
      status,
      ranged: Boolean(request.headers.range),
    });
    response.writeHead(status);
    if (request.method === "HEAD") return response.end();
    const stream = createReadStream(asset.file, { start, end });
    response.on("close", () => stream.destroy());
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(500).end();
  }
});
const closeServer = async () => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
};
await mkdir(evidence, { recursive: true });
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const base = `http://127.0.0.1:${server.address().port}`;
console.log(JSON.stringify({ event: "media_qa_started", url: base, serve }));
const report = {
  schemaVersion: 1,
  evidenceKind: "native-browser-media-qa",
  startedAtUtc: new Date().toISOString(),
  manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  harnessSha256: createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex"),
  browser: "",
  platform: process.platform,
  beforeFiles,
  afterFiles: [],
  stableFiles: false,
  blockedOutboundRequests: 0,
  pageErrorCount: 0,
  renditionChecks: [],
  requiredLoops,
  naturalLoopCheck: null,
  screenshots: [],
  httpChecks: [],
  limits: [
    "Local HTTP native video playback only; not website integration.",
    "Screenshots show a Media QA viewer, not the application or mobile website UX.",
    "No app reduced-motion, navigation, policy or production-hosting acceptance.",
    "Loop timing and decoded frames are measured; visual seam quality requires inspection.",
    "Network checks cover this browser context, with off-origin requests blocked.",
  ],
};
let browser;
try {
  const compact = byRole.get("compact");
  const range = await fetch(`${base}/media/${compact.filename}`, {
    headers: { Range: "bytes=0-1023" },
  });
  const actual = Buffer.from(await range.arrayBuffer());
  const file = await open(compact.file);
  let expected;
  try {
    expected = Buffer.alloc(1024);
    await file.read(expected, 0, 1024, 0);
  } finally {
    await file.close();
  }
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-type"), compact.mimeType);
  assert.equal(
    range.headers.get("content-range"),
    `bytes 0-1023/${compact.bytes}`,
  );
  assert.ok(actual.equals(expected));
  const badRange = await fetch(`${base}/media/${compact.filename}`, {
    headers: { Range: "bytes=999999999999-" },
  });
  assert.equal(badRange.status, 416);
  await badRange.arrayBuffer();
  report.httpChecks.push({
    check:
      "Exact source bytes, MIME and Content-Range for 206; invalid range returns 416",
    passed: true,
  });
  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--no-first-run",
    ],
  });
  report.browser = `Chromium ${browser.version()}`;
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  await context.route("**/*", async (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(base + "/")
    )
      return route.continue();
    report.blockedOutboundRequests++;
    await route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", () => report.pageErrorCount++);
  const snapshot = () =>
    page.evaluate(() => {
      const video = document.querySelector("video");
      const quality = video.getVideoPlaybackQuality();
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        readyState: video.readyState,
        mediaError: video.error ? video.error.code : null,
        decodedFrames: quality.totalVideoFrames,
        droppedFrames: quality.droppedVideoFrames,
      };
    });
  const load = async (role) => {
    await page.goto(`${base}/?role=${role}`);
    await page.waitForFunction(
      () => {
        const video = document.querySelector("video");
        return video.readyState >= 2 && video.videoWidth > 0;
      },
      null,
      { timeout: 15000 },
    );
  };
  for (const role of ["primary", "compact", "alternate"]) {
    const asset = byRole.get(role);
    await load(role);
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      video.muted = true;
      await video.play();
    });
    const before = await snapshot();
    await page.waitForTimeout(1500);
    const playing = await snapshot();
    assert.equal(playing.width, asset.width);
    assert.equal(playing.height, asset.height);
    assert.ok(Math.abs(playing.duration - asset.durationSeconds) < 0.1);
    assert.equal(playing.mediaError, null);
    assert.ok(playing.currentTime > before.currentTime + 0.75);
    assert.ok(playing.decodedFrames > before.decodedFrames);
    await page.evaluate(() => document.querySelector("video").pause());
    const paused = await snapshot();
    await page.waitForTimeout(750);
    const stable = await snapshot();
    assert.ok(Math.abs(stable.currentTime - paused.currentTime) < 0.03);
    await page.evaluate(() => document.querySelector("video").play());
    await page.waitForTimeout(750);
    const resumed = await snapshot();
    assert.ok(resumed.currentTime > stable.currentTime + 0.35);
    assert.ok(resumed.decodedFrames > stable.decodedFrames);
    assert.equal(resumed.mediaError, null);
    const renditionCheck = {
      role,
      filename: asset.filename,
      before,
      playing,
      paused,
      stable,
      resumed,
      seekChecks: [],
      passed: false,
    };
    report.renditionChecks.push(renditionCheck);
    for (const [position, requestedTime] of [
      ["middle", playing.duration / 2],
      ["near-end", playing.duration - 2],
    ]) {
      const seekCheck = {
        position,
        requestedTime,
        beforeSeek: await snapshot(),
        passed: false,
      };
      renditionCheck.seekChecks.push(seekCheck);
      await page.evaluate((time) => {
        const video = document.querySelector("video");
        video.pause();
        video.currentTime = time;
      }, requestedTime);
      await page.waitForFunction(
        (time) => {
          const video = document.querySelector("video");
          return (
            !video.seeking &&
            video.readyState >= 2 &&
            Math.abs(video.currentTime - time) < 0.1
          );
        },
        requestedTime,
        { timeout: 15000 },
      );
      seekCheck.settled = await snapshot();
      assert.equal(seekCheck.settled.mediaError, null);
      assert.ok(Math.abs(seekCheck.settled.currentTime - requestedTime) < 0.1);
      await page.evaluate(() => document.querySelector("video").play());
      await page.waitForTimeout(750);
      seekCheck.playing = await snapshot();
      assert.equal(seekCheck.playing.mediaError, null);
      assert.ok(
        seekCheck.playing.currentTime > seekCheck.settled.currentTime + 0.35,
      );
      assert.ok(
        seekCheck.playing.decodedFrames > seekCheck.settled.decodedFrames,
      );
      seekCheck.passed = true;
    }
    renditionCheck.passed = true;
    console.log(JSON.stringify({ event: "rendition_passed", role }));
  }
  await load("primary");
  // Reset before the measured phase; never assign currentTime during it.
  await page.evaluate(() => {
    const video = document.querySelector("video");
    video.pause();
    video.currentTime = 0;
  });
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return !video.seeking && video.readyState >= 2 && video.currentTime < 0.05;
    },
    null,
    { timeout: 15000 },
  );
  await page.evaluate(async () => {
    const video = document.querySelector("video");
    video.playbackRate = 1;
    window.qaLoopSamples = [];
    window.qaLastTime = 0;
    window.qaLoopStarted = performance.now();
    video.addEventListener("timeupdate", () => {
      if (
        window.qaLastTime >= video.duration - 1 &&
        video.currentTime < 1
      )
        window.qaLoopSamples.push({
          elapsedSeconds: (performance.now() - window.qaLoopStarted) / 1000,
          currentTime: video.currentTime,
          decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
        });
      window.qaLastTime = video.currentTime;
    });
    await video.play();
  });
  const loopBefore = await snapshot();
  console.log(
    JSON.stringify({
      event: "natural_loop_check_started",
      durationSeconds: loopBefore.duration,
      requiredLoops,
    }),
  );
  const loopWaitStarted = Date.now();
  const loopTimeoutMilliseconds =
    byRole.get("primary").durationSeconds * requiredLoops * 1000 + 30000;
  const progressTimer = setInterval(() => {
    console.log(
      JSON.stringify({
        event: "natural_loop_check_progress",
        elapsedSeconds: (Date.now() - loopWaitStarted) / 1000,
        expectedPlaybackSeconds: loopBefore.duration * requiredLoops,
        requiredLoops,
      }),
    );
  }, 20000);
  try {
    await page.waitForFunction(
      (count) => window.qaLoopSamples.length >= count,
      requiredLoops,
      { timeout: loopTimeoutMilliseconds, polling: 100 },
    );
  } finally {
    clearInterval(progressTimer);
  }
  const loopAfter = await snapshot();
  const wraps = await page.evaluate(() => window.qaLoopSamples);
  const playbackRate = await page.evaluate(
    () => document.querySelector("video").playbackRate,
  );
  assert.equal(playbackRate, 1);
  assert.equal(loopAfter.mediaError, null);
  assert.ok(loopAfter.decodedFrames > loopBefore.decodedFrames);
  assert.ok(
    wraps[requiredLoops - 1].elapsedSeconds >=
      loopBefore.duration * requiredLoops - 0.25,
  );
  report.naturalLoopCheck = {
    role: "primary",
    filename: byRole.get("primary").filename,
    before: loopBefore,
    after: loopAfter,
    wraps,
    playbackRate,
    requiredLoops,
    timeoutMilliseconds: loopTimeoutMilliseconds,
    passed: true,
  };
  for (const { viewport, role } of [
    { viewport: { width: 1920, height: 1080 }, role: "primary" },
    { viewport: { width: 390, height: 844 }, role: "compact" },
  ]) {
    await page.setViewportSize(viewport);
    await load(role);
    await page.evaluate(() => document.querySelector("video").play());
    await page.waitForFunction(
      () => {
        const video = document.querySelector("video");
        return video.currentTime >= 3 && video.readyState >= 3 && !video.seeking;
      },
      null,
      { timeout: 15000 },
    );
    await page.evaluate(() => document.querySelector("video").pause());
    await page.waitForFunction(() =>
      document.querySelector("#stats").textContent.includes("paused"),
    );
    await page.waitForTimeout(200);
    const nativeState = await snapshot();
    assert.equal(nativeState.mediaError, null);
    assert.equal(nativeState.paused, true);
    assert.ok(nativeState.currentTime >= 3);
    const filename = `media-qa-${viewport.width}x${viewport.height}.png`;
    const bytes = await page.screenshot({
      path: resolve(evidence, filename),
      fullPage: true,
      animations: "disabled",
    });
    report.screenshots.push({
      filename,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      viewport,
      role,
      rendition: byRole.get(role).filename,
      nativeState,
      caption:
        `Media QA viewer showing actual ${role} video bytes (${byRole.get(role).filename}), paused after natural playback; not website integration or mobile website UX.`,
    });
  }
  assert.equal(report.blockedOutboundRequests, 0);
  assert.equal(report.pageErrorCount, 0);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = {
    kind:
      error instanceof assert.AssertionError
        ? "assertion_failed"
        : "browser_or_transport_failed",
    detail:
      "A native playback, media byte, browser or fixture assertion failed. No application acceptance is claimed.",
  };
  console.error(
    "Media QA failed. Inspect the local browser/fixture prerequisites and partial evidence.",
  );
} finally {
  await browser?.close();
  try {
    report.afterFiles = await Promise.all(assets.map(fingerprint));
    report.stableFiles =
      JSON.stringify(report.beforeFiles) === JSON.stringify(report.afterFiles);
    const manifestAfter = createHash("sha256")
      .update(await readFile(resolve(bundle, "manifest.json")))
      .digest("hex");
    if (!report.stableFiles || manifestAfter !== report.manifestSha256)
      throw new Error("input_changed");
  } catch {
    report.status = "failed";
    report.failure = {
      kind: "bundle_changed",
      detail:
        "Bundle fingerprints changed or could not be verified after the run.",
    };
  }
  report.httpRequests = httpRequests;
  report.completedAtUtc = new Date().toISOString();
  await writeFile(
    resolve(evidence, "media-qa.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (report.status !== "passed") process.exitCode = 1;
  console.log(
    JSON.stringify({
      event: "media_qa_complete",
      status: report.status,
      evidence: "media-qa.json",
      serve,
    }),
  );
  if (!serve) await closeServer();
}
if (serve) {
  await writeFile(
    resolve(evidence, "media-qa-server.json"),
    JSON.stringify(
      {
        pid: process.pid,
        port: server.address().port,
        url: base,
        label: "Media QA only; not website integration",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      event: "media_qa_viewer_available",
      pid: process.pid,
      url: base,
    }),
  );
  process.once("SIGINT", () => void closeServer());
  process.once("SIGTERM", () => void closeServer());
}
