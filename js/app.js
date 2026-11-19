'use strict';
// Tela principal: barra de botões, menus, configurações e estatísticas (MainActivity.java).

const APP_NAME = 'Rkz Paciência';
const APP_VERSION = '1.7.2';
const DEVELOPER = 'Desenvolvido por Rodolfo Pimenta Casagrande';

const TABLE_COLORS = ['#1E6B3A', '#16507A', '#7A1F2B', '#4A2C6B', '#3E4A52', '#6B4A1E'];
const BACK_COLORS = ['#1565C0', '#C62828', '#2E7D32', '#6A1B9A', '#37474F', '#EF6C00'];
const BAR_IDLE_MS = 10000;
const THUMB_W = 120, THUMB_H = 174, THUMB_COLS = 10;

const RULES_TEXT = 'Objetivo: levar todas as cartas para as quatro pilhas das fundações (ao lado da linha branca), separadas por naipe, do Ás até o Rei.\n\n'
  + '• Na mesa, coloque cartas em ordem decrescente, alternando vermelho e preto (ex.: 7 vermelho sobre 8 preto).\n\n'
  + '• Só um Rei (ou uma sequência começando com Rei) pode ocupar uma coluna vazia.\n\n'
  + '• Toque no monte (canto superior direito, ou esquerdo no modo canhoto) para virar cartas. Quando acabar, toque de novo para recomeçar o monte.\n\n'
  + '• Toque (ou dê dois toques, conforme as Configurações) numa carta para ela ir sozinha ao melhor lugar, ou arraste com o dedo. Se a carta tremer, é porque ela não cabe ali.\n\n'
  + '• Use Dica quando não souber o que fazer e Desfazer para voltar uma jogada.\n\n'
  + '• Quando todas as cartas estiverem viradas, o jogo termina sozinho.\n\n'
  + '• Nem toda partida tem solução. Se não houver mais jogadas úteis, o app avisa e você escolhe entre um novo jogo, recomeçar ou continuar tentando.\n\n'
  + '• Cada partida tem um número (no rodapé e no Menu). Pelo Menu dá para jogar de novo a mesma partida digitando o número.';

const INSTALL_TEXT = 'Para usar como aplicativo no iPhone: abra este endereço no Safari, toque em Compartilhar (o quadrado com a seta para cima) e depois em "Adicionar à Tela de Início".';

// ---------------------------------------------------------------- preferências

const prefs = {
  key(k) { return 'rkz_' + k; },
  get(k, def) {
    try {
      const v = localStorage.getItem(this.key(k));
      return v === null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  },
  set(k, v) {
    try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch (e) { /* sem armazenamento */ }
  },
  remove(k) {
    try { localStorage.removeItem(this.key(k)); } catch (e) { /* idem */ }
  },
  keys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rkz_')) out.push(k.slice(4));
      }
    } catch (e) { /* idem */ }
    return out;
  },
};

// ---------------------------------------------------------------- utilidades de tela

const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const two = n => String(n).padStart(2, '0');
  if (s >= 3600) return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

let toastTimer = 0;
function toast(text, long) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), long ? 3500 : 2000);
}

/** Texto com parágrafos; nos que começam com "• " as linhas seguintes ficam alinhadas ao texto. */
function messageBlock(text) {
  const box = el('div', 'msg');
  for (const para of String(text).split('\n')) {
    if (para === '') continue;
    const p = el('p', para.startsWith('• ') ? 'bullet' : '');
    if (para.startsWith('• ')) {
      p.appendChild(el('span', 'dot', '•'));
      p.appendChild(document.createTextNode(para.slice(2)));
    } else {
      p.textContent = para;
    }
    box.appendChild(p);
  }
  return box;
}

let openDialogs = 0;

/**
 * Diálogo no estilo do AlertDialog do Android.
 * opts: title, message, content (elemento), positive/negative/neutral: [texto, ação],
 * cancelable (padrão true), onDismiss. Uma ação que devolve false mantém o diálogo aberto.
 */
