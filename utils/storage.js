/**
 * 本地存储层（仅 wx 本地缓存，不依赖网络/云函数）
 */

const KEY_SESSION = 'alc_today_session_v2';
const KEY_HISTORY = 'alc_history_v2';
const KEY_SESSION_DATE = 'alc_today_session_date_v2';
const KEY_FAVORITES = 'alc_favorite_skus_v2';
const KEY_SETTINGS = 'alc_settings_v1';
const DEFAULT_HISTORY_DAYS = 30;

const DEFAULT_SETTINGS = {
  standard_drink_grams: 10,
  weight_kg: 0,
  sex: 'unknown', // male / female / unknown(保守)
  bac_limit_percent: 0.05,
  plan_hours: 6,
};

function getWx() {
  if (typeof wx === 'undefined' || !wx || typeof wx.getStorageSync !== 'function' || typeof wx.setStorageSync !== 'function') {
    throw new Error('WX_STORAGE_UNAVAILABLE');
  }
  return wx;
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function pad2(v) {
  return String(v).padStart(2, '0');
}

function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeItem(item) {
  const src = item && typeof item === 'object' ? item : {};
  const qty = Math.max(1, Math.round(n(src.qty, 1)));
  return {
    id: String(src.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    ts: src.ts ? new Date(src.ts).toISOString() : new Date().toISOString(),
    type: src.type === 'custom' ? 'custom' : 'sku',
    sku_id: String(src.sku_id || ''),
    name: String(src.name || ''),
    category: String(src.category || ''),
    brand: String(src.brand || ''),
    volume_ml: Math.max(0, n(src.volume_ml)),
    abv: Math.max(0, n(src.abv)),
    qty,
    ethanol_g: Math.max(0, n(src.ethanol_g)),
    cups: Math.max(0, n(src.cups)),
  };
}

function createEmptySession(now = new Date()) {
  return {
    start_time: new Date(now).toISOString(),
    end_time: '',
    is_active: false,
    items: [],
  };
}

function normalizeSession(session, now = new Date()) {
  const src = session && typeof session === 'object' ? session : {};
  const start = src.start_time ? new Date(src.start_time) : new Date(now);
  const end = src.end_time ? new Date(src.end_time) : null;
  return {
    start_time: Number.isNaN(start.getTime()) ? new Date(now).toISOString() : start.toISOString(),
    end_time: end && !Number.isNaN(end.getTime()) ? end.toISOString() : '',
    is_active: !!src.is_active,
    items: safeArray(src.items).map(normalizeItem),
  };
}

function getSettings() {
  const w = getWx();
  const raw = w.getStorageSync(KEY_SETTINGS);
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    standard_drink_grams: [10, 14].includes(n(src.standard_drink_grams)) ? n(src.standard_drink_grams) : DEFAULT_SETTINGS.standard_drink_grams,
    weight_kg: Math.max(0, n(src.weight_kg, DEFAULT_SETTINGS.weight_kg)),
    sex: ['male', 'female', 'unknown'].includes(src.sex) ? src.sex : DEFAULT_SETTINGS.sex,
    bac_limit_percent: [0.03, 0.05, 0.08].includes(n(src.bac_limit_percent)) ? n(src.bac_limit_percent) : DEFAULT_SETTINGS.bac_limit_percent,
    plan_hours: Math.max(0, n(src.plan_hours, DEFAULT_SETTINGS.plan_hours)),
  };
}

function saveSettings(next) {
  const w = getWx();
  const merged = { ...getSettings(), ...(next || {}) };
  w.setStorageSync(KEY_SETTINGS, merged);
  return getSettings();
}

function getHistory() {
  return safeArray(getWx().getStorageSync(KEY_HISTORY));
}

function saveHistory(history, maxDays = DEFAULT_HISTORY_DAYS) {
  const w = getWx();
  const sorted = safeArray(history)
    .filter((x) => x && x.date)
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, Math.max(1, Math.floor(n(maxDays, DEFAULT_HISTORY_DAYS))));
  w.setStorageSync(KEY_HISTORY, sorted);
  return sorted;
}

