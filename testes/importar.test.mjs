import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conferirOrigem, copiarConta, planoDeImportacao, temSessaoPokeidle } from '../lancador/importar.mjs';
import { conferirOpcoes } from '../lancador/lancador.mjs';
import { chaveLS, escreverLog, escreverTabela } from './apoio-leveldb.mjs';

// o Local Storage dos perfis falsos é escrito no formato real do LevelDB (apoio-leveldb.mjs)

/** Monta um "User Data" falso: Local State + um perfil com Local Storage, Cookies e caches. */
function userDataFalso(t, { comSessao = true, extra = [] } = {}) { // extra: mais operações { chave, valor? }
  const raiz = mkdtempSync(join(tmpdir(), 'multiconta-imp-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const userData = join(raiz, 'User Data');
  const perfil = join(userData, 'Profile 3');
  mkdirSync(join(perfil, 'Local Storage', 'leveldb'), { recursive: true });
  mkdirSync(join(perfil, 'Network'), { recursive: true });
  mkdirSync(join(perfil, 'Cache'), { recursive: true });
  mkdirSync(join(perfil, 'Code Cache', 'js'), { recursive: true });
  writeFileSync(join(userData, 'Local State'), '{"os_crypt":{"encrypted_key":"chave-ficticia"}}');
  writeFileSync(join(perfil, 'Preferences'), '{}');
  writeFileSync(join(perfil, 'Network', 'Cookies'), 'cookies-ficticios');
  writeFileSync(join(perfil, 'Cache', 'grande.bin'), 'x'.repeat(100));
  writeFileSync(join(perfil, 'Code Cache', 'js', 'a'), 'x');
  writeFileSync(join(perfil, 'Local Storage', 'leveldb', 'LOCK'), '');
  const ops = [{ chave: chaveLS('cfg-economia'), valor: Buffer.from('\x011') }, { chave: chaveLS('sessao-hunt:treinador1'), valor: Buffer.from('{}') }, ...extra];
  if (comSessao) ops.push({ chave: chaveLS('sessao'), valor: Buffer.from('\x01{"token":"TOKEN-FICTICIO"}') });
  escreverLog(join(perfil, 'Local Storage', 'leveldb', '000003.log'), [{ seq: 1, ops }]);
  return { raiz, userData, destino: join(raiz, 'perfis', 'alt2') };
}
const livre = () => 'livre';

test('plano completo: Local State + perfil (sem caches) em Default', () => {
  const plano = planoDeImportacao({ userData: '/ud', pastaPerfil: 'Profile 3', destino: '/p/alt2', soSessao: false });
  assert.deepEqual(plano.map(({ de, para }) => [de, para]), [['/ud/Local State', '/p/alt2/Local State'], ['/ud/Profile 3', '/p/alt2/Default']]);
  assert.ok(plano[1].pular.has('Cache') && plano[1].pular.has('Code Cache'));
});

test('plano só da sessão: apenas o Local Storage, e nunca o Local State (a chave do perfil pessoal)', () => {
  const plano = planoDeImportacao({ userData: '/ud', pastaPerfil: 'Default', destino: '/p/principal', soSessao: true });
  assert.deepEqual(plano.map(({ de, para }) => [de, para]), [['/ud/Default/Local Storage', '/p/principal/Default/Local Storage']]);
});

test('conferir: perfil aberto no Edge, sem sessão, sem dados ou destino já existente', (t) => {
  const { userData, destino } = userDataFalso(t);
  const base = { userData, pastaPerfil: 'Profile 3', nomePerfil: 'Perfil 2', destino };
  assert.doesNotThrow(() => conferirOrigem({ ...base, emUso: livre }));
  const pedidos = [];
  assert.throws(() => conferirOrigem({ ...base, emUso: (a) => { pedidos.push(a); return a.endsWith('LOCK') ? 'em-uso' : 'livre'; } }),
    /"Perfil 2" está aberto no Edge: feche as janelas dele \(os outros perfis podem seguir abertos\)/);
  assert.ok(pedidos[0].endsWith(join('Local Storage', 'leveldb', 'LOCK')));
  assert.throws(() => conferirOrigem({ ...base, emUso: (a) => (a.endsWith('Cookies') ? 'em-uso' : 'livre') }), /está aberto no Edge/);
  assert.throws(() => conferirOrigem({ ...base, pastaPerfil: 'Profile 9', emUso: livre }), /pasta do perfil "Perfil 2" \(Profile 9\) não existe/);
  mkdirSync(destino, { recursive: true });
  assert.throws(() => conferirOrigem({ ...base, emUso: livre }), /já existe\. Para importar de novo, apague essa pasta/);
});

test('conferir: sem sessão do jogo recusa (o caso do "Perfil 2" no estudo), e --forcar deixa passar', (t) => {
  const { userData, destino } = userDataFalso(t, { comSessao: false });
  const base = { userData, pastaPerfil: 'Profile 3', nomePerfil: 'Perfil 2', destino, emUso: livre };
  assert.throws(() => conferirOrigem(base), /não tem sessão do pokeidle\.io gravada/);
  assert.doesNotThrow(() => conferirOrigem({ ...base, forcar: true }));
  rmSync(join(userData, 'Profile 3', 'Local Storage'), { recursive: true });
  assert.throws(() => conferirOrigem({ ...base, forcar: true }), /não tem dados de sites/);
});

test('copiar completo: chega tudo menos os caches, e não sobra pasta temporária', (t) => {
  const { userData, destino } = userDataFalso(t);
  copiarConta(planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: false }), destino);
  assert.ok(existsSync(join(destino, 'Local State')));
  assert.ok(existsSync(join(destino, 'Default', 'Network', 'Cookies')));
  assert.ok(existsSync(join(destino, 'Default', 'Local Storage', 'leveldb', '000003.log')));
  assert.ok(!existsSync(join(destino, 'Default', 'Cache')));
  assert.ok(!existsSync(join(destino, 'Default', 'Code Cache')));
  assert.ok(!existsSync(`${destino}.importando`));
});

