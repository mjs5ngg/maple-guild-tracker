// 웹 전용 스냅샷과 브라우저 직접 조회 메시지를 정의합니다.
export interface Basic {
 character_name:string; world_name:string; character_class:string;
 character_level:number; character_exp:string|number; character_exp_rate:string;
 character_guild_name?:string; character_image?:string;
}
export type HistoryBasic=Pick<Basic,"character_level"|"character_exp"|"character_exp_rate">;
export interface Snapshot {ocid:string;basic:Basic;observedAt:string;history:{date:string;basic:HistoryBasic}[];todayBaseline?:HistoryBasic;estimated?:boolean;isGuildMember?:boolean;guildMembership?:Record<string,boolean>|null;isHunting?:boolean;activityDecidedAt?:string|null}
declare global {
const __EXP_TABLE__:string[];
const __MONETIZATION__:import("./monetizationConfig").MonetizationConfig;
 const __ADSTERRA__:Record<import("./monetizationConfig").AdPlacement,{key:string;scriptUrl:string;width:number;height:number}|null>;
 const __DASHBOARD_ORIGIN__:string;
 const __DIRECT_ORIGIN__:string;
 interface Window {atOptions?:Record<string,unknown>;}
}