function summarizeSession(dateKey, session) {
  const items = safeArray(session.items);
  const totals = items.reduce((acc, it) => {
    acc.total_cups += n(it.cups);
    acc.total_ethanol_g += n(it.ethanol_g);
    return acc;
  }, { total_cups: 0, total_ethanol_g: 0 });

  return {
    date: dateKey,
    start_time: session.start_time || '',
    end_time: session.end_time || new Date().toISOString(),
    count: items.length,
    total_cups: Math.round(totals.total_cups * 1000) / 1000,
    total_ethanol_g: Math.round(totals.total_ethanol_g * 1000) / 1000,
    items,
  };
}

function archiveSession(dateKey, session, maxDays = DEFAULT_HISTORY_DAYS) {
  const normalized = normalizeSession(session);
  if (!normalized.items.length) return getHistory();
  const history = getHistory().filter((x) => x.date !== dateKey);
  history.unshift(summarizeSession(dateKey, normalized));
  return saveHistory(history, maxDays);
}

function setTodaySession(session, now = new Date()) {
  const w = getWx();
  const key = localDateKey(now);
  const normalized = normalizeSession(session, now);
  w.setStorageSync(KEY_SESSION_DATE, key);
  w.setStorageSync(KEY_SESSION, normalized);
  return normalized;
}

function getTodaySession({ now = new Date(), maxDays = DEFAULT_HISTORY_DAYS } = {}) {
  const w = getWx();
  const key = localDateKey(now);
  const storedKey = w.getStorageSync(KEY_SESSION_DATE);
  const stored = normalizeSession(w.getStorageSync(KEY_SESSION), now);

  if (!storedKey) return setTodaySession(stored, now);
  if (storedKey !== key) {
    archiveSession(storedKey, stored, maxDays);
    return setTodaySession(createEmptySession(now), now);
  }
  return setTodaySession(stored, now);
}

function getFavoriteSkuMap() {
  const raw = getWx().getStorageSync(KEY_FAVORITES);
  return raw && typeof raw === 'object' ? raw : {};
}

function setFavoriteSkuMap(map) {
  getWx().setStorageSync(KEY_FAVORITES, map && typeof map === 'object' ? map : {});
}

function bumpFavoriteSku(skuId, count = 1) {
  if (!skuId) return;
  const map = getFavoriteSkuMap();
  map[skuId] = Math.max(0, n(map[skuId], 0)) + Math.max(1, Math.round(n(count, 1)));
  setFavoriteSkuMap(map);
}

function addSessionItem(item, options = {}) {
  const session = normalizeSession(getTodaySession(options));
  const normalized = normalizeItem(item);
  session.items.push(normalized);
  session.is_active = true;
  if (!session.start_time) session.start_time = new Date().toISOString();
  if (normalized.type === 'sku' && normalized.sku_id) bumpFavoriteSku(normalized.sku_id, normalized.qty || 1);
  return setTodaySession(session, options.now || new Date());
}

function startDrinking(now = new Date()) {
  const session = normalizeSession(getTodaySession({ now }), now);
  if (!session.items.length) session.start_time = new Date(now).toISOString();
  session.end_time = '';
  session.is_active = true;
  return setTodaySession(session, now);
}

function endDrinking(now = new Date()) {
  const session = normalizeSession(getTodaySession({ now }), now);
  session.is_active = false;
  session.end_time = new Date(now).toISOString();
  return setTodaySession(session, now);
}

module.exports = {
  KEY_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_HISTORY_DAYS,
  localDateKey,
  getSettings,
  saveSettings,
  getTodaySession,
  setTodaySession,
  addSessionItem,
  startDrinking,
  endDrinking,
  createEmptySession,
  getHistory,
  saveHistory,
  archiveSession,
  getFavoriteSkuMap,
  bumpFavoriteSku,
};
