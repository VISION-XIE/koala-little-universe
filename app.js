import { categories, categoryById, initialRecords, sentiments, matchesQuery, suggestCategory } from './data.js?v=3';
import { loadRecords, persistRecords, readBackup, mergeBackup, validateRecords } from './store.js?v=3';
import { icon, escapeHtml as esc } from './icons.js';

const loaded = loadRecords();
const state = { records: loaded.records, view: 'universe', filter: 'all', query: '', lastCategory: null, saved: !loaded.warning };
const app = document.querySelector('#app');
let toastTimer, hoverTimer, mascotTimer, suggestionIndex = 0;
let editorCategoryTouched = false;
let undoRecord = null;
let hoverSource = null;
const count = id => state.records.filter(record => record.category === id).length;

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Koala的小宇宙首页" data-action="home"><img src="./assets/koala.webp" alt="" width="50" height="50"><span>Koala<span class="brand-zh">的小宇宙</span></span><span class="brand-heart">♥</span></a>
    <nav class="main-nav" aria-label="主导航"><button class="nav-button active" data-action="view" data-view="universe">${icon('orbit')}<span>喜好星球</span></button><button class="nav-button" data-action="view" data-view="records">${icon('book')}<span>所有记录</span></button></nav>
    <div class="header-actions"><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="搜索老大的小喜好…" aria-label="搜索老大的小喜好" autocomplete="off"><kbd>/</kbd></label><button class="button primary add-button" data-action="new">${icon('plus')}<span>记一件小事</span></button></div>
  </header>
  <main id="main"></main>
  <footer class="site-footer"><span class="footer-love">${icon('heart')}偏爱，藏在每个小细节里。</span><button class="save-state" data-action="privacy">${icon('lock')}<span id="save-label">${state.saved ? '已保存在此浏览器' : '暂未保存 · 请导出备份'}</span></button></footer>
  <div id="hover-preview" class="hover-preview" role="tooltip" hidden></div>
  <dialog id="detail-dialog" class="detail-dialog" aria-labelledby="detail-title"></dialog>
  <dialog id="editor-dialog" class="editor-dialog" aria-labelledby="editor-title"></dialog>
  <dialog id="confirm-dialog" class="small-dialog" aria-labelledby="confirm-title"></dialog>
  <dialog id="privacy-dialog" class="small-dialog" aria-labelledby="privacy-title"></dialog>
  <input id="import-file" type="file" accept="application/json,.json" hidden>
