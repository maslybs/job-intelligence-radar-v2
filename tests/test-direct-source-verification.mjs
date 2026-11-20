import {strict as assert} from "node:assert";
import {pythonJobPostedAt,recentPythonJob,fetchRecentPythonJobs,freelanceForumIsBuyer} from "../src/features/discovery/direct-source-verification.js";
const now=Date.parse("2026-10-23T07:00:00Z");
assert.equal(pythonJobPostedAt('<span class="listing-posted">Posted <time datetime="2026-10-20T12:45:00+00:00">20 Oct 2026</time></span>'),"2026-10-20T12:45:00.000Z");
assert.equal(pythonJobPostedAt('<span class="listing-posted">Unknown</span>'),null);
assert(recentPythonJob("2026-10-20T00:00:00Z",now));
assert(!recentPythonJob("2026-09-08T00:00:00Z",now));
assert(!recentPythonJob(null,now));
const urls=["https://www.python.org/jobs/8181/","https://www.python.org/jobs/8133/","https://www.python.org/jobs/8180/"];
const posted={"8181":"2026-10-21T10:00:00Z","8133":"2026-09-08T10:00:00Z","8180":null};
let fetchCount=0;
const src=await fetchRecentPythonJobs({feed:"https://www.python.org/jobs/feed/rss/",source:"Python.org · Direct Employer",now,
 fetchText:async url=>{
  fetchCount++;
  if(url.endsWith("rss/"))return "fake-feed";
  const id=url.match(/\/(\d+)\/$/)?.[1],time=posted[id];
  return time?'<span class="listing-posted">Posted <time datetime="'+time+'">some date</time></span>':"missing date";
 },
 parseRss:()=>urls.map((url,i)=>({url,title:"Python Engineer "+i,description:"Remote, Worldwide Python development API integration"}))
});
assert.equal(src.length,1,"only verified fresh postings accepted");
assert.equal(src[0].title,"Python Engineer 0");
assert.equal(fetchCount,4);
const demand={title:"Looking for an experienced Bubble developer to finish and grow a live AI SaaS app",
 description:"We are building a client-facing AI SaaS platform and need help finishing critical backend integrations with REST API."};
assert(freelanceForumIsBuyer(demand));
assert(!freelanceForumIsBuyer({...demand,title:"Bubble Developer Available — happy to build your app"}));
assert(!freelanceForumIsBuyer({...demand,title:"Looking for a developer",description:"Join our team."}));
console.log("PASS direct-source gate, Python publication date, stale listing rejection, seller filtering");
