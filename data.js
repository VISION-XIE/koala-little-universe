export const categories = [
  { id: 'drinks', name: '咖啡与奶茶', emoji: '☕', color: 'peach', summary: ['星巴克 · 馥芮白', '1点点 · 藏青盐咸奶绿'], aliases: '喝的 饮品 点单 咖啡 奶茶 coffee 星巴克 一点点' },
  { id: 'snacks', name: '零食快乐', emoji: '🍿', color: 'yellow', summary: ['琦王香芋片', '酒鬼五香花生'], aliases: '零食 小吃 薯片 花生' },
  { id: 'meals', name: '认真吃饭', emoji: '🍚', color: 'green', summary: ['牛肉 · 鱼 · 虾 · 手撕鸡', '干硬口感，高蛋白'], aliases: '正餐 肉 蛋白质 吃饭 晚餐 午餐' },
  { id: 'flavors', name: '独特的口味', emoji: '🍋', color: 'pink', summary: ['爱吃酸 · 松露 · 木姜子'], aliases: '口味 调味 酸的 爱吃酸 酸味' },
  { id: 'dairy', name: '奶香与面包', emoji: '🥖', color: 'lavender', summary: ['希腊酸奶 · 楼下酸奶', '无糖牛奶 · 硬欧 · 恰巴塔'], aliases: '牛奶 面包 酸奶 乳制品 早餐 碳水' },
  { id: 'avoid', name: '小小避雷区', emoji: '🙅🏻‍♀️', color: 'rose', summary: ['不怎么吃鸡鸭鹅', '手撕鸡是例外'], aliases: '讨厌 不喜欢 避雷 不吃 禁忌 忌口' },
  { id: 'habits', name: '生活小习惯', emoji: '🌷', color: 'green', summary: [], aliases: '习惯 行为 日常 生活 爱好 兴趣' },
  { id: 'profile', name: '关于 Koala', emoji: '🌻', color: 'yellow', summary: [], aliases: 'MBTI ESFJ 人格 性格 生日 星座 家人 宠物 个人资料 小档案 基础信息' },
];

const seed = (id, category, title, details, extras = {}) => ({ id, category, title, details, sentiment: 'love', note: '', createdAt: null, updatedAt: null, ...extras });
export const initialRecords = [
  seed('flat-white', 'drinks', '星巴克 · 馥芮白', '热 / 不另外加糖 / 去奶泡 / 浓缩份数 3 / 默认原味 / 巴旦木奶', { order: [['温度', '热'], ['甜度', '不另外加糖'], ['奶泡', '去奶泡'], ['浓缩', '3 份'], ['风味', '默认原味'], ['奶类', '巴旦木奶']], note: '每一个小细节，都照着Koala喜欢的来。' }),
  seed('salt-tea', 'drinks', '1点点 · 藏青盐咸奶绿', '不另外加糖 / 少冰 / 改四季春茶 / 改 A2 牛乳', { order: [['甜度', '不另外加糖'], ['冰量', '少冰'], ['茶底', '改四季春茶'], ['奶类', '改 A2 牛乳']] }),
  seed('taro', 'snacks', '琦王香芋片', '喜欢吃琦王香芋片。'),
  seed('peanuts', 'snacks', '酒鬼五香花生', '喜欢吃酒鬼五香花生。'),
  seed('beef', 'meals', '牛肉', '喜欢吃牛肉。'),
  seed('fish', 'meals', '鱼', '喜欢吃鱼。'),
  seed('shrimp', 'meals', '虾', '喜欢吃虾。'),
  seed('chicken', 'meals', '手撕鸡', '喜欢吃手撕鸡。', { note: '虽然不怎么吃鸡鸭鹅，但手撕鸡是喜欢的。' }),
  seed('protein', 'meals', '干硬口感，高蛋白', '喜欢吃口感干硬、蛋白质含量高的食物。'),
  seed('sour', 'flavors', '喜欢吃酸的', '喜欢酸的口味。'),
  seed('truffle', 'flavors', '松露', '爱吃松露。'),
  seed('litsea', 'flavors', '木姜子', '爱吃木姜子。'),
  seed('greek-yogurt', 'dairy', '希腊酸奶', '酸奶喜欢喝希腊酸奶。'),
  seed('local-yogurt', 'dairy', '楼下酸奶', '也喜欢喝楼下酸奶。'),
  seed('milk', 'dairy', '无糖牛奶', '牛奶喜欢喝无糖的。'),
  seed('bread', 'dairy', '硬欧', '喜欢吃硬欧面包。'),
  seed('ciabatta', 'dairy', '恰巴塔', '喜欢吃恰巴塔。'),
  seed('poultry', 'avoid', '不怎么吃鸡鸭鹅', '不怎么吃鸡、鸭、鹅。', { sentiment: 'less', note: '这是饮食偏好，不是过敏或绝对禁忌；手撕鸡是喜欢的例外。' }),
  seed('koala-mbti', 'profile', 'MBTI · ESFJ', 'Koala 的 MBTI 是 ESFJ。', { sentiment: 'profile' }),
];

export const sentiments = { love: '喜欢', less: '不太喜欢', dislike: '不喜欢', habit: '小习惯', profile: '小档案' };
export const categoryById = id => categories.find(category => category.id === id);

export function suggestCategory(text) {
  if (/MBTI|ESFJ|人格|性格|生日|出生|星座|年龄|身高|血型|家人|家庭|弟弟|妹妹|哥哥|姐姐|宠物|小档案|基础信息|个人资料/i.test(text)) return 'profile';
  if (/不喜欢|讨厌|不怎么|不能吃|不吃|忌口/.test(text)) return 'avoid';
  if (/咖啡|奶茶|星巴克|馥芮白|茶底|拿铁|一点点|1点点/.test(text)) return 'drinks';
  if (/酸奶|牛奶|面包|硬欧|恰巴塔|吐司/.test(text)) return 'dairy';
  if (/零食|薯片|香芋片|花生|饼干|巧克力/.test(text)) return 'snacks';
  if (/松露|木姜子|酸的|口味|酸味|调味/.test(text)) return 'flavors';
  if (/牛肉|鱼|虾|鸡|蛋白|正餐|米饭/.test(text)) return 'meals';
  return 'habits';
}

export function matchesQuery(record, query) {
  const category = categoryById(record.category);
  const normalized = query.trim().toLocaleLowerCase().replace(/一点点/g, '1点点');
  const haystack = [record.title, record.details, record.note, category.name, category.aliases, sentiments[record.sentiment], ...(record.order || []).flat()].join(' ').toLocaleLowerCase();
  return normalized.split(/\s+/).every(word => haystack.includes(word));
}
