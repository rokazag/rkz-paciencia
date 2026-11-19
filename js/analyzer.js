'use strict';
// Busca de jogadas sobre uma cópia compacta da partida (Analyzer.java + Draw1Solver.java).
// Roda dentro de um Web Worker (js/worker.js) para não travar a tela.
//  - check: existe alguma sequência de jogadas que ajude (virar uma carta da mesa ou
//    subir uma carta para as fundações)? Não espia as cartas viradas para baixo.
//  - solve / verdict: a partida tem solução? Conhece todas as cartas.

const STUCK = 0, HAS_MOVES = 1, UNKNOWN = 2, SOLVED = 3, UNSOLVABLE = 4;
/** Fixos: mudá-los mudaria o número do desafio do dia de quem usa o filtro. */
const WINNABLE_STATES = 20000, WINNABLE_TRIES = 60;
const VERDICT_STATES = 300000, VERDICT_DRAW1_STATES = 1000000;
/** Pede cerca de 128 MB, então só roda se a busca menor não concluir. */
const VERDICT_DRAW1_FULL_STATES = 10000000;

function aRank(c) { return c % 13 + 1; }
function aSuit(c) { return (c / 13) | 0; }
function aRed(c) { const s = (c / 13) | 0; return s === HEARTS || s === DIAMONDS; }

function pushCards(q, p, from, to) {
  const r = new Uint8Array(q.length + to - from);
  r.set(q, 0);
  r.set(p.subarray(from, to), q.length);
  return r;
}

function pushOne(q, c) {
  const r = new Uint8Array(q.length + 1);
  r.set(q, 0);
  r[q.length] = c;
  return r;
}

function fitsTab(c, pile) {
  if (pile.length === 0) return aRank(c) === 13;
  const top = pile[pile.length - 1];
  return aRed(top) !== aRed(c) && aRank(top) === aRank(c) + 1;
}

/**
 * Uma carta pode subir sem prejuízo quando ninguém mais precisaria dela na mesa:
 * as cartas de cor oposta e valor imediatamente menor já estão nas fundações.
 */
