import {strict as assert} from "node:assert";
import {readFileSync,readdirSync} from "node:fs";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {matchesJobProfile,matchesLeadProfile} from "../src/platform/profile-matching.js";
import {excludedTopicLead,leadExcludedTopic} from "../src/features/discovery/source-accessibility.js";
const synthetic={
 jobs:{profile:{skills:["Cobalt"],provenExperience:[]},
  criteria:{includeKeywords:["Oxide"],preferredRoles:[],excludeTechnologies:["ForbiddenJobs"],excludeKeywords:[]},
  browserSources:{dou:{targets:[]}}},
 leads:{profile:{services:["Orchid"],provenDeliveries:[],excludedServices:["ForbiddenLeads"]},
  criteria:{excludeKeywords:[]},sources:{reddit:{topicPhrases:[],intentPhrases:[],seedSearches:[]}}}
};
assert(matchesJobProfile("Cobalt Engineer",synthetic));
assert(!matchesJobProfile("Orchid consulting",synthetic));
assert(matchesLeadProfile("Orchid consulting",synthetic));
assert(!matchesLeadProfile("Cobalt Engineer",synthetic));
assert(excludedTopicLead({title:"ForbiddenJobs service"},synthetic));
assert(!excludedTopicLead({title:"ForbiddenLeads service"},synthetic));
assert(leadExcludedTopic({title:"ForbiddenLeads service"},synthetic));
assert(!leadExcludedTopic({title:"ForbiddenJobs service"},synthetic));
const telegram=readFileSync("src/features/delivery/telegram-transport.js","utf8")+readFileSync("src/http/telegram/command-handler.js","utf8");
const forbidden=[/chat_id\s*!==\s*["\x27]-?\d+/,/channel:\s*["\x27][^"\x27]+private[^"\x27]*["\x27]/,/me\.username\s*!==\s*["\x27]/];
assert(forbidden.every(pattern=>!pattern.test(telegram)));
const publicExample=JSON.parse(readFileSync("config/radar.config.example.json","utf8"));
assert.equal(publicExample.notifications.telegram.expectedBotUsername,"");
assert.equal(publicExample.notifications.telegram.expectedChatTitle,"");
assert.equal(publicExample.integrations.oneaihub.enabled,false);
assert.equal(publicExample.integrations.oneaihub.endpointPath,"");
assert(Array.isArray(RADAR_SETTINGS.jobs.sources.items));
console.log("PASS private profile isolation, independent job/lead filters and anonymous public bot configuration");
