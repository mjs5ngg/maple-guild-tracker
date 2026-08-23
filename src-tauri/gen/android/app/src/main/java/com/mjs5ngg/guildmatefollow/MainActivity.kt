// 길드원 따라가기 Android 앱의 기본 액티비티를 제공합니다.
package com.mjs5ngg.guildmatefollow

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
