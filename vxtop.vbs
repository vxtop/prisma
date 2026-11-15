' SPDX-License-Identifier: Apache-2.0
' Copyright 2026 virtuanista
'
' vxtop launcher for Windows: no console window.
' 1) If the server is not answering, start it hidden (no admin) with its log in %LOCALAPPDATA%\vxtop\servidor.log.
'    --with-window: it lives while the app window is open and everything exits when it closes.
' 2) Open vxtop in its own Chrome app window and profile, as the normal user.
Option Explicit
Dim sh, fso, app, root, port, url, dataDir, logf, i, chrome, cands, c, profile
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set app = CreateObject("Shell.Application")
root = fso.GetParentFolderName(WScript.ScriptFullName)
port = "4827"
url = "http://127.0.0.1:" & port & "/"
dataDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\vxtop"
If Not fso.FolderExists(dataDir) Then fso.CreateFolder dataDir
logf = dataDir & "\servidor.log"
profile = dataDir & "\chrome"

Function Vivo(ms)
  Dim x
  Vivo = False
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts ms, ms, ms, ms
  x.open "GET", url & "api/state", False
  x.send
  ' with On Error Resume Next a failing If condition enters the If: check step by step
  If Err.Number <> 0 Then Exit Function
  If x.status = 200 Then Vivo = True
  On Error GoTo 0
End Function

If Not Vivo(1500) Then
  If sh.Run("cmd /c where node", 0, True) <> 0 Then
    MsgBox "No se encuentra Node.js en el PATH. Instala Node 18 o superior.", vbExclamation, "vxtop"
    WScript.Quit 1
  End If
  ' hidden cmd (0); node inherits its hidden console and writes to the log
  app.ShellExecute "cmd.exe", "/c cd /d """ & root & """ && node """ & root & "\server.js"" --no-open --with-window --port " & port & " > """ & logf & """ 2>&1", root, "open", 0
  For i = 1 To 50
    If Vivo(800) Then Exit For
    WScript.Sleep 800
  Next
  If i > 50 Then
    MsgBox "El servidor no responde en " & url & vbCrLf & "Mira el registro: " & logf, vbExclamation, "vxtop"
    WScript.Quit 1
  End If
End If

chrome = ""
cands = Array(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
              sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
              sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe")
For Each c In cands
  If chrome = "" And fso.FileExists(c) Then chrome = c
Next
If chrome = "" Then
  sh.Run url, 1, False
Else
  sh.Run """" & chrome & """ --app=" & url & " --user-data-dir=""" & profile & """ --window-size=1680,1000 --window-position=60,30 --force-dark-mode --no-first-run --no-default-browser-check --hide-crash-restore-bubble --disable-features=Translate,MediaRouter --class=vxtop", 1, False
End If
