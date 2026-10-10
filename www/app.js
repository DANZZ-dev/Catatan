'use strict';

/* ============ Util ============ */
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const wc = t => (String(t || '').trim().match(/\S+/g) || []).length;
const go = h => { location.hash = h; };

function ago(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' menit lalu';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' jam lalu';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' hari lalu';
  return new Date(t).toLocaleDateString('id-ID');
}

let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
}

function dialog({ title, body = '', input, value = '', ok = 'OK', cancel = 'Batal', danger = false, hideCancel = false, extra = '' }) {
  return new Promise(res => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ''}${input !== undefined ? `<input id="dlgIn" value="${esc(value)}" placeholder="${esc(input)}">` : ''}<div class="row">${hideCancel ? '' : `<button class="btn ghost" data-r="0">${esc(cancel)}</button>`}${extra ? `<button class="btn alt" data-r="x">${esc(extra)}</button>` : ''}<button class="btn ${danger ? 'danger' : ''}" data-r="1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(m);
    const inp = m.querySelector('#dlgIn');
    if (inp) { inp.focus(); inp.onkeydown = e => { if (e.key === 'Enter') m.querySelector('[data-r="1"]').click(); }; }
    m.onclick = e => {
      const r = e.target.dataset.r;
      if (r === undefined && e.target !== m) return;
      m.remove();
      res(r === '1' ? (inp ? inp.value.trim() : true) : r === 'x' ? 'x' : null);
    };
  });
}

/* ============ Penyimpanan (IndexedDB) ============ */
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('secondbrain', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  get(k) {
    return new Promise((res, rej) => {
      const q = this.db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  },
  set(k, v) {
    return new Promise((res, rej) => {
      const t = this.db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }
};

let S = { spaces: [], settings: { provider: 'anthropic', key: '', model: '', baseUrl: '' } };
let saveT;
function save(now) {
  clearTimeout(saveT);
  const f = () => idb.set('state', S).catch(() => toast('Gagal menyimpan data'));
  if (now) f(); else saveT = setTimeout(f, 400);
}

/* ============ AI ============ */
const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', model: 'claude-sonnet-5-5', base: '' },
  openai: { label: 'OpenAI (ChatGPT)', model: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
  gemini: { label: 'Google Gemini', model: 'gemini-2.5-flash', base: '' },
  custom: { label: 'Lainnya (OpenRouter, Groq, dll)', model: '', base: 'https://openrouter.ai/api/v1' }
};

async function callAI(system, messages, maxTokens = 1800) {
  const st = S.settings;
  const p = st.provider;
  if (!st.key) throw new Error('API key belum diisi. Buka Pengaturan (⚙️) dan masukkan API key.');
  const model = st.model || PROVIDERS[p].model;
  if (!model) throw new Error('Nama model belum diisi di Pengaturan.');
  let r, j;
  if (p === 'anthropic') {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': st.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
    });
    j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Error ' + r.status);
    return (j.content || []).map(c => c.text || '').join('');
  }
  if (p === 'gemini') {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': st.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: maxTokens }
      })
    });
    j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Error ' + r.status);
    return (j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
  }
  const base = (st.baseUrl || PROVIDERS[p].base).replace(/\/$/, '');
  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + st.key },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages] })
  });
  j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Error ' + r.status);
  return j.choices?.[0]?.message?.content || '';
}

