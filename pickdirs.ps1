# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 virtuanista
#
# vxtop native multi-folder picker (IFileOpenDialog). Only returns paths; it opens, creates or changes nothing.
# Writes a JSON array of the chosen folders to stdout ([] when cancelled).
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Language CSharp -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class vxtopPick {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogRCW { }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint mask, out uint attribs);
    void Compare(IShellItem psi, uint hint, out int order);
  }
  [ComImport, Guid("B63EA76D-1F85-456F-A19C-48159EFA858B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemArray {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
    void GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
    void GetAttributes(int flags, uint mask, out uint attribs);
    void GetCount(out uint n);
    void GetItemAt(uint i, out IShellItem psi);
    void EnumItems(out IntPtr ppenum);
  }
  [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint c, IntPtr filters);
    void SetFileTypeIndex(uint i);
    void GetFileTypeIndex(out uint i);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint fos);
    void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem psi);
    void GetCurrentSelection(out IShellItem psi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem psi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string ext);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr filter);
    void GetResults(out IShellItemArray ppenum);
    void GetSelectedItems(out IShellItemArray ppsai);
  }
  public static string[] Pick(IntPtr owner, string title) {
    var d = (IFileOpenDialog)new FileOpenDialogRCW();
    // folders · multiple · file system only · must exist
    d.SetOptions(0x20 | 0x200 | 0x40 | 0x800);
    d.SetTitle(title); d.SetOkButtonLabel("Abrir como cubos");
    var g = new Guid("5a1d3c7e-51a1-4b5e-9a3c-51a1a0000001"); d.SetClientGuid(ref g); // remembers the last folder
    var res = new List<string>();
    if (d.Show(owner) != 0) return res.ToArray();
    IShellItemArray arr; d.GetResults(out arr); uint n; arr.GetCount(out n);
    for (uint i = 0; i < n; i++) { IShellItem it; arr.GetItemAt(i, out it); string p; it.GetDisplayName(0x80058000, out p); if (!string.IsNullOrEmpty(p)) res.Add(p); }
    return res.ToArray();
  }
}
'@
# an invisible topmost owner window keeps the dialog from opening behind Chrome
$f = New-Object System.Windows.Forms.Form
$f.TopMost = $true; $f.ShowInTaskbar = $false; $f.Opacity = 0; $f.FormBorderStyle = 'None'; $f.StartPosition = 'CenterScreen'; $f.Size = New-Object System.Drawing.Size(1, 1)
$f.Show(); $f.Activate()
try { $r = [vxtopPick]::Pick($f.Handle, 'vxtop · elige una o varias carpetas') } finally { $f.Close() }
ConvertTo-Json -Compress -InputObject @($r)
