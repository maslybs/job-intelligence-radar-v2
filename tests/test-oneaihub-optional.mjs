import {strict as assert} from "node:assert";
import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {oneAIHubCapabilities,hasBrowserOneAIHub} from "../src/integrations/oneaihub/capabilities.js";
import {baseSources} from "../src/features/discovery/source-catalog.js";

const config=structuredClone(RADAR_SETTINGS);
const browserEnv={ONEAIHUB_VPC:{fetch(){throw Error("probe must not execute");}},
 ONEAIHUB_MCP_BEARER_TOKEN:"synthetic-test-only"};
config.integrations.oneaihub.enabled=false;
config.integrations.oneaihub.browser.enabled=false;
config.integrations.oneaihub.computer.enabled=false;
let result=oneAIHubCapabilities(browserEnv,config);
assert.equal(result.reason,"disabled_by_configuration");
assert.equal(result.browser,false);
assert.equal(result.computer,false);
assert.equal(result.filesystem,false);
assert.equal(result.commands,false);
assert.equal(hasBrowserOneAIHub(browserEnv,config),false);
assert(baseSources(config).length>0,"general vacancy sources work without OneAIHUB");

config.integrations.oneaihub.enabled=true;
config.integrations.oneaihub.browser.enabled=true;
config.integrations.oneaihub.computer.enabled=true;
result=oneAIHubCapabilities({},config);
assert.equal(result.browser,false);
assert.equal(result.computer,false);
assert.equal(result.reason,"vpc_binding_unavailable");

result=oneAIHubCapabilities({ONEAIHUB_VPC:browserEnv.ONEAIHUB_VPC},config);
assert.equal(result.reason,"credentials_unavailable");

result=oneAIHubCapabilities(browserEnv,config);
assert.equal(result.reason,"ready");
assert.equal(result.browser,true);
assert.equal(result.computer,true);
assert.equal(result.filesystem,false);
assert.equal(result.commands,false);
config.integrations.oneaihub.computer.enabled=false;
assert.equal(oneAIHubCapabilities(browserEnv,config).computer,false);
console.log("PASS OneAIHUB truly optional: absent VPC/credentials never enables PC or browser");