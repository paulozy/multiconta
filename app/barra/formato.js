// Texto da segunda linha de cada conta na barra: hunt, treinador e ritmo da sessão. Funções puras,
// num script comum (a barra roda com sandbox e CSP 'self'); os testes o carregam numa VM.
globalThis.formatoBarra = (() => {
  const decimal = (n, casas) => String(Number(n.toFixed(casas))).replace('.', ','); // sem zeros à direita

  /** 950 · 12,3 mil · 350 mil · 1,24 mi · 15,2 mi · 2,1 bi */
  function numero(n) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—';
    const escala = (v, sufixo) => `${decimal(v, v < 10 ? 2 : v < 100 ? 1 : 0)} ${sufixo}`;
    if (n < 1000) return String(Math.round(n));
    if (n < 1e6) return `${decimal(n / 1e3, n < 1e5 ? 1 : 0)} mil`;
    if (n < 1e9) return escala(n / 1e6, 'mi');
    return escala(n / 1e9, 'bi');
  }

  const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  /** Partes da linha (cada uma vira um pedaço na barra); [] = ainda sem dado. */
  function partes(r) {
    if (!r) return [];
    const out = [];
    if (r.centro) out.push('🏥 no Centro');
    else if (r.huntNome) {
      const extra = [maiuscula(r.huntRegiao), r.huntNivel != null ? `nv ${r.huntNivel}` : null].filter(Boolean).join(' ');
      out.push(`🎯 ${r.huntNome}${extra ? ` (${extra})` : ''}`);
    }
    if (r.nivel != null) out.push(`👤 ${r.nivel}`);
    if (r.gold != null) {
      const ritmo = r.goldH != null && r.minutos >= 2 ? ` +${numero(r.goldH)}/h` : '';
      out.push(`💰 ${numero(r.gold)}${ritmo}`);
    }
    // com menos de 2 min de sessão o ritmo ainda é ruído
    if (r.abatesH != null && r.minutos >= 2) out.push(`⚔ ${numero(r.abatesH)}/h`);
    return out;
  }

  return { numero, partes };
})();
