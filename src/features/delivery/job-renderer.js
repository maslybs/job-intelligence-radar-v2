// Telegram message formatting for vacancies.
// Extracted from the production-compatible Worker without modifying the bodies.
import {getMeta,putMeta} from "../../platform/meta.js";
import { getDetailedJobBrief } from "../jobs/job-detail.js";
import {MODEL,DAILY_AI_LIMIT,TGT} from "../../config/constants.js";
import { renderJobTelegram } from "./job-message.js";
import { kyivDay } from "../../platform/runtime-utils.js";

export async function formatTelegramJob(env,x,i){
  let brief={};
  try{brief=JSON.parse(await getMeta(env,"telegram_brief_"+x.id)||"{}")||{}}catch{}
  let details=null;
  try{
    details=await getDetailedJobBrief(env,x,{model:MODEL,getMeta,day:kyivDay()});
  }catch(e){
    console.error("job detail enrichment",String(e?.message||e).slice(0,120));
  }
  return renderJobTelegram(x,details||{},brief,i);
}
