import { initialRecords, categories, sentiments } from './data.js?v=3';

const KEY = 'koala-universe.records.v1';
const BACKUP_KEY = 'koala-universe.recovery.v1';
const MIGRATION_KEY = 'koala-universe.pending-cloud-migration.v1';
const CLOUD_LINKED_KEY = 'koala-universe.cloud-linked.v1';
const CONTENT_REVISION = 2;
const categoryIds = new Set(categories.map(category => category.id));
const bounded = (value, max) => typeof value === 'string' && value.length <= max;

export function validateRecords(records) {
  if (!Array.isArray(records) || records.length > 2000) throw new Error('备份需要是最多 2000 条记录的有效文件。');
  const ids = new Set();
  return records.map(record => {
    if (!record || !bounded(record.id, 100) || !record.id || ids.has(record.id) || !bounded(record.title, 80) || !record.title.trim() || !bounded(record.details, 3000) || !bounded(record.note ?? '', 1000) || !categoryIds.has(record.category) || !Object.hasOwn(sentiments, record.sentiment)) throw new Error('文件中的记录格式不完整，请选择从这里导出的备份。');
    ids.add(record.id);
    if (record.order != null && (!Array.isArray(record.order) || record.order.length > 12 || !record.order.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(value => bounded(value, 200))))) throw new Error('点单信息格式不正确。');
    const validDate = value => value == null || (bounded(value, 40) && Number.isFinite(Date.parse(value)));
    if (!validDate(record.createdAt) || !validDate(record.updatedAt)) throw new Error('记录日期格式不正确。');
    return { id: record.id, title: record.title.trim(), category: record.category, sentiment: record.sentiment, details: record.details, note: record.note || '', ...(record.order ? { order: record.order } : {}), createdAt: record.createdAt || null, updatedAt: record.updatedAt || null };
  });
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      const records = structuredClone(initialRecords);
      return { records, warning: persistRecords(records) ? '' : '浏览器暂时不能保存记录，请及时导出备份。' };
    }
    const saved = JSON.parse(raw);
    const records = validateRecords(saved.records);
    if ((saved.contentRevision || 1) < CONTENT_REVISION) {
      if (!records.some(record => record.id === 'koala-mbti')) records.push(structuredClone(initialRecords.find(record => record.id === 'koala-mbti')));
      return { records, warning: persistRecords(records) ? '' : 'ESFJ 已加入页面，浏览器暂时不能保存，请导出备份。' };
    }
    return { records, warning: '' };
  } catch {
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (backup) {
        const saved = JSON.parse(backup);
        const records = validateRecords(saved.records);
        if ((saved.contentRevision || 1) < CONTENT_REVISION && !records.some(record => record.id === 'koala-mbti')) records.push(structuredClone(initialRecords.find(record => record.id === 'koala-mbti')));
        return { records, warning: '已从上一次保存恢复记录，请导出一份备份。' };
      }
    } catch { /* Keep damaged data untouched so it can be recovered. */ }
    return { records: structuredClone(initialRecords), warning: '本地记录暂时无法读取，正在显示初始记录；原始存储未被覆盖。' };
  }
}

export function persistRecords(records) {
  try {
    const previous = localStorage.getItem(KEY);
    if (previous) {
      try { validateRecords(JSON.parse(previous).records); localStorage.setItem(BACKUP_KEY, previous); } catch { /* Do not replace a valid recovery copy with damaged data. */ }
    }
    localStorage.setItem(KEY, JSON.stringify({ version: 1, contentRevision: CONTENT_REVISION, records }));
    return true;
  } catch { return false; }
}

export function readBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.version !== 1 || !Array.isArray(backup.records)) throw new Error('这不是 Koala 小宇宙的有效备份文件。');
  return validateRecords(backup.records);
}

export function mergeBackup(current, incoming) {
  const map = new Map(current.map(record => [record.id, record]));
  for (const record of incoming) {
    const previous = map.get(record.id);
    if (!previous || Date.parse(record.updatedAt || '1970-01-01') > Date.parse(previous.updatedAt || '1970-01-01')) map.set(record.id, record);
  }
  return validateRecords([...map.values()]);
}

export function loadLocalMigrationCandidates() {
  try {
    const pending = localStorage.getItem(MIGRATION_KEY);
    if (pending) return validateRecords(JSON.parse(pending).records);
    if (localStorage.getItem(CLOUD_LINKED_KEY) === '1') return [];
    const candidates = [KEY, BACKUP_KEY].map(key => {
      try {
        const saved = localStorage.getItem(key);
        return saved ? validateRecords(JSON.parse(saved).records) : [];
      } catch { return []; }
    });
    return mergeBackup(candidates[0], candidates[1]);
  } catch { return []; }
}

export function retainLocalMigration(records) {
  try {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify({ version: 1, records: validateRecords(records) }));
    return true;
  } catch { return false; }
}

export function finishLocalMigration() {
  try {
    localStorage.setItem(CLOUD_LINKED_KEY, '1');
    localStorage.removeItem(MIGRATION_KEY);
  } catch { /* The cloud copy is authoritative even if this browser blocks storage. */ }
}
