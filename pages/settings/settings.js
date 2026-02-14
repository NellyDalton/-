const storage = require('../../utils/storage');

Page({
  data: {
    standard_drink_grams: 10,
    weight_kg: '',
    sex: 'unknown',
  },

  onShow() {
    const s = storage.getSettings();
    this.setData({
      standard_drink_grams: s.standard_drink_grams,
      weight_kg: s.weight_kg || '',
      sex: s.sex,
    });
  },

  onStdChange(e) {
    const v = Number(e.detail.value) === 1 ? 14 : 10;
    this.setData({ standard_drink_grams: v });
    storage.saveSettings({ standard_drink_grams: v });
  },

  onWeightInput(e) {
    const weight = Math.max(0, Number(e.detail.value) || 0);
    this.setData({ weight_kg: e.detail.value });
    storage.saveSettings({ weight_kg: weight });
  },

  onSexChange(e) {
    const values = ['male', 'female', 'unknown'];
    const sex = values[Number(e.detail.value) || 0];
    this.setData({ sex });
    storage.saveSettings({ sex });
  },
});
