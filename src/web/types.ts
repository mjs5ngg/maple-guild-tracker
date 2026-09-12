// 웹 전용 스냅샷과 브라우저 직접 조회 메시지를 정의합니다.
export interface Basic {
 character_name:string; world_name:string; character_class:string;
 character_level:number; character_exp:string|number; character_exp_rate:string;
 character_guild_name?:string; character_image?:string;
}
export interface Snapshot {ocid:string;basic:Basic;observedAt:string;history:{date:string;basic:Basic}[];todayBaseline?:Basic;estimated?:boolean;isGuildMember?:boolean;guildMembership?:Record<string,boolean>|null;isHunting?:boolean;activityDecidedAt?:string|null}
declare global {
 const __EXP_TABLE__:string[];
 const __DASHBOARD_ORIGIN__:string;
 const __DIRECT_ORIGIN__:string;
}
