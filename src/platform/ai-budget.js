// D1 transactional daily quota shared by every Workers AI use site.
import {RADAR_SETTINGS} from "../config/radar.generated.js";
import {kyivDay} from "./runtime-utils.js";
export async function aiBudgetState(env,day=kyivDay()) {
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS ai_budget_usage ("+
   "day TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0,prospect_used INTEGER NOT NULL DEFAULT 0)").run();
 let row=await env.DB.prepare("SELECT used,prospect_used FROM ai_budget_usage WHERE day=?").bind(day).first();
 if(!row){
  const values=await Promise.all(["daily_model_","prospect_ai_used_","reddit_comment_ai_used_","community_reply_ai_used_"].map(prefix=>
    env.DB.prepare("SELECT value FROM meta WHERE key=?").bind(prefix+day).first()));
  const initial=values.map(x=>Math.max(0,Number(x?.value)||0));
  await env.DB.prepare("INSERT OR IGNORE INTO ai_budget_usage(day,used,prospect_used) VALUES(?,?,?)")
    .bind(day,initial.reduce((sum,n)=>sum+n,0),initial[1]).run();
  row=await env.DB.prepare("SELECT used,prospect_used FROM ai_budget_usage WHERE day=?").bind(day).first();
 }
 const limit=RADAR_SETTINGS.ai.dailyEvaluationLimit,prospectLimit=RADAR_SETTINGS.ai.dailyProspectLimit;
 const used=Number(row?.used||0),prospectUsed=Number(row?.prospect_used||0);
 return {day,used,prospectUsed,limit,prospectLimit,remaining:Math.max(0,limit-used),
   prospectRemaining:Math.max(0,Math.min(limit-used,prospectLimit-prospectUsed))};
}
export async function reserveAiBudget(env,{day=kyivDay(),kind="general",units=1}={}) {
 if(!Number.isInteger(units)||units<1||units>10000)throw Error("Invalid AI budget reservation");
 const state=await aiBudgetState(env,day);
 const prospect=kind==="prospect"?units:0;
 const result=await env.DB.prepare("UPDATE ai_budget_usage SET used=used+?,prospect_used=prospect_used+? "+
   "WHERE day=? AND used+?<=? AND prospect_used+?<=?")
   .bind(units,prospect,day,units,state.limit,prospect,state.prospectLimit).run();
 return Number(result.meta?.changes||0)>0;
}
export async function availableAiBudget(env,{day=kyivDay(),kind="general"}={}) {
 const state=await aiBudgetState(env,day);
 return kind==="prospect"?state.prospectRemaining:state.remaining;
}
