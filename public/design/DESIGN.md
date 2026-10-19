# Stride design contract

Light theme only. Link `styles.css` and `design/ui.js` (`window.UI`). 390px target, works 360-430px. Fonts self-hosted in `public/fonts` (Rubik variable for numerals/display, Outfit variable for body). Every class below exists in `styles.css`; `design/gallery.html` renders all of them with sample data.

Page boilerplate:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="stylesheet" href="styles.css"><script src="design/ui.js"></script>
```

## 1. Shell and safe areas
```html
<div class="app">
  <section class="screen" id="screen-today"> ...header, cards... </section>
  <nav class="nav">...</nav>            <!-- once, fixed -->
  <div class="toast-wrap"></div>        <!-- once, toasts go in here -->
  <div class="overlay">...</div>        <!-- sheets/modals, once each -->
</div>
```
- `.app` centres to max 430px and paints the page gradient. `.screen` pads for `env(safe-area-inset-*)` and leaves room for the nav (`--nav-space`). Show one `.screen` at a time (use `hidden`).
- Coach screen: `<section class="screen screen--coach">` (flex column, full height; `.chat` scrolls, `.chips` and `.composer` pinned under it).
- Layout helpers: `.stack` / `.stack--sm` (column gap), `.row`, `.row--between`, `.grid-2`, `.section-title` (`<div class="section-title">Title <small>meta</small></div>`), `.sr-only`.
- Typography: `.label` (tiny tracked uppercase), `.num` + `.num--sm|md|lg|xl` (heavy numerals), `<span class="num__unit">km</span>` inside `.num`, `.muted`. Colour: `.num--green|teal|magenta|violet`.

## 2. Header + streak pill
```html
<header class="hdr">
  <div class="hdr__text"><div class="hdr__eyebrow">Fri 23 Oct</div><h1 class="hdr__title">Morning, Aksh</h1></div>
  <div class="hdr__actions">
    <button class="streak-pill" aria-label="12 day streak">${UI.flame(20)}12</button>
    <button class="icon-btn" aria-label="Menu">${UI.icon('menu')}</button>
  </div>
</header>
```

## 3. Buttons
- `.btn.btn--primary` big green pill (add `.btn--block` for full width). Others: `.btn--secondary` (ink), `.btn--soft`, `.btn--ghost`, `.btn--text`, size `.btn--sm`. Disable with `disabled`.
- `.icon-btn` (44px circle) + `.icon-btn--green|ink|bare`.
```html
<button class="btn btn--primary btn--block">${UI.icon('run',{size:22})}Log this run</button>
```

## 4. Cards
```html
<div class="card [card--cream|card--flat|card--tint-teal|card--tint-mint|card--tint-magenta|card--pad-sm|card--pad-lg]">
  <div class="card__head"><span class="card__icon" style="--c:var(--magenta)">${UI.icon('heart')}</span><span class="card__title">Avg heart rate</span><span class="card__meta">7 days</span></div>
  ...content...
  <div class="card__foot"><span>left</span><span>right</span></div>
