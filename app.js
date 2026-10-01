import { categories, categoryById, initialRecords, sentiments, matchesQuery, suggestCategory } from './data.js?v=7';
import { loadRecords, persistRecords, readBackup, mergeBackup, validateRecords, loadLocalMigrationCandidates, retainLocalMigration, finishLocalMigration } from './store.js?v=4';
import { icon, escapeHtml as esc } from './icons.js';
import { createMemoryExperience } from './memory.js?v=7';
const koalaName = value => String(value ?? '').replaceAll('老大', 'Koala');
import { fetchCloudRecords, checkAdmin, saveCloudRecords, chatWithKoala } from './api.js?v=6';

const loaded = loadRecords();
let rememberedToken = '';
try { rememberedToken = sessionStorage.getItem('koala-universe.admin-token') || ''; } catch { /* Private browsing may disable storage. */ }
const state = { records: loaded.records, view: 'universe', filter: 'all', query: '', lastCategory: null, cloudRevision: null, admin: false, adminToken: rememberedToken, cloudStatus: '正在连接云端…', migrationRecords: null };
const app = document.querySelector('#app');
let toastTimer, hoverTimer, mascotTimer, suggestionIndex = 0;
let editorCategoryTouched = false;
let undoRecord = null;
let hoverSource = null;
let pendingAdminAction = null;
const aiChat = { turns: [], busy: false };
const count = id => state.records.filter(record => record.category === id).length;

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Koala 的小宇宙首页" data-action="home"><img src="./assets/koala.webp" alt="" width="50" height="50"><span>Koala<span class="brand-zh">的小宇宙</span></span><span class="brand-heart">♥</span></a>
    <nav class="main-nav" aria-label="主导航"><button class="nav-button active" data-action="view" data-view="universe">${icon('orbit')}<span>喜好星球</span></button><button class="nav-button" data-action="view" data-view="records">${icon('book')}<span>所有记录</span></button></nav>
    <div class="header-actions"><button class="ai-trigger" data-action="ai-open" aria-haspopup="dialog"><span class="ai-trigger-star" aria-hidden="true">✦</span><span>问问 Koala AI</span><span class="ai-trigger-arrow" aria-hidden="true">↗</span></button><button class="button primary add-button" data-action="new">${icon('plus')}<span>记一件小事</span></button></div>
  </header>
  <main id="main"></main>
  <footer class="site-footer"><span class="footer-love">${icon('heart')}偏爱，藏在每个小细节里。</span><div class="footer-actions"><button class="save-state" data-action="privacy">${icon('lock')}<span id="save-label">正在连接云端…</span></button><button class="save-state" data-action="admin"><span id="admin-label">管理员登录</span></button></div></footer>
  <div id="hover-preview" class="hover-preview" role="tooltip" hidden></div>
  <dialog id="editor-dialog" class="editor-dialog" aria-labelledby="editor-title"></dialog>
  <dialog id="confirm-dialog" class="small-dialog" aria-labelledby="confirm-title"></dialog>
  <dialog id="privacy-dialog" class="small-dialog" aria-labelledby="privacy-title"></dialog>
  <dialog id="admin-dialog" class="small-dialog" aria-labelledby="admin-title"></dialog>
  <dialog id="ai-dialog" class="ai-dialog" aria-labelledby="ai-title"></dialog>
  <input id="import-file" type="file" accept="application/json,.json" hidden>
