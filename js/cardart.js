'use strict';
// Faces e versos das cartas em canvas, recriados quando o tamanho muda (CardArt.java).
// O baralho "" é desenhado pelo próprio app; os demais vêm de decks/ (grade 13 x 4
// gerada por tools/build_decks.py e copiada por tools/build_web.py).

const CARD_RED = '#D32F2F', CARD_BLACK = '#1B1B1B';
/** Altura / largura das cartas. */
const CARD_RATIO = 1.45;
const CELL_W = 240, CELL_H = 348, BACK_COLS = 8;
const CARD_FONT = 'bold {px}px -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif';

function cardFont(px) { return CARD_FONT.replace('{px}', px.toFixed(2)); }

/** Naipes numa caixa unitária centrada na origem; cada naipe é uma lista de partes. */
const SUIT_PATHS = (() => {
  const spade = new Path2D();
  spade.moveTo(0, -0.5);
  spade.bezierCurveTo(0.25, -0.25, 0.5, -0.1, 0.5, 0.1);
  spade.bezierCurveTo(0.5, 0.34, 0.2, 0.4, 0.05, 0.22);
  spade.lineTo(0.16, 0.5);
  spade.lineTo(-0.16, 0.5);
  spade.lineTo(-0.05, 0.22);
  spade.bezierCurveTo(-0.2, 0.4, -0.5, 0.34, -0.5, 0.1);
  spade.bezierCurveTo(-0.5, -0.1, -0.25, -0.25, 0, -0.5);
  spade.closePath();

  const heart = new Path2D();
  heart.moveTo(0, 0.45);
  heart.bezierCurveTo(-0.25, 0.2, -0.5, 0, -0.5, -0.18);
  heart.bezierCurveTo(-0.5, -0.42, -0.18, -0.52, 0, -0.28);
  heart.bezierCurveTo(0.18, -0.52, 0.5, -0.42, 0.5, -0.18);
  heart.bezierCurveTo(0.5, 0, 0.25, 0.2, 0, 0.45);
  heart.closePath();

  const diamond = new Path2D();
  diamond.moveTo(0, -0.5);
  diamond.lineTo(0.38, 0);
  diamond.lineTo(0, 0.5);
  diamond.lineTo(-0.38, 0);
  diamond.closePath();

  const club = [];
  for (const [x, y, r] of [[0, -0.24, 0.21], [-0.23, 0.08, 0.21], [0.23, 0.08, 0.21], [0, 0.02, 0.12]]) {
    const c = new Path2D();
    c.arc(x, y, r, 0, Math.PI * 2);
    club.push(c);
  }
  const stem = new Path2D();
  stem.moveTo(0, 0.05);
  stem.lineTo(0.15, 0.5);
  stem.lineTo(-0.15, 0.5);
  stem.closePath();
  club.push(stem);

  return [[spade], [heart], [diamond], club];
})();

function drawSuit(ctx, suit, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size, size);
  ctx.fillStyle = color;
  for (const p of SUIT_PATHS[suit]) ctx.fill(p);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgb(c) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function lighten(c, f) {
  const [r, g, b] = hexToRgb(c);
  return rgbToHex(r + Math.round((255 - r) * f), g + Math.round((255 - g) * f), b + Math.round((255 - b) * f));
}

function darken(c) {
  const [r, g, b] = hexToRgb(c);
  return rgbToHex((r * 6 / 10) | 0, (g * 6 / 10) | 0, (b * 6 / 10) | 0);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** Imagens carregadas uma vez por endereço (folhas de baralho, versos, miniaturas). */
const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

class CardArt {
  /** onReady: chamado quando uma folha de imagem termina de carregar (para redesenhar). */
  constructor(onReady) {
    this.onReady = onReady || (() => {});
    this.faces = new Array(52).fill(null);
    this.backCanvas = null;
    this.width = 0;   // em pixels do aparelho
    this.height = 0;
    this.backColor = '#1565C0';
    this.bigText = false;
    this.deckId = '';
    this.backImage = -1;
    this.deckSheet = null;
    this.backSheet = null;
  }

  /** Ajusta tamanho/estilo; descarta o cache se algo mudou. */
  configure(w, h, backColor, bigText, deckId, backImage) {
    deckId = deckId || '';
    if (w === this.width && h === this.height && backColor === this.backColor && bigText === this.bigText
        && deckId === this.deckId && backImage === this.backImage) return;
    if (deckId !== this.deckId) {
      this.deckSheet = null;
      if (deckId) {
        loadImage(deckUrl(deckId + '.webp')).then(img => {
          if (this.deckId !== deckId) return;
          this.deckSheet = img;
          this.clear();
          this.onReady();
        });
      }
    }
    if (backImage >= 0 && !this.backSheet) {
      loadImage(deckUrl('backs.webp')).then(img => {
        this.backSheet = img;
        this.backCanvas = null;
        this.onReady();
      });
    }
    this.width = w;
    this.height = h;
    this.backColor = backColor;
    this.bigText = bigText;
    this.deckId = deckId;
    this.backImage = backImage;
    this.clear();
  }

  clear() {
    this.faces.fill(null);
    this.backCanvas = null;
  }

  /** Esquece as folhas carregadas (os baralhos disponíveis mudaram). */
  reset() {
    this.deckId = null;
    this.deckSheet = null;
    this.backSheet = null;
    this.width = 0;
  }

  face(c) {
    if (!this.faces[c.id]) {
      const img = this.deckSheet ? cropCell(this.deckSheet, c.rank - 1, c.suit, this.width, this.height) : null;
      this.faces[c.id] = img || renderFace(c, this.width, this.height, this.bigText);
    }
    return this.faces[c.id];
  }

  back() {
    if (!this.backCanvas) {
      const img = this.backImage >= 0 && this.backSheet
        ? cropCell(this.backSheet, this.backImage % BACK_COLS, (this.backImage / BACK_COLS) | 0, this.width, this.height)
        : null;
      this.backCanvas = img || renderBack(this.width, this.height, this.backColor);
    }
    return this.backCanvas;
  }
}

/** Recorta a célula (col, row) de uma folha e escala para w x h. */
function cropCell(sheet, col, row, w, h) {
  if (!sheet || w <= 0 || h <= 0) return null;
  const sx = col * CELL_W, sy = row * CELL_H;
  if (sx + CELL_W > sheet.naturalWidth || sy + CELL_H > sheet.naturalHeight) return null;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sheet, sx, sy, CELL_W, CELL_H, 0, 0, w, h);
  return c;
}

