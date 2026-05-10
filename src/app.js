const DATA_URL = "data/seattle-weather.csv";

const WEATHER_TYPES = ["sun", "rain", "fog", "drizzle", "snow"];
const WEATHER_LABELS = {
  sun: "晴",
  rain: "雨",
  fog: "雾",
  drizzle: "毛毛雨",
  snow: "雪"
};

const WEATHER_COLORS = {
  sun: "#e2a837",
  rain: "#2b6f7a",
  fog: "#899995",
  drizzle: "#5b9c8c",
  snow: "#8ab6d6"
};

const METRICS = {
  temp_max: {
    label: "最高气温",
    title: "每日最高气温（°C）",
    unit: "°C",
    format: ".1f",
    zero: false
  },
  temp_min: {
    label: "最低气温",
    title: "每日最低气温（°C）",
    unit: "°C",
    format: ".1f",
    zero: false
  },
  precipitation: {
    label: "降水量",
    title: "每日降水量（mm）",
    unit: "mm",
    format: ".1f",
    zero: true
  },
  wind: {
    label: "风速",
    title: "每日风速",
    unit: "",
    format: ".1f",
    zero: true
  }
};

let allRows = [];
let lastRenderToken = 0;

const metricSelect = document.querySelector("#metric-select");
const statusPill = document.querySelector("#status-pill");
const selectAllWeatherButton = document.querySelector("#select-all-weather");
const clearBrushButton = document.querySelector("#clear-brush");

const statDays = document.querySelector("#stat-days");
const statTemp = document.querySelector("#stat-temp");
const statRainDays = document.querySelector("#stat-rain-days");
const statDominant = document.querySelector("#stat-dominant");

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [dateRaw, precipitation, tempMax, tempMin, wind, weather] = line.split(",");
      const [year, month, day] = dateRaw.split(/[/-]/).map(Number);
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      return {
        date,
        date_label: date,
        precipitation: Number(precipitation),
        temp_max: Number(tempMax),
        temp_min: Number(tempMin),
        wind: Number(wind),
        weather,
        weather_cn: WEATHER_LABELS[weather] || weather,
        year,
        month,
        month_name: `${month}月`,
        month_order: month,
        temp_range: Number(tempMax) - Number(tempMin)
      };
    });
}

function selectedYear() {
  return document.querySelector("input[name='year']:checked")?.value || "all";
}

function selectedWeatherTypes() {
  return Array.from(document.querySelectorAll("input[name='weather']:checked")).map((input) => input.value);
}

function allWeatherSelected() {
  return selectedWeatherTypes().length === WEATHER_TYPES.length;
}

function updateWeatherToggleButton() {
  selectAllWeatherButton.textContent = allWeatherSelected() ? "清除天气" : "全选天气";
}

function getFilteredRows() {
  const year = selectedYear();
  const weatherTypes = selectedWeatherTypes();

  return allRows.filter((row) => {
    const yearMatches = year === "all" || row.year === Number(year);
    const weatherMatches = weatherTypes.includes(row.weather);
    return yearMatches && weatherMatches;
  });
}

function updateStats(rows) {
  if (!rows.length) {
    statDays.textContent = "0";
    statTemp.textContent = "-";
    statRainDays.textContent = "0";
    statDominant.textContent = "-";
    return;
  }

  const averageMaxTemp = rows.reduce((sum, row) => sum + row.temp_max, 0) / rows.length;
  const rainyDays = rows.filter((row) => row.precipitation > 0).length;
  const weatherCounts = rows.reduce((counts, row) => {
    counts[row.weather] = (counts[row.weather] || 0) + 1;
    return counts;
  }, {});
  const dominantWeather = Object.entries(weatherCounts).sort((a, b) => b[1] - a[1])[0][0];

  statDays.textContent = rows.length.toLocaleString("zh-CN");
  statTemp.textContent = `${averageMaxTemp.toFixed(1)}°C`;
  statRainDays.textContent = rainyDays.toLocaleString("zh-CN");
  statDominant.textContent = `${WEATHER_LABELS[dominantWeather]} / ${dominantWeather}`;
}

