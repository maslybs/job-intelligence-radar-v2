// Native SQLite/D1 verification of the atomic retry claim (not an in-memory mock).
import {strict as assert} from "node:assert";
import {Miniflare} from "miniflare";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {sendOnce} from "../src/features/delivery/telegram-outbox.js";
if(RADAR_SETTINGS.notifications.telegramEnabled){
  const instance=new Miniflare({
    script:"export default {fetch(){return new Response('ok')}}",
    modules:true,compatibilityDate:"2026-05-03",d1Databases:{DB:"TEST_RETRY_D1"}
  });
  const originalFetch=globalThis.fetch;
  let mode="rate",sends=0;
  const env={DB:await instance.getD1Database("DB"),TG_BOT_TOKEN:"fake",TG_CHAT_ID:"321"};
  globalThis.fetch=async url=>{
    const method=String(url).split("/").at(-1);
    if(method==="getMe")return Response.json({ok:true,result:{is_bot:true,id:13,username:RADAR_SETTINGS.notifications.telegram.expectedBotUsername||"test_bot"}});
    if(method==="getChat")return Response.json({ok:true,result:{id:321,type:RADAR_SETTINGS.notifications.telegram.allowedChatTypes[0],title:RADAR_SETTINGS.notifications.telegram.expectedChatTitle||"Test room"}});
    if(method==="sendMessage"){
      sends++;
      if(mode==="rate")return Response.json({ok:false,description:"Too Many Requests",parameters:{retry_after:30}},{status:429});
      return Response.json({ok:true,result:{message_id:773}});
    }
    throw Error("Unexpected "+method);
  };
  try{
    await assert.rejects(sendOnce(env,{key:"real-d1-key",text:"test"}),/HTTP 429/);
    assert.equal((await env.DB.prepare("SELECT state FROM telegram_delivery_outbox WHERE delivery_key='real-d1-key'").first()).state,"retryable");
    assert.equal((await env.DB.prepare("SELECT attempts FROM telegram_delivery_retry_schedule WHERE delivery_key='real-d1-key'").first()).attempts,1);
    assert.equal((await sendOnce(env,{key:"real-d1-key",text:"test"})).state,"already_reserved");
    assert.equal(sends,1);
    await env.DB.prepare("UPDATE telegram_delivery_retry_schedule SET next_retry_at=0 WHERE delivery_key='real-d1-key'").run();
    mode="ok";
    const result=await sendOnce(env,{key:"real-d1-key",text:"test"});
    assert.equal(result.state,"sent");
    assert.equal(result.message_id,773);
    assert.equal(sends,2);
    assert.equal((await sendOnce(env,{key:"real-d1-key",text:"test"})).state,"already_reserved");
    assert.equal(sends,2);
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM telegram_delivery_retry_schedule").first()).n,0);
    console.log("PASS native D1 transactional HTTP 429 retry and exactly one successful send");
  }finally{globalThis.fetch=originalFetch;await instance.dispose();}
}else{
  console.log("PASS disabled Telegram skips native D1 delivery fixture");
}
