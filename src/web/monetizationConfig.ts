// 공개 웹에 노출할 광고 단위와 제휴 추천 설정을 안전하게 정규화합니다.
export type AdFitPlacement="desktopLeft"|"desktopRight"|"desktopBottom"|"mobileBottom";
export type AffiliateProvider="coupang"|"linkprice";
export interface AffiliateCard{provider:AffiliateProvider;title:string;description:string;url:string;}
export interface MonetizationConfig{adfit:Record<AdFitPlacement,string>;affiliates:AffiliateCard[];}

const emptyAdfit=():Record<AdFitPlacement,string>=>({desktopLeft:"",desktopRight:"",desktopBottom:"",mobileBottom:""});
export const EMPTY_MONETIZATION:MonetizationConfig={adfit:emptyAdfit(),affiliates:[]};
export function normalizeMonetization(value:unknown):MonetizationConfig{
 if(!value||typeof value!=="object")return EMPTY_MONETIZATION;
 const source=value as Partial<MonetizationConfig>,adfit={...emptyAdfit(),...(source.adfit||{})};
 const affiliates=Array.isArray(source.affiliates)?source.affiliates.filter((item):item is AffiliateCard=>Boolean(item&&["coupang","linkprice"].includes(item.provider)&&item.title&&item.description&&/^https:\/\//.test(item.url))).slice(0,3):[];
 return {adfit,affiliates};
}
export const hasAdFit=(config:MonetizationConfig)=>Object.values(config.adfit).some(Boolean);
export const shouldLoadAdFit=(config:MonetizationConfig,consent:string|null)=>hasAdFit(config)&&consent==="accepted";