// Pastikan peran bergantian & diawali "user" (syarat beberapa API)
function normalize(msgs) {
  const out = [];
  for (const m of msgs) {
    if (!out.length && m.role !== 'user') continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

/* ============ Materi -> konteks AI ============ */
function itemText(it) {
  if (it.type === 'slide') {
    return it.slides.map((s, i) => `[Slide ${i + 1}]\n${s.text || '(tanpa teks)'}${s.notes ? `\n(Catatan pembicara: ${s.notes})` : ''}`).join('\n\n');
  }
  return it.content || '';
}

function chunkText(txt, max = 1400) {
  const out = []; let cur = '';
  for (const para of txt.split(/\n{2,}/)) {
    if (cur && cur.length + para.length > max) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + para;
    while (cur.length > max * 1.5) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out;
}

function buildContext(sp, scope, query) {
  const items = scope ? [scope] : sp.items;
  const chunks = [];
  items.forEach(it => {
    chunkText(itemText(it)).forEach((t, i) => chunks.push({ order: chunks.length, title: it.title, text: t, first: i === 0 }));
  });
  const BUDGET = 14000;
  const total = chunks.reduce((a, c) => a + c.text.length, 0);
  let picked = chunks;
  if (total > BUDGET) {
    const toks = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []))];
    chunks.forEach(c => {
      const low = (c.title + ' ' + c.text).toLowerCase();
      c.score = toks.reduce((a, t) => a + (low.includes(t) ? 1 : 0), 0) + (c.first ? 0.5 : 0);
    });
    let used = 0; picked = [];
    for (const c of chunks.slice().sort((a, b) => b.score - a.score)) {
      if (used + c.text.length > BUDGET) continue;
      picked.push(c); used += c.text.length;
    }
    picked.sort((a, b) => a.order - b.order);
  }
  const list = items.map(i => `- ${i.title} (${i.type === 'slide' ? i.slides.length + ' slide' : 'catatan'})`).join('\n') || '(kosong)';
  const mat = picked.map(c => `### ${c.title}\n${c.text}`).join('\n\n') || '(belum ada materi)';
  const note = total > BUDGET ? '\n(Catatan: materi panjang, hanya bagian paling relevan yang ditampilkan.)' : '';
  return `Kamu adalah "Second Brain", tutor pribadi yang sabar untuk seorang mahasiswa. Jawab dalam bahasa Indonesia (kecuali diminta lain), santai tapi jelas.
Aturan:
- Dasarkan jawaban pada MATERI di bawah. Kalau infonya tidak ada di materi, katakan terus terang, lalu bantu dengan pengetahuan umum dan beri tanda "(di luar materi)".
- Jelaskan bertahap: ringkas dulu, pakai contoh atau analogi, lalu tawarkan detail. Sesekali tes pemahaman dengan 1 pertanyaan singkat.
- Kamu punya INGATAN dari sesi belajar sebelumnya. Lanjutkan dari situ; jangan mengulang dari awal atau menjelaskan ulang hal yang sudah dipahami.
- Format ringkas: poin-poin, **tebal** untuk istilah penting. Hindari tabel dan LaTeX.

<ingatan>
${sp.memory || '(belum ada, ini awal belajar)'}
</ingatan>

<daftar_materi>
${list}
</daftar_materi>

<materi>
${mat}${note}
</materi>`;
}

// Ringkas percakapan jadi "ingatan" jangka panjang (jalan di latar belakang)
async function maybeSummarize(sp) {
  const from = sp.memAt || 0;
  if (sp.messages.length - from < 6) return;
  const at = sp.messages.length;
  const dlg = sp.messages.slice(from).map(m => (m.role === 'user' ? 'Murid: ' : 'AI: ') + m.content.slice(0, 1500)).join('\n');
  try {
    const out = await callAI(
      'Kamu menulis ingatan belajar untuk tutor AI. Balas HANYA dengan ringkasan poin-poin berbahasa Indonesia, maksimal 200 kata, berisi: topik yang sudah dibahas, bagian yang murid sudah paham, bagian yang masih bingung atau salah paham, gaya penjelasan yang disukai, dan rencana lanjutan. Gabungkan dengan ingatan lama dan buang yang tidak relevan.',
      [{ role: 'user', content: `INGATAN LAMA:\n${sp.memory || '(kosong)'}\n\nPERCAKAPAN BARU:\n${dlg}` }], 700);
    if (out && out.trim()) { sp.memory = out.trim(); sp.memAt = at; save(true); }
  } catch (e) { /* diam saja, coba lagi di pesan berikutnya */ }
}

