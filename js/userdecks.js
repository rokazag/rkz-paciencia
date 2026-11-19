'use strict';
// Baralhos importados de um arquivo (.rkzb, gerado por tools/build_web.py --bundle).
// Ficam guardados só neste aparelho (Cache API), nunca no site: assim os baralhos de
// arte de terceiros não são publicados. Formato do arquivo:
//   "RKZB1\n" | tamanho do índice (4 bytes, little-endian) | índice JSON | arquivos em sequência
// índice: { decks: [{id, name}], backs: n, files: [{name, type, size}] }

const USER_DECKS_CACHE = 'user-decks';
const BUNDLE_MAGIC = 'RKZB1\n';
const userDecks = { index: null, urls: {} };

/** Endereço de um arquivo de baralho: o importado, se houver, ou o do site. */
function deckUrl(name) {
  return userDecks.urls[name] || 'decks/' + name;
}

function userDeckKey(name) {
  return new URL('user-decks/' + name, location.href).href;
}

function clearUserDeckUrls() {
  for (const u of Object.values(userDecks.urls)) URL.revokeObjectURL(u);
  userDecks.urls = {};
  userDecks.index = null;
}

/** Lê os baralhos importados antes; devolve o índice ou null. */
async function loadUserDecks() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(USER_DECKS_CACHE);
    const r = await cache.match(userDeckKey('index.json'));
    if (!r) return null;
    const index = await r.json();
    const urls = {};
    for (const f of index.files) {
      const resp = await cache.match(userDeckKey(f.name));
      if (!resp) return null;
      urls[f.name] = URL.createObjectURL(await resp.blob());
    }
    clearUserDeckUrls();
    userDecks.urls = urls;
    userDecks.index = index;
    return index;
  } catch (e) {
    return null;
  }
}

/** Importa um arquivo .rkzb; devolve o índice. Lança Error com mensagem para o usuário. */
async function importDeckBundle(file) {
  if (!('caches' in window)) throw new Error('Este navegador não permite guardar os baralhos.');
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const magic = new TextDecoder().decode(bytes.subarray(0, BUNDLE_MAGIC.length));
  if (magic !== BUNDLE_MAGIC || bytes.length < BUNDLE_MAGIC.length + 4) {
    throw new Error('Este arquivo não é um arquivo de baralhos do Rkz Paciência.');
  }
  const view = new DataView(buf);
  const headLen = view.getUint32(BUNDLE_MAGIC.length, true);
  let pos = BUNDLE_MAGIC.length + 4;
  let index;
  try {
    index = JSON.parse(new TextDecoder().decode(bytes.subarray(pos, pos + headLen)));
  } catch (e) {
    throw new Error('O arquivo de baralhos está danificado.');
  }
  pos += headLen;
  const total = index.files.reduce((s, f) => s + f.size, 0);
  if (pos + total !== bytes.length) throw new Error('O arquivo de baralhos está incompleto.');

  await caches.delete(USER_DECKS_CACHE);
  const cache = await caches.open(USER_DECKS_CACHE);
  for (const f of index.files) {
    const blob = new Blob([bytes.subarray(pos, pos + f.size)], { type: f.type });
    pos += f.size;
    await cache.put(userDeckKey(f.name), new Response(blob, { headers: { 'Content-Type': f.type } }));
  }
  await cache.put(userDeckKey('index.json'), new Response(JSON.stringify(index),
    { headers: { 'Content-Type': 'application/json' } }));
  // Pede ao navegador para não apagar estes dados quando faltar espaço.
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* opcional */ }
  const loaded = await loadUserDecks();
  if (!loaded) throw new Error('Não deu para guardar os baralhos neste aparelho.');
  return loaded;
}

async function removeUserDecks() {
  clearUserDeckUrls();
  try { await caches.delete(USER_DECKS_CACHE); } catch (e) { /* nada a apagar */ }
}
