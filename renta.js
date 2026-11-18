/* Gestión del Dinero · informe para la renta (Trade Republic)
   Ventas por FIFO con comisiones, regla de los dos meses, intereses y dividendos.
   Se guarda como PDF con «Imprimir» del iPhone o se comparte en CSV. */
(function () {
  'use strict';
  const eur = (n, o) => (window.moneyReal || money)(n, o);
  const fd = (s) => { const d = parseD(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
  const unid = (q) => Number(q).toLocaleString('es-ES', { maximumFractionDigits: 6 });

  const css = `
  #informe{position:fixed;inset:0;z-index:60;background:var(--bg);overflow:auto;-webkit-overflow-scrolling:touch;padding:calc(12px + env(safe-area-inset-top,0px)) 0 calc(24px + env(safe-area-inset-bottom,0px))}
  #informe .bar{position:sticky;top:0;z-index:2;background:var(--bg);display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 16px 12px;max-width:760px;margin:0 auto}
  #informe .bar .sp{flex:1}
  #informe .doc{max-width:760px;margin:0 auto;padding:0 16px;display:flex;flex-direction:column;gap:14px}
  #informe .doc h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.01em}
  #informe .doc h2{margin:6px 0 0;font-size:16px;font-weight:800}
  #informe .kv{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:baseline}
  #informe .kv b{text-align:right;white-space:nowrap;font-weight:800}
  #informe .kv .tot{border-top:1px solid var(--line);padding-top:8px}
  #informe table{font-size:12.5px}
  #informe td,#informe th{white-space:normal;vertical-align:top}
  #informe .note{font-size:12px;color:var(--muted)}
  #informe ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px}
  @media print{
    @page{size:A4;margin:14mm}
    :root{--bg:#fff!important;--surface:#fff!important}
    html,body{background:#fff!important}
    body{padding:0!important}
    body > *:not(#informe), body::before{display:none!important}
    #informe{position:static;overflow:visible;padding:0;background:#fff;color:#111}
    #informe .bar{display:none}
    #informe .doc{max-width:none;padding:0;color:#111}
    #informe .card{background:#fff;border:1px solid #ccc;break-inside:avoid;color:#111}
    #informe .note,#informe .muted,#informe th{color:#444!important}
    #informe .pos{color:#0a6b3a!important}
    #informe table{font-size:10.5px}
    #informe tr{break-inside:avoid}
  }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function datos(Y) {
    const { ventas } = trFIFO();
    const vs = ventas.filter((v) => v.d.startsWith(String(Y))).sort((a, b) => (a.dt < b.dt ? -1 : 1));
    const grupo = (l) => {
      const gan = l.filter((v) => v.gain >= 0).reduce((s, v) => s + v.gain, 0);
      const perd = l.filter((v) => v.gain < 0 && !v.regla2m).reduce((s, v) => s + v.gain, 0);
      const apl = l.filter((v) => v.gain < 0 && v.regla2m).reduce((s, v) => s + v.gain, 0);
      return { l, gan, perd, apl, neto: gan + perd, trans: l.reduce((s, v) => s + v.proceeds, 0), adq: l.reduce((s, v) => s + v.cost, 0) };
    };
    const acc = grupo(vs.filter((v) => v.ac !== 'CRYPTO'));
    const cri = grupo(vs.filter((v) => v.ac === 'CRYPTO'));
    const cash = (ty) => trRows().filter((r) => r.d.startsWith(String(Y)) && r.ty === ty);
    const sum = (l, f) => l.reduce((s, r) => s + Math.abs(Number(r[f]) || 0), 0);
    const div = cash('DIVIDEND'), int = cash('INTEREST_PAYMENT');
    // El CSV trae el importe bruto en «a» y la retención en «tax»
    const intBruto = sum(int, 'a'), intRet = sum(int, 'tax');
    const divBruto = sum(div, 'a'), divRet = sum(div, 'tax');
    const patrimonial = acc.neto + cri.neto;
    const rcm = intBruto + divBruto;
    // Base del ahorro orientativa: un saldo negativo de un bloque compensa hasta el 25 % del otro
    let base;
    if (patrimonial >= 0) base = patrimonial + rcm;
    else base = Math.max(0, rcm - Math.min(-patrimonial, rcm * 0.25));
    const tramos = [[6000, 0.19], [50000, 0.21], [200000, 0.23], [300000, 0.27], [Infinity, 0.30]];
    let cuota = 0, prev = 0;
    for (const [lim, t] of tramos) { if (base > prev) cuota += (Math.min(base, lim) - prev) * t; prev = lim; }
    const retenido = intRet + divRet;
    return { Y, acc, cri, intBruto, intRet, divBruto, divRet, patrimonial, rcm, base, cuota, retenido, hasta: trRows().reduce((m, r) => (r.d > m ? r.d : m), '') };
  }

  function filasTabla(g) {
    return g.l.map((v) => {
      const fc = (v.fc || []).slice().sort();
      const compra = fc.length ? (fc[0] === fc[fc.length - 1] ? fd(fc[0]) : fd(fc[0]) + ' – ' + fd(fc[fc.length - 1])) : '—';
      const nota = v.incompleto ? 'Faltan compras en los datos' : v.regla2m ? 'Pérdida aplazada (recompra en 2 meses)' : '';
      return `<tr><td>${fd(v.d)}</td><td>${esc(v.n)}<div class="note">${esc(v.s || '')}</div></td><td class="n">${unid(v.q)}</td><td>${compra}</td><td class="n">${eur(v.proceeds)}</td><td class="n">${eur(v.cost)}</td><td class="n ${v.gain >= 0 ? 'pos' : ''}">${eur(v.gain, { sign: true })}${nota ? `<div class="note">${nota}</div>` : ''}</td></tr>`;
    }).join('');
  }
  function tabla(g) {
    if (!g.l.length) return '<div class="note">Sin ventas en este año.</div>';
    return `<div class="tbl-wrap"><table><thead><tr><th>Venta</th><th>Valor</th><th>Unid.</th><th>Compra</th><th>Transmisión</th><th>Adquisición</th><th>Resultado</th></tr></thead><tbody>${filasTabla(g)}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="n">${eur(g.trans)}</td><td class="n">${eur(g.adq)}</td><td class="n">${eur(g.gan + g.perd + g.apl, { sign: true })}</td></tr></tfoot></table></div>`;
  }

  function html(d, anios) {
    const hoy = new Date();
    return `<div class="bar">
        <button class="btn ghost" type="button" onclick="cerrarInforme()">‹ Volver</button>
        <span class="sp"></span>
        ${anios.map((y) => `<button class="chip" type="button" aria-pressed="${y === d.Y}" onclick="informeRenta(${y})">${y}</button>`).join('')}
        <button class="btn primary" type="button" onclick="imprimirInforme()">Guardar PDF</button>
        <button class="btn" type="button" onclick="csvInforme(${d.Y})">CSV</button>
      </div>
      <div class="doc">
        <div><h1>Informe para la renta ${d.Y}</h1><div class="note">Trade Republic · generado el ${fd(ymd(hoy))}${d.hasta ? ' · datos hasta el ' + fd(d.hasta) : ''}${d.Y === hoy.getFullYear() ? ' · el año aún no ha terminado' : ''}</div></div>

        <section class="card"><h2>Resumen</h2>
          <div class="kv">
            <span>Ganancias por ventas</span><b class="pos">${eur(d.acc.gan + d.cri.gan)}</b>
            <span>Pérdidas que cuentan</span><b>${eur(d.acc.perd + d.cri.perd)}</b>
            <span>Pérdidas aplazadas (regla de 2 meses)</span><b>${eur(d.acc.apl + d.cri.apl)}</b>
            <span class="tot">Saldo de ganancias y pérdidas</span><b class="tot ${d.patrimonial >= 0 ? 'pos' : ''}">${eur(d.patrimonial, { sign: true })}</b>
            <span>Intereses (bruto · retenido)</span><b>${eur(d.intBruto)} · ${eur(d.intRet)}</b>
            <span>Dividendos (bruto · retenido)</span><b>${eur(d.divBruto)} · ${eur(d.divRet)}</b>
            <span class="tot">Impuesto orientativo sobre este ahorro</span><b class="tot">${eur(d.cuota)}</b>
            <span>Ya retenido</span><b>${eur(d.retenido)}</b>
          </div>
          <div class="note">El impuesto es una estimación con los tipos del ahorro (19 % hasta 6.000 €, 21 % hasta 50.000 €…) y solo con lo que hay en Trade Republic. Lo que pagues de verdad depende del resto de tu declaración.</div>
        </section>

        <section class="card"><h2>Acciones y ETF · ventas</h2>
          <div class="note">En la renta: Ganancias y pérdidas patrimoniales → transmisión de acciones negociadas. Una línea por cada venta (o por valor) con el valor de transmisión y el de adquisición.</div>
          ${tabla(d.acc)}
        </section>

        ${d.cri.l.length ? `<section class="card"><h2>Criptomonedas · ventas</h2>
          <div class="note">En la renta van aparte, en el apartado de monedas virtuales.</div>
          ${tabla(d.cri)}</section>` : ''}

        <section class="card"><h2>Cómo pasarlo a Renta Web</h2>
          <ol>
            <li>Compara este informe con el <b>informe fiscal anual</b> de Trade Republic (en la app: Perfil → Documentos). Si alguna cifra no coincide, usa la suya.</li>
            <li>Acciones y ETF: en <b>Ganancias y pérdidas patrimoniales</b>, añade cada venta con su <b>valor de transmisión</b> y su <b>valor de adquisición</b> (ya incluyen las comisiones).</li>
            <li>Las <b>pérdidas aplazadas</b> no se declaran este año: cuentan cuando vendas las acciones que recompraste.</li>
            <li>Intereses y dividendos: en <b>Rendimientos del capital mobiliario</b>, con el bruto y la retención.</li>
          </ol>
          <div class="note">Cálculo orientativo por el método FIFO (las primeras acciones que compras son las primeras que vendes), que es el que aplica Hacienda. No sustituye a un asesor.</div>
        </section>
      </div>`;
  }

  window.informeRenta = function (Y) {
    if (!trRows().length) { toast('Primero importa el CSV de Trade Republic.'); return; }
    const anios = [...new Set(trRows().map((r) => Number(r.d.slice(0, 4))))].sort();
    Y = Y || today().getFullYear();
    let el = document.getElementById('informe');
    if (!el) { el = document.createElement('div'); el.id = 'informe'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Informe para la renta'); document.body.appendChild(el); }
    el.innerHTML = html(datos(Y), anios);
    el.scrollTop = 0;
  };
  window.cerrarInforme = () => { const el = document.getElementById('informe'); if (el) el.remove(); };
  window.imprimirInforme = function () {
    if (typeof window.print !== 'function') { toast('Este dispositivo no permite imprimir desde aquí. Usa el CSV.'); return; }
    window.print(); // en el iPhone: Compartir → Guardar en Archivos (PDF) o Imprimir
  };
  window.csvInforme = async function (Y) {
    const d = datos(Y);
    const n2 = (x) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
    const filas = [['Tipo', 'Fecha venta', 'Valor', 'ISIN', 'Unidades', 'Fechas de compra', 'Valor transmisión', 'Valor adquisición', 'Resultado', 'Nota']];
    for (const [tipo, g] of [['Acciones/ETF', d.acc], ['Cripto', d.cri]]) for (const v of g.l) {
      const fc = (v.fc || []).slice().sort();
      filas.push([tipo, fd(v.d), v.n, v.s || '', unid(v.q), fc.length ? fd(fc[0]) + (fc.length > 1 ? ' – ' + fd(fc[fc.length - 1]) : '') : '', n2(v.proceeds), n2(v.cost), n2(v.gain), v.regla2m ? 'Pérdida aplazada (2 meses)' : '']);
    }
    filas.push([]);
    filas.push(['Intereses brutos', '', '', '', '', '', n2(d.intBruto), 'Retenido', n2(d.intRet)]);
    filas.push(['Dividendos brutos', '', '', '', '', '', n2(d.divBruto), 'Retenido', n2(d.divRet)]);
    filas.push(['Saldo ganancias y pérdidas', '', '', '', '', '', '', '', n2(d.patrimonial)]);
    const txt = '﻿' + filas.map((r) => r.map((c) => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\n');
    const name = 'renta-' + Y + '-trade-republic.csv';
    const file = new File([txt], name, { type: 'text/csv' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
})();