/* ============ Markdown mini ============ */
function md(t) {
  let h = esc(t);
  h = h.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`);
  return h.split(/(<pre>[\s\S]*?<\/pre>)/).map(part => {
    if (part.startsWith('<pre>')) return part;
    return part
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/^#{1,4} (.+)$/gm, '<h4>$1</h4>')
      .replace(/^[ \t]*(?:- |\* |• )(.+)$/gm, '<li>$1</li>')
      .replace(/(?:<li>.*<\/li>\n?)+/g, m => `<ul>${m.replace(/\n/g, '')}</ul>`)
      .replace(/<\/h4>\n/g, '</h4>').replace(/<\/ul>\n/g, '</ul>')
      .replace(/\n/g, '<br>');
  }).join('');
}

/* ============ Impor file ============ */
async function importFile(f) {
  const ext = f.name.split('.').pop().toLowerCase();
  const title = f.name.replace(/\.[^.]+$/, '');
  const now = Date.now();
  if (ext === 'pptx') {
    if (!window.JSZip) throw new Error('Pembaca PPTX tidak termuat.');
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    const num = n => +n.match(/(\d+)\.xml$/)[1];
    const slideFiles = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    if (!slideFiles.length) throw new Error('Slide tidak ditemukan di file ini.');
    const parse = async n => {
      const doc = new DOMParser().parseFromString(await zip.file(n).async('string'), 'application/xml');
      return [...doc.getElementsByTagName('a:p')]
        .map(p => [...p.getElementsByTagName('a:t')].map(t => t.textContent).join(''))
        .filter(s => s.trim()).join('\n');
    };
    const slides = [];
    for (const n of slideFiles) {
      const k = num(n), nn = `ppt/notesSlides/notesSlide${k}.xml`;
      slides.push({ text: await parse(n), notes: zip.file(nn) ? await parse(nn) : '' });
    }
    return { id: uid(), type: 'slide', title, slides, created: now, updated: now };
  }
  if (['txt', 'md', 'csv'].includes(ext)) {
    return { id: uid(), type: 'note', title, content: await f.text(), created: now, updated: now };
  }
  if (ext === 'ppt') throw new Error('Format .ppt lama belum didukung. Simpan ulang sebagai .pptx dulu.');
  throw new Error('Format belum didukung. Pakai .pptx, .txt, atau .md.');
}

/* ============ Router ============ */
window.addEventListener('hashchange', route);
function route() {
  const p = (location.hash || '#/').slice(1).split('/').filter(Boolean);
  if (!p.length) return viewHome();
  if (p[0] === 'settings') return viewSettings();
  if (p[0] === 's') {
    const sp = S.spaces.find(x => x.id === p[1]);
    if (!sp) return go('#/');
    if (p[2] === 'i') {
      const it = sp.items.find(x => x.id === p[3]);
      return it ? viewItem(sp, it) : go('#/s/' + sp.id);
    }
    if (p[2] === 'chat') return viewChat(sp, p[3]);
    return viewSpace(sp);
  }
  go('#/');
}

const header = (title, { back, right = '' } = {}) =>
  `<header class="top">${back ? `<a class="ib" href="${back}" aria-label="Kembali">←</a>` : ''}<h1>${title}</h1>${right}</header>`;

/* ============ Beranda ============ */
function viewHome() {
  const rows = S.spaces.map(sp => {
    const last = Math.max(sp.created, ...sp.items.map(i => i.updated), ...sp.messages.map(m => m.t));
    return `<a class="card" href="#/s/${sp.id}"><span class="emo">${sp.emoji}</span><div><b>${esc(sp.name)}</b><small>${sp.items.length} materi · ${ago(last)}</small></div></a>`;
  }).join('');
  const noKey = !S.settings.key ? `<a class="banner" href="#/settings">🔑 Masukkan API key AI dulu di Pengaturan supaya tutor AI bisa dipakai.</a>` : '';
  app.innerHTML = header('Second Brain', { right: '<a class="ib" href="#/settings" aria-label="Pengaturan">⚙️</a>' }) +
    `<main>${noKey}<div class="list">${rows || '<p class="empty">Belum ada ruang. Buat satu per mata kuliah atau topik, lalu isi dengan catatan dan PPT dosen.</p>'}</div></main><button class="fab" id="add">＋ Ruang baru</button>`;
  $('#add').onclick = async () => {
    const name = await dialog({ title: 'Ruang baru', input: 'mis. Basis Data, Kalkulus…', ok: 'Buat' });
    if (!name) return;
    const emojis = ['📘', '🧪', '📐', '💡', '🧬', '📊', '🗂️', '🌍', '⚙️', '📝'];
    const sp = { id: uid(), name, emoji: emojis[S.spaces.length % emojis.length], items: [], messages: [], memory: '', memAt: 0, created: Date.now() };
    S.spaces.unshift(sp); save(true); go('#/s/' + sp.id);
  };
}

/* ============ Ruang ============ */
function viewSpace(sp) {
  const rows = sp.items.slice().sort((a, b) => b.updated - a.updated).map(it =>
    `<a class="card" href="#/s/${sp.id}/i/${it.id}"><span class="emo">${it.type === 'slide' ? '📊' : '📝'}</span><div><b>${esc(it.title || 'Tanpa judul')}</b><small>${it.type === 'slide' ? it.slides.length + ' slide' : wc(it.content) + ' kata'} · ${ago(it.updated)}</small></div></a>`).join('');
  app.innerHTML = header(esc(sp.name), { back: '#/', right: '<button class="ib" id="menu" aria-label="Menu">⋯</button>' }) +
    `<main>
      <a class="hero" href="#/s/${sp.id}/chat"><span>💬</span><div><b>Belajar bareng AI</b><small>${sp.memory ? 'Ingatan tersimpan, lanjut dari terakhir' : 'Tanya, minta penjelasan, atau latihan soal'}</small></div></a>
      <div class="actions"><button class="btn" id="newNote">📝 Catatan baru</button><label class="btn alt">📎 Upload PPT<input type="file" id="file" multiple hidden></label></div>
      <div class="list">${rows || '<p class="empty">Belum ada materi. Tulis catatan atau upload PPT dari dosen.</p>'}</div>
    </main>`;
  $('#newNote').onclick = () => {
    const now = Date.now();
    const it = { id: uid(), type: 'note', title: '', content: '', created: now, updated: now };
    sp.items.push(it); save(true); go(`#/s/${sp.id}/i/${it.id}`);
  };
  $('#file').onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return;
    toast('Membaca file…');
    let last = null, fail = 0;
    for (const f of files) {
      try { last = await importFile(f); sp.items.push(last); } catch (err) { fail++; toast(err.message); await new Promise(r => setTimeout(r, 1500)); }
    }
    save(true);
    if (last && files.length === 1) go(`#/s/${sp.id}/i/${last.id}`);
    else { route(); if (last) toast(`${files.length - fail} file ditambahkan`); }
  };
  $('#menu').onclick = async () => {
    const name = await dialog({ title: 'Ganti nama ruang', input: 'Nama ruang', value: sp.name, ok: 'Simpan' });
    if (name) { sp.name = name; save(true); route(); }
  };
  // hapus ruang lewat tekan lama pada judul
  app.querySelector('h1').oncontextmenu = async e => {
    e.preventDefault();
    if (await dialog({ title: 'Hapus ruang?', body: `"${sp.name}" beserta semua isinya akan dihapus permanen.`, ok: 'Hapus', danger: true })) {
      S.spaces = S.spaces.filter(x => x !== sp); save(true); go('#/');
    }
  };
  // tombol hapus ruang yang mudah ditemukan
  const del = document.createElement('button');
  del.className = 'btn ghost'; del.style.cssText = 'margin-top:24px;width:100%;color:var(--danger)'; del.textContent = '🗑️ Hapus ruang ini';
  del.onclick = () => app.querySelector('h1').oncontextmenu(new Event('x'));
  app.querySelector('main').appendChild(del);
}

