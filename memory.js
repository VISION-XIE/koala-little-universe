import { categoryById, sentiments } from './data.js?v=7';
import { icon, escapeHtml } from './icons.js';

const friendly = value => String(value ?? '').replaceAll('老大', 'Koala');
const text = value => escapeHtml(friendly(value));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const number = value => String(value).padStart(2, '0');
const themes = {
  drinks: ['#d99b71', '#fff0e3', '专属点单', '每个小细节，都照着 Koala 喜欢的来。'],
  snacks: ['#c7a04c', '#fff5d6', '快乐补给', '把快乐，藏进一口小零食里。'],
  meals: ['#8fa977', '#edf5e5', '认真吃饭', '好好吃饭，也是被放在心上的小事。'],
  flavors: ['#c791a5', '#fff0f5', '独特偏爱', '这一份特别的口味，认真记得。'],
  dairy: ['#a89bc7', '#f3effc', '奶香日常', '面包与奶香，装满柔软的小日常。'],
  avoid: ['#c69287', '#fff0eb', '贴心备忘', '记住不喜欢的，也是一种偏爱。'],
  habits: ['#84a5a0', '#ebf6f3', '日常切片', '慢慢了解，生活里的每一个小习惯。'],
  profile: ['#c6a362', '#fff5df', 'Koala 小档案', '这些小细节，拼成独一份的 Koala。'],
};

function stickerFor(record) {
  const title = record.title;
  if (/MBTI|ESFJ/i.test(title)) return '🌻';
  if (/生日/.test(title)) return '🎂';
  if (/小狗|狗狗|狗/.test(title)) return '🐶';
  if (/奶茶|奶绿|茶/.test(title)) return '🧋';
  if (/咖啡|馥芮白|星巴克/.test(title)) return '☕';
  if (/面包|硬欧|恰巴塔/.test(title)) return '🥖';
  if (/酸奶|牛奶/.test(title)) return '🥛';
  if (/花生/.test(title)) return '🥜';
  if (/香芋/.test(title)) return '🍠';
  if (/牛肉/.test(title)) return '🥩';
  if (/虾/.test(title)) return '🦐';
  if (/鱼/.test(title)) return '🐟';
  return categoryById(record.category)?.emoji || '💌';
}

function detailMarkup(record) {
  const order = record.order || [];
  const mbti = record.category === 'profile' && `${record.title} ${record.details}`.match(/\b([EI][SN][TF][JP])\b/i);
  const chips = !order.length && !mbti ? record.details.split(/[\/\n、；;·]/).map(item => item.trim()).filter(item => item && item.length < 45) : [];
  return `${mbti ? `<div class="memory-mbti" aria-label="MBTI ${text(mbti[1])}">${[...mbti[1].toUpperCase()].map((letter, index) => `<span><strong>${letter}</strong><small>${['01', '02', '03', '04'][index]}</small></span>`).join('')}</div>` : ''}
    ${order.length ? `<div class="memory-order" aria-label="Koala 的专属点单">${order.map(([label, value], index) => `<div class="memory-order-tile"><span class="memory-tile-number">${number(index + 1)}</span><span class="memory-tile-label">${text(label)}</span><strong>${text(value)}</strong><span class="memory-tile-star" aria-hidden="true">✦</span></div>`).join('')}</div>` : `<div class="memory-description"><span class="memory-section-label">${icon('heart')} ${record.category === 'profile' ? '关于 Koala 的小细节' : record.category === 'avoid' ? '贴心记住这一点' : '这一份偏爱，认真记得'}</span><p>${text(record.details || '这一件小事，等你补上更多细节。')}</p></div>${chips.length > 1 && chips.length <= 8 ? `<div class="memory-chips">${chips.map(item => `<span>✧ ${text(item)}</span>`).join('')}</div>` : ''}`}
    ${record.note ? `<aside class="memory-note"><span aria-hidden="true">💌</span><div><strong>还有一个小细节</strong><p>${text(record.note)}</p></div></aside>` : ''}`;
}

