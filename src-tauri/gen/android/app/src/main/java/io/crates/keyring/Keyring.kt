// Android Keystore가 사용할 애플리케이션 컨텍스트를 Rust 계층에 전달합니다.
package io.crates.keyring

import android.content.Context

class Keyring {
  companion object {
    init {
      System.loadLibrary("maple_guild_tracker_lib")
    }

    external fun initializeNdkContext(context: Context)
  }
}
