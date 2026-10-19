/* Stride UI helpers. Dependency-free. Exposes window.UI.
 * Every function returns an HTML string. All numbers are clamped; all text is escaped.
 * See design/DESIGN.md for signatures. */
(function (global) {
  'use strict';

  var uid = 0;
  function nextId(p) { uid += 1; return p + uid; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(n, a, b) { n = Number(n); if (!isFinite(n)) n = 0; return Math.max(a, Math.min(b, n)); }
  function f(n) { return Math.round(n * 100) / 100; }
  /* point on circle, angle measured clockwise from 12 o'clock */
  function pt(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }
  function arcPath(cx, cy, r, a0, a1) {
    var p0 = pt(cx, cy, r, a0), p1 = pt(cx, cy, r, a1);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + f(p0[0]) + ' ' + f(p0[1]) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + f(p1[0]) + ' ' + f(p1[1]);
  }

  /* ---------------------------------------------------------------- icons */
  var ICONS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    today: '<path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.2v-5.6H9.2V20H5a1 1 0 0 1-1-1z"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    insights: '<path d="M5.5 20v-8M12 20V5M18.5 20v-5"/>',
    coach: '<path d="M6 5h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6.2L7 20.5V17H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    run: '<circle cx="15.2" cy="4.6" r="1.9"/><path d="m12.6 8.6-2.4 4.7 3.5 2.4-1.5 5M12.6 8.6l3.4 2.3 3.2-.4M10.6 9.8 7.4 11.6M10.2 13.3 7 17.6H4"/>',
    upload: '<path d="M12 16V4.5m0 0L7.8 8.7M12 4.5l4.2 4.2M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 15.5-4.8-4.8-8.2 8.8"/>',
    send: '<path d="M20.5 3.5 10.3 13.7M20.5 3.5 14 20.5l-3.7-6.8L3.5 10z"/>',
    clip: '<path d="m19.5 11.5-7.7 7.7a4.6 4.6 0 0 1-6.5-6.5l8.3-8.3a3 3 0 0 1 4.3 4.3l-8.3 8.3a1.5 1.5 0 0 1-2.1-2.1l7.4-7.4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.6 4.6L19 7.6"/>',
    'chev-r': '<path d="m9 5 7 7-7 7"/>',
    'chev-l': '<path d="m15 5-7 7 7 7"/>',
    'chev-d': '<path d="m5 9 7 7 7-7"/>',
    sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    bolt: '<path d="m13 3-8 10.5h6L10 21l9-11h-6.2z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pace: '<circle cx="12" cy="13.5" r="7"/><path d="m12 13.5 2.8-3M9.5 3h5"/>',
    down: '<path d="m4 8 6 6 3.5-3.5L20 17M20 12v5h-5"/>',
    up: '<path d="m4 16 6-6 3.5 3.5L20 7M20 12V7h-5"/>',
    sparkle: '<path d="m12 3.5 1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9zM19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3.2 4M16 6h3a3 3 0 0 1-3.2 4M12 13.5V17M8.5 20h7M10 17h4"/>',
    edit: '<path d="m4 20 4.2-1L19 8.2 15.8 5 5 15.8z"/>',
    flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    alert: '<path d="m12 4 9 16H3zM12 10v4M12 17v.01"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 4 3 3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    mountain: '<path d="m3 19 6.5-11 4 6.5 2.5-3.5L21 19z"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
  };

  /* icon(name, {size, cls, stroke, label}) -> inline <svg>. Uses currentColor. */
  function icon(name, o) {
    o = o || {};
    var size = o.size || 24;
    var label = o.label ? ' role="img" aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"';
    if (name === 'flame') return flame(size, o.cls);
    var body = ICONS[name] || ICONS.info;
    return '<svg class="icon ' + esc(o.cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (o.stroke || 1.9) + '" stroke-linecap="round" stroke-linejoin="round"' + label + '>' + body + '</svg>';
  }

  /* flame(size) -> two-tone streak flame, always coloured (not currentColor) */
  function flame(size, cls) {
    size = size || 20;
    return '<svg class="icon icon--flame ' + esc(cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12.6 2.2c.4 3-1.2 4.6-2.8 6.5C8.3 10.5 7 12.2 7 14.8c0 3.7 2.5 6.6 5.6 6.6 3.4 0 5.7-2.7 5.7-6.2 0-2.5-1.1-4.2-2.2-5.6-.3 1.3-.9 2.2-1.8 2.6.5-3.5-.3-7.3-1.7-9.9z" fill="#F57A12"/>' +
      '<path d="M12.7 21.4c-2.3 0-4-1.7-4-4 0-1.9 1.2-3.1 2.2-4.2.7-.8 1.3-1.6 1.5-2.8 1.8 1.6 3.6 3.2 3.6 6 0 2.5-1.4 5-3.3 5z" fill="#FFC21F"/></svg>';
  }

  /* ---------------------------------------------------------- arc gauge */
  /* arcGauge({pct, pct2, value, unit, label, status, variant, caption})
   *   variant 'dots' (default): double ring of dots, 216 deg sweep.
   *   variant 'dash': thick rounded dashes, 250 deg sweep, status word.
   *   pct  0-100  green/mint share.   pct2 0-100 extra teal share after pct (optional).
   *   value  big number text (default round(pct)).  unit  small word under number ("PERCENT").
   *   label  text on the curved line above the number (dots) / eyebrow (dash).
   *   status word under number (dash variant, e.g. THRIVING).  caption chip html under gauge. */
  function arcGauge(o) {
    o = o || {};
    var pct = clamp(o.pct, 0, 100), pct2 = clamp(o.pct2 || 0, 0, 100 - pct);
    var value = o.value != null ? o.value : Math.round(pct);
    var variant = o.variant === 'dash' ? 'dash' : 'dots';
    var digits = String(value).length;
    var cls = 'gauge gauge--' + variant + (digits >= 3 ? ' gauge--3d' : '');
    var aria = (o.ariaLabel || (value + (o.unit ? ' ' + o.unit : '') + (o.label ? ', ' + o.label : '') + (o.status ? ', ' + o.status : '')));
    var svg = '', center = '';
    if (variant === 'dots') {
      var cx = 150, cy = 148, sweep = 108;
      var rings = [{ r: 124, n: 32, d: 6.4 }, { r: 106, n: 28, d: 6 }];
      var dots = '';
      rings.forEach(function (ring, ri) {
        for (var i = 0; i < ring.n; i++) {
          var t = i / (ring.n - 1);
          var ang = -sweep + t * sweep * 2;
          var p = pt(cx, cy, ring.r, ang);
          var c = t <= pct / 100 + 1e-6 ? 'g' : (t <= (pct + pct2) / 100 + 1e-6 ? 't' : 'n');
          if (pct === 0 && i === 0 && c === 'g') c = 'n';
          var dist = Math.min(t, 1 - t); /* soft fade of empty dots toward the top, like the reference */
          var op = c === 'n' ? f(0.55 + 0.45 * Math.min(1, dist * 3)) : 1;
          dots += '<circle class="gd gd--' + c + '" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="' + ring.d + '"' + (op < 1 ? ' opacity="' + op + '"' : '') + '/>';
        }
      });
      var pid = nextId('garc');
      var labelSvg = o.label ? '<path id="' + pid + '" d="' + arcPath(cx, cy, 82, -62, 62) + '" fill="none"/><text class="gauge__curve"><textPath href="#' + pid + '" startOffset="50%" text-anchor="middle">' + esc(o.label) + '</textPath></text>' : '';
      svg = '<svg class="gauge__svg" viewBox="0 0 300 192" aria-hidden="true">' + dots + labelSvg + '</svg>';
      center = '<div class="gauge__center"><div class="gauge__num">' + esc(value) + '</div>' + (o.unit ? '<div class="gauge__unit">' + esc(o.unit) + '</div>' : '') + '</div>';
    } else {
      var cx2 = 150, cy2 = 146, half = 125, n = 21, r2 = 112;
      var seg = '';
      var span = (half * 2) / n;
      for (var k = 0; k < n; k++) {
        var mid = -half + (k + 0.5) * span, a0 = mid - 1.1, a1 = mid + 1.1;
        var tt = (k + 0.5) / n;
        var cc = tt <= pct / 100 ? 'g' : (tt <= (pct + pct2) / 100 ? 't' : 'n');
        seg += '<path class="gs gs--' + cc + '" d="' + arcPath(cx2, cy2, r2, a0, a1) + '"/>';
      }
      var eyebrow = o.label ? '<text class="gauge__eyebrow" x="150" y="14" text-anchor="middle">' + esc(o.label) + '</text>' : '';
      svg = '<svg class="gauge__svg" viewBox="0 0 300 236" aria-hidden="true">' + seg + eyebrow + '</svg>';
      center = '<div class="gauge__center"><span class="gauge__face">' + icon(o.glyph || 'run', { size: 22, stroke: 2.2 }) + '</span><div class="gauge__num">' + esc(value) + '</div>' + (o.status ? '<div class="gauge__status">' + esc(o.status) + '</div>' : '') + '</div>';
    }
    return '<div class="' + cls + '" style="--pct:' + pct + ';--pct2:' + pct2 + '" role="img" aria-label="' + esc(aria) + '">' + svg + center + '</div>' +
      (o.caption ? '<div class="gauge__caption">' + o.caption + '</div>' : '');
  }

  /* ----------------------------------------------------------- ring gauge */
  /* ring({pct, pct2, size, stroke, center, color, color2})
   *   center = inner HTML (e.g. '<b class="num num--md">62</b>'). color/color2: css colour values. */
  function ring(o) {
    o = o || {};
    var size = o.size || 104, stroke = o.stroke || 13;
    var pct = clamp(o.pct, 0, 100), pct2 = clamp(o.pct2 || 0, 0, 100 - pct);
    var r = (size - stroke) / 2, c = size / 2;
    var cap = 0; /* gap so round caps do not merge */
    var seg = function (start, len, col) {
      if (len <= 0) return '';
      var L = Math.max(0.001, len - cap);
      return '<circle class="ring__arc" cx="' + c + '" cy="' + c + '" r="' + f(r) + '" pathLength="100" stroke="' + col + '" stroke-dasharray="' + f(L) + ' ' + f(100 - L) + '" stroke-dashoffset="' + f(-start) + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>';
    };
    var col1 = o.color || 'var(--mint)', col2 = o.color2 || 'var(--teal)';
    var svg = '<svg class="ring__svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" fill="none" stroke-width="' + stroke + '" stroke-linecap="round" aria-hidden="true">' +
      '<circle class="ring__track" cx="' + c + '" cy="' + c + '" r="' + f(r) + '"/>' + seg(0.01, pct, col1) + seg(pct + 0.01, pct2, col2) + '</svg>';
    return '<div class="ring" style="--size:' + size + 'px;--pct:' + pct + '" role="img" aria-label="' + esc(o.ariaLabel || (Math.round(pct) + ' percent')) + '">' + svg + (o.center ? '<div class="ring__center">' + o.center + '</div>' : '') + '</div>';
  }

  /* ---------------------------------------------------- slanted segments */
  /* slantBar({segments, filled, filled2, size, tone, vertical, label})
   *   Horizontal row (or vertical stack) of slanted pills. tone: 'mint'|'teal'|'magenta'|'green'.
   *   filled = number of solid segments, filled2 = extra segments in the second tone. size 'sm'|'md'|'lg' */
  function slantBar(o) {
    o = o || {};
    var n = Math.max(1, Math.round(o.segments || 10));
    var a = clamp(Math.round(o.filled || 0), 0, n);
    var b = clamp(Math.round(o.filled2 || 0), 0, n - a);
    var out = '';
    for (var i = 0; i < n; i++) {
      var cls = 'slant__seg' + (i < a ? ' is-on' : (i < a + b ? ' is-on2' : ''));
      out += '<i class="' + cls + '"></i>';
    }
    return '<div class="slant slant--' + (o.size || 'md') + ' slant--' + (o.tone || 'mint') + (o.vertical ? ' slant--v' : '') + '" role="img" aria-label="' + esc(o.label || (a + ' of ' + n)) + '">' + out + '</div>';
  }

  /* weekBars({items:[{label, value, plan, state}], max, step, unit})
   *   Weekly km as columns of stacked slanted pills. Segment = `step` km (default 5).
   *   value = done km, plan = planned km (shown as pale segments above the done ones).
   *   state: 'done' | 'current' | 'peak' (colours the filled segments). */
  function weekBars(o) {
    o = o || {};
    var items = o.items || [];
    var step = o.step || 5;
    var max = o.max || Math.max.apply(null, items.map(function (i) { return Math.max(i.value || 0, i.plan || 0); }).concat([step]));
    var n = Math.ceil(max / step);
    var cols = items.map(function (it) {
      var done = Math.round((it.value || 0) / step);
      var plan = Math.max(Math.round((it.plan || it.value || 0) / step), done);
      var segs = '';
      for (var i = 0; i < n; i++) {
        var cls = 'wbars__seg' + (i < done ? ' is-on' : (i < plan ? ' is-plan' : ''));
        segs += '<i class="' + cls + '"></i>';
      }
      return '<div class="wbars__col wbars__col--' + (it.state || 'done') + '">' +
        '<span class="wbars__val">' + esc(it.value != null ? it.value : '') + '</span>' +
        '<div class="wbars__stack">' + segs + '</div>' +
        '<span class="wbars__lbl">' + esc(it.label) + '</span></div>';
    }).join('');
    return '<div class="wbars" role="img" aria-label="' + esc(o.ariaLabel || 'Weekly kilometres') + '">' + cols + '</div>';
  }

  /* ----------------------------------------------------------- half dot */
  /* halfDot({left, right, size, text}) -> two-tone split dot. left/right are css colours.
   * Defaults reproduce the reference magenta|teal pair. */
  function halfDot(o) {
    o = o || {};
    var st = '--l:' + (o.left || 'var(--magenta)') + ';--r:' + (o.right || 'var(--teal)') + (o.size ? ';--d:' + o.size + 'px' : '');
    return '<span class="hdot" style="' + st + '">' + (o.text ? esc(o.text) : '') + '</span>';
  }

  /* weekStrip(days) -> days: [{d:'M', state, label, today}] ; label is the sr-only text.
   * state: 'done' (solid green) | 'half' (green|teal, ran but not as planned)
   *        | 'planned' (teal outline + half) | 'missed' (magenta|pale) | 'rest' (tiny dot) */
  function weekStrip(days) {
    return '<div class="week" role="list">' + (days || []).map(function (d) {
      var dot;
      switch (d.state) {
        case 'done': dot = '<span class="hdot hdot--done">' + icon('check', { size: 14, stroke: 3 }) + '</span>'; break;
        case 'half': dot = halfDot({ left: 'var(--mint)', right: 'var(--teal)' }); break;
        case 'planned': dot = '<span class="hdot hdot--plan"></span>'; break;
        case 'missed': dot = halfDot({ left: 'var(--magenta)', right: 'var(--track)' }); break;
        default: dot = '<span class="hdot hdot--rest"></span>';
      }
      return '<div class="week__day' + (d.today ? ' is-today' : '') + ' is-' + (d.state || 'rest') + '" role="listitem"' + (d.label ? ' aria-label="' + esc(d.label) + '"' : '') + '>' + dot + '<span class="week__d">' + esc(d.d) + '</span>' + '<span class="week__km">' + (d.km != null ? esc(d.km) : '\u2013') + '</span>' + '</div>';
    }).join('') + '</div>';
  }

  /* ----------------------------------------------------------- line chart */
  /* lineChart({data, labels, color, height, min, max, invert, fmt, ticks, target, area, unit})
   *   data: numbers (null = gap).  invert: true for pace (faster = up).
   *   fmt(v) -> axis label string.  target: optional value drawn as dashed line.
   *   Returns an <svg class="chart"> (width 100% of container, viewBox 330 x height). */
  function lineChart(o) {
    o = o || {};
    var W = 330, H = o.height || 150, padL = 34, padR = 14, padT = 14, padB = 26;
    var data = o.data || [];
    var vals = data.filter(function (v) { return v != null; });
    var lo = o.min != null ? o.min : Math.min.apply(null, vals);
    var hi = o.max != null ? o.max : Math.max.apply(null, vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    var fmt = o.fmt || function (v) { return String(Math.round(v)); };
    var col = o.color || 'var(--teal)';
    var n = data.length;
    var x = function (i) { return padL + (n <= 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (n - 1)); };
    var y = function (v) { var t = (v - lo) / (hi - lo); if (o.invert) t = 1 - t; return padT + (1 - t) * (H - padT - padB); };
    var pts = [];
    data.forEach(function (v, i) { if (v != null) pts.push([x(i), y(v), i]); });
    var d = '';
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) { d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]); continue; }
      var p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)];
      var t = 0.18;
      d += ' C' + f(p1[0] + (p2[0] - p0[0]) * t) + ' ' + f(p1[1] + (p2[1] - p0[1]) * t) + ' ' + f(p2[0] - (p3[0] - p1[0]) * t) + ' ' + f(p2[1] - (p3[1] - p1[1]) * t) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    var ticks = o.ticks || 3, grid = '';
    for (var g = 0; g < ticks; g++) {
      var v = lo + (hi - lo) * g / (ticks - 1);
      var gy = f(y(v));
      grid += '<line class="chart__grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/><text class="chart__y" x="' + (padL - 8) + '" y="' + (Number(gy) + 3.5) + '" text-anchor="end">' + esc(fmt(v)) + '</text>';
    }
    var xl = '';
    (o.labels || []).forEach(function (lb, i) {
      if (lb === '' || lb == null) return;
      xl += '<text class="chart__x" x="' + f(x(i)) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(lb) + '</text>';
    });
    var gid = nextId('cg');
    var area = '';
    if (o.area !== false && pts.length > 1) {
      area = '<path d="' + d + ' L' + f(pts[pts.length - 1][0]) + ' ' + (H - padB) + ' L' + f(pts[0][0]) + ' ' + (H - padB) + ' Z" fill="url(#' + gid + ')"/>';
    }
    var target = '';
    if (o.target != null) {
      var ty = f(y(o.target));
      target = '<line class="chart__target" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + ty + '" y2="' + ty + '"/>';
    }
    var last = pts[pts.length - 1], dots = '';
    pts.forEach(function (p, i) {
      if (i !== pts.length - 1) dots += '<circle cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="3" class="chart__pt" style="stroke:' + col + '"/>';
    });
    var endDot = last ? '<circle cx="' + f(last[0]) + '" cy="' + f(last[1]) + '" r="9" fill="' + col + '" opacity=".18"/><circle cx="' + f(last[0]) + '" cy="' + f(last[1]) + '" r="5.2" fill="' + col + '" stroke="#fff" stroke-width="2.5"/>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.ariaLabel || 'Trend chart') + '" style="--c:' + col + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".24"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      grid + target + area + (d ? '<path class="chart__line" d="' + d + '" stroke="' + col + '"/>' : '') + dots + endDot + xl + '</svg>';
  }

  global.UI = {
    esc: esc, icon: icon, flame: flame,
    arcGauge: arcGauge, ring: ring, slantBar: slantBar, weekBars: weekBars,
    halfDot: halfDot, weekStrip: weekStrip, lineChart: lineChart
  };
})(window);