test('copiar só a sessão: só o Local Storage, sem cookies, preferências nem Local State', (t) => {
  const { userData, destino } = userDataFalso(t);
  copiarConta(planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: true }), destino);
  assert.deepEqual(readdirSync(destino), ['Default']);
  assert.deepEqual(readdirSync(join(destino, 'Default')), ['Local Storage']);
  assert.equal(temSessaoPokeidle(join(destino, 'Default', 'Local Storage')), true);
});

test('copiar: erro no meio desfaz tudo e deixa tentar de novo', (t) => {
  const { userData, destino } = userDataFalso(t);
  const plano = [...planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: false }), { de: join(userData, 'nao-existe'), para: join(destino, 'x') }];
  assert.throws(() => copiarConta(plano, destino), /a cópia falhou e foi desfeita/);
  assert.ok(!existsSync(destino));
  assert.ok(!existsSync(`${destino}.importando`));
  // sobra de tentativa anterior não atrapalha
  mkdirSync(`${destino}.importando`, { recursive: true });
  writeFileSync(join(`${destino}.importando`, 'lixo'), '');
  copiarConta(planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: true }), destino);
  assert.ok(!existsSync(join(destino, 'lixo')));
  assert.equal(readFileSync(join(destino, 'Default', 'Local Storage', 'leveldb', 'LOCK'), 'utf8'), '');
});


test('conferir: arquivo de trava inexistente não é "aberto"; erro do checador sobe', (t) => {
  const { userData, destino } = userDataFalso(t);
  const base = { userData, pastaPerfil: 'Profile 3', nomePerfil: 'Perfil 2', destino };
  assert.doesNotThrow(() => conferirOrigem({ ...base, emUso: () => 'nao-existe' }));
  assert.throws(() => conferirOrigem({ ...base, emUso: () => { throw new Error('não consegui checar X'); } }), /não consegui checar X/);
});

