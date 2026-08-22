; 설치 후 Windows 셸에 아이콘 캐시 갱신을 알립니다.
!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
