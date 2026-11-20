// Durable Workflow action implementation. Cloudflare step names, retry policies,
// payload handling and return values are preserved from the original Workflow.
import { assess } from "../../ai/job-evaluation-service.js";
import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {runManualLeadDigest} from "../../features/delivery/manual-lead-digest.js";
import { deliverAllVerified, notifyRedditProspects } from "../../features/delivery/notification-service.js";
import { TELEGRAM_CMD_BASE, radarWebhookSecret, tg, verifyTelegram } from "../../features/delivery/telegram-transport.js";
import { COMMUNITY_FEEDS, communityScan } from "../../features/discovery/community-leads.js";
import { runDemandDigest } from "../../features/prospects/demand-discovery.js";
import { runProspectTriage } from "../../features/prospects/triage-service.js";
import { checkCommunityReplies } from "../../features/reddit/community-reply-check.js";
import {hasBrowserOneAIHub,oneAIHubCapabilities} from "../../integrations/oneaihub/capabilities.js";
import { iso, kyivDay, text } from "../../platform/runtime-utils.js";

export async function executeManualLeadsReviewAction({env,step,event,action,opts}) {
      return await step.do("business-problems-for-manual-contact-review",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"75 seconds"},
        ()=>runManualLeadDigest(env,{day:kyivDay(),preview:action==="manual_leads_preview",
          deliver:async text=>{
            await verifyTelegram(env);
            await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,
              parse_mode:"HTML",disable_web_page_preview:true});
          }
        }));
    }

export async function executeCommunityScanAction({env,step,event,action,opts}) {
      if(!RADAR_SETTINGS.leads.enabled||!RADAR_SETTINGS.community.enabled)return {state:"disabled_by_configuration"};
      const collected=await step.do("community-feed-collection",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"145 seconds"},
        ()=>communityScan(env,{limit:4}));
      const triage=await step.do("community-problem-analysis",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"145 seconds"},
        ()=>runProspectTriage(env));
      return {collected,triage};
    }

export async function executeCommunityReplyAuditAction({env,step,event,action,opts}) {
      return await step.do("inspect-existing-community-replies",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"110 seconds"},
        async()=>{
          const id=String(event.payload?.jobId||"").slice(0,60);
          if(!/^[0-9a-f]{20,60}$/i.test(id))return {state:"invalid_job_id"};
          const forumNames=(RADAR_SETTINGS.jobs.sources.items||[]).filter(x=>x.forumHiring===true).map(x=>x.name);
          const job=await env.DB.prepare(
            "SELECT id AS job_id,title,url,source FROM jobs WHERE id=? AND (source LIKE 'Community · %' OR source IN ("+(forumNames.map(()=>"?").join(",")||"NULL")+"))"
          ).bind(id,...forumNames).first();
          if(!job)return {state:"not_found"};
          return {job_id:id,...await checkCommunityReplies(env,job,MODEL)};
        });
    }

export async function executeProspectNotifyAction({env,step,event,action,opts}) {
      return await step.do("notify-existing-qualified-prospects",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"65 seconds"},
        ()=>notifyRedditProspects(env,true));
    }

export async function executeDemandPreviewAction({env,step,event,action,opts}) {
       if(!RADAR_SETTINGS.leads.enabled)return {state:"disabled_by_configuration"};
      return await step.do("independent-business-demand-digest",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"90 seconds"},
        ()=>runDemandDigest(env,{
          day:kyivDay(),
          slot:String(event.payload?.slot||("manual_"+kyivDay()+"_"+new Date().toISOString().slice(11,13))),
          send:action==="demand_digest",
          deliver:async text=>{
            await verifyTelegram(env);
            await tg(env,"sendMessage",{
              chat_id:env.TG_CHAT_ID,text,parse_mode:"HTML",disable_web_page_preview:true
            });
          }
        }));
    }

export async function executeProspectTriageAction({env,step,event,action,opts}) {
      return await step.do("classify-existing-reddit-prospects",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"140 seconds"},
        ()=>runProspectTriage(env));
    }

export async function executeRedditAction({env,step,event,action,opts}) {
       if(!RADAR_SETTINGS.leads.enabled||!RADAR_SETTINGS.reddit.enabled||!hasBrowserOneAIHub(env))return {state:"integration_disabled_or_unavailable"};
      const started=await step.do("start-manual-reddit",{retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"40 seconds"},async()=>{
        const id="manual-reddit-"+new Date().toISOString().replace(/[^0-9]/g,"").slice(0,14);
        await env.REDDIT_MCP_WORKFLOW.create({id,params:{hour:new Date().toISOString().slice(0,13),requestedByTelegram:true}});
        return id;
      });
      let status={status:"running"};
      for(let i=0;i<12;i++){
        await step.sleep("reddit-wait-"+i,"45 seconds");
        const snapshot=await step.do("reddit-state-"+i,{retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"15 seconds"},async()=>{
          const obj=await env.REDDIT_MCP_WORKFLOW.get(started);
          const v=await obj.status();
          return {status:String(v.status||"unknown"),output:v.output||null};
        });
        status=snapshot;
        if(["complete","errored","terminated"].includes(status.status))break;
      }
      const result=await step.do("reddit-done-notify",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"35 seconds"},async()=>{
          const raw=status.output||null;
          const o=raw?.result||raw?.output||raw;
          let message;
          if(status.status==="errored"||status.status==="terminated"){
            message="Reddit: ручний пошук завершився помилкою. Подробиці — /status.";
          }else if(status.status!=="complete"){
            message="Reddit ще виконується. Перевір результат через /status.";
          }else if(o?.state==="cooldown"||o?.state==="blocked"){
            message="Reddit: пошук призупинений захистом платформи. Час паузи — /status.";
          }else if(o?.state==="already_running"){
            message="Reddit: інша перевірка вже запущена. Повторний пошук не потрібен.";
          }else if(o?.state==="offline"){
            message="Reddit: браузер OneAIHUB недоступний. Подробиці — /status.";
          }else if(!o||!Number.isFinite(Number(o.checked))){
            message="Reddit: Workflow завершився, але не повернув результат. Не можу підтвердити кількість постів. Перевір /status.";
          }else if(Number(o.inserted||0)>0){
            message="Reddit: "+Number(o.inserted)+" нових постів передано на відбір. Це не підтверджені клієнти — релевантні можливості прийдуть окремо.";
          }else{
            message="Reddit: цього разу нових постів для відбору немає. Діагностика — /status.";
          }
          await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:message});
          return {workflow:status.status,checked:o?.checked??null,new_posts:o?.inserted??null};
        });
      return result;
    }

export async function executeAssessRedditAction({env,step,event,action,opts}) {
      const assessed=await step.do("assess-reddit-queue",{retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"5 minutes"},()=>assess(env));
      const alerts=await step.do("notify-qualified-reddit",{retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"90 seconds"},
        ()=>deliverAllVerified(env));
      // Any real P1/P2 discovery is already sent above. No numeric Telegram
      // completion message when the AI pass contains zero useful leads.
      return {assessed,alerts};
    }
