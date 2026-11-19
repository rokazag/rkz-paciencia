'use strict';
// Regras e estado de uma partida de Paciência (Klondike). Não conhece a interface.
// Tradução fiel de Game.java / Card.java do app Android: o mesmo número de partida
// gera a mesma distribuição nos dois (java.util.Random reproduzido abaixo).

const SPADES = 0, HEARTS = 1, DIAMONDS = 2, CLUBS = 3;
const RANK_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
  constructor(id) {
    this.id = id;            // 0..51
    this.suit = (id / 13) | 0; // 0..3
    this.rank = id % 13 + 1; // 1 (Ás) .. 13 (Rei)
    this.faceUp = false;
  }
  isRed() { return this.suit === HEARTS || this.suit === DIAMONDS; }
  rankName() { return RANK_NAMES[this.rank]; }
}

/** java.util.Random (LCG de 48 bits), para as distribuições baterem com o app Android. */
class JavaRandom {
  constructor(seed) {
    this.mult = 0x5DEECE66Dn;
    this.mask = (1n << 48n) - 1n;
    this.seed = (BigInt.asIntN(64, BigInt(seed)) ^ this.mult) & this.mask;
  }
  next(bits) {
    this.seed = (this.seed * this.mult + 0xBn) & this.mask;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }
  nextInt(bound) {
    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits, val;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  }
}

/** Math.floorMod(a * b, m) com aritmética de 64 bits como no Java. */
function mulMod(a, b, m) {
  const p = BigInt.asIntN(64, BigInt(a) * BigInt(b));
  const r = p % BigInt(m);
  return r < 0n ? r + BigInt(m) : r;
}

const STOCK = 0, WASTE = 1, FOUNDATION = 2, TABLEAU = 6, PILE_COUNT = 13;
const MAX_UNDO = 300, SAVED_UNDO = 100, FORMAT = 'R1';

function isFoundation(p) { return p >= FOUNDATION && p < TABLEAU; }
function isTableau(p) { return p >= TABLEAU && p < PILE_COUNT; }

class Game {
  constructor() {
    this.deck = [];
    for (let i = 0; i < 52; i++) this.deck.push(new Card(i));
    this.piles = [];
    for (let i = 0; i < PILE_COUNT; i++) this.piles.push([]);
    this.drawCount = 1;
    this.score = 0;
    this.moves = 0;
    this.elapsedMs = 0;
    this.seed = '0';          // número da partida (texto: pode passar de 2^53)
    this.dailyDate = '';      // yyyyMMdd quando é o Desafio do Dia
    this.counted = false;     // já entrou nas estatísticas como "jogada"
    this.winRecorded = false; // vitória já registrada nas estatísticas
    this.won = false;
    this.undoStack = [];      // topo no fim
  }

  // ---------------------------------------------------------------- partida

