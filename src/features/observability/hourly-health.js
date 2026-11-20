// Hourly operational audit. Monitor only enabled pipelines and configured sources.
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {baseSources} from "../discovery/source-catalog.js";
import {sourceIsActionable} from "../discovery/source-accessibility.js";
const parse=x=>{try{return typeof x==="string"?JSON.parse(x||"null"):x}catch{return null}};
const ago=(stamp,now)=>{const n=Date.parse(String(stamp||""));return Number.isFinite(n)?Math.max(0,(now-n)/60000):Infinity};
export function interpretRadarHealth(snapshot,now=Date.now()){
 const problems=[],warnings=[];
 const monitoring=snapshot.monitoring||{};
 const jobsEnabled=monitoring.jobsEnabled!==false;
 const redditEnabled=monitoring.redditEnabled!==false;
 const telegramEnabled=monitoring.telegramEnabled!==false;
 const runAge=ago(snapshot.lastRun?.started_at,now);
 const delivery=parse(snapshot.delivery),reddit=parse(snapshot.reddit);
 const pipeline=parse(snapshot.pipeline),started=parse(snapshot.pipeline_started);
 // A scheduled Workflow checkpoint is authoritative for successful hourly
 // scheduling. A manual test must NEVER hide a missing scheduled run.
 const validOrigin=x=>["scheduled","recovery"].includes(String(x?.origin||""));
 const recentPipeline=validOrigin(pipeline)&&pipeline?.state==="completed"&&
   ago(pipeline.completed_at,now)<=105;
 const activePipeline=validOrigin(started)&&started?.state==="running"&&
   ago(started.started_at,now)<=18&&
   (!pipeline||pipeline.slot!==started.slot||
     ago(pipeline.completed_at,now)>ago(started.started_at,now));

 const deliveredAge=ago(delivery?.checked_at,now);
 const redditAge=ago(reddit?.completed||reddit?.checked_at,now);
 if(jobsEnabled&&runAge>105&&!recentPipeline&&!activePipeline)
   problems.push("hourly_scan_stale");
 if(jobsEnabled&&activePipeline&&runAge>105)warnings.push("hourly_workflow_in_progress");
 if(telegramEnabled&&deliveredAge>40)problems.push("telegram_delivery_check_stale");
 if(telegramEnabled&&delivery?.state==="partial"&&Array.isArray(delivery.errors)&&delivery.errors.length)
   problems.push("telegram_delivery_error");
 if(redditEnabled&&redditAge>160)problems.push("reddit_discovery_stale");
 if(redditEnabled&&(reddit?.state==="error"||reddit?.state==="failed"))
   problems.push("reddit_discovery_failed");
 const queue=Number(snapshot.queue?.n)||0,oldest=ago(snapshot.queue?.oldest,now);
 const exhausted=Number(snapshot.queue?.exhausted)||0;
 if(jobsEnabled&&exhausted>0)problems.push("queued_jobs_retries_exhausted");
 if(jobsEnabled&&queue>=2&&oldest>65)problems.push("queued_jobs_delayed");
 const active=monitoring.activeSourceHours?new Map(Object.entries(monitoring.activeSourceHours)):null;
 const stale=(jobsEnabled?snapshot.sources||[]:[]).filter(s=>{
  // Old D1 source_state entries never count after a source is disabled/removed.
  if(active&&!active.has(s.source))return false;
  const updated=Number(s.last_success)||0;
  const hours=updated?(now-updated*1000)/3600000:Infinity;
  const interval=active?Number(active.get(s.source))||4:4;
  return hours>Math.max(10,interval*1.5+2)&&!String(s.last_error||"").includes("RETRY_AT");
 });
 if(stale.length>=3)problems.push("multiple_sources_stale");
 if(jobsEnabled&&Number(snapshot.last12?.inserted||0)>=10&&Number(snapshot.last12?.assessed||0)>=10&&Number(snapshot.last12?.sent||0)===0)
   warnings.push("active_collection_but_zero_deliveries_review_selection_not_telegram");
 return {state:problems.length?"degraded":"ok",problems,warnings,
  last_scan_minutes:Number.isFinite(runAge)?Math.round(runAge):null,
  delivery_check_minutes:Number.isFinite(deliveredAge)?Math.round(deliveredAge):null,
  reddit_minutes:Number.isFinite(redditAge)?Math.round(redditAge):null,
  queued:queue,queued_retryable:Number(snapshot.queue?.retryable)||0,queued_exhausted:exhausted,sources_stale:stale.map(x=>x.source),checked_at:new Date(now).toISOString()};
}
export async function readRadarAudit(env){
 const val=async key=>(await env.DB.prepare("SELECT value FROM meta WHERE key=?").bind(key).first())?.value||"";
 const configSources=baseSources().filter(sourceIsActionable);
 let custom=[];
 try{
   const stored=JSON.parse(await val("custom_sources")||"[]");
   if(Array.isArray(stored))custom=stored;
 }catch{ // Invalid legacy metadata must not crash the health monitor.
 }
 const activeSourceHours={};
 for(const source of [...configSources,...(Array.isArray(custom)?custom:[]).filter(sourceIsActionable)])
   activeSourceHours[source.name]=Math.max(0.5,Number(source.hours)||4);
 const monitoring={
   jobsEnabled:RADAR_SETTINGS.jobs.enabled,
   redditEnabled:RADAR_SETTINGS.leads.enabled&&RADAR_SETTINGS.reddit.enabled&&
     env.REDDIT_MCP_ENABLED==="1"&&Boolean(env.REDDIT_MCP_WORKFLOW)&&
     Boolean(env.ONEAIHUB_VPC)&&Boolean(env.ONEAIHUB_MCP_BEARER_TOKEN||
       (env.ONEAIHUB_MCP_CLIENT_ID&&env.ONEAIHUB_MCP_CLIENT_SECRET)),
   telegramEnabled:RADAR_SETTINGS.notifications.telegramEnabled,
   activeSourceHours
 };
 const [lastRun,queue,sources,inserted12,sent12,assessed12,delivery,reddit,pipeline,pipeline_started]=await Promise.all([
  env.DB.prepare("SELECT started_at FROM runs ORDER BY id DESC LIMIT 1").first(),
  env.DB.prepare("SELECT COUNT(*) n, MIN(discovered_at) oldest, SUM(CASE WHEN attempts<3 THEN 1 ELSE 0 END) retryable, SUM(CASE WHEN attempts>=3 THEN 1 ELSE 0 END) exhausted FROM jobs WHERE state='queued' AND source NOT LIKE 'Upwork%'").first(),
  // Audit every registered collector, not a fixed shortlist of seven feeds.
  env.DB.prepare("SELECT source,last_success,last_error FROM source_state").all(),
  env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE julianday(discovered_at)>=julianday('now','-12 hours')").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE julianday(alerted_at)>=julianday('now','-12 hours')").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM jobs WHERE julianday(assessed_at)>=julianday('now','-12 hours')").first(),
  val("telegram_verified_delivery_last"),val("reddit_mcp_last_report"),
  val("hourly_pipeline_last"),val("hourly_pipeline_started")
 ]);
 return {lastRun,queue,sources:sources?.results||[],monitoring,last12:{
  inserted:inserted12?.n||0,assessed:assessed12?.n||0,sent:sent12?.n||0
 },delivery,reddit,pipeline,pipeline_started};
}