`;

function categorySummary(category) {
  const records = state.records.filter(record => record.category === category.id);
  const originals = initialRecords.filter(record => record.category === category.id);
  if (records.length === originals.length && records.every(record => originals.some(original => original.id === record.id && original.title === record.title && original.sentiment === record.sentiment))) return category.summary;
  if (!records.length) return ['还空着，等一个新发现'];
  if (category.id === 'drinks' || category.id === 'snacks') return records.slice(0, 2).map(record => record.title);
  return [records.slice(0, 3).map(record => record.title).join(' · '), records.length > 3 ? `还有 ${records.length - 3} 件小事，点开看看` : '每一个细节，都记得'].filter(Boolean);
}

function renderContent() {
  hidePreview();
  const searching = Boolean(state.query.trim());
  const isRecords = state.view === 'records' || searching;
  document.querySelectorAll('.nav-button').forEach(button => {
    const active = button.dataset.view === (isRecords ? 'records' : 'universe');
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelector('#main').innerHTML = isRecords ? recordsView() : universeView();
  if (!isRecords) bindOrbit();
}

function universeView() {
  const habitCount = count('habits');
  const mbti = state.records.find(record => record.id === 'koala-mbti');
  return `<section class="page-intro"><div><h1>把老大的小喜好，放在心上<span class="title-period">。</span><span class="heading-heart" aria-hidden="true">♥</span></h1><p>每一件小事，都值得被好好记住。</p></div></section>
    <section class="universe" aria-label="Koala 的喜好星球">
      <div class="orbit-line orbit-one" aria-hidden="true"></div><div class="orbit-line orbit-two" aria-hidden="true"></div><div class="orbit-line orbit-three" aria-hidden="true"></div>
      <span class="spark spark-one" aria-hidden="true">✦</span><span class="spark spark-two" aria-hidden="true">✧</span><span class="spark spark-three" aria-hidden="true">♥</span><span class="spark spark-four" aria-hidden="true">✦</span>
      <div class="koala-center"><div id="koala-speech" class="speech" aria-live="polite">今天也要好好吃饭呀！<span>♡</span></div><button class="mascot" data-action="pet" aria-label="摸摸 Koala 的头，发现一个小喜好"><img src="./assets/koala.webp" alt="拿着刀叉、戴着厨师帽的可爱考拉 Koala" width="340" height="340" draggable="false"><span id="pet-hearts" aria-hidden="true"></span></button><div class="koala-name">Koala<span>♥</span>${mbti ? `<button class="profile-chip" data-action="category" data-category="${esc(mbti.category)}" aria-label="查看${esc(mbti.title)}">${esc(mbti.title)}</button>` : ''}</div><p class="pet-hint">点击摸摸头 <span aria-hidden="true">✧</span></p></div>
      ${categories.slice(0, 6).map((category, index) => `<button class="planet-card ${category.color} position-${index}" data-action="category" data-category="${category.id}" aria-label="${category.name}，${count(category.id)} 条记录，点击查看详情" aria-haspopup="dialog"><div class="planet-heading"><span class="category-emoji" aria-hidden="true">${category.emoji}</span><h2>${category.name}</h2><span class="card-count">${count(category.id)}条 ${icon('chevron')}</span></div><div class="planet-summary">${categorySummary(category).map(line => `<p>${esc(line)}</p>`).join('')}</div><span class="card-open">点开看看 ${icon('chevron')}</span></button>`).join('')}
      <button class="habit-button" data-action="${habitCount ? 'category' : 'new'}" data-category="habits">${icon(habitCount ? 'book' : 'plus')}<span>${habitCount ? `生活小习惯 · ${habitCount} 件小事` : '发现一个新习惯'}</span></button>
      <p class="canvas-hint"><span class="desktop-hint">悬停探索喜好，点击收藏细节</span><span class="mobile-hint">点开小星球，看看老大的偏爱</span></p>
    </section>`;
}

function recordsView() {
  const results = state.records.filter(record => (state.filter === 'all' || record.category === state.filter) && matchesQuery(record, state.query));
  const searching = Boolean(state.query.trim());
  return `<section class="page-intro records-intro"><div><h1>${searching ? '找找老大的小喜好' : '关于老大，都记在这里'}<span class="heading-heart" aria-hidden="true">♥</span></h1><p>${searching ? `找到 ${results.length} 条与「${esc(state.query)}」有关的记录` : `${state.records.length} 件被认真记住的小事，和慢慢了解老大的日常。`}</p></div><div class="backup-actions"><button class="button subtle" data-action="export">${icon('download')}导出备份</button><button class="button subtle" data-action="import">${icon('upload')}导入</button></div></section>
    <div class="filters" aria-label="记录分类"><button class="filter ${state.filter === 'all' ? 'selected' : ''}" data-action="filter" data-filter="all" aria-pressed="${state.filter === 'all'}">全部 <span>${state.records.length}</span></button>${categories.map(category => `<button class="filter ${state.filter === category.id ? 'selected' : ''}" data-action="filter" data-filter="${category.id}" aria-pressed="${state.filter === category.id}">${category.emoji} ${category.name} <span>${count(category.id)}</span></button>`).join('')}</div>
    <section class="records-grid" aria-label="喜好记录" aria-live="polite">${results.length ? results.map(record => recordCard(record)).join('') : `<div class="empty-state"><span aria-hidden="true">${searching ? '🔎' : '🌱'}</span><h2>${searching ? '这件小事，还没找到' : '这里等着一个新发现'}</h2><p>${searching ? '换个关键词，或者把这个新发现记下来。' : '老大的小习惯、喜欢的事，都可以从这里开始。'}</p><button class="button primary" data-action="${searching ? 'clear-search' : 'new'}" ${!searching && state.filter !== 'all' ? `data-category="${state.filter}"` : ''}>${icon(searching ? 'search' : 'plus')}${searching ? '清除搜索与筛选' : '记一件小事'}</button></div>`}</section>`;
}

function recordCard(record, detailed = false) {
  const category = categoryById(record.category);
  return `<article class="record-card ${category.color} ${record.order?.length ? 'order-card' : ''}"><div class="record-top"><span class="record-category">${category.emoji} ${category.name}</span><span class="sentiment ${record.sentiment}">${record.sentiment === 'love' ? '♡ ' : ''}${sentiments[record.sentiment]}</span></div><h3>${esc(record.title)}</h3>${record.order?.length ? `<dl class="order-details">${record.order.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : `<p class="record-description">${esc(record.details || '还没有写下具体细节。')}</p>`}${record.note ? `<p class="record-note">${icon('heart')}<span>${esc(record.note)}</span></p>` : ''}<div class="record-bottom"><span class="record-date">${record.updatedAt ? `记于 ${new Date(record.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}` : '用心记住的小事'}</span><div class="record-actions">${record.category === 'drinks' ? `<button class="copy-button" data-action="copy" data-id="${esc(record.id)}" aria-label="复制${esc(record.title)}点单">${icon('copy')}<span>复制点单</span></button>` : ''}<button class="icon-button" data-action="edit" data-id="${esc(record.id)}" aria-label="编辑${esc(record.title)}">${icon('edit')}</button><button class="icon-button danger-hover" data-action="delete" data-id="${esc(record.id)}" aria-label="删除${esc(record.title)}">${icon('trash')}</button></div></div></article>`;
}

function showCategory(id) {
  hidePreview();
  const category = categoryById(id);
  if (!category) return;
  state.lastCategory = id;
  const records = state.records.filter(record => record.category === id);
  const dialog = document.querySelector('#detail-dialog');
  dialog.innerHTML = `<header class="dialog-header ${category.color}"><div><span class="dialog-category-emoji" aria-hidden="true">${category.emoji}</span><h2 id="detail-title">${category.name}</h2><p>${category.id === 'profile' ? '关于老大的了解，都好好记在这里。' : `${records.length} 件小事，都是老大独一份的偏爱。`}</p></div><button class="icon-button close-button" data-action="close" aria-label="关闭详情">${icon('close')}</button></header><div class="detail-content">${records.length ? records.map(record => recordCard(record, true)).join('') : `<div class="empty-state"><span>🌱</span><h3>等你记下第一个小发现</h3></div>`}</div><div class="dialog-footer"><span>慢慢了解，好好记得。</span><button class="button primary" data-action="new" data-category="${id}">${icon('plus')}再记一件</button></div>`;
  if (!dialog.open) dialog.showModal();
}

function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }

