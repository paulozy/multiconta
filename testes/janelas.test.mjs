import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDoArquivo, SCRIPT_EM_USO } from '../lancador/janelas.mjs';

test('estado do arquivo: o caminho vai por variável de ambiente, nunca colado no script', () => {
  const caminho = "C:\\Users\\O'Brien [x]\\*.txt";
  let visto;
  estadoDoArquivo(caminho, (script, vars) => { visto = { script, vars }; return 'livre'; });
  assert.equal(visto.script, SCRIPT_EM_USO);
  assert.deepEqual(visto.vars, { ARQ: caminho });
  assert.ok(!SCRIPT_EM_USO.includes("O'Brien"));
});

test('estado do arquivo: respostas conhecidas passam; erro e lixo viram exceção legível', () => {
  for (const r of ['livre', 'em-uso', 'nao-existe']) assert.equal(estadoDoArquivo('x', () => r), r);
  assert.throws(() => estadoDoArquivo('C:\\a*b', () => 'erro: Caracteres inválidos no caminho.'), /não consegui checar C:\\a\*b: Caracteres inválidos/);
  assert.throws(() => estadoDoArquivo('x', () => 'talvez'), /resposta inesperada/);
});

test('estado do arquivo: o script tenta travar 1 byte (é assim que o LevelDB segura o LOCK)', () => {
  assert.match(SCRIPT_EM_USO, /\$f\.Lock\(0, 1\)/);
  assert.match(SCRIPT_EM_USO, /\$env:MC_ARQ/);
});

import { argumentos, areaDeTrabalho, fecharPids, focarPids, ilegiveis, pastaEmUso, pidsDaConta, processosRaiz, processosRaizAssincrono, SCRIPT_FECHAR, SCRIPT_FOCAR } from '../lancador/janelas.mjs';

test('argumentos: aspas agrupam (caminho com espaço) e somem', () => {
  assert.deepEqual(argumentos('"C:\\Program Files\\Edge\\msedge.exe" --user-data-dir=C:\\a\\b --app=https://x'),
    ['C:\\Program Files\\Edge\\msedge.exe', '--user-data-dir=C:\\a\\b', '--app=https://x']);
  assert.deepEqual(argumentos('msedge.exe "--user-data-dir=C:\\Users\\Ana Paula\\perfis\\alt1"'), ['msedge.exe', '--user-data-dir=C:\\Users\\Ana Paula\\perfis\\alt1']);
  assert.deepEqual(argumentos('  a   b  '), ['a', 'b']);
  assert.deepEqual(argumentos('a ""'), ['a', '']);
});

test('pidsDaConta: pasta exata (alt2 não casa alt20), sem diferenciar maiúsculas e barras', () => {
  const procs = [
    { pid: 1, cmd: 'msedge.exe --user-data-dir=C:\\L\\perfis\\alt2 --app=https://pokeidle.io/app' },
    { pid: 2, cmd: 'msedge.exe --user-data-dir=C:\\L\\perfis\\alt20 --app=https://pokeidle.io/app' },
    { pid: 3, cmd: '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --profile-directory=Default' },
    { pid: 4, cmd: 'msedge.exe "--user-data-dir=c:/l/PERFIS/alt2/"' },
    { pid: 5, cmd: 'msedge.exe --app=https://pokeidle.io/app --x=--user-data-dir=C:\\L\\perfis\\alt2' },
  ];
  assert.deepEqual(pidsDaConta(procs, 'C:\\L\\perfis\\alt2'), [1, 4]);
  assert.deepEqual(pidsDaConta(procs, 'C:\\L\\perfis\\alt3'), []);
});

test('processosRaiz: lista, objeto único e saída vazia do ConvertTo-Json', () => {
  assert.deepEqual(processosRaiz(() => ''), []);
  assert.deepEqual(processosRaiz(() => '{"ProcessId":7,"CommandLine":"a"}'), [{ pid: 7, cmd: 'a' }]);
  assert.deepEqual(processosRaiz(() => '[{"ProcessId":7,"CommandLine":"a"},{"ProcessId":8,"CommandLine":null}]'), [{ pid: 7, cmd: 'a' }, { pid: 8, cmd: null }]);
});

