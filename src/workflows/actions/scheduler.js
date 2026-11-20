// Durable Workflow action implementation. Cloudflare step names, retry policies,
// payload handling and return values are preserved from the original Workflow.
import { assess } from "../../ai/job-evaluation-service.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import { deliverAllVerified, notifyRedditProspects } from "../../features/delivery/notification-service.js";
import { TELEGRAM_CMD_BASE, radarWebhookSecret, tg, verifyTelegram } from "../../features/delivery/telegram-transport.js";
import { collect } from "../../features/discovery/job-collector.js";
import { PROBE_FEEDS } from "../../features/discovery/source-fetch.js";
import {runDouReview} from "../../features/dou/dou-review.js";
import { scan } from "../../features/jobs/scan-service.js";
import { radarCriticalAlert, runHourlyHealthAudit } from "../../features/observability/health-service.js";
import {utcHourSlot,hourlyWorkflowId,needsHourlyRescue} from "../../features/scheduler/hourly-autonomy.js";
import {hourlyRecoveryNeeded} from "../../features/scheduler/hourly-recovery.js";
import {hasBrowserOneAIHub,oneAIHubCapabilities} from "../../integrations/oneaihub/capabilities.js";
import {getMeta,putMeta} from "../../platform/meta.js";
import { iso, kyivDay, text } from "../../platform/runtime-utils.js";

export async function executeHourlyHealthAuditAction({env,step,event,action,opts}) {
      return await step.do("run-native-health-audit",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"180 seconds"},
        ()=>runHourlyHealthAudit(env));
    }

export async function executeDouBootstrapAction({env,step,event,action,opts}) {
      if(!RADAR_SETTINGS.integrations.dou.enabled||!hasBrowserOneAIHub(env)||!env.DOU_BROWSER_WORKFLOW||env.DOU_BROWSER_ENABLED!=="1")
        return {state:"browser_workflow_unavailable"};
      const id="dou-manual-"+crypto.randomUUID();
      const slot=iso();
      const instance=await step.do("launch-dou-browser-only",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"30 seconds"},
        ()=>env.DOU_BROWSER_WORKFLOW.create({
          id,params:{slot,origin:"manual_probe"}
        }));
      return {state:"browser_workflow_started",id:instance.id||id};
    }

export async function executeFastSourcesAction({env,step,event,action,opts}) {
      // Fast, independently throttled discovery. The Cron only starts this
      // Workflow; no browser, Upwork or expensive full-pipeline crawl here.
      const report=await step.do("fast-source-collect-and-assess",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"4 minutes"},
        ()=>scan(env,false,{mode:"fast"}));
      const notified=await step.do("fast-source-verified-delivery",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"90 seconds"},
        ()=>deliverAllVerified(env));
      const douReview=await step.do("fast-dou-review",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"60 seconds"},
        ()=>runDouReview(env,{deliver:async msg=>{
          await verifyTelegram(env);
          return tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:msg,
            parse_mode:"HTML",disable_web_page_preview:true});
        }}));
      const result={state:"completed",at:iso(),dou_review:douReview?.state,
        origin:String(event.payload?.origin||"manual_probe"),slot:String(event.payload?.slot||""),
        scanned:report?.scanned||0,inserted:report?.inserted||0,
        assessed:report?.assessed||0,kept:report?.kept||0,
        errors:report?.errors?.slice(0,4)||[],
        delivery:notified?.state||"unknown",jobs_sent:notified?.jobs_sent||0};
      await step.do("fast-source-report",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"15 seconds"},
        ()=>putMeta(env,"fast_source_last",JSON.stringify(result)));
      return result;
    }

