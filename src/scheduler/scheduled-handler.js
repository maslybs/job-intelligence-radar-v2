// Cloudflare cron scheduler with original cadence and Workflow dispatch.
// Extracted from the production-compatible Worker without modifying the bodies.
import {RADAR_SETTINGS} from "../config/radar.generated.js";
import {getMeta,putMeta} from "../platform/meta.js";
import { runDemandDigest } from "../features/prospects/demand-discovery.js";
import {hasBrowserOneAIHub,oneAIHubCapabilities} from "../integrations/oneaihub/capabilities.js";
import {utcHourSlot,hourlyWorkflowId,needsHourlyRescue} from "../features/scheduler/hourly-autonomy.js";
import { assess } from "../ai/job-evaluation-service.js";
import { deliverAllVerified } from "../features/delivery/notification-service.js";
import { tg, verifyTelegram } from "../features/delivery/telegram-transport.js";
import { iso, kyivDay, text } from "../platform/runtime-utils.js";

export async function scheduled(event, env, ctx) {
    // Fast Reddit discovery cadence is independent of the original hourly
    // Upwork/general scan. Browser access is still serialized by D1 lease.
    if(event.cron==="*/5 * * * *"){
      // Separate, twice-daily Demand Discovery uses only D1 data:
      // no Reddit browsing, Upwork requests or P1/P2 job filters.
      // Always use the PLANNED cron fire time: delayed Cloudflare dispatch
      // must not skip fixed-time digests or cause incorrect Reddit slot IDs.
      const scheduledAt=new Date(Number(event.scheduledTime||Date.now()));
      const localClock=new Intl.DateTimeFormat("en-GB",{
        timeZone:RADAR_SETTINGS.notifications.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"
      }).format(scheduledAt);
      // Low-latency client-job discovery every 5 minutes (except hourly :00).
      // Keep one unique Workflow per slot; publishers have their own cooldown.
      if(scheduledAt.getUTCMinutes()!==0&&env.MANUAL_RADAR_WORKFLOW){
        const fastId="fast-sources-"+scheduledAt.toISOString().slice(0,16).replace(/[^0-9]/g,"");
        ctx.waitUntil((async()=>{
          await env.MANUAL_RADAR_WORKFLOW.create({
            id:fastId,params:{action:"fast_sources",origin:"scheduled",slot:fastId}
          });
          await putMeta(env,"fast_cron_last_scheduled",JSON.stringify({
            slot:fastId,at:iso(),planned_at:scheduledAt.toISOString()
          }));
        })().catch(e=>console.error("fast-source cron",String(e?.message||e).slice(0,140))));
      }
      if(RADAR_SETTINGS.leads.enabled && RADAR_SETTINGS.notifications.telegramEnabled && localClock.endsWith(":00") && RADAR_SETTINGS.notifications.telegramDigestHours.includes(Number(localClock.slice(0,2)))){
        const day=kyivDay(),slot="scheduled_"+day+"_"+localClock.slice(0,2);
        ctx.waitUntil(runDemandDigest(env,{day,slot,send:true,deliver:async text=>{
          await verifyTelegram(env);
          await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,
            parse_mode:"HTML",disable_web_page_preview:true});
        }}).then(result=>putMeta(env,"demand_digest_last",JSON.stringify({
          ...result,checked_at:iso()
        }))).catch(e=>console.error("independent demand discovery",
          String(e?.message||e).slice(0,150))));
      }
      if(RADAR_SETTINGS.jobs.enabled&&RADAR_SETTINGS.notifications.telegramEnabled&&localClock==="12:30"&&env.MANUAL_RADAR_WORKFLOW){
        ctx.waitUntil(env.MANUAL_RADAR_WORKFLOW.create({
          id:"direct-employer-shortlist-"+kyivDay(),params:{action:"direct_contact_review"}
        }).catch(e=>console.error("direct-employer-digest",String(e?.message||e).slice(0,140))));
      }
      // DOU behaves like Reddit: private browser MCP in a separate
      // Cloudflare Workflow. Never call jobs.dou.ua directly from Workers.
      // One search + at most one detail every 10 minutes, rotating
      // targets; shorter revisit latency without tripling page traffic.
      if(scheduledAt.getUTCMinutes()%10===5&&
        RADAR_SETTINGS.integrations.dou.enabled&&RADAR_SETTINGS.jobs.browserSources.dou.enabled&&hasBrowserOneAIHub(env)&&env.DOU_BROWSER_ENABLED==="1"&&env.DOU_BROWSER_WORKFLOW&&env.ONEAIHUB_VPC){
        const douSlot=scheduledAt.toISOString();
        ctx.waitUntil(env.DOU_BROWSER_WORKFLOW.create({
          id:"dou-browser-"+douSlot.slice(0,16).replace(/[^0-9]/g,""),
          params:{slot:douSlot,origin:"scheduled"}
        }).then(()=>putMeta(env,"dou_browser_cron_last",JSON.stringify({
          scheduled_at:douSlot,created_at:iso()
        }))).catch(e=>console.error("DOU browser schedule",
          String(e?.message||e).slice(0,130))));
      }
      // Dedicated timely review of publicly reachable, high-fit work that P1/P2
      // cannot verify yet. It does not change or silence verified delivery.
      if(RADAR_SETTINGS.jobs.enabled&&RADAR_SETTINGS.notifications.telegramEnabled&&localClock.endsWith(":30")&&["06","09","12","15","18","21"].includes(localClock.slice(0,2))
        &&env.MANUAL_RADAR_WORKFLOW){
        ctx.waitUntil(env.MANUAL_RADAR_WORKFLOW.create({
          id:"timely-applications-"+kyivDay()+"-"+localClock.slice(0,2),
          params:{action:"actionable_review"}
        }).catch(e=>console.error("actionable shortlist schedule",
          String(e?.message||e).slice(0,130))));
      }
      // Manual-review lane does not claim any author is hiring. A few high-fit
      // business pains are sent to the owner, never contacted automatically.
      if(RADAR_SETTINGS.leads.enabled&&RADAR_SETTINGS.notifications.telegramEnabled&&localClock==="13:30"&&env.MANUAL_RADAR_WORKFLOW){
        ctx.waitUntil(env.MANUAL_RADAR_WORKFLOW.create({
          id:"manual-business-contacts-"+kyivDay(),params:{action:"manual_leads_review"}
        }).catch(e=>console.error("manual lead shortlist",
          String(e?.message||e).slice(0,140))));
      }
      // An independent 10-minute Cron validates each primary hourly Workflow.
      // At :20, start a single rescue only if the primary is absent, failed or
      // completed degraded. Checking Workflow status avoids the previous 95-min
      // blind spot and never starts a duplicate when the primary is running.
      if(scheduledAt.getUTCMinutes()===20
        &&env.MANUAL_RADAR_WORKFLOW){
        ctx.waitUntil((async()=>{
          const slot=utcHourSlot(event.scheduledTime||Date.now());
          const id=hourlyWorkflowId(slot);
          let primary=null,completed=null;
          try{
            const obj=await env.MANUAL_RADAR_WORKFLOW.get(id);
            primary=await obj.status();
          }catch(e){console.error("hourly status probe",
            String(e?.message||e).slice(0,100))}
          try{completed=JSON.parse(await getMeta(env,"hourly_pipeline_last")||"null")}catch{}
          if(!needsHourlyRescue(primary,completed,slot))return;
          const rescueId=hourlyWorkflowId(slot,"hourly-rescue");
          await env.MANUAL_RADAR_WORKFLOW.create({
            id:rescueId,params:{action:"hourly_pipeline",slot,recovery:true}
          });
          await putMeta(env,"hourly_rescue_last_scheduled",JSON.stringify({
            slot,id:rescueId,primary_state:String(primary?.status||"not_found"),
            at:iso()
          }));
        })().catch(e=>console.error("hourly workflow rescue",
          String(e?.message||e).slice(0,180))));
      }
      // Daily short review of strong jobs with geography still unconfirmed.
      if(RADAR_SETTINGS.jobs.enabled&&RADAR_SETTINGS.notifications.telegramEnabled&&localClock==="09:30"&&env.MANUAL_RADAR_WORKFLOW){
        ctx.waitUntil(env.MANUAL_RADAR_WORKFLOW.create({
          id:"eligibility-review-"+kyivDay(),params:{action:"eligibility_review"}
        }).catch(e=>console.error("manual eligibility digest",String(e?.message||e).slice(0,130))));
      }
      // Analyze the existing D1 queue every 10 minutes, except at :00
      // when the hourly scanner already calls assess(). No Reddit browsing.
      if(RADAR_SETTINGS.jobs.enabled&&scheduledAt.getUTCMinutes()!==0&&scheduledAt.getUTCMinutes()%10===0){
        ctx.waitUntil((async()=>{
          const result=await assess(env);
          if(result?.model_error) console.error("queue AI analysis",result.model_error);
          if(result?.assessed>0) await deliverAllVerified(env);
        })().catch(e=>console.error("queued job processing",String(e?.message||e).slice(0,160))));
      }
      ctx.waitUntil((async()=>{
        const slot=scheduledAt.toISOString().slice(0,16),id=slot.replace(/[^0-9]/g,"");
        // Delivery is separate from polling. Every 10 minutes, any new
        // verified item in D1 is sent, even when no new source is scanned.
        try {await deliverAllVerified(env)}catch(e){
          console.error("verified lead delivery",String(e?.message||"Error").slice(0,130))
        }
        // Reuse existing cadence. Prospect triage only reads D1;
        // it does not navigate Reddit or increase site requests.
        if(RADAR_SETTINGS.leads.enabled&&RADAR_SETTINGS.community.enabled&&scheduledAt.getUTCMinutes()%30===0&&env.MANUAL_RADAR_WORKFLOW){
          try {await env.MANUAL_RADAR_WORKFLOW.create({
            id:"community-scan-"+id,params:{action:"community_scan"}
          })}catch(e){console.error("community scan schedule",String(e?.name||"Error"))}
        }
        // Reddit now checks every 5 minutes. Keep costly original-post +
        // comment review at 10 minutes; one new/search feed each cycle.
        if(!RADAR_SETTINGS.leads.enabled||!RADAR_SETTINGS.reddit.enabled||!hasBrowserOneAIHub(env)||env.REDDIT_MCP_ENABLED!=="1"||!env.REDDIT_MCP_WORKFLOW||!env.ONEAIHUB_VPC||
          !(env.ONEAIHUB_MCP_BEARER_TOKEN || (env.ONEAIHUB_MCP_CLIENT_ID&&env.ONEAIHUB_MCP_CLIENT_SECRET)))
          return;
        try {await env.REDDIT_MCP_WORKFLOW.create({
          id:"reddit-fast-"+id,
          params:{hour:slot,reviewDue:scheduledAt.getUTCMinutes()%10===0}
        })}catch(e){console.error("reddit adaptive cron",String(e?.name||"Error"))}
      })());
      return;
    }
    // The scheduled Worker request is deliberately tiny. A long fetch or
    // Upwork request MUST NOT execute directly inside the Cron Trigger.
    if(event.cron!=="0 * * * *")return;
    ctx.waitUntil((async()=>{
      if(!env.MANUAL_RADAR_WORKFLOW)
        throw Error("MANUAL_RADAR_WORKFLOW binding is unavailable");
      const slot=utcHourSlot(event.scheduledTime||Date.now());
      const id=hourlyWorkflowId(slot);
      await env.MANUAL_RADAR_WORKFLOW.create({
        id,params:{action:"hourly_pipeline",slot,recovery:false}
      });
      await putMeta(env,"hourly_cron_last_scheduled",JSON.stringify({
        slot,id,at:iso(),cron:event.cron
      }));
      // Evidence review also runs in a durable Workflow without waiting for
      // the general scan; its result is shadow-only and never blocks delivery.
      await env.MANUAL_RADAR_WORKFLOW.create({
        id:"evidence-opportunities-"+slot,
        params:{action:"opportunity_review",limit:5}
      }).catch(e=>console.error("hourly shadow review schedule",
        String(e?.message||e).slice(0,130)));
    })().catch(e=>console.error("hourly workflow scheduling failed",
      String(e?.message||e).slice(0,180))));
  }