test('focar e fechar: PIDs e espera vão por variável; nada a fazer sem PIDs', () => {
  const chamadas = [];
  const resposta = { [SCRIPT_FOCAR]: '1', [SCRIPT_FECHAR]: '2 1 0' };
  const rodar = (script, vars) => { chamadas.push({ script, vars }); return resposta[script]; };
  assert.equal(focarPids([], rodar), 0);
  assert.deepEqual(fecharPids([], { rodar }), { fechados: 0, forcados: 0, vivos: 0 });
  assert.equal(chamadas.length, 0);
  assert.equal(focarPids([10, 11], rodar), 1);
  assert.deepEqual(chamadas[0], { script: SCRIPT_FOCAR, vars: { PIDS: '10,11' } });
  assert.deepEqual(fecharPids([10, 11], { rodar, espera: 5 }), { fechados: 1, forcados: 1, vivos: 0 });
  assert.deepEqual(chamadas[1].vars, { PIDS: '10,11', ESPERA: 5 });
});

test('focar e fechar: aviso antes dos números é ignorado; resposta estranha é erro (não "não estava aberta")', () => {
  assert.deepEqual(fecharPids([1], { rodar: () => 'AVISO: algo\r\n1 1 1' }), { fechados: 0, forcados: 0, vivos: 1 });
  for (const lixo of ['', 'x', '1 2', '1 2 0', '2 1 2']) assert.throws(() => fecharPids([1], { rodar: () => lixo }), /resposta inesperada/, JSON.stringify(lixo));
  assert.equal(focarPids([1], () => 'AVISO\n0'), 0);
  assert.throws(() => focarPids([1], () => ''), /resposta inesperada/);
});

test('fechar: pede para fechar a janela antes de encerrar à força', () => {
  assert.ok(SCRIPT_FECHAR.indexOf('CloseMainWindow') < SCRIPT_FECHAR.indexOf('Stop-Process'));
  assert.match(SCRIPT_FOCAR, /IsIconic/, 'só restaura janela minimizada');
});

test('área de trabalho: lê os 4 números e recusa lixo', () => {
  assert.deepEqual(areaDeTrabalho(() => '0 0 1920 1040'), { x: 0, y: 0, w: 1920, h: 1040 });
  assert.deepEqual(areaDeTrabalho(() => '-1920 0 1920 1080'), { x: -1920, y: 0, w: 1920, h: 1080 });
  assert.throws(() => areaDeTrabalho(() => 'erro'), /tamanho da tela/);
  assert.throws(() => areaDeTrabalho(() => '0 0 0 0'), /tamanho da tela/);
});

test('pastaEmUso: qualquer Edge com a pasta no --load-extension (mesmo conta fora da config)', () => {
  const procs = [
    { pid: 1, cmd: 'msedge.exe --user-data-dir=C:\\L\\perfis\\velha --load-extension=C:\\L\\ext\\onde-cacar,C:\\L\\ext\\rotulo-velha' },
    { pid: 2, cmd: 'msedge.exe --profile-directory=Default' },
    { pid: 3, cmd: null },
  ];
  assert.equal(pastaEmUso(procs, 'c:/l/ext/onde-cacar/'), true);
  assert.equal(pastaEmUso(procs, 'C:\\L\\ext\\onde-cacar2'), false);
  assert.equal(pastaEmUso(procs.slice(1), 'C:\\L\\ext\\onde-cacar'), false);
});

test('ilegiveis: Edge com linha de comando nula (o Windows não deixou ler)', () => {
  assert.deepEqual(ilegiveis([{ pid: 1, cmd: 'a' }, { pid: 2, cmd: null }, { pid: 3, cmd: '' }]), [2]);
  assert.deepEqual(pidsDaConta([{ pid: 2, cmd: null }], 'C:\\x'), []);
});

test('argumentos: barra antes de aspas (regra do Windows) não precisa ser exata: o erro cai para o lado seguro', () => {
  // o libuv dobra a barra final ao pôr aspas; normalizar() junta as barras e a pasta ainda casa
  assert.deepEqual(pidsDaConta([{ pid: 9, cmd: 'msedge.exe "--user-data-dir=C:\\a b\\\\"' }], 'C:\\a b'), [9]);
  // aspas escapadas à mão partem diferente do Edge, mas o resultado só pode ser "parece aberta" a mais
  assert.ok(argumentos('x "C:\\a b\\" --app=y').length >= 2);
});

test('processosRaizAssincrono: a mesma leitura, esperando o PowerShell sem travar', async () => {
  assert.deepEqual(await processosRaizAssincrono(async () => ''), []);
  assert.deepEqual(await processosRaizAssincrono(async () => '{"ProcessId":7,"CommandLine":"a"}'), [{ pid: 7, cmd: 'a' }]);
  await assert.rejects(processosRaizAssincrono(async () => { throw new Error('timeout'); }), /timeout/);
});