export function createMemoryExperience({ getRecords }) {
  const stage = document.createElement('section');
  stage.id = 'memory-stage';
  stage.className = 'memory-stage';
  stage.hidden = true;
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-modal', 'true');
  stage.setAttribute('aria-labelledby', 'memory-title');
  document.body.append(stage);
  let categoryId = null, selectedId = null, source = null, sourceRect = null;
  let open = false, closing = false, epoch = 0, originalOverflow = '';
  let motions = [], pointerStart = null;
  const background = () => [...document.querySelectorAll('.site-header, #main, .site-footer')];
  const collection = () => getRecords().filter(record => record.category === categoryId);
  const cancelMotions = () => { motions.forEach(motion => motion.cancel()); motions = []; };
  const animate = (element, frames, options) => {
    const motion = element.animate(frames, options);
    motions.push(motion);
    return motion;
  };

  function renderShell() {
    const category = categoryById(categoryId);
    const records = collection();
    if (!records.some(record => record.id === selectedId)) selectedId = records[0]?.id || null;
    const [accent, tint, label, subtitle] = themes[categoryId];
    stage.style.setProperty('--memory-accent', accent);
    stage.style.setProperty('--memory-tint', tint);
    stage.innerHTML = `<div class="memory-backdrop" data-memory-action="close"></div><span class="memory-ambient ambient-one" aria-hidden="true"></span><span class="memory-ambient ambient-two" aria-hidden="true"></span><div class="memory-flight"><div class="memory-flipper"><div class="memory-cover" aria-hidden="true"><span class="memory-cover-orbit"></span><span class="memory-cover-icon">${category.emoji}</span><span class="memory-cover-brand">Koala 的小宇宙</span><strong>${category.name}</strong><span>翻开这一份偏爱 ✦</span></div><div class="memory-face"><header class="memory-topbar"><div class="memory-brand"><img src="./assets/koala.webp" alt="" width="36" height="36"><span>Koala<span>的偏爱记忆舱</span></span></div><span class="memory-top-label">每一份偏爱，都有专属位置 ✧</span><button class="memory-close icon-button" data-memory-action="close" aria-label="收起卡片">${icon('close')}</button></header><div class="memory-body"><aside class="memory-collection"><div class="memory-emblem"><span class="memory-emblem-orbit"></span><span class="memory-emblem-spark spark-a" aria-hidden="true">✦</span><span class="memory-emblem-spark spark-b" aria-hidden="true">✧</span><span class="memory-emblem-icon" aria-hidden="true">${category.emoji}</span><span class="memory-emblem-heart" aria-hidden="true">♡</span></div><span class="memory-eyebrow">${text(label)} · ${number(records.length)} 件小事</span><h2>${text(category.name)}</h2><p class="memory-collection-intro">${text(subtitle)}</p><div class="memory-tabs" role="tablist" aria-label="选择一件小事">${records.map((record, index) => `<button role="tab" id="memory-tab-${index}" aria-controls="memory-detail" aria-selected="${record.id === selectedId}" data-memory-action="select" data-id="${escapeHtml(record.id)}"><span class="memory-tab-emoji" aria-hidden="true">${stickerFor(record)}</span><span>${text(record.title)}</span><span class="memory-tab-dot" aria-hidden="true"></span></button>`).join('')}</div></aside><div id="memory-detail" class="memory-detail" role="tabpanel"></div></div><footer class="memory-footer"><span class="memory-footer-love">${icon('heart')} 慢慢了解，好好记得</span><div class="memory-pagination"><button class="icon-button memory-prev" data-memory-action="prev" aria-label="上一件小事">${icon('chevron')}</button><span class="memory-page"></span><button class="icon-button memory-next" data-memory-action="next" aria-label="下一件小事">${icon('chevron')}</button></div><button class="button primary memory-add" data-action="new" data-category="${categoryId}">${icon('plus')}再记一件</button></footer></div></div></div>`;
    renderRecord(false);
  }

  function renderRecord(withMotion = true, direction = 1) {
    const records = collection();
    const index = records.findIndex(record => record.id === selectedId);
    const record = records[index];
    const content = stage.querySelector('#memory-detail');
    content.setAttribute('aria-labelledby', record ? `memory-tab-${index}` : 'memory-title');
    content.innerHTML = record ? `<div class="memory-record-content"><div class="memory-record-meta"><span class="memory-eyebrow">偏爱档案 <span aria-hidden="true">/</span> ${number(index + 1)}</span><span class="memory-sentiment ${record.sentiment}">${record.sentiment === 'love' ? '♡' : record.sentiment === 'profile' ? '✦' : '✧'} ${text(sentiments[record.sentiment])}</span></div><div class="memory-record-heading"><div><h2 id="memory-title">${text(record.title)}</h2><p>${record.category === 'drinks' ? 'Koala 的专属点单，把每一步都记得刚刚好。' : record.category === 'profile' ? '一点点了解，一点点靠近 Koala 的世界。' : '小小的喜欢，值得被好好收藏。'}</p></div><span class="memory-record-sticker" aria-hidden="true">${stickerFor(record)}</span></div><div class="memory-detail-scroll">${detailMarkup(record)}</div><div class="memory-record-actions"><span>${record.updatedAt ? `收藏于 ${new Date(record.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}` : '一件被用心记住的小事'}</span><div>${record.category === 'drinks' ? `<button class="copy-button" data-action="copy" data-id="${escapeHtml(record.id)}">${icon('copy')}复制点单</button>` : ''}<button class="icon-button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="编辑${text(record.title)}">${icon('edit')}</button><button class="icon-button danger-hover" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="删除${text(record.title)}">${icon('trash')}</button></div></div></div>` : `<div class="memory-empty"><span>🌱</span><h2 id="memory-title">等一个小发现</h2><p>Koala 的这一颗星球，还等着你写下第一件小事。</p><button class="button primary" data-action="new" data-category="${categoryId}">${icon('plus')}记一件小事</button></div>`;
    stage.querySelectorAll('[role="tab"]').forEach(tab => tab.setAttribute('aria-selected', tab.dataset.id === selectedId ? 'true' : 'false'));
    stage.querySelector('.memory-page').innerHTML = `<strong>${number(record ? index + 1 : 0)}</strong><span> / ${number(records.length)}</span>`;
    stage.querySelector('.memory-prev').disabled = records.length < 2;
    stage.querySelector('.memory-next').disabled = records.length < 2;
    if (withMotion && !reducedMotion()) content.querySelector(':scope > div').animate([
      { opacity: 0, transform: `perspective(1000px) translateX(${direction * 18}px) rotateY(${direction * -10}deg) scale(.97)` },
      { opacity: 1, transform: 'perspective(1000px) translateX(0) rotateY(0) scale(1)' },
    ], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function travelTransform(rect) {
    const card = stage.querySelector('.memory-flight').getBoundingClientRect();
    return `translate(${rect.left + rect.width / 2 - (card.left + card.width / 2)}px, ${rect.top + rect.height / 2 - (card.top + card.height / 2)}px) scale(${Math.max(.08, Math.min(.75, rect.width / card.width))}, ${Math.max(.08, Math.min(.75, rect.height / card.height))}) rotate(-8deg)`;
  }

  function show(id, recordId = '', origin = null) {
    if (!categoryById(id)) return;
    cancelMotions();
    epoch++;
    const alreadyOpen = open && !closing;
    categoryId = id;
    selectedId = recordId || collection()[0]?.id || null;
    if (!alreadyOpen) {
      source = origin?.element || origin || document.activeElement;
      sourceRect = origin?.rect || source?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 80, height: 80 };
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      background().forEach(element => { element.inert = true; });
    }
    open = true;
    closing = false;
    stage.hidden = false;
    stage.removeAttribute('data-closing');
    renderShell();
    if (!alreadyOpen && !reducedMotion()) {
      animate(stage.querySelector('.memory-backdrop'), [{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'both' });
      animate(stage.querySelector('.memory-flight'), [
        { transform: travelTransform(sourceRect), opacity: .35 },
        { transform: 'translate(0, -8px) scale(1.025) rotate(1deg)', opacity: 1, offset: .78 },
        { transform: 'none', opacity: 1 },
      ], { duration: 780, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
      animate(stage.querySelector('.memory-flipper'), [{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 780, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'both' });
    }
    stage.querySelector('.memory-close').focus({ preventScroll: true });
  }

  function finishClose() {
    stage.hidden = true;
    stage.removeAttribute('data-closing');
    open = false;
    closing = false;
    document.body.style.overflow = originalOverflow;
    background().forEach(element => { element.inert = false; });
    const visibleSource = source?.isConnected && source.getClientRects().length ? source : null;
    const returnTarget = visibleSource?.querySelector('.record-title-button') || visibleSource || document.querySelector('[data-action="view"], .brand');
    returnTarget?.focus({ preventScroll: true });
    stage.innerHTML = '';
  }

  function close(immediate = false) {
    if (!open || closing && !immediate) return;
    const run = ++epoch;
    cancelMotions();
    if (immediate || reducedMotion()) { finishClose(); return; }
    closing = true;
    stage.setAttribute('data-closing', '');
    const rect = source?.isConnected && source.getClientRects().length ? source.getBoundingClientRect() : sourceRect;
    animate(stage.querySelector('.memory-backdrop'), [{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'both' });
    animate(stage.querySelector('.memory-flipper'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 430, fill: 'both' });
    const motion = animate(stage.querySelector('.memory-flight'), [{ transform: 'none', opacity: 1 }, { transform: travelTransform(rect), opacity: 0 }], { duration: 430, easing: 'cubic-bezier(.4,0,.5,1)', fill: 'both' });
    motion.finished.then(() => { if (run === epoch) finishClose(); }).catch(() => {});
  }

  function selectNext(direction) {
    const records = collection();
    if (records.length < 2) return;
    const index = records.findIndex(record => record.id === selectedId);
    selectedId = records[(index + direction + records.length) % records.length].id;
    renderRecord(true, direction);
    stage.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  stage.addEventListener('click', event => {
    const button = event.target.closest('[data-memory-action]');
    if (!button || closing) return;
    const action = button.dataset.memoryAction;
    if (action === 'close') close();
    if (action === 'next') selectNext(1);
    if (action === 'prev') selectNext(-1);
    if (action === 'select') { selectedId = button.dataset.id; renderRecord(); }
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || reducedMotion()) return;
    const card = stage.querySelector('.memory-face');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--shine-x', `${(event.clientX - rect.left) / rect.width * 100}%`);
    card.style.setProperty('--shine-y', `${(event.clientY - rect.top) / rect.height * 100}%`);
  });
  stage.addEventListener('pointerdown', event => {
    pointerStart = event.pointerType === 'touch' && event.target.closest('.memory-detail') && !event.target.closest('button, input, textarea') ? [event.clientX, event.clientY] : null;
  });
  stage.addEventListener('pointercancel', () => { pointerStart = null; });
  stage.addEventListener('pointerup', event => {
    if (!pointerStart) return;
    const [x, y] = pointerStart;
    pointerStart = null;
    if (Math.abs(event.clientX - x) > 70 && Math.abs(event.clientY - y) < 45) selectNext(event.clientX < x ? 1 : -1);
  });
  document.addEventListener('keydown', event => {
    if (!open || closing || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); selectNext(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectNext(-1); }
    if (event.key === 'Tab') {
      const focusable = [...stage.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      if (!event.shiftKey && (index === focusable.length - 1 || index < 0)) { event.preventDefault(); focusable[0]?.focus(); }
    }
  });
  return {
    show, close,
    refresh() { if (open && !closing) { cancelMotions(); renderShell(); stage.querySelector('.memory-close').focus({ preventScroll: true }); } },
    get isOpen() { return open; },
    get categoryId() { return categoryId; },
  };
}
