import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Source polling, D1 queueing and cadence.
// Extracted from the production-compatible Worker without modifying the bodies.
import {getMeta,putMeta} from "../../platform/meta.js";
import { baseSources } from "./source-catalog.js";
import {sourceIsActionable,listingIsActionable} from "./source-accessibility.js";
import {fastSourceMinutes} from "../scheduler/fast-source-lane.js";
import { ageOK } from "../jobs/freshness.js";
import { sha } from "../../platform/hash.js";
import {canonicalJobUrl} from "./canonical-job-url.js";
import { fetchSource } from "./source-fetch.js";
import { firstPass } from "../jobs/job-preselect.js";
import { iso, sourceDate } from "../../platform/runtime-utils.js";

export async function collect(env, force = false, options = {}) {
  if(!RADAR_SETTINGS.jobs.enabled)return {state:"jobs_disabled",scanned:0,fetched:0,inserted:0,errors:[]};
  const custom = JSON.parse(await getMeta(env, "custom_sources") || "[]");
  // Do not crawl paid-only job boards even if a custom feed was saved earlier.
  let sources = [...baseSources(), ...custom.map((x) => ({ ...x, hours: Math.max(2, Number(x.hours) || 4) }))]
    .filter(sourceIsActionable);
  const onlyDou=options.mode==="dou";
  const quick=options.mode==="fast"||onlyDou;
  if(onlyDou){sources=sources.filter(x=>String(x.name).startsWith("DOU ·"))
      .map(x=>({...x,hours:0.5}));}
  else if(quick){sources=sources.filter(x=>fastSourceMinutes(x)!=null)
      .map(x=>({...x,hours:fastSourceMinutes(x)/60}));}
  const fast = quick?[]:sources.filter((s) => s.kind === "freelancehunt");
  const regular = quick?sources:sources.filter((s) => s.kind !== "freelancehunt");
  const cursorKey=onlyDou?"dou_source_cursor":quick?"fast_source_cursor":"source_cursor";
  const cursor = Number(await getMeta(env, cursorKey) || 0) % Math.max(1, regular.length);
  const capacity = Math.min(onlyDou?5:quick?3:Math.max(0,(force?sources.length:14)-fast.length),regular.length);
  const due = [], cachedLast = /* @__PURE__ */ new Map(), now = Date.now();
  let examined = 0;
  for (let i = 0; i < regular.length && due.length < capacity; i++) {
    const s = regular[(cursor + i) % regular.length];
    examined = i + 1;
    const last = await env.DB.prepare("SELECT last_success,last_error FROM source_state WHERE source=?").bind(s.name).first();
    const retryAt = Number((last?.last_error || "").match(/RETRY_AT:(\d+)/)?.[1] || 0);
    if (now < retryAt) continue;
    if (!force && last?.last_success && now / 1e3 - last.last_success < s.hours * 3600) continue;
    due.push(s);
    cachedLast.set(s.name, last);
  }
  const selected = [...fast, ...due];
  await putMeta(env, cursorKey, (cursor + Math.max(1, examined)) % Math.max(1, regular.length));
  let fetched = 0, inserted = 0, scanned = 0;
  const errors = [], skipped = [];
  for (const s of selected) {
    const last = cachedLast.has(s.name) ? cachedLast.get(s.name) : await env.DB.prepare("SELECT last_success,last_error FROM source_state WHERE source=?").bind(s.name).first();
    if (!force && last?.last_success && Date.now() / 1e3 - last.last_success < s.hours * 3600) {
      skipped.push(s.name + ":interval");
      continue;
    }
    const retryAt = Number((last?.last_error || "").match(/RETRY_AT:(\d+)/)?.[1] || 0);
    if (Date.now() < retryAt) {
      skipped.push(s.name + ":publisher_cooldown");
      continue;
    }
    try {
      const jobs = await fetchSource(s, env);
      scanned++;
      fetched += jobs.length;
      let candidateCount = 0, sourceInserted = 0, ageRejected=0, firstPassRejected=0, duplicateCount=0;
      let capReached=false;
      const recentDates = jobs.map((j) => Date.parse(sourceDate(j.date))).filter(Number.isFinite);
      const newestPublished = recentDates.length ? new Date(Math.max(...recentDates)).toISOString() : null;
      for (const j of jobs) {
        if(!j.url || !ageOK(j)){ageRejected++;continue;}
        if(!listingIsActionable(j)){firstPassRejected++;continue;}
        if(!firstPass(j)){firstPassRejected++;continue;}
        // Inspect a meaningful portion of each returned feed, including old
        // duplicates. The previous cap of 35 let duplicate items crowd out new posts.
        if(candidateCount >= 110){capReached=true;break;}
        candidateCount++;
        const url=canonicalJobUrl(j.url);
        const id=await sha(url),company=j.company||new URL(url).hostname;
        // Fingerprint remains a search/analytics hint, NOT a uniqueness constraint.
        // Atomic primary-key/unique-URL INSERT guards concurrent scans.
        const fingerprint=await sha((company+"|"+j.title+"|"+(j.region||"")).toLowerCase());
        const a = await env.DB.prepare("INSERT OR IGNORE INTO jobs(id,fingerprint,title,company,source,url,description,region,published_at,discovered_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id, fingerprint, j.title.slice(0, 220), company.slice(0, 120), j.source, url, j.description, j.region || "", j.date || null, iso(), "queued");
        const insertedRow=await a.run();
        if(!insertedRow.meta?.changes)duplicateCount++;

        if (insertedRow.meta?.changes) {
          inserted++;
          sourceInserted++;
        }
      }
      await putMeta(env, "source_metrics_" + s.name, JSON.stringify({
        checked_at: iso(),
        received: jobs.length,
        age_rejected:ageRejected,first_pass_rejected:firstPassRejected,
        preselected: candidateCount, duplicates:duplicateCount,
        inserted: sourceInserted,cap_reached:capReached,
        newest_published: newestPublished
      }));
      await putMeta(env, "source_attempt_" + s.name, JSON.stringify({ at: iso(), status: "ok" }));
      await env.DB.prepare("INSERT INTO source_state(source,last_success,last_error) VALUES(?,?,NULL) ON CONFLICT(source) DO UPDATE SET last_success=excluded.last_success,last_error=NULL").bind(s.name, Math.floor(Date.now() / 1e3)).run();
    } catch (e) {
      const message = String(e.message || e), status = message.match(/HTTP\s+(403|429)/);
      const cooldown = status ? (status[1] === "403" ? 24 : 6) * 36e5 : 0;
      const detail = message.slice(0, 110) + (cooldown ? " RETRY_AT:" + (Date.now() + cooldown) : "");
      errors.push(s.name + ":" + detail);
      // Failure while recording an error must never abort the remaining sources.
      const logs=await Promise.allSettled([
        putMeta(env, "source_attempt_" + s.name, JSON.stringify({ at: iso(), status: "error", message: message.slice(0, 120) })),
        env.DB.prepare("INSERT INTO source_state(source,last_success,last_error) VALUES(?,NULL,?) ON CONFLICT(source) DO UPDATE SET last_error=excluded.last_error").bind(s.name, detail.slice(0, 160)).run()
      ]);
      for(const log of logs)if(log.status==="rejected")
        console.error("source error telemetry failure",s.name,String(log.reason).slice(0,110));
    }
  }
  return { scanned, fetched, inserted, errors, skipped, configured_sources: sources.length };
}
