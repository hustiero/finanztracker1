/* ============================================================
   charts.js — Pure SVG chart builder utilities
   No dependencies on app state; takes plain data, returns strings.
   Load order: after groups.js, before render.js and portfolio.js
   ============================================================ */

/**
 * Donut ring chart.
 * segments: [{name, amt, color}]  total: number  size?: number (default 100)
 * Returns SVG string or '' if no data.
 */
function buildDonutSVG(segments, total, size=100){
  if(!total || !segments.length) return '';
  const r=42, ir=26, cx=size/2, cy=size/2;
  let paths='', angle=-Math.PI/2;
  segments.forEach(seg=>{
    const frac = seg.amt/total;
    if(frac<0.001) return;
    const endA = angle + frac*2*Math.PI;
    const largeArc = frac>0.5?1:0;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(endA), y2=cy+r*Math.sin(endA);
    const ix1=cx+ir*Math.cos(endA), iy1=cy+ir*Math.sin(endA);
    const ix2=cx+ir*Math.cos(angle), iy2=cy+ir*Math.sin(angle);
    const d=`M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} A${ir} ${ir} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}Z`;
    paths+=`<path d="${d}" fill="${seg.color}" opacity="0.9"/>`;
    angle=endA;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="flex-shrink-0">${paths}</svg>`;
}

/**
 * Compute pie slices from a generic data array.
 * data:  [{value, color, ...rest}]
 * total: pre-computed sum of values
 * cx, cy, r: SVG center and radius
 * Returns [{...rest, value, color, path, pct}]
 */
function buildPieSlices(data, total, cx, cy, r){
  let angle = -Math.PI/2;
  return data.map(d=>{
    const frac = d.value/total, sweep = frac*2*Math.PI, ea = angle+sweep, la = frac>0.5?1:0;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(ea),   y2=cy+r*Math.sin(ea);
    const path = frac > 0.9999
      ? `M${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} A${r},${r} 0 1 1 ${cx-r},${cy}`
      : `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${la} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    angle = ea;
    return {...d, path, pct:(frac*100).toFixed(1)};
  });
}

/**
 * Monthly bar chart SVG.
 * monthLabels: [{key:'YYYY-MM', label:'M.YY'}, ...]  (12 items)
 * monthData:   {[key:string]: number}
 * maxAmt:      number — the maximum value (for scaling)
 * barColor:    CSS color string
 * W?, H?:      optional dimensions (default 320×72)
 * Returns SVG string.
 */
function buildBarChartSVG(monthLabels, monthData, maxAmt, barColor, W=320, H=72){
  const padB=16, padT=4, chartH=H-padB-padT;
  const months = monthLabels.length;
  const barW = Math.max(1, W/months-2);
  const bars = monthLabels.map((m,i)=>{
    const amt = monthData[m.key]||0;
    const bh = amt>0 ? Math.max(2,(amt/maxAmt)*chartH) : 0;
    const x = i*(W/months), y = padT+chartH-bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${barColor}" opacity="0.75" rx="1"/>`;
  });
  const labels = monthLabels.map((m,i)=>{
    if(i%3!==0 && i!==months-1) return '';
    return `<text x="${(i*(W/months)).toFixed(1)}" y="${H-3}" font-size="8" fill="var(--text3)" font-family="DM Mono,monospace">${m.label}</text>`;
  }).filter(Boolean);
  return `<svg viewBox="0 0 ${W} ${H}" height="${H}" class="w-full">${bars.join('')}${labels.join('')}</svg>`;
}
