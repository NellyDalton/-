/**
 * 酒精换算与 BAC 估算工具（纯前端）
 *
 * 说明：
 * - BAC 单位为百分比（例如 0.03 表示 0.03%）。
 * - 计算使用 Widmark 简化模型，仅用于风险提示，不可替代执法或医学检测。
 */

const DENSITY_ETHANOL_G_PER_ML = 0.789;
const DEFAULT_STANDARD_DRINK_GRAMS = 10;
const DEFAULT_BETA_PERCENT_PER_HOUR = 0.015;

const R_RANGE_BY_SEX = {
  male: [0.65, 0.73],
  female: [0.52, 0.6],
  unknown: [0.52, 0.6],
};

const BETA_RANGE = [0.01, 0.02];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nonNegative(value) {
  return Math.max(0, toNumber(value, 0));
}

function round(value, digits = 4) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function getRRange(sex) {
  return R_RANGE_BY_SEX[sex] || R_RANGE_BY_SEX.unknown;
}

/**
 * 纯酒精克数
 * ethanol_g = volume_ml * (abv/100) * 0.789
 */
function ethanolFromDrink(volume_ml, abv) {
  const volumeMl = nonNegative(volume_ml);
  const abvRatio = clamp(nonNegative(abv) / 100, 0, 1);
  return volumeMl * abvRatio * DENSITY_ETHANOL_G_PER_ML;
}

/**
 * 标准杯数
 * cups = ethanol_g / standardDrinkGrams
 */
function cupsFromEthanol(ethanol_g, standardDrinkGrams = DEFAULT_STANDARD_DRINK_GRAMS) {
  const std = toNumber(standardDrinkGrams, DEFAULT_STANDARD_DRINK_GRAMS);
  if (std <= 0) return 0;
  return nonNegative(ethanol_g) / std;
}

/**
 * Widmark 简化 BAC 区间
 * BAC% = ethanol_g / (weight_kg * 1000 * r) * 100 - beta * hours
 */
function bacRange({
  ethanol_g,
  weight_kg,
  sex = 'unknown',
  elapsed_hours = 0,
  beta_percent_per_hour = DEFAULT_BETA_PERCENT_PER_HOUR,
}) {
  const ethanol = nonNegative(ethanol_g);
  const weightKg = nonNegative(weight_kg);
  const hours = nonNegative(elapsed_hours);
  const [rLow, rHigh] = getRRange(sex);

  // 若体重无效，无法计算 BAC。返回 0 区间并给出标记。
  if (weightKg <= 0) {
    return {
      bac_min_percent: 0,
      bac_max_percent: 0,
      valid: false,
      reason: 'INVALID_WEIGHT',
    };
  }

  const betaUsed = clamp(toNumber(beta_percent_per_hour, DEFAULT_BETA_PERCENT_PER_HOUR), BETA_RANGE[0], BETA_RANGE[1]);

  // r 越小，BAC 越高；r 越大，BAC 越低
  const rawHigh = (ethanol / (weightKg * 1000 * rLow)) * 100;
  const rawLow = (ethanol / (weightKg * 1000 * rHigh)) * 100;

  const bacMin = Math.max(0, rawLow - betaUsed * hours);
  const bacMax = Math.max(0, rawHigh - betaUsed * hours);

  return {
    bac_min_percent: round(Math.min(bacMin, bacMax), 4),
    bac_max_percent: round(Math.max(bacMin, bacMax), 4),
    valid: true,
    beta_used_percent_per_hour: betaUsed,
    r_range: [rLow, rHigh],
  };
}

/**
 * 回到 0.00% 所需时间区间（小时）
 * 采用 BAC 区间 + beta 区间组合，给出最快/最慢估计。
 */
function soberTimeRange({ bac_min_percent, bac_max_percent }) {
  const bacMin = nonNegative(bac_min_percent);
  const bacMax = nonNegative(bac_max_percent);

  // 最快：低 BAC + 高代谢率；最慢：高 BAC + 低代谢率
  const minHours = bacMin / BETA_RANGE[1];
  const maxHours = bacMax / BETA_RANGE[0];

  return {
    min_hours: round(minHours, 2),
    max_hours: round(maxHours, 2),
    beta_range_percent_per_hour: [...BETA_RANGE],
  };
}

/**
 * 在给定 bac_limit_percent + plan_hours 条件下，反推建议上限杯数区间。
 * 仅输出建议上限和占用比例（当前杯数 / 建议上限），不输出“还能再喝X杯”。
 */
function limitCupsRange({
  bac_limit_percent,
  plan_hours,
  weight_kg,
  sex = 'unknown',
  standardDrinkGrams = DEFAULT_STANDARD_DRINK_GRAMS,
  current_cups = 0,
}) {
  const bacLimit = nonNegative(bac_limit_percent);
  const planHours = nonNegative(plan_hours);
  const weightKg = nonNegative(weight_kg);
  const std = toNumber(standardDrinkGrams, DEFAULT_STANDARD_DRINK_GRAMS);
  const usedCups = nonNegative(current_cups);

  if (weightKg <= 0 || std <= 0) {
    return {
      cups_limit_min: 0,
      cups_limit_max: 0,
      usage_ratio_min: 0,
      usage_ratio_max: 0,
      valid: false,
      reason: 'INVALID_WEIGHT_OR_STANDARD_DRINK',
    };
  }

  const [rLow, rHigh] = getRRange(sex);

  // 允许的 BAC 起点区间：bac_limit + beta*plan_hours
  const allowedBacMin = bacLimit + BETA_RANGE[0] * planHours;
  const allowedBacMax = bacLimit + BETA_RANGE[1] * planHours;

  // 由 BAC 反推纯酒精克数：ethanol = BAC%/100 * weight*1000*r
  const ethanolMin = (allowedBacMin / 100) * weightKg * 1000 * rLow;
  const ethanolMax = (allowedBacMax / 100) * weightKg * 1000 * rHigh;

  const cupsMin = Math.max(0, ethanolMin / std);
  const cupsMax = Math.max(cupsMin, ethanolMax / std);

  const ratioMin = cupsMax > 0 ? usedCups / cupsMax : 0;
  const ratioMax = cupsMin > 0 ? usedCups / cupsMin : 0;

  return {
    cups_limit_min: round(cupsMin, 2),
    cups_limit_max: round(cupsMax, 2),
    usage_ratio_min: round(ratioMin, 3),
    usage_ratio_max: round(ratioMax, 3),
    valid: true,
    assumptions: {
      r_range: [rLow, rHigh],
      beta_range_percent_per_hour: [...BETA_RANGE],
    },
  };
}

module.exports = {
  DENSITY_ETHANOL_G_PER_ML,
  DEFAULT_STANDARD_DRINK_GRAMS,
  DEFAULT_BETA_PERCENT_PER_HOUR,
  R_RANGE_BY_SEX,
  BETA_RANGE,
  ethanolFromDrink,
  cupsFromEthanol,
  bacRange,
  soberTimeRange,
  limitCupsRange,
};
