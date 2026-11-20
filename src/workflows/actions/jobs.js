// Durable Workflow action implementation. Cloudflare step names, retry policies,
// payload handling and return values are preserved from the original Workflow.
import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";
import {reviewBatch,seedBenchmark,scorecard,initOpportunity} from "../../features/ai/opportunity-intelligence.js";
import {runDirectContactDigest} from "../../features/delivery/direct-contact-digest.js";
import { formatTelegramJob } from "../../features/delivery/job-renderer.js";
import { deliverAllVerified, notifyRedditProspects } from "../../features/delivery/notification-service.js";
import { TELEGRAM_CMD_BASE, radarWebhookSecret, tg, verifyTelegram } from "../../features/delivery/telegram-transport.js";
import { COMMUNITY_FEEDS, communityScan } from "../../features/discovery/community-leads.js";
import {runDouReview} from "../../features/dou/dou-review.js";
import {runActionableReview} from "../../features/jobs/actionable-review.js";
import {runEligibilityReview} from "../../features/jobs/eligibility-review.js";
import { scan } from "../../features/jobs/scan-service.js";
import {getMeta,putMeta} from "../../platform/meta.js";
import { iso, kyivDay, text } from "../../platform/runtime-utils.js";

export async function executeOpportunityReviewAction({env,step,event,action,opts}) {
      // Shadow evaluation: no automatic Telegram send and no legacy status edits.
      return await step.do("evidence-first-opportunity-review",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"190 seconds"},
        ()=>reviewBatch(env,MODEL,Number(event.payload?.limit||5)));
    }

export async function executeOpportunityScorecardAction({env,step,event,action,opts}) {
      return await step.do("evidence-first-opportunity-scorecard",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"30 seconds"},
        ()=>scorecard(env));
    }

export async function executeOpportunityBenchmarkSeedAction({env,step,event,action,opts}) {
      return await step.do("seed-unlabeled-historical-sample",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"40 seconds"},
        async()=>({size:await seedBenchmark(env,100),human_labeled:false}));
    }

export async function executeDouReviewAction({env,step,event,action,opts}) {
      return await step.do("dou-user-verified-reviewed-leads",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"65 seconds"},
        ()=>runDouReview(env,{deliver:async msg=>{
          await verifyTelegram(env);
          return tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:msg,
            parse_mode:"HTML",disable_web_page_preview:true});
        }}));
    }

export async function executeDirectContactReviewAction({env,step,event,action,opts}) {
      return await step.do("direct-employer-digest",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"75 seconds"},
        ()=>runDirectContactDigest(env,{day:kyivDay(),preview:action==="direct_contact_preview",
          deliver:async msg=>{
            await verifyTelegram(env);
            await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:msg,
              parse_mode:"HTML",disable_web_page_preview:true});
          }
        }));
    }

export async function executeActionableReviewAction({env,step,event,action,opts}) {
      return await step.do("fast-human-applications",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"100 seconds"},
        ()=>runActionableReview(env,{preview:action==="actionable_preview",deliver:async msg=>{
          await verifyTelegram(env);
          await tg(env,"sendMessage",{
            chat_id:env.TG_CHAT_ID,text:msg,parse_mode:"HTML",disable_web_page_preview:true
          });
        }}));
    }

export async function executeEligibilityReviewAction({env,step,event,action,opts}) {
      return await step.do("unverified-geography-review",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"75 seconds"},
        ()=>runEligibilityReview(env,{day:kyivDay(),preview:action==="eligibility_preview",
          deliver:async text=>{
            await verifyTelegram(env);
            await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,
              parse_mode:"HTML",disable_web_page_preview:true});
          }
        }));
    }

export async function executeJobDetailPreviewAction({env,step,event,action,opts}) {
      // Safe diagnostic: enrich stored job text; do NOT notify Telegram or mark delivered.
      return await step.do("preview-single-job-description",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"110 seconds"},
        async()=>{
          const id=String(event.payload?.jobId||"");
          if(!/^[a-f0-9]{20,40}$/i.test(id))return {state:"invalid_job_id"};
          const job=await env.DB.prepare("SELECT id,title,source,score,priority,company,region,published_at,url,description,reason FROM jobs WHERE id=?")
            .bind(id).first();
          if(!job)return {state:"not_found"};
          const message=await formatTelegramJob(env,job,0);
          const saved=await getMeta(env,"job_detail_v3_"+id);
          return {state:"ok",job_id:id,description_saved:!!saved,
            chars:message.length,telegram_preview:message};
        });
    }

export async function executeScanAction({env,step,event,action,opts}) {
      const community=await step.do("manual-community-feed-check",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"145 seconds"},
        ()=>communityScan(env,{limit:4}));
      const result=await step.do("manual-scan-all-sources",opts,()=>scan(env,true));
      const first=await step.do("manual-send-all-verified",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"120 seconds"},
        ()=>deliverAllVerified(env));
      await step.do("manual-scan-finished",{retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"35 seconds"},async()=>{
        const delivered=Number(first?.jobs_sent||0)+Number(first?.prospects_sent||0);
        const message=delivered>0
          ?"Ручний Radar завершено: "+delivered+" нових відповідних можливостей уже надіслано. Огляд із посиланнями: /leads"
          :"Ручний Radar завершено. Нових підтверджених можливостей цього разу немає; дублікати й нерелевантні записи пропущено. Останні знайдені: /leads. Діагностика: /status.";
        await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text:message});
      });
      return {result:{scanned:result.scanned,inserted:result.inserted,
        assessed:result.assessed,kept:result.kept,errors:result.errors?.length||0},
        alerts:first};
    }
