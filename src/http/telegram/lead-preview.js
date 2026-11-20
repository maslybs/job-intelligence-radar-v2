// Telegram radarTelegramLeads; moved without editing the function body.
import {ensureRedditThreadReviewTable,getRedditThreadReview,reddThreadIsDeliverable} from "../../features/reddit/reddit-thread-review.js";
import { esc, iso, kyivDay, text } from "../../platform/runtime-utils.js";
import { ensureUpworkCompetitionTable,observeUpworkCompetition,verifiedUpworkCompetition,upworkCompetitionDecision,proposalTierUpper } from "../../integrations/upwork/upwork-competition.js";

export async function radarTelegramLeads(env) {
  // An actionable recap for a human, not a dump of scraper counters.
  await ensureRedditThreadReviewTable(env);
  const jobs=(await env.DB.prepare(
    "SELECT title,url,source,score,priority,reason,engagement,description,published_at FROM jobs "+
    "WHERE alerted_at IS NOT NULL AND priority IN ('P1','P2') AND geo='allowed' AND source NOT LIKE 'Upwork%' "+
    "AND julianday(alerted_at)>=julianday('now','-72 hours') "+
    "ORDER BY CASE WHEN engagement='contract' THEN 0 ELSE 1 END,score DESC,alerted_at DESC LIMIT 25"
  ).all()).results||[];
  const prospects=(await env.DB.prepare(
    "SELECT p.fit,p.problem_uk,p.solution_uk,j.url,j.source FROM reddit_prospects p "+
    "JOIN jobs j ON j.id=p.job_id "+
    "JOIN prospect_commercial_signals c ON c.job_id=p.job_id "+
    "LEFT JOIN reddit_thread_reviews tr ON tr.job_id=p.job_id "+
    "WHERE p.alerted_at IS NOT NULL "+
    "AND (j.source NOT LIKE 'Reddit%' OR (tr.status='credible' "+
      "AND tr.competition IN ('low','medium','unknown') AND tr.comments_observed>=1)) "+
    "AND p.category IN ('business_problem','paid_request') AND p.business_signal=1 "+
    "AND ((c.commercial_intent='paid_request' AND c.commercial_score>=65 AND p.fit>=70) "+
    "OR (c.commercial_intent='seeking_contractor' AND c.commercial_score>=78 AND p.fit>=72) "+
    "OR (c.commercial_intent='commercial_blocker' AND c.commercial_score>=88 AND p.fit>=80)) "+
    "AND COALESCE(j.geo,'unknown')<>'restricted' "+
    "AND julianday(p.alerted_at)>=julianday('now','-72 hours') "+
    "ORDER BY p.fit DESC,p.alerted_at DESC LIMIT 5"
  ).all()).results||[];
  const safeUrl=url=>{
    try{const u=new URL(url);return u.protocol==="https:"?esc(u.href):null}catch{return null}
  };
  const clip=(value,max)=>{
    const v=String(value||"");
    if(v.length<=max)return v;
    const head=v.slice(0,max),end=head.lastIndexOf(" ");
    return (end>max*.6?head.slice(0,end):head).trimEnd()+"…";
  };
  const lines=["<b>Job Radar · конкретні можливості за 72 години</b>"];
  const pickedJobs=[];
  for(const j of jobs){
    if(!safeUrl(j.url))continue;
    if(String(j.source).startsWith("Upwork")){
      const seen=await env.DB.prepare("SELECT job_id FROM upwork_competition WHERE url=?")
        .bind(j.url).first();
      if(!seen?.job_id)continue;
      const decision=await verifiedUpworkCompetition(env,seen.job_id);
      if(!decision.eligible)continue;
    }
    if(String(j.source).startsWith("Freelancehunt")){
      const count=Number(String(j.description||"").match(/Заявок:\s*(\d+)/)?.[1]);
      if(Number.isFinite(count)&&count>15)continue;
    }
    if(String(j.source).startsWith("Reddit")){
      const review=await getRedditThreadReview(env,j.id);
      if(!reddThreadIsDeliverable(review))continue;
      if(/майбутн|future projects|без гарантії|no guaranteed/i.test(String(j.reason||"")))continue;
    }
    pickedJobs.push(j);
    if(pickedJobs.length>=4)break;
  }
  if(pickedJobs.length){
    lines.push("<b>Відібрані проєкти та вакансії</b>");
    for(const j of pickedJobs){
      lines.push("• <a href=\""+safeUrl(j.url)+"\">"+esc(clip(j.title,100))+"</a>"+
        " · "+esc(j.priority)+" · "+Number(j.score)+"/100"+
        (j.engagement==="contract"?" · проєкт":" · вакансія")+
        "\n"+esc(clip(j.reason,170)));
    }
  }
  const pickedProspects=prospects.filter(j=>safeUrl(j.url)).slice(0,4);
  if(pickedProspects.length){
    lines.push("<b>Люди з конкретними проблемами</b>");
    for(const x of pickedProspects){
      lines.push("• <a href=\""+safeUrl(x.url)+"\">"+esc(String(x.source).replace("Community · ","").slice(0,80))+
        " · "+Number(x.fit)+"/100</a>\n"+
        esc(clip(x.problem_uk,160))+
        (x.solution_uk?"\nМожлива допомога: "+esc(clip(x.solution_uk,140)):""));
    }
    lines.push("<i>Це потенційні звернення, а не підтверджені оплачені замовлення.</i>");
  }
  if(!pickedJobs.length&&!pickedProspects.length)
    return "За останні 72 години немає вже підтверджених і відібраних можливостей. Radar продовжує збір. Технічний стан: /status";
  return lines.join("\n\n").slice(0,3750);
}
