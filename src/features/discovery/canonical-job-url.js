// Stable listing identity: do not collapse distinct postings sharing title/company.
const TRACKING=new Set(["fbclid","gclid","dclid","mc_cid","mc_eid","ref_src"]);
export function canonicalJobUrl(value){
  const u=new URL(value);
  if(u.protocol!=="https:"&&u.protocol!=="http:")throw Error("Invalid job URL protocol");
  u.hash="";
  u.username="";u.password="";
  for(const key of [...u.searchParams.keys()])
    if(key.toLowerCase().startsWith("utm_")||TRACKING.has(key.toLowerCase()))
      u.searchParams.delete(key);
  u.searchParams.sort();
  if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,"");
  return u.href;
}
