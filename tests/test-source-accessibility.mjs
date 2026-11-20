import {strict as assert} from "node:assert";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {requiresPaidSubscription,sourceIsActionable,listingIsActionable} from "../src/features/discovery/source-accessibility.js";
const blocked=RADAR_SETTINGS.jobs.sources.inaccessibleHosts;
const sample={name:"Example Feed",source:"Example Feed",title:"Example job",url:"https://example.com/jobs/123"};
assert(!requiresPaidSubscription(sample.url));
assert(sourceIsActionable(sample));
assert(listingIsActionable(sample));
if(blocked.length){
 const domain=blocked[0];
 assert(requiresPaidSubscription("https://"+domain+"/orders/123"));
 assert(!sourceIsActionable({...sample,url:"https://"+domain+"/test"}));
 assert(!listingIsActionable({...sample,url:"https://"+domain+"/test"}));
}
assert(!requiresPaidSubscription("https://another-example.org/jobs"));
assert(sourceIsActionable({...sample,name:"Independent Source"}));
console.log("PASS source restrictions are driven by the selected profile, not hardcoded account sources");
