'use strict';
// Baralhos e versos próprios do Rkz Paciência, desenhados em código (arte original,
// livre para publicar). Cada baralho é um conjunto de opções para renderStyledFace;
// cada verso, uma função que pinta a área interna da carta.

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '-apple-system, "Helvetica Neue", Roboto, Arial, sans-serif';

function styledFont(px, family, weight) {
  return `${weight || 'bold'} ${px.toFixed(2)}px ${family}`;
}

const GOLD = '#E3B23C', GOLD_DARK = '#9C6F12', ROYAL = '#2B4C9B', SKIN = '#F6D3B3', INK = 'rgba(40,28,20,0.85)';

/** Baralhos desenhados. id fica nas preferências; não mude depois de publicado. */
const DECK_STYLES = [
  {
    id: 'rkz-classico', name: 'Clássico',
    font: SERIF, base: '#FFFDF5', border: '#9A9486',
    colors: ['#1B1B1B', '#C62828', '#C62828', '#1B1B1B'],
    numbers: 'pips', ace: 'ornate', courts: 'portrait', frameTint: ['#EEF1F6', '#FCEBE7', '#FCEBE7', '#EEF1F6'],
  },
  {
    id: 'rkz-letra-grande', name: 'Letra grande',
    font: SANS, base: '#FFFFFF', border: '#8D8D8D',
    colors: ['#111111', '#D50000', '#D50000', '#111111'],
    numbers: 'letter', ace: 'letter', courts: 'letter', indexScale: 1.06,
  },
  {
    id: 'rkz-quatro-cores', name: 'Quatro cores',
    font: SANS, base: '#FFFDF7', border: '#8D8D8D',
    colors: ['#1B1B1B', '#D32F2F', '#1565C0', '#2E7D32'],
    numbers: 'suit', ace: 'suit', courts: 'frame', frameTint: ['#E8ECEF', '#FDE7E4', '#E3EEFB', '#E3F2E5'],
  },
  {
    id: 'rkz-noturno', name: 'Noturno',
    font: SANS, base: '#1F2536', border: '#4A5470',
    colors: ['#EEF0F6', '#FF7070', '#FFB648', '#7ED9C3'],
    numbers: 'pips', ace: 'ornate', courts: 'portrait',
    frameTint: ['rgba(255,255,255,0.07)', 'rgba(255,112,112,0.10)', 'rgba(255,182,72,0.10)', 'rgba(126,217,195,0.10)'],
    dark: true,
  },
];

function deckStyle(id) {
  return DECK_STYLES.find(s => s.id === id) || null;
}

// ---------------------------------------------------------------- faces

function renderStyledFace(card, width, height, bigText, st) {
  const w = Math.max(width, 1), h = Math.max(height, 1);
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const r = w * 0.09;
  roundRect(ctx, 1, 1, w - 2, h - 2, r);
  ctx.fillStyle = st.base;
  ctx.fill();
  ctx.strokeStyle = st.border;
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.stroke();

  const color = st.colors[card.suit];
  const rank = card.rankName();

  // Faixa superior, igual em todos os baralhos (é o que aparece com as cartas empilhadas).
  const rankSize = h * (bigText ? 0.27 : 0.23) * (st.indexScale || 1);
  ctx.font = styledFont(rankSize, st.font);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  const maxRankW = w * 0.58;
  const rw = ctx.measureText(rank).width;
  const baseline = h * 0.03 + rankSize * 0.86;
  ctx.save();
  ctx.translate(w * 0.07, baseline);
  ctx.scale(rw > maxRankW ? maxRankW / rw : 1, 1);
  ctx.fillText(rank, 0, 0);
  ctx.restore();
  const small = h * (bigText ? 0.19 : 0.16);
  drawSuit(ctx, card.suit, w - w * 0.08 - small / 2, baseline - rankSize * 0.36, small, color);

  const kind = card.rank === 1 ? st.ace : card.rank <= 10 ? st.numbers : st.courts;
  if (kind === 'pips') drawPips(ctx, card, w, h, color);
  else if (kind === 'ornate') drawOrnateAce(ctx, card, w, h, color, st);
  else if (kind === 'letter') drawBigLetter(ctx, card, w, h, color, st);
  else if (kind === 'frame') drawFrameCourt(ctx, card, w, h, color, st);
  else if (kind === 'portrait') drawPortraitCourt(ctx, card, w, h, color, st);
  else drawSuit(ctx, card.suit, w / 2, h * (card.rank === 1 ? 0.62 : 0.63), h * (card.rank === 1 ? 0.48 : 0.38), color);
  return cv;
}