function dialog(opts) {
  const back = el('div', 'dlg-back');
  const box = el('div', 'dlg');
  back.appendChild(box);
  if (opts.title) box.appendChild(el('h2', '', opts.title));
  const body = el('div', 'dlg-body');
  box.appendChild(body);
  let msgEl = null;
  if (opts.message) {
    msgEl = messageBlock(opts.message);
    body.appendChild(msgEl);
  }
  if (opts.content) body.appendChild(opts.content);

  let showing = true;
  const handle = {
    get showing() { return showing; },
    close() {
      if (!showing) return;
      showing = false;
      back.remove();
      openDialogs--;
      app.onDialogClosed();
      if (opts.onDismiss) opts.onDismiss();
    },
    setMessage(text) {
      const m = messageBlock(text);
      if (msgEl) msgEl.replaceWith(m);
      else body.prepend(m);
      msgEl = m;
    },
  };

  const btns = el('div', 'dlg-btns');
  const add = (spec, cls) => {
    if (!spec) return;
    const b = el('button', cls, spec[0]);
    b.addEventListener('click', () => {
      const keep = spec[1] ? spec[1]() === false : false;
      if (!keep) handle.close();
    });
    btns.appendChild(b);
  };
  add(opts.neutral, 'neutral');
  btns.appendChild(el('span', 'spacer'));
  add(opts.negative, 'negative');
  add(opts.positive, 'positive');
  if (opts.neutral || opts.negative || opts.positive) box.appendChild(btns);

  if (opts.cancelable !== false) {
    back.addEventListener('click', e => { if (e.target === back) handle.close(); });
  }
  openDialogs++;
  app.onDialogOpened();
  document.body.appendChild(back);
  return handle;
}

/**
 * Tabela "rótulo ... valor": rótulos à esquerda, valores alinhados à direita.
 * Uma linha null vira um espaço entre grupos. intro/outro (opcionais) ficam centralizados.
 */
function infoTable(intro, rows, outro) {
  const box = el('div', 'info-table');
  if (intro) box.appendChild(el('div', 'centered big', intro));
  for (const row of rows) {
    if (!row) {
      box.appendChild(el('div', 'gap'));
      continue;
    }
    const line = el('div', 'row');
    line.appendChild(el('span', 'k', row[0]));
    line.appendChild(el('span', 'v', row[1]));
    box.appendChild(line);
  }
  if (outro) box.appendChild(el('div', 'centered outro', outro));
  return box;
}

function label(text) { return el('div', 'set-label', text); }

let radioSeq = 0;
/** Grupo de opções; devolve { node, value() }. */
function radios(options, selected) {
  const name = 'r' + (++radioSeq);
  const node = el('div', 'radios');
  const inputs = [];
  options.forEach(([value, text]) => {
    const l = el('label', 'radio');
    const i = document.createElement('input');
    i.type = 'radio';
    i.name = name;
    i.checked = value === selected;
    l.appendChild(i);
    l.appendChild(el('span', '', text));
    node.appendChild(l);
    inputs.push([value, i]);
  });
  return { node, value: () => (inputs.find(([, i]) => i.checked) || inputs[0])[0] };
}

function toggle(box, text, checked) {
  const l = el('label', 'switch');
  l.appendChild(el('span', '', text));
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = checked;
  l.appendChild(i);
  l.appendChild(el('span', 'track'));
  box.appendChild(l);
  return i;
}

function swatches(colors, selected) {
  const row = el('div', 'swatches');
  const state = { value: selected };
  const views = colors.map(c => {
    const v = el('button', 'swatch');
    v.style.background = c;
    v.setAttribute('aria-label', 'Cor ' + c);
    v.addEventListener('click', () => { state.value = c; paint(); });
    row.appendChild(v);
    return v;
  });
  const paint = () => views.forEach((v, i) => v.classList.toggle('sel', colors[i] === state.value));
  paint();
  return { node: row, value: () => state.value };
}

/** Fileira rolável de miniaturas (canvas). */
function gallery(thumbs, selected) {
  const scroll = el('div', 'gallery');
  const state = { value: selected };
  const views = thumbs.map((t, i) => {
    const b = el('button', 'thumb');
    b.appendChild(t);
    b.addEventListener('click', () => { state.value = i; paint(); });
    scroll.appendChild(b);
    return b;
  });
  const paint = () => views.forEach((v, i) => v.classList.toggle('sel', i === state.value));
  paint();
  requestAnimationFrame(() => {
    const v = views[state.value];
    if (v) scroll.scrollLeft = Math.max(0, v.offsetLeft - 40);
  });
  return { node: scroll, value: () => state.value };
}

