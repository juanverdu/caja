/* Lector de Excel (.xlsx) mínimo, sin internet.
   Implementa solo lo que usa la app: XLSX.read, XLSX.utils.sheet_to_json(header:1)
   y XLSX.SSF.parse_date_code. */
(function () {
  'use strict';
  const td = new TextDecoder('utf-8');
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('no es un .xlsx');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + xlen + clen;
    }
    return {
      has: (name) => !!files[name],
      async text(name) {
        const f = files[name]; if (!f) return null;
        const l = f.off, start = l + 30 + dv.getUint16(l + 26, true) + dv.getUint16(l + 28, true);
        const raw = u8.subarray(start, start + f.csize);
        return td.decode(f.method === 8 ? await inflate(raw) : raw);
      },
    };
  }
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (el, tag) => Array.from(el.getElementsByTagName(tag));
  const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const tText = (el) => kids(el, 't').map((t) => t.textContent).join('');

  async function read(buf) {
    if (buf instanceof Uint8Array) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const z = await unzip(buf);
    const shared = [];
    const ss = await z.text('xl/sharedStrings.xml');
    if (ss) kids(xml(ss), 'si').forEach((si) => shared.push(tText(si)));
    const wbx = xml(await z.text('xl/workbook.xml'));
    const rels = {};
    const rx = await z.text('xl/_rels/workbook.xml.rels');
    if (rx) kids(xml(rx), 'Relationship').forEach((r) => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const SheetNames = [], Sheets = {};
    for (const s of kids(wbx, 'sheet')) {
      const name = s.getAttribute('name');
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = rels[rid] || ('worksheets/sheet' + (SheetNames.length + 1) + '.xml');
      target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const sx = await z.text('xl/' + target);
      if (!sx) continue;
      const rows = [];
      for (const r of kids(xml(sx), 'row')) {
        const ri = (parseInt(r.getAttribute('r'), 10) || rows.length + 1) - 1;
        const row = [];
        let ci = 0;
        for (const c of kids(r, 'c')) {
          const ref = c.getAttribute('r'); if (ref) ci = colIdx(ref);
          const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0];
          let val = '';
          if (t === 's') val = shared[parseInt(v && v.textContent, 10)] ?? '';
          else if (t === 'inlineStr') val = tText(c);
          else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
          else if (t === 'b') val = v ? v.textContent === '1' : '';
          else if (v) { const num = Number(v.textContent); val = isNaN(num) ? v.textContent : num; }
          row[ci] = val; ci++;
        }
        rows[ri] = row;
      }
      SheetNames.push(name); Sheets[name] = { __rows: rows };
    }
    return { SheetNames, Sheets };
  }
  function sheet_to_json(ws, opts) {
    const defval = opts && 'defval' in opts ? opts.defval : undefined;
    const rows = (ws && ws.__rows) || [];
    const width = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const row = []; for (let j = 0; j < width; j++) row.push(r[j] === undefined ? defval : r[j]);
      out.push(row);
    }
    return out;
  }
  function parse_date_code(v) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  // read() es asíncrono: la app lo llama con await
  window.XLSX = { read, utils: { sheet_to_json }, SSF: { parse_date_code }, mini: true };
})();
