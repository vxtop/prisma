# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 virtuanista
#
# vxtop native Windows helper: one persistent PowerShell process.
# Reads one JSON request per line on stdin and answers one JSON line {id, r} or {id, e}.
# Windows APIs only (Restart Manager, DNS cache, process modules, PrintWindow); read-only, it never acts on a process.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Language CSharp -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class VxtopNative {
  [StructLayout(LayoutKind.Sequential)] struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public int ApplicationType; public uint AppStatus; public uint TSSessionId; [MarshalAs(UnmanagedType.Bool)] public bool bRestartable; }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int f, string key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint n, string[] files, uint a, IntPtr b, uint c, string[] d);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint n, [In, Out] RM_PROCESS_INFO[] info, ref uint reasons);
  // processes that have the file open right now: one "pid|name" per line
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetGuiResources(IntPtr h, uint flags);
  // GDI and USER object counts; opened with limited query rights only
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // foreground window: "pid|title"
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  // foreground and cursor: pid, title, x, y, pid and title of the window under the cursor (\u001f-separated)
  public static string Fg2() { string sep = "\u001f"; IntPtr h = GetForegroundWindow(); uint pid = 0; var sb = new StringBuilder(512); if (h != IntPtr.Zero) { GetWindowThreadProcessId(h, out pid); GetWindowText(h, sb, 512); }
    POINT p; GetCursorPos(out p); IntPtr w = GetAncestor(WindowFromPoint(p), 2); uint cp = 0; var sc = new StringBuilder(512); if (w != IntPtr.Zero) { GetWindowThreadProcessId(w, out cp); GetWindowText(w, sc, 512); }
    return pid + sep + sb.ToString() + sep + p.X + sep + p.Y + sep + cp + sep + sc.ToString(); }
  public static string Fg() { IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return ""; uint pid; GetWindowThreadProcessId(h, out pid); var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return pid + "|" + sb.ToString(); }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  // JPEG (base64) thumbnail, w pixels wide, of the foreground window or of a program's main window (any of its pids).
  // PrintWindow with PW_RENDERFULLCONTENT copies what the window paints, including GPU-rendered apps; read-only.
  public static string ShotPids(string pids, int w) { foreach (var t in pids.Split(',')) { int pid; if (!int.TryParse(t, out pid)) continue; try { var pr = System.Diagnostics.Process.GetProcessById(pid); IntPtr h = pr.MainWindowHandle; if (h != IntPtr.Zero && !IsIconic(h)) { string r = ShotH(h, w); if (r != "") return r; } } catch {} } return ""; }
  public static string Shot(int w) { return ShotH(GetForegroundWindow(), w); }
  static string ShotH(IntPtr h, int w) { if (h == IntPtr.Zero || IsIconic(h)) return ""; RECT r; if (!GetWindowRect(h, out r)) return ""; int W = r.R - r.L, H = r.B - r.T; if (W < 50 || H < 50) return "";
    using (var bmp = new System.Drawing.Bitmap(W, H)) { using (var g = System.Drawing.Graphics.FromImage(bmp)) { IntPtr dc = g.GetHdc(); try { PrintWindow(h, dc, 2); } finally { g.ReleaseHdc(dc); } }
      int th = Math.Max(1, H * w / W); using (var sm = new System.Drawing.Bitmap(w, th)) { using (var g2 = System.Drawing.Graphics.FromImage(sm)) { g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear; g2.DrawImage(bmp, 0, 0, w, th); }
        using (var ms = new System.IO.MemoryStream()) { sm.Save(ms, System.Drawing.Imaging.ImageFormat.Jpeg); return Convert.ToBase64String(ms.ToArray()); } } } }
  public static string Gui(int pid) { IntPtr h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) return ""; try { return GetGuiResources(h, 0) + "|" + GetGuiResources(h, 1); } finally { CloseHandle(h); } }
  public static string Who(string file) {
    uint h; var sb = new StringBuilder();
    if (RmStartSession(out h, 0, Guid.NewGuid().ToString("N")) != 0) return "";
    try {
      if (RmRegisterResources(h, 1, new[] { file }, 0, IntPtr.Zero, 0, null) != 0) return "";
      uint need = 0, n = 0, r = 0; int res = RmGetList(h, out need, ref n, null, ref r);
      if (res == 234 && need > 0) { var arr = new RM_PROCESS_INFO[need]; n = need;
        if (RmGetList(h, out need, ref n, arr, ref r) == 0) for (int i = 0; i < n; i++) sb.Append(arr[i].Process.dwProcessId).Append('|').Append(arr[i].strAppName).Append('\n'); }
    } finally { RmEndSession(h); }
    return sb.ToString();
  }
}
'@
while ($true) {
  $line = [Console]::In.ReadLine(); if ($null -eq $line) { break }
  $q = $null; try { $q = $line | ConvertFrom-Json } catch { continue }
  $out = @{ id = $q.id }
  try {
    switch ($q.op) {
      'ping'    { $out.r = 'ok' }
      'who'     { $out.r = @(foreach ($f in @($q.files)) { @{ f = $f; p = [VxtopNative]::Who($f) } }) }
      'recent'  { $sh = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Recent'); $out.r = @(Get-ChildItem $d -Filter *.lnk -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 30 | ForEach-Object { try { @{ t = $sh.CreateShortcut($_.FullName).TargetPath; m = $_.LastWriteTime.ToString('o') } } catch {} }) }
      'dns'     { $out.r = @(Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 1 -or $_.Type -eq 28 } | ForEach-Object { @{ n = $_.Entry; ip = $_.Data } }) }
      'proc'    {
        $p = Get-Process -Id ([int]$q.pid)
        $mods = @(); try { $mods = @($p.Modules | Sort-Object ModuleMemorySize -Descending | Select-Object -First 60 | ForEach-Object { @{ n = $_.ModuleName; f = $_.FileName; s = $_.ModuleMemorySize } }) } catch {}
        $st = $null; try { $st = $p.StartTime.ToString('o') } catch {}
        $gui = ''; try { $gui = [VxtopNative]::Gui([int]$q.pid) } catch {}
        $th = @(); try { $th = @($p.Threads | Select-Object -First 256 | ForEach-Object { $c = $null; try { $c = [int64]$_.TotalProcessorTime.TotalMilliseconds } catch {}; $w = ''; if ("$($_.ThreadState)" -eq 'Wait') { $w = "$($_.WaitReason)" }; @{ id = $_.Id; s = "$($_.ThreadState)"; w = $w; c = $c; pr = $_.CurrentPriority } }) } catch {}
        $out.r = @{ gui = $gui; thl = $th; start = $st; threads = $p.Threads.Count; handles = $p.HandleCount; priv = $p.PrivateMemorySize64; paged = $p.PagedMemorySize64; virt = $p.VirtualMemorySize64; peak = $p.PeakWorkingSet64;
                    company = $p.Company; desc = $p.Description; ver = $p.ProductVersion; prio = "$($p.PriorityClass)"; responding = $p.Responding; modules = $mods }
      }
      'tasks'   { # solo lectura: servicios, programas de inicio y a quién pertenece cada sesión
        $svc = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | ForEach-Object { @{ n = $_.Name; d = $_.DisplayName; s = "$($_.State)"; m = "$($_.StartMode)"; pid = $_.ProcessId } })
        $st = @(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | ForEach-Object { @{ n = $_.Name; c = $_.Command; l = $_.Location; u = $_.User } })
        $us = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -ErrorAction SilentlyContinue | ForEach-Object { try { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction Stop; @{ id = $_.SessionId; u = "$($o.User)" } } catch {} })
        # scheduled tasks via the Task Scheduler COM API: query only, nothing is run
        $sc = @(); try { $svcS = New-Object -ComObject Schedule.Service; $svcS.Connect(); $stack = New-Object System.Collections.Stack; $stack.Push($svcS.GetFolder('\'))
          while ($stack.Count -and $sc.Count -lt 400) { $f = $stack.Pop(); foreach ($sf in $f.GetFolders(0)) { $stack.Push($sf) }; foreach ($t in $f.GetTasks(0)) { if (-not $t.Enabled) { continue }
            $nx = $null; $lr = $null; try { if ($t.NextRunTime.Year -gt 1900) { $nx = $t.NextRunTime.ToString('o') } } catch {}; try { if ($t.LastRunTime.Year -gt 1900) { $lr = $t.LastRunTime.ToString('o') } } catch {}
            $sc += @{ n = $t.Name; p = $t.Path; s = [int]$t.State; next = $nx; last = $lr; res = [int64]$t.LastTaskResult } } } } catch {}
        # crashes and hangs in the last 7 days (Application log: 1000 = crash, 1002 = not responding)
        $fl = @(); try { $fl = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 80 -ErrorAction Stop | ForEach-Object { @{ app = "$($_.Properties[0].Value)"; id = $_.Id; t = $_.TimeCreated.ToString('o') } }) } catch {}
        $out.r = @{ svc = $svc; start = $st; users = $us; sched = $sc; fails = $fl }
      }
      'icons'   { Add-Type -AssemblyName System.Drawing; $o = @{}; foreach ($f in @($q.files)) { try { $i = [System.Drawing.Icon]::ExtractAssociatedIcon($f); $b = $i.ToBitmap(); $m = New-Object IO.MemoryStream; $b.Save($m, [System.Drawing.Imaging.ImageFormat]::Png); $o[$f] = [Convert]::ToBase64String($m.ToArray()) } catch {} }; $out.r = $o }
      'gpu'     { $g = @{}; Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Name -match 'pid_(\d+)_') { $k = $matches[1]; $g[$k] = [int]$g[$k] + [int]$_.UtilizationPercentage } }; $out.r = $g }
      'explorer' { # ventanas abiertas del Explorador: carpeta que muestran y elementos seleccionados (solo lectura; para resolver lo que se arrastra)
        $w = @(); try { foreach ($x in (New-Object -ComObject Shell.Application).Windows()) { try { $d = $x.Document; $f = $d.Folder.Self.Path; if (-not $f) { continue }
          $sel = @(); try { $sel = @($d.SelectedItems() | Select-Object -First 200 | ForEach-Object { $_.Path }) } catch {}; $w += @{ f = $f; s = $sel } } catch {} } } catch {}
        $out.r = $w }
      'fg'      { $out.r = [VxtopNative]::Fg2() }
      'shot'    { $out.r = [VxtopNative]::Shot([int]$q.w) }
      'shotpid' { $out.r = [VxtopNative]::ShotPids([string]$q.pids, [int]$q.w) }
      'admin'   { $out.r = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
      default   { $out.e = 'operación desconocida' }
    }
  } catch { $out.e = $_.Exception.Message }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 5)); [Console]::Out.Flush()
}
