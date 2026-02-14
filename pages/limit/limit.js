const alc = require('../../miniprogram/utils/alc');
const storage = require('../../utils/storage');

function sumCups(session) {
  return (session.items || []).reduce((s, it) => s + (Number(it.cups) || 0), 0);
}

Page({
  data: {
    bac_limit_percent: 0.05,
    plan_hours: 6,
    rangeText: '--',
    ratioText: '--',
  },

  onShow() {
    const settings = storage.getSettings();
    this.setData({
      bac_limit_percent: settings.bac_limit_percent,
      plan_hours: settings.plan_hours,
    }, () => this.recalc());
  },

  onLimitChange(e) {
    const values = [0.03, 0.05, 0.08];
    this.setData({ bac_limit_percent: values[Number(e.detail.value) || 0] }, () => {
      storage.saveSettings({ bac_limit_percent: this.data.bac_limit_percent });
      this.recalc();
    });
  },

  onPlanInput(e) {
    const plan = Math.max(0, Number(e.detail.value) || 0);
    this.setData({ plan_hours: plan }, () => {
      storage.saveSettings({ plan_hours: plan });
      this.recalc();
    });
  },

  recalc() {
    const settings = storage.getSettings();
    const session = storage.getTodaySession();
    const current = sumCups(session);

    if (!settings.weight_kg) {
      this.setData({ rangeText: '请先在 settings 填写体重/性别', ratioText: '--' });
      return;
    }

    const range = alc.limitCupsRange({
      bac_limit_percent: this.data.bac_limit_percent,
      plan_hours: this.data.plan_hours,
      weight_kg: settings.weight_kg,
      sex: settings.sex,
      standardDrinkGrams: settings.standard_drink_grams,
      current_cups: current,
    });

    this.setData({
      rangeText: `${range.cups_limit_min.toFixed(2)} ~ ${range.cups_limit_max.toFixed(2)} 杯`,
      ratioText: `${(range.usage_ratio_min * 100).toFixed(1)}% ~ ${(range.usage_ratio_max * 100).toFixed(1)}%`,
    });
  },
});