function showEditor(record = null, categoryId = '') {
  hidePreview();
  closeDialogs();
  editorCategoryTouched = Boolean(record || categoryId);
  const category = record?.category || categoryId || 'habits';
  const dialog = document.querySelector('#editor-dialog');
  dialog.innerHTML = `<form id="record-form"><header class="dialog-header"><div><span class="form-eyebrow">${icon('heart')} 又多了解老大一点</span><h2 id="editor-title">${record ? '把这件小事，记得更准确' : '记一件小事'}</h2></div><button type="button" class="icon-button close-button" data-action="close" aria-label="关闭编辑">${icon('close')}</button></header><div class="editor-fields"><input type="hidden" name="id" value="${esc(record?.id || '')}"><label class="field"><span>这次发现了什么 <span class="required">*</span></span><input name="title" maxlength="80" required placeholder="比如：下雨天喜欢窝着看电影" value="${esc(record?.title || '')}" autofocus></label><div class="form-row"><label class="field"><span>放在哪颗星球</span><select name="category">${categories.map(item => `<option value="${item.id}" ${category === item.id ? 'selected' : ''}>${item.emoji} ${item.name}</option>`).join('')}</select></label><div class="field sentiment-field"><span>老大的态度</span><select name="sentiment" aria-label="老大的态度">${Object.entries(sentiments).map(([value, label]) => `<option value="${value}" ${(record?.sentiment || (category === 'profile' ? 'profile' : category === 'habits' ? 'habit' : category === 'avoid' ? 'less' : 'love')) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><p id="category-suggestion" class="field-hint" ${editorCategoryTouched ? 'hidden' : ''}>输入标题后，会帮你建议一个分类。</p><label id="details-field" class="field" ${category === 'drinks' ? 'hidden' : ''}><span>记得更具体一点</span><textarea name="details" rows="3" maxlength="3000" placeholder="什么口味、什么场景，或者老大特别在意的细节…">${esc(record?.details || '')}</textarea></label><label id="order-field" class="field" ${category !== 'drinks' ? 'hidden' : ''}><span>老大的专属点单 <span class="optional">每行一项</span></span><textarea name="order" rows="5" maxlength="2600" placeholder="温度：热&#10;甜度：不另外加糖&#10;奶类：巴旦木奶">${esc(record?.order ? record.order.map(pair => pair.join('：')).join('\n') : category === 'drinks' ? record?.details || '' : '')}</textarea><span class="field-hint">例如「冰量：少冰」，保存后就能一键复制点单。</span></label><label class="field"><span>悄悄补充 <span class="optional">选填</span></span><textarea name="note" rows="2" maxlength="1000" placeholder="比如：不怎么吃鸡肉，但手撕鸡是例外。">${esc(record?.note || '')}</textarea></label><p id="form-error" class="form-error" role="alert" hidden></p></div><footer class="dialog-footer"><span>${icon('lock')} 保存到当前浏览器</span><button type="submit" class="button primary">${icon('heart')}${record ? '保存这份了解' : '好好记住'}</button></footer></form>`;
  dialog.showModal();
  const form = dialog.querySelector('form');
  const titleInput = form.elements.title;
  titleInput.addEventListener('input', () => {
    if (editorCategoryTouched || !titleInput.value.trim()) return;
    const suggested = suggestCategory(titleInput.value);
    form.elements.category.value = suggested;
    form.elements.sentiment.value = suggested === 'profile' ? 'profile' : suggested === 'avoid' ? 'less' : suggested === 'habits' ? 'habit' : 'love';
    dialog.querySelector('#category-suggestion').textContent = `帮你放到「${categoryById(suggested).name}」，也可以自己调整。`;
    updateEditorFields(form);
  });
  form.elements.category.addEventListener('change', () => {
    editorCategoryTouched = true;
    dialog.querySelector('#category-suggestion').hidden = true;
    if (form.elements.category.value === 'profile') form.elements.sentiment.value = 'profile';
    else if (form.elements.category.value === 'habits') form.elements.sentiment.value = 'habit';
    else if (form.elements.category.value === 'avoid') form.elements.sentiment.value = 'less';
    updateEditorFields(form);
  });
  form.addEventListener('submit', saveForm);
}

function updateEditorFields(form) {
  const drinks = form.elements.category.value === 'drinks';
  document.querySelector('#details-field').hidden = drinks;
  document.querySelector('#order-field').hidden = !drinks;
}

function saveForm(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const existing = state.records.find(record => record.id === data.get('id'));
  const title = data.get('title').trim();
  const now = new Date().toISOString();
  let order;
  if (data.get('category') === 'drinks') {
    order = data.get('order').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const separator = line.search(/[:：]/);
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : ['偏好', line];
    });
  }
  const record = { id: existing?.id || crypto.randomUUID(), title, category: data.get('category'), sentiment: data.get('sentiment'), details: order ? order.map(pair => pair[1]).join(' / ') : data.get('details').trim(), note: data.get('note').trim(), createdAt: existing?.createdAt || now, updatedAt: now, ...(order?.length ? { order } : {}) };
  try { validateRecords([record]); } catch {
    const error = document.querySelector('#form-error');
    error.textContent = !title ? '给这件小事起个名字吧。' : '每项点单最多 200 字、总共最多 12 项，请精简后再保存。';
    error.hidden = false;
    return;
  }
  const next = existing ? state.records.map(item => item.id === existing.id ? record : item) : [...state.records, record];
  if (next.length > 2000) { notify('当前记录已达 2000 条，请先导出整理。'); return; }
  state.records = next;
  const saved = persist();
  closeDialogs();
  renderContent();
  notify(saved ? existing ? '这份了解，已经更新好了 ♡' : '又多了解老大一点，记住啦 ♡' : '记录暂存在页面中，请立刻导出备份', !saved ? { label: '导出', action: 'export' } : null);
}

function persist() {
  state.saved = persistRecords(state.records);
  document.querySelector('#save-label').textContent = state.saved ? '已保存在此浏览器' : '暂未保存 · 请导出备份';
  return state.saved;
}

function confirmDelete(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const dialog = document.querySelector('#confirm-dialog');
  dialog.innerHTML = `<div class="small-dialog-body"><span class="small-illustration" aria-hidden="true">🍃</span><h2 id="confirm-title">放下这件小事？</h2><p>「${esc(record.title)}」会从记录里移除。删除后还可以立即撤销。</p></div><div class="dialog-footer"><button class="button subtle" data-action="close">再留一会儿</button><button class="button delete-button" data-action="confirm-delete" data-id="${esc(id)}">确认删除</button></div>`;
  dialog.showModal();
}

function deleteRecord(id) {
  undoRecord = { record: state.records.find(item => item.id === id), index: state.records.findIndex(item => item.id === id) };
  if (!undoRecord.record) return;
  state.records = state.records.filter(item => item.id !== id);
  const saved = persist();
  document.querySelector('#confirm-dialog').close();
  if (document.querySelector('#detail-dialog').open) showCategory(state.lastCategory);
  renderContent();
  notify(saved ? '已放下这件小事' : '已移除，但尚未保存，请导出备份', { label: '撤销', action: 'undo' }, 10000);
}

async function copyOrder(id, button) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const text = `${record.title}\n${record.order?.length ? record.order.map(([label, value]) => `${label}：${value}`).join('\n') : record.details}`;
  try {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.className = 'clipboard-fallback';
      (document.querySelector('dialog[open]') || document.body).append(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      if (!ok) throw new Error('copy failed');
    }
    const original = button.innerHTML;
    button.innerHTML = `${icon('check')}<span>已复制</span>`;
    setTimeout(() => { if (button.isConnected) button.innerHTML = original; }, 2200);
    notify('专属点单已复制，可以直接粘贴啦');
  } catch { notify('浏览器未允许复制，请长按或选中点单内容复制。'); }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'Koala的小宇宙', version: 1, exportedAt: new Date().toISOString(), records: state.records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Koala的小宇宙-${new Date().toLocaleDateString('sv-SE')}.json`;
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  notify('备份已导出，把这些小事好好收着 ♡');
}

function showPrivacy() {
  const dialog = document.querySelector('#privacy-dialog');
  dialog.innerHTML = `<div class="small-dialog-body"><button class="icon-button close-button" data-action="close" aria-label="关闭保存说明">${icon('close')}</button><span class="small-illustration">💌</span><h2 id="privacy-title">把小事，好好收着</h2><p>你新增和修改的记录会自动保存在<strong>当前设备、当前浏览器</strong>，刷新页面后依然在。</p><p>更换浏览器或清除网站数据后，记录不会自动同步。定期导出备份，在另一台设备导入，就能继续记录。</p><p class="privacy-note">导入会合并记录，同一件小事保留较新的版本，不会清空现有记录。</p></div><div class="dialog-footer"><button class="button subtle" data-action="import">${icon('upload')}导入备份</button><button class="button primary" data-action="export">${icon('download')}导出备份</button></div>`;
  dialog.showModal();
}

function petKoala() {
  clearTimeout(mascotTimer);
  const mascot = document.querySelector('.mascot');
  const speech = document.querySelector('#koala-speech');
  if (!mascot || !speech) return;
  const likes = state.records.filter(record => record.sentiment === 'love');
  const lines = ['摸摸头，今天也被放在心上啦 ♡', ...likes.map(record => `记得哦，我喜欢${record.title.replace(/.* · /, '')} ♡`)];
  speech.textContent = lines[suggestionIndex++ % lines.length];
  mascot.classList.remove('petted');
  requestAnimationFrame(() => mascot.classList.add('petted'));
  document.querySelector('#pet-hearts').innerHTML = Array.from({ length: 6 }, (_, index) => `<span class="pet-heart" style="--x:${(index - 2.5) * 34}px;--delay:${index * 45}ms;--r:${index * 27 - 70}deg">♥</span>`).join('');
  mascotTimer = setTimeout(() => {
    mascot.classList.remove('petted');
    if (speech.isConnected) speech.innerHTML = '今天也要好好吃饭呀！<span>♡</span>';
  }, 6000);
}

function bindOrbit() {
  document.querySelectorAll('.planet-card').forEach(card => {
    card.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showPreview(card), 380);
    });
    card.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(hidePreview, 120); });
    card.addEventListener('focus', () => { hoverTimer = setTimeout(() => showPreview(card), 400); });
    card.addEventListener('blur', hidePreview);
  });
}

