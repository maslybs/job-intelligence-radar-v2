import {redditDirectOffer as d} from '../src/features/reddit/reddit-direct-offer.js';
const cases=[
["paid python job",{source:"Reddit r/forhire",title:"[Hiring] Remote Python / AI / ML Engineer",kind:"buyer",geo:"allowed",score:88,engagement:"fulltime",description:"$3000 month"},null,true],
["same job comments unavailable",{source:"Reddit r/forhire",title:"[Hiring] Remote Python / AI / ML Engineer",kind:"buyer",geo:"allowed",score:88,engagement:"fulltime",description:"$3000 month"},{status:"inconclusive",comments_observed:null,competition:"unknown"},true],
["known resolved",{source:"Reddit r/forhire",title:"[Hiring] Remote Python / AI / ML Engineer",kind:"buyer",geo:"allowed",score:88,engagement:"fulltime"},{status:"answered",comments_observed:12},false],
["high competition",{source:"Reddit r/forhire",title:"[Hiring] Remote Python / AI / ML Engineer",kind:"buyer",geo:"allowed",score:88,engagement:"fulltime"},{status:"crowded",comments_observed:120},false],
["not paid",{source:"Reddit r/forhire",title:"[For Hire] I build AI agents",kind:"buyer",geo:"allowed",score:92,engagement:"contract"},null,false],
["low fit",{source:"Reddit r/forhire",title:"[Hiring] engineer needed",kind:"buyer",geo:"allowed",score:70,engagement:"contract"},null,false],
["unpaid equity",{source:"Reddit r/forhire",title:"[Hiring] engineer needed",kind:"buyer",geo:"allowed",score:90,engagement:"contract",description:"Equity only cofounder"},null,false],
["georestricted",{source:"Reddit r/forhire",title:"[Hiring] Python engineer",kind:"buyer",geo:"restricted",score:90,engagement:"contract"},null,false],
["forum unrelated",{source:"Community · n8n",title:"[Hiring] Python engineer",kind:"buyer",geo:"allowed",score:90,engagement:"contract"},null,false]
];
for(const [name,job,review,expected] of cases){const a=!!d(job,review);console.log(name,a===expected?"PASS":"FAIL",a);if(a!==expected)process.exitCode=1}