`;

const memoryExperience = createMemoryExperience({ getRecords: () => state.records });

function updateCloudLabel() {
  document.querySelector('#save-label').textContent = state.cloudStatus;
  document.querySelector('#admin-label').textContent = state.admin ? '退出管理' : '管理员登录';
}

async function connectCloud() {
  state.cloudStatus = '正在连接云端…';
  updateCloudLabel();
  try {
    const response = await fetchCloudRecords();
    const cloudRecords = validateRecords(response.records);
    if (!Number.isSafeInteger(response.revision) || response.revision < 1) throw new Error('云端记录版本不正确。');
    const cloudById = new Map(cloudRecords.map(record => [record.id, record]));
    const candidates = loadLocalMigrationCandidates();
    const localChanges = candidates.filter(record => record.updatedAt && (
      !cloudById.has(record.id) ||
      Date.parse(record.updatedAt) > Date.parse(cloudById.get(record.id).updatedAt || '1970-01-01')
    ));
    state.migrationRecords = localChanges.length ? candidates : null;
    if (state.migrationRecords) retainLocalMigration(candidates);
    else finishLocalMigration();
    state.records = cloudRecords;
    state.cloudRevision = response.revision;
    state.cloudStatus = '已连接云端 · 自动保存';
    persistRecords(cloudRecords);
    updateCloudLabel();
    renderContent();
    if (state.migrationRecords) notify(`发现 ${localChanges.length} 条旧浏览器记录，可以导入云端。`, { label: '导入旧记录', action: 'import-local' }, 12000);
    if (state.adminToken) {
      try { await checkAdmin(state.adminToken); state.admin = true; }
      catch { state.adminToken = ''; try { sessionStorage.removeItem('koala-universe.admin-token'); } catch {} }
      updateCloudLabel();
    }
  } catch (error) {
    state.cloudRevision = null;
    state.cloudStatus = '云端暂不可用 · 只读缓存';
    updateCloudLabel();
    notify(error.message || '云端暂时无法连接，请稍后重试。', { label: '重试', action: 'retry-cloud' }, 10000);
  }
}

function showAdmin(afterLogin = null) {
  if (state.cloudRevision === null) { notify('请先连接云端，再进入管理模式。', { label: '重试', action: 'retry-cloud' }); return; }
  pendingAdminAction = afterLogin;
  const dialog = document.querySelector('#admin-dialog');
  dialog.innerHTML = `<form id="admin-form"><div class="small-dialog-body"><button type="button" class="icon-button close-button" data-action="close" aria-label="关闭管理登录">${icon('close')}</button><span class="small-illustration" aria-hidden="true">🔐</span><h2 id="admin-title">只有你能写进小宇宙</h2><p>访客可以浏览记录，添加、编辑和删除需要管理密钥。</p><label class="field"><span>管理密钥</span><input name="token" type="password" required autocomplete="off" placeholder="输入你的管理密钥"></label><p id="admin-error" class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button type="submit" class="button primary">进入管理模式</button></div></form>`;
  dialog.showModal();
  dialog.querySelector('input').focus();
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const token = form.elements.token.value.trim();
    button.disabled = true;
    try {
      await checkAdmin(token);
      state.adminToken = token;
      state.admin = true;
      try { sessionStorage.setItem('koala-universe.admin-token', token); } catch {}
      updateCloudLabel();
      dialog.close();
      const action = pendingAdminAction;
      pendingAdminAction = null;
      notify('管理模式已开启，修改会保存到云端 ♡');
      action?.();
    } catch (error) {
      const message = dialog.querySelector('#admin-error');
      message.textContent = error.message || '管理密钥不正确。';
      message.hidden = false;
    } finally { button.disabled = false; }
  });
}

function withAdmin(action) {
  if (state.cloudRevision === null) { notify('云端暂不可用，暂时不能修改记录。', { label: '重试', action: 'retry-cloud' }); return; }
  if (!state.admin) { showAdmin(action); return; }
  action();
}

function logoutAdmin() {
  state.admin = false;
  state.adminToken = '';
  try { sessionStorage.removeItem('koala-universe.admin-token'); } catch {}
  updateCloudLabel();
  notify('已退出管理模式，记录仍安全保存在云端。');
}

async function saveRecords(nextRecords) {
  try {
    const clean = validateRecords(nextRecords);
    const response = await saveCloudRecords(clean, state.cloudRevision, state.adminToken);
    state.records = validateRecords(response.records);
    state.cloudRevision = response.revision;
    state.cloudStatus = '已保存到云端';
    persistRecords(state.records);
    updateCloudLabel();
    renderContent();
    return true;
  } catch (error) {
    if (error.status === 401) logoutAdmin();
    notify(error.message || '云端保存失败，请稍后再试。', { label: '导出备份', action: 'export' }, 10000);
    return false;
  }
}

function openAi() {
  const dialog = document.querySelector('#ai-dialog');
  if (!dialog.querySelector('.ai-shell')) {
    dialog.innerHTML = `<div class="ai-shell"><header class="ai-header"><div class="ai-avatar" aria-hidden="true"><img src="./assets/koala.webp" alt=""></div><div><span class="ai-eyebrow">你的小宇宙助手 ✦</span><h2 id="ai-title">Koala AI</h2><p>问喜好、聊习惯，也能帮你整理新的小事</p></div><button class="icon-button ai-close" data-action="close" aria-label="关闭 Koala AI">${icon('close')}</button></header><div id="ai-messages" class="ai-messages" role="log" aria-live="polite"></div><div id="ai-suggestions" class="ai-suggestions"></div><form id="ai-form" class="ai-form"><label class="sr-only" for="ai-input">和 Koala AI 说话</label><textarea id="ai-input" rows="2" maxlength="800" placeholder="问问 Koala 喜欢什么，或说：记住 Koala最近喜欢…"></textarea><button class="ai-send" type="submit" aria-label="发送消息">↗</button></form><p class="ai-footnote">AI 会参考已保存的记录；新记录需确认并登录管理模式。</p></div>`;
    dialog.querySelector('#ai-form').addEventListener('submit', sendAiMessage);
    dialog.querySelector('#ai-input').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        dialog.querySelector('#ai-form').requestSubmit();
      }
    });
  }
  renderAiChat();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('#ai-input').focus();
}

function renderAiChat() {
  const dialog = document.querySelector('#ai-dialog');
  if (!dialog.querySelector('.ai-shell')) return;
  const log = dialog.querySelector('#ai-messages');
  const suggestions = dialog.querySelector('#ai-suggestions');
  log.innerHTML = aiChat.turns.length ? aiChat.turns.map((turn, index) => {
    const isUser = turn.role === 'user';
    const sources = !isUser && turn.sources?.length ? `<div class="ai-sources">${turn.sources.map(id => {
      const record = state.records.find(item => item.id === id);
      return record ? `<button data-action="ai-source" data-id="${esc(id)}">查看「${esc(koalaName(record.title))}」↗</button>` : '';
    }).join('')}</div>` : '';
    const drafts = !isUser && turn.drafts?.length ? `<div class="ai-drafts"><strong>准备记下 ${turn.drafts.length} 件小事</strong>${turn.drafts.map(draft => `<div class="ai-draft"><span>${categoryById(draft.category)?.emoji || '💌'} ${esc(draft.title)}</span><p>${esc(draft.details || draft.note || '一件新发现')}</p></div>`).join('')}${turn.saved ? '<p class="ai-saved">✓ 已保存到云端</p>' : `<button class="button primary ai-save" data-action="ai-save" data-index="${index}">确认并保存${turn.drafts.length > 1 ? `这 ${turn.drafts.length} 条` : ''}</button>`}</div>` : '';
    return `<div class="ai-turn ${isUser ? 'ai-user' : 'ai-assistant'}"><span class="ai-speaker">${isUser ? '你' : 'Koala AI'}</span><p>${esc(turn.content)}</p>${sources}${drafts}</div>`;
  }).join('') : `<div class="ai-welcome"><span>✦</span><h3>嗨，我是 Koala AI</h3><p>Koala 的偏爱、小习惯和小档案，我会陪你慢慢记住。</p></div>`;
  if (aiChat.busy) log.insertAdjacentHTML('beforeend', '<div class="ai-turn ai-assistant ai-thinking"><span class="ai-speaker">Koala AI</span><p>正在翻看小宇宙… <span aria-hidden="true">✦</span></p></div>');
  suggestions.innerHTML = aiChat.turns.length ? '' : `<button data-action="ai-prompt" data-prompt="Koala 喜欢喝什么？">Koala 喜欢喝什么？</button><button data-action="ai-prompt" data-prompt="Koala不太喜欢吃什么？">有哪些饮食避雷？</button><button data-action="ai-prompt" data-prompt="Koala 的小档案有哪些？">看看小档案</button>`;
  dialog.querySelector('#ai-input').disabled = aiChat.busy;
  dialog.querySelector('.ai-send').disabled = aiChat.busy;
  log.scrollTop = log.scrollHeight;
}

async function sendAiMessage(event) {
  event.preventDefault();
  if (aiChat.busy) return;
  const input = document.querySelector('#ai-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  aiChat.turns.push({ role: 'user', content });
  aiChat.busy = true;
  renderAiChat();
  try {
    const messages = aiChat.turns.filter(turn => turn.role === 'user' || turn.role === 'assistant')
      .slice(-12).map(turn => ({ role: turn.role, content: turn.content }));
    const answer = await chatWithKoala(messages);
    aiChat.turns.push({ role: 'assistant', content: koalaName(answer.reply), sources: answer.sources || [], drafts: (answer.drafts || []).map(draft => ({ ...draft, title: koalaName(draft.title), details: koalaName(draft.details), note: koalaName(draft.note) })), saved: false });
  } catch (error) {
    aiChat.turns.push({ role: 'notice', content: error.message || 'Koala AI 暂时走神了，请稍后再试。' });
  } finally {
    aiChat.busy = false;
    renderAiChat();
    input.focus();
  }
}

async function saveAiDrafts(index) {
  const turn = aiChat.turns[index];
  if (!turn?.drafts?.length || turn.saved) return;
  const duplicates = turn.drafts.filter(draft => state.records.some(record => record.category === draft.category && record.title.trim() === draft.title.trim()));
  if (duplicates.length) { notify('发现同名记录，请先查看已有内容，再决定是否手动编辑。'); return; }
  const now = new Date().toISOString();
  const additions = turn.drafts.map(draft => ({ ...draft, id: crypto.randomUUID(), createdAt: now, updatedAt: now }));
  try { validateRecords(additions); }
  catch { notify('这几条草稿需要再整理一下，请手动记录。'); return; }
  if (!await saveRecords([...state.records, ...additions])) return;
  turn.saved = true;
  renderAiChat();
  notify(`${additions.length} 件小事已保存到云端 ♡`);
}

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
  memoryExperience.refresh();
}

function profileOrbit() {
  const profiles = state.records.filter(record => record.category === 'profile');
  if (!profiles.length) return '';
  const mbti = profiles.find(record => record.id === 'koala-mbti');
  const recent = profiles.filter(record => record !== mbti)
    .sort((first, second) => Date.parse(second.updatedAt || '1970-01-01') - Date.parse(first.updatedAt || '1970-01-01'));
  const ordered = mbti ? [mbti, ...recent] : recent;
  const shown = ordered.slice(0, ordered.length > 6 ? 5 : 6);
  const remaining = ordered.length - shown.length;
  return `<div class="profile-orbit" role="group" aria-label="关于 Koala 的小档案">
    ${shown.map((record, index) => `<button class="profile-orbit-badge profile-orbit-slot-${index}" data-action="profile-record" data-id="${esc(record.id)}" aria-label="查看小档案：${esc(koalaName(record.title))}" aria-haspopup="dialog"><span class="profile-orbit-spark" aria-hidden="true">✦</span><span class="profile-orbit-label">${esc(koalaName(record.title))}</span></button>`).join('')}
    ${remaining ? `<button class="profile-orbit-badge profile-orbit-slot-5 profile-orbit-more" data-action="category" data-category="profile" aria-label="查看其余 ${remaining} 条小档案" aria-haspopup="dialog"><span aria-hidden="true">✦</span><span>还有 ${remaining} 条</span></button>` : ''}
  </div>`;
}

function universeView() {
  const habitCount = count('habits');
  return `<section class="page-intro"><div><h1>把 Koala 的小喜好，放在心上<span class="title-period">。</span><span class="heading-heart" aria-hidden="true">♥</span></h1><p>每一件小事，都值得被好好记住。</p></div></section>
    <section class="universe" aria-label="Koala 的喜好星球">
      <div class="orbit-line orbit-one" aria-hidden="true"></div><div class="orbit-line orbit-two" aria-hidden="true"></div><div class="orbit-line orbit-three" aria-hidden="true"></div>
      <span class="spark spark-one" aria-hidden="true">✦</span><span class="spark spark-two" aria-hidden="true">✧</span><span class="spark spark-three" aria-hidden="true">♥</span><span class="spark spark-four" aria-hidden="true">✦</span>
      <div class="koala-center"><div id="koala-speech" class="speech" aria-live="polite">今天也要好好吃饭呀！<span>♡</span></div><button class="mascot" data-action="pet" aria-label="摸摸 Koala 的头，发现一个小喜好"><img src="./assets/koala.webp" alt="拿着刀叉、戴着厨师帽的可爱考拉 Koala" width="340" height="340" draggable="false"><span id="pet-hearts" aria-hidden="true"></span></button>${profileOrbit()}<div class="koala-name">Koala<span>♥</span></div><p class="pet-hint">点击摸摸头 <span aria-hidden="true">✧</span></p></div>
      ${categories.slice(0, 6).map((category, index) => `<button class="planet-card ${category.color} position-${index}" data-action="category" data-category="${category.id}" aria-label="${category.name}，${count(category.id)} 条记录，点击查看详情" aria-haspopup="dialog"><div class="planet-heading"><span class="category-emoji" aria-hidden="true">${category.emoji}</span><h2>${category.name}</h2><span class="card-count">${count(category.id)}条 ${icon('chevron')}</span></div><div class="planet-summary">${categorySummary(category).map(line => `<p>${esc(koalaName(line))}</p>`).join('')}</div><span class="card-open">点开看看 ${icon('chevron')}</span></button>`).join('')}
      <button class="habit-button" data-action="${habitCount ? 'category' : 'new'}" data-category="habits">${icon(habitCount ? 'book' : 'plus')}<span>${habitCount ? `生活小习惯 · ${habitCount} 件小事` : '发现一个新习惯'}</span></button>
      <p class="canvas-hint"><span class="desktop-hint">悬停探索喜好，点击收藏细节</span><span class="mobile-hint">点开小星球，看看Koala 的偏爱</span></p>
    </section>`;
}

function recordsView() {
  const results = state.records.filter(record => (state.filter === 'all' || record.category === state.filter) && matchesQuery(record, state.query));
  const searching = Boolean(state.query.trim());
  return `<section class="page-intro records-intro"><div><h1>${searching ? '找找 Koala 的小喜好' : '关于 Koala，都记在这里'}<span class="heading-heart" aria-hidden="true">♥</span></h1><p>${searching ? `找到 ${results.length} 条与「${esc(state.query)}」有关的记录` : `${state.records.length} 件被认真记住的小事，和慢慢了解 Koala 的日常。`}</p></div><div class="backup-actions"><button class="button subtle" data-action="export">${icon('download')}导出备份</button><button class="button subtle" data-action="import">${icon('upload')}导入备份</button>${state.migrationRecords ? `<button class="button subtle" data-action="import-local">${icon('upload')}导入旧浏览器记录</button>` : ''}</div></section>
    <div class="filters" aria-label="记录分类"><button class="filter ${state.filter === 'all' ? 'selected' : ''}" data-action="filter" data-filter="all" aria-pressed="${state.filter === 'all'}">全部 <span>${state.records.length}</span></button>${categories.map(category => `<button class="filter ${state.filter === category.id ? 'selected' : ''}" data-action="filter" data-filter="${category.id}" aria-pressed="${state.filter === category.id}">${category.emoji} ${category.name} <span>${count(category.id)}</span></button>`).join('')}</div>
    <section class="records-grid" aria-label="喜好记录" aria-live="polite">${results.length ? results.map(record => recordCard(record)).join('') : `<div class="empty-state"><span aria-hidden="true">${searching ? '🔎' : '🌱'}</span><h2>${searching ? '这件小事，还没找到' : '这里等着一个新发现'}</h2><p>${searching ? '换个关键词，或者把这个新发现记下来。' : 'Koala 的小习惯、喜欢的事，都可以从这里开始。'}</p><button class="button primary" data-action="${searching ? 'clear-search' : 'new'}" ${!searching && state.filter !== 'all' ? `data-category="${state.filter}"` : ''}>${icon(searching ? 'search' : 'plus')}${searching ? '清除搜索与筛选' : '记一件小事'}</button></div>`}</section>`;
}

function recordCard(record, detailed = false) {
  record = { ...record, title: koalaName(record.title), details: koalaName(record.details), note: koalaName(record.note) };
  const category = categoryById(record.category);
  return `<article class="record-card ${category.color} ${record.order?.length ? 'order-card' : ''}" data-record-id="${esc(record.id)}" data-action="record" data-id="${esc(record.id)}"><div class="record-top"><span class="record-category">${category.emoji} ${category.name}</span><span class="sentiment ${record.sentiment}">${record.sentiment === 'love' ? '♡ ' : ''}${sentiments[record.sentiment]}</span></div><h3><button class="record-title-button" data-action="record" data-id="${esc(record.id)}" aria-haspopup="dialog">${esc(koalaName(record.title))}<span aria-hidden="true">↗</span></button></h3>${record.order?.length ? `<dl class="order-details">${record.order.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : `<p class="record-description">${esc(record.details || '还没有写下具体细节。')}</p>`}${record.note ? `<p class="record-note">${icon('heart')}<span>${esc(koalaName(record.note))}</span></p>` : ''}<div class="record-bottom"><span class="record-date">${record.updatedAt ? `记于 ${new Date(record.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}` : '用心记住的小事'}</span><div class="record-actions">${record.category === 'drinks' ? `<button class="copy-button" data-action="copy" data-id="${esc(record.id)}" aria-label="复制${esc(koalaName(record.title))}点单">${icon('copy')}<span>复制点单</span></button>` : ''}<button class="icon-button" data-action="edit" data-id="${esc(record.id)}" aria-label="编辑${esc(koalaName(record.title))}">${icon('edit')}</button><button class="icon-button danger-hover" data-action="delete" data-id="${esc(record.id)}" aria-label="删除${esc(koalaName(record.title))}">${icon('trash')}</button></div></div></article>`;
}

function showCategory(id, focusRecordId = '', source = null) {
  hidePreview();
  if (!categoryById(id)) return;
  state.lastCategory = id;
  memoryExperience.show(id, focusRecordId, source);
}

function closeDialogs() {
  memoryExperience.close(true);
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
}

function showEditor(record = null, categoryId = '') {
  hidePreview();
  closeDialogs();
  editorCategoryTouched = Boolean(record || categoryId);
  const category = record?.category || categoryId || 'habits';
  const dialog = document.querySelector('#editor-dialog');
  dialog.innerHTML = `<form id="record-form"><header class="dialog-header"><div><span class="form-eyebrow">${icon('heart')} 又多了解 Koala一点</span><h2 id="editor-title">${record ? '把这件小事，记得更准确' : '记一件小事'}</h2></div><button type="button" class="icon-button close-button" data-action="close" aria-label="关闭编辑">${icon('close')}</button></header><div class="editor-fields"><input type="hidden" name="id" value="${esc(record?.id || '')}"><label class="field"><span>这次发现了什么 <span class="required">*</span></span><input name="title" maxlength="80" required placeholder="比如：下雨天喜欢窝着看电影" value="${esc(koalaName(record?.title || ''))}" autofocus></label><div class="form-row"><label class="field"><span>放在哪颗星球</span><select name="category">${categories.map(item => `<option value="${item.id}" ${category === item.id ? 'selected' : ''}>${item.emoji} ${item.name}</option>`).join('')}</select></label><div class="field sentiment-field"><span>Koala 的态度</span><select name="sentiment" aria-label="Koala 的态度">${Object.entries(sentiments).map(([value, label]) => `<option value="${value}" ${(record?.sentiment || (category === 'profile' ? 'profile' : category === 'habits' ? 'habit' : category === 'avoid' ? 'less' : 'love')) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><p id="category-suggestion" class="field-hint" ${editorCategoryTouched ? 'hidden' : ''}>输入标题后，会帮你建议一个分类。</p><label id="details-field" class="field" ${category === 'drinks' ? 'hidden' : ''}><span>记得更具体一点</span><textarea name="details" rows="3" maxlength="3000" placeholder="什么口味、什么场景，或者Koala特别在意的细节…">${esc(koalaName(record?.details || ''))}</textarea></label><label id="order-field" class="field" ${category !== 'drinks' ? 'hidden' : ''}><span>Koala 的专属点单 <span class="optional">每行一项</span></span><textarea name="order" rows="5" maxlength="2600" placeholder="温度：热&#10;甜度：不另外加糖&#10;奶类：巴旦木奶">${esc(record?.order ? record.order.map(pair => pair.join('：')).join('\n') : category === 'drinks' ? record?.details || '' : '')}</textarea><span class="field-hint">例如「冰量：少冰」，保存后就能一键复制点单。</span></label><label class="field"><span>悄悄补充 <span class="optional">选填</span></span><textarea name="note" rows="2" maxlength="1000" placeholder="比如：不怎么吃鸡肉，但手撕鸡是例外。">${esc(koalaName(record?.note || ''))}</textarea></label><p id="form-error" class="form-error" role="alert" hidden></p></div><footer class="dialog-footer"><span>${icon('lock')} 保存到云端</span><button type="submit" class="button primary">${icon('heart')}${record ? '保存这份了解' : '好好记住'}</button></footer></form>`;
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

async function saveForm(event) {
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
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  const saved = await saveRecords(next);
  submit.disabled = false;
  if (!saved) return;
  closeDialogs();
  notify(existing ? '这份了解，已经保存到云端 ♡' : '又多了解 Koala一点，已经保存到云端 ♡');
}

function confirmDelete(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const dialog = document.querySelector('#confirm-dialog');
  dialog.innerHTML = `<div class="small-dialog-body"><span class="small-illustration" aria-hidden="true">🍃</span><h2 id="confirm-title">放下这件小事？</h2><p>「${esc(koalaName(record.title))}」会从记录里移除。删除后还可以立即撤销。</p></div><div class="dialog-footer"><button class="button subtle" data-action="close">再留一会儿</button><button class="button delete-button" data-action="confirm-delete" data-id="${esc(id)}">确认删除</button></div>`;
  dialog.showModal();
}

async function deleteRecord(id) {
  undoRecord = { record: state.records.find(item => item.id === id), index: state.records.findIndex(item => item.id === id) };
  if (!undoRecord.record) return;
  const saved = await saveRecords(state.records.filter(item => item.id !== id));
  if (!saved) return;
  document.querySelector('#confirm-dialog').close();
  memoryExperience.refresh();
  notify('已从云端移除这件小事', { label: '撤销', action: 'undo' }, 10000);
}

async function copyOrder(id, button) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const text = koalaName(`${record.title}\n${record.order?.length ? record.order.map(([label, value]) => `${label}：${value}`).join('\n') : record.details}`);
  try {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.className = 'clipboard-fallback';
      (document.querySelector('dialog[open]') || (memoryExperience.isOpen ? document.querySelector('#memory-stage') : document.body)).append(textarea);
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
  const blob = new Blob([JSON.stringify({ app: 'Koala 的小宇宙', version: 1, exportedAt: new Date().toISOString(), records: state.records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Koala 的小宇宙-${new Date().toLocaleDateString('sv-SE')}.json`;
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  notify('备份已导出，把这些小事好好收着 ♡');
}

function showPrivacy() {
  const dialog = document.querySelector('#privacy-dialog');
  dialog.innerHTML = `<div class="small-dialog-body"><button class="icon-button close-button" data-action="close" aria-label="关闭保存说明">${icon('close')}</button><span class="small-illustration">💌</span><h2 id="privacy-title">把小事，好好收着</h2><p>记录保存在云端，刷新页面或换设备后会自动读取。只有输入管理密钥才能新增、编辑和删除；访客只能浏览。</p><p>浏览器里仍留有一份本地缓存。云端暂时无法连接时，可以查看缓存并导出备份，待恢复连接后再修改。</p><p class="privacy-note">导入备份会按记录 ID 合并，保留更新时间较新的版本。</p></div><div class="dialog-footer">${state.migrationRecords ? `<button class="button subtle" data-action="import-local">${icon('upload')}导入旧浏览器记录</button>` : ''}<button class="button subtle" data-action="retry-cloud">重新连接</button><button class="button subtle" data-action="import">${icon('upload')}导入备份</button><button class="button primary" data-action="export">${icon('download')}导出备份</button></div>`;
  dialog.showModal();
}

async function importLocalRecords() {
  if (!state.migrationRecords) return;
  const incoming = state.migrationRecords;
  const merged = mergeBackup(state.records, incoming);
  if (!await saveRecords(merged)) return;
  state.migrationRecords = null;
  finishLocalMigration();
  renderContent();
  notify('旧浏览器里的记录已经合并到云端 ♡');
}

function petKoala() {
  clearTimeout(mascotTimer);
  const mascot = document.querySelector('.mascot');
  const speech = document.querySelector('#koala-speech');
  if (!mascot || !speech) return;
  const likes = state.records.filter(record => record.sentiment === 'love');
  const lines = ['摸摸头，今天也被放在心上啦 ♡', ...likes.map(record => `记得哦，我喜欢${record.title.replace(/.* · /, '')} ♡`)];
  speech.textContent = koalaName(lines[suggestionIndex++ % lines.length]);
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
  document.querySelectorAll('.profile-orbit-badge[data-id]').forEach(badge => {
    badge.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showProfilePreview(badge), 280);
    });
    badge.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(hidePreview, 120); });
    badge.addEventListener('focus', () => { hoverTimer = setTimeout(() => showProfilePreview(badge), 300); });
    badge.addEventListener('blur', hidePreview);
  });
}