</div>
```
Small grid stat cards: `<div class="grid-2"><div class="card stat-card"><div class="card__head">..</div><div class="stat-card__body stat-card__body--center">ring or bars</div></div> ... </div>`. `.stat-pair b` (+ `.teal`/`.magenta`) for small numbers above stacked bars.
Pills: `.pill`, `.pill--type` with `data-type="easy|tempo|long|intervals|recovery"` (sets colour), `.pill--ok|warn|bad`. Delta chip: `<span class="delta [delta--up|delta--down]"><b>-0:21</b> faster</span>`.
`data-type` on any element sets `--type`.

## 5. Gauges (JS helpers, see section 17)
- Dotted arc (Today): `UI.arcGauge({pct:35, value:35, unit:'PERCENT', label:'WEEK COMPLETE', caption:'<span class="delta"><b>11.2</b> of 32 km</span>'})`.
- Dash arc (Insights): `UI.arcGauge({variant:'dash', pct:75, value:75, status:'THRIVING', label:'RACE READINESS'})`.
- Ring: `UI.ring({pct:35, pct2:25, size:118, stroke:14, center:'<b class="num">11.2</b><small>of 32 km</small>'})`.
CSS variables written inline for the engineer: `--pct`, `--pct2` on `.gauge`, `--size`,`--pct` on `.ring`. Re-render by replacing `outerHTML`/`innerHTML` (they are pure functions).

## 6. Slanted segment bars
`UI.slantBar({segments:12, filled:7, filled2:3, tone:'mint|teal|magenta|green', size:'sm|md|lg', vertical:false})`. Vertical stack (long-run card): `vertical:true` inside a flex child. Labelled row:
```html
<div class="bar-row is-current"><span class="bar-row__lbl">Wk 4</span>${UI.slantBar({segments:16,filled:7,tone:'teal',size:'sm'})}<span class="bar-row__val">14 km</span></div>
```
Weekly km columns: `UI.weekBars({max:40, step:5, items:[{label:'W-1', value:30, plan:30, state:'done|current|peak'}]})` (one segment = `step` km; done = solid, remaining plan = pale).

## 7. Half dots + week strip
`UI.halfDot({left:'var(--magenta)', right:'var(--teal)', size:30})`.
`UI.weekStrip([{d:'M', state:'half', km:'5.2', today:false, label:'a11y text'}, ...7 items])`. States: `done` (solid green + check), `half` (green|teal: ran, but short/changed), `planned` (teal split), `missed` (magenta|pale), `rest` (small dot). Wrap in `<div class="card card--pad-sm">`.

## 8. Stat trio
```html
<div class="trio">
  <div class="trio__item trio__item--gold|violet|flame">
    <span class="trio__badge">${UI.icon('trophy')}</span><span class="trio__num">18</span><span class="trio__unit">days</span><span class="trio__label">Best streak</span>
  </div>  x3
</div>
```

## 9. Hero run card (Today)
```html
<article class="card run-hero" data-type="tempo">
  <div class="run-hero__top"><span class="pill pill--type" data-type="tempo">Tempo</span><span class="label">Fri 23 Oct</span></div>
  <div class="run-hero__dist"><span class="num">8.0</span><span class="unit">km</span></div>
  <p class="run-hero__what">2 km easy, 4 km tempo, 2 km cool down</p>
  <div class="run-hero__meta">
    <div class="meta-cell"><span class="label">Target pace</span><span class="num">5:25<span class="num__unit">/km</span></span><small>tempo block</small></div>
    <div class="meta-cell"><span class="label">Heart rate</span><span class="num">Z4<span class="num__unit">162-172</span></span><small>bpm</small></div>
  </div>
  <div class="coach-note"><span class="avatar">${UI.icon('sparkle')}</span><p><b>Why tempo today:</b> reason text</p></div>
</article>
```
Rest day: use `data-type="rest"`, distance `Rest`.

## 10. Plan: countdown, phases, week rows
```html
<article class="card countdown">
  <div class="countdown__top">
    <div><span class="label">Race day · 10 Oct 2027</span><div class="countdown__days" style="margin-top:8px"><span class="num">356</span><span>days</span></div></div>
    <div class="countdown__target"><span class="label">Target</span><div class="num">4:15:00</div><span class="muted">6:03 /km</span></div>
  </div>
  <div class="countdown__bar">${UI.slantBar({segments:20,filled:1,tone:'green'})}<div class="countdown__scale"><span class="label">Week 3</span><span class="label">of 51</span></div></div>
</article>
<div class="phase" data-phase="base|build|peak|taper">
  <div class="phase__head"><span class="phase__dot"></span><span class="phase__name">Base</span><span class="phase__range">Wk 1-12</span><span class="phase__km">240 km</span></div>
  <div class="week-row [is-done|is-current]">
    <span class="week-row__tag">This week</span>               <!-- only on is-current -->
    <div class="week-row__lead"><span class="week-row__wk">Wk 3</span><span class="week-row__km">32<small>km</small></span></div>
    <div class="week-row__sessions">
      <span class="session" data-type="tempo"><span class="session__d">F</span><b>8</b></span> ...
    </div>
  </div>
