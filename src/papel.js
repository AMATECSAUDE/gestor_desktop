// Tipos de papel e roteamento documento -> impressora.
//
// Um balcao costuma ter DUAS impressoras: a termica da bobina e a de folha. Antes
// havia uma escolha so, e o resto caia na impressora padrao do Windows - quase
// sempre a laser, imprimindo cupom de 80mm numa folha A4.
//
// CRITICO - O vinculo impressora -> tipo e LOCAL, por maquina: o nome vem do Windows
// daquele PC, e guarda-lo no servidor faria o segundo balcao imprimir em lugar
// nenhum. O que vem do servidor sao as MEDIDAS de cada tipo.
//
// Sem dependencia de electron: assim roda e se testa sozinho (`node src/papel.js`).

const TIPOS = ['cupom', 'a4'];

const ROTULOS = { cupom: 'Cupom (bobina)', a4: 'A4 (folha)' };

/**
 * `mapa` e { [nomeDaImpressora]: tipo }. Devolve '' quando ninguem classificou uma
 * impressora com aquele tipo - e '' significa "padrao do Windows", o comportamento
 * antigo. Fallback silencioso e intencional: balcao de uma impressora so nunca
 * abriu a tela de configuracao e nao pode parar de imprimir por isso.
 */
function escolherImpressora(mapa, tipo) {
  const escolhida = Object.keys(mapa || {}).find((nome) => mapa[nome] === tipo);

  return escolhida || '';
}

/**
 * CRITICO - Migra a config ANTIGA (`impressora`, uma string so). Sem isto, quem ja tinha a
 * termica escolhida voltaria pro padrao do Windows na primeira atualizacao - e
 * descobriria imprimindo cupom na laser. So vale enquanto o mapa novo estiver
 * vazio: depois de classificar, quem manda e o mapa.
 */
function mapaEfetivo({ papeisPorImpressora, impressora }) {
  const mapa = papeisPorImpressora || {};
  if (Object.keys(mapa).length > 0) {
    return mapa;
  }

  return impressora ? { [impressora]: 'cupom' } : {};
}

/** Descarta tipo desconhecido e impressora sem tipo - o store nao guarda lixo. */
function sanitizar(mapa) {
  return Object.fromEntries(
    Object.entries(mapa || {}).filter(([nome, tipo]) => nome && TIPOS.includes(tipo)),
  );
}

module.exports = { TIPOS, ROTULOS, escolherImpressora, mapaEfetivo, sanitizar };

// Self-check: `node src/papel.js`. Sem framework - o app nao tem um.
if (require.main === module) {
  const assert = require('node:assert');

  assert.strictEqual(escolherImpressora({ 'Elgin i9': 'cupom', HP: 'a4' }, 'cupom'), 'Elgin i9');
  assert.strictEqual(escolherImpressora({ 'Elgin i9': 'cupom', HP: 'a4' }, 'a4'), 'HP');
  // Tipo sem impressora classificada cai no padrao do Windows, nao estoura.
  assert.strictEqual(escolherImpressora({ 'Elgin i9': 'cupom' }, 'a4'), '');
  assert.strictEqual(escolherImpressora({}, 'cupom'), '');
  assert.strictEqual(escolherImpressora(undefined, 'cupom'), '');

  assert.deepStrictEqual(mapaEfetivo({ impressora: 'Elgin i9' }), { 'Elgin i9': 'cupom' });
  // Mapa novo VENCE o campo antigo - senao a migracao ressuscitaria uma escolha
  // que a pessoa ja trocou.
  assert.deepStrictEqual(
    mapaEfetivo({ impressora: 'Elgin i9', papeisPorImpressora: { HP: 'cupom' } }),
    { HP: 'cupom' },
  );
  assert.deepStrictEqual(mapaEfetivo({ impressora: '' }), {});

  assert.deepStrictEqual(sanitizar({ HP: 'a4', X: 'fax', '': 'cupom' }), { HP: 'a4' });

  console.log('papel.js ok');
}