function showProfilePreview(badge) {
  if (document.querySelector('dialog[open]') || memoryExperience.isOpen) return;
  const record = state.records.find(item => item.id === badge.dataset.id && item.category === 'profile');
  if (!record) return;
  const preview = document.querySelector('#hover-preview');
  const summary = [record.details, record.note].filter(Boolean).join(' · ');
  preview.innerHTML = `<div class="preview-title">🌻 ${esc(koalaName(record.title))}<span>小档案</span></div><div class="preview-item"><p>${esc(koalaName(summary.slice(0, 160) || '点击查看这条小档案。'))}${summary.length > 160 ? '…' : ''}</p></div><div class="preview-foot">点击查看完整记录 ${icon('chevron')}</div>`;
  preview.hidden = false;
  hoverSource?.removeAttribute('aria-describedby');
  hoverSource = badge;
  badge.setAttribute('aria-describedby', 'hover-preview');
  const rect = badge.getBoundingClientRect();
  const width = preview.offsetWidth;
  const height = preview.offsetHeight;
  const left = Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  let top = rect.bottom + 12;
  if (top + height > innerHeight - 12) top = rect.top - height - 12;
  preview.style.left = `${left}px`;
  preview.style.top = `${Math.max(12, top)}px`;
  badge.classList.add('previewing');
}

