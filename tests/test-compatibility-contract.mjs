import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";

const app=readFileSync("src/app/worker.js","utf8");
const schedule=readFileSync("src/scheduler/scheduled-handler.js","utf8");
const router=readFileSync("src/http/router.js","utf8");
const manual=readFileSync("src/workflows/manual-radar.js","utf8");
const webhooks=readFileSync("src/http/telegram-webhook.js","utf8");
const entry=readFileSync("src/index.js","utf8");
const cfg=JSON.parse(readFileSync("wrangler.jsonc","utf8").replace(/^\s*\/\/.*$/gm,""));
assert(app.includes("export default {scheduled,fetch:handleFetch}"),"Cloudflare composition root must expose both handlers");
assert(schedule.includes("export async function scheduled(event, env, ctx)"),"scheduled handler retained");
assert(router.includes("export async function handleFetch(req, env, ctx)"),"fetch handler retained");
assert(manual.includes("export class ManualRadarWorkflow"),"manual Workflow retained");
assert(manual.includes('action.startsWith("upwork_")'),"retired Upwork actions must fail closed");
const actionRegistry=readFileSync("src/workflows/action-registry.js","utf8");
assert(!/upwork_(notify|auth_probe|probe)\s*":/.test(actionRegistry),"retired Upwork handlers must not be registered");
for(const signal of ["*/5 * * * *","0 * * * *","scheduledAt.getUTCMinutes()"])assert(schedule.includes(signal),"cron contract: "+signal);
for(const signal of ["/telegram/webhook","/inbox","/admin/scan","/admin/assess","/admin/sources","/admin/reddit/health","/admin/health-report","/admin/demand/preview","/admin/digest","/admin/review","/health"])assert(router.includes(signal),"route contract: "+signal);
assert(webhooks.includes("radarHandleTelegram"),"Telegram webhook preserved");
for(const name of ["ManualRadarWorkflow","RedditMcpWorkflow","DouBrowserWorkflow"]){
 assert(entry.includes(name),"cloudflare export missing: "+name);
 assert(cfg.workflows.some(x=>x.class_name===name),"local Workflow spec missing: "+name);
}
assert.equal(cfg.triggers.crons.length,0);
assert.equal(cfg.workers_dev,false);
assert.equal(cfg.d1_databases[0].database_id,"00000000-0000-4000-8000-000000000000");
assert(RADAR_SETTINGS.jobs.profile.role);
assert(RADAR_SETTINGS.leads.profile.role);
assert.notEqual(RADAR_SETTINGS.jobs.profile,RADAR_SETTINGS.leads.profile);
console.log("PASS legacy route/cron/export contract retained with safe local deployment settings");