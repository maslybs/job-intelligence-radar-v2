import {sendOnce} from "./telegram-outbox.js";
// Cross-pipeline, lease-protected verified delivery. Candidate selection,
// source evidence checks, fair batching, Telegram send and D1 checkpoints.
// Function body is identical to the original operational Worker.
import {getMeta,putMeta} from "../../platform/meta.js";
import { ensureUpworkCompetitionTable,observeUpworkCompetition,verifiedUpworkCompetition,upworkCompetitionDecision,proposalTierUpper } from "../../integrations/upwork/upwork-competition.js";
import { upworkLocationEligibility } from "../../integrations/upwork/upwork-location.js";
import {sourceIsActionable,listingIsActionable} from "../discovery/source-accessibility.js";
import {reviewDecision} from "../jobs/review-decision.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {ensureRedditThreadReviewTable,getRedditThreadReview,reddThreadIsDeliverable} from "../reddit/reddit-thread-review.js";
import { checkCommunityReplies } from "../reddit/community-reply-check.js";
import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";
import {redditDirectOffer} from "../reddit/reddit-direct-offer.js";
import {highFitFresh} from "../jobs/competitive-review.js";
import { settleIndependentPipelines, fairDeliveryBatch } from "../scheduler/pipeline-isolation.js";
import { formatTelegramJob } from "./job-renderer.js";
import { tg, verifyTelegram } from "./telegram-transport.js";
import { esc, iso, kyiv, kyivDay, text } from "../../platform/runtime-utils.js";
import {notifyRedditProspects, notifyRequestedRedditAudit} from "./lead-notifications.js";

