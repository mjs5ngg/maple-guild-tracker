# 홈 위젯 데이터 플러그인과 공급자 클래스를 축소 빌드에서도 보존합니다.
-keep class com.guildfollow.mobile.WidgetSnapshotPlugin { *; }
-keep class com.guildfollow.mobile.FavoriteRankingWidgetProvider { *; }
-keep class com.guildfollow.mobile.FavoriteRankingWidgetService { *; }
-keep class com.guildfollow.mobile.PrimaryWeeklyWidgetProvider { *; }
-keep class com.guildfollow.mobile.PrimarySquareWidgetProvider { *; }
-keep class com.guildfollow.mobile.PrimaryCombinedWidgetProvider { *; }
-keep class com.guildfollow.mobile.WidgetSyncWorker { *; }
