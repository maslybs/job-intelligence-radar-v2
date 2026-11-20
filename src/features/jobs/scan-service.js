import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Job scan orchestration.
// Extracted from the production-compatible Worker without modifying the bodies.
import { assess } from "../../ai/job-evaluation-service.js";
import { collect } from "../discovery/job-collector.js";
import { iso } from "../../platform/runtime-utils.js";

export async function scan(env, force = false, options = {}) {
  if(!RADAR_SETTINGS.jobs.enabled)return {state:"jobs_disabled",scanned:0,fetched:0,inserted:0,assessed:0,kept:0,errors:[]};
  const a = await collect(env, force, options), b = await assess(env);
  await env.DB.prepare("INSERT INTO runs(started_at,source_count,fetched,inserted,assessed,kept,errors) VALUES(?,?,?,?,?,?,?)").bind(iso(), a.scanned, a.fetched, a.inserted, b.assessed, b.kept, JSON.stringify(a.errors)).run();
  return { ...a, ...b };
}