export async function executeHourlyPipelineAction({env,step,event,action,opts}) {
      // Durable pipeline: the Cron Trigger only creates this instance.
      // Each major stage is persisted independently by Cloudflare Workflows.
      // Regular P1/P2 qualification and delivery rules remain unchanged.
      const slot=String(event.payload?.slot||"");
      hourlyWorkflowId(slot); // reject malformed IDs
      const origin=event.payload?.manualProbe===true?"manual_probe":
        event.payload?.recovery===true?"recovery":"scheduled";
      const report={slot,origin,state:"running",started_at:iso(),stages:{},errors:[]};
      await step.do("hourly-start-checkpoint",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"20 seconds"},
        ()=>putMeta(env,"hourly_pipeline_started",JSON.stringify(report)));
      try {
        report.stages.sources=await step.do("hourly-collect-and-assess",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"8 minutes"},
          async()=>{
            const r=await scan(env,false);
            return {scanned:Number(r.scanned||0),fetched:Number(r.fetched||0),
              inserted:Number(r.inserted||0),assessed:Number(r.assessed||0),
              kept:Number(r.kept||0),errors:Array.isArray(r.errors)?r.errors.length:0,
              model_error:String(r.model_error||"").slice(0,130)};
          });
        // Most RSS sources have 2-4 hour polling intervals. No sources due
        // is normal, not a scan failure and must never trigger recovery.
        if(report.stages.sources.scanned===0&&report.stages.sources.errors===0){
          report.stages.sources.state="no_sources_due";
        }else if(report.stages.sources.model_error){
          report.errors.push("general_scan_ai_failed");
        }else if(report.stages.sources.errors>0&&report.stages.sources.scanned===0){
          report.errors.push("general_scan_failed");
        }else{
          report.stages.sources.state="completed";
        }
      }catch(e){
        report.errors.push("general_scan_failed:"+String(e?.message||e).slice(0,110));
      }
      // Source delivery must not wait on Upwork OAuth/search.
      try {
        const d=await step.do("hourly-immediate-telegram-delivery",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"150 seconds"},
          ()=>deliverAllVerified(env));
        report.stages.delivery={state:d?.state||"done",
          jobs_sent:Number(d?.jobs_sent||0),prospects_sent:Number(d?.prospects_sent||0)};
      }catch(e){report.errors.push("telegram_delivery_failed:"+String(e?.message||e).slice(0,110))}
      try {
        const d=await step.do("hourly-final-telegram-delivery",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"120 seconds"},
          ()=>deliverAllVerified(env));
        report.stages.final_delivery={state:d?.state||"done",
          jobs_sent:Number(d?.jobs_sent||0)};
      }catch(e){report.errors.push("final_delivery_failed:"+String(e?.message||e).slice(0,110))}
      try {
        report.stages.health=await step.do("hourly-health-snapshot",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"110 seconds"},
          async()=>{
            const h=await runHourlyHealthAudit(env);
            return {ok:h?.state==="ok",state:String(h?.state||"unknown"),
              problems:Array.isArray(h?.problems)?h.problems.slice(0,8):[]};
          });
      }catch(e){report.errors.push("health_audit_failed:"+String(e?.message||e).slice(0,110))}
      report.state=report.errors.length?"degraded":"completed";
      report.completed_at=iso();
      await step.do("hourly-final-checkpoint",
        {retries:{limit:1,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
        ()=>putMeta(env,"hourly_pipeline_last",JSON.stringify(report)));
      // Alert once for actual pipeline failures; don't fabricate job matches.
      if(report.errors.length)
        await step.do("hourly-error-diagnostic",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"30 seconds"},
          ()=>radarCriticalAlert(env,report.errors).catch(e=>
            console.error("hourly_pipeline critical alert",String(e?.message||e).slice(0,100))));
      return report;
    }

export async function executeHourlyRecoveryAction({env,step,event,action,opts}) {
      const last=await env.DB.prepare("SELECT started_at FROM runs ORDER BY id DESC LIMIT 1").first();
      if(!hourlyRecoveryNeeded(last?.started_at))return {state:"recent_scan_exists"};
      const collected=await step.do("recover-due-source-scan",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"5 minutes"},
        ()=>scan(env,false));
      const delivered=await step.do("recover-verified-delivery",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"120 seconds"},
        ()=>deliverAllVerified(env));
      const report={state:"done",at:iso(),scanned:collected?.scanned,inserted:collected?.inserted,
        assessed:collected?.assessed,sent:delivered?.jobs_sent||0};
      await putMeta(env,"hourly_recovery_last",JSON.stringify(report));
      return report;
    }

export async function executeSourceAuditOnceAction({env,step,event,action,opts}) {
      // Explicit diagnostic on the real hourly collectors, without status
      // spam. Only genuinely qualified unseen opportunities notify Telegram.
      const collected=await step.do("collect-due-sources",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"250 seconds"},
        ()=>collect(env,false));
      const ai=await step.do("evaluate-fresh-queue",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"130 seconds"},
        ()=>assess(env));
      const alerts=await step.do("deliver-qualified-only",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"180 seconds"},
        ()=>deliverAllVerified(env));
      return {collected,ai,alerts};
    }

export async function executeProbeNewFeedsAction({env,step,event,action,opts}) {
      return await step.do("verify-public-rss-endpoints-on-cloudflare",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"120 seconds"},
        async()=>{
          const results=[];
          for(let i=0;i<PROBE_FEEDS.length;i+=4){
            const batch=await Promise.all(PROBE_FEEDS.slice(i,i+4).map(async([name,url])=>{
              try{
                const res=await fetch(url,{headers:{Accept:"application/rss+xml,application/atom+xml,text/xml"},signal:AbortSignal.timeout(8500)});
                const ct=res.headers.get("content-type")||"";
                const body=(await res.text()).slice(0,250000);
                const rss=/<rss[\s>]/i.test(body)||/<feed[\s>]/i.test(body);
                const items=[...body.matchAll(/<item(?:\s[^>]*)?>/gi)].length+
                  [...body.matchAll(/<entry(?:\s[^>]*)?>/gi)].length;
                return {name,url,http:res.status,rss,items,content_type:ct.slice(0,65)};
              }catch(e){return {name,url,error:String(e?.name||"fetch_error")};}
            }));
            results.push(...batch);
          }
          return results;
        });
    }
