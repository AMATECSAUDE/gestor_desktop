// Tipos de papel e roteamento de documento -> impressora.
//
// Um balcão costuma ter DUAS impressoras: a térmica da bobina (recibo, orçamento)
// e a laser/jato de folha (relatório, guia). Antes havia uma escolha só, e o cupom
// saía na impressora padrão do Windows - que quase sempre é a laser. Resultado: o
// cupom de 80mm impresso numa folha A4, ou cortado.
//
// CRITICO - o vínculo impressora -> tipo é LOCAL, por máquina. O nome da impressora
// vem do Windows daquele PC; guardar esse nome no servidor faria o segundo balcão
// imprimir em lugar nenhum, sem erro na tela. O que vem do servidor são as MEDIDAS
// de cada tipo (Cadastros Gerais > Impressão), que é o que o PDF precisa saber.
//
// Sem dependência de electron de propósito: assim isto roda e se testa sozinho
// (`node src/papel.js`).

/** Tipos que um documento pode pedir. `a4` é medida de norma, não se configura. */
const TIPOS = ['cupom', 'a4'];

const ROTULOS = { cupom: 'Cupom (bobina)', a4: 'A4 (folha)' };

/**
 * Nome da impressora que deve receber um documento do tipo pedido.
 *
 * `mapa` é { [nomeDaImpressora]: tipo }. Devolve '' quando ninguém classificou uma
 * impressora com aquele tipo - e '' significa "padrão do Windows", que é
 * exatamente o comportamento antigo. Fallback silencioso é intencional: balcão com
 * uma impressora só nunca abriu a tela de configuração e não pode parar de imprimir.
 */
function escolherImpressora(mapa, tipo) {
  const escolhida = Object.keys(mapa || {}).find((nome) => mapa[nome] === tipo);

  return escolhida || '';
}

/**
 * Mapa efetivo a partir do que está gravado no store.
 *
 * CRITICO - migra a config ANTIGA (`impressora`, uma string só). Sem isto, quem já
 * tinha a térmica escolhida voltaria pro padrão do Windows na primeira atualização
 * do app - e descobriria imprimindo cupom na laser. A migração só vale enquanto o
 * mapa novo estiver vazio: depois que a pessoa classificar, quem manda é o mapa.
 */
function mapaEfetivo({ papeisPorImpressora, impressora }) {
  const mapa = papeisPorImpressora || {};
  if (Object.keys(mapa).length > 0) {
    return mapa;
  }

  return impressora ? { [impressora]: 'cupom' } : {};
}

/** Descarta tipo desconhecido e impressora sem tipo - o store não guarda lixo. */
function sanitizar(mapa) {
  return Object.fromEntries(
    Object.entries(mapa || {}).filter(([nome, tipo]) => nome && TIPOS.includes(tipo)),
  );
}

module.exports = { TIPOS, ROTULOS, escolherImpressora, mapaEfetivo, sanitizar };

// Self-check: `node src/papel.js`. Sem framework de propósito - o app não tem um, e
// a regra que precisa de prova aqui cabe em poucos asserts.
if (require.main === module) {
  const assert = require('node:assert');

  assert.strictEqual(escolherImpressora({ 'Elgin i9': 'cupom', HP: 'a4' }, 'cupom'), 'Elgin i9');
  assert.strictEqual(escolherImpressora({ 'Elgin i9': 'cupom', HP: 'a4' }, 'a4'), 'HP');
  // Tipo sem impressora classificada cai no padrão do Windows, não estoura.
  assert.strictEqual(escolherImpressora({ 'Elgin i9': 'cupom' }, 'a4'), '');
  assert.strictEqual(escolherImpressora({}, 'cupom'), '');
  assert.strictEqual(escolherImpressora(undefined, 'cupom'), '');

  // Config antiga vira "aquela impressora é a do cupom".
  assert.deepStrictEqual(mapaEfetivo({ impressora: 'Elgin i9' }), { 'Elgin i9': 'cupom' });
  // Mapa novo preenchido VENCE o campo antigo - senão a migração ressuscitaria uma
  // escolha que a pessoa já trocou.
  assert.deepStrictEqual(
    mapaEfetivo({ impressora: 'Elgin i9', papeisPorImpressora: { HP: 'cupom' } }),
    { HP: 'cupom' },
  );
  assert.deepStrictEqual(mapaEfetivo({ impressora: '' }), {});

  assert.deepStrictEqual(sanitizar({ HP: 'a4', X: 'fax', '': 'cupom' }), { HP: 'a4' });

  console.log('papel.js ok');
}