function showPreview(card) {
  if (document.querySelector('dialog[open]')) return;
  const category = categoryById(card.dataset.category);
  const records = state.records.filter(record => record.category === category.id);
  const preview = document.querySelector('#hover-preview');
  const rect = card.getBoundingClientRect();
  preview.innerHTML = `<div class="preview-title">${category.emoji} ${category.name}<span>${records.length} 件小事</span></div>${records.slice(0, 2).map(record => `<div class="preview-item"><strong>${esc(record.title)}</strong><p>${esc(record.details || record.note || '点开记下更多细节')}</p></div>`).join('') || '<p>还没有记录，点开记下第一件小事。</p>'}<div class="preview-foot">点击查看${records.length > 2 ? `全部 ${records.length} 条` : '详情'}与编辑 ${icon('chevron')}</div>`;
  preview.hidden = false;
  hoverSource?.removeAttribute('aria-describedby');
  hoverSource = card;
  card.setAttribute('aria-describedby', 'hover-preview');
  const width = preview.offsetWidth;
  const height = preview.offsetHeight;
  const preferRight = rect.left + rect.width / 2 < innerWidth / 2;
  let left = preferRight ? rect.right + 12 : rect.left - width - 12;
  left = Math.max(12, Math.min(innerWidth - width - 12, left));
  const top = Math.max(12, Math.min(innerHeight - height - 12, rect.top - 12));
  preview.style.left = `${left}px`; preview.style.top = `${top}px`;
  card.classList.add('previewing');
}

