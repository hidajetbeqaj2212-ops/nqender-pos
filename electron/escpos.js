// Driverless receipt printing: the receipt page is rendered to an image and sent to the
// printer as ESC/POS raster bytes. Works with any 80mm thermal printer (they all speak ESC/POS),
// over the network (TCP 9100) or through a Windows queue in RAW mode (even "Generic / Text Only").
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const DOTS = 576; // printable width of an 80mm head at 203 dpi (72mm)

// BGRA bitmap -> ESC/POS bytes (init, raster bands, feed, cut)
function toEscPos(bgra, width, height) {
  const bytesPerRow = Math.ceil(DOTS / 8);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(bytesPerRow);
    for (let x = 0; x < Math.min(width, DOTS); x++) {
      const i = (y * width + x) * 4;
      const lum = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2];
      if (bgra[i + 3] > 0 && lum < 150) row[x >> 3] |= 0x80 >> (x & 7);
    }
    rows.push(row);
  }
  // trim blank rows at the top and bottom: the paper only feeds as far as the ink goes
  const blank = r => r.every(b => b === 0);
  let first = 0; while (first < rows.length - 1 && blank(rows[first])) first++;
  let last = rows.length - 1; while (last > first && blank(rows[last])) last--;
  const used = rows.slice(first, last + 1);
  const out = [Buffer.from([0x1b, 0x40])]; // ESC @
  for (let y = 0; y < used.length; y += 128) {
    const band = used.slice(y, y + 128);
    out.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, band.length & 0xff, band.length >> 8]));
    out.push(...band);
  }
  out.push(Buffer.from([0x1b, 0x4a, 0x60])); // feed ~12mm so the last line clears the tear bar
  out.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])); // feed to the cutter and cut (ignored if there is no cutter)
  return Buffer.concat(out);
}

function sendTcp(host, data, port = 9100) {
  return new Promise(resolve => {
    const sock = net.connect({ host, port, timeout: 5000 }, () => sock.end(data));
    sock.on('close', hadErr => { if (!hadErr) resolve({ ok: true }); });
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, error: `Printeri ${host} nuk përgjigjet` }); });
    sock.on('error', e => resolve({ ok: false, error: `Printeri ${host}: ${e.code || e.message}` }));
  });
}

const PS = String.raw`param([string]$p,[string]$f)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class NqRaw {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DI { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
 [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern int StartDocPrinter(IntPtr h, int l, [In] DI d);
 [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
 public static string Send(string name, byte[] data) {
  IntPtr h; if (!OpenPrinter(name, out h, IntPtr.Zero)) return "open " + Marshal.GetLastWin32Error();
  var d = new DI(); d.pDocName = "nQender fature"; d.pDataType = "RAW";
  if (StartDocPrinter(h, 1, d) == 0) { int e = Marshal.GetLastWin32Error(); ClosePrinter(h); return "doc " + e; }
  StartPagePrinter(h); int w; bool ok = WritePrinter(h, data, data.Length, out w);
  EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h);
  return ok ? "ok" : "write " + Marshal.GetLastWin32Error();
 }
}
"@
Write-Output ([NqRaw]::Send($p, [IO.File]::ReadAllBytes($f)))
`;

function sendWindowsRaw(printer, data, dir) {
  return new Promise(resolve => {
    const script = path.join(dir, 'nqender-raw-print.ps1');
    if (!fs.existsSync(script) || fs.readFileSync(script, 'utf8') !== PS) fs.writeFileSync(script, PS, 'utf8');
    const file = path.join(os.tmpdir(), `nqender-${Date.now()}.bin`);
    fs.writeFileSync(file, data);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-p', printer, '-f', file],
      { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
        fs.unlink(file, () => {});
        const out = String(stdout || '').trim();
        if (out.endsWith('ok')) return resolve({ ok: true });
        resolve({ ok: false, error: `Printeri "${printer}": ${out || String(stderr || err && err.message || 'gabim').slice(0, 160)}` });
      });
  });
}

module.exports = { DOTS, toEscPos, sendTcp, sendWindowsRaw };
