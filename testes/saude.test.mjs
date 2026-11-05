import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avisos, lerPreferences, lerSecurePreferences, minutosParaDormir, motivos, saudeCompleta, saudeDoPerfil, suspensaoLiberada } from '../lancador/saude.mjs';

const EXT = 'C:\\Users\\x\\AppData\\Local\\PokeIdleMulticonta\\ext';
// mesmo formato do Secure Preferences real (macs fictícios)
const prefs = ({ modoDev = true, onde = [], rotulo = [] } = {}) => ({
  extensions: {
    ui: { developer_mode: modoDev },
    settings: {
      aaa: { path: `${EXT}\\onde-cacar`, location: 8, disable_reasons: onde },
      bbb: { path: `${EXT.toLowerCase()}\\rotulo-alt2`, location: 8, disable_reasons: rotulo },
      ccc: { path: 'C:\\Program Files\\Edge\\outra-extensao', location: 1, disable_reasons: [1] },
      ddd: { location: 5 }, // componente do Edge, sem path
    },
  },
  protection: { macs: { extensions: { ui: { developer_mode: 'MAC-FICTICIO' } } } },
});

test('motivos: lista item a item, número antigo por bits; desconhecido sempre conta como desativada', () => {
  assert.deepEqual(motivos([16777216]), ['desativada pelo Edge (código 16777216, visto com o modo de desenvolvedor desligado)']);
  assert.deepEqual(motivos(16777216 | 1), ['desativada à mão', 'desativada pelo Edge (código 16777216, visto com o modo de desenvolvedor desligado)']);
  assert.deepEqual(motivos([4]), ['desativada (código 4)']);
  assert.deepEqual(motivos([3]), ['desativada (código 3)'], 'item da lista não é partido em bits');
  assert.deepEqual(motivos(2 ** 32 + 1), ['desativada à mão', 'desativada (código 4294967296)'], 'bits acima de 32');
  assert.deepEqual(motivos(-2147483648), ['desativada (código -2147483648)'], 'negativo não vira "ativa"');
  assert.deepEqual(motivos(undefined), []);
  assert.deepEqual(motivos([]), []);
  assert.deepEqual(motivos([0]), []);
});

test('saúde: "ext2", "external" e barras trocadas não confundem a pasta das nossas extensões', () => {
  const p = { extensions: { ui: { developer_mode: true }, settings: {
    a: { path: 'C:\\L\\ext2\\x', disable_reasons: [1] },
    b: { path: 'C:\\L\\external\\z', disable_reasons: [1] },
    c: { path: 'C:/L/ext/onde-cacar' },
    d: { path: 'c:\\l\\EXT\\\\rotulo-alt1\\' },
  } } };
  assert.deepEqual(saudeDoPerfil(p, 'C:\\L\\ext\\').extensoes.map((e) => e.pasta), ['onde-cacar', 'rotulo-alt1']);
  assert.deepEqual(saudeDoPerfil(p, 'C:/L/ext').extensoes.length, 2);
});

test('saúde: só olha as nossas extensões (pela pasta, sem diferenciar maiúsculas)', () => {
  const s = saudeDoPerfil(prefs(), EXT + '\\');
  assert.equal(s.modoDev, true);
  assert.deepEqual(s.extensoes, [
    { pasta: 'onde-cacar', ativa: true, motivos: [] },
    { pasta: 'rotulo-alt2', ativa: true, motivos: [] },
  ]);
  assert.deepEqual(avisos(s, 'alt2'), []);
});

