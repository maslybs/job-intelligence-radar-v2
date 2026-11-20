import {copyFileSync,existsSync,chmodSync} from "node:fs";
import {resolve} from "node:path";
const source=resolve("config/radar.config.example.json");
const target=resolve("config/radar.config.json");
if(existsSync(target)){
 console.log("Private configuration already exists. No files changed.");
}else{
 copyFileSync(source,target);
 chmodSync(target,0o600);
 console.log("Created config/radar.config.json from public example (ignored by Git).");
}
console.log("Edit profile, search, sources, reddit, community, AI and notifications. Then run npm run ci.");
