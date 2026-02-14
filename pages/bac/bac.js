const alc = require('../../miniprogram/utils/alc');
const storage = require('../../utils/storage');

function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

Page({
  data: {
    weight_kg: '',
    sex: 'unknown',
    elapsed_hours: 0,
    ethanol_g: 0,
    bacText: '--',
  },

  onShow() {
    const settings = storage.getSettings();
    const session = storage.getTodaySession();
    const ethanol = (session.items || []).reduce((s, it) => s + (Number(it.ethanol_g) || 0), 0);
    const start = new Date(session.start_time || new Date().toISOString()).getTime();
    const elapsed = Math.max(0, (Date.now() - start) / 3600000);

    this.setData({
      weight_kg: settings.weight_kg || '',
      sex: settings.sex || 'unknown',
      elapsed_hours: elapsed.toFixed(2),
      ethanol_g: ethanol.toFixed(2),
    });
    this.recalc();
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value }, () => this.recalc());
  },

  onSexChange(e) {
    const values = ['male', 'female', 'unknown'];
    this.setData({ sex: values[Number(e.detail.value) || 0] }, () => this.recalc());
  },

  recalc() {
    const bac = alc.bacRange({
      ethanol_g: toNum(this.data.ethanol_g),
      weight_kg: toNum(this.data.weight_kg),
      sex: this.data.sex,
      elapsed_hours: toNum(this.data.elapsed_hours),
    });
    this.setData({ bacText: `${bac.bac_min_percent.toFixed(3)}% ~ ${bac.bac_max_percent.toFixed(3)}%` });
  },
});
