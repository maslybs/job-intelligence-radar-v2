// Source-level fast scan cadence is chosen by the private profile.
export const fastSourceMinutes=source=>{
 const minutes=Number(source?.fastMinutes);
 return Number.isInteger(minutes)&&minutes>=5&&minutes<=1440?minutes:null;
}
