// Validate every untrusted feed URL before fetch, not only when it is saved.
// Outbound redirects are disallowed separately: redirect targets must not bypass this check.
const RESERVED_SUFFIXES=["localhost","local","internal","lan","home","home.arpa",
  "intranet","test","invalid","example","onion","corp"];
const PRIVATE_DNS_ALIASES=["nip.io","sslip.io","xip.io","localtest.me","lvh.me","traefik.me"];
export function assertSafeSourceUrl(value,{maxLength=400}={}){
  const input=String(value||"");
  if(input.length>maxLength)throw Error("invalid RSS URL");
  let url;
  try{url=new URL(input)}catch{throw Error("invalid RSS URL")}
  if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443")
    throw Error("invalid RSS URL");
  const hostname=url.hostname.toLowerCase().replace(/\.$/,"");
  // WHATWG URL normalizes hexadecimal/octal/short-form IPv4 to dotted IPv4.
  // Forbid *all* IP literals (even public ones) to prevent private/special ranges,
  // IPv6-mapped addresses and numeric URL obfuscation from bypassing policy.
  if(!hostname.includes(".")||hostname.startsWith("[")||
     /^\d+(?:\.\d+){3}$/.test(hostname)||
     hostname.split(".").some(x=>!x||x.length>63||!/^[a-z0-9-]+$/.test(x)||
       x.startsWith("-")||x.endsWith("-"))||
     [...RESERVED_SUFFIXES,...PRIVATE_DNS_ALIASES].some(s=>hostname===s||hostname.endsWith("."+s)))
    throw Error("invalid RSS URL");
  return url;
}
