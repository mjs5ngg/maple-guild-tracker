// 공개 웹에 노출할 광고 단위와 제휴 추천 설정을 안전하게 정규화합니다.
export type AdPlacement="desktopLeft"|"desktopRight"|"desktopBottom"|"mobileBottom";
export type AffiliateProvider="coupang"|"linkprice";
export interface AffiliateCard{provider:AffiliateProvider;title:string;description:string;url:string;}
export interface MonetizationConfig{ads:Record<AdPlacement,boolean>;adHostOrigin:string;affiliates:AffiliateCard[];}

const emptyAds=():Record<AdPlacement,boolean>=>({desktopLeft:false,desktopRight:false,desktopBottom:false,mobileBottom:false});
export const EMPTY_MONETIZATION:MonetizationConfig={ads:emptyAds(),adHostOrigin:"",affiliates:[]};
export function normalizeMonetization(value:unknown):MonetizationConfig{
 if(!value||typeof value!=="object")return EMPTY_MONETIZATION;
 const source=value as Partial<MonetizationConfig>,ads={...emptyAds(),...(source.ads||{})},adHostOrigin=typeof source.adHostOrigin==="string"&&/^https:\/\//.test(source.adHostOrigin)?source.adHostOrigin.replace(/\/$/,""):"";
 const affiliates=Array.isArray(source.affiliates)?source.affiliates.filter((item):item is AffiliateCard=>Boolean(item&&["coupang","linkprice"].includes(item.provider)&&item.title&&item.description&&/^https:\/\//.test(item.url))).slice(0,3):[];
 return {ads,adHostOrigin,affiliates};
}
export const hasDisplayAds=(config:MonetizationConfig)=>Boolean(config.adHostOrigin)&&Object.values(config.ads).some(Boolean);
export const shouldLoadAds=(config:MonetizationConfig,consent:string|null)=>hasDisplayAds(config)&&consent==="accepted";
