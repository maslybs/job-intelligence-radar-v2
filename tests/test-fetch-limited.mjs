import {strict as assert} from "node:assert";
import {fetchLimited,MAX_SOURCE_RESPONSE_BYTES} from "../src/features/discovery/fetch-limited.js";
const original=globalThis.fetch;
try{
  globalThis.fetch=async()=>new Response("<rss>ok</rss>");
  assert.equal(await fetchLimited("https://example.org/feed"),"<rss>ok</rss>");

  globalThis.fetch=async()=>new Response("not downloaded",{
    headers:{"Content-Length":String(MAX_SOURCE_RESPONSE_BYTES+1)}
  });
  await assert.rejects(fetchLimited("https://example.org/feed"),/source_response_too_large/);

  globalThis.fetch=async()=>new Response(new ReadableStream({
    start(controller){
      controller.enqueue(new Uint8Array(MAX_SOURCE_RESPONSE_BYTES));
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    }
  }));
  await assert.rejects(fetchLimited("https://example.org/feed"),/source_response_too_large/);

  globalThis.fetch=async()=>new Response(new ReadableStream({
    start(controller){
      controller.enqueue(new TextEncoder().encode("<rss>"));
      controller.enqueue(new TextEncoder().encode("Привіт</rss>"));
      controller.close();
    }
  }));
  assert.equal(await fetchLimited("https://example.org/feed"),"<rss>Привіт</rss>");
  globalThis.fetch=async()=>new Response("not allowed",{status:429});
  await assert.rejects(fetchLimited("https://example.org/feed"),/HTTP 429/);
}finally{globalThis.fetch=original;}
console.log("PASS streaming fetch rejects declared/actual oversized bodies and decodes split UTF-8");
