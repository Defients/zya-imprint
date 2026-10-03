import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let server: ChildProcess;
let base: string;
let directory: string;
let dataFile: string;
const token = randomUUID();
const origin = "https://example.com";
const viewedAt = new Date().toISOString();

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "zya-collector-test-"));
  dataFile = path.join(directory, "imprints.json");
  await writeFile(dataFile, JSON.stringify({ meta: { version: 1, createdAt: viewedAt, updatedAt: viewedAt }, recentEventIds: [], sites: {
    test: { origin, pages: { "/legacy": { path: "/legacy", views: 5, daily: {}, device: { userAgent: "legacy agent" }, session: { id: "legacy-id" }, navigation: { referrer: "https://private.example/?secret=yes" } } }, },
  } }));
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["--import", "tsx", "server.ts", "--production"], {
    cwd: path.resolve(import.meta.dirname, ".."), windowsHide: true, stdio: "ignore",
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), IMPRINT_COLLECTOR_ENABLED: "true", IMPRINT_ALLOWED_ORIGINS: origin, IMPRINT_READ_TOKEN: token, IMPRINT_DATA_FILE: dataFile },
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test server exited with ${server.exitCode}`);
    const ready = await fetch(`${base}/api/health`).then((res) => res.ok).catch(() => false);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Collector test server did not become ready");
}, 15_000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    const closed = new Promise((resolve) => server.once("exit", resolve));
    server.kill(); await closed;
  }
  if (dataFile) await unlink(dataFile);
  if (directory) await rmdir(directory);
});

const summary = async () => {
  const response = await fetch(`${base}/api/imprint/summary`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status).toBe(200); return response.json();
};

describe("collector HTTP privacy and aggregation", () => {
  it("scrubs rich diagnostics from legacy data before serving or persisting it", async () => {
    const stored = JSON.parse(await readFile(dataFile, "utf8"));
    const live = await summary();
    for (const page of [stored.sites.test.pages["/legacy"], live.sites.test.pages["/legacy"]]) {
      expect(page.views).toBe(5);
      for (const key of ["device", "session", "navigation"]) expect(page).not.toHaveProperty(key);
    }
  });
  it("accepts a pageview from an older rich tracker without persisting device/session identifiers", async () => {
    const event = { type: "pageview", eventId: randomUUID(), siteId: "test", origin, path: "/new", viewedAt, day: viewedAt.slice(0, 10), newSession: true,
      device: { userAgent: "private agent" }, session: { id: "private session" }, navigation: { referrer: "secret" }, performance: { loadTime: 100 } };
    const post = () => fetch(`${base}/api/imprint`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(event) });
    expect((await post()).status).toBe(202);
    expect(await (await post()).json()).toMatchObject({ duplicate: true });
    const page = (await summary()).sites.test.pages["/new"];
    expect(page).toMatchObject({ views: 1, uniqueSessions: 1, performance: { loadTime: 100 } });
    for (const key of ["device", "session", "navigation"]) expect(page).not.toHaveProperty(key);
  });
  it("rejects unauthorized summary reads and writes from unconfigured origins", async () => {
    expect((await fetch(`${base}/api/imprint/summary`)).status).toBe(401);
    expect((await fetch(`${base}/api/imprint`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://unconfigured.example" }, body: "{}" })).status).toBe(403);
  });
});