/* ============ Item (catatan / slide) ============ */
function viewItem(sp, it) {
  const touch = () => { it.updated = Date.now(); save(); };
  const askBtn = `<a class="btn" href="#/s/${sp.id}/chat/${it.id}">💬 Tanya AI soal ini</a>`;
  let body;
  if (it.type === 'slide') {
    body = `<main class="editor"><input class="title" id="title" value="${esc(it.title)}" placeholder="Judul">${askBtn}<div>${it.slides.map((s, i) =>
      `<article class="slide"><span class="n">${i + 1}</span><div>${s.text ? esc(s.text).replace(/\n/g, '<br>') : '<i>(slide tanpa teks, mungkin hanya gambar)</i>'}${s.notes ? `<p class="note">🗒 ${esc(s.notes)}</p>` : ''}</div></article>`).join('')}</div></main>`;
  } else {
    body = `<main class="editor"><input class="title" id="title" value="${esc(it.title)}" placeholder="Judul catatan"><textarea id="body" placeholder="Tulis catatan di sini…">${esc(it.content)}</textarea>${askBtn}</main>`;
  }
  app.innerHTML = header(it.type === 'slide' ? 'Slide' : 'Catatan', { back: '#/s/' + sp.id, right: '<button class="ib" id="del" aria-label="Hapus">🗑️</button>' }) + body;
  $('#title').oninput = e => { it.title = e.target.value; touch(); };
  if ($('#body')) $('#body').oninput = e => { it.content = e.target.value; touch(); };
  if (!it.title && !it.content && it.type === 'note') $('#title').focus();
  $('#del').onclick = async () => {
    if (await dialog({ title: 'Hapus materi ini?', body: it.title || 'Tanpa judul', ok: 'Hapus', danger: true })) {
      sp.items = sp.items.filter(x => x !== it); save(true); go('#/s/' + sp.id);
    }
  };
}

