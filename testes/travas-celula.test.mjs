import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarReservas } from '../app/reservas.mjs';
import { criarTravas } from '../app/travas.mjs';

const JOGO = 'https://pokeidle.io/app';
function montar() {
  const abertos = [];
  let t = 0;
  const reservas = criarReservas(() => true);
  const travas = criarTravas({ reservas, abrirFora: (u) => abertos.push(u), agora: () => t });
  return { travas, reservas, abertos, passar: (ms) => { t += ms; } };
}
const reservar = (travas, dono, nick, extra = {}) => travas.aoReservar({ dono, nick, origemDoQuadro: 'https://pokeidle.io', quadroPrincipal: true, ...extra });

test('H1: link externo cancelado NÃO solta a conta (outra célula com o mesmo nick segue barrada)', () => {
  const { travas, abertos } = montar();
  assert.equal(reservar(travas, 1, 'treinador1'), true);
  assert.equal(travas.aoNavegar(1, 'https://wiki.exemplo.com/x', JOGO), true, 'navegação cancelada');
  assert.deepEqual(abertos, ['https://wiki.exemplo.com/x']);
  assert.equal(reservar(travas, 2, 'treinador1'), false, 'a conta continua presa à célula 1');
  travas.aoLiberar(1); // did-navigate de verdade / célula caiu
  assert.equal(reservar(travas, 2, 'treinador1'), true);
});

test('H2: redirecionamento de iframe não abre nada nem cancela; o do quadro principal sim', () => {
  const { travas, abertos } = montar();
  assert.equal(travas.aoRedirecionar(1, 'https://anuncio.exemplo/clique', false, JOGO), false);
  assert.deepEqual(abertos, []);
  assert.equal(travas.aoRedirecionar(1, 'https://outro.site/', true, JOGO), true);
  assert.deepEqual(abertos, ['https://outro.site/']);
  assert.equal(travas.aoRedirecionar(1, 'https://accounts.google.com/o/oauth2', true, JOGO), false, 'login segue');
});

test('M1: só a página do jogo, no quadro principal, reserva; e no máximo 3 nicks por célula', () => {
  const { travas, reservas } = montar();
  assert.equal(reservar(travas, 1, 'treinadora', { origemDoQuadro: 'https://accounts.google.com' }), true);
  assert.equal(reservas.donoDe('treinadora'), undefined, 'página de login não prende conta de ninguém');
  assert.equal(reservar(travas, 1, 'treinadora', { quadroPrincipal: false }), true);
  assert.equal(reservas.donoDe('treinadora'), undefined, 'iframe também não');
  for (const n of ['a', 'b', 'c']) assert.equal(reservar(travas, 1, n), true);
  assert.equal(reservar(travas, 1, 'd'), false, 'quarto nick na mesma célula');
  assert.equal(reservar(travas, 1, 'a'), true, 'reconectar com um que já é dela segue valendo');
  assert.equal(reservar(travas, 2, 'x'.repeat(41)), false);
});

test('M2: link externo só a partir da página do jogo e no máximo um a cada 2 s por célula', () => {
  const { travas, abertos, passar } = montar();
  assert.equal(travas.aoAbrirJanela(1, 'https://a.exemplo/', JOGO), 'deny');
  assert.equal(travas.aoAbrirJanela(1, 'https://b.exemplo/', JOGO), 'deny');
  passar(2000);
  travas.aoAbrirJanela(1, 'https://c.exemplo/', JOGO);
  travas.aoAbrirJanela(2, 'https://d.exemplo/', JOGO); // outra célula tem o próprio limite
  travas.aoAbrirJanela(3, 'https://e.exemplo/', 'https://accounts.google.com/x'); // fora da página do jogo
  travas.aoAbrirJanela(4, 'file:///C:/x', JOGO); // nunca vai para fora
  assert.deepEqual(abertos, ['https://a.exemplo/', 'https://c.exemplo/', 'https://d.exemplo/']);
  assert.equal(travas.aoAbrirJanela(1, 'https://accounts.google.com/o/oauth2', JOGO), 'allow');
});