function hidePreview() {
  clearTimeout(hoverTimer);
  const preview = document.querySelector('#hover-preview');
  if (preview) preview.hidden = true;
  hoverSource?.removeAttribute('aria-describedby');
  hoverSource = null;
  document.querySelectorAll('.previewing').forEach(card => card.classList.remove('previewing'));
}

function notify(message, action = null, duration = 4200) {
  clearTimeout(toastTimer);
  const toast = document.querySelector('#toast');
  toast.innerHTML = `${icon('heart')}<span>${esc(message)}</span>${action ? `<button data-action="${action.action}">${action.label}</button>` : ''}`;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'home') { event.preventDefault(); state.view = 'universe'; clearSearch(); }
  if (action === 'view') { state.view = button.dataset.view; clearSearch(); }
  if (action === 'category') showCategory(button.dataset.category);
  if (action === 'new') showEditor(null, button.dataset.category);
  if (action === 'edit') showEditor(state.records.find(record => record.id === button.dataset.id));
  if (action === 'close') button.closest('dialog')?.close();
  if (action === 'filter') { state.filter = button.dataset.filter; renderContent(); }
  if (action === 'clear-search') clearSearch();
  if (action === 'copy') copyOrder(button.dataset.id, button);
  if (action === 'pet') petKoala();
  if (action === 'delete') confirmDelete(button.dataset.id);
  if (action === 'confirm-delete') deleteRecord(button.dataset.id);
  if (action === 'export') exportBackup();
  if (action === 'import') document.querySelector('#import-file').click();
  if (action === 'privacy') showPrivacy();
  if (action === 'undo' && undoRecord) {
    state.records.splice(Math.min(undoRecord.index, state.records.length), 0, undoRecord.record);
    undoRecord = null;
    const saved = persist(); renderContent();
    if (document.querySelector('#detail-dialog').open) showCategory(state.lastCategory);
    notify(saved ? '已经找回这件小事啦 ♡' : '记录已找回，暂未保存，请导出备份');
  }
});

