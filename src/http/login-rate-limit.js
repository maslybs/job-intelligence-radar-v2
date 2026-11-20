// D1 atomic sliding-window login attempt limiter. Hash client IP before persistence.
export const LOGIN_MAX_ATTEMPTS=5;
export const LOGIN_WINDOW_MS=15*60*1000;
export async function consumeLoginAttempt(req,env,now=Date.now()){
  if(!env.INBOX_PASSWORD)throw Error("Inbox authentication not configured");
  const ip=req.headers.get("CF-Connecting-IP")||"unknown";
  const raw=new TextEncoder().encode("radar-login-v1:"+env.INBOX_PASSWORD+":"+ip);
  const digest=await crypto.subtle.digest("SHA-256",raw);
  const bucket=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS login_rate_limits ("+
    "bucket TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL,"+
    "blocked_until INTEGER NOT NULL DEFAULT 0)").run();
  const result=await env.DB.prepare(
    "INSERT INTO login_rate_limits(bucket,window_start,attempts,blocked_until) VALUES(?,?,1,0) "+
    "ON CONFLICT(bucket) DO UPDATE SET "+
    "attempts=CASE WHEN ?-window_start>=? THEN 1 ELSE attempts+1 END,"+
    "window_start=CASE WHEN ?-window_start>=? THEN ? ELSE window_start END,"+
    "blocked_until=CASE WHEN ?-window_start>=? THEN 0 "+
    "WHEN attempts>=? THEN ? ELSE blocked_until END "+
    "WHERE blocked_until<=? RETURNING attempts,blocked_until"
  ).bind(bucket,now,now,LOGIN_WINDOW_MS,now,LOGIN_WINDOW_MS,now,
    now,LOGIN_WINDOW_MS,LOGIN_MAX_ATTEMPTS,now+LOGIN_WINDOW_MS,now).first();
  const blocked=!result||Number(result.attempts)>LOGIN_MAX_ATTEMPTS||
    Number(result.blocked_until)>now;
  return {allowed:!blocked,retryAfter:blocked?
    Math.max(1,Math.ceil((Number(result?.blocked_until)||now+LOGIN_WINDOW_MS)-now)/1000):0};
}
export async function resetLoginAttempts(req,env){
  const ip=req.headers.get("CF-Connecting-IP")||"unknown";
  const raw=new TextEncoder().encode("radar-login-v1:"+env.INBOX_PASSWORD+":"+ip);
  const digest=await crypto.subtle.digest("SHA-256",raw);
  const bucket=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  await env.DB.prepare("DELETE FROM login_rate_limits WHERE bucket=?").bind(bucket).run();
}
