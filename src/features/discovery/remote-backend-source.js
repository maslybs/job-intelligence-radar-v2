import {matchesJobProfile} from "../../platform/profile-matching.js";
// Public, read-only Remote Backend Jobs API. Entries surface free after
// first 24h early-access window; skip anything younger than 30 hours.
export function backendBoardJobs(rows,source,now=Date.now()){
 const result=[],used=new Set();
 for(const x of Array.isArray(rows)?rows:[]){
  const id=String(x.id||"");
  if(!/^[a-z0-9]{12,38}$/i.test(id)||used.has(id))continue;
  const posted=Date.parse(String(x.isoDate||x.createdAt||""));
  if(!Number.isFinite(posted)||posted>now-30*3600000||
     posted<now-12*86400000)continue;
  const regions=String(x.geoRegions||"").toLowerCase();
  const location=String(x.location||"");
  // Many API records tagged "europe" are actually single-country only.
  const broadlyAllowed=regions.includes(",worldwide,")||
    (regions.includes(",europe,")&&/\b(?:Europe|EMEA|European Union)\b/i.test(location));
  if(!broadlyAllowed)continue;
  const title=String(x.title||"").trim();
   if(!matchesJobProfile(title+" "+String(x.contentSnippet||"")))continue;
  const url="https://www.remotebackendjobs.com/"+id;
  used.add(id);
  result.push({title,url,source,
    description:(String(x.contentSnippet||"").replace(/<[^>]*>/g," ").slice(0,1900)+
      " Location: "+location+"; region: "+String(x.geoLabel||"")+"; "+
      " Employer apply: "+String(x.link||"")).slice(0,2300),
    company:String(x.author||x.company||"").slice(0,100),
    region:location.slice(0,100),date:new Date(posted).toISOString()});
  if(result.length>=15)break;
 }
 return result;
}
