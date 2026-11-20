import {listingIsActionable} from "../discovery/source-accessibility.js";
// Separate manual-review digest. NOT an automatic hiring assertion.
// High technical fit and business pain are useful to inspect even before
// comments prove that the person wants to hire; never send any outreach.
const clean=(s,n=150)=>{const t=String(s??"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return t.length>n?t.slice(0,n-1).trimEnd()+"…":t;};
const esc=t=>String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const badReview=new Set(["answered","promotional","resolved","crowded","spam"]);
const countryOnly=/(?:us|usa|united states|canada|india)\s*(?:only|residents?\s+only)|(?:only|must be)\s+(?:in\s+)?(?:usa|us|united states|canada|india)/i;
export function chooseManualLeads(rows,limit=3){
 const selected=[],seen=new Map();
 const candidates=(rows||[]).filter(x=>{
  if(!listingIsActionable(x,"leads"))return false;
  const kind=String(x.commercial_intent||"");
  const threshold=kind==="paid_request"?65:kind==="seeking_contractor"?55:kind==="commercial_blocker"?56:999;
  if(!["business_problem","paid_request"].includes(x.category)||
    Number(x.business_signal)!==1||Number(x.fit)<80||
    Number(x.commercial_score)<threshold||
    String(x.buyer_evidence_uk||"").trim().length<40||
    String(x.problem_uk||"").trim().length<35||
    String(x.solution_uk||"").trim().length<35)return false;
  const context=String(x.title||"")+" "+String(x.description||"");
  // A proposed equity stake without actual cash compensation is not a paid
  // freelance lead. Geographically narrow hiring must be explicitly global.
  if(/equity|ownership stake|revenue share/i.test(context)&&
    !/(?:\$\s*\d+|paid\s+(?:hourly|contract|position)|\b(?:salary|fixed budget|cash compensation)\b)/i.test(context))
    return false;
  if((/FreelanceIndia/i.test(String(x.source||""))||/^\s*\[(?:USA|US|INDIA)\]/i.test(context))&&
    !/\b(?:worldwide|global applicants|international applicants|work from anywhere)\b/i.test(context))
    return false;
  if(x.kind==="seller"||x.geo==="restricted"||badReview.has(String(x.review_status||""))||
     badReview.has(String(x.community_status||""))||
     countryOnly.test(String(x.title||"")+" "+String(x.description||"")))return false;
  try{const u=new URL(x.url);if(u.protocol!=="https:"||!["www.reddit.com","reddit.com"].includes(u.hostname)&&!u.hostname.startsWith("community."))return false;}catch{return false;}
  return true;
 }).sort((a,b)=>
  (b.commercial_intent==="paid_request"?1:0)-(a.commercial_intent==="paid_request"?1:0)||
  Number(b.commercial_score)-Number(a.commercial_score)||
  Number(b.fit)-Number(a.fit));
 for(const x of candidates){
  if(selected.length>=limit)break;
  const src=String(x.source||"");
  if((seen.get(src)||0)>=2)continue;
  selected.push(x);seen.set(src,(seen.get(src)||0)+1);
 }
 return selected;
}
export function renderManualLeads(rows,day){
 const start="🔍 <b>Radar · потенційні контакти для перевірки</b>\n"+
  esc(day)+" · "+rows.length+" сигнали\n"+
  "<i>Це НЕ підтверджені вакансії. Не всі автори шукають виконавця або мають бюджет. Перед відповіддю перевір повний допис, коментарі й актуальність проблеми.</i>";
 const blocks=rows.map((r,i)=>[
  "<b>"+(i+1)+". "+esc(clean(r.title,86))+"</b>",
  "<b>Проблема:</b> "+esc(clean(r.problem_uk,145)),
  "<b>Можлива робота:</b> "+esc(clean(r.solution_uk,165)),
  "<b>Ознака бізнесу:</b> "+esc(clean(r.buyer_evidence_uk,125)),
  "<b>Відповідність:</b> "+Math.round(Number(r.fit))+"/100"+
   " · <b>Комерційний сигнал:</b> "+Math.round(Number(r.commercial_score))+"/100",
  "<b>Коментарі:</b> "+(r.review_status==="credible"?"частково підтверджені; перевір ще раз":
    "не підтверджені або недоступні"),
  "<b>Оплата:</b> "+(Number(r.payment_confirmed)===1?"заявлена автором":"не підтверджена"),
  '<a href="'+esc(r.url)+'">Оригінальний допис</a>'
 ].join("\n"));
 return [start,...blocks,"<i>Автору нічого автоматично не надсилається.</i>"].join("\n\n");
}
export async function runManualLeadDigest(env,{day,preview=false,deliver}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||"")))throw Error("invalid_lead_day");
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS manual_lead_digest(slot TEXT PRIMARY KEY,state TEXT NOT NULL,ids TEXT NOT NULL,created_at TEXT NOT NULL,sent_at TEXT,error TEXT)").run();
 const slot="daily_"+day;
 const exists=await env.DB.prepare("SELECT state FROM manual_lead_digest WHERE slot=?").bind(slot).first();
 if(exists)return {state:"already_processed",previous:exists.state};
 const rows=(await env.DB.prepare(
  "SELECT j.id,j.title,j.description,j.url,j.source,j.kind,j.geo,"+
  "p.category,p.fit,p.business_signal,p.payment_confirmed,p.problem_uk,p.solution_uk,"+
  "c.commercial_intent,c.commercial_score,c.buyer_evidence_uk,"+
  "r.status AS review_status "+
  "FROM reddit_prospects p JOIN jobs j ON j.id=p.job_id "+
  "JOIN prospect_commercial_signals c ON c.job_id=p.job_id "+
  "LEFT JOIN reddit_thread_reviews r ON r.job_id=j.id "+
  "LEFT JOIN demand_signals_sent ds ON ds.job_id=j.id "+
  "WHERE j.source LIKE 'Reddit%' AND j.alerted_at IS NULL AND p.alerted_at IS NULL "+
  "AND ds.job_id IS NULL AND p.business_signal=1 "+
  "AND p.category IN ('business_problem','paid_request') "+
  "AND p.fit>=80 AND c.commercial_score>=55 "+
  "AND COALESCE(j.geo,'unknown')<>'restricted' "+
  "AND julianday(j.discovered_at)>=julianday('now','-72 hours') "+
  "ORDER BY c.commercial_score DESC,p.fit DESC LIMIT 75"
 ).all()).results||[];
 const picked=chooseManualLeads(rows);
 if(!picked.length)return {state:"no_manual_leads",considered:rows.length};
 let message=renderManualLeads(picked,day);
 while(message.length>3850&&picked.length>1){picked.pop();message=renderManualLeads(picked,day);}
 if(message.length>3900)return {state:"too_long",length:message.length};
 const ids=picked.map(r=>r.id);
 if(preview)return {state:"preview",candidates:rows.length,selected:picked.map(r=>({title:r.title,url:r.url,score:r.commercial_score})),message};
 if(typeof deliver!=="function")throw Error("deliver_missing");
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO manual_lead_digest(slot,state,ids,created_at) VALUES(?,?,?,?)").bind(slot,"reserved",JSON.stringify(ids),new Date().toISOString()).run();
 if(!claim.meta?.changes)return {state:"already_processed"};
 try{
  await deliver(message);
  await env.DB.prepare("UPDATE manual_lead_digest SET state='sent',sent_at=? WHERE slot=?").bind(new Date().toISOString(),slot).run();
  return {state:"sent",count:ids.length,ids};
 }catch(e){
  await env.DB.prepare("UPDATE manual_lead_digest SET state='uncertain',error=? WHERE slot=?").bind(String(e?.message||e).slice(0,130),slot).run().catch(()=>{});
  return {state:"uncertain",error:String(e?.message||e).slice(0,130)};
 }
}