function renderFace(card, width, height, bigText) {
  const w = Math.max(width, 1), h = Math.max(height, 1);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const r = w * 0.09;
  const sw = Math.max(1.5, w * 0.012);

  roundRect(ctx, 1, 1, w - 2, h - 2, r);
  ctx.fillStyle = '#FFFDF7';
  ctx.fill();
  ctx.strokeStyle = '#8D8D8D';
  ctx.lineWidth = sw;
  ctx.stroke();

  const color = card.isRed() ? CARD_RED : CARD_BLACK;
  const rank = card.rankName();

  // Faixa superior (visível quando a carta está empilhada na mesa).
  const rankSize = h * (bigText ? 0.27 : 0.23);
  ctx.font = cardFont(rankSize);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  const maxRankW = w * 0.58;
  const rw = ctx.measureText(rank).width;
  const scaleX = rw > maxRankW ? maxRankW / rw : 1;
  const baseline = h * 0.03 + rankSize * 0.86;
  ctx.save();
  ctx.translate(w * 0.07, baseline);
  ctx.scale(scaleX, 1);
  ctx.fillText(rank, 0, 0);
  ctx.restore();

  const small = h * (bigText ? 0.19 : 0.16);
  drawSuit(ctx, card.suit, w - w * 0.08 - small / 2, baseline - rankSize * 0.36, small, color);

  // Centro da carta.
  if (card.rank === 1) {
    drawSuit(ctx, card.suit, w / 2, h * 0.62, h * 0.48, color);
  } else if (card.rank <= 10) {
    drawSuit(ctx, card.suit, w / 2, h * 0.63, h * 0.38, color);
  } else {
    const fx = w * 0.13, fy = h * 0.33, fw = w * 0.74, fh = h * 0.60;
    roundRect(ctx, fx, fy, fw, fh, r * 0.6);
    ctx.fillStyle = card.isRed() ? '#FDE7E4' : '#E8ECEF';
    ctx.fill();
    ctx.strokeStyle = card.isRed() ? 'rgba(211,47,47,0.4)' : 'rgba(27,27,27,0.4)';
    ctx.lineWidth = sw;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = cardFont(h * 0.30);
    ctx.fillText(rank, w / 2, h * 0.68);
    drawSuit(ctx, card.suit, w / 2, h * 0.81, h * 0.14, color);
  }
  return cv;
}

function renderBack(width, height, backColor) {
  const w = Math.max(width, 1), h = Math.max(height, 1);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const r = w * 0.09;

  roundRect(ctx, 1, 1, w - 2, h - 2, r);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#8D8D8D';
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.stroke();

  const inset = w * 0.07;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, lighten(backColor, 0.18));
  grad.addColorStop(1, backColor);
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.6);
  ctx.fillStyle = grad;
  ctx.fill();

  // Padrão de losangos.
  ctx.save();
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.6);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = Math.max(1, w * 0.015);
  const step = w * 0.16;
  ctx.beginPath();
  for (let d = -h; d < w + h; d += step) {
    ctx.moveTo(d, 0);
    ctx.lineTo(d + h, h);
    ctx.moveTo(d, h);
    ctx.lineTo(d + h, 0);
  }
  ctx.stroke();
  ctx.restore();

  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(1.5, w * 0.02);
  ctx.stroke();

  const cx = w / 2, cy = h / 2, dw = w * 0.16, dh = h * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx, cy - dh);
  ctx.lineTo(cx + dw, cy);
  ctx.lineTo(cx, cy + dh);
  ctx.lineTo(cx - dw, cy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  return cv;
}