function commonColorEncoding() {
  return {
    field: "weather",
    type: "nominal",
    title: "天气类型",
    scale: {
      domain: WEATHER_TYPES,
      range: WEATHER_TYPES.map((type) => WEATHER_COLORS[type])
    },
    legend: {
      orient: "bottom",
      direction: "horizontal",
      titlePadding: 8,
      labelFontSize: 12,
      titleFontSize: 12
    }
  };
}

function tooltipFields(metricKey) {
  const metric = METRICS[metricKey];
  return [
    { field: "date_label", type: "nominal", title: "日期" },
    { field: "year", type: "ordinal", title: "年份" },
    { field: "weather_cn", type: "nominal", title: "天气" },
    { field: "temp_max", type: "quantitative", title: "最高气温", format: ".1f" },
    { field: "temp_min", type: "quantitative", title: "最低气温", format: ".1f" },
    { field: "precipitation", type: "quantitative", title: "降水量", format: ".1f" },
    { field: "wind", type: "quantitative", title: "风速", format: ".1f" },
    { field: metricKey, type: "quantitative", title: `当前指标：${metric.label}`, format: metric.format }
  ];
}

function buildSpec(rows, metricKey) {
  const metric = METRICS[metricKey];
  const brushFilter = { filter: { param: "tempBrush", empty: true } };

  if (!rows.length) {
    return {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: 1020,
      height: 360,
      background: "transparent",
      data: { values: [{ message: "当前筛选没有可显示的数据，请至少选择一种天气类型。" }] },
      mark: { type: "text", fontSize: 18, fontWeight: 700, color: "#6f5145" },
      encoding: {
        text: { field: "message" }
      },
      config: chartConfig()
    };
  }

  const mainChart = {
    title: {
      text: `每日天气时间序列：${metric.label}`,
      subtitle: "颜色表示天气类型；右下角选择后，本图仅显示被选中的气温-降水区间。",
      anchor: "start"
    },
    width: 1040,
    height: 310,
    transform: [brushFilter],
    mark: {
      type: "point",
      filled: true,
      size: 43,
      opacity: 0.68,
      stroke: "#173c3d",
      strokeWidth: 0.25
    },
    encoding: {
      x: {
        field: "date",
        type: "temporal",
        title: "日期",
        axis: { format: "%Y-%m", labelAngle: 0, grid: false }
      },
      y: {
        field: metricKey,
        type: "quantitative",
        title: metric.title,
        scale: { zero: metric.zero, nice: true }
      },
      color: commonColorEncoding(),
      tooltip: tooltipFields(metricKey)
    }
  };

  const monthlyChart = {
    title: {
      text: "月度天气类型分布",
      subtitle: "统计当前筛选与选择范围内各月份的天气天数。",
      anchor: "start"
    },
    width: 500,
    height: 280,
    transform: [
      brushFilter,
      {
        aggregate: [{ op: "count", as: "days" }],
        groupby: ["month", "month_name", "month_order", "weather"]
      }
    ],
    mark: { type: "bar", cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
    encoding: {
      x: {
        field: "month_name",
        type: "ordinal",
        title: "月份",
        sort: { field: "month_order", order: "ascending" },
        axis: { labelAngle: 0 }
      },
      y: {
        field: "days",
        type: "quantitative",
        title: "天数",
        stack: "zero"
      },
      color: commonColorEncoding(),
      order: { field: "weather", sort: "ascending" },
      tooltip: [
        { field: "month_name", type: "ordinal", title: "月份" },
        { field: "weather", type: "nominal", title: "天气类型" },
        { field: "days", type: "quantitative", title: "天数" }
      ]
    }
  };

  const scatterChart = {
    name: "scatter_view",
    title: {
      text: "气温与降水关系",
      subtitle: "拖拽选择点云区域，可联动过滤上方与左侧图表。",
      anchor: "start"
    },
    width: 500,
    height: 280,
    mark: {
      type: "point",
      filled: true,
      size: 48,
      opacity: 0.7,
      stroke: "#173c3d",
      strokeWidth: 0.25
    },
    encoding: {
      x: {
        field: "temp_max",
        type: "quantitative",
        title: "最高气温（°C）",
        scale: { zero: false, nice: true }
      },
      y: {
        field: "precipitation",
        type: "quantitative",
        title: "降水量（mm）",
        scale: { zero: true, nice: true }
      },
      color: commonColorEncoding(),
      tooltip: [
        { field: "date_label", type: "nominal", title: "日期" },
        { field: "weather_cn", type: "nominal", title: "天气" },
        { field: "temp_max", type: "quantitative", title: "最高气温", format: ".1f" },
        { field: "precipitation", type: "quantitative", title: "降水量", format: ".1f" },
        { field: "wind", type: "quantitative", title: "风速", format: ".1f" }
      ]
    }
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    background: "transparent",
    data: { values: rows },
    params: [
      {
        name: "tempBrush",
        views: ["scatter_view"],
        select: {
          type: "interval",
          encodings: ["x", "y"],
          clear: "dblclick",
          translate: true,
          zoom: true
        }
      }
    ],
    vconcat: [
      mainChart,
      {
        hconcat: [monthlyChart, scatterChart],
        spacing: 34
      }
    ],
    spacing: 34,
    resolve: {
      scale: { color: "shared" }
    },
    config: chartConfig()
  };
}

function chartConfig() {
  return {
    view: { stroke: "transparent" },
    axis: {
      labelColor: "#4f625f",
      titleColor: "#244b4d",
      gridColor: "rgba(25, 50, 51, 0.08)",
      tickColor: "rgba(25, 50, 51, 0.22)",
      domainColor: "rgba(25, 50, 51, 0.25)",
      labelFont: "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif",
      titleFont: "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif",
      titleFontWeight: 800
    },
    title: {
      color: "#193233",
      subtitleColor: "#657370",
      font: "Noto Serif SC, Source Han Serif SC, Songti SC, STSong, serif",
      subtitleFont: "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif",
      fontSize: 17,
      subtitleFontSize: 12,
      subtitlePadding: 6,
      offset: 14
    },
    legend: {
      labelColor: "#415b58",
      titleColor: "#244b4d",
      labelFont: "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif",
      titleFont: "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"
    },
    range: {
      category: WEATHER_TYPES.map((type) => WEATHER_COLORS[type])
    }
  };
}

async function renderChart({ clearBrush = false } = {}) {
  const renderToken = ++lastRenderToken;
  const rows = getFilteredRows();
  const metricKey = metricSelect.value;

  updateWeatherToggleButton();
  updateStats(rows);
  statusPill.textContent = rows.length ? `${rows.length.toLocaleString("zh-CN")} 条记录` : "没有匹配记录";

  const spec = buildSpec(rows, metricKey);
  const target = document.querySelector("#vis");
  if (clearBrush) {
    target.replaceChildren();
  }

  try {
    await vegaEmbed(target, spec, {
      actions: false,
      renderer: "svg",
      tooltip: { theme: "light" }
    });

    if (renderToken === lastRenderToken) {
      statusPill.textContent = rows.length
        ? `${rows.length.toLocaleString("zh-CN")} 条记录 · 可交互`
        : "请选择数据";
    }
  } catch (error) {
    console.error(error);
    statusPill.textContent = "图表加载失败";
    target.innerHTML = `<p class="error-message">图表加载失败：${error.message}</p>`;
  }
}

function bindControls() {
  metricSelect.addEventListener("change", () => renderChart({ clearBrush: true }));

  document.querySelectorAll("input[name='year']").forEach((input) => {
    input.addEventListener("change", () => renderChart({ clearBrush: true }));
  });

  document.querySelectorAll("input[name='weather']").forEach((input) => {
    input.addEventListener("change", () => renderChart({ clearBrush: true }));
  });

  selectAllWeatherButton.addEventListener("click", () => {
    const shouldSelectAll = !allWeatherSelected();
    document.querySelectorAll("input[name='weather']").forEach((input) => {
      input.checked = shouldSelectAll;
    });
    renderChart({ clearBrush: true });
  });

  clearBrushButton.addEventListener("click", () => renderChart({ clearBrush: true }));
}

async function init() {
  bindControls();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`无法读取数据文件：${response.status}`);
    }

    allRows = parseCsv(await response.text());
    await renderChart({ clearBrush: true });
  } catch (error) {
    console.error(error);
    statusPill.textContent = "数据加载失败";
    document.querySelector("#vis").innerHTML = `
      <p class="error-message">
        无法加载 <code>${DATA_URL}</code>。请通过 <code>./commands.sh localhost</code>
        启动本地服务器后访问页面，而不是直接用 file:// 打开。
      </p>
    `;
  }
}

init();
