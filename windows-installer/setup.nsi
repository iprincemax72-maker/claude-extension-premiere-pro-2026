; ============================================================================
;  Flimify for Premiere Pro - Windows setup.exe (NSIS / Modern UI 2)
;  Build with:  makensis -DVERSION=1.0.1 setup.nsi   (see build-installer.sh)
;  Bundles the panel + bridge + install.ps1 into one setup.exe with a wizard,
;  runs the dependency/panel/bridge setup, and registers an uninstaller.
; ============================================================================
Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "1.0.1"
!endif
!define APPNAME   "Flimify for Premiere Pro"
!define PUBLISHER "Flimify"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Flimify"

Name "${APPNAME}"
OutFile "Flimify-Setup.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Flimify"
ShowInstDetails show
ShowUninstDetails show
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "1.0.1.0"
VIAddVersionKey "ProductName"     "${APPNAME}"
VIAddVersionKey "CompanyName"     "${PUBLISHER}"
VIAddVersionKey "FileVersion"     "${VERSION}"
VIAddVersionKey "ProductVersion"  "${VERSION}"
VIAddVersionKey "FileDescription" "${APPNAME} installer"
VIAddVersionKey "LegalCopyright"  "Copyright (c) 2026 ${PUBLISHER}"

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "This installs the Flimify panel for Adobe Premiere Pro, plus Node.js, the Claude CLI and ffmpeg if they are missing.$\r$\n$\r$\nClose Adobe Premiere Pro before continuing.$\r$\n$\r$\nThe first install runs npm install and can take a few minutes."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Almost there"
!define MUI_FINISHPAGE_TEXT "Installed.$\r$\n$\r$\n1. If you are not already logged in, run  claude /login  once (it opens a browser - click Allow).$\r$\n2. Open Premiere Pro -> Window -> Extensions -> Flimify.$\r$\n$\r$\nThe panel starts the bridge for you automatically."
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  ; bundle the whole Windows source tree (install.ps1 + extension\ + bridge\ ...)
  File /r "payload\*"

  DetailPrint "Setting up Node, the Claude CLI, ffmpeg, the panel and the bridge..."
  DetailPrint "(First install runs npm install - this can take a few minutes, please wait.)"
  ; install.ps1 does the real work; SetOutPath above makes $INSTDIR its working dir
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\install.ps1"'
  Pop $0
  DetailPrint "Setup script finished (exit code $0)."

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${UNINSTKEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayIcon"     '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetOutPath "$TEMP"
  ; remove the panel from Adobe's CEP folder
  RMDir /r "$APPDATA\Adobe\CEP\extensions\com.claudebridge.panel"
  ; remove the installed source tree (uninstaller self-removes on reboot if locked)
  RMDir /r "$INSTDIR"
  Delete /REBOOTOK "$INSTDIR\Uninstall.exe"
  RMDir /REBOOTOK "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  ; NOTE: %USERPROFILE%\PremiereClaude (your renders + running bridge) is left intact on purpose.
SectionEnd
