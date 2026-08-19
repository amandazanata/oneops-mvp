import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the OneOps operational agenda", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>OneOps/);
  assert.match(html, /Agenda operacional/);
  assert.match(html, /Relógio de demonstração ativo/);
  assert.match(html, /Carlos/);
  assert.match(html, /Marina/);
  assert.match(html, /João/);
  assert.match(html, /Registrar pedido/);
  assert.match(html, /Informar imprevisto/);
  assert.match(html, /Simular indisponibilidade do Carlos/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("removes starter preview code from the production surface", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.match(layout, /lang="pt-BR"/);
  assert.match(layout, /title:\s*"OneOps/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
