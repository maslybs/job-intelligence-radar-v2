// Telegram transport: credentials and destination are supplied externally.
// No account, bot, group or channel identity is compiled into this module.
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {putMeta} from "../../platform/meta.js";
import {iso} from "../../platform/runtime-utils.js";

export class TelegramApiError extends Error {
  constructor(method,status,description,retryAfter=0){
    super("Telegram "+method+" failed: HTTP "+status+" "+String(description||"unknown").slice(0,70));
    this.name="TelegramApiError";
    this.status=status;
    this.apiRejected=true;
    this.retryAfter=retryAfter;
  }
}
const verifiedCache=new WeakMap();
const VERIFY_TTL_MS=5*60*1000;
export const telegramEnabled = () => RADAR_SETTINGS.notifications.telegramEnabled === true;

export async function tg(env,method,params={}) {
  if(!telegramEnabled())throw Error("Telegram disabled by configuration");
  if(!env.TG_BOT_TOKEN)throw Error("Telegram bot token missing from secrets");
  const sending=method==="sendMessage";
  if(sending && (!env.TG_CHAT_ID || String(params?.chat_id)!==String(env.TG_CHAT_ID)))
    throw Error("Telegram destination does not match configured chat secret");
  try {
    const response=await fetch("https://api.telegram.org/bot"+env.TG_BOT_TOKEN+"/"+method,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(params),signal:AbortSignal.timeout(sending?15000:8000)
    });
    let result;
    try{
      result=await response.json();
    }catch(error){
      // HTTP 429 is an explicit non-delivery even if the body is malformed.
      if(response.status===429){
        const retry=Number(response.headers.get("Retry-After"));
        throw new TelegramApiError(method,429,"Too Many Requests",
          Number.isFinite(retry)&&retry>0?Math.min(3600,retry):60);
      }
      throw error; // Other lost/invalid responses may be ambiguous.
    }
    if(!response.ok||!result.ok){
      const retry=Number(result?.parameters?.retry_after||response.headers.get("Retry-After"));
      throw new TelegramApiError(method,response.status,result?.description,
        Number.isFinite(retry)&&retry>0?Math.max(1,Math.min(3600,retry)):60);
    }
    if(sending)await putMeta(env,"telegram_last_success",JSON.stringify({
      at:iso(),message_id:Number(result.result?.message_id)||null
    })).catch(()=>void 0);
    return result.result;
  }catch(error){
    if(sending)await putMeta(env,"telegram_last_error",JSON.stringify({at:iso(),reason:String(error?.message||error).slice(0,160)})).catch(()=>void 0);
    throw error;
  }
}

export async function verifyTelegram(env) {
  if(!telegramEnabled())throw Error("Telegram disabled by configuration");
  if(!env.TG_BOT_TOKEN||!env.TG_CHAT_ID)throw Error("Telegram bot token/chat ID missing from secrets");
  const cached=verifiedCache.get(env),now=Date.now();
  if(cached&&cached.expiresAt>now&&cached.token===env.TG_BOT_TOKEN&&cached.chat===env.TG_CHAT_ID)
    return cached.result;
  const me=await tg(env,"getMe",{});
  const chat=await tg(env,"getChat",{chat_id:env.TG_CHAT_ID});
  const config=RADAR_SETTINGS.notifications.telegram;
  if(!me?.is_bot||String(chat?.id)!==String(env.TG_CHAT_ID)||
     !config.allowedChatTypes.includes(String(chat?.type||"")))
    throw Error("Telegram destination verification failed");
  const expectedUser=String(config.expectedBotUsername||"").replace(/^@/,"").toLowerCase();
  if(expectedUser&&String(me.username||"").toLowerCase()!==expectedUser)
    throw Error("Configured Telegram bot username does not match");
  if(config.expectedChatTitle&&chat.title!==config.expectedChatTitle)
    throw Error("Configured Telegram chat title does not match");
  const result={bot_id:me.id,chat_id:String(chat.id),chat_type:chat.type};
  verifiedCache.set(env,{expiresAt:now+VERIFY_TTL_MS,token:env.TG_BOT_TOKEN,chat:env.TG_CHAT_ID,result});
  return result;
}

export async function testTelegram(env) {
  await verifyTelegram(env);
  const result=await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,
    text:"Job Intelligence Radar: Telegram delivery check completed.",disable_web_page_preview:true});
  return {sent:true,message_id:result.message_id,type:"test"};
}

export const TELEGRAM_CMD_BASE=RADAR_SETTINGS.app.publicBaseUrl;

export async function radarWebhookSecret(env) {
  if(!env.ADMIN_TOKEN||!env.TG_BOT_TOKEN)throw Error("Telegram control secrets not configured");
  const data=new TextEncoder().encode("telegram-job-radar-v1:"+env.ADMIN_TOKEN);
  const digest=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
