// Prefer concrete commercial work over generic questions while ensuring both
// Reddit business owners and dedicated support forums get AI capacity.
const text=x=>(String(x?.title||"")+" "+String(x?.description||"")).slice(0,2500);
export function prospectPriorityScore(x){
 const t=text(x),source=String(x?.source||"");
 let p=0;
 if(/\b(?:willing to pay|paid (?:job|audit|review|help|consult|test)|\$\s*\d+|budget (?:is|of)|hire (?:someone|a developer|a freelancer)|looking for (?:a|an) (?:developer|engineer|contractor|consultant|freelancer|specialist))\b/i.test(t))p+=50;
 if(/\b(?:need someone to (?:build|fix|finish|implement)|outsource|looking for technical help|need an expert|need a freelancer)\b/i.test(t))p+=38;
 if(/\b(?:my|our) (?:business|company|clients|customers|agency|product|platform|saas|store|orders|inventory)|production|launch|revenue|customer data|commercial/i.test(t))p+=24;
 if(/\b(?:losing (?:orders|clients|customers|sales)|stuck|failing|broken|cannot launch|can't finish|spending hours|manual work|billing|payments|business operations)\b/i.test(t))p+=18;
 if(/\b(?:api|webhook|integrat|automat|agent|llm|crm|inventory|saas|database|workflow)\b/i.test(t))p+=9;
 if(/\b(?:how (?:do|can|to)|recommended|which tool|what is the best)\b/i.test(t)&&p<50)p-=16;
 if(/\b(?:student|homework|tutorial|learning|beginner|looking for work|available for hire|i offer|i provide services|check out my product|sign up for my)\b/i.test(t))p-=65;
 if(/\b(?:monthly job digest|open roles|hiring roundup|newsletter|job listing)\b/i.test(t))p-=40;
 if(source.startsWith("Community ·")&&p<40)p-=14;
 return p;
}
export function selectProspectTriage(rows,limit=7){
 const cap=Math.max(1,Math.min(20,Math.floor(Number(limit)||7)));
 const sorted=[...(rows||[])].sort((a,b)=>prospectPriorityScore(b)-prospectPriorityScore(a)||
  String(b.discovered_at||"").localeCompare(String(a.discovered_at||"")));
 const result=[],srcCounts=new Map();
 const add=(x)=>{if(result.length>=cap||result.some(y=>y.id===x.id))return false;
  const src=String(x.source||"");if((srcCounts.get(src)||0)>=3)return false;
  srcCounts.set(src,(srcCounts.get(src)||0)+1);result.push(x);return true;};
 // Preserve at least two direct buyer asks when available.
 const explicit=sorted.filter(x=>prospectPriorityScore(x)>=62&&/\b(?:paid|hire|looking for (?:a|an)|need someone to|outsource)\b/i.test(text(x)));
 for(const x of explicit){if(result.filter(y=>explicit.includes(y)).length>=Math.min(2,cap))break;add(x);}
 const reddit=sorted.filter(x=>String(x.source||"").startsWith("Reddit"));
 const forum=sorted.filter(x=>String(x.source||"").startsWith("Community"));
 const redditQuota=Math.min(reddit.length,Math.max(1,Math.floor(cap*.45)));
 for(const x of reddit){if(result.filter(y=>String(y.source||"").startsWith("Reddit")).length>=redditQuota)break;add(x);}
 for(const x of forum){if(result.filter(y=>String(y.source||"").startsWith("Community")).length>=Math.ceil(cap*.45))break;add(x);}
 for(const x of sorted)add(x);
 return result;
}