test('saúde: o caso do estudo (modo desligado e extensões desativadas) gera avisos e o passo a passo', () => {
  const s = saudeDoPerfil(prefs({ modoDev: false, onde: [16777216], rotulo: [16777216] }), EXT);
  const a = avisos(s, 'alt2');
  assert.match(a[0], /onde-cacar está desativada \(desativada pelo Edge \(código 16777216/);
  assert.match(a[1], /rotulo-alt2 está desativada/);
  assert.match(a[2], /modo de desenvolvedor está desligado/);
  assert.match(a.at(-1), /node lancador\.mjs extensoes alt2/);
});

test('saúde: perfil que ainda não abriu pelo lançador não gera aviso', () => {
  assert.deepEqual(avisos(saudeDoPerfil({ extensions: { ui: {} } }, EXT), 'alt3'), []);
  assert.deepEqual(avisos(saudeDoPerfil(null, EXT), 'alt3'), []);
});

test('saúde: modo ligado mas extensão desativada à mão também avisa', () => {
  const a = avisos(saudeDoPerfil(prefs({ onde: [1] }), EXT), 'principal');
  assert.equal(a.length, 2);
  assert.match(a[0], /desativada à mão/);
});

test('lerSecurePreferences: perfil inexistente é null; arquivo quebrado é erro legível', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'multiconta-saude-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  assert.equal(lerSecurePreferences(join(pasta, 'nada')), null);
  mkdirSync(join(pasta, 'Default'));
  writeFileSync(join(pasta, 'Default', 'Secure Preferences'), '{ quebrado');
  assert.throws(() => lerSecurePreferences(pasta), /não consegui ler o Secure Preferences/);
  writeFileSync(join(pasta, 'Default', 'Secure Preferences'), JSON.stringify(prefs()));
  assert.equal(lerSecurePreferences(pasta).extensions.ui.developer_mode, true);
  const comPasta = join(pasta, 'outra');
  mkdirSync(join(comPasta, 'Default', 'Secure Preferences'), { recursive: true }); // pasta no lugar do arquivo
  assert.throws(() => lerSecurePreferences(comPasta), /não consegui ler o Secure Preferences/);
});

test('janela normal: sem --app e sem flags, só a pasta da conta e uma página em branco', async () => {
  const { argsJanelaNormal } = await import('../lancador/lancador.mjs');
  assert.deepEqual(argsJanelaNormal('C:\\P\\perfis\\alt2'), ['--user-data-dir=C:\\P\\perfis\\alt2', 'about:blank']);
});

test('suspensão: qualquer um dos três jeitos do Edge libera o pokeidle.io (formatos vistos no Edge 156)', () => {
  assert.equal(suspensaoLiberada({ edge: { sleeping_tabs: { enabled: false } } }), true);
  assert.equal(suspensaoLiberada({ performance_tuning: { tab_discarding: { exceptions_with_time: { '[*.]pokeidle.io': '1793131921009' } } } }), true);
  const conteudo = (setting) => ({ profile: { content_settings: { exceptions: { sleeping_tabs: { 'https://pokeidle.io,*': { setting } } } } } });
  assert.equal(suspensaoLiberada(conteudo(2)), true, 'o formato visto nos perfis das alts');
  assert.equal(suspensaoLiberada(conteudo(1)), false, 'ALLOW não protege');
  assert.equal(suspensaoLiberada({ edge: { sleeping_tabs: { enabled: true } }, performance_tuning: { tab_discarding: { exceptions_with_time: { '[*.]outro.site': '1' } } } }), false);
  assert.equal(suspensaoLiberada({ performance_tuning: { tab_discarding: { exceptions_with_time: { '[*.]pokeidle.io.malicioso.com': '1' } } } }), false);
  assert.equal(suspensaoLiberada({}), false);
  assert.equal(suspensaoLiberada(null), false);
});

test('suspensão: aviso só quando sabemos que está ligada', () => {
  const ok = { modoDev: true, extensoes: [{ pasta: 'onde-cacar', ativa: true, motivos: [] }] };
  assert.deepEqual(avisos({ ...ok, suspensao: true }, 'alt1'), []);
  assert.deepEqual(avisos(ok, 'alt1'), [], 'sem leitura (undefined) não avisa');
  const a = avisos({ ...ok, suspensao: false }, 'alt1');
  assert.match(a[0], /guias em suspensão estão ligadas/);
  assert.match(a.at(-1), /extensoes alt1/);
});

test('lerPreferences: lê o Preferences (null se o perfil não existe)', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'multiconta-prefs-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  assert.equal(lerPreferences(pasta), null);
  mkdirSync(join(pasta, 'Default'));
  writeFileSync(join(pasta, 'Default', 'Preferences'), JSON.stringify({ edge: { sleeping_tabs: { enabled: false } } }));
  assert.equal(suspensaoLiberada(lerPreferences(pasta)), true);
});

test('suspensão: só padrões que cobrem https://pokeidle.io (parte principal da chave)', () => {
  const excecao = (k) => suspensaoLiberada({ performance_tuning: { tab_discarding: { exceptions_with_time: { [k]: '1' } } } });
  const conteudo = (k, setting = 2) => suspensaoLiberada({ profile: { content_settings: { exceptions: { sleeping_tabs: { [k]: { setting } } } } } });
  for (const k of ['[*.]pokeidle.io', 'pokeidle.io', 'https://pokeidle.io', 'https://[*.]pokeidle.io:443', '*://pokeidle.io:*']) assert.equal(excecao(k), true, k);
  for (const k of ['https://www.pokeidle.io', 'http://pokeidle.io', 'notpokeidle.io', 'https://pokeidle.io.evil.com', 'pokeidle.io/x']) assert.equal(excecao(k), false, k);
  assert.equal(conteudo('https://pokeidle.io:443,*'), true);
  assert.equal(conteudo('https://x.com,https://pokeidle.io'), false, 'só a parte principal conta');
  assert.equal(suspensaoLiberada({ profile: { content_settings: { exceptions: { sleeping_tabs: { 'https://pokeidle.io,*': {} } } } } }), false, 'sem setting não conta');
  assert.equal(suspensaoLiberada({ edge: { sleeping_tabs: { enabled: true } }, performance_tuning: { tab_discarding: { exceptions_with_time: { '[*.]pokeidle.io': '1' } } } }), true, 'exceção vale com o recurso ligado');
});

test('saúde completa: Preferences ausente = suspensão desconhecida (sem aviso); avisos de extensão continuam', () => {
  const seguras = { extensions: { ui: { developer_mode: true }, settings: { a: { path: `${EXT}\\onde-cacar`, disable_reasons: [1] } } } };
  const sem = saudeCompleta(seguras, null, EXT);
  assert.equal(sem.suspensao, undefined);
  const a = avisos(sem, 'alt1');
  assert.ok(a.some((x) => /onde-cacar está desativada/.test(x)));
  assert.ok(!a.some((x) => /suspensão/.test(x)));
  const com = saudeCompleta(seguras, { edge: { sleeping_tabs: { enabled: true, threshold: 1800 } } }, EXT);
  assert.ok(avisos(com, 'alt1').some((x) => /dormir depois de 30 min/.test(x)), 'usa o limite do perfil');
});

test('minutos para dormir: limite do perfil ou o padrão de 15', () => {
  assert.equal(minutosParaDormir(null), 15);
  assert.equal(minutosParaDormir({ edge: { sleeping_tabs: { threshold: 7200 } } }), 120);
});