</div>
```
`is-done` shows the green tick automatically.

## 11. Chart cards
```html
<article class="card chart-card">
  <div class="chart-card__head"><div><span class="label">Avg pace</span><div class="chart-card__value"><span class="num">6:08</span><span class="muted">/km</span></div></div><span class="delta delta--up"><b>-0:21</b> faster</span></div>
  ${UI.lineChart({data:[...], labels:[...], color:'var(--teal)', invert:true, min:6, max:6.8, fmt:v=>..})}
</article>
```
Cream "weekly" card: `.card.card--cream` containing `UI.weekBars`.

## 12. Chat
```html
<section class="screen screen--coach">
  <header class="hdr">..</header>
  <div class="chat">
    <span class="pill chat__day">Today</span>
    <div class="bubble-row"><span class="avatar avatar--sm">${UI.icon('sparkle')}</span><div class="bubble"><p>text</p><span class="bubble__meta">Coach · 9:02</span></div></div>
    <div class="bubble-row bubble-row--user"><div class="bubble bubble--user">text<span class="bubble__meta">9:04</span></div></div>
    <div class="bubble-row"><span class="avatar avatar--sm">..</span><div class="bubble bubble--typing" aria-label="Coach is typing"><i></i><i></i><i></i></div></div>
  </div>
  <div class="chips" role="group"><button class="chip">Reply</button></div>   <!-- .is-selected optional -->
  <div class="composer">
    <button class="icon-btn" aria-label="Attach screenshot">${UI.icon('clip')}</button>
    <label class="composer__field"><span class="sr-only">Message</span><input class="composer__input" placeholder="Ask your coach..."></label>
    <button class="icon-btn icon-btn--green" aria-label="Send">${UI.icon('send')}</button>
  </div>
</section>
```
Attachment inside a user bubble: `<div class="bubble__attach"><span class="thumb">icon</span>name.png</div>`. Scroll `.chat` to bottom after appending.

## 13. Bottom nav + FAB
```html
<nav class="nav" aria-label="Main">
  <button class="nav__item" aria-current="page">${UI.icon('today')}<span>Today</span></button>
  <button class="nav__item">${UI.icon('plan')}<span>Plan</span></button>
  <button class="nav__fab" aria-label="Log run">${UI.icon('run')}</button>
  <button class="nav__item">${UI.icon('insights')}<span>Insights</span></button>
  <button class="nav__item">${UI.icon('coach')}<span>Coach</span></button>
</nav>
```
Active tab: `aria-current="page"` only.

## 14. Overlays: backdrop, sheet, modal
Toggle `is-open` on `.overlay` (visibility and transitions are handled). Close on `.backdrop` click.
```html
<div class="overlay [overlay--modal for centred modal]" role="dialog" aria-modal="true" aria-label="Log your run">
  <div class="backdrop"></div>
  <div class="sheet">
    <div class="sheet__grab"></div>
    <div class="sheet__head"><div><h2 class="sheet__title">Log your run</h2><p class="sheet__sub">sub</p></div><button class="icon-btn" aria-label="Close">${UI.icon('close')}</button></div>
    <div class="stepper"><i class="is-on"></i><i></i><i></i></div>   <!-- 3-step slanted progress -->
    <div class="sheet__body">...</div>
    <div class="sheet__foot"><button class="btn btn--primary btn--block">Confirm &amp; update plan</button><button class="btn btn--text">Back</button></div>
  </div>
