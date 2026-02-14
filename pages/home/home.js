const alc = require('../../miniprogram/utils/alc');
const storage = require('../../utils/storage');

function round(v, d = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function calcSessionTotals(session) {
  const items = Array.isArray(session.items) ? session.items : [];
  return items.reduce((acc, it) => {
    acc.cups += Number(it.cups) || 0;
    acc.ethanol += Number(it.ethanol_g) || 0;
    return acc;
  }, { cups: 0, ethanol: 0 });
}

Page({
  data: {
    cups: 0,
    ethanol_g: 0,
    bacText: '--',
    soberText: '--',
    needsProfile: false,
    isActive: false,
    timeline: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const settings = storage.getSettings();
    const session = storage.getTodaySession();
    const totals = calcSessionTotals(session);

    let bacText = '--';
    let soberText = '--';
    let needsProfile = false;

    if (!settings.weight_kg || settings.weight_kg <= 0) {
      needsProfile = true;
      bacText = '资料不足，请先去 settings 填写体重/性别';
      soberText = '--';
    } else {
      const start = new Date(session.start_time || new Date().toISOString()).getTime();
      const elapsedHours = Math.max(0, (Date.now() - start) / 3600000);
      const bac = alc.bacRange({
        ethanol_g: totals.ethanol,
        weight_kg: settings.weight_kg,
        sex: settings.sex,
        elapsed_hours: elapsedHours,
      });
      bacText = `${bac.bac_min_percent.toFixed(3)}% ~ ${bac.bac_max_percent.toFixed(3)}%`;
      const sober = alc.soberTimeRange({
        bac_min_percent: bac.bac_min_percent,
        bac_max_percent: bac.bac_max_percent,
      });
      soberText = `${sober.min_hours.toFixed(1)}h ~ ${sober.max_hours.toFixed(1)}h`;
    }

    const timeline = (session.items || [])
      .slice()
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
      .map((it) => ({
        time: new Date(it.ts).toLocaleTimeString(),
        text: `${it.name || '未命名'} × ${it.qty || 1}（${round(it.cups, 2)}杯）`,
      }));

    this.setData({
      cups: round(totals.cups, 2),
      ethanol_g: round(totals.ethanol, 2),
      bacText,
      soberText,
      needsProfile,
      isActive: !!session.is_active,
      timeline,
    });
  },

  onStart() {
    storage.startDrinking();
    this.refresh();
  },

  onEnd() {
    storage.endDrinking();
    this.refresh();
  },

  goAdd() {
    wx.switchTab({ url: '/pages/add/add' });
  },
});
