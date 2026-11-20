import {sendOnce} from "./telegram-outbox.js";
// Commercial client-lead delivery and verification.

// Function bodies unchanged from the pre-refactor Worker.

import {getMeta,putMeta} from "../../platform/meta.js";

import { ensureUpworkCompetitionTable,observeUpworkCompetition,verifiedUpworkCompetition,upworkCompetitionDecision,proposalTierUpper } from "../../integrations/upwork/upwork-competition.js";

import { upworkLocationEligibility } from "../../integrations/upwork/upwork-location.js";

import {sourceIsActionable,listingIsActionable} from "../discovery/source-accessibility.js";

import {reviewDecision} from "../jobs/review-decision.js";

import {RADAR_SETTINGS} from "../../config/radar.generated.js";

import {ensureProspectTable,prospectStats,assessExistingRedditProspects,getProspectsForReview,markProspectsNotified} from "../prospects/prospect-intelligence.js";

import { COMMUNITY_FEEDS, communityScan } from "../discovery/community-leads.js";

import {ensureRedditThreadReviewTable,getRedditThreadReview,reddThreadIsDeliverable} from "../reddit/reddit-thread-review.js";

import { checkCommunityReplies } from "../reddit/community-reply-check.js";

import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";

import {commercialIntentLabel} from "../prospects/prospect-commercial.js";

import {redditDirectOffer} from "../reddit/reddit-direct-offer.js";

import {highFitFresh} from "../jobs/competitive-review.js";

import { settleIndependentPipelines, fairDeliveryBatch } from "../scheduler/pipeline-isolation.js";

import { formatTelegramJob } from "./job-renderer.js";

import { tg, verifyTelegram } from "./telegram-transport.js";

import { esc, iso, kyiv, kyivDay, text } from "../../platform/runtime-utils.js";



export async function notifyRedditProspects(env,send=true) {
  if(!RADAR_SETTINGS.leads.enabled)return {sent:false,reason:"client_leads_disabled"};
  if(!RADAR_SETTINGS.notifications.telegramEnabled&&send)return {sent:false,reason:"telegram_disabled"};
  await ensureProspectTable(env);
  const key="reddit_prospect_alerts_"+kyivDay();
  const used=Number(await getMeta(env,key)||0);
  // Hard cap protects the user from hundreds of low-confidence prospects.
  if(used>=12)return {sent:false,reason:"daily_prospect_cap"};
  const rows=await getProspectsForReview(env,18);
  if(!rows.length)return {sent:false,reason:"no_actionable_problems"};
  const allowed=new Set(COMMUNITY_FEEDS.map(x=>new URL(x.url).hostname).concat(["www.reddit.com"]));
  const selected=[];
  let communityChecks=0;
  for(const x of rows){
    if(selected.length>=Math.min(3,12-used))break;
    let valid=false;
    try{const u=new URL(x.url);valid=u.protocol==="https:"&&allowed.has(u.hostname)}catch{}
    if(!valid)continue;
    const commentReview=String(x.source).startsWith("Reddit")
      ?await getRedditThreadReview(env,x.job_id):null;
    if(String(x.source).startsWith("Reddit")&&!reddThreadIsDeliverable(commentReview))
      continue;
    let discussion=null,discussionWarning="";
    if(String(x.source).startsWith("Community · ")){
      // A helpful existing answer makes the lead non-actionable.
      // Never misrepresent unreadable comments as no answers.
      if(communityChecks>=6)continue;
      communityChecks++;
      discussion=await checkCommunityReplies(env,x,MODEL);
      // Direct, compelling paid offers should not silently disappear merely
      // because the forum's public reply API blocked access. Never claim
      // zero replies in this case. Unresolved ordinary questions still fail closed.
      if(discussion.state!=="open"){
        if(discussion.state==="unavailable"&&
           x.commercial_intent==="paid_request"&&Number(x.commercial_score)>=92)
          discussionWarning="Відповіді та кількість пропозицій перевірити не вдалося; можливість може бути вже закрита.";
        else continue;
      }
    }
    const discussionLine=discussionWarning
      ?"\n<b>Статус обговорення:</b> "+esc(discussionWarning)
      :discussion
      ?"\n<b>Відповіді перевірено:</b> "+(Number(discussion.count)===0
       ?"Поки немає жодної.":esc(String(discussion.count)+" відповідей; "+
          String(discussion.open_uk||"проблема ще не вирішена").slice(0,200))):"";
    const commentLine=commentReview
      ?"\n<b>Коментарі:</b> "+esc(String(commentReview.comment_summary_uk||commentReview.reason_uk||"").slice(0,230))+
        "\n<b>Конкуренція:</b> "+esc(commentReview.competition==="low"?"мало видимих пропозицій":
          commentReview.competition==="medium"?"помірна": "немає надійного виміру")+
        (commentReview.offer_count!==null?" · явних пропозицій у видимих коментарях: "+Number(commentReview.offer_count):""):"";
    const direct=x.commercial_intent==="paid_request";
    const prospectTitle=direct?"🟢 ПЛАТНИЙ ЗАПИТ":
      x.commercial_intent==="seeking_contractor"?"🟡 ПОТЕНЦІЙНИЙ КЛІЄНТ":
      "🟡 ПРОБЛЕМА БІЗНЕСУ · найм не підтверджено";
    const text="<b>"+prospectTitle+" · "+esc(String(x.source).replace("Community · ",""))+
      "</b>\n"+
      "<b>Технічна відповідність:</b> "+Number(x.fit)+"/100 · <b>Сила комерційного сигналу:</b> "+Number(x.commercial_score)+"/100\n"+
      "<b>Тип запиту:</b> "+esc(commercialIntentLabel(x.commercial_intent))+"\n"+
      "<b>Чому це схоже на потенційне замовлення:</b> "+esc(String(x.buyer_evidence_uk||"").slice(0,270))+"\n"+
      (x.paid_work_uk?"<b>Можливий результат платної роботи:</b> "+esc(String(x.paid_work_uk).slice(0,230))+"\n":"")+
      "<b>Проблема:</b> "+esc(String(x.problem_uk||"").slice(0,190))+"\n"+
      "<b>Як можеш допомогти:</b> "+esc(String(x.solution_uk||"").slice(0,235))+"\n"+
      (x.reply_uk?"<b>Ідея корисної відповіді:</b> "+esc(String(x.reply_uk).slice(0,315))+"\n":"")+
      commentLine+discussionLine+"\n"+
      "<b>Важливо:</b> "+esc(String(x.caveat_uk||"Оплата й намір найняти виконавця не підтверджені.").slice(0,170))+"\n"+
      "<a href=\""+esc(x.url)+"\">Відкрити допис ↗</a>\n"+
      "<i>"+(x.payment_confirmed===1?"Оплата згадується автором. ":
        "Бюджет / оплата не підтверджені. ")+
      "Жодних автоматичних DM.</i>";
    if(text.length>3800)continue;
    selected.push({id:x.job_id,text});
  }
  if(!selected.length)return {sent:false,reason:"invalid_prospect_urls"};
  if(!send)return {preview:true,count:selected.length,messages:selected.map(x=>x.text)};
  await verifyTelegram(env);
  let sent=0;
  for(const x of selected){
    // One Telegram message / one D1 acknowledgment avoids losing unsent
    // prospects after an error in a long combined HTML message.
    const delivery=await sendOnce(env,{key:"qualified_prospect:"+x.id,text:x.text});
    if(!delivery.sent)continue;
    await markProspectsNotified(env,[x.id]);
    sent++;
  }
  if(sent)await putMeta(env,key,String(used+sent));
  return {sent:sent>0,count:sent};
}

