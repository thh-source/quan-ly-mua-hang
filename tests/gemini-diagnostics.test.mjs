import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Keep the actual handler; replace only the platform/auth boundaries.
const source = stripTypeScriptTypes(readFileSync(new URL("../app/api/gemini-diagnostics/route.ts", import.meta.url), "utf8"))
  .replace('import { requireUser } from "../../auth";', "const requireUser = () => globalThis.diagnosticsAuth();")
  .replace('(await import("cloudflare:workers")).env', "globalThis.diagnosticsEnv");
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("authenticated sequential Gemini diagnostics", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.diagnosticsAuth; delete globalThis.diagnosticsEnv; });
  let calls;
  function setup(env = { GEMINI_API_KEY: "secret-key" }, replies = []) {
    calls = [];
    globalThis.diagnosticsAuth = async () => ({});
    globalThis.diagnosticsEnv = env;
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return reply;
    };
  }
  await t.test("rejects unauthenticated requests before network or key access", async () => {
    setup(); globalThis.diagnosticsAuth = async () => { throw new Error("UNAUTHORIZED"); };
    assert.equal((await GET()).status, 401); assert.equal(calls.length, 0);
  });
  await t.test("missing key skips both probes", async () => {
    setup({}); const response = await GET(); const body = await response.json();
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body.steps.map(s => s.status), ["error", "skipped", "skipped"]);
    assert.equal(calls.length, 0);
  });
  await t.test("success uses header key and default text-only model", async () => {
    setup(undefined, [Response.json({ models: [] }), Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] })]);
    const body = await (await GET()).json();
    assert.equal(body.status, "ok"); assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models");
    assert.match(calls[1].url, /gemini-2\.5-flash:generateContent$/);
    assert.equal(calls[0].options.headers["x-goog-api-key"], "secret-key");
    assert.deepEqual(JSON.parse(calls[1].options.body).contents, [{ parts: [{ text: "Reply only OK." }] }]);
    assert.ok(!JSON.stringify(body).includes("secret-key"));
  });
  await t.test("still generates after a location error, redacts secrets and respects model", async () => {
    setup({ GEMINI_API_KEY: "secret-key", GEMINI_PR_MODEL: "models/custom-model" }, [
      Response.json({ error: { status: "FAILED_PRECONDITION", message: "User location is not supported secret-key" } }, { status: 400 }),
      Response.json({ error: { status: "NOT_FOUND", message: "Model not found" } }, { status: 404 }),
    ]);
    const body = await (await GET()).json();
    assert.equal(calls.length, 2); assert.match(calls[1].url, /custom-model:generateContent$/);
    assert.deepEqual(body.steps.map(s => s.httpCode), [null, 400, 404]);
    assert.ok(!JSON.stringify(body).includes("secret-key"));
    assert.ok(body.hints.some(h => h.includes("chưa xác nhận")));
    assert.ok(body.hints.some(h => h.includes("GEMINI_PR_MODEL")));
  });
  await t.test("distinguishes network, invalid JSON and quota errors", async () => {
    setup(undefined, [new Error("secret-key"), new Response("bad gateway", { status: 502 })]);
    let body = await (await GET()).json();
    assert.equal(body.steps[1].error, "NETWORK_ERROR"); assert.equal(body.steps[1].httpCode, null);
    assert.equal(body.steps[2].error, "INVALID_RESPONSE"); assert.equal(body.steps[2].httpCode, 502);
    setup(undefined, [Response.json({ models: [] }), Response.json({ error: { message: "Quota exceeded" } }, { status: 429 })]);
    body = await (await GET()).json(); assert.ok(body.hints.some(h => h.includes("quota")));
  });
});
