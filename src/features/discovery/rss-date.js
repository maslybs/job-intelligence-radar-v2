// Store source dates as ISO-8601. SQLite julianday() cannot parse
// RFC-2822 'Mon, 19 Oct 2026 18:51:31 +0000' from RSS directly.
export function normalizeSourceDate(x){
 if(x===null||x===undefined||x==="")return "";
 let t;
 if(typeof x==="number")t=x>1e12?x:x*1000;
 else if(typeof x==="string") {
  const s=x.trim();
  if(!s)return "";
  t=/^\d{10,13}$/.test(s)?Number(s)*(s.length===10?1000:1):Date.parse(s);
 }else return "";
 return Number.isFinite(t)?new Date(t).toISOString():"";
}
