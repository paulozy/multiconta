import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarReservas, nickValido } from '../app/reservas.mjs';
import { destino, permissaoLiberada } from '../app/navegacao.mjs';

test('reservas: a primeira célula fica com a conta; a segunda é recusada enquanto a primeira vive', () => {
  const vivas = new Set([1, 2]);
  const r = criarReservas((id) => vivas.has(id));
  assert.equal(r.reservar('treinador1', 1), true);
  assert.equal(r.reservar('treinador1', 1), true, 'a mesma célula reconectando');
  assert.equal(r.reservar('treinador1', 2), false);
  assert.equal(r.reservar('treinador2', 2), true, 'outra conta, sem conflito');
  vivas.delete(1); // célula 1 fechou sem avisar
  assert.equal(r.reservar('treinador1', 2), true);
  assert.equal(r.donoDe('treinador1'), 2);
});

test('reservas: navegar ou fechar libera as contas da célula', () => {
  const r = criarReservas(() => true);
  r.reservar('treinadora', 1);
  r.reservar('outra', 1);
  assert.equal(r.reservar('treinadora', 2), false);
  r.liberar(1);
  assert.equal(r.reservar('treinadora', 2), true);
  assert.equal(r.donoDe('outra'), undefined);
});

test('reservas: nick precisa ser texto curto', () => {
  assert.ok(nickValido('treinadora'));
  for (const n of ['', 'x'.repeat(41), 5, null, {}]) assert.ok(!nickValido(n), String(n));
});

test('navegação: jogo e login ficam; outros sites vão para o navegador; o resto é recusado', () => {
  for (const u of ['https://pokeidle.io/app', 'https://www.pokeidle.io/x', 'https://accounts.google.com/o/oauth2/auth?x=1', 'https://discord.com/oauth2/authorize']) assert.equal(destino(u), 'permitir', u);
  for (const u of ['https://pokeidle.io.evil.com/', 'https://evilpokeidle.io/', 'http://pokeidle.io/', 'https://www.google.com/search?q=x', 'https://wiki.pokeidle.wiki/']) assert.equal(destino(u), 'externo', u);
  for (const u of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'ms-settings:privacy', 'data:text/html,x', 'nada', 'https://pokeidle.io@evil.com/', 'https://user:pw@pokeidle.io/']) assert.equal(destino(u), 'bloquear', u);
});

test('permissões: só avisos, e só pedidos pela página do jogo', () => {
  assert.ok(permissaoLiberada('notifications', 'https://pokeidle.io/app'));
  assert.ok(permissaoLiberada('notifications', 'https://pokeidle.io'));
  for (const o of ['https://discord.com', 'https://accounts.google.com/x', 'https://evil.pokeidle.io.x.com', undefined, '']) assert.ok(!permissaoLiberada('notifications', o), String(o));
  for (const p of ['media', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen', 'midi']) assert.ok(!permissaoLiberada(p, 'https://pokeidle.io'), p);
});

test('navegação: login do Google por país e YouTube; Discord sem subdomínios; casos de borda', () => {
  for (const u of ['https://accounts.google.com.br/x', 'https://accounts.google.co.uk/', 'https://accounts.youtube.com/accounts/SetSID', 'https://www.discord.com/login', 'https://pokeidle.io./app', 'HTTPS://POKEIDLE.IO/app', 'https://pokeidle.io:8443/']) assert.equal(destino(u), 'permitir', u);
  for (const u of ['https://support.discord.com/hc', 'https://accounts.google.evil.com/', 'https://accounts.google.xyz.co/', 'https://accounts.google.comx/', 'https://google.com/']) assert.equal(destino(u), 'externo', u);
  for (const u of ['about:blank', 'blob:https://pokeidle.io/1234']) assert.equal(destino(u), 'bloquear', u);
});
