import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Independent commercial qualification. A technical fit is NOT a buyer signal.
// The values are evidence-strength scores, not estimated conversion percentages.
export const OPPORTUNITY_RULES=Object.freeze({
  paid_request:{minCommercial:65,minFit:70},
  seeking_contractor:{minCommercial:78,minFit:72},
  commercial_blocker:{minCommercial:88,minFit:80}
});
const clip=(v,n=260)=>String(v||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,n);
const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
export function normalizeCommercialResult(data){
  let intent=String(data?.commercial_intent||"unknown").trim();
  if(!["paid_request","seeking_contractor","commercial_blocker","knowledge_only","unknown"].includes(intent))
    intent="unknown";
  const commercial_score=clamp(data?.commercial_score);
  const buyer_evidence_uk=clip(data?.buyer_evidence_uk,270);
  const paid_work_uk=clip(data?.paid_work_uk,240);
  // Without any evidence anchored in the post, don't interpret a model score as demand.
  if(buyer_evidence_uk.length<28&&intent!=="knowledge_only")intent="unknown";
  return {commercial_intent:intent,commercial_score,
    buyer_evidence_uk,paid_work_uk};
}
export function commercialLeadIsSendable(row, settings=RADAR_SETTINGS){
  if(!row)return false;
  const rule=OPPORTUNITY_RULES[row.commercial_intent];
  if(!settings.leads.enabled||!rule||Number(row.commercial_score)<Math.max(rule.minCommercial,settings.leads.criteria.minCommercialScore)||
    Number(row.fit)<Math.max(rule.minFit,settings.leads.criteria.minTechnicalFit)||Number(row.business_signal)!==1)return false;
  if(String(row.buyer_evidence_uk||"").length<28)return false;
  if(!["business_problem","paid_request"].includes(String(row.category)))return false;
  return true;
}
export const commercialIntentLabel=intent=>({
  paid_request:"Прямий запит на оплачувану допомогу / найм",
  seeking_contractor:"Шукає сторонню технічну допомогу",
  commercial_blocker:"Комерційний блокер, підряд не підтверджений",
  knowledge_only:"Технічне запитання без попиту на підряд",
  unknown:"Комерційний намір не встановлено"
})[intent]||"Комерційний намір не встановлено";

export async function ensureCommercialTable(env){
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS prospect_commercial_signals ("+
    "job_id TEXT PRIMARY KEY,commercial_intent TEXT NOT NULL DEFAULT 'unknown',"+
    "commercial_score INTEGER NOT NULL DEFAULT 0,buyer_evidence_uk TEXT NOT NULL DEFAULT '',"+
    "paid_work_uk TEXT NOT NULL DEFAULT '',assessed_at TEXT NOT NULL)"
  ).run();
}
