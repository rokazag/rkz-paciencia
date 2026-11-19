'use strict';
// Mesa de jogo: desenho, animações e toques (GameView.java). As regras ficam em Game.
// Medidas em pixels CSS; o canvas é desenhado na resolução do aparelho.

const SOUND_PLACE = 0, SOUND_DRAW = 1, SOUND_WIN = 2;
const MOVE_MS = 190, AUTO_STEP_MS = 120, HINT_MS = 2200, SHAKE_MS = 360, DOUBLE_TAP_MS = 400;
const TAP_OFF = 0, TAP_SINGLE = 1, TAP_DOUBLE = 2;
const SIZE_NORMAL = 0, SIZE_LARGE = 1, SIZE_MAX = 2;
// Por tamanho: espaço entre as cartas (fração do lado menor da tela), proporção
// altura/largura e quantas alturas de carta reservar na vertical (horizontal com as
// fundações ao lado / com as pilhas em cima).
const SIZE_GAP = [0.014, 0.011, 0.006];
const SIZE_RATIO = [CARD_RATIO, 1.51, 1.52];
const SIDE_ROWS = [2.75, 2.45, 2.2];
const TOP_ROWS = [3.8, 3.5, 3.2];
const TOUCH_SLOP = 8;
const FOOTER_SIZE = 11;

function now() { return performance.now(); }

class Rect {
  constructor(l = 0, t = 0, r = 0, b = 0) { this.set(l, t, r, b); }
  set(l, t, r, b) { this.left = l; this.top = t; this.right = r; this.bottom = b; return this; }
  get width() { return this.right - this.left; }
  get height() { return this.bottom - this.top; }
  get cx() { return (this.left + this.right) / 2; }
  get cy() { return (this.top + this.bottom) / 2; }
  contains(x, y) { return x >= this.left && x < this.right && y >= this.top && y < this.bottom; }
}

class GameView {
  constructor(canvas, listener) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.listener = listener;
    this.game = null;
    this.art = new CardArt(() => this.invalidate());

    this.tableColor = '#1E6B3A';
    this.backColor = '#1565C0';
    this.bigText = false;
    this.deckId = '';
    this.backImage = -1;
    this.footer = '';
    this.tapMode = TAP_SINGLE;
    this.leftHanded = false;
    this.landscapeTop = false;
    this.cardSize = SIZE_MAX;

    this.W = 0; this.H = 0; this.dpr = 1;
    this.landscape = false;
    this.cw = 0; this.ch = 0; this.gap = 0; this.tabY = 0; this.fan = 0; this.radius = 0;
    this.fScale = 1;
    this.sepX = -1; this.sepTop = 0; this.sepBottom = 0;
    this.pileRect = [];
    for (let i = 0; i < PILE_COUNT; i++) this.pileRect.push(new Rect());
    this.px = new Float32Array(52); this.py = new Float32Array(52); this.ps = new Float32Array(52);

    this.anims = [];
    this.animating = new Array(52).fill(false);

    this.dragPile = -1; this.dragIndex = -1; this.dragging = false;
    this.downX = 0; this.downY = 0; this.touchX = 0; this.touchY = 0;
    this.dragged = new Array(52).fill(false);
    this.pointerId = null;

    this.hintCard = -1; this.hintPile = -1; this.hintCursor = 0; this.hintList = null;
    this.hintTimer = 0;

    this.autoRunning = false;
    this.autoTimer = 0;
    this.win = null;

    this.lastTapCard = -1; this.lastTapTime = 0;
    this.shaking = new Array(52).fill(false);
    this.shakeStart = 0; this.frameTime = 0;

    this.frameRequested = false;
    this.tablePaint = this.tableColor;

    canvas.addEventListener('pointerdown', e => this.onPointer(e, 'down'));
    canvas.addEventListener('pointermove', e => this.onPointer(e, 'move'));
    canvas.addEventListener('pointerup', e => this.onPointer(e, 'up'));
    canvas.addEventListener('pointercancel', e => this.onPointer(e, 'cancel'));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------------------------------------------------------------- configuração

  setGame(g) {
    this.game = g;
    this.resetTransient();
    this.relayout();
  }

  setFooter(text) {
    this.footer = text;
    this.relayout();
  }