/* ============ Chat ============ */
function viewChat(sp, itemId) {
  const scope = itemId ? sp.items.find(i => i.id === itemId) : null;
  const back = scope ? `#/s/${sp.id}/i/${scope.id}` : '#/s/' + sp.id;
  app.innerHTML = header('AI · ' + esc(scope ? scope.title || 'Catatan' : sp.name), { back, right: '<button class="ib" id="menu" aria-label="Menu">⋯</button>' }) +
    `<div class="chat" id="msgs"></div><div class="composer"><div class="chips" id="chips"></div><div class="inputrow"><textarea id="q" rows="1" placeholder="Tanya apa saja…"></textarea><button class="send" id="send" aria-label="Kirim">➤</button></div></div>`;

  const msgs = $('#msgs'), q = $('#q'), sendBtn = $('#send');
  let busy = false;

  function draw(extra) {
    if (!$('#msgs')) return;
    let h = sp.messages.map(m => `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content) : esc(m.content).replace(/\n/g, '<br>')}</div>`).join('');
    if (!sp.messages.length) h = `<div class="welcome"><b>${scope ? 'Ada yang mau dibahas?' : 'Mulai belajar'}</b>${sp.items.length || scope ? 'AI sudah membaca materi di ruang ini. Pilih saran di bawah atau tanya langsung.' : 'Ruang ini belum punya materi. Tambahkan catatan atau PPT dulu supaya AI bisa membantu.'}</div>`;
    if (extra?.typing) h += `<div class="msg assistant"><span class="dots"><i></i><i></i><i></i></span></div>`;
    if (extra?.error) h += `<div class="msg err">${esc(extra.error)}</div>`;
    msgs.innerHTML = h;
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function send(text) {
    text = (text || '').trim();
    if (busy || !text) return;
    busy = true; sendBtn.disabled = true; q.value = ''; q.style.height = 'auto';
    sp.messages.push({ role: 'user', content: text, t: Date.now() }); save();
    draw({ typing: true });
    try {
      const recentUser = sp.messages.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ');
      const ctx = buildContext(sp, scope, recentUser);
      const hist = normalize(sp.messages.slice(-14).map(m => ({ role: m.role, content: m.content })));
      const out = await callAI(ctx, hist, 2000);
      sp.messages.push({ role: 'assistant', content: out || '(jawaban kosong)', t: Date.now() });
      save(true); draw();
      maybeSummarize(sp);
    } catch (e) {
      draw({ error: e.message || String(e) });
    }
    busy = false; if ($('#send')) sendBtn.disabled = false;
  }

  const chips = scope
    ? ['Jelaskan ringkas', 'Poin pentingnya apa?', 'Buat 5 soal latihan', 'Jelaskan pakai analogi']
    : ['Rangkum semua materi', 'Buat 5 soal kuis', 'Mulai dari mana belajarnya?', 'Lanjutkan yang tadi'];
  $('#chips').innerHTML = chips.map(c => `<button>${esc(c)}</button>`).join('');
  $('#chips').onclick = e => { if (e.target.tagName === 'BUTTON') send(e.target.textContent); };
  sendBtn.onclick = () => send(q.value);
  q.oninput = () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 130) + 'px'; };

  $('#menu').onclick = async () => {
    const ask = await dialog({ title: 'Menu AI', body: 'Ingatan adalah ringkasan otomatis dari sesi belajarmu, jadi AI tidak mulai dari nol.', ok: 'Lihat ingatan', cancel: 'Tutup', extra: 'Hapus chat' });
    if (ask === 'x') {
      if (await dialog({ title: 'Hapus riwayat chat?', body: 'Ingatan AI tetap tersimpan.', ok: 'Hapus', danger: true })) {
        sp.messages = []; sp.memAt = 0; save(true); draw();
      }
    } else if (ask) {
      const resetMem = await dialog({ title: '🧠 Ingatan AI', body: sp.memory || 'Belum ada. Ingatan dibuat otomatis setelah beberapa pesan.', ok: 'Reset ingatan', cancel: 'Tutup', danger: true });
      if (resetMem && await dialog({ title: 'Reset ingatan?', body: 'AI akan lupa ringkasan belajarmu, tapi chat tetap ada.', ok: 'Reset', danger: true })) {
        sp.memory = ''; sp.memAt = sp.messages.length; save(true); toast('Ingatan direset');
      }
    }
  };
  draw();
}