function safeToFoundation(f, c) {
  const r = aRank(c);
  if (r <= 2) return true;
  const isRed = aRed(c);
  for (let k = 0; k < 4; k++) {
    const kRed = k === HEARTS || k === DIAMONDS;
    if (kRed !== isRed && f[k] < r - 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------- hash de estados
// Dois hashes de 32 bits (no lugar do long de 64 bits do Java) e uma tabela de
// endereçamento aberto em Uint32Array, como a do Draw1Solver.

let hA = 0, hB = 0;
function hInit() { hA = 0x811c9dc5 | 0; hB = 0x9747b28c | 0; }
function hAdd(v) {
  hA = Math.imul(hA ^ v, 0x01000193);
  hB = Math.imul(hB ^ v, 0x5bd1e995);
  hB ^= hB >>> 15;
}

const colA = new Int32Array(7), colB = new Int32Array(7), colOrder = [0, 1, 2, 3, 4, 5, 6];

/** Colunas em ordem canônica (a posição delas não importa). */
function hColumns(t, d) {
  for (let i = 0; i < 7; i++) {
    let a = (0x84222325 ^ d[i]) | 0, b = (0xcbf29ce4 ^ d[i]) | 0;
    const p = t[i];
    for (let k = 0; k < p.length; k++) {
      a = Math.imul(a ^ (p[k] + 1), 0x01000193);
      b = Math.imul(b ^ (p[k] + 1), 0x5bd1e995);
      b ^= b >>> 13;
    }
    colA[i] = a;
    colB[i] = b;
    colOrder[i] = i;
  }
  for (let i = 1; i < 7; i++) {
    const x = colOrder[i];
    let j = i - 1;
    while (j >= 0 && (colA[colOrder[j]] > colA[x] || (colA[colOrder[j]] === colA[x] && colB[colOrder[j]] > colB[x]))) {
      colOrder[j + 1] = colOrder[j];
      j--;
    }
    colOrder[j + 1] = x;
  }
  for (let i = 0; i < 7; i++) {
    hAdd(colA[colOrder[i]]);
    hAdd(colB[colOrder[i]]);
  }
}

class StateTable {
  constructor(maxStates) {
    let cap = 1;
    while (cap < maxStates + maxStates / 2 + 1024) cap *= 2;
    this.mask = cap - 1;
    this.a = new Uint32Array(cap);
    this.b = new Uint32Array(cap);
    this.size = 0;
  }
  /** Adiciona a chave (hA, hB) atual; false se já estava. */
  add() {
    let a = hA >>> 0;
    const b = hB >>> 0;
    if (a === 0 && b === 0) a = 1;
    let i = b & this.mask;
    while (true) {
      const va = this.a[i], vb = this.b[i];
      if (va === a && vb === b) return false;
      if (va === 0 && vb === 0) {
        this.a[i] = a;
        this.b[i] = b;
        this.size++;
        return true;
      }
      i = (i + 1) & this.mask;
    }
  }
}

// ---------------------------------------------------------------- Analyzer

class Analyzer {
  /** g: Game (ou objeto com a mesma forma). */
  constructor(g) {
    this.drawCount = g.drawCount;
    const s = { f: [0, 0, 0, 0], t: new Array(7), d: [0, 0, 0, 0, 0, 0, 0], st: null, wa: null };
    for (let p = FOUNDATION; p < TABLEAU; p++) {
      const top = g.top(p);
      if (top) s.f[top.suit] = top.rank;
    }
    for (let i = 0; i < 7; i++) {
      const pile = g.piles[TABLEAU + i];
      s.t[i] = new Uint8Array(pile.length);
      let down = 0;
      for (let k = 0; k < pile.length; k++) {
        s.t[i][k] = pile[k].id;
        if (!pile[k].faceUp) down++;
      }
      s.d[i] = down;
    }
    s.st = Uint8Array.from(g.piles[STOCK], c => c.id);
    s.wa = Uint8Array.from(g.piles[WASTE], c => c.id);
    this.start = s;
  }

  static copy(s) {
    return { f: s.f.slice(), t: s.t.slice(), d: s.d.slice(), st: s.st, wa: s.wa };
  }

  static total(s) { return s.f[0] + s.f[1] + s.f[2] + s.f[3]; }

  /** Remove a carta do topo da coluna i, virando a de baixo se preciso. Devolve se virou. */
  static popTab(s, i, newLen) {
    s.t[i] = s.t[i].slice(0, newLen);
    if (newLen > 0 && s.d[i] >= newLen) {
      s.d[i] = newLen - 1;
      return true;
    }
    return false;
  }

  static key(s) {
    hInit();
    for (let k = 0; k < 4; k++) hAdd(s.f[k]);
    hAdd(101);
    for (let k = 0; k < s.st.length; k++) hAdd(s.st[k]);
    hAdd(102);
    for (let k = 0; k < s.wa.length; k++) hAdd(s.wa[k]);
    hColumns(s.t, s.d);
  }

  /** Gera os filhos de s, das jogadas mais promissoras para as menos. out(n, flipped) true interrompe. */
  children(s, solving, out) {
    const copy = Analyzer.copy, popTab = Analyzer.popTab;
    // 1) Para as fundações.
    if (s.wa.length > 0) {
      const c = s.wa[s.wa.length - 1];
      if (s.f[aSuit(c)] === aRank(c) - 1) {
        const n = copy(s);
        n.wa = s.wa.slice(0, s.wa.length - 1);
        n.f[aSuit(c)]++;
        if (out(n, false)) return;
      }
    }
    for (let i = 0; i < 7; i++) {
      const p = s.t[i];
      if (p.length === 0) continue;
      const c = p[p.length - 1];
      if (s.f[aSuit(c)] !== aRank(c) - 1) continue;
      const n = copy(s);
      const flip = popTab(n, i, p.length - 1);
      n.f[aSuit(c)]++;
      if (out(n, flip)) return;
    }
    // 2) Sequências da mesa para outra coluna (primeiro as que viram uma carta).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 7; i++) {
        const p = s.t[i];
        const from = s.d[i];
        for (let k = from; k < p.length; k++) {
          const reveals = k === from && from > 0;
          if ((pass === 0) !== reveals) continue;
          const c = p[k];
          let emptyTried = false;
          for (let j = 0; j < 7; j++) {
            if (j === i) continue;
            const q = s.t[j];
            if (q.length === 0) {
              // Rei que já está no fundo não ganha nada; colunas vazias são equivalentes.
              if (k === 0 || emptyTried || aRank(c) !== 13) continue;
              emptyTried = true;
            } else if (!fitsTab(c, q)) {
              continue;
            }
            const n = copy(s);
            n.t[j] = pushCards(q, p, k, p.length);
            const flip = popTab(n, i, k);
            if (out(n, flip)) return;
          }
        }
      }
    }
    // 3) Do descarte para a mesa.
    if (s.wa.length > 0) {
      const c = s.wa[s.wa.length - 1];
      let emptyTried = false;
      for (let j = 0; j < 7; j++) {
        const q = s.t[j];
        if (q.length === 0) {
          if (emptyTried || aRank(c) !== 13) continue;
          emptyTried = true;
        } else if (!fitsTab(c, q)) {
          continue;
        }
        const n = copy(s);
        n.wa = s.wa.slice(0, s.wa.length - 1);
        n.t[j] = pushOne(q, c);
        if (out(n, false)) return;
      }
    }
    // 4) Das fundações de volta para a mesa (só se a carta ainda pode ser útil lá).
    for (let k = 0; k < 4; k++) {
      if (s.f[k] === 0) continue;
      const c = k * 13 + s.f[k] - 1;
      if (solving && safeToFoundation(s.f, c)) continue;
      for (let j = 0; j < 7; j++) {
        const q = s.t[j];
        if (q.length === 0 || !fitsTab(c, q)) continue;
        const n = copy(s);
        n.f[k]--;
        n.t[j] = pushOne(q, c);
        if (out(n, false)) return;
      }
    }
    // 5) Comprar do monte ou recomeçá-lo.
    if (s.st.length > 0) {
      const n = copy(s);
      const take = Math.min(this.drawCount, s.st.length);
      const w = new Uint8Array(s.wa.length + take);
      w.set(s.wa, 0);
      for (let i = 0; i < take; i++) w[s.wa.length + i] = s.st[s.st.length - 1 - i];
      n.wa = w;
      n.st = s.st.slice(0, s.st.length - take);
      out(n, false);
    } else if (s.wa.length > 0) {
      const n = copy(s);
      const st = new Uint8Array(s.wa.length);
      for (let i = 0; i < st.length; i++) st[i] = s.wa[s.wa.length - 1 - i];
      n.st = st;
      n.wa = new Uint8Array(0);
      out(n, false);
    }
  }

  /**
   * Sobe automaticamente as cartas que não fazem falta na mesa (só na análise completa).
   * Comprando 3, tirar uma carta do descarte muda o ciclo do monte, então subir de lá
   * (fromWaste) pode perder soluções.
   */
  static autoplay(s, fromWaste) {
    let again = true;
    while (again) {
      again = false;
      if (fromWaste && s.wa.length > 0) {
        const c = s.wa[s.wa.length - 1];
        if (s.f[aSuit(c)] === aRank(c) - 1 && safeToFoundation(s.f, c)) {
          s.wa = s.wa.slice(0, s.wa.length - 1);
          s.f[aSuit(c)]++;
          again = true;
        }
      }
      for (let i = 0; i < 7; i++) {
        const p = s.t[i];
        if (p.length === 0) continue;
        const c = p[p.length - 1];
        if (s.f[aSuit(c)] === aRank(c) - 1 && safeToFoundation(s.f, c)) {
          Analyzer.popTab(s, i, p.length - 1);
          s.f[aSuit(c)]++;
          again = true;
        }
      }
    }
  }

  /**
   * Procura alguma jogada útil a partir da posição atual. Comprar do monte e mexer
   * cartas de lugar sem virar nada não conta como útil por si só.
   */
  check(maxStates) {
    const start = this.start;
    const baseTotal = Analyzer.total(start);
    if (baseTotal === 52) return HAS_MOVES;
    const seen = new StateTable(maxStates);
    Analyzer.key(start);
    seen.add();
    const queue = [start];
    let head = 0, found = false;
    const sink = (n, flipped) => {
      if (flipped || Analyzer.total(n) > baseTotal) {
        found = true;
        return true;
      }
      Analyzer.key(n);
      if (seen.add()) queue.push(n);
      return false;
    };
    while (head < queue.length) {
      if (seen.size > maxStates) return UNKNOWN;
      const s = queue[head];
      queue[head++] = null;
      this.children(s, false, sink);
      if (found) return HAS_MOVES;
    }
    return STUCK;
  }

  /** Com fromWaste, UNSOLVABLE só é garantido comprando 1; SOLVED vale sempre. */
  solve(maxStates, fromWaste = true) {
    const first = Analyzer.copy(this.start);
    Analyzer.autoplay(first, fromWaste);
    const seen = new StateTable(maxStates);
    Analyzer.key(first);
    seen.add();
    const stack = [first];
    const kids = [];
    const sink = (n) => {
      Analyzer.autoplay(n, fromWaste);
      Analyzer.key(n);
      if (seen.add()) kids.push(n);
      return false;
    };
    while (stack.length) {
      if (seen.size > maxStates) return UNKNOWN;
      const s = stack.pop();
      if (Analyzer.total(s) === 52) return SOLVED;
      kids.length = 0;
      this.children(s, true, sink);
      // A pilha é LIFO: empilha do pior para o melhor.
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return UNSOLVABLE;
  }
}

/**
 * A partir de um número, procura o primeiro com solução comprovada. A sequência só
 * depende do número inicial, então todos os aparelhos chegam ao mesmo resultado.
 */
function findWinnable(first, draw) {
  let n = BigInt(first);
  for (let i = 0; i < WINNABLE_TRIES; i++) {
    const g = new Game();
    g.deal(n.toString(), draw, null);
    if (new Analyzer(g).solve(WINNABLE_STATES) === SOLVED) return n.toString();
    n = 1n + mulMod(n, 2654435761n, MAX_NUMBER);
  }
  return String(first);
}

/** A partida deste número, do início, tinha solução? SOLVED, UNSOLVABLE ou UNKNOWN. */
function verdict(number, draw) {
  const g = new Game();
  g.deal(number, draw, null);
  try {
    if (draw === 1) return verdictDraw1(g);
    let r = new Analyzer(g).solve(VERDICT_STATES);
    if (r === UNSOLVABLE) r = new Analyzer(g).solve(VERDICT_STATES, false);
    if (r !== UNKNOWN) return r;
    // Quem compra 3 só alcança cartas que comprando 1 também alcança: o que é
    // impossível lá é impossível aqui. O contrário não vale.
    return verdictDraw1(g) === UNSOLVABLE ? UNSOLVABLE : UNKNOWN;
  } catch (e) {
    return UNKNOWN; // sem memória para a busca grande
  }
}

function verdictDraw1(g) {
  const r = Draw1Solver.solve(g, VERDICT_DRAW1_STATES);
  if (r !== UNKNOWN) return r;
  return Draw1Solver.solve(g, VERDICT_DRAW1_FULL_STATES);
}

// ---------------------------------------------------------------- Draw1Solver
// Comprando 1 o monte pode ser recomeçado sem limite, então qualquer carta dele está
// sempre ao alcance e a ordem não importa: o estado guarda só o conjunto de cartas do
// monte (lo = cartas 0..31, hi = 32..51).

const Draw1Solver = {
  has(s, c) { return c < 32 ? (s.lo >>> c) & 1 : (s.hi >>> (c - 32)) & 1; },
  take(s, c) { if (c < 32) s.lo &= ~(1 << c); else s.hi &= ~(1 << (c - 32)); },

  copy(s) { return { f: s.f.slice(), t: s.t.slice(), d: s.d.slice(), lo: s.lo, hi: s.hi }; },

  pop(s, i, len) {
    s.t[i] = s.t[i].slice(0, len);
    if (len > 0 && s.d[i] >= len) s.d[i] = len - 1;
  },

  /** Sobe as cartas que não fazem falta na mesa. */
  autoplay(s) {
    let again = true;
    while (again) {
      again = false;
      for (let k = 0; k < 4; k++) {
        if (s.f[k] === 13) continue;
        const c = k * 13 + s.f[k];
        if (!safeToFoundation(s.f, c)) continue;
        if (this.has(s, c)) {
          this.take(s, c);
          s.f[k]++;
          again = true;
          continue;
        }
        for (let i = 0; i < 7; i++) {
          const p = s.t[i];
          if (p.length > 0 && p[p.length - 1] === c) {
            this.pop(s, i, p.length - 1);
            s.f[k]++;
            again = true;
            break;
          }
        }
      }
    }
  },

  /** Filhos de s, das jogadas mais promissoras para as menos. */
  children(s) {
    const out = [];
    for (let k = 0; k < 4; k++) {
      if (s.f[k] === 13) continue;
      const c = k * 13 + s.f[k];
      if (this.has(s, c)) {
        const n = this.copy(s);
        this.take(n, c);
        n.f[k]++;
        out.push(n);
      }
      for (let i = 0; i < 7; i++) {
        const p = s.t[i];
        if (p.length > 0 && p[p.length - 1] === c) {
          const n = this.copy(s);
          this.pop(n, i, p.length - 1);
          n.f[k]++;
          out.push(n);
        }
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 7; i++) {
        const p = s.t[i];
        const from = s.d[i];
        for (let k = from; k < p.length; k++) {
          const reveals = k === from && from > 0;
          if ((pass === 0) !== reveals) continue;
          const c = p[k];
          let emptyTried = false;
          for (let j = 0; j < 7; j++) {
            if (j === i) continue;
            const q = s.t[j];
            if (q.length === 0) {
              if (k === 0 || emptyTried || aRank(c) !== 13) continue;
              emptyTried = true;
            } else if (!fitsTab(c, q)) {
              continue;
            }
            const n = this.copy(s);
            n.t[j] = pushCards(q, p, k, p.length);
            this.pop(n, i, k);
            out.push(n);
          }
        }
      }
    }
    for (let c = 0; c < 52; c++) {
      if (!this.has(s, c)) continue;
      let emptyTried = false;
      for (let j = 0; j < 7; j++) {
        const q = s.t[j];
        if (q.length === 0) {
          if (emptyTried || aRank(c) !== 13) continue;
          emptyTried = true;
        } else if (!fitsTab(c, q)) {
          continue;
        }
        const n = this.copy(s);
        this.take(n, c);
        n.t[j] = pushOne(q, c);
        out.push(n);
      }
    }
    for (let k = 0; k < 4; k++) {
      if (s.f[k] === 0) continue;
      const c = k * 13 + s.f[k] - 1;
      if (safeToFoundation(s.f, c)) continue;
      for (let j = 0; j < 7; j++) {
        const q = s.t[j];
        if (q.length === 0 || !fitsTab(c, q)) continue;
        const n = this.copy(s);
        n.f[k]--;
        n.t[j] = pushOne(q, c);
        out.push(n);
      }
    }
    return out;
  },

  key(s) {
    hInit();
    for (let k = 0; k < 4; k++) hAdd(s.f[k]);
    hAdd(s.lo);
    hAdd(s.hi);
    hColumns(s.t, s.d);
  },

  /** SOLVED, UNSOLVABLE ou UNKNOWN (limite). */
  solve(fresh, maxStates) {
    const first = { f: [0, 0, 0, 0], t: new Array(7), d: [0, 0, 0, 0, 0, 0, 0], lo: 0, hi: 0 };
    for (let i = 0; i < 7; i++) {
      const p = fresh.piles[TABLEAU + i];
      first.t[i] = new Uint8Array(p.length);
      let down = 0;
      for (let k = 0; k < p.length; k++) {
        first.t[i][k] = p[k].id;
        if (!p[k].faceUp) down++;
      }
      first.d[i] = down;
    }
    for (const c of fresh.piles[STOCK]) {
      if (c.id < 32) first.lo |= 1 << c.id;
      else first.hi |= 1 << (c.id - 32);
    }
    this.autoplay(first);
    if (Analyzer.total(first) === 52) return SOLVED;

    const table = new StateTable(maxStates);
    this.key(first);
    table.add();
    let count = 1;
    const stack = [{ kids: this.children(first), i: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i >= top.kids.length) {
        stack.pop();
        continue;
      }
      const n = top.kids[top.i];
      top.kids[top.i++] = null;
      this.autoplay(n);
      this.key(n);
      if (!table.add()) continue;
      if (Analyzer.total(n) === 52) return SOLVED;
      if (++count >= maxStates) return UNKNOWN;
      stack.push({ kids: this.children(n), i: 0 });
    }
    return UNSOLVABLE;
  },
};
