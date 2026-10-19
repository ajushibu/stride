# Design review (self-critique against the five reference screenshots)

Process: gallery rendered with Playwright (390x844, DPR 2) to `design/shots/`, compared to the references, fixed, re-rendered. Rounds: (1) first render, (2) gauge number/label collisions, dash gauge merging, ring card voids, week-strip alignment, (3) confetti/title collision, settings time inputs, 360px overflow, tap targets, (4) gauge empty-dot contrast and label tracking.

## Matches
- Palette sampled from the references with PIL: ink `#1A232C`, CTA green `#00A8xx` family (ref `#00B700`), mint data green `#00B58A` (ref dots `#00B188`), teal `#00B9D6` (ref `#00BCD8`), magenta `#D0035F` (ref `#D0004D`/`#D10159`), violet `#5A1FD1` (ref `#510CC4`), gold flame. Surfaces are lightened versions of the dim photographed screen (`#DBDBD6` cream-grey, pale blue-grey top).
- Typography: heavy rounded Rubik numerals (like the "43"/"29"/"5"), tiny tracked uppercase labels, geometric Outfit body similar to the "days in sync" text.
- Dotted arc gauge: double staggered ring of dots, ~216 degree sweep, curved top label, big numeral, tracked word under it, pill caption. Empty dots faded toward the top as in the reference.
- Dash gauge (Insights 75 THRIVING): thick round dashes, face-dot at top, green status word, stat trio with tinted badges and coloured numerals.
- Slanted segment bars, stacked slanted columns (reading card), ring gauge with two-colour arc, half-split dots in the week strip, flame streak pill, cream "weekly" card, bottom nav with tinted active pill and circular green FAB, modal with big green pill button and flame.
- Card language: off-white surfaces, 28-34px radii, soft cool shadow with white inner top highlight.

## Deviations (honest list)
- The references are photographed at an angle and blurred; exact edge radii, blur and shadow strength are estimated, not measured.
- Numerals: Rubik 800 is the nearest free font; the reference face has slightly more squared terminals and a rounder "4". Not identical.
- The reference big number nearly touches the dot ring; ours is smaller (29% of gauge width) so the curved label stays legible. Reference gauge dots are slightly larger relative to spacing.
- FAB is centred and raised in a floating nav (as requested); the reference FAB sits at the right edge.
- CTA green is `#00A80C` rather than the sampled `#00B700` so white 18px bold text reaches 3.1:1 (large-text AA). The FAB and decorative greens keep the brighter hue.
- Reference "together/solo" two-person colour pairing is repurposed as mint/teal (done vs planned) and magenta (shortfall) semantics.
- No emoji, no brand marks. Flame, runner and all icons are original inline SVG; the runner glyph is a simple stylised figure.
- Not tested on real iOS Safari: `cqw` units (needs Safari 16+), `color-mix` (Safari 16.2+), `backdrop-filter` has a `-webkit-` prefix.

---

# Live-app review (index.html + app.js, real data, 390x844 @2x)

Two critique rounds against the five references, on today / plan / insights / coach / log flow / result / session / settings.

## Fixed in styles.css / app.css
- Plan week rows: the 82px lead column let "22.5 km" collide with the session chips, and 4-chip weeks wrapped into ragged two-line clusters. Rows are now a stacked layout: "WK n  km" on one line, then a 4-column chip grid (chips never wrap, align to the same columns across weeks). Milestone row sits under a dashed divider at full width. app.css no longer overrides the grid.
- Plan header title was truncating ("Melbourne Mara..."); `.hdr__title` now wraps to two lines before clamping.
- Countdown card: target time block wrapped awkwardly and right-aligned text drifted. Now a divided row (TARGET, 4:30:00, pace) under the day count.
- Weekly cream card with 1-4 weeks: columns spread across the whole card with big gaps. Columns are now max 44px and centred, so a young account looks intentional.
- Insights empty trend cards: big void with a bare sentence; now a dashed inset placeholder box. (A first attempt with grid lines struck through the text and was removed.)
- Insights secondary stats row got a divider so it reads as a separate group from the stat trio.
- Log-run confirm: focusing a field card drew a hard cyan rectangle around the raw input (global focus ring); the card's own teal outline is now the only focus indicator (also for the composer input). Empty fields (cadence, calories) have a visible placeholder colour.
- Result modal: the non-flame icon (sparkle) was ink black; now mint like the coach avatar.
- Re-verified at 360 and 430px and tap targets (earlier pass): no overflow, all controls >= 44px.

## Still deviates from the references
- Plan is 51 weeks long (about 12,900px at 2x). The references are short, glanceable cards; this screen is a long scroll of near-identical rows.
- Today hero is heavy: the reference screens never stack a full-size numeral card, a note card, a strip, two stat cards and a CTA. It is faithful in style but denser than the references.
- Streak pill with 0 still shows a bright flame; the reference only shows it when there is a streak.
- Long-run bars (14 segments for a 32 km goal) show about 4 segments lit for 10 km; correct but reads as "almost empty" next to the reference's fuller stacked bars.
- Same earlier deviations: Rubik is the nearest free numeral face, not identical; FAB centred not right-aligned; shadow/blur strengths estimated from photographed screens.
- Toast overlaps the page header on the coach screen when the AI-off banner shows (transient, acceptable).

## Requests for app.js (not edited by me)
1. Insights trio: the unit under "Best streak" and "Current streak" says "runs"; should be "days".
2. Plan: render only the current phase expanded and collapse other phases (header with km + "n weeks", tap to expand), or limit to current week +/- 3. Fifty-one equal rows is the largest remaining deviation from the references.
3. Streak pill: when the streak is 0 use `class="streak-pill is-zero"` (I can grey the flame via CSS if you add the class) or hide the pill.
4. Hero card on a rest day: the pill says "Easy run" and the right label says "REST DAY TODAY". Consider labelling the pill "Next run" for clarity.
5. Weekly cream card: pass at least 4 items (pad with future planned weeks, as you do) and keep value null for future weeks; this already works.
