import {strict as assert} from "node:assert";
import {validateSource} from "../src/features/discovery/custom-sources.js";
import {fetchLimited} from "../src/features/discovery/fetch-limited.js";
const blocked=[
 "https://127.0.0.1/feed","https://10.1.2.3/feed",
 "https://169.254.169.254/latest/meta-data/","https://172.16.4.2/feed",
 "https://100.64.0.1/feed","https://198.18.0.1/feed",
 "https://[::1]/feed","https://[::ffff:127.0.0.1]/feed",
 "https://0x7f000001/feed","https://2130706433/feed",
 "https://127.1/feed","https://localhost./feed",
 "https://server.internal/feed","https://safety.localtest.me/feed",
 "https://10.0.0.1.nip.io/feed","https://host.example/feed",
 "https://user:pass@example.com/feed","https://public.example.org:8443/feed",
 "http://public.example.org/feed"
];
for(const url of blocked)
 assert.throws(()=>validateSource({name:"Synthetic source",kind:"rss",url}),/invalid RSS URL/,url);
const allowed=[
 "https://community.shopify.com/t/latest.rss",
 "https://github.com/org/repository/releases.atom",
 "https://feeds.publicnews.org/jobs?remote=true"
];
for(const url of allowed)
 assert.equal(validateSource({name:"Synthetic source",kind:"rss",url}).url,url);
const original=globalThis.fetch;
let requests=0;
try{
 globalThis.fetch=async (url,options)=>{
   requests++;
   assert.equal(options.redirect,"error","redirect must not bypass SSRF URL validation");
   assert(options.signal,"requests have a timeout");
   return new Response("<rss/>",{status:200});
 };
 assert.equal(await fetchLimited(allowed[0]),"<rss/>");
 for(const url of blocked)
   await assert.rejects(fetchLimited(url),/invalid RSS URL/,url);
 assert.equal(requests,1,"no request for blocked IP or private domain");
}finally{globalThis.fetch=original;}
console.log("PASS RSS SSRF literal IP/private host defense, outgoing redirect denial");