test('copiar: falha no rename desfaz, guarda a mensagem e não deixa sobra', (t) => {
  const { userData, destino } = userDataFalso(t);
  const plano = planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: true });
  assert.throws(() => copiarConta(plano, destino, { renomear: () => { throw Object.assign(new Error('EBUSY: arquivo ocupado'), { code: 'EBUSY' }); } }),
    /a cópia falhou e foi desfeita: EBUSY: arquivo ocupado/);
  assert.ok(!existsSync(`${destino}.importando`));
  assert.ok(!existsSync(destino));
});

test('copiar: destino que aparece no meio da cópia não é sobrescrito', (t) => {
  const { userData, destino } = userDataFalso(t);
  const plano = planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: true });
  mkdirSync(destino, { recursive: true });
  assert.throws(() => copiarConta(plano, destino), /apareceu durante a cópia/);
});

test('copiar: plano apontando para fora da pasta da conta é recusado', (t) => {
  const { userData, destino } = userDataFalso(t);
  assert.throws(() => copiarConta([{ de: join(userData, 'Local State'), para: join(destino, '..', 'fora') }], destino), /fora da pasta da conta/);
});

test('copiar: caches só são pulados no primeiro nível do perfil', (t) => {
  const { userData, destino } = userDataFalso(t);
  const dentro = join(userData, 'Profile 3', 'Extensions', 'abc', 'Cache');
  mkdirSync(dentro, { recursive: true });
  writeFileSync(join(dentro, 'f'), 'x');
  copiarConta(planoDeImportacao({ userData, pastaPerfil: 'Profile 3', destino, soSessao: false }), destino);
  assert.ok(existsSync(join(destino, 'Default', 'Extensions', 'abc', 'Cache', 'f')));
  assert.ok(!existsSync(join(destino, 'Default', 'Cache')));
});

test('opções: digitar errado é erro (não vira cópia do perfil inteiro)', () => {
  assert.doesNotThrow(() => conferirOpcoes(['importar', '--so-sessao', '--forcar', 'Perfil 1', 'principal']));
  assert.throws(() => conferirOpcoes(['importar', '--so-sesao', 'Perfil 1', 'principal']), /opção desconhecida: --so-sesao/);
  assert.throws(() => conferirOpcoes(['abrir', '-x']), /opção desconhecida: -x/);
});

const ls = (ud) => join(ud, 'Profile 3', 'Local Storage');

test('sessão: só a chave "sessao" viva do pokeidle.io (não "sessao-hunt", outro site ou apagada)', (t) => {
  assert.equal(temSessaoPokeidle(ls(userDataFalso(t).userData)), true);
  const outros = userDataFalso(t, { comSessao: false, extra: [{ chave: chaveLS('sessao', 'https://outro.site'), valor: Buffer.from('x') }, { chave: chaveLS('sessaoAntiga'), valor: Buffer.from('x') }] });
  assert.equal(temSessaoPokeidle(ls(outros.userData)), false);
  const saiu = userDataFalso(t, { extra: [] });
  escreverLog(join(ls(saiu.userData), 'leveldb', '000009.log'), [{ seq: 99, ops: [{ chave: chaveLS('sessao') }] }]); // logout
  assert.equal(temSessaoPokeidle(ls(saiu.userData)), false);
  assert.equal(temSessaoPokeidle('/nao/existe'), false);
});

test('sessão: achada dentro de tabela comprimida (o caso real da conta principal)', (t) => {
  const u = userDataFalso(t, { comSessao: false });
  escreverTabela(join(ls(u.userData), 'leveldb', '000005.ldb'), [{ chave: chaveLS('sessao'), seq: 2 }, { chave: chaveLS('sessao-hunt:treinadora'), seq: 3 }], { comprimir: true });
  assert.equal(temSessaoPokeidle(ls(u.userData)), true);
});