  deal(seed, drawCount, dailyDate) {
    this.seed = String(seed);
    this.drawCount = drawCount;
    this.dailyDate = dailyDate || '';
    this.score = 0;
    this.moves = 0;
    this.elapsedMs = 0;
    this.counted = false;
    this.winRecorded = false;
    this.won = false;
    this.undoStack = [];
    for (const p of this.piles) p.length = 0;

    const cards = [];
    for (const c of this.deck) {
      c.faceUp = false;
      cards.push(c);
    }
    const r = new JavaRandom(this.seed);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = r.nextInt(i + 1);
      const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
    }
    let k = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const c = cards[k++];
        c.faceUp = row === col;
        this.piles[TABLEAU + col].push(c);
      }
    }
    while (k < 52) this.piles[STOCK].push(cards[k++]);
  }

  /** Recomeça a mesma distribuição sem contar uma nova partida nas estatísticas. */
  restart() {
    const wasCounted = this.counted;
    this.deal(this.seed, this.drawCount, this.dailyDate);
    this.counted = wasCounted;
  }

  isDaily() { return this.dailyDate !== ''; }

  top(p) {
    const pile = this.piles[p];
    return pile.length ? pile[pile.length - 1] : null;
  }

  // ---------------------------------------------------------------- regras

  fitsTableau(c, p) {
    const t = this.top(p);
    if (!t) return c.rank === 13;
    return t.faceUp && t.isRed() !== c.isRed() && t.rank === c.rank + 1;
  }

  fitsFoundation(c, p) {
    const t = this.top(p);
    if (!t) return c.rank === 1;
    return t.suit === c.suit && t.rank + 1 === c.rank;
  }

  /** Se as cartas a partir de [index] podem ser levantadas juntas. */
  canPick(p, index) {
    const pile = this.piles[p];
    if (p === STOCK || index < 0 || index >= pile.length) return false;
    if (p === WASTE || isFoundation(p)) return index === pile.length - 1;
    if (!pile[index].faceUp) return false;
    for (let j = index + 1; j < pile.length; j++) {
      const a = pile[j - 1], b = pile[j];
      if (!b.faceUp || a.isRed() === b.isRed() || a.rank !== b.rank + 1) return false;
    }
    return true;
  }

  canMove(from, index, to) {
    if (from === to || !this.canPick(from, index)) return false;
    const c = this.piles[from][index];
    if (isFoundation(to)) return index === this.piles[from].length - 1 && this.fitsFoundation(c, to);
    if (isTableau(to)) return this.fitsTableau(c, to);
    return false;
  }

  move(from, index, to) {
    if (!this.canMove(from, index, to)) return false;
    this.pushUndo();
    const src = this.piles[from];
    const tail = src.splice(index);
    for (const c of tail) this.piles[to].push(c);

    if (from === WASTE) this.score += isFoundation(to) ? 10 : 5;
    else if (isTableau(from) && isFoundation(to)) this.score += 10;
    else if (isFoundation(from)) this.score = Math.max(0, this.score - 15);

    if (isTableau(from) && src.length) {
      const last = src[src.length - 1];
      if (!last.faceUp) {
        last.faceUp = true;
        this.score += 5;
      }
    }
    this.afterAction();
    return true;
  }

  /** Toque no monte: compra cartas ou, se vazio, devolve o descarte para o monte. */
  draw() {
    const s = this.piles[STOCK], w = this.piles[WASTE];
    if (!s.length && !w.length) return false;
    this.pushUndo();
    if (!s.length) {
      for (let i = w.length - 1; i >= 0; i--) {
        const c = w[i];
        c.faceUp = false;
        s.push(c);
      }
      w.length = 0;
    } else {
      const n = Math.min(this.drawCount, s.length);
      for (let i = 0; i < n; i++) {
        const c = s.pop();
        c.faceUp = true;
        w.push(c);
      }
    }
    this.afterAction();
    return true;
  }

  afterAction() {
    this.moves++;
    this.won = true;
    for (let f = FOUNDATION; f < TABLEAU; f++) {
      if (this.piles[f].length !== 13) {
        this.won = false;
        break;
      }
    }
  }

  // ---------------------------------------------------------------- ajuda

  /** Melhor destino para a carta tocada (toque para mover); -1 se não houver. */
  bestTarget(from, index) {
    if (!this.canPick(from, index)) return -1;
    const c = this.piles[from][index];
    const single = index === this.piles[from].length - 1;
    if (single && !isFoundation(from)) {
      for (let f = FOUNDATION; f < TABLEAU; f++) if (this.fitsFoundation(c, f)) return f;
    }
    let empty = -1;
    for (let t = TABLEAU; t < PILE_COUNT; t++) {
      if (t === from || !this.fitsTableau(c, t)) continue;
      if (!this.piles[t].length) {
        // Mover um Rei que já está no fundo de uma coluna não ajuda.
        if (!(isTableau(from) && index === 0) && empty < 0) empty = t;
      } else {
        return t;
      }
    }
    return empty;
  }

  /** Sugestões em ordem de utilidade. A última pode ser "tocar no monte". */
  hints() {
    const out = [];
    // 1) Qualquer carta para as fundações.
    for (let p = WASTE; p < PILE_COUNT; p++) {
      if (isFoundation(p) || !this.piles[p].length) continue;
      const i = this.piles[p].length - 1;
      for (let f = FOUNDATION; f < TABLEAU; f++) {
        if (this.canMove(p, i, f)) {
          out.push({ from: p, index: i, to: f });
          break;
        }
      }
    }
    // 2) Sequências que revelam uma carta virada para baixo.
    const freeColumn = [];
    for (let p = TABLEAU; p < PILE_COUNT; p++) {
      const first = this.firstFaceUp(p);
      if (first < 0) continue;
      const c = this.piles[p][first];
      for (let t = TABLEAU; t < PILE_COUNT; t++) {
        if (!this.canMove(p, first, t)) continue;
        if (first > 0) {
          out.push({ from: p, index: first, to: t });
          break;
        }
        if (c.rank !== 13 && this.piles[t].length) {
          freeColumn.push({ from: p, index: first, to: t });
          break;
        }
      }
    }
    // 3) Do descarte para a mesa.
    if (this.piles[WASTE].length) {
      const i = this.piles[WASTE].length - 1;
      const t = this.bestTarget(WASTE, i);
      if (isTableau(t)) out.push({ from: WASTE, index: i, to: t });
    }
    out.push(...freeColumn);
    if (this.piles[STOCK].length || this.piles[WASTE].length) out.push({ from: STOCK, index: 0, to: WASTE });
    return out;
  }

  firstFaceUp(p) {
    const pile = this.piles[p];
    for (let i = 0; i < pile.length; i++) if (pile[i].faceUp) return i;
    return -1;
  }

  /** Todas as cartas estão à vista: o jogo pode terminar sozinho. */
  canAutoComplete() {
    if (this.won || this.piles[STOCK].length || this.piles[WASTE].length) return false;
    for (let p = TABLEAU; p < PILE_COUNT; p++) {
      for (const c of this.piles[p]) if (!c.faceUp) return false;
    }
    return true;
  }

  /** Próximo movimento da conclusão automática (a menor carta que já cabe). */
  nextAutoMove() {
    let best = null, bestRank = 99;
    for (let p = WASTE; p < PILE_COUNT; p++) {
      if (isFoundation(p) || !this.piles[p].length) continue;
      const c = this.top(p);
      if (c.rank >= bestRank) continue;
      for (let f = FOUNDATION; f < TABLEAU; f++) {
        if (this.fitsFoundation(c, f)) {
          best = { from: p, index: this.piles[p].length - 1, to: f };
          bestRank = c.rank;
          break;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- desfazer

  canUndo() { return this.undoStack.length > 0; }

  undo() {
    if (!this.undoStack.length) return false;
    const keepTime = this.elapsedMs, keepMoves = this.moves, keepCounted = this.counted;
    try {
      this.applyState(this.undoStack.pop());
    } catch (e) {
      this.undoStack = [];
      return false;
    }
    this.elapsedMs = keepTime;
    this.moves = keepMoves; // jogada desfeita continua contada; os pontos voltam junto com a posição
    this.counted = keepCounted;
    this.won = false;
    return true;
  }

  pushUndo() {
    this.undoStack.push(this.stateString());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.splice(0, this.undoStack.length - MAX_UNDO);
  }

  // ---------------------------------------------------------------- salvar
  // Mesmo formato do app Android ("R1|...").

  stateString() {
    let s = [FORMAT, this.drawCount, this.score, this.moves, Math.round(this.elapsedMs), this.seed,
      this.dailyDate, this.counted ? 1 : 0, this.winRecorded ? 1 : 0, this.won ? 1 : 0].join('|') + '|';
    s += this.piles.map(pile => pile.map(c => c.id + (c.faceUp ? 'u' : '')).join(',')).join(';');
    return s;
  }

  applyState(s) {
    const f = s.split('|');
    if (f.length !== 11 || f[0] !== FORMAT) throw new Error('formato');
    const dc = parseInt(f[1], 10);
    const pileStr = f[10].split(';');
    if (pileStr.length !== PILE_COUNT) throw new Error('pilhas');
    const np = [], seen = new Array(52).fill(false), up = new Array(52).fill(false);
    for (let p = 0; p < PILE_COUNT; p++) {
      np.push([]);
      if (!pileStr[p]) continue;
      for (const tok of pileStr[p].split(',')) {
        const u = tok.endsWith('u');
        const id = parseInt(u ? tok.slice(0, -1) : tok, 10);
        if (!(id >= 0 && id < 52) || seen[id]) throw new Error('carta repetida');
        seen[id] = true;
        up[id] = u;
        np[p].push(this.deck[id]);
      }
    }
    if (seen.includes(false)) throw new Error('carta faltando');
    if (!/^-?\d+$/.test(f[5])) throw new Error('número');
    this.drawCount = dc === 3 ? 3 : 1;
    this.score = parseInt(f[2], 10) || 0;
    this.moves = parseInt(f[3], 10) || 0;
    this.elapsedMs = parseInt(f[4], 10) || 0;
    this.seed = f[5];
    this.dailyDate = f[6];
    this.counted = f[7] === '1';
    this.winRecorded = f[8] === '1';
    this.won = f[9] === '1';
    for (let i = 0; i < 52; i++) this.deck[i].faceUp = up[i];
    for (let p = 0; p < PILE_COUNT; p++) this.piles[p] = np[p];
  }

  /** Estado completo (partida + histórico recente para desfazer). */
  save() {
    const lines = [this.stateString()];
    for (let i = this.undoStack.length - 1; i >= 0 && lines.length <= SAVED_UNDO; i--) {
      lines.push(this.undoStack[i]);
    }
    return lines.join('\n');
  }

  load(saved) {
    if (!saved) return false;
    try {
      const lines = saved.split('\n');
      this.applyState(lines[0]);
      // As linhas seguintes vêm do mais recente para o mais antigo.
      this.undoStack = lines.slice(1).reverse();
      return true;
    } catch (e) {
      this.undoStack = [];
      return false;
    }
  }
}

const MAX_NUMBER = 9999999;

/** A distribuição depende só do número; números novos têm até 7 dígitos. */
function newGameNumber() {
  return String(1 + Math.floor(Math.random() * MAX_NUMBER));
}

function dailyNumber(date) {
  return String(1n + mulMod(date, 2654435761n, MAX_NUMBER));
}

/** Número digitado pelo usuário, no intervalo de um long do Java; null se inválido. */
function parseGameNumber(text) {
  const t = String(text).trim();
  if (!/^-?\d{1,19}$/.test(t)) return null;
  const v = BigInt(t);
  if (v > 9223372036854775807n || v < -9223372036854775808n) return null;
  return v.toString();
}