  setAppearance(tableColor, backColor, bigText, deckId, backImage, backDesign) {
    this.tableColor = tableColor;
    this.backColor = backColor;
    this.bigText = bigText;
    this.deckId = deckId;
    this.backImage = backImage;
    this.backDesign = backDesign || '';
    this.buildTablePaint();
    this.relayout();
  }

  setControls(tapMode, leftHanded, landscapeTop, cardSize) {
    this.tapMode = tapMode;
    this.leftHanded = leftHanded;
    this.landscapeTop = landscapeTop;
    this.cardSize = Math.max(SIZE_NORMAL, Math.min(SIZE_MAX, cardSize));
    this.lastTapCard = -1;
    this.relayout();
  }

  isBusy() { return this.autoRunning || this.win !== null; }

  resetTransient() {
    this.anims = [];
    this.animating.fill(false);
    this.dragged.fill(false);
    this.dragging = false;
    this.dragPile = -1;
    clearTimeout(this.autoTimer);
    this.autoRunning = false;
    this.win = null;
    this.clearHintNow();
  }

  clearHintNow() {
    clearTimeout(this.hintTimer);
    this.hintCard = -1;
    this.hintPile = -1;
    this.hintList = null;
    this.hintCursor = 0;
  }

  /** Chamado quando o tamanho do canvas muda. */
  resize(w, h, dpr) {
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.win) this.finishWin();
    this.buildTablePaint();
    this.relayout();
  }

  buildTablePaint() {
    const w = this.W, h = this.H;
    if (w > 0 && h > 0) {
      const g = this.ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.max(w, h) * 0.8);
      g.addColorStop(0, lighten(this.tableColor, 0.12));
      g.addColorStop(1, this.tableColor);
      this.tablePaint = g;
    } else {
      this.tablePaint = this.tableColor;
    }
  }

  footerHeight() { return this.footer ? FOOTER_SIZE * 1.6 : 0; }

  relayout() {
    const w = this.W, h = this.H, game = this.game;
    if (!w || !h || !game) return;
    const cs = this.cardSize;
    const gap = this.gap = Math.min(w, h) * SIZE_GAP[cs];
    const ratio = SIZE_RATIO[cs];
    const usableH = h - this.footerHeight();
    const landscapeScreen = w > h;
    // Destro: monte à direita. Canhoto: monte à esquerda.
    this.landscape = landscapeScreen && !this.landscapeTop;
    const top = gap;
    let cw, ch;
    if (this.landscape) {
      // Destro: fundações em coluna | linha | 7 da mesa | descarte e monte.
      ch = (usableH - gap * 3) / SIDE_ROWS[cs];
      cw = ch / ratio;
      let fch = Math.min(ch, (usableH - gap * 5) / 4);
      let fcw = fch / ratio;
      const maxCw = (w - gap * 13 - fcw) / 8;
      if (cw > maxCw) {
        cw = maxCw;
        ch = cw * ratio;
        fch = Math.min(fch, ch);
        fcw = fch / ratio;
      }
      this.cw = cw; this.ch = ch;
      this.fScale = fch / ch;
      const total = fcw + 8 * cw + gap * 11;
      const left = (w - total) / 2;
      this.tabY = top;
      this.fan = ch * 0.15;
      let stockX, foundX, tabX;
      if (this.leftHanded) {
        stockX = left;
        tabX = stockX + cw + gap * 2;
        foundX = tabX + 7 * cw + 6 * gap + gap * 3;
        this.sepX = foundX - gap * 1.5;
      } else {
        foundX = left;
        tabX = foundX + fcw + gap * 3;
        stockX = tabX + 7 * cw + 6 * gap + gap * 2;
        this.sepX = tabX - gap * 1.5;
      }
      this.sepTop = top;
      this.sepBottom = usableH - gap;
      // Cartas viradas em cima; o monte logo abaixo, no meio da coluna.
      this.setRect(WASTE, stockX, top);
      this.setRect(STOCK, stockX, top + ch + 2 * this.fan + gap * 1.5);
      for (let t = 0; t < 7; t++) this.setRect(TABLEAU + t, tabX + t * (cw + gap), top);
      for (let f = 0; f < 4; f++) {
        const y = top + f * (fch + gap);
        this.pileRect[FOUNDATION + f].set(foundX, y, foundX + fcw, y + fch);
      }
    } else {
      this.fScale = 1;
      cw = (w - gap * 8) / 7;
      ch = cw * ratio;
      const maxCh = landscapeScreen
        ? (usableH - gap * 3) / TOP_ROWS[cs]
        : (usableH - gap * 3) / (2 + 6 * 0.10 + 12 * 0.22);
      if (ch > maxCh) {
        ch = maxCh;
        cw = ch / ratio;
      }
      this.cw = cw; this.ch = ch;
      const left = (w - (7 * cw + 6 * gap)) / 2;
      this.tabY = top + ch + gap * 1.6;
      this.fan = cw * 0.32;
      // O descarte fica colado ao monte e longe das fundações, com a linha
      // no meio, para a carta comprada não parecer parte das fundações.
      const wasteW = game.drawCount === 3 ? cw + 2 * this.fan : cw;
      let stockX, wasteX, foundX;
      if (this.leftHanded) {
        stockX = left;
        wasteX = stockX + cw + gap;
        foundX = left + 3 * (cw + gap);
        this.sepX = (wasteX + wasteW + foundX) / 2;
      } else {
        stockX = left + 6 * (cw + gap);
        wasteX = stockX - gap - wasteW;
        foundX = left;
        this.sepX = (foundX + 4 * cw + 3 * gap + wasteX) / 2;
      }
      this.sepTop = top;
      this.sepBottom = top + ch;
      this.setRect(STOCK, stockX, top);
      this.setRect(WASTE, wasteX, top);
      for (let f = 0; f < 4; f++) this.setRect(FOUNDATION + f, foundX + f * (cw + gap), top);
      for (let t = 0; t < 7; t++) this.setRect(TABLEAU + t, left + t * (cw + gap), this.tabY);
    }
    this.radius = cw * 0.09;
    this.art.configure(Math.round(cw * this.dpr), Math.round(ch * this.dpr), this.backColor, this.bigText,
      this.deckId, this.backImage, this.backDesign);
    this.outlineWidth = Math.max(1.5, cw * 0.025);
    this.glowWidth = Math.max(3, cw * 0.06);
    this.sepWidth = Math.max(1.5, gap * 0.3);
    this.computePositions();
    this.invalidate();
  }

  setRect(pile, x, y) {
    this.pileRect[pile].set(x, y, x + this.cw, y + this.ch);
  }

  computePositions() {
    const game = this.game;
    if (!game || !this.cw) return;
    const { px, py, ps, cw, ch } = this;
    for (let p = 0; p < PILE_COUNT; p++) {
      const pile = game.piles[p];
      const base = this.pileRect[p];
      const n = pile.length;
      if (p === WASTE) {
        const visible = game.drawCount === 3 ? Math.min(3, n) : 1;
        for (let i = 0; i < n; i++) {
          const k = i - (n - visible);
          const off = k > 0 ? k * this.fan : 0;
          px[pile[i].id] = base.left + (this.landscape ? 0 : off);
          py[pile[i].id] = base.top + (this.landscape ? off : 0);
          ps[pile[i].id] = 1;
        }
      } else if (isTableau(p)) {
        let down = 0, up = 0;
        for (const c of pile) {
          if (c.faceUp) up++;
          else down++;
        }
        let dOff = ch * 0.12, uOff = ch * (this.bigText ? 0.31 : 0.27);
        let need = down * dOff + Math.max(0, up - 1) * uOff;
        const room = this.H - this.footerHeight() - this.tabY - this.gap - ch;
        if (need > room && need > 0) {
          // Aperta primeiro as cartas viradas para baixo; o valor das
          // viradas para cima deve continuar legível o máximo possível.
          const minDown = ch * 0.04;
          dOff = Math.max(minDown, dOff - (need - room) / Math.max(1, down));
          need = down * dOff + Math.max(0, up - 1) * uOff;
          if (need > room && up > 1) {
            uOff = Math.max(ch * 0.08, (room - down * dOff) / (up - 1));
          }
        }
        let y = base.top;
        for (const c of pile) {
          px[c.id] = base.left;
          py[c.id] = y;
          ps[c.id] = 1;
          y += c.faceUp ? uOff : dOff;
        }
      } else {
        const scale = isFoundation(p) ? this.fScale : 1;
        for (const c of pile) {
          px[c.id] = base.left;
          py[c.id] = base.top;
          ps[c.id] = scale;
        }
      }
    }
  }

  // ---------------------------------------------------------------- animação

  invalidate() {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.draw();
    });
  }

  /** Posição exibida agora (interpolada se a carta estiver em movimento). */
  displayPos(id, t0, out) {
    for (const a of this.anims) {
      if (a.id !== id) continue;
      const t = Math.max(0, Math.min(1, (t0 - a.start) / MOVE_MS));
      const u = 1 - t, e = 1 - u * u * u;
      out[0] = a.fx + (this.px[id] - a.fx) * e;
      out[1] = a.fy + (this.py[id] - a.fy) * e;
      out[2] = a.fs + (this.ps[id] - a.fs) * e;
      return;
    }
    out[0] = this.px[id];
    out[1] = this.py[id];
    out[2] = this.ps[id];
  }

  /** Aplica uma mudança no jogo animando as cartas de onde estavam até onde ficaram. */
  animateChange(change) {
    const t0 = now();
    const fx = new Float32Array(52), fy = new Float32Array(52), fs = new Float32Array(52), tmp = [0, 0, 0];
    for (let i = 0; i < 52; i++) {
      if (this.dragging && this.dragged[i]) {
        fx[i] = this.px[i] + (this.touchX - this.downX);
        fy[i] = this.py[i] + (this.touchY - this.downY);
        fs[i] = this.ps[i];
      } else {
        this.displayPos(i, t0, tmp);
        fx[i] = tmp[0]; fy[i] = tmp[1]; fs[i] = tmp[2];
      }
    }
    const result = change();
    this.computePositions();
    this.startAnims(fx, fy, fs, t0, 0);
    return result;
  }

  startAnims(fx, fy, fs, t0, stagger) {
    this.anims = [];
    this.animating.fill(false);
    let delay = 0;
    const { px, py, ps } = this;
    for (let p = 0; p < PILE_COUNT; p++) {
      for (const c of this.game.piles[p]) {
        const id = c.id;
        if (Math.abs(fx[id] - px[id]) + Math.abs(fy[id] - py[id]) < 0.5 && Math.abs(fs[id] - ps[id]) < 0.01) continue;
        this.anims.push({ id, fx: fx[id], fy: fy[id], fs: fs[id], start: t0 + delay });
        delay += stagger;
        this.animating[id] = true;
      }
    }
    this.invalidate();
  }

  /** Animação de distribuição a partir do monte. */
  animateDeal() {
    if (!this.cw) return;
    const t0 = now();
    const sx = this.pileRect[STOCK].left, sy = this.pileRect[STOCK].top;
    this.anims = [];
    this.animating.fill(false);
    // Na ordem em que as cartas são dadas: linha por linha.
    let delay = 0;
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) {
        const c = this.game.piles[TABLEAU + col][row];
        this.anims.push({ id: c.id, fx: sx, fy: sy, fs: 1, start: t0 + delay });
        delay += 28;
        this.animating[c.id] = true;
      }
    }
    this.invalidate();
  }

  // ---------------------------------------------------------------- ações

  refresh() {
    this.resetTransient();
    this.relayout();
  }

  undo() {
    if (this.isBusy() || !this.game.canUndo()) return;
    this.clearHintNow();
    this.animateChange(() => this.game.undo());
    this.changed(SOUND_PLACE);
  }

  doMove(from, index, to) {
    this.clearHintNow();
    if (this.animateChange(() => this.game.move(from, index, to))) this.changed(SOUND_PLACE);
  }

  doDraw() {
    this.clearHintNow();
    if (this.animateChange(() => this.game.draw())) this.changed(SOUND_DRAW);
  }

  changed(sound) {
    this.listener.onSound(sound);
    this.listener.onGameChanged();
    if (this.game.won && !this.win) setTimeout(() => this.startWin(), MOVE_MS + 60);
  }

  showHint() {
    if (this.isBusy()) return;
    if (!this.hintList) {
      this.hintList = this.game.hints();
      this.hintCursor = 0;
    }
    if (!this.hintList.length) {
      this.listener.onMessage('Não há jogadas disponíveis. Que tal um novo jogo?');
      return;
    }
    const m = this.hintList[this.hintCursor % this.hintList.length];
    this.hintCursor++;
    clearTimeout(this.hintTimer);
    if (m.from === STOCK) {
      this.hintCard = -1;
      this.hintPile = STOCK;
    } else {
      this.hintCard = this.game.piles[m.from][m.index].id;
      this.hintPile = m.to;
    }
    this.hintTimer = setTimeout(() => {
      this.hintCard = -1;
      this.hintPile = -1;
      this.invalidate();
    }, HINT_MS);
    this.invalidate();
  }

  startAutoComplete() {
    if (this.isBusy() || !this.game.canAutoComplete()) return;
    this.clearHintNow();
    this.autoRunning = true;
    this.autoTimer = setTimeout(() => this.autoStep(), 0);
  }

  autoStep() {
    const m = this.game.nextAutoMove();
    if (!m) {
      this.autoRunning = false;
      this.listener.onGameChanged();
      return;
    }
    this.animateChange(() => this.game.move(m.from, m.index, m.to));
    this.changed(SOUND_PLACE);
    if (this.game.won) this.autoRunning = false;
    else this.autoTimer = setTimeout(() => this.autoStep(), AUTO_STEP_MS);
  }

  // ---------------------------------------------------------------- toque

  onPointer(e, type) {
    if (!this.game) return;
    e.preventDefault();
    if (type === 'down') {
      if (this.pointerId !== null) return; // ignora o segundo dedo
      this.pointerId = e.pointerId;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
    } else if (e.pointerId !== this.pointerId) {
      return;
    }
    if (type === 'up' || type === 'cancel') this.pointerId = null;

    if (this.win) {
      if (type === 'up') this.finishWin();
      return;
    }
    if (this.autoRunning) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (type === 'down') {
      this.downX = this.touchX = x;
      this.downY = this.touchY = y;
      this.dragging = false;
      const hit = this.hitTest(x, y);
      this.dragPile = hit[0];
      this.dragIndex = hit[1];
    } else if (type === 'move') {
      this.touchX = x;
      this.touchY = y;
      if (!this.dragging && this.dragPile >= 0 && this.game.canPick(this.dragPile, this.dragIndex)
          && Math.hypot(x - this.downX, y - this.downY) > TOUCH_SLOP) {
        this.dragging = true;
        const pile = this.game.piles[this.dragPile];
        for (let i = this.dragIndex; i < pile.length; i++) this.dragged[pile[i].id] = true;
        this.clearHintNow();
      }
      if (this.dragging) this.invalidate();
    } else if (type === 'up') {
      this.touchX = x;
      this.touchY = y;
      if (this.dragging) this.drop();
      else this.tap();
      this.dragging = false;
      this.dragged.fill(false);
      this.dragPile = -1;
      this.invalidate();
    } else {
      if (this.dragging) this.animateChange(() => {});
      this.dragging = false;
      this.dragged.fill(false);
      this.dragPile = -1;
      this.invalidate();
    }
  }

  /** [pilha, índice]; índice -1 quando o toque é numa pilha vazia. */
  hitTest(x, y) {
    const game = this.game;
    if (this.pileRect[STOCK].contains(x, y)) return [STOCK, -1];
    const waste = game.piles[WASTE];
    if (waste.length && this.cardContains(waste[waste.length - 1].id, x, y)) return [WASTE, waste.length - 1];
    for (let f = TABLEAU - 1; f >= FOUNDATION; f--) {
      if (this.pileRect[f].contains(x, y)) return [f, game.piles[f].length - 1];
    }
    for (let t = TABLEAU; t < PILE_COUNT; t++) {
      const pile = game.piles[t];
      for (let i = pile.length - 1; i >= 0; i--) {
        if (this.cardContains(pile[i].id, x, y)) return [t, i];
      }
      if (!pile.length && this.pileRect[t].contains(x, y)) return [t, -1];
    }
    return [-1, -1];
  }

  cardContains(id, x, y) {
    const { px, py, ps } = this;
    return x >= px[id] && x <= px[id] + this.cw * ps[id] && y >= py[id] && y <= py[id] + this.ch * ps[id];
  }

  tap() {
    if (Math.hypot(this.touchX - this.downX, this.touchY - this.downY) > TOUCH_SLOP * 2) return;
    const game = this.game;
    if (this.dragPile === STOCK) {
      this.doDraw();
      return;
    }
    if (this.dragPile < 0 || (this.dragIndex < 0 && isTableau(this.dragPile))) {
      this.listener.onTableTapped();
      return;
    }
    if (this.dragIndex < 0 || this.tapMode === TAP_OFF) return;
    const card = game.piles[this.dragPile][this.dragIndex];
    if (!card.faceUp) return;
    if (this.tapMode === TAP_DOUBLE) {
      const t = now();
      const second = card.id === this.lastTapCard && t - this.lastTapTime <= DOUBLE_TAP_MS;
      this.lastTapCard = second ? -1 : card.id;
      this.lastTapTime = t;
      if (!second) return;
    }
    const target = game.bestTarget(this.dragPile, this.dragIndex);
    if (target >= 0) this.doMove(this.dragPile, this.dragIndex, target);
    else this.shake(this.dragPile, this.dragIndex);
  }

  // ---------------------------------------------------------------- tremida (jogada inválida)

  shake(pile, index) {
    this.shaking.fill(false);
    const cards = this.game.piles[pile];
    for (let i = Math.max(0, index); i < cards.length; i++) this.shaking[cards[i].id] = true;
    this.shakeStart = now();
    if (navigator.vibrate) navigator.vibrate(40);
    this.invalidate();
  }

  /** Deslocamento horizontal da tremida; 0 quando a carta não está tremendo. */
  shakeDx(id, t0) {
    if (!this.shaking[id]) return 0;
    const t = (t0 - this.shakeStart) / SHAKE_MS;
    if (t >= 1) {
      this.shaking[id] = false;
      return 0;
    }
    return Math.sin(t * Math.PI * 6) * this.cw * 0.07 * (1 - t);
  }

  drop() {
    const game = this.game;
    const first = game.piles[this.dragPile][this.dragIndex];
    const dx = this.px[first.id] + (this.touchX - this.downX), dy = this.py[first.id] + (this.touchY - this.downY);
    const moving = new Rect(dx, dy, dx + this.cw * this.ps[first.id], dy + this.ch * this.ps[first.id]);
    let best = -1, bestArea = 0;
    for (let p = FOUNDATION; p < PILE_COUNT; p++) {
      if (!game.canMove(this.dragPile, this.dragIndex, p)) continue;
      const target = this.targetRect(p);
      let area = overlap(moving, target);
      if (target.contains(this.touchX, this.touchY)) area += this.cw * this.ch;
      if (area > bestArea) {
        bestArea = area;
        best = p;
      }
    }
    if (best >= 0) {
      this.doMove(this.dragPile, this.dragIndex, best);
    } else {
      this.animateChange(() => {});
      // Largou longe da origem num lugar onde não cabe: a carta treme ao voltar.
      if (Math.hypot(this.touchX - this.downX, this.touchY - this.downY) > this.ch * 0.5) {
        this.shake(this.dragPile, this.dragIndex);
      }
    }
  }

  targetRect(p) {
    const t = this.game.top(p);
    const b = this.pileRect[p];
    const r = new Rect(b.left, b.top, b.right, b.bottom);
    if (t && isTableau(p)) {
      r.top = this.py[t.id];
      r.bottom = this.py[t.id] + this.ch;
    }
    return r;
  }

  // ---------------------------------------------------------------- desenho

  draw() {
    const ctx = this.ctx, game = this.game;
    const W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.tablePaint;
    ctx.fillRect(0, 0, W, H);
    if (!game || !this.cw) return;
    const t0 = now();
    this.frameTime = t0;

    if (this.footer) {
      // Encolhe o rodapé se não couber na largura (telas estreitas).
      let size = FOOTER_SIZE;
      ctx.font = cardFont(size).replace('bold ', '');
      const tw = ctx.measureText(this.footer).width, maxW = W * 0.96;
      if (tw > maxW) {
        size = size * maxW / tw;
        ctx.font = cardFont(size).replace('bold ', '');
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(this.footer, W / 2, H - FOOTER_SIZE * 0.5);
    }
    if (this.sepX >= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = this.sepWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.sepX, this.sepTop);
      ctx.lineTo(this.sepX, this.sepBottom);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // Lugares vazios.
    this.drawSlot(this.pileRect[STOCK]);
    if (!game.piles[STOCK].length && game.piles[WASTE].length) this.drawRecycle(this.pileRect[STOCK]);
    for (let f = FOUNDATION; f < TABLEAU; f++) {
      const r = this.pileRect[f];
      this.drawSlot(r);
      drawSuit(ctx, f - FOUNDATION, r.cx, r.cy, r.width * 0.5, 'rgba(255,255,255,0.2)');
    }
    for (let t = TABLEAU; t < PILE_COUNT; t++) this.drawSlot(this.pileRect[t]);

    // Cartas paradas.
    this.drawTopOnly(STOCK);
    this.drawStockCount();
    const waste = game.piles[WASTE];
    for (let i = Math.max(0, waste.length - (game.drawCount === 3 ? 4 : 2)); i < waste.length; i++) {
      this.drawStatic(waste[i]);
    }
    for (let f = FOUNDATION; f < TABLEAU; f++) this.drawTopOnly(f);
    for (let t = TABLEAU; t < PILE_COUNT; t++) {
      for (const c of game.piles[t]) this.drawStatic(c);
    }

    // Dica.
    if (this.hintCard >= 0) this.drawGlow(this.px[this.hintCard], this.py[this.hintCard], this.ps[this.hintCard]);
    if (this.hintPile >= 0) {
      const t = game.top(this.hintPile);
      if (t && this.hintPile !== STOCK) this.drawGlow(this.px[t.id], this.py[t.id], this.ps[t.id]);
      else {
        const r = this.pileRect[this.hintPile];
        this.drawGlow(r.left, r.top, r.width / this.cw);
      }
    }

    // Cartas em movimento.
    let more = false;
    const pos = [0, 0, 0];
    for (const a of this.anims) {
      if (t0 < a.start + MOVE_MS) more = true;
      this.displayPos(a.id, t0, pos);
      this.drawCard(game.deck[a.id], pos[0], pos[1], pos[2], false);
    }
    if (!more && this.anims.length) {
      this.anims = [];
      this.animating.fill(false);
    }

    // Cartas sendo arrastadas.
    if (this.dragging) {
      const pile = game.piles[this.dragPile];
      const ox = this.touchX - this.downX, oy = this.touchY - this.downY;
      for (let i = this.dragIndex; i < pile.length; i++) {
        const c = pile[i];
        this.drawCard(c, this.px[c.id] + ox, this.py[c.id] + oy, this.ps[c.id], true);
      }
    }

    if (this.win) {
      if (this.win.draw(t0)) more = true;
      else setTimeout(() => this.finishWin(), 0);
    }
    if (more || this.shaking.includes(true)) this.invalidate();
  }

  /** Quantas cartas restam no monte, no canto inferior do verso. */
  drawStockCount() {
    const n = this.game.piles[STOCK].length;
    if (!n) return;
    const ctx = this.ctx, r = this.pileRect[STOCK], ch = this.ch, cw = this.cw;
    const s = String(n);
    ctx.font = cardFont(ch * 0.13).replace('bold ', '');
    const tw = ctx.measureText(s).width;
    const bh = ch * 0.17, bw = Math.max(bh, tw + ch * 0.08);
    const bx = r.left + cw * 0.07, by = r.bottom - bh - ch * 0.05;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, bx + bw / 2, by + bh / 2 + ch * 0.005);
    ctx.textBaseline = 'alphabetic';
  }

  drawTopOnly(p) {
    const pile = this.game.piles[p];
    for (let i = pile.length - 1; i >= 0; i--) {
      const c = pile[i];
      if (this.hidden(c)) continue;
      this.drawCard(c, this.px[c.id], this.py[c.id], this.ps[c.id], false);
      return;
    }
  }

  hidden(c) {
    return this.animating[c.id] || (this.dragging && this.dragged[c.id]) || (this.win !== null && this.win.launched(c));
  }

  drawStatic(c) {
    if (!this.hidden(c)) this.drawCard(c, this.px[c.id], this.py[c.id], this.ps[c.id], false);
  }

  drawCard(c, x, y, scale, lifted) {
    const ctx = this.ctx;
    x += this.shakeDx(c.id, this.frameTime);
    const w = this.cw * scale, h = this.ch * scale;
    if (lifted) {
      const o = w * 0.04;
      roundRect(ctx, x + o, y + o, w, h, this.radius * scale);
      ctx.fillStyle = 'rgba(0,0,0,0.33)';
      ctx.fill();
    }
    ctx.drawImage(c.faceUp ? this.art.face(c) : this.art.back(), x, y, w, h);
  }

  drawSlot(r) {
    const ctx = this.ctx;
    roundRect(ctx, r.left, r.top, r.width, r.height, this.radius);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.33)';
    ctx.lineWidth = this.outlineWidth;
    ctx.stroke();
  }

  drawRecycle(r) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = this.outlineWidth;
    const rad = this.cw * 0.24;
    const a0 = -60 * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(r.cx, r.cy, rad, a0, a0 + 300 * Math.PI / 180);
    ctx.stroke();
    const ax = r.cx + rad * Math.cos(a0), ay = r.cy + rad * Math.sin(a0);
    const s = this.cw * 0.09;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - s, ay - s * 0.2);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + s * 0.2, ay + s);
    ctx.stroke();
  }

  drawGlow(x, y, scale) {
    const ctx = this.ctx;
    const g = this.glowWidth / 2;
    roundRect(ctx, x - g, y - g, this.cw * scale + 2 * g, this.ch * scale + 2 * g, this.radius * scale + g);
    ctx.strokeStyle = '#FFD54F';
    ctx.lineWidth = this.glowWidth;
    ctx.stroke();
  }

  // ---------------------------------------------------------------- vitória

  startWin() {
    if (!this.game.won || this.win) return;
    this.anims = [];
    this.animating.fill(false);
    this.listener.onSound(SOUND_WIN);
    this.win = new WinEffect(this);
    this.invalidate();
  }

  finishWin() {
    if (!this.win) return;
    this.win = null;
    this.invalidate();
    this.listener.onWinAnimationFinished();
  }
}

function overlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Cartas saltando das fundações, deixando rastro na mesa. */
class WinEffect {
  constructor(view) {
    this.v = view;
    this.order = [];
    for (let rank = 12; rank >= 0; rank--) {
      for (let f = 0; f < 4; f++) this.order.push(view.game.piles[FOUNDATION + f][rank].id);
    }
    this.x = new Float32Array(52); this.y = new Float32Array(52);
    this.vx = new Float32Array(52); this.vy = new Float32Array(52);
    this.out = new Array(52).fill(false);
    this.start = now();
    this.last = this.start;
    this.trail = makeCanvas(view.canvas.width, view.canvas.height);
    this.trailCtx = this.trail.getContext('2d');
  }

  launchedCount(t0) { return Math.min(52, Math.floor((t0 - this.start) / 90) + 1); }

  launched(c) {
    const n = this.launchedCount(now());
    for (let i = 0; i < n; i++) if (this.order[i] === c.id) return true;
    return false;
  }

  /** Desenha um quadro; false quando terminou. */
  draw(t0) {
    const v = this.v;
    const n = this.launchedCount(t0);
    const dt = Math.min(40, t0 - this.last);
    this.last = t0;
    const g = v.H * 2.4e-6;
    const floor = v.H - v.ch;
    const dpr = v.dpr;
    let alive = false;
    for (let i = 0; i < n; i++) {
      const id = this.order[i];
      if (this.out[id]) continue;
      if (this.vx[id] === 0) {
        this.x[id] = v.px[id];
        this.y[id] = v.py[id];
        const speed = v.W * (0.00025 + Math.random() * 0.0006);
        this.vx[id] = Math.random() < 0.5 ? speed : -speed;
        this.vy[id] = -Math.random() * v.H * 0.0008;
      }
      this.vy[id] += g * dt;
      this.x[id] += this.vx[id] * dt;
      this.y[id] += this.vy[id] * dt;
      if (this.y[id] > floor) {
        this.y[id] = floor;
        this.vy[id] = -this.vy[id] * 0.72;
      }
      if (this.x[id] < -v.cw || this.x[id] > v.W) {
        this.out[id] = true;
        continue;
      }
      alive = true;
      this.trailCtx.drawImage(v.art.face(v.game.deck[id]), this.x[id] * dpr, this.y[id] * dpr,
        v.cw * dpr, v.ch * dpr);
    }
    v.ctx.drawImage(this.trail, 0, 0, v.W, v.H);
    return alive || n < 52;
  }
}
