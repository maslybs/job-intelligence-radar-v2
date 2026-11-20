// D1 at-most-once delivery. Only Telegram's explicit HTTP 429 rejection is retried.
// Timeouts, lost responses and failed acknowledgements remain reserved for manual review.
import {tg,verifyTelegram,TelegramApiError} from "./telegram-transport.js";

const MAX_RATE_LIMIT_RETRIES=5;
async function ensureDeliveryTables(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_delivery_outbox ("+
    "delivery_key TEXT PRIMARY KEY,chat_id TEXT NOT NULL,state TEXT NOT NULL,"+
    "claimed_at TEXT NOT NULL,sent_at TEXT,message_id INTEGER,error TEXT)").run();
  // Separate table avoids destructive migration of the existing production outbox.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_delivery_retry_schedule ("+
    "delivery_key TEXT PRIMARY KEY,next_retry_at INTEGER NOT NULL,attempts INTEGER NOT NULL)").run();
}
export async function listDeliveryIncidents(env,limit=30){
  await ensureDeliveryTables(env);
  const cap=Math.max(1,Math.min(50,Number(limit)||30));
  const oldSending=new Date(Date.now()-10*60*1000).toISOString();
  const rows=(await env.DB.prepare(
    "SELECT o.delivery_key,o.state,o.claimed_at,o.error,s.next_retry_at,s.attempts "+
    "FROM telegram_delivery_outbox o LEFT JOIN telegram_delivery_retry_schedule s "+
    "ON s.delivery_key=o.delivery_key WHERE o.state IN ('uncertain','retryable','rejected') "+
    "OR (o.state='sending' AND o.claimed_at<?) "+
    "ORDER BY o.claimed_at DESC LIMIT ?"
  ).bind(oldSending,cap).all()).results||[];
  return {count:rows.length,incidents:rows};
}
export async function sendOnce(env,{key,text,parse_mode="HTML",disable_web_page_preview=true}={}) {
  if(!key||!text)throw Error("Missing durable Telegram delivery id or text");
  await verifyTelegram(env);
  await ensureDeliveryTables(env);
  const now=Date.now(),chat=String(env.TG_CHAT_ID);
  const first=await env.DB.prepare(
    "INSERT OR IGNORE INTO telegram_delivery_outbox(delivery_key,chat_id,state,claimed_at) VALUES(?,?,'sending',?)"
  ).bind(key,chat,new Date(now).toISOString()).run();
  if(!Number(first.meta?.changes||0)){
    // Atomic lease: no competing invocation can retry the same 429 rejection.
    const resumed=await env.DB.prepare(
      "UPDATE telegram_delivery_outbox SET state='sending',error=NULL "+
      "WHERE delivery_key=? AND chat_id=? AND state='retryable' AND EXISTS ("+
      "SELECT 1 FROM telegram_delivery_retry_schedule WHERE delivery_key=? "+
      "AND next_retry_at<=? AND attempts<?)"
    ).bind(key,chat,key,now,MAX_RATE_LIMIT_RETRIES).run();
    if(!Number(resumed.meta?.changes||0))return {sent:false,state:"already_reserved"};
  }
  let result;
  try {
    result=await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,parse_mode,disable_web_page_preview});
  }catch(error){
    const info=String(error?.message||error).slice(0,240);
    if(error instanceof TelegramApiError&&error.status===429){
      const retryAt=Date.now()+Math.max(1,Number(error.retryAfter)||60)*1000;
      // A single D1 transaction records both the non-delivery and the next safe retry time.
      await env.DB.batch([
        env.DB.prepare("UPDATE telegram_delivery_outbox SET state='retryable',error=? WHERE delivery_key=?")
          .bind(info,key),
        env.DB.prepare("INSERT INTO telegram_delivery_retry_schedule(delivery_key,next_retry_at,attempts) "+
          "VALUES(?,?,1) ON CONFLICT(delivery_key) DO UPDATE SET "+
          "next_retry_at=excluded.next_retry_at,attempts=attempts+1").bind(key,retryAt)
      ]);
    }else{
      const state=error instanceof TelegramApiError&&error.status>=400&&error.status<500?"rejected":"uncertain";
      await env.DB.prepare("UPDATE telegram_delivery_outbox SET state=?,error=? WHERE delivery_key=?")
        .bind(state,info,key).run().catch(()=>{});
    }
    throw error;
  }
  // Network success and D1 acknowledgement are separate: a failed acknowledgement
  // must not downgrade an already-delivered message into a retryable state.
  try{
    await env.DB.prepare("UPDATE telegram_delivery_outbox SET state='sent',sent_at=?,message_id=?,error=NULL "+
      "WHERE delivery_key=?").bind(new Date().toISOString(),Number(result?.message_id)||null,key).run();
  }catch(error){
    await env.DB.prepare("UPDATE telegram_delivery_outbox SET state='uncertain',error=? WHERE delivery_key=?")
      .bind("D1 delivery acknowledgement failed",key).run().catch(()=>{});
    throw error;
  }
  await env.DB.prepare("DELETE FROM telegram_delivery_retry_schedule WHERE delivery_key=?")
    .bind(key).run().catch(()=>{});
  return {sent:true,state:"sent",message_id:result?.message_id??null};
}
