// Production-compatible extraction: no business rules changed.
import {sourceIsActionable} from "./source-accessibility.js";
import {assertSafeSourceUrl} from "./safe-source-url.js";
import {baseSources} from "./source-catalog.js";
import {COMMUNITY_FEEDS} from "./community-leads.js";
import {getMeta,putMeta} from "../../platform/meta.js";

export function validateSource(x) {
  const kind = String(x.kind || "rss").trim().toLowerCase(), name = String(x.name || "").trim().slice(0, 100), url = String(x.url || "").trim(), slug = String(x.slug || "").trim(), query = String(x.query || "").trim();
  if (!name || !["rss", "greenhouse", "lever", "ashby", "himalayas", "jobicy"].includes(kind)) throw Error("invalid source kind/name");
  if(!sourceIsActionable({name,url}))throw Error("Source requires paid subscription to view/apply; unsupported in free-access Radar");
  if (kind === "rss") {
    assertSafeSourceUrl(url);
    return { name, kind, url, hours: 2 };
  }
  if (kind === "himalayas" || kind === "jobicy") {
    if (!/^[a-z0-9 .+#_-]{2,75}$/i.test(query)) throw Error("invalid API search query");
    return kind === "himalayas" ? { name, kind, query, hours: 2 } : { name, kind, params: { tag: query, industry: "engineering" }, hours: 2 };
  }
  if (!/^[a-z0-9_-]{2,70}$/i.test(slug)) throw Error("invalid job board slug");
  return { name, kind, slug, hours: 2 };
}
export async function listSources(env) {
  const raw = await getMeta(env, "custom_sources");
  const statuses = (await env.DB.prepare("SELECT source,last_success,last_error FROM source_state").all()).results || [];
  const metricRows = (await env.DB.prepare("SELECT key,value FROM meta WHERE key LIKE 'source_metrics_%'").all()).results || [];
  const metrics = Object.fromEntries(metricRows.map((x) => [x.key.slice(15), JSON.parse(x.value)]));
  const attemptRows = (await env.DB.prepare("SELECT key,value FROM meta WHERE key LIKE 'source_attempt_%'").all()).results || [];
  const attempts = Object.fromEntries(attemptRows.map((x) => [x.key.slice(15), JSON.parse(x.value)]));
  return { builtin: baseSources(), community: COMMUNITY_FEEDS, custom: JSON.parse(raw || "[]"), status: statuses, metrics, attempts };
}
export async function addSource(env, x) {
  const a = validateSource(x), sources = JSON.parse(await getMeta(env, "custom_sources") || "[]");
  if (sources.length >= 40) throw Error("max 40 extra sources");
  if (sources.some((z) => z.name === a.name || z.url && z.url === a.url || z.slug && z.slug === a.slug && z.kind === a.kind || z.query && z.query === a.query && z.kind === a.kind)) return { added: false, reason: "duplicate" };
  sources.push(a);
  await putMeta(env, "custom_sources", JSON.stringify(sources));
  return { added: true, source: a };
}
