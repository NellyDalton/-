const alc = require('../../miniprogram/utils/alc');
const storage = require('../../utils/storage');

function calcDayMaxBac(items, settings, startTime) {
  if (!settings.weight_kg) return null;
  const sorted = (items || []).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  let sumEthanol = 0;
  let maxMin = 0;
  let maxMax = 0;
  sorted.forEach((it) => {
    sumEthanol += Number(it.ethanol_g) || 0;
    const elapsed = Math.max(0, (new Date(it.ts).getTime() - new Date(startTime).getTime()) / 3600000);
    const r = alc.bacRange({ ethanol_g: sumEthanol, weight_kg: settings.weight_kg, sex: settings.sex, elapsed_hours: elapsed });
    maxMin = Math.max(maxMin, r.bac_min_percent);
    maxMax = Math.max(maxMax, r.bac_max_percent);
  });
  return { min: maxMin, max: maxMax };
}

Page({
  data: {
    range: 7,
    list: [],
    selected: null,
  },

  onShow() {
    this.refresh();
  },

  onRangeChange(e) {
    this.setData({ range: Number(e.detail.value) === 1 ? 30 : 7 }, () => this.refresh());
  },

  refresh() {
    const settings = storage.getSettings();
    const history = storage.getHistory();
    const now = storage.getTodaySession();
    const today = {
      date: storage.localDateKey(new Date()),
      start_time: now.start_time,
      items: now.items || [],
      total_cups: (now.items || []).reduce((s, it) => s + (Number(it.cups) || 0), 0),
    };

    const merged = [today, ...history].slice(0, this.data.range);
    const list = merged.map((d) => {
      const items = d.items || [];
      const maxBac = calcDayMaxBac(items, settings, d.start_time || new Date().toISOString());
      const over = maxBac ? (maxBac.max > settings.bac_limit_percent) : false;
      return {
        ...d,
        maxBacText: maxBac ? `${maxBac.min.toFixed(3)}%~${maxBac.max.toFixed(3)}%` : '--',
        over,
      };
    });
    this.setData({ list });
  },

  onPickDay(e) {
    const idx = Number(e.currentTarget.dataset.idx) || 0;
    this.setData({ selected: this.data.list[idx] || null });
  },
});
