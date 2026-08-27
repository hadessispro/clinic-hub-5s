import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkPointComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
]);

export const MARKETING_COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#2563eb', '#7c3aed', '#ef4444', '#06b6d4', '#84cc16'];

const baseText = { color: '#173b35', fontFamily: 'Inter, system-ui, sans-serif' };

export function initMarketingChart(elementId, option) {
  const element = document.getElementById(elementId);
  if (!element) return null;
  const existing = echarts.getInstanceByDom(element);
  if (existing) existing.dispose();
  const chart = echarts.init(element, null, { renderer: 'canvas' });
  chart.setOption({
    animationDuration: 700,
    animationEasing: 'cubicOut',
    color: MARKETING_COLORS,
    textStyle: baseText,
    tooltip: { trigger: 'item', confine: true, backgroundColor: '#123c35', borderWidth: 0, textStyle: { color: '#fff' } },
    ...option,
  });
  return chart;
}

export function funnelOption(totals = {}) {
  const stages = [
    ['Tổng hồ sơ', Number(totals.total || 0)],
    ['Đã liên hệ', Number(totals.contacted_count || 0) + Number(totals.appointment_count || 0) + Number(totals.visited_count || 0) + Number(totals.converted || 0)],
    ['Đã hẹn khám', Number(totals.appointment_count || 0) + Number(totals.visited_count || 0) + Number(totals.converted || 0)],
    ['Đã đến khám', Number(totals.visited_count || 0) + Number(totals.converted || 0)],
    ['Chốt thành công', Number(totals.converted || 0)],
  ];
  const total = Math.max(stages[0][1], 1);
  const stageDetails = stages.map(([name, value], index) => {
    const previous = index ? stages[index - 1][1] : value;
    return {
      name,
      value,
      totalRate: Math.round(value / total * 1000) / 10,
      stepRate: index ? Math.round(value / Math.max(previous, 1) * 1000) / 10 : 100,
      dropped: index ? Math.max(previous - value, 0) : 0,
    };
  });
  const compactNumber = (value) => Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(Number(value) >= 10000 ? 0 : 1)}k` : Number(value).toLocaleString('vi-VN');
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#8b5cf6', width: 1, type: 'dashed' } },
      formatter: (params) => {
        const index = params[0]?.dataIndex || 0;
        const item = stageDetails[index];
        return `<b>${item.name}</b><br><span style="font-size:20px;font-weight:900;color:#c4b5fd">${Number(item.value).toLocaleString('vi-VN')}</span> hồ sơ<br><span style="color:#d9d6fe">${item.totalRate}% trên tổng pipeline</span><br>Giữ lại từ bước trước: <b>${item.stepRate}%</b>${index ? `<br>Rơi rụng: ${Number(item.dropped).toLocaleString('vi-VN')} hồ sơ` : ''}`;
      },
    },
    grid: { left: 18, right: 22, top: 42, bottom: 20, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['Tổng hồ sơ', 'Đã liên hệ', 'Đã hẹn khám', 'Đã đến khám', 'Chốt thành công'],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#d8e2df' } },
      axisLabel: { color: '#526d66', fontWeight: 750, fontSize: 11, interval: 0, margin: 14 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#8a9d98', formatter: compactNumber },
      splitLine: { lineStyle: { color: '#e8eeec', type: 'dashed' } },
    },
    series: [{
      name: 'Hồ sơ',
      type: 'line',
      step: 'middle',
      smooth: false,
      symbol: 'circle',
      symbolSize: 11,
      showSymbol: true,
      data: stageDetails.map((item) => item.value),
      lineStyle: { color: '#7c3aed', width: 4, shadowBlur: 10, shadowColor: 'rgba(124,58,237,.24)' },
      itemStyle: { color: '#ffffff', borderColor: '#7c3aed', borderWidth: 4 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(139,92,246,.55)' },
          { offset: 0.55, color: 'rgba(167,139,250,.24)' },
          { offset: 1, color: 'rgba(237,233,254,.08)' },
        ]),
      },
      label: {
        show: true,
        position: 'top',
        distance: 10,
        color: '#5b21b6',
        fontSize: 12,
        fontWeight: 900,
        backgroundColor: 'rgba(255,255,255,.92)',
        borderColor: '#ddd6fe',
        borderWidth: 1,
        borderRadius: 7,
        padding: [4, 7],
        formatter: ({ value }) => Number(value).toLocaleString('vi-VN'),
      },
      emphasis: {
        focus: 'series',
        scale: 1.35,
        lineStyle: { width: 5 },
      },
    }],
  };
}

export function dataClassOption(totals = {}) {
  const raw = Number(totals.raw_count || 0);
  const net = Number(totals.net_count || 0);
  const total = Number(totals.total || raw + net);
  return {
    title: { text: total.toLocaleString('vi-VN'), subtext: 'TỔNG HỒ SƠ', left: 'center', top: '37%', textStyle: { color: '#123c35', fontSize: 24, fontWeight: 800 }, subtextStyle: { color: '#78908b', fontSize: 10, fontWeight: 700 } },
    legend: { bottom: 2, icon: 'circle', itemWidth: 9, textStyle: { color: '#425f59', fontWeight: 700 } },
    series: [{ type: 'pie', radius: ['58%', '80%'], center: ['50%', '43%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 5, borderRadius: 8 }, label: { show: false },
      emphasis: { scaleSize: 8, label: { show: true, formatter: '{b}\n{c} · {d}%', fontWeight: 800, color: '#123c35' } },
      data: [{ name: 'Data thô', value: raw }, { name: 'Data net', value: net, itemStyle: { color: '#f59e0b' } }],
    }],
  };
}

export function sourceOption(rows = []) {
  const data = rows.slice(0, 10).reverse();
  return {
    grid: { left: 18, right: 26, top: 12, bottom: 18, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#78908b' }, splitLine: { lineStyle: { color: '#edf3f1' } } },
    yAxis: { type: 'category', data: data.map((row) => row.source || 'Khác'), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#425f59', fontWeight: 700, width: 125, overflow: 'truncate' } },
    series: [{ type: 'bar', data: data.map((row) => Number(row.total || 0)), barMaxWidth: 24, showBackground: true, backgroundStyle: { color: '#edf5f2', borderRadius: 8 }, itemStyle: { borderRadius: [0, 8, 8, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#0f766e' }, { offset: 1, color: '#2dd4bf' }]) }, label: { show: true, position: 'right', color: '#123c35', fontWeight: 800, formatter: ({ value }) => Number(value).toLocaleString('vi-VN') } }],
  };
}

export function roleOption(rows = [], labels = {}) {
  return {
    legend: { type: 'scroll', bottom: 0, icon: 'circle', itemWidth: 9, textStyle: { color: '#425f59', fontWeight: 700 } },
    series: [{ type: 'pie', radius: ['43%', '72%'], center: ['50%', '43%'], roseType: 'radius',
      itemStyle: { borderColor: '#fff', borderWidth: 4, borderRadius: 9 },
      label: { color: '#425f59', fontWeight: 800, formatter: '{b}\n{c}' }, labelLine: { length: 12, length2: 8 },
      data: rows.map((row) => ({ name: labels[row.role] || row.role, value: Number(row.total || 0) })),
    }],
  };
}

export function trendOption(rows = []) {
  return {
    tooltip: { trigger: 'axis', formatter: (items) => `${items[0]?.axisValue}<br><b>${Number(items[0]?.value || 0).toLocaleString('vi-VN')} hồ sơ</b>` },
    grid: { left: 18, right: 24, top: 24, bottom: 20, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: rows.map((row) => row.report_day), axisLine: { lineStyle: { color: '#dce8e4' } }, axisLabel: { color: '#78908b' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#78908b' }, splitLine: { lineStyle: { color: '#edf3f1' } } },
    series: [{ type: 'line', smooth: .42, symbol: 'circle', symbolSize: 8, data: rows.map((row) => Number(row.total || 0)), lineStyle: { width: 4, color: '#0f766e' }, itemStyle: { color: '#fff', borderColor: '#0f766e', borderWidth: 3 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(20,184,166,.38)' }, { offset: 1, color: 'rgba(20,184,166,.02)' }]) }, markPoint: { data: [{ type: 'max', name: 'Cao nhất' }], symbolSize: 44, label: { fontWeight: 800 } } }],
  };
}

export function staffOption(rows = []) {
  const data = rows.slice(0, 10).reverse();
  return {
    grid: { left: 18, right: 28, top: 12, bottom: 18, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#78908b' }, splitLine: { lineStyle: { color: '#edf3f1' } } },
    yAxis: { type: 'category', data: data.map((row) => row.full_name || row.telesale_code), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#425f59', fontWeight: 700, width: 135, overflow: 'truncate' } },
    series: [{ type: 'bar', barMaxWidth: 24, data: data.map((row) => Number(row.assigned || 0)), itemStyle: { borderRadius: [0, 8, 8, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#2563eb' }, { offset: 1, color: '#06b6d4' }]) }, label: { show: true, position: 'right', color: '#123c35', fontWeight: 800, formatter: ({ value }) => Number(value).toLocaleString('vi-VN') } }],
  };
}

export function branchOption(rows = []) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, textStyle: { color: '#425f59', fontWeight: 700 } },
    grid: { left: 20, right: 20, top: 20, bottom: 42, containLabel: true },
    xAxis: { type: 'category', data: rows.map((row) => row.branch_id), axisLabel: { color: '#425f59', fontWeight: 700 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#78908b' }, splitLine: { lineStyle: { color: '#edf3f1' } } },
    series: [
      { name: 'Tổng hồ sơ', type: 'bar', data: rows.map((row) => Number(row.total || 0)), barMaxWidth: 34, itemStyle: { color: '#0f766e', borderRadius: [7, 7, 0, 0] } },
      { name: 'Chốt thành công', type: 'bar', data: rows.map((row) => Number(row.converted || 0)), barMaxWidth: 34, itemStyle: { color: '#f59e0b', borderRadius: [7, 7, 0, 0] } },
    ],
  };
}

export function resizeMarketingCharts(charts) {
  charts.filter(Boolean).forEach((chart) => chart.resize());
}