</div>
```
Modal (streak / result): replace `.sheet` with
```html
<div class="modal [modal--wide]"><div class="confetti"><i></i> x8</div>
  <div class="modal__icon">${UI.flame(64)}</div>
  <h2 class="modal__title"><span class="num">13</span> Day Streak</h2>
  <p class="modal__text">text</p>
  <ul class="change-list">   <!-- result modal only, use modal--wide -->
    <li class="change" style="--c:var(--mint)"><span class="change__icon">${UI.icon('up')}</span><div><div class="change__t">Saturday long run</div><div class="change__s">why</div></div><span class="change__delta">12 → 14 km</span></li>
  </ul>
  <button class="btn btn--primary">Let's go</button>
</div>
```

## 15. Log flow pieces
- Dropzone: `<label class="dropzone"><input type="file" accept="image/*"><span class="dropzone__icon">${UI.icon('upload')}</span><span class="dropzone__title">..</span><span class="dropzone__hint">..</span></label>`; add `.is-over` on dragover.
- Preview: `<div class="preview"><img class="preview__img" src alt><div class="preview__info"><div class="preview__name"></div><div class="preview__size"></div></div><button class="icon-btn icon-btn--bare">x</button></div>`.
- Loading step: `<div class="scan"><div class="spinner" role="status"></div><div>title + <p class="muted"></p></div>` plus skeletons.
- Editable fields: `<div class="field-grid">` of `<label class="field-card [is-edited|is-warn|field-card--wide]"><span class="label">Distance</span><span class="field-card__row"><input class="field-card__input" value="8.02" inputmode="decimal"><span class="field-card__unit">km</span></span></label>`. Use `is-edited` when the user changed a value, `is-warn` (shows a CHECK tag) for low-confidence extraction.

## 16. Forms, tabs, toast, skeleton, empty
- `.field > label.field__label + .input|.select|.textarea (+ .field__hint)`; two columns `.field-row`; time inputs `.input.input--time`; switch `<label class="toggle"><span>text</span><input type="checkbox"><span class="toggle__track"></span></label>`. Inputs are 16px to avoid iOS zoom.
- Segmented tabs: `<div class="seg" role="tablist"><button class="seg__btn" role="tab" aria-selected="true">Week</button>...</div>`.
- Toast: append to `.toast-wrap`: `<div class="toast [toast--warn|toast--error]" role="status"><span class="toast__icon">${UI.icon('check')}</span>Plan updated</div>`; remove after ~3s.
- Skeleton: `.skeleton` + `.skeleton--line (.w-40|.w-60|.w-80)`, `--num`, `--circle`, `--card`.
- Empty: `<div class="empty"><svg class="empty__art">..</svg><h3 class="empty__title"></h3><p class="empty__text"></p><button class="btn btn--primary">..</button></div>` (art can be `UI.arcGauge` or any svg).

## 17. ui.js API (all return HTML strings, escape text)
| Function | Options |
|---|---|
| `UI.icon(name, {size=24, cls, stroke, label})` | names: menu today plan insights coach plus run upload image send clip close check chev-r chev-l chev-d sliders bolt heart clock pace down up sparkle trophy edit flag info alert key user refresh calendar mountain moon lock flame |
| `UI.flame(size)` | two-tone streak flame |
| `UI.arcGauge({pct, pct2, value, unit, label, status, variant:'dots'\|'dash', glyph, caption, ariaLabel})` | pct 0-100 mint/green, pct2 extra teal share |
| `UI.ring({pct, pct2, size=104, stroke=13, color, color2, center, ariaLabel})` | `center` is inner HTML |
| `UI.slantBar({segments, filled, filled2, tone, size, vertical, label})` | |
| `UI.weekBars({items:[{label,value,plan,state}], max, step, ariaLabel})` | |
| `UI.halfDot({left, right, size, text})` | css colours |
| `UI.weekStrip(days)` | `{d, state, km, today, label}` |
| `UI.lineChart({data, labels, color, height=150, min, max, invert, fmt, ticks, target, area, ariaLabel})` | `invert:true` for pace |
| `UI.esc(str)` | HTML escape |

Run-type colours: easy teal, tempo magenta, long mint, intervals violet, recovery gold. Phase colours: base teal, build mint, peak magenta, taper violet.
