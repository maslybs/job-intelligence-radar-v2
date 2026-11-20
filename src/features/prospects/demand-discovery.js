import {listingIsActionable} from "../discovery/source-accessibility.js";
import { demandThreadIsVerified,ensureRedditThreadReviewTable } from "../reddit/reddit-thread-review.js";
// Demand Discovery. Separate from job advertisements, Reddit browser and P1/P2.
// Uses only already-classified public discussions in D1. Never contacts authors.
const clean=(v,n=160)=>{let s=String(v??"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();if(s.length>n){s=s.slice(0,n-1);s=s.slice(0,Math.max(s.lastIndexOf(" "),n-35)).trimEnd()+"…";}return s;};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const allowedUrl=url=>{try{const u=new URL(url);if(u.protocol!=="https:")return false;return u.hostname==="www.reddit.com"||u.hostname==="reddit.com"||u.hostname.endsWith(".reddit.com")||u.hostname.endsWith(".discourse.org")||u.hostname.endsWith(".community.com")||u.hostname.startsWith("community.")||u.hostname.startsWith("forum.")||u.hostname==="support.backendless.com"||u.hostname==="github.com";}catch{return false;}};
const blockedStatuses=new Set(["answered","resolved","crowded","promotional","spam","closed"]);
const businessTerm=/(customer|client|shop|store|business|company|revenue|paid user|subscription|production|order|booking|staff|inventory|supplier|salesforce|hubspot|square|quickbooks|saas|b2b|launch|операц|компан|бізнес|клієнт|магазин)/i;
const urgentTerm=/(tripled|lost|losing|manual|cost|expensive|can't|cannot|broken|blocked|stuck|fail|hours|critical|not reliable|24,?000|24 тисяч|витрат|збит|втра|неможл|не працює|відмов|завис)/i;
export function rankDemand(row) {
 if(!row||!listingIsActionable(row,"leads")||row.category!=="business_problem"||Number(row.business_signal)!==1)return null;
 if(!["commercial_blocker","seeking_contractor"].includes(row.commercial_intent))return null;
 if(row.commercial_intent==="commercial_blocker"&&Number(row.commercial_score)<38)return null;
 if(row.commercial_intent==="seeking_contractor"&&Number(row.commercial_score)<50)return null;
 if(Number(row.fit)<78||String(row.problem_uk||"").trim().length<24||
    String(row.solution_uk||"").trim().length<38)return null;
 if(row.geo==="restricted"||row.kind==="seller"||row.kind==="spam")return null;
 if(blockedStatuses.has(String(row.review_status||"").toLowerCase()))return null;
 if(blockedStatuses.has(String(row.community_status||"").toLowerCase()))return null;
 // Ranking text alone is not proof of a real, still-open client problem.
 // Read OP post + comments, confirm business connection and remaining gap.
 if(String(row.source||"").startsWith("Reddit")){
   const review={status:row.review_status,competition:row.review_competition,
     original_post_observed:row.original_post_observed,
     comments_verified:row.comments_verified,self_promotion:row.self_promotion,
     business_owner_evidence_uk:row.business_owner_evidence_uk,
     unresolved_gap_uk:row.unresolved_gap_uk,
     comments_observed:row.comments_observed};
   if(!demandThreadIsVerified(review))return null;
 }else if(String(row.source||"").startsWith("Community · ")){
   if(row.community_status!=="open")return null;
 }
 if(!allowedUrl(row.url))return null;
 const narrative=[row.title,row.problem_uk,row.description].join(" ");
 const business=businessTerm.test(narrative);
 const urgency=urgentTerm.test(narrative);
 if(!business&&!urgency)return null;
 const points=Math.round(Number(row.fit)*.56+Number(row.commercial_score)*.34+(business?6:0)+(urgency?4:0)+(row.commercial_intent==="seeking_contractor"?4:0));
 return {...row,demand_score:Math.max(0,Math.min(100,points))};
}
export function chooseDemand(rows,limit=5) {
 const ranked=rows.map(rankDemand).filter(Boolean).sort((a,b)=>b.demand_score-a.demand_score||
  String(b.discovered_at||"").localeCompare(String(a.discovered_at||"")));
 const used=new Map(),chosen=[];
 for(const row of ranked) {
  if(chosen.length>=limit)break;
  const source=String(row.source).replace(/^(Reddit r\/).*/,"$1"+String(row.source).slice(9));
  if((used.get(source)||0)>=2)continue;
  chosen.push(row);used.set(source,(used.get(source)||0)+1);
 }
 return chosen;
}
export function renderDemandDigest(rows,day) {
 const header="🧩 <b>DEMAND RADAR · потенційні клієнти</b>\n"+
  "📅 "+esc(day)+" · "+rows.length+" проблем для ручної перевірки\n"+
  "<i>Не вакансії. Наявність бюджету й готовність наймати не підтверджені.</i>";
 const snippets=rows.map((x,i)=>[
  "<b>"+(i+1)+". "+esc(clean(x.title,80))+"</b>",
  "🎯 <b>Проблема:</b> "+esc(clean(x.problem_uk,140)),
  "🛠 <b>Що можна зробити:</b> "+esc(clean(x.solution_uk,155)),
  "💡 <b>Твоя відповідність:</b> "+Math.round(Number(x.fit))+"/100"+
   " · <b>Сигнал попиту:</b> "+Math.round(Number(x.commercial_score))+"/100",
  "✅ <b>Дискусія:</b> "+(String(x.source).startsWith("Reddit")?
    "прочитано допис і коментарі; залишається: "+esc(clean(x.unresolved_gap_uk,95)):
    "обговорення перевірено; проблема відкрита"),
  "🏢 <b>Автор:</b> "+esc(clean(x.business_owner_evidence_uk||
    x.buyer_evidence_uk||"Зв'язок із бізнесом випливає з опису проблеми.",110)),
  "⚠️ <b>Найм:</b> "+(x.commercial_intent==="seeking_contractor"?
    "автор шукає допомогу, оплата не підтверджена":"автор не шукає виконавця прямо"),
  "💬 <b>Наступний крок:</b> "+esc(clean(x.reply_uk||"Перевір актуальність проблеми перед відповіддю.",100)),
  '<a href="'+esc(x.url)+'">🔗 Оригінальний допис</a>'
 ].join("\n"));
 return [header,...snippets].join("\n\n")+"\n\n<i>Без автоматичних DM. Перевір коментарі, чи проблему вже вирішено.</i>";
}
export async function ensureDemandTables(env) {
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS demand_digest_batches (slot TEXT PRIMARY KEY,day TEXT NOT NULL,state TEXT NOT NULL,items_json TEXT NOT NULL,created_at TEXT NOT NULL,sent_at TEXT,error TEXT)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS demand_signals_sent (job_id TEXT PRIMARY KEY,slot TEXT NOT NULL,day TEXT NOT NULL,sent_at TEXT NOT NULL)").run();
 // Claim each lead across all slots BEFORE network I/O; preserve historical sends.
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS demand_signal_claims ("+
   "job_id TEXT PRIMARY KEY,slot TEXT NOT NULL,day TEXT NOT NULL,state TEXT NOT NULL,"+
   "claimed_at TEXT NOT NULL,sent_at TEXT)").run();
 await env.DB.prepare("INSERT OR IGNORE INTO demand_signal_claims(job_id,slot,day,state,claimed_at,sent_at) "+
   "SELECT job_id,slot,day,'sent',sent_at,sent_at FROM demand_signals_sent").run();
}
export async function runDemandDigest(env,{day,slot,send=false,deliver}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||""))||!/^[-a-z0-9_]{6,70}$/.test(String(slot||"")))throw Error("invalid_demand_slot");
 await ensureDemandTables(env);
 await ensureRedditThreadReviewTable(env);
 const existing=await env.DB.prepare("SELECT state FROM demand_digest_batches WHERE slot=?").bind(slot).first();
 if(existing)return {state:"already_reserved",slot,previous:existing.state};
 const used=Number((await env.DB.prepare("SELECT COUNT(*) n FROM demand_signal_claims WHERE day=?").bind(day).first())?.n||0);
 const allowance=Math.max(0,Math.min(5,10-used));
 if(!allowance)return {state:"daily_cap",slot,used};
 const rows=(await env.DB.prepare(
 "SELECT j.id,j.title,j.url,j.source,j.description,j.discovered_at,j.kind,j.geo,"+
 "p.category,p.fit,p.business_signal,p.payment_confirmed,p.problem_uk,p.solution_uk,p.reply_uk,p.caveat_uk,"+
 "c.commercial_intent,c.commercial_score,c.buyer_evidence_uk,"+
 "tr.status AS review_status,tr.competition AS review_competition,tr.comments_observed,"+
 "tr.original_post_observed,tr.comments_verified,tr.self_promotion,"+
 "tr.business_owner_evidence_uk,tr.unresolved_gap_uk,cr.value AS community_review "+
 "FROM reddit_prospects p JOIN jobs j ON j.id=p.job_id "+
 "JOIN prospect_commercial_signals c ON c.job_id=j.id "+
 "LEFT JOIN reddit_thread_reviews tr ON tr.job_id=j.id "+
 "LEFT JOIN meta cr ON cr.key='community_reply_review_'||j.id "+
 "LEFT JOIN demand_signals_sent already ON already.job_id=j.id "+
 "LEFT JOIN demand_signal_claims claim ON claim.job_id=j.id "+
 "WHERE (j.source LIKE 'Reddit%' OR j.source LIKE 'Community · %') "+
 "AND p.category='business_problem' AND p.business_signal=1 "+
 "AND c.commercial_intent IN ('commercial_blocker','seeking_contractor') "+
 "AND p.fit>=78 AND c.commercial_score>=38 "+
 "AND j.alerted_at IS NULL AND p.alerted_at IS NULL AND already.job_id IS NULL AND claim.job_id IS NULL "+
 "AND julianday(j.discovered_at)>=julianday('now','-96 hours') "+
 "ORDER BY j.discovered_at DESC LIMIT 160"
 ).all()).results||[];
 const candidates=rows.map(r=>{let community_status=null;try{community_status=JSON.parse(r.community_review||"null")?.state}catch{}return {...r,community_status};});
 const selected=chooseDemand(candidates,allowance);
 if(!selected.length)return {state:"awaiting_comment_verification",slot,considered:rows.length,used};
 let message=renderDemandDigest(selected,day);
 while(message.length>3850&&selected.length>1){
  selected.pop();
  message=renderDemandDigest(selected,day);
 }
 if(message.length>3950)return {state:"digest_too_long",slot,size:message.length};
 if(!send)return {state:"preview",slot,considered:rows.length,selected:selected.map(x=>({id:x.id,title:x.title,source:x.source,fit:x.fit,commercial_score:x.commercial_score})),message};
 if(typeof deliver!=="function")throw Error("delivery_not_configured");
 // Reserve slot first so a scheduled/manual repetition cannot send twice.
 const reserve=await env.DB.prepare(
   "INSERT OR IGNORE INTO demand_digest_batches(slot,day,state,items_json,created_at) VALUES(?,?,?,?,?)"
 ).bind(slot,day,"reserved","[]",new Date().toISOString()).run();
 if(!Number(reserve.meta?.changes||0))return {state:"already_reserved",slot};
 const claimed=[];
 try{
   // Oversample the diverse shortlist: another slot may have claimed its top leads.
   const pool=chooseDemand(candidates,Math.min(40,Math.max(12,allowance*5)));
   for(const x of pool){
     if(claimed.length>=allowance)break;
     if(renderDemandDigest([...claimed,x],day).length>3850)continue;
     // ONE atomic D1 statement enforces both global job_id uniqueness and
     // the 10-per-day cap across simultaneous Workers/slots.
     const entry=await env.DB.prepare(
       "INSERT OR IGNORE INTO demand_signal_claims(job_id,slot,day,state,claimed_at) "+
       "SELECT ?,?,?,'reserved',? WHERE "+
       "(SELECT COUNT(*) FROM demand_signal_claims WHERE day=?)<10"
     ).bind(x.id,slot,day,new Date().toISOString(),day).run();
     if(Number(entry.meta?.changes||0))claimed.push(x);
   }
   if(!claimed.length){
     await env.DB.prepare("UPDATE demand_digest_batches SET state='empty' WHERE slot=?")
       .bind(slot).run();
     return {state:"no_new_claims",slot,considered:rows.length};
   }
   // Persist the exact payload and protected state before contacting Telegram.
   const ids=JSON.stringify(claimed.map(x=>x.id));
   await env.DB.batch([
     env.DB.prepare("UPDATE demand_digest_batches SET state='sending',items_json=? "+
       "WHERE slot=? AND state='reserved'").bind(ids,slot),
     env.DB.prepare("UPDATE demand_signal_claims SET state='sending' "+
       "WHERE slot=? AND state='reserved'").bind(slot)
   ]);
   await deliver(renderDemandDigest(claimed,day));
   const at=new Date().toISOString();
   await env.DB.batch([
     env.DB.prepare("UPDATE demand_digest_batches SET state='sent',sent_at=? WHERE slot=?")
       .bind(at,slot),
     env.DB.prepare("UPDATE demand_signal_claims SET state='sent',sent_at=? WHERE slot=?")
       .bind(at,slot),
     ...claimed.map(x=>env.DB.prepare(
       "INSERT OR IGNORE INTO demand_signals_sent(job_id,slot,day,sent_at) VALUES(?,?,?,?)"
     ).bind(x.id,slot,day,at))
   ]);
   return {state:"sent",slot,count:claimed.length,ids:claimed.map(x=>x.id)};
 }catch(e){
   // A send/ack timeout may be a successful delivery. NEVER auto-release claims.
   await env.DB.batch([
     env.DB.prepare("UPDATE demand_digest_batches SET state='uncertain',error=? "+
       "WHERE slot=? AND state!='sent'").bind(String(e?.message||e).slice(0,180),slot),
     env.DB.prepare("UPDATE demand_signal_claims SET state='uncertain' "+
       "WHERE slot=? AND state IN ('reserved','sending')").bind(slot)
   ]).catch(()=>{});
   return {state:"uncertain",slot,error:String(e?.message||e).slice(0,140)};
 }
}
