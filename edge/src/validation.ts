// 공개 설정과 정규화 수집 본문이 허용된 필드와 범위만 갖는지 검사합니다.
export const FAVORITE_LIMIT=30;

export function validName(value:unknown):value is string{
 return typeof value==="string"&&value.length>0&&[...value].length<=20&&!/[\s\p{C}]/u.test(value);
}

export function validProfile(value:unknown):value is {primary:string;favorites:string[]}{
 if(!value||typeof value!=="object")return false;
 const record=value as Record<string,unknown>;
 if(Object.keys(record).some(key=>!["primary","favorites"].includes(key)))return false;
 if(!validName(record.primary)||!Array.isArray(record.favorites)||record.favorites.length>FAVORITE_LIMIT)return false;
 return record.favorites.every(validName)&&new Set(record.favorites).size===record.favorites.length;
}

export type ActivityDecision="active"|"inactive"|null;
export type NormalizedCharacter={ocid:string;name:string;worldName?:string|null;characterClass?:string|null;level:number;exp:string;expRate:number;guildName?:string|null;guildKey?:string|null;imageUrl?:string|null;observedAt:string;activityDecision?:ActivityDecision;activityDecisionAt?:string|null};
export type DailySnapshot=Omit<NormalizedCharacter,"guildKey"|"observedAt">&{date:string};
export type TodayBaseline=Pick<NormalizedCharacter,"ocid"|"name"|"level"|"exp"|"expRate">&{date:string};
export type GuildInput={guildKey:string;worldName:string;name:string;observedAt:string;members:string[];daily?:{date:string;members:string[]}[]};
export type IngestBody={batchId:string;sentAt:string;current:NormalizedCharacter[];dailySnapshots:DailySnapshot[];todayBaselines:TodayBaseline[];guilds:GuildInput[];sync:{status:string;startedAt?:string|null;finishedAt?:string|null;succeeded:number;failed:number}};

function iso(value:unknown){return typeof value==="string"&&!Number.isNaN(Date.parse(value));}
function date(value:unknown){return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);}
function exactKeys(record:Record<string,unknown>,allowed:string[]){return Object.keys(record).every(key=>allowed.includes(key));}
function nullableString(value:unknown){return value===undefined||value===null||typeof value==="string";}
function numberFields(row:Record<string,unknown>){
 return Number.isInteger(row.level)&&Number(row.level)>=1&&Number(row.level)<=999
  &&typeof row.exp==="string"&&/^\d+$/.test(row.exp)
  &&typeof row.expRate==="number"&&Number.isFinite(row.expRate)&&row.expRate>=0&&row.expRate<100;
}
function normalized(value:unknown):value is NormalizedCharacter{
 if(!value||typeof value!=="object")return false;
 const row=value as Record<string,unknown>;
 return exactKeys(row,["ocid","name","worldName","characterClass","level","exp","expRate","guildName","guildKey","imageUrl","observedAt","activityDecision","activityDecisionAt"])
  &&typeof row.ocid==="string"&&row.ocid.length>0&&row.ocid.length<=100&&validName(row.name)&&numberFields(row)&&iso(row.observedAt)
  &&nullableString(row.worldName)&&nullableString(row.characterClass)&&nullableString(row.guildName)&&nullableString(row.guildKey)&&nullableString(row.imageUrl)
  &&(row.activityDecision===undefined||row.activityDecision===null
   ? row.activityDecisionAt===undefined||row.activityDecisionAt===null
   : (row.activityDecision==="active"||row.activityDecision==="inactive")&&iso(row.activityDecisionAt));
}

export type ChasePresetInput={id:string;name:string;periodDays:7|30;ocids:string[];sortKey:"today"|"period"|"average"|"catchup";sortDirection:"asc"|"desc"};
export function validChasePreset(value:unknown):value is ChasePresetInput{
 if(!value||typeof value!=="object")return false;
 const row=value as Record<string,unknown>;
 return exactKeys(row,["id","name","periodDays","ocids","sortKey","sortDirection"])
  &&typeof row.id==="string"&&/^[a-zA-Z0-9_-]{8,80}$/.test(row.id)
  &&typeof row.name==="string"&&row.name.trim().length>0&&[...row.name].length<=40
  &&(row.periodDays===7||row.periodDays===30)&&Array.isArray(row.ocids)&&row.ocids.length>=1&&row.ocids.length<=10
  &&row.ocids.every(value=>typeof value==="string"&&value.length>0&&value.length<=100)&&new Set(row.ocids).size===row.ocids.length
  &&["today","period","average","catchup"].includes(String(row.sortKey))&&["asc","desc"].includes(String(row.sortDirection));
}
function daily(value:unknown):value is DailySnapshot{
 if(!value||typeof value!=="object")return false;
 const row=value as Record<string,unknown>;
 return exactKeys(row,["ocid","name","worldName","characterClass","level","exp","expRate","guildName","imageUrl","date"])
  &&typeof row.ocid==="string"&&validName(row.name)&&numberFields(row)&&date(row.date)
  &&nullableString(row.worldName)&&nullableString(row.characterClass)&&nullableString(row.guildName)&&nullableString(row.imageUrl);
}
function baseline(value:unknown):value is TodayBaseline{
 if(!value||typeof value!=="object")return false;
 const row=value as Record<string,unknown>;
 return exactKeys(row,["ocid","name","level","exp","expRate","date"])
  &&typeof row.ocid==="string"&&validName(row.name)&&numberFields(row)&&date(row.date);
}
function guild(value:unknown):value is GuildInput{
 if(!value||typeof value!=="object")return false;
 const row=value as Record<string,unknown>;
 return exactKeys(row,["guildKey","worldName","name","observedAt","members","daily"])
  &&typeof row.guildKey==="string"&&row.guildKey.length>0&&typeof row.worldName==="string"&&typeof row.name==="string"&&iso(row.observedAt)
  &&Array.isArray(row.members)&&row.members.length<=500&&row.members.every(validName)
  &&(row.daily===undefined||(Array.isArray(row.daily)&&row.daily.length<=31&&row.daily.every(entry=>{
   if(!entry||typeof entry!=="object")return false;
   const item=entry as Record<string,unknown>;
   return exactKeys(item,["date","members"])&&date(item.date)&&Array.isArray(item.members)&&item.members.length<=500&&item.members.every(validName);
  })));
}

export function validIngest(value:unknown):value is IngestBody{
 if(!value||typeof value!=="object")return false;
 const body=value as Record<string,unknown>;
 if(!exactKeys(body,["batchId","sentAt","current","dailySnapshots","todayBaselines","guilds","sync"]))return false;
 if(typeof body.batchId!=="string"||!iso(body.sentAt)||!Array.isArray(body.current)||body.current.length>1200||!body.current.every(normalized))return false;
 if(!Array.isArray(body.dailySnapshots)||body.dailySnapshots.length>5000||!body.dailySnapshots.every(daily))return false;
 if(!Array.isArray(body.todayBaselines)||body.todayBaselines.length>1200||!body.todayBaselines.every(baseline))return false;
 if(!Array.isArray(body.guilds)||body.guilds.length>100||!body.guilds.every(guild))return false;
 if(!body.sync||typeof body.sync!=="object")return false;
 const sync=body.sync as Record<string,unknown>;
 return exactKeys(sync,["status","startedAt","finishedAt","succeeded","failed"])
  &&typeof sync.status==="string"&&nullableString(sync.startedAt)&&nullableString(sync.finishedAt)
  &&Number.isInteger(sync.succeeded)&&Number(sync.succeeded)>=0&&Number.isInteger(sync.failed)&&Number(sync.failed)>=0;
}