function clearSearch() {
  state.query = ''; state.filter = 'all';
  document.querySelector('#search').value = '';
  renderContent();
}

document.querySelector('#search').addEventListener('input', event => { state.query = event.target.value; renderContent(); });
document.querySelector('#hover-preview').addEventListener('pointerenter', () => clearTimeout(hoverTimer));
document.querySelector('#hover-preview').addEventListener('pointerleave', hidePreview);
window.addEventListener('scroll', hidePreview, { passive: true });
window.addEventListener('resize', hidePreview);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hidePreview();
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); document.querySelector('#search').focus(); }
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
document.querySelector('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('文件有点大，请选择 2MB 以内的备份。');
    const incoming = readBackup(await file.text());
    const before = JSON.stringify(state.records);
    state.records = mergeBackup(state.records, incoming);
    const changed = before !== JSON.stringify(state.records);
    const saved = persist(); closeDialogs(); renderContent();
    notify(saved ? changed ? `已合并 ${incoming.length} 条备份记录，原有小事也都在 ♡` : '备份里的小事已经都在这里啦 ♡' : '已导入，但浏览器保存失败，请保留备份文件');
  } catch (error) { notify(error instanceof SyntaxError ? '这个文件不是有效的 JSON 备份，请重新选择。' : error.message); }
  event.target.value = '';
});
window.addEventListener('storage', event => {
  if (event.key !== 'koala-universe.records.v1' || !event.newValue) return;
  try {
    state.records = validateRecords(JSON.parse(event.newValue).records);
    renderContent();
    if (document.querySelector('#detail-dialog').open) showCategory(state.lastCategory);
    notify('已同步这个浏览器另一窗口里的记录');
  } catch { /* Ignore invalid writes from outside this app. */ }
});

renderContent();
if (loaded.warning) notify(loaded.warning, { label: '导出', action: 'export' }, 12000);