/** Posições dos naipes (x, y numa caixa 0..1) de 2 a 10, como num baralho tradicional. */
const PIP_LAYOUT = (() => {
  const L = 0.1, C = 0.5, R = 0.9;
  const col = (x, ys) => ys.map(y => [x, y]);
  return {
    2: col(C, [0, 1]),
    3: col(C, [0, 0.5, 1]),
    4: [...col(L, [0, 1]), ...col(R, [0, 1])],
    5: [...col(L, [0, 1]), ...col(R, [0, 1]), [C, 0.5]],
    6: [...col(L, [0, 0.5, 1]), ...col(R, [0, 0.5, 1])],
    7: [...col(L, [0, 0.5, 1]), ...col(R, [0, 0.5, 1]), [C, 0.25]],
    8: [...col(L, [0, 0.5, 1]), ...col(R, [0, 0.5, 1]), [C, 0.25], [C, 0.75]],
    9: [...col(L, [0, 1 / 3, 2 / 3, 1]), ...col(R, [0, 1 / 3, 2 / 3, 1]), [C, 0.5]],
    10: [...col(L, [0, 1 / 3, 2 / 3, 1]), ...col(R, [0, 1 / 3, 2 / 3, 1]), [C, 1 / 6], [C, 5 / 6]],
  };
})();

function drawPips(ctx, card, w, h, color) {
  const top = h * 0.415, bottom = h * 0.885;
  const left = w * 0.17, right = w * 0.83;
  const size = Math.min(w * 0.24, h * (card.rank >= 9 ? 0.122 : card.rank >= 7 ? 0.135 : 0.15));
  for (const [px, py] of PIP_LAYOUT[card.rank]) {
    const x = left + (right - left) * px, y = top + (bottom - top) * py;
    if (py > 0.5) {
      // Metade de baixo de cabeça para baixo, como nos baralhos de verdade.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI);
      drawSuit(ctx, card.suit, 0, 0, size, color);
      ctx.restore();
    } else {
      drawSuit(ctx, card.suit, x, y, size, color);
    }
  }
}

function drawOrnateAce(ctx, card, w, h, color, st) {
  const cx = w / 2, cy = h * 0.635, R = Math.min(w * 0.36, h * 0.27);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, w * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  // Raios finos entre os dois anéis.
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88);
    ctx.lineTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
    ctx.stroke();
  }
  ctx.restore();
  drawSuit(ctx, card.suit, cx, cy, R * 1.25, color);
  // Brilho discreto no naipe.
  ctx.save();
  ctx.globalAlpha = st.dark ? 0.18 : 0.12;
  drawSuit(ctx, card.suit, cx - R * 0.12, cy - R * 0.12, R * 0.45, '#FFFFFF');
  ctx.restore();
}

function drawBigLetter(ctx, card, w, h, color, st) {
  const rank = card.rankName();
  const size = h * 0.44;
  ctx.font = styledFont(size, st.font, '900');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  const tw = ctx.measureText(rank).width, maxW = w * 0.86;
  ctx.save();
  ctx.translate(w / 2, h * 0.745);
  ctx.scale(tw > maxW ? maxW / tw : 1, 1);
  ctx.fillText(rank, 0, 0);
  ctx.restore();
  drawSuit(ctx, card.suit, w / 2, h * 0.865, h * 0.12, color);
}