export async function notifyRequestedRedditAudit(env) {
  const jobId=await getMeta(env,"reddit_user_requested_audit_job");
  if(!jobId)return {state:"none"};
  const ackKey="reddit_user_requested_audit_sent_"+jobId;
  if(await getMeta(env,ackKey))return {state:"already_sent"};
  await ensureRedditThreadReviewTable(env);
  const row=await env.DB.prepare(
    "SELECT r.status,r.competition,r.offer_count,r.author_engaged,r.comments_observed,"+
    "r.reason_uk,r.comment_summary_uk,r.attempts,j.title,j.url,p.alerted_at "+
    "FROM reddit_thread_reviews r JOIN jobs j ON j.id=r.job_id "+
    "LEFT JOIN reddit_prospects p ON p.job_id=r.job_id WHERE r.job_id=?"
  ).bind(jobId).first();
  if(!row)return {state:"pending_comment_review"};
  if(["inconclusive","unavailable"].includes(row.status)&&Number(row.attempts)<3)
    return {state:"waiting_for_retry"};
  if(!row.alerted_at)return {state:"not_previously_alerted"};
  if(!/^https:\/\/www\.reddit\.com\/r\/[a-zA-Z0-9_]+\/comments\/[a-z0-9]+\//i.test(String(row.url||"")))
    return {state:"invalid_link"};
  const labels={credible:"Дискусія має ознаки реальної потреби",
    answered:"У коментарях уже надали змістовну відповідь",
    promotional:"Є ознаки рекламного або промоційного допису",
    crowded:"Висока конкуренція у видимих коментарях",
    resolved:"Автор повідомив, що питання вже вирішене",
    inconclusive:"Коментарів недостатньо для надійного висновку",
    unavailable:"Не вдалося перевірити коментарі"};
  const competitive={low:"мало явних пропозицій",medium:"помірно",high:"багато явних пропозицій",unknown:"не вдалося визначити"};
  const msg="🔍 <b>Перевірка раніше надісланого Reddit-посту</b>\n"+
    "<a href=\""+esc(row.url)+"\">"+esc(String(row.title).slice(0,120))+"</a>\n"+
    "<b>Висновок:</b> "+esc(labels[row.status]||"Потрібна ручна перевірка")+"\n"+
    "<b>Видима конкуренція:</b> "+esc(competitive[row.competition]||"невідомо")+
    (row.offer_count!==null?" (явних пропозицій: "+Number(row.offer_count)+")":"")+"\n"+
    "<b>Реакція автора:</b> "+(row.author_engaged?"помічено відповіді автора":"не підтверджено")+"\n"+
    "<b>Підстава:</b> "+esc(String(row.comment_summary_uk||row.reason_uk||"Немає надійних даних.").slice(0,360))+"\n"+
    "<i>Лише видимі коментарі. Приватні повідомлення, реальний бюджет і ймовірність отримати клієнта невідомі.</i>";
  await verifyTelegram(env);
  const reviewDelivery=await sendOnce(env,{key:"reddit_comment_audit:"+jobId,text:msg});
  if(!reviewDelivery.sent)return {state:"already_reserved",job_id:jobId};
  await putMeta(env,ackKey,iso());
  await env.DB.prepare("DELETE FROM meta WHERE key='reddit_user_requested_audit_job' AND value=?")
    .bind(jobId).run();
  return {state:"sent",status:row.status,competition:row.competition};
}
