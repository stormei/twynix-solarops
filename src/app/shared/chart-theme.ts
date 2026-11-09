import {EChartsCoreOption} from 'echarts/core';
import {ThemeMode} from '../core/theme';

// Apply the same semantic palette to every chart, including engineering axes,
// categorical timelines, monthly bars, tooltips and downloaded chart images.
export function themedChart(option: EChartsCoreOption, mode: ThemeMode): EChartsCoreOption {
  const light = mode === 'light';
  const text = light ? '#546576' : '#9cabb9';
  const grid = light ? '#dde4ea' : '#2c3a47';
  const surface = light ? '#ffffff' : '#1b2834';
  const foreground = light ? '#1b2b3b' : '#e6edf3';
  const colors: Record<string,string> = {'#51adff':'#176eaa','#50adff':'#176eaa','#4ea8ff':'#176eaa','#8d8efb':'#6b58bb','#59bdba':'#137f81','#e5b669':'#996917','#eeae60':'#ac6b20','#59b6ff':'#176eaa','#3e7ab2':'#567e9f'};
  const recolor = (value: any): any => {
    if (typeof value === 'string') return colors[value.slice(0,7).toLowerCase()] ? colors[value.slice(0,7).toLowerCase()] + value.slice(7) : value;
    if (Array.isArray(value)) return value.map(recolor);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,recolor(v)]));
    return value;
  };
  if (light) option = recolor(option);
  const axes = (axis: any): any => Array.isArray(axis) ? axis.map(axes) : axis ? {
    ...axis,
    axisLabel: {...axis.axisLabel, color: text},
    nameTextStyle: {...axis.nameTextStyle, color: text},
    axisPointer: {...axis.axisPointer, label: {backgroundColor: surface, color: foreground}},
    splitLine: {...axis.splitLine, lineStyle: {...axis.splitLine?.lineStyle, color: grid, type: 'solid'}},
  } : axis;
  const zoom = option['dataZoom'] as any[] | undefined;
  return {
    ...option,
    textStyle: {fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', color: text},
    xAxis: axes(option['xAxis']),
    yAxis: axes(option['yAxis']),
    tooltip: {...option['tooltip'] as object, backgroundColor: surface, borderColor: grid, textStyle: {color: foreground}},
    legend: {...option['legend'] as object, textStyle: {color: text}},
    dataZoom: zoom?.map(z => z.type === 'slider' ? {
      ...z, backgroundColor: light ? '#edf1f5' : '#111a23',
      fillerColor: light ? '#196f9d22' : '#64b4e533', textStyle: {color: text},
      dataBackground: {lineStyle: {color: text}, areaStyle: {color: grid}},
      selectedDataBackground: {lineStyle: {color: light ? '#1c6b9d' : '#72bce9'}, areaStyle: {color: light ? '#b5d0e2' : '#29485e'}},
    } : z),
  };
}
