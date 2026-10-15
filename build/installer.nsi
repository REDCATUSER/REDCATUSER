!include "MUI2.nsh"
!include "x64.nsh"
!include "${PROJECT_DIR}/build/app-files.nsh"
Name "Rally Horizon 3D"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Rally Horizon 3D"
InstallDirRegKey HKCU "Software\RallyHorizon3D" "InstallDir"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Rally Horizon.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Ce jeu nécessite Windows 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd
Section "Rally Horizon 3D"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  !insertmacro InstallRallyFiles
  WriteUninstaller "$INSTDIR\Desinstaller.exe"
  CreateDirectory "$SMPROGRAMS\Rally Horizon 3D"
  CreateShortcut "$SMPROGRAMS\Rally Horizon 3D\Rally Horizon 3D.lnk" "$INSTDIR\Rally Horizon.exe"
  CreateShortcut "$SMPROGRAMS\Rally Horizon 3D\Desinstaller.lnk" "$INSTDIR\Desinstaller.exe"
  CreateShortcut "$DESKTOP\Rally Horizon 3D.lnk" "$INSTDIR\Rally Horizon.exe"
  WriteRegStr HKCU "Software\RallyHorizon3D" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "DisplayName" "Rally Horizon 3D"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "Publisher" "REDCATUSER"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "DisplayIcon" "$INSTDIR\Rally Horizon.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetRegView 64
  SetShellVarContext current
  !insertmacro UninstallRallyFiles
  Delete "$INSTDIR\Desinstaller.exe"
  Delete "$DESKTOP\Rally Horizon 3D.lnk"
  Delete "$SMPROGRAMS\Rally Horizon 3D\Rally Horizon 3D.lnk"
  Delete "$SMPROGRAMS\Rally Horizon 3D\Desinstaller.lnk"
  RMDir "$SMPROGRAMS\Rally Horizon 3D"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RallyHorizon3D"
  DeleteRegKey HKCU "Software\RallyHorizon3D"
SectionEnd