function drawFrameCourt(ctx, card, w, h, color, st) {
  const r = w * 0.09;
  const fx = w * 0.13, fy = h * 0.33, fw = w * 0.74, fh = h * 0.60;
  roundRect(ctx, fx, fy, fw, fh, r * 0.6);
  ctx.fillStyle = st.frameTint[card.suit];
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.stroke();
  ctx.restore();
  if (card.rank === 11) drawCrown(ctx, 11, w / 2, h * 0.49, fw * 0.34, color, color);
  else drawCrown(ctx, card.rank, w / 2, h * 0.49, fw * 0.4, GOLD, color);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.font = styledFont(h * 0.24, st.font);
  ctx.fillText(card.rankName(), w / 2, h * 0.755);
  drawSuit(ctx, card.suit, w / 2, h * 0.86, h * 0.1, color);
}

/** Coroa (Rei), tiara (Dama) ou boina (Valete) centrada em (cx, baseY), largura bw. */
function drawCrown(ctx, rank, cx, baseY, bw, fill, jewel) {
  const lw = Math.max(1, bw * 0.035);
  ctx.save();
  ctx.lineJoin = 'round';
  if (rank === 13) {
    const bh = bw * 0.62, band = bw * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, baseY);
    ctx.lineTo(cx - bw / 2, baseY - bh * 0.55);
    ctx.lineTo(cx - bw * 0.3, baseY - bh * 0.25);
    ctx.lineTo(cx - bw * 0.16, baseY - bh);
    ctx.lineTo(cx, baseY - bh * 0.35);
    ctx.lineTo(cx + bw * 0.16, baseY - bh);
    ctx.lineTo(cx + bw * 0.3, baseY - bh * 0.25);
    ctx.lineTo(cx + bw / 2, baseY - bh * 0.55);
    ctx.lineTo(cx + bw / 2, baseY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - bw / 2, baseY - band, bw, band * 0.35);
    for (const [x, y] of [[-0.5, -0.55], [-0.16, -1], [0.16, -1], [0.5, -0.55]]) {
      ctx.beginPath();
      ctx.arc(cx + bw * x, baseY + bh * y, bw * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, baseY - band * 0.5, bw * 0.065, 0, Math.PI * 2);
    ctx.fillStyle = jewel === fill ? 'rgba(255,255,255,0.8)' : jewel;
    ctx.fill();
  } else if (rank === 12) {
    const bh = bw * 0.45;
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.45, baseY);
    ctx.quadraticCurveTo(cx - bw * 0.42, baseY - bh * 0.7, cx - bw * 0.22, baseY - bh * 0.55);
    ctx.quadraticCurveTo(cx - bw * 0.1, baseY - bh * 1.15, cx, baseY - bh);
    ctx.quadraticCurveTo(cx + bw * 0.1, baseY - bh * 1.15, cx + bw * 0.22, baseY - bh * 0.55);
    ctx.quadraticCurveTo(cx + bw * 0.42, baseY - bh * 0.7, cx + bw * 0.45, baseY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = lw;
    ctx.stroke();
    for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) {
      ctx.beginPath();
      ctx.arc(cx + bw * x, baseY - bw * 0.05, bw * 0.035, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, baseY - bh * 1.02, bw * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = jewel === fill ? 'rgba(255,255,255,0.8)' : jewel;
    ctx.fill();
  } else {
    // Boina com pena.
    ctx.beginPath();
    ctx.ellipse(cx, baseY - bw * 0.1, bw * 0.5, bw * 0.2, -0.12, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + bw * 0.15, baseY - bw * 0.2);
    ctx.bezierCurveTo(cx + bw * 0.35, baseY - bw * 0.75, cx + bw * 0.62, baseY - bw * 0.7, cx + bw * 0.7, baseY - bw * 0.55);
    ctx.bezierCurveTo(cx + bw * 0.55, baseY - bw * 0.52, cx + bw * 0.38, baseY - bw * 0.4, cx + bw * 0.24, baseY - bw * 0.18);
    ctx.closePath();
    ctx.fillStyle = jewel === fill ? 'rgba(255,255,255,0.7)' : '#FFFFFF';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Figura (Rei, Dama, Valete) ilustrada: busto com coroa, roupa e o naipe no peito. */
function drawPortraitCourt(ctx, card, w, h, color, st) {
  const r = w * 0.09;
  const fx = w * 0.12, fy = h * 0.33, fw = w * 0.76, fh = h * 0.615;
  const king = card.rank === 13, queen = card.rank === 12;
  const red = card.isRed();
  roundRect(ctx, fx, fy, fw, fh, r * 0.6);
  ctx.fillStyle = st.frameTint[card.suit];
  ctx.fill();

  ctx.save();
  roundRect(ctx, fx, fy, fw, fh, r * 0.6);
  ctx.clip();
  ctx.translate(fx, fy);
  const X = v => v * fw, Y = v => v * fh;
  const lw = Math.max(1, fw * 0.013);
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = st.dark ? 'rgba(0,0,0,0.55)' : INK;

  const robe = st.dark ? color : (red ? '#C62828' : '#24324F');
  const lining = st.dark ? ROYAL : (red ? ROYAL : '#C62828');
  const hairColor = king ? '#8A8A8A' : queen ? '#B9822E' : '#6B4423';

  // Cabelo longo da Dama (atrás de tudo).
  if (queen) {
    ctx.beginPath();
    ctx.moveTo(X(0.29), Y(0.4));
    ctx.bezierCurveTo(X(0.18), Y(0.6), X(0.2), Y(0.76), X(0.27), Y(0.82));
    ctx.lineTo(X(0.73), Y(0.82));
    ctx.bezierCurveTo(X(0.8), Y(0.76), X(0.82), Y(0.6), X(0.71), Y(0.4));
    ctx.closePath();
    ctx.fillStyle = hairColor;
    ctx.fill();
    ctx.stroke();
  }

  // Ombros e manto.
  ctx.beginPath();
  ctx.moveTo(X(-0.02), Y(1.02));
  ctx.bezierCurveTo(X(0.02), Y(0.78), X(0.18), Y(0.73), X(0.36), Y(0.7));
  ctx.lineTo(X(0.64), Y(0.7));
  ctx.bezierCurveTo(X(0.82), Y(0.73), X(0.98), Y(0.78), X(1.02), Y(1.02));
  ctx.closePath();
  ctx.fillStyle = robe;
  ctx.fill();
  ctx.stroke();
  // Faixa central.
  ctx.beginPath();
  ctx.moveTo(X(0.38), Y(0.7));
  ctx.lineTo(X(0.62), Y(0.7));
  ctx.lineTo(X(0.57), Y(1.02));
  ctx.lineTo(X(0.43), Y(1.02));
  ctx.closePath();
  ctx.fillStyle = lining;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = lw * 1.6;
  ctx.stroke();
  ctx.lineWidth = lw;
  ctx.strokeStyle = st.dark ? 'rgba(0,0,0,0.55)' : INK;

  // Pescoço e cabeça.
  ctx.fillStyle = SKIN;
  ctx.fillRect(X(0.44), Y(0.56), X(0.12), Y(0.15));
  const hx = X(0.5), hy = Y(0.46), hrx = X(0.18), hry = Y(0.155);
  ctx.beginPath();
  ctx.ellipse(hx, hy, hrx, hry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Gola.
  if (king) {
    ctx.beginPath();
    ctx.ellipse(X(0.5), Y(0.705), X(0.27), Y(0.045), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#222222';
    for (const x of [0.3, 0.4, 0.5, 0.6, 0.7]) ctx.fillRect(X(x) - lw, Y(0.7) - lw * 1.5, lw * 2, lw * 3);
  } else if (queen) {
    ctx.beginPath();
    ctx.arc(X(0.5), Y(0.64), X(0.12), Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = lw * 1.8;
    ctx.stroke();
    ctx.lineWidth = lw;
    ctx.strokeStyle = st.dark ? 'rgba(0,0,0,0.55)' : INK;
    ctx.beginPath();
    ctx.arc(X(0.5), Y(0.64) + X(0.12), X(0.028), 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(X(0.36), Y(0.695));
    ctx.lineTo(X(0.5), Y(0.79));
    ctx.lineTo(X(0.64), Y(0.695));
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
  }

  // Cabelo / barba.
  ctx.fillStyle = hairColor;
  if (king) {
    ctx.beginPath();
    ctx.moveTo(hx - hrx * 0.98, hy + hry * 0.05);
    ctx.bezierCurveTo(hx - hrx * 1.05, hy + hry * 1.15, hx - hrx * 0.4, hy + hry * 1.75, hx, hy + hry * 1.7);
    ctx.bezierCurveTo(hx + hrx * 0.4, hy + hry * 1.75, hx + hrx * 1.05, hy + hry * 1.15, hx + hrx * 0.98, hy + hry * 0.05);
    ctx.bezierCurveTo(hx + hrx * 0.6, hy + hry * 0.5, hx - hrx * 0.6, hy + hry * 0.5, hx - hrx * 0.98, hy + hry * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Bigode.
    ctx.beginPath();
    ctx.moveTo(hx, hy + hry * 0.45);
    ctx.quadraticCurveTo(hx - hrx * 0.45, hy + hry * 0.35, hx - hrx * 0.55, hy + hry * 0.62);
    ctx.quadraticCurveTo(hx - hrx * 0.2, hy + hry * 0.62, hx, hy + hry * 0.55);
    ctx.quadraticCurveTo(hx + hrx * 0.2, hy + hry * 0.62, hx + hrx * 0.55, hy + hry * 0.62);
    ctx.quadraticCurveTo(hx + hrx * 0.45, hy + hry * 0.35, hx, hy + hry * 0.45);
    ctx.fill();
  } else {
    // Franja.
    ctx.beginPath();
    ctx.moveTo(hx - hrx * 1.02, hy + hry * 0.1);
    ctx.bezierCurveTo(hx - hrx * 1.05, hy - hry * 1.25, hx + hrx * 1.05, hy - hry * 1.25, hx + hrx * 1.02, hy + hry * 0.1);
    ctx.bezierCurveTo(hx + hrx * 0.7, hy - hry * 0.45, hx - hrx * 0.2, hy - hry * 0.6, hx - hrx * 1.02, hy + hry * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Rosto.
  ctx.fillStyle = '#3A2A20';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(hx + s * hrx * 0.38, hy + hry * 0.02, hrx * 0.09, hry * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + s * hrx * 0.55, hy - hry * 0.2);
    ctx.quadraticCurveTo(hx + s * hrx * 0.38, hy - hry * 0.3, hx + s * hrx * 0.2, hy - hry * 0.2);
    ctx.strokeStyle = '#3A2A20';
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,110,110,0.35)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + s * hrx * 0.55, hy + hry * 0.3, hrx * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!king) {
    ctx.beginPath();
    ctx.moveTo(hx - hrx * 0.25, hy + hry * 0.5);
    ctx.quadraticCurveTo(hx, hy + hry * (queen ? 0.72 : 0.68), hx + hrx * 0.25, hy + hry * 0.5);
    ctx.strokeStyle = queen ? '#B23A48' : '#3A2A20';
    ctx.lineWidth = lw * 1.3;
    ctx.stroke();
    ctx.lineWidth = lw;
  }

  // Coroa, tiara ou boina.
  const jewel = red ? ROYAL : '#C62828';
  if (king) drawCrown(ctx, 13, hx, hy - hry * 0.72, hrx * 2.05, GOLD, jewel);
  else if (queen) drawCrown(ctx, 12, hx, hy - hry * 0.78, hrx * 1.9, GOLD, jewel);
  else drawCrown(ctx, 11, hx, hy - hry * 0.62, hrx * 2.15, lining, jewel);

  // Naipe no peito.
  ctx.beginPath();
  ctx.arc(X(0.5), Y(0.885), X(0.09), 0, Math.PI * 2);
  ctx.fillStyle = st.dark ? '#1F2536' : '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = lw * 1.5;
  ctx.stroke();
  drawSuit(ctx, card.suit, X(0.5), Y(0.885), X(0.12), st.dark ? color : (red ? '#C62828' : '#1B1B1B'));
  ctx.restore();

  roundRect(ctx, fx, fy, fw, fh, r * 0.6);
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = st.dark ? color : GOLD_DARK;
  ctx.lineWidth = Math.max(1.5, w * 0.012);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- versos

/** Gerador pseudoaleatório fixo (o desenho sai igual sempre). */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function damask(base, light) {
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    const s = w * 0.3;
    ctx.fillStyle = light;
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(1, w * 0.01);
    for (let row = -1; row * s * 0.8 < h + s; row++) {
      for (let col = -1; col * s < w + s; col++) {
        const cx = x + col * s + (row % 2 ? s / 2 : 0), cy = y + row * s * 0.8;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * s * 0.17, cy + Math.sin(a) * s * 0.17, s * 0.13, s * 0.05, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
        ctx.globalAlpha = 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  };
}

function plaid(base) {
  return (ctx, x, y, w, h) => {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, lighten(base, 0.12));
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const step = w * 0.22;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(Math.PI / 4);
    const L = w + h;
    for (let d = -L; d < L; d += step) {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(d, -L, step * 0.45, 2 * L);
      ctx.fillRect(-L, d, 2 * L, step * 0.45);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(d + step * 0.6, -L, step * 0.08, 2 * L);
      ctx.fillRect(-L, d + step * 0.6, 2 * L, step * 0.08);
    }
    ctx.restore();
  };
}

function waves(base, line) {
  return (ctx, x, y, w, h) => {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, lighten(base, 0.15));
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, w * 0.018);
    const step = h * 0.055, amp = h * 0.018, len = w * 0.32;
    for (let k = 0, yy = y; yy < y + h + step; yy += step, k++) {
      ctx.globalAlpha = k % 2 ? 0.35 : 0.6;
      ctx.beginPath();
      for (let xx = x - len; xx <= x + w + len; xx += w * 0.02) {
        const v = yy + Math.sin((xx - x) / len * Math.PI * 2 + k * 0.9) * amp;
        if (xx === x - len) ctx.moveTo(xx, v);
        else ctx.lineTo(xx, v);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
}

function suitPattern(base) {
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    const s = w * 0.2;
    let k = 0;
    for (let row = 0; row * s * 0.75 < h + s; row++) {
      for (let col = -1; col * s < w + s; col++, k++) {
        const cx = x + col * s + (row % 2 ? s / 2 : 0), cy = y + row * s * 0.75;
        drawSuit(ctx, (row + col * 3 + 8) % 4, cx, cy, s * 0.42, 'rgba(255,255,255,0.22)');
      }
    }
  };
}

function mandala(base, ink) {
  return (ctx, x, y, w, h) => {
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, h * 0.6);
    g.addColorStop(0, lighten(base, 0.2));
    g.addColorStop(1, base);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = Math.max(1, w * 0.01);
    const flower = (cx, cy, R, n) => {
      for (const [rr, k] of [[1, n], [0.68, n], [0.4, n / 2]]) {
        for (let i = 0; i < k; i++) {
          const a = i * Math.PI * 2 / k + (rr === 0.68 ? Math.PI / k : 0);
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * R * rr * 0.62, cy + Math.sin(a) * R * rr * 0.62, R * rr * 0.36, R * rr * 0.13, a, 0, Math.PI * 2);
          ctx.globalAlpha = 0.6;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    flower(x + w / 2, y + h / 2, w * 0.42, 12);
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) flower(cx, cy, w * 0.3, 10);
  };
}

function sunset() {
  return (ctx, x, y, w, h) => {
    const sky = ctx.createLinearGradient(x, y, x, y + h * 0.62);
    sky.addColorStop(0, '#3B2C6B');
    sky.addColorStop(0.55, '#E0567A');
    sky.addColorStop(1, '#FFB25B');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h * 0.62);
    const sea = ctx.createLinearGradient(x, y + h * 0.62, x, y + h);
    sea.addColorStop(0, '#7A3E78');
    sea.addColorStop(1, '#2A2350');
    ctx.fillStyle = sea;
    ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h * 0.62);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.62, w * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#FFE08A';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,224,138,0.55)';
    for (let i = 0; i < 9; i++) {
      const yy = y + h * (0.65 + i * 0.035), ww = w * (0.5 - i * 0.045);
      ctx.fillRect(x + w / 2 - ww / 2, yy, ww, Math.max(1, h * 0.008));
    }
    // Duas gaivotas.
    ctx.strokeStyle = 'rgba(40,20,50,0.7)';
    ctx.lineWidth = Math.max(1, w * 0.012);
    for (const [bx, by, s] of [[0.28, 0.22, 0.07], [0.4, 0.3, 0.05]]) {
      ctx.beginPath();
      ctx.moveTo(x + w * (bx - s), y + h * by);
      ctx.quadraticCurveTo(x + w * (bx - s / 2), y + h * (by - 0.025), x + w * bx, y + h * by);
      ctx.quadraticCurveTo(x + w * (bx + s / 2), y + h * (by - 0.025), x + w * (bx + s), y + h * by);
      ctx.stroke();
    }
  };
}

function starryNight() {
  return (ctx, x, y, w, h) => {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#0B1640');
    g.addColorStop(1, '#27408B');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const rnd = seeded(7);
    for (let i = 0; i < 70; i++) {
      const sx = x + rnd() * w, sy = y + rnd() * h * 0.85, r = w * (0.006 + rnd() * 0.012);
      ctx.globalAlpha = 0.5 + rnd() * 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Lua crescente.
    const mx = x + w * 0.66, my = y + h * 0.26, mr = w * 0.17;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF3C4';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#122057';
    ctx.fill();
    // Morros.
    ctx.fillStyle = '#0A1233';
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + h * 0.86);
    ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.76, x + w * 0.6, y + h * 0.86);
    ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.8, x + w, y + h * 0.84);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  };
}

/** Versos desenhados. id fica nas preferências; não mude depois de publicado. */
const BACK_DESIGNS = [
  { id: 'damasco-vermelho', name: 'Damasco vermelho', draw: damask('#A51E2D', 'rgba(255,236,220,0.55)') },
  { id: 'damasco-azul', name: 'Damasco azul', draw: damask('#1D3F8F', 'rgba(220,232,255,0.55)') },
  { id: 'xadrez-azul', name: 'Xadrez azul', draw: plaid('#1E5BC6') },
  { id: 'xadrez-vermelho', name: 'Xadrez vermelho', draw: plaid('#B3262F') },
  { id: 'xadrez-verde', name: 'Xadrez verde', draw: plaid('#23803D') },
  { id: 'xadrez-grafite', name: 'Xadrez grafite', draw: plaid('#33373D') },
  { id: 'ondas', name: 'Ondas', draw: waves('#0E7C86', '#E6FAFA') },
  { id: 'naipes', name: 'Naipes', draw: suitPattern('#5B2C83') },
  { id: 'mandala', name: 'Mandala', draw: mandala('#7A1730', '#F3C969') },
  { id: 'por-do-sol', name: 'Pôr do sol', draw: sunset() },
  { id: 'noite', name: 'Noite estrelada', draw: starryNight() },
];

function backDesign(id) {
  return BACK_DESIGNS.find(d => d.id === id) || null;
}

function renderDesignBack(width, height, design) {
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
  ctx.save();
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.6);
  ctx.clip();
  design.draw(ctx, inset, inset, w - 2 * inset, h - 2 * inset);
  ctx.restore();
  roundRect(ctx, inset, inset, w - 2 * inset, h - 2 * inset, r * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(1.5, w * 0.02);
  ctx.stroke();
  return cv;
}
