'use strict';
// Buscas demoradas fora da tela. Cada tarefa roda num worker novo; para interromper
// uma busca a tela simplesmente encerra o worker (terminate).
importScripts('game.js', 'analyzer.js');

self.onmessage = (e) => {
  const m = e.data;
  let result;
  if (m.type === 'check') {
    const g = new Game();
    if (!g.load(m.state)) result = UNKNOWN;
    else result = new Analyzer(g).check(m.max || 60000);
  } else if (m.type === 'verdict') {
    result = verdict(m.number, m.draw);
  } else if (m.type === 'winnable') {
    result = findWinnable(m.first, m.draw);
  }
  self.postMessage(result);
};
