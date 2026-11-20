import{interpretRadarHealth as f}from '../src/features/observability/hourly-health.js';
const now=Date.parse('2026-10-22T01:00:00Z'),iso=m=>new Date(now-m*60000).toISOString();
const healthy={lastRun:{started_at:iso(5)},delivery:JSON.stringify({checked_at:iso(5),state:"ok",jobs_sent:0,errors:[]}),reddit:JSON.stringify({completed:iso(8),state:"ok"}),queue:{n:0},sources:[],last12:{inserted:12,assessed:12,sent:0}};
const checks=[
["healthy_zero_alerts",healthy,"ok",null],
["telegram_stalled",{...healthy,delivery:JSON.stringify({checked_at:iso(48),state:"ok",errors:[]})},"degraded","telegram_delivery_check_stale"],
["retired_upwork_stale_is_not_a_fault",{...healthy,upwork:JSON.stringify({checked_at:iso(210)})},"ok",null],
 ["retired_upwork_missing_is_not_a_fault",{...healthy,upwork:null},"ok",null],
 ["retired_upwork_does_not_hide_real_fault",{...healthy,upwork:JSON.stringify({checked_at:iso(210)}),reddit:JSON.stringify({completed:iso(177),state:"ok"})},"degraded","reddit_discovery_stale"],
["reddit_stalled",{...healthy,reddit:JSON.stringify({completed:iso(177),state:"ok"})},"degraded","reddit_discovery_stale"],
["exhausted_queue",{...healthy,queue:{n:7,retryable:0,exhausted:7,oldest:iso(120)}},"degraded","queued_jobs_retries_exhausted"],
["queued_jobs",{...healthy,queue:{n:4,oldest:iso(120)}},"degraded","queued_jobs_delayed"],
["single_failed_source",{...healthy,sources:[{source:"n8n Jobs",last_success:1,last_error:"HTTP 429 RETRY_AT:9999999999"}]},"ok",null],
["stale_actual_scan",{...healthy,lastRun:{started_at:iso(130)}},"degraded","hourly_scan_stale"],
["autonomous_workflow_healthy_no_due_sources",{...healthy,lastRun:{started_at:iso(130)},
 pipeline:JSON.stringify({slot:"2026102201",origin:"scheduled",state:"completed",completed_at:iso(8),
 stages:{sources:{scanned:0,state:"no_sources_due"}}})},"ok",null],
["rescue_workflow_healthy",{...healthy,lastRun:{started_at:iso(130)},
 pipeline:JSON.stringify({slot:"2026102201",origin:"recovery",state:"completed",completed_at:iso(9)})},"ok",null],
["workflow_running",{...healthy,lastRun:{started_at:iso(130)},
 pipeline_started:JSON.stringify({slot:"2026102201",origin:"scheduled",state:"running",started_at:iso(3)})},"ok",null],
["manual_probe_cannot_mask_failure",{...healthy,lastRun:{started_at:iso(130)},
 pipeline:JSON.stringify({slot:"2026102201",origin:"manual_probe",state:"completed",completed_at:iso(7)})},"degraded","hourly_scan_stale"],
["workflow_degraded_not_healthy",{...healthy,lastRun:{started_at:iso(130)},
 pipeline:JSON.stringify({slot:"2026102201",origin:"recovery",state:"degraded",completed_at:iso(7)})},"degraded","hourly_scan_stale"]
];
let errors=0;for(const [name,entry,state,problem]of checks){const result=f(entry,now);const ok=result.state===state&&(!problem||result.problems.includes(problem));console.log(name,ok?"PASS":"FAIL",result.state,result.problems.join(","),result.warnings.join(","));if(!ok)errors++;}
if(errors)process.exit(1);


// Sources removed from the active profile must not degrade the current radar.
const historical=Array.from({length:3},(_,i)=>({source:"retired_"+i,last_success:1,last_error:null}));
const active={source:"current",last_success:Math.floor((now-5*3600000)/1000),last_error:null};
let snapshot={...healthy,sources:[...historical,active],reddit:null,
 monitoring:{redditEnabled:false,jobsEnabled:true,telegramEnabled:true,activeSourceHours:{current:4}}};
let activeOnly=f(snapshot,now);
if(activeOnly.state!=="ok"||activeOnly.problems.includes("reddit_discovery_stale")||
 activeOnly.problems.includes("multiple_sources_stale")||activeOnly.sources_stale.length)
 throw Error("Inactive Reddit and historical sources must not count as outages");
snapshot={...snapshot,monitoring:{...snapshot.monitoring,activeSourceHours:{current:24}}};
if(f(snapshot,now).sources_stale.length)throw Error("Source cadence must be honored");
snapshot={...snapshot,monitoring:{...snapshot.monitoring,activeSourceHours:Object.fromEntries(
 historical.map(x=>[x.source,4]))}};
if(!f(snapshot,now).problems.includes("multiple_sources_stale"))
 throw Error("Three genuinely active stale sources must still degrade health");
console.log("PASS health monitoring excludes disabled Reddit and retired source-state rows");
