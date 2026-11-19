'use strict';
// Efeitos sonoros curtos (os mesmos .wav do app, gerados por tools/make_sounds.py).
// O iPhone só libera o áudio depois do primeiro toque na tela.

class Sounds {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.buffers = [null, null, null];
    try {
      // Não interrompe a música de outros apps e respeita a chave de silencioso.
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch (e) { /* sem suporte */ }
    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    ['place', 'draw', 'win'].forEach((name, i) => {
      fetch('sounds/' + name + '.wav')
        .then(r => r.arrayBuffer())
        .then(data => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
        .then(buf => { this.buffers[i] = buf; })
        .catch(() => {});
    });
  }

  play(sound) {
    if (!this.enabled || !this.ctx) return;
    const buf = this.buffers[sound === SOUND_DRAW ? 1 : sound === SOUND_WIN ? 2 : 0];
    if (!buf) return;
    try {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.value = sound === SOUND_WIN ? 0.8 : 0.6;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    } catch (e) { /* som é opcional */ }
  }
}