function showPreview(card) {
  if (document.querySelector('dialog[open]') || memoryExperience.isOpen) return;
  const category = categoryById(card.dataset.category);
  const records = state.records.filter(record => record.category === category.id);
  const preview = document.querySelector('#hover-preview');
  const rect = card.getBoundingClientRect();
  preview.innerHTML = `<div class="preview-title">${category.emoji} ${category.name}<span>${records.length} 件小事</span></div>${records.slice(0, 2).map(record => `<div class="preview-item"><strong>${esc(koalaName(record.title))}</strong><p>${esc(koalaName(record.details || record.note || '点开记下更多细节'))}</p></div>`).join('') || '<p>还没有记录，点开记下第一件小事。</p>'}<div class="preview-foot">点击查看${records.length > 2 ? `全部 ${records.length} 条` : '详情'}与编辑 ${icon('chevron')}</div>`;
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
  if (action === 'ai-open') openAi();
  if (action === 'ai-prompt') { document.querySelector('#ai-input').value = button.dataset.prompt; document.querySelector('#ai-form').requestSubmit(); }
  if (action === 'ai-save') withAdmin(() => saveAiDrafts(Number(button.dataset.index)));
  if (action === 'ai-source') {
    const record = state.records.find(item => item.id === button.dataset.id);
    if (record) { const origin = { element: button, rect: button.getBoundingClientRect() }; document.querySelector('#ai-dialog').close(); showCategory(record.category, record.id, origin); }
  }
  if (action === 'category') showCategory(button.dataset.category, '', button);
  if (action === 'profile-record') showCategory('profile', button.dataset.id, button);
  if (action === 'record') { const record = state.records.find(item => item.id === button.dataset.id); if (record) showCategory(record.category, record.id, button.closest('.record-card') || button); }
  if (action === 'new') withAdmin(() => showEditor(null, button.dataset.category));
  if (action === 'edit') withAdmin(() => showEditor(state.records.find(record => record.id === button.dataset.id)));
  if (action === 'close') button.closest('dialog')?.close();
  if (action === 'filter') { state.filter = button.dataset.filter; renderContent(); }
  if (action === 'clear-search') clearSearch();
  if (action === 'copy') copyOrder(button.dataset.id, button);
  if (action === 'pet') petKoala();
  if (action === 'delete') withAdmin(() => confirmDelete(button.dataset.id));
  if (action === 'confirm-delete') withAdmin(() => deleteRecord(button.dataset.id));
  if (action === 'export') exportBackup();
  if (action === 'import') withAdmin(() => document.querySelector('#import-file').click());
  if (action === 'import-local') withAdmin(importLocalRecords);
  if (action === 'retry-cloud') { closeDialogs(); connectCloud(); }
  if (action === 'privacy') showPrivacy();
  if (action === 'admin') state.admin ? logoutAdmin() : showAdmin();
  if (action === 'undo' && undoRecord) withAdmin(async () => {
    const next = [...state.records];
    next.splice(Math.min(undoRecord.index, next.length), 0, undoRecord.record);
    if (!await saveRecords(next)) return;
    undoRecord = null;
    memoryExperience.refresh();
    notify('已经从云端找回这件小事啦 ♡');
  });
});

function clearSearch() {
  state.query = ''; state.filter = 'all';
  renderContent();
}

document.querySelector('#hover-preview').addEventListener('pointerenter', () => clearTimeout(hoverTimer));
document.querySelector('#hover-preview').addEventListener('pointerleave', hidePreview);
window.addEventListener('scroll', hidePreview, { passive: true });
window.addEventListener('resize', hidePreview);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hidePreview();
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]') && !memoryExperience.isOpen) { event.preventDefault(); openAi(); }
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
    const merged = mergeBackup(state.records, incoming);
    if (await saveRecords(merged)) {
      closeDialogs();
      notify(`已把 ${incoming.length} 条备份记录合并到云端 ♡`);
    }
  } catch (error) { notify(error instanceof SyntaxError ? '这个文件不是有效的 JSON 备份，请重新选择。' : error.message); }
  event.target.value = '';
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !document.querySelector('dialog[open]') && !memoryExperience.isOpen) connectCloud();
});

renderContent();
connectCloud();