export async function deliverAllVerified(env,{jobsLimit=8}={}) {
  if(!RADAR_SETTINGS.notifications.telegramEnabled)return {state:"disabled_by_configuration",jobs_sent:0,prospects_sent:0};
  const leaseKey="telegram_verified_delivery_lease",now=Date.now();
  await env.DB.prepare("DELETE FROM meta WHERE key=? AND CAST(value AS INTEGER)<?")
    .bind(leaseKey,now-3*60*1000).run();
  const leaseVal=String(now)+"-"+crypto.randomUUID();
  const claim=await env.DB.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)")
    .bind(leaseKey,leaseVal).run();
  if(!claim.meta?.changes)return {state:"already_running",jobs_sent:0,prospects_sent:0};
  let sent=0,reviewSent=0,prospectsSent=0;
  const errors=[],skips={};
  const countSkip=reason=>{skips[reason]=(skips[reason]||0)+1;};
  let candidateTotal=0,selectedTotal=0;
  try {
    const items=RADAR_SETTINGS.jobs.enabled?((await env.DB.prepare(
      "SELECT id,title,company,source,url,priority,score,kind,geo,engagement,description,"+
      "region,published_at,reason,state FROM jobs WHERE alerted_at IS NULL AND source NOT LIKE 'Upwork%' "+
      "AND ((state='unread' AND priority IN ('P1','P2') AND kind='buyer' "+
      "AND (geo='allowed' OR (geo='unknown' AND engagement='contract' AND score>="+RADAR_SETTINGS.search.minQualifiedScore+"))) "+
      "OR (state='filtered' AND kind='buyer' AND geo='allowed' "+
      "AND engagement='contract' AND score BETWEEN "+Math.max(77,RADAR_SETTINGS.search.manualReviewScore)+" AND "+(RADAR_SETTINGS.search.minQualifiedScore-1)+")) "+
      "AND julianday(discovered_at)>=julianday('now','-72 hours') "+
      "ORDER BY CASE WHEN engagement='contract' THEN 0 ELSE 1 END,"+
      "CASE WHEN source LIKE 'Freelancehunt%' THEN 0 "+
      "WHEN source LIKE 'Upwork%' THEN 1 WHEN source LIKE 'Reddit%' THEN 2 ELSE 3 END,"+
      "score DESC,discovered_at DESC LIMIT 130"
    ).all()).results||[]):[];
    candidateTotal=items.length;
    const sendable=[];
    for(const x of items){
      try{
      // Fair source-family selection happens after validation.
      if(!listingIsActionable(x)){countSkip("paid_membership_required");continue;}
      if(!/^https:\/\//i.test(String(x.url||""))){countSkip("bad_url");continue;}
      if(x.engagement!=="contract"&&Number(x.score)<RADAR_SETTINGS.search.minQualifiedScore){countSkip("staff_fit_below_85");continue;}
      if(String(x.source).startsWith("Upwork")){
        if(!upworkLocationEligibility({description:String(x.title||"")+" "+String(x.description||"")}).eligible){countSkip("upwork_geo_restricted");continue;}
        const match=await env.DB.prepare("SELECT job_id FROM upwork_competition WHERE url=?")
          .bind(x.url).first();
        if(!match){countSkip("upwork_missing_competition");continue;}
        const evidence=await verifiedUpworkCompetition(env,match.job_id);
        if(!evidence.eligible){countSkip("upwork_"+String(evidence.reason||"competition"));continue;}
      }
      if(String(x.source).startsWith("Reddit")){
        const commentReview=await getRedditThreadReview(env,x.id);
        const direct=redditDirectOffer(x,commentReview);
        // A genuine explicit hiring post is a job offer, not a request for
        // free debugging. Do not hide it just because comments are unreadable.
        // We MUST disclose that reply/competition verification was unavailable.
        if(!direct&&!reddThreadIsDeliverable(commentReview)){
          countSkip("reddit_unverified_or_not_explicit");continue;
        }
        x.commentReview=commentReview;
        if(direct)x.redditDirectWarning=direct.warning;
      }
      if(String(x.source).startsWith("Community · ") ||
          (RADAR_SETTINGS.jobs.sources.items||[]).some(item=>item.forumHiring===true&&item.name===x.source)){
        // Hiring threads can be edited by the author after publication.
        // Never advertise stale "guaranteed" rates if comments have since
        // withdrawn the offer or a vacancy is filled.
        const review=await checkCommunityReplies(env,{...x,job_id:x.id},MODEL);
        if(review.state!=="open"){countSkip("community_"+review.state);continue;}
        x.communityReview=review;
      }
      if(String(x.source).startsWith("Freelancehunt")){
        const bids=String(x.description||"").match(/Заявок:\s*(\d+)/)?.[1];
        if(bids!==undefined&&Number(bids)>20){
          if(highFitFresh(x,bids))x.competitionWarning=
            "Висока конкуренція: "+Number(bids)+" заявок на момент збору. "+
            "Бюджет і надійність замовника перевір перед відгуком.";
          else{countSkip("freelancehunt_many_bids");continue;}
        }
        if(/(?:шахрай|передоплат|скам|безкоштовн.{0,12}тест)/i.test(String(x.reason||""))){countSkip("freelancehunt_risk");continue;}
      }
      const borderline=x.state==="filtered";
      if(borderline&&!reviewDecision(x)){countSkip("borderline_terms");continue;}
      if(String(x.source).startsWith("Reddit")&&
        /(?:future projects|майбутн.{0,18}проєкт|no guarantee|без гарант)/i.test(String(x.reason||"")))
        continue;
      sendable.push({...x,borderline});
      }catch(e){
        const src=String(x.source||"unknown").split(" · ")[0].slice(0,35);
        countSkip("source_validation_error_"+src);
        console.error("independent lead validation "+src,String(e?.message||e).slice(0,150));
      }
    }
    const selected=fairDeliveryBatch(sendable,jobsLimit);
    selectedTotal=selected.length;
    if(selected.length){
      await verifyTelegram(env);
      for(const x of selected){
        const title=x.borderline?"🔎 Варто перевірити":x.engagement==="contract"?"📌 Проєкт":"📌 Вакансія";
        const extra=x.geo==="unknown"
          ?"\n<i>Географічну доступність не підтверджено — перевір умови перед відгуком.</i>":"";
        const risk=x.borderline
          ?"\n<i>Не підтверджена основна добірка P1/P2: є умови, які треба уточнити.</i>":"";
        try {
          const summary=await formatTelegramJob(env,x,0);
          const commentNote=x.commentReview
          ?"\n<b>Коментарі:</b> "+esc(String(x.commentReview.comment_summary_uk||x.commentReview.reason_uk||"").slice(0,230))+
            "\n<b>Видима конкуренція:</b> "+esc(String(x.commentReview.competition)):"";
          const directRedditNote=x.redditDirectWarning
            ?"\n<b>Перевірка Reddit:</b> "+esc(x.redditDirectWarning):"";
          const communityNote=x.communityReview
            ?"\n<b>Відповіді перевірено:</b> "+(Number(x.communityReview.count)===0
              ?"Відповідей немає.":esc(String(x.communityReview.count)+" відповідей; "+
                String(x.communityReview.open_uk||"питання ще відкрите").slice(0,180))):"";
        const competition=x.competitionWarning?"\n<b>Конкуренція:</b> "+
          esc(x.competitionWarning):"";
        const body="<b>"+title+"</b>\n"+summary+commentNote+directRedditNote+communityNote+extra+risk+competition;
          if(body.length>3900)throw Error("lead_too_long");
          const sentOnce=await sendOnce(env,{key:"verified_job:"+x.id,text:body});
          if(!sentOnce.sent){countSkip("delivery_already_reserved");continue;}
          await env.DB.prepare("UPDATE jobs SET alerted_at=? WHERE id=? AND alerted_at IS NULL")
            .bind(iso(),x.id).run();
          sent++;if(x.borderline)reviewSent++;
        }catch(e) {
          const reason=String(e?.message||e).slice(0,140);
          errors.push({kind:"job",source:x.source,reason});
          // If the transport/DB failed, do not risk duplicate sends.
          // A single malformed job or AI brief cannot block other sources.
          if(/Telegram .*failed|D1|database|identity not configured|Destination verification/i.test(reason))
            break;
          countSkip("isolated_message_render_failure");
        }
      }
    }
    const infrastructureDown=errors.some(e=>/Telegram .*failed|D1|database|identity not configured|Destination verification/i.test(e.reason||""));
    if(!infrastructureDown){
      try {
        const prospectDelivery=await notifyRedditProspects(env,true);
        prospectsSent=Number(prospectDelivery?.count||0);
      }catch(e){errors.push({kind:"prospect",reason:String(e?.message||e).slice(0,100)})}
    }
    // Correct earlier Telegram classifications after a comment review; no
    // Reddit traffic and not counted as a new lead.
    try {await notifyRequestedRedditAudit(env)}
    catch(e){errors.push({kind:"reddit_comment_audit_notice",
      reason:String(e?.message||e).slice(0,100)})}
    const report={state:errors.length?"partial":"ok",jobs_sent:sent,
      review_sent:reviewSent,prospects_sent:prospectsSent,
      candidate_total:candidateTotal,qualified_total:selectedTotal,
      skipped:skips,errors,checked_at:iso()};
    await putMeta(env,"telegram_verified_delivery_last",JSON.stringify(report));
    return report;
  }finally{
    await env.DB.prepare("DELETE FROM meta WHERE key=? AND value=?")
      .bind(leaseKey,leaseVal).run();
  }
}