/** Tarefa num worker novo; cancel() encerra a busca na hora. */
function runTask(msg) {
  let worker = null, done = false;
  const promise = new Promise(resolve => {
    try {
      worker = new Worker('js/worker.js');
    } catch (e) {
      resolve(null);
      return;
    }
    worker.onmessage = e => { done = true; worker.terminate(); resolve(e.data); };
    worker.onerror = () => { done = true; worker.terminate(); resolve(null); };
    worker.postMessage(msg);
  });
  return { promise, cancel() { if (worker && !done) { done = true; worker.terminate(); } } };
}

// ---------------------------------------------------------------- app

const app = {
  init() {
    this.sounds = new Sounds();
    this.view = new GameView($('table'), this);
    this.lastTick = now();
    this.visible = document.visibilityState === 'visible';
    this.stuckArmed = true;
    this.stuckTimer = 0;
    this.stuckTask = null;
    this.searching = false;
    this.decks = [{ id: '', name: 'Rkz' }];
    this.backCount = 0;

    $('btn-new').addEventListener('click', () => { this.hideBar(); this.confirmNewGame(null); });
    $('btn-undo').addEventListener('click', () => { this.scheduleHideBar(); this.view.undo(); });
    $('btn-hint').addEventListener('click', () => { this.scheduleHideBar(); this.view.showHint(); });
    $('btn-auto').addEventListener('click', () => { this.hideBar(); this.view.startAutoComplete(); });
    $('btn-menu').addEventListener('click', () => { this.hideBar(); this.showMenu(); });

    this.loadSettings();
    this.game = new Game();
    if (!this.game.load(prefs.get('game', null)) || this.game.won) {
      this.game.deal(newGameNumber(), this.drawCount, null);
    }
    this.view.setGame(this.game);
    this.updateFooter();
    this.applySettings();

    const stage = $('stage');
    const fit = () => {
      const r = stage.getBoundingClientRect();
      this.view.resize(Math.floor(r.width), Math.floor(r.height), window.devicePixelRatio || 1);
    };
    new ResizeObserver(fit).observe(stage);
    window.addEventListener('resize', fit);
    fit();

    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
    setInterval(() => this.tick(), 500);
    this.updateInfo();
    this.scheduleStuckCheck();
    this.loadDeckIndex();

    const launches = prefs.get('launches', 0);
    prefs.set('launches', launches + 1);
    const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone && launches < 3) {
      setTimeout(() => dialog({ title: 'Instalar no iPhone', message: INSTALL_TEXT, positive: ['OK'] }), 600);
    } else if (launches < 3) {
      toast('Toque no verde vazio da mesa para mostrar os botões.', true);
    }
  },

  /**
   * Baralhos de imagem disponíveis: os importados neste aparelho (js/userdecks.js) ou,
   * sem eles, os do site (decks/decks.json, gerado por tools/build_web.py).
   */
  async loadDeckIndex() {
    let j = await loadUserDecks();
    if (!j) {
      try {
        const r = await fetch('decks/decks.json');
        j = r.ok ? await r.json() : null;
      } catch (e) {
        j = null;
      }
    }
    this.decks = [{ id: '', name: 'Rkz' }, ...((j && j.decks) || [])];
    this.backCount = (j && j.backs) || 0;
    // Baralho/verso escolhido que não existe nesta instalação: fica guardado na
    // preferência (volta quando o baralho for importado), mas a mesa usa o padrão.
    const savedDeck = prefs.get('deck', ''), savedBack = prefs.get('back_img', -1);
    this.deckId = this.decks.some(d => d.id === savedDeck) ? savedDeck : '';
    this.backImage = savedBack < this.backCount ? savedBack : -1;
    this.view.art.reset();
    this.applySettings();
  },

  /** Escolhe um arquivo .rkzb e guarda os baralhos dele neste aparelho. */
  pickDeckBundle(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      toast('Importando baralhos…');
      try {
        const idx = await importDeckBundle(file);
        await this.loadDeckIndex();
        toast(`${idx.decks.length} baralhos importados.`, true);
        onDone();
      } catch (e) {
        dialog({ title: 'Importar baralhos', message: e.message || String(e), positive: ['OK'] });
      }
    });
    input.click();
  },

  // ---------------------------------------------------------------- barra de botões

  onTableTapped() {
    if ($('bar').classList.contains('show')) this.hideBar();
    else this.showBar();
  },

  showBar() {
    $('bar').classList.add('show');
    this.scheduleHideBar();
  },

  scheduleHideBar() {
    clearTimeout(this.barTimer);
    this.barTimer = setTimeout(() => this.hideBar(), BAR_IDLE_MS);
  },

  hideBar() {
    clearTimeout(this.barTimer);
    $('bar').classList.remove('show');
  },

  // ---------------------------------------------------------------- tempo e salvamento

  onVisibility() {
    this.accumulateTime();
    this.visible = document.visibilityState === 'visible';
    this.lastTick = now();
    if (!this.visible) this.save();
    else this.applyWakeLock();
  },

  tick() {
    this.accumulateTime();
    this.updateInfo();
    if (++this.tickCount % 20 === 0) this.save();
  },

  accumulateTime() {
    const t = now();
    if (this.visible && this.game.moves > 0 && !this.game.won && openDialogs === 0) {
      this.game.elapsedMs += t - this.lastTick;
    }
    this.lastTick = t;
  },

  save() { prefs.set('game', this.game.save()); },

  onDialogOpened() { this.accumulateTime(); },
  onDialogClosed() { this.lastTick = now(); },

  // ---------------------------------------------------------------- jogo

  gameLabel() { return `nº ${this.game.seed} (comprando ${this.game.drawCount})`; },

  updateFooter() {
    this.view.setFooter(`Partida nº ${this.game.seed} · ${DEVELOPER} · v${APP_VERSION}`);
  },

  startGame(dailyDate) {
    const first = dailyDate ? dailyNumber(dailyDate) : newGameNumber();
    if (!this.onlyWinnable) {
      this.dealGame(dailyDate, first, this.drawCount);
      return;
    }
    if (this.searching) return;
    this.searching = true;
    const draw = this.drawCount;
    const notice = setTimeout(() => toast('Procurando uma partida com solução…'), 500);
    runTask({ type: 'winnable', first, draw }).promise.then(number => {
      clearTimeout(notice);
      this.searching = false;
      this.dealGame(dailyDate, number || first, draw);
    });
  },

  dealGame(dailyDate, number, draw) {
    if (this.game.counted && !this.game.won) prefs.set('st_streak', 0);
    this.game.deal(number, draw, dailyDate);
    this.stuckArmed = true;
    this.view.refresh();
    this.view.animateDeal();
    this.sounds.play(SOUND_DRAW);
    this.updateFooter();
    this.updateInfo();
    this.save();
    this.scheduleStuckCheck();
  },

  restartGame() {
    this.game.restart();
    this.stuckArmed = true;
    this.view.refresh();
    this.view.animateDeal();
    this.updateInfo();
    this.save();
    this.scheduleStuckCheck();
  },

  confirmNewGame(dailyDate) {
    this.confirmThen(() => this.startGame(dailyDate));
  },

  confirmThen(start) {
    if (this.view.isBusy() && !this.game.won) return;
    if (this.game.moves === 0 || this.game.won) {
      start();
      return;
    }
    dialog({
      message: 'Começar um novo jogo? A partida atual será perdida.',
      positive: ['Sim', start],
      negative: ['Não'],
    });
  },

  /** Mostra o número desta partida e deixa jogar outra pelo número. */
  showPlayByNumber() {
    const box = el('div');
    box.appendChild(messageBlock(`Esta partida: ${this.gameLabel()}.\nCada número é sempre a mesma distribuição de cartas.`));
    box.appendChild(label('Jogar a partida de número:'));
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.className = 'num-input';
    input.placeholder = this.game.seed;
    box.appendChild(input);
    const draw = radios([[1, '1 carta (mais fácil)'], [3, '3 cartas (desafio)']], this.game.drawCount);
    box.appendChild(draw.node);
    dialog({
      title: 'Número da partida',
      content: box,
      positive: ['Jogar', () => {
        const number = parseGameNumber(input.value);
        if (number === null) {
          toast('Digite só números.', true);
          return false;
        }
        const d = draw.value();
        this.confirmThen(() => this.dealGame(null, number, d));
        return true;
      }],
      neutral: ['Copiar nº atual', () => {
        const text = `${APP_NAME}, partida ${this.gameLabel()}`;
        const ok = () => toast('Número copiado.');
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, () => toast(text, true));
        else toast(text, true);
      }],
      negative: ['Cancelar'],
    });
  },

  // ---------------------------------------------------------------- sem jogadas úteis

  scheduleStuckCheck() {
    clearTimeout(this.stuckTimer);
    if (this.stuckTask) this.stuckTask.cancel();
    this.stuckTask = null;
    if (!this.warnStuck || this.game.won || this.game.canAutoComplete()) return;
    this.stuckTimer = setTimeout(() => this.runStuckCheck(), 700);
  },

  runStuckCheck() {
    const task = runTask({ type: 'check', state: this.game.stateString(), max: 60000 });
    this.stuckTask = task;
    task.promise.then(result => {
      if (this.stuckTask !== task) return;
      this.stuckTask = null;
      this.onStuckResult(result);
    });
  },

  onStuckResult(result) {
    if (result !== STUCK) {
      if (result !== null) this.stuckArmed = true;
      return;
    }
    if (!this.stuckArmed || this.view.isBusy() || openDialogs > 0) return;
    this.stuckArmed = false;
    this.hideBar();
    const base = `Não há mais jogadas que ajudem a ganhar esta partida (${this.gameLabel()}).\nO que você quer fazer?`;
    let verdictTask = null;
    const shown = dialog({
      title: 'Sem jogadas úteis',
      message: this.checkSolution ? base + '\n' + 'Verificando se esta partida tinha solução…' : base,
      positive: ['Novo jogo', () => this.startGame(null)],
      neutral: ['Recomeçar', () => this.restartGame()],
      negative: ['Continuar tentando'],
      onDismiss: () => { if (verdictTask) verdictTask.cancel(); },
    });
    if (!this.checkSolution) return;
    verdictTask = runTask({ type: 'verdict', number: this.game.seed, draw: this.game.drawCount });
    verdictTask.promise.then(v => {
      if (!shown.showing) return;
      const text = v === SOLVED ? 'Esta partida tinha solução: dava para ganhar com outras jogadas.'
        : v === UNSOLVABLE ? 'Esta partida era impossível: ninguém conseguiria ganhar, nem vendo todas as cartas.'
          : 'Não deu para confirmar se esta partida tinha solução.';
      shown.setMessage(base + '\n' + text);
    });
  },

  // ---------------------------------------------------------------- avisos da mesa

  onGameChanged() {
    const game = this.game;
    if (!game.counted && game.moves > 0) {
      game.counted = true;
      prefs.set('st_played', prefs.get('st_played', 0) + 1);
    }
    if (game.won && !game.winRecorded) {
      game.winRecorded = true;
      const streak = prefs.get('st_streak', 0) + 1;
      prefs.set('st_won', prefs.get('st_won', 0) + 1);
      prefs.set('st_streak', streak);
      prefs.set('st_best_streak', Math.max(streak, prefs.get('st_best_streak', 0)));
      const best = prefs.get('st_best_time', 0);
      if (best === 0 || game.elapsedMs < best) prefs.set('st_best_time', Math.round(game.elapsedMs));
      prefs.set('st_best_score', Math.max(game.score, prefs.get('st_best_score', 0)));
      if (game.isDaily() && !prefs.get('daily_' + game.dailyDate, false)) {
        prefs.set('daily_' + game.dailyDate, true);
        prefs.set('st_daily_won', prefs.get('st_daily_won', 0) + 1);
      }
    }
    this.save();
    if (this.autoComplete && game.canAutoComplete()) this.view.startAutoComplete();
    this.updateInfo();
    this.scheduleStuckCheck();
  },

  onWinAnimationFinished() {
    const game = this.game;
    dialog({
      title: 'Parabéns! 🎉',
      content: infoTable('Você venceu!', [
        ['Tempo', formatTime(game.elapsedMs)],
        ['Jogadas', String(game.moves)],
        ['Pontos', String(game.score)],
      ], game.isDaily() ? 'Desafio do dia concluído! 👑' : null),
      cancelable: false,
      positive: ['Novo jogo', () => this.startGame(null)],
      negative: ['Estatísticas', () => {
        this.startGame(null);
        this.showStats();
      }],
    });
  },

  onSound(s) { this.sounds.play(s); },

  onMessage(text) { toast(text, true); },

  updateInfo() {
    const game = this.game;
    $('tv-score').textContent = `Pontos: ${game.score}`;
    $('tv-time').textContent = game.isDaily() ? 'Desafio do dia · ' + formatTime(game.elapsedMs) : formatTime(game.elapsedMs);
    $('tv-moves').textContent = `Jogadas: ${game.moves}`;
    $('btn-undo').disabled = !game.canUndo() || game.won;
    const showAuto = !this.autoComplete && game.canAutoComplete() && !this.view.isBusy();
    $('btn-auto').hidden = !showAuto;
    if (showAuto && !$('bar').classList.contains('show')) this.showBar();
  },

  // ---------------------------------------------------------------- menu

  showMenu() {
    const dailyDone = prefs.get('daily_' + today(), false);
    const items = [
      ['Novo jogo', () => this.confirmNewGame(null)],
      [dailyDone ? 'Desafio do dia ✓ (concluído)' : 'Desafio do dia', () => this.confirmNewGame(today())],
      ['Recomeçar esta partida', () => this.confirmRestart()],
      ['Número da partida / jogar pelo número', () => this.showPlayByNumber()],
      ['Estatísticas', () => this.showStats()],
      ['Configurações', () => this.showSettings()],
      ['Como jogar', () => this.showRules()],
      ['Sobre', () => this.showAbout()],
    ];
    const list = el('div', 'menu');
    let d = null;
    for (const [text, action] of items) {
      const b = el('button', 'menu-item', text);
      b.addEventListener('click', () => { d.close(); action(); });
      list.appendChild(b);
    }
    d = dialog({ title: `Menu · partida nº ${this.game.seed}`, content: list, negative: ['Fechar'] });
  },

  confirmRestart() {
    if (this.view.isBusy()) return;
    dialog({ message: 'Recomeçar esta partida do início?', positive: ['Sim', () => this.restartGame()], negative: ['Não'] });
  },

  showStats() {
    const played = prefs.get('st_played', 0), won = prefs.get('st_won', 0);
    const best = prefs.get('st_best_time', 0);
    dialog({
      title: 'Estatísticas',
      content: infoTable(null, [
        ['Partidas jogadas', String(played)],
        ['Vitórias', String(won)],
        ['Aproveitamento', (played === 0 ? 0 : Math.floor(won * 100 / played)) + '%'],
        null,
        ['Sequência atual', String(prefs.get('st_streak', 0))],
        ['Melhor sequência', String(prefs.get('st_best_streak', 0))],
        null,
        ['Melhor tempo', best === 0 ? '—' : formatTime(best)],
        ['Maior pontuação', String(prefs.get('st_best_score', 0))],
        null,
        ['Desafios do dia vencidos', String(prefs.get('st_daily_won', 0))],
      ], null),
      positive: ['Fechar'],
      neutral: ['Zerar', () => {
        dialog({
          message: 'Apagar todas as estatísticas?',
          positive: ['Sim', () => { for (const k of prefs.keys()) if (k.startsWith('st_')) prefs.remove(k); }],
          negative: ['Não'],
        });
      }],
    });
  },

  showRules() {
    dialog({ title: 'Como jogar', message: RULES_TEXT, positive: ['OK'] });
  },

  showAbout() {
    dialog({
      title: 'Sobre',
      message: `${APP_NAME}\nVersão ${APP_VERSION} (web)\n${DEVELOPER}\nSem anúncios, sem compras e funciona sem internet.\n${INSTALL_TEXT}`,
      positive: ['OK'],
    });
  },

  // ---------------------------------------------------------------- configurações

  loadSettings() {
    this.drawCount = prefs.get('draw', 1);
    this.tableColor = prefs.get('table', TABLE_COLORS[0]);
    this.backColor = prefs.get('back', BACK_COLORS[0]);
    this.backImage = prefs.get('back_img', -1);
    this.deckId = prefs.get('deck', '');
    this.sound = prefs.get('sound', true);
    this.tapMode = prefs.get('tap_mode', TAP_SINGLE);
    this.leftHanded = prefs.get('left_handed', false);
    this.cardSize = prefs.get('card_size', SIZE_MAX);
    this.landscapeTop = prefs.get('landscape_top', false);
    this.autoComplete = prefs.get('auto', true);
    this.bigText = prefs.get('big', false);
    this.showInfo = prefs.get('info', true);
    this.keepScreen = prefs.get('screen', true);
    this.warnStuck = prefs.get('warn_stuck', true);
    this.checkSolution = prefs.get('check_solution', true);
    this.onlyWinnable = prefs.get('only_winnable', false);
  },

  saveSettings() {
    const s = {
      draw: this.drawCount, table: this.tableColor, back: this.backColor, back_img: this.backImage,
      deck: this.deckId, sound: this.sound, tap_mode: this.tapMode, card_size: this.cardSize,
      left_handed: this.leftHanded, landscape_top: this.landscapeTop, auto: this.autoComplete,
      big: this.bigText, info: this.showInfo, screen: this.keepScreen, warn_stuck: this.warnStuck,
      check_solution: this.checkSolution, only_winnable: this.onlyWinnable,
    };
    for (const k in s) prefs.set(k, s[k]);
  },

  applySettings() {
    this.sounds.enabled = this.sound;
    this.view.setAppearance(this.tableColor, this.backColor, this.bigText, this.deckId, this.backImage);
    this.view.setControls(this.tapMode, this.leftHanded, this.landscapeTop, this.cardSize);
    const dark = darken(this.tableColor);
    document.documentElement.style.setProperty('--table-dark', dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark);
    $('info').hidden = !this.showInfo;
    this.applyWakeLock();
    this.updateInfo();
  },

  /** "Manter a tela ligada" (Screen Wake Lock, quando o navegador tem). */
  applyWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (this.keepScreen && document.visibilityState === 'visible') {
      if (this.wakeLock && !this.wakeLock.released) return;
      navigator.wakeLock.request('screen').then(l => { this.wakeLock = l; }).catch(() => {});
    } else if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  },

  thumbCanvas(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const c = makeCanvas(Math.round(w * dpr), Math.round(h * dpr));
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    return c;
  },

  /** Miniatura da folha thumbs.webp (desenhada quando a folha carregar). */
  sheetThumb(index, w, h) {
    const c = this.thumbCanvas(w, h);
    loadImage(deckUrl('thumbs.webp')).then(img => {
      if (!img) return;
      const x = index % THUMB_COLS * THUMB_W, y = Math.floor(index / THUMB_COLS) * THUMB_H;
      if (x + THUMB_W > img.naturalWidth || y + THUMB_H > img.naturalHeight) return;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, THUMB_W, THUMB_H, 0, 0, c.width, c.height);
    });
    return c;
  },

  showSettings() {
    const box = el('div', 'settings');
    box.appendChild(label('Comprar do monte'));
    const draw = radios([[1, '1 carta (mais fácil)'], [3, '3 cartas (desafio)']], this.drawCount);
    box.appendChild(draw.node);

    box.appendChild(label('Mover a carta tocando nela'));
    const tap = radios([[TAP_SINGLE, 'Com um toque'], [TAP_DOUBLE, 'Com dois toques rápidos'],
      [TAP_OFF, 'Desligado (só arrastando)']], this.tapMode);
    box.appendChild(tap.node);

    box.appendChild(label('Tamanho das cartas'));
    const size = radios([[SIZE_NORMAL, 'Normal'], [SIZE_LARGE, 'Grande (espaços menores)'],
      [SIZE_MAX, 'Máximo (espaços mínimos)']], this.cardSize);
    box.appendChild(size.node);

    const sLeft = toggle(box, 'Modo canhoto (monte à esquerda)', this.leftHanded);
    const sLandTop = toggle(box, 'Na horizontal, pilhas de cima como na vertical', this.landscapeTop);
    const sSound = toggle(box, 'Sons', this.sound);
    const sAuto = toggle(box, 'Concluir automaticamente', this.autoComplete);
    const sWarn = toggle(box, 'Avisar quando não houver mais jogadas úteis', this.warnStuck);
    const sCheck = toggle(box, 'No aviso, verificar se a partida tinha solução', this.checkSolution);
    const sWinnable = toggle(box, 'Novos jogos só com partidas que têm solução', this.onlyWinnable);
    const sBig = toggle(box, 'Letras grandes nas cartas', this.bigText);
    const sInfo = toggle(box, 'Mostrar tempo e pontos', this.showInfo);
    const sScreen = toggle(box, 'Manter a tela ligada', this.keepScreen);

    box.appendChild(label('Cor da mesa'));
    const table = swatches(TABLE_COLORS, this.tableColor);
    box.appendChild(table.node);

    // Baralho: o desenhado pelo app e os de imagem (decks/).
    const tw = 58, th = Math.round(tw * CARD_RATIO);
    const king = new Card(HEARTS * 13 + 12);
    king.faceUp = true;
    const deckThumbs = this.decks.map((d, i) => {
      if (i > 0) return this.sheetThumb(i - 1, tw, th);
      const c = this.thumbCanvas(tw, th);
      c.getContext('2d').drawImage(renderFace(king, c.width, c.height, false), 0, 0);
      return c;
    });
    const deckSel = Math.max(0, this.decks.findIndex(d => d.id === this.deckId));
    box.appendChild(label('Baralho'));
    const deck = gallery(deckThumbs, deckSel);
    box.appendChild(deck.node);

    // Verso: primeiro as cores desenhadas, depois as imagens.
    const backThumbs = [];
    let backSel = 0;
    for (let i = 0; i < BACK_COLORS.length + this.backCount; i++) {
      const img = i >= BACK_COLORS.length;
      const index = img ? i - BACK_COLORS.length : -1;
      if (img) {
        backThumbs.push(this.sheetThumb(this.decks.length - 1 + index, tw, th));
      } else {
        const c = this.thumbCanvas(tw, th);
        c.getContext('2d').drawImage(renderBack(c.width, c.height, BACK_COLORS[i]), 0, 0);
        backThumbs.push(c);
      }
      if (this.backImage >= 0 ? index === this.backImage : (!img && BACK_COLORS[i] === this.backColor)) backSel = i;
    }
    box.appendChild(label('Verso das cartas'));
    const back = gallery(backThumbs, backSel);
    box.appendChild(back.node);

    // Baralhos extras: ficam só neste aparelho (não estão no site).
    box.appendChild(label('Mais baralhos'));
    const imported = !!userDecks.index;
    box.appendChild(messageBlock(imported
      ? `Baralhos importados neste aparelho: ${userDecks.index.decks.length}.`
      : 'Os outros baralhos ficam num arquivo à parte (RkzPaciencia-baralhos.rkzb). Salve o arquivo no iPhone (app Arquivos) e importe aqui.'));
    const importBtn = el('button', 'wide-btn', imported ? 'Importar de novo' : 'Importar arquivo de baralhos');
    importBtn.addEventListener('click', () => this.pickDeckBundle(() => { settings.close(); this.showSettings(); }));
    box.appendChild(importBtn);
    if (imported) {
      const removeBtn = el('button', 'wide-btn secondary', 'Remover baralhos importados');
      removeBtn.addEventListener('click', () => dialog({
        message: 'Remover os baralhos importados deste aparelho?',
        positive: ['Sim', () => {
          removeUserDecks().then(() => this.loadDeckIndex()).then(() => { settings.close(); this.showSettings(); });
        }],
        negative: ['Não'],
      }));
      box.appendChild(removeBtn);
    }

    const settings = dialog({
      title: 'Configurações',
      content: box,
      positive: ['OK', () => {
        this.drawCount = draw.value();
        this.sound = sSound.checked;
        this.tapMode = tap.value();
        this.cardSize = size.value();
        this.leftHanded = sLeft.checked;
        this.landscapeTop = sLandTop.checked;
        this.autoComplete = sAuto.checked;
        this.warnStuck = sWarn.checked;
        this.checkSolution = sCheck.checked;
        this.onlyWinnable = sWinnable.checked;
        this.bigText = sBig.checked;
        this.showInfo = sInfo.checked;
        this.keepScreen = sScreen.checked;
        this.tableColor = table.value();
        this.deckId = this.decks[deck.value()].id;
        if (back.value() < BACK_COLORS.length) {
          this.backColor = BACK_COLORS[back.value()];
          this.backImage = -1;
        } else {
          this.backImage = back.value() - BACK_COLORS.length;
        }
        this.saveSettings();
        if (this.game.drawCount !== this.drawCount && !this.game.won) {
          // Muda o modo de compra já na partida atual.
          this.game.drawCount = this.drawCount;
          this.view.refresh();
          this.save();
        }
        this.applySettings();
        if (this.autoComplete && this.game.canAutoComplete()) this.view.startAutoComplete();
        this.scheduleStuckCheck();
      }],
      negative: ['Cancelar'],
    });
  },
};
app.tickCount = 0;

// No computador de desenvolvimento o cache offline atrapalharia ver as mudanças (use ?sw=1 para testá-lo).
const devHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !devHost) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('DOMContentLoaded', () => app.init());
