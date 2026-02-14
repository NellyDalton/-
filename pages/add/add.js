const alc = require('../../miniprogram/utils/alc');
const storage = require('../../utils/storage');
const skusData = require('../../miniprogram/data/skus.json');

function unique(list) {
  return Array.from(new Set((list || []).filter(Boolean)));
}

function normalizeSku(raw) {
  const it = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(it.id || ''),
    name: String(it.name || ''),
    category: String(it.category || ''),
    brand: String(it.brand || ''),
    abv: Number(it.abv) || 0,
    volume_ml: Number(it.volume_ml) || 0,
  };
}

function flattenSkus(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.searchIndex)) {
    return data.searchIndex.map((x) => normalizeSku(x));
  }
  const result = [];
  const groups = data.categoryGroups && typeof data.categoryGroups === 'object' ? data.categoryGroups : {};
  Object.keys(groups).forEach((category) => {
    const list = Array.isArray(groups[category]) ? groups[category] : [];
    list.forEach((it) => result.push(normalizeSku({ ...it, category })));
  });
  return result;
}

Page({
  data: {
    mode: 'sku',

    allSkus: [],
    categoryOptions: [],
    brandOptions: [],
    skuOptions: [],

    categoryIndex: 0,
    brandIndex: 0,
    skuIndex: 0,
    qty: 1,

    customName: '',
    customAbv: '',
    customVolume: '',
    customQty: 1,

    message: '',
  },

  onLoad() {
    this.initSkuData();
  },

  initSkuData() {
    const allSkus = flattenSkus(skusData).filter((x) => x.id && x.name);
    const favoriteMap = storage.getFavoriteSkuMap();

    allSkus.sort((a, b) => {
      const af = favoriteMap[a.id] || 0;
      const bf = favoriteMap[b.id] || 0;
      if (bf !== af) return bf - af;
      return a.name.localeCompare(b.name);
    });

    const categories = unique(allSkus.map((x) => x.category));
    const category = categories[0] || '';
    const brands = unique(allSkus.filter((x) => x.category === category).map((x) => x.brand));
    const brand = brands[0] || '';
    const skuOptions = allSkus.filter((x) => x.category === category && x.brand === brand);

    this.setData({
      allSkus,
      categoryOptions: categories,
      brandOptions: brands,
      skuOptions,
      categoryIndex: 0,
      brandIndex: 0,
      skuIndex: 0,
    });
  },

  onModeChange(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, message: '' });
  },

  onCategoryChange(e) {
    const categoryIndex = Number(e.detail.value) || 0;
    const category = this.data.categoryOptions[categoryIndex] || '';
    const brandOptions = unique(this.data.allSkus.filter((x) => x.category === category).map((x) => x.brand));
    const brand = brandOptions[0] || '';
    const skuOptions = this.data.allSkus.filter((x) => x.category === category && x.brand === brand);

    this.setData({
      categoryIndex,
      brandOptions,
      brandIndex: 0,
      skuOptions,
      skuIndex: 0,
    });
  },

  onBrandChange(e) {
    const brandIndex = Number(e.detail.value) || 0;
    const category = this.data.categoryOptions[this.data.categoryIndex] || '';
    const brand = this.data.brandOptions[brandIndex] || '';
    const skuOptions = this.data.allSkus.filter((x) => x.category === category && x.brand === brand);
    this.setData({ brandIndex, skuOptions, skuIndex: 0 });
  },

  onSkuChange(e) {
    this.setData({ skuIndex: Number(e.detail.value) || 0 });
  },

  onQtyInput(e) {
    this.setData({ qty: Math.max(1, parseInt(e.detail.value, 10) || 1) });
  },

  onCustomNameInput(e) {
    this.setData({ customName: e.detail.value || '' });
  },

  onCustomAbvInput(e) {
    this.setData({ customAbv: e.detail.value || '' });
  },

  onCustomVolumeInput(e) {
    this.setData({ customVolume: e.detail.value || '' });
  },

  onCustomQtyInput(e) {
    this.setData({ customQty: Math.max(1, parseInt(e.detail.value, 10) || 1) });
  },

  addSkuItem() {
    const sku = this.data.skuOptions[this.data.skuIndex];
    if (!sku) {
      this.setData({ message: '暂无可选 SKU，请先补充数据。' });
      return;
    }

    const qty = Math.max(1, Number(this.data.qty) || 1);
    const ethanolSingle = alc.ethanolFromDrink(sku.volume_ml, sku.abv);
    const cupsSingle = alc.cupsFromEthanol(ethanolSingle);

    storage.addSessionItem({
      type: 'sku',
      sku_id: sku.id,
      name: sku.name,
      category: sku.category,
      brand: sku.brand,
      volume_ml: sku.volume_ml,
      abv: sku.abv,
      qty,
      ethanol_g: ethanolSingle * qty,
      cups: cupsSingle * qty,
    });

    wx.switchTab({ url: '/pages/home/home' });
  },

  addCustomItem() {
    const name = (this.data.customName || '').trim();
    const abv = Number(this.data.customAbv);
    const volume_ml = Number(this.data.customVolume);
    const qty = Math.max(1, Number(this.data.customQty) || 1);

    if (!name) {
      this.setData({ message: '请填写名称' });
      return;
    }
    if (!Number.isFinite(abv) || abv < 0) {
      this.setData({ message: 'ABV 格式不正确' });
      return;
    }
    if (!Number.isFinite(volume_ml) || volume_ml <= 0) {
      this.setData({ message: '容量需大于 0' });
      return;
    }

    const ethanolSingle = alc.ethanolFromDrink(volume_ml, abv);
    const cupsSingle = alc.cupsFromEthanol(ethanolSingle);

    storage.addSessionItem({
      type: 'custom',
      sku_id: '',
      name,
      category: '自定义',
      brand: '自定义',
      volume_ml,
      abv,
      qty,
      ethanol_g: ethanolSingle * qty,
      cups: cupsSingle * qty,
    });

    wx.switchTab({ url: '/pages/home/home' });
  },

  onAddTap() {
    this.setData({ message: '' });
    if (this.data.mode === 'custom') {
      this.addCustomItem();
      return;
    }
    this.addSkuItem();
  },
});