/* ============ Pengaturan ============ */
function viewSettings() {
  const st = S.settings, p = PROVIDERS[st.provider];
  app.innerHTML = header('Pengaturan', { back: '#/' }) + `<main>
    <div class="field"><label for="prov">Penyedia AI</label><select id="prov">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === st.provider ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
    <div class="field"><label for="key">API key</label><div class="keyrow"><input id="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(st.key)}" placeholder="Tempel API key di sini"><button class="btn alt" id="eye" type="button">👁️</button></div><small>Disimpan hanya di HP ini dan dikirim langsung ke penyedia AI.</small></div>
    <div class="field"><label for="model">Model</label><input id="model" value="${esc(st.model)}" placeholder="${esc(p.model || 'mis. meta-llama/llama-3.3-70b-instruct')}" autocapitalize="off" spellcheck="false"><small>Kosongkan untuk memakai model bawaan${p.model ? ` (${esc(p.model)})` : ''}.</small></div>
    <div class="field" id="baseBox" ${st.provider === 'openai' || st.provider === 'custom' ? '' : 'hidden'}><label for="base">Base URL</label><input id="base" value="${esc(st.baseUrl)}" placeholder="${esc(p.base)}" autocapitalize="off" spellcheck="false"><small>Alamat API yang kompatibel dengan OpenAI. Kosongkan untuk bawaan.</small></div>
    <button class="btn" id="test" style="width:100%">Tes koneksi</button>
    <div class="section">Data</div>
    <p style="color:var(--muted);font-size:.9rem;margin-top:0">Semua catatan, PPT, dan ingatan AI tersimpan di HP ini. Kalau aplikasi di-uninstall, datanya ikut hilang.</p>
    <button class="btn ghost" id="wipe" style="width:100%;color:var(--danger)">Hapus semua data</button>
  </main>`;
  const upd = () => { st.provider = $('#prov').value; st.key = $('#key').value.trim(); st.model = $('#model').value.trim(); st.baseUrl = $('#base').value.trim(); save(); };
  $('#prov').onchange = () => {
    st.provider = $('#prov').value; st.model = ''; st.baseUrl = ''; save(true); viewSettings();
  };
  ['key', 'model', 'base'].forEach(id => $('#' + id).oninput = upd);
  $('#eye').onclick = () => { const k = $('#key'); k.type = k.type === 'password' ? 'text' : 'password'; };
  $('#test').onclick = async () => {
    upd(); const b = $('#test'); b.disabled = true; b.textContent = 'Menguji…';
    try {
      const out = await callAI('Balas singkat.', [{ role: 'user', content: 'Balas dengan kata: siap' }], 20);
      toast('Berhasil: ' + (out || 'tersambung').slice(0, 40));
    } catch (e) { await dialog({ title: 'Gagal tersambung', body: e.message, ok: 'OK', hideCancel: true }); }
    b.disabled = false; b.textContent = 'Tes koneksi';
  };
  $('#wipe').onclick = async () => {
    if (await dialog({ title: 'Hapus semua data?', body: 'Semua ruang, catatan, PPT, dan ingatan AI akan hilang. API key tetap disimpan.', ok: 'Hapus semua', danger: true })) {
      S.spaces = []; save(true); toast('Data dihapus'); go('#/');
    }
  };
}

/* ============ Mulai ============ */
(async function init() {
  try {
    await idb.open();
    const saved = await idb.get('state');
    if (saved) S = { ...S, ...saved, settings: { ...S.settings, ...(saved.settings || {}) } };
  } catch (e) { toast('Penyimpanan tidak tersedia'); }
  route();
})();
