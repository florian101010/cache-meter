"""Feature banners for the README: one animated SVG (SMIL) per feature, 1280×240, used as section dividers.

python3 brand/gen-features.py brand            -> brand/feature-*.svg (animated)
python3 brand/gen-features.py brand --stills   -> also brand/still-<name>-<t>.svg, still frames for checking

Same look as header.svg (see README › Look). Text uses the viewer's system font; no web fonts, no emoji.
"""
import math, sys

D = sys.argv[1] if len(sys.argv) > 1 else "."
STILLS = "--stills" in sys.argv
W, H = 1280, 240
CYCLE = 9
FONT = "'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif"
MONO = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
GREEN, GREEN_HI, AMBER, RED, ORANGE, ORANGE_HI = "#3ddc84", "#9af2b8", "#f0a050", "#e05060", "#d97757", "#ff9a6b"
TEXT, SECOND, MUTED, TRACK, CARD = "#f5f5f7", "#cdd6f4", "#7f849c", "#2a2939", "#1d1b29"

DEFS = f'''<defs>
<radialGradient id="bg" cx="0.12" cy="0.3" r="1.1"><stop offset="0" stop-color="#2b2540"/><stop offset="0.55" stop-color="#16141f"/><stop offset="1" stop-color="#0c0b12"/></radialGradient>
<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{ORANGE_HI}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity="0.45"/></filter>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#ffffff" opacity="0.045"/></pattern>
</defs>'''


def anim(attr, keys, values, extra=""):
    """A looping animation of one attribute over the cycle."""
    return f'<animate attributeName="{attr}" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="{keys}" values="{values}"{extra}/>'


def at(t, keys, values):
    """The value of a piecewise-linear animation at t (0..1), for still frames."""
    ks = [float(k) for k in keys.split(";")]
    vs = values.split(";")
    for i in range(len(ks) - 1):
        if ks[i] <= t <= ks[i + 1]:
            try:
                a, b = float(vs[i]), float(vs[i + 1])
                f = 0 if ks[i + 1] == ks[i] else (t - ks[i]) / (ks[i + 1] - ks[i])
                return f"{a + (b - a) * f:.2f}"
            except ValueError:
                return vs[i]
    return vs[-1]


class Scene:
    """Animated when t is None, else a still frame at t."""

    def __init__(self, t):
        self.t = t

    def a(self, attr, keys, values, static=None, extra=""):
        """Either the SMIL child, or (for a still) the attribute's value at t – returned as (child, value)."""
        if self.t is None:
            return anim(attr, keys, values, extra), static if static is not None else values.split(";")[0]
        return "", at(self.t, keys, values)


def frame(label, art, eyebrow, title, sub, mono):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{label}">
{DEFS}
<rect width="{W}" height="{H}" rx="24" fill="url(#bg)"/>
<rect width="{W}" height="{H}" rx="24" fill="url(#dots)"/>
<circle cx="210" cy="120" r="150" fill="{ORANGE}" opacity="0.05"/>
{art}
<rect x="470" y="40" width="{len(eyebrow) * 10.6 + 34:.0f}" height="28" rx="14" fill="{ORANGE}" fill-opacity="0.14" stroke="{ORANGE}" stroke-opacity="0.55"/>
<text x="487" y="59" font-family="{MONO}" font-size="13" font-weight="700" letter-spacing="1.6" fill="{ORANGE_HI}">{eyebrow}</text>
<text x="470" y="118" font-family="{FONT}" font-size="46" font-weight="700" fill="{TEXT}" letter-spacing="-0.8">{title}</text>
<text x="472" y="160" font-family="{FONT}" font-size="23" fill="{SECOND}">{sub}</text>
<text x="472" y="198" font-family="{MONO}" font-size="15" fill="{MUTED}">{mono}</text>
<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="23" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>
</svg>'''


# --- keepwarm: the ring drains to the ping mark, a ping flashes, "ping ok" shows, the ring refills ---------
def keepwarm(s):
    cx, cy, r = 210, 120, 74
    start, track = 130, 280
    c = 2 * math.pi * r
    u = lambda deg: deg / 360 * c
    pt = lambda deg, rr: (cx + rr * math.cos(math.radians(deg)), cy + rr * math.sin(math.radians(deg)))
    marker = start + track * 0.17
    mi, mo = pt(marker, r - 18), pt(marker, r + 18)
    keys = "0;0.62;0.70;0.84;1"
    dash = f"{u(270):.1f} {c:.1f};{u(52):.1f} {c:.1f};{u(52):.1f} {c:.1f};{u(270):.1f} {c:.1f};{u(270):.1f} {c:.1f}"
    ring_a, ring_v = s.a("stroke-dasharray", keys, dash)
    col_a, col_v = s.a("stroke", "0;0.40;0.50;0.76;0.84;1", f"{GREEN};{GREEN};{AMBER};{AMBER};{GREEN};{GREEN}")
    fl_a, fl_v = s.a("opacity", "0;0.64;0.68;0.80;1", "0;0;0.95;0;0")
    fr_a, fr_v = s.a("r", "0;0.64;0.80;1", "8;8;30;8")
    ok_a, ok_v = s.a("opacity", "0;0.68;0.72;0.94;1", "0;0;1;1;0")
    fx, fy = pt(marker, r)
    if s.t is None:
        ring_dash, ring_col, fl_op, fl_r, ok_op = u(270), GREEN, 0, 8, 0
        ring_dash = f"{u(270):.1f} {c:.1f}"
    else:
        ring_dash, ring_col, fl_op, fl_r, ok_op = ring_v, col_v, fl_v, fr_v, ok_v
    return f'''
<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{TRACK}" stroke-width="16" stroke-linecap="round" stroke-dasharray="{u(track):.1f} {c:.1f}" transform="rotate({start} {cx} {cy})"/>
<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{ring_col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="{ring_dash}" transform="rotate({start} {cx} {cy})" filter="url(#glow)">{ring_a}{col_a}</circle>
<line x1="{mi[0]:.1f}" y1="{mi[1]:.1f}" x2="{mo[0]:.1f}" y2="{mo[1]:.1f}" stroke="#ff8a5c" stroke-width="6" stroke-linecap="round"/>
<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{fl_r}" fill="#ff8a5c" opacity="{fl_op}" filter="url(#glow)">{fl_a}{fr_a}</circle>
<text x="{cx}" y="{cy + 12}" text-anchor="middle" font-family="{MONO}" font-size="34" font-weight="700" fill="{TEXT}">↻</text>
<g opacity="{ok_op}">{ok_a}
<rect x="{cx + 56}" y="{cy - 92}" width="170" height="30" rx="15" fill="{GREEN}" fill-opacity="0.14" stroke="{GREEN}" stroke-opacity="0.6"/>
<text x="{cx + 141}" y="{cy - 72}" text-anchor="middle" font-family="{MONO}" font-size="14" fill="{GREEN_HI}">ping ok · 148k read</text>
</g>'''


# --- cost: an answer, then the Cache Meter line types in; a budget bar fills and turns amber at 80 % --------
def cost(s):
    x0, y0, w = 40, 34, 360
    line_keys = "0;0.18;0.45;1"
    clip_a, clip_v = s.a("width", line_keys, f"0;0;{w - 36};{w - 36}")
    bar_keys = "0;0.45;0.80;0.92;1"
    bar_w = w - 36
    fill_a, fill_v = s.a("width", bar_keys, f"0;0;{bar_w * 0.82:.1f};{bar_w * 0.82:.1f};{bar_w * 0.82:.1f}")
    fcol_a, fcol_v = s.a("fill", "0;0.66;0.70;1", f"{GREEN};{GREEN};{AMBER};{AMBER}")
    warn_a, warn_v = s.a("opacity", "0;0.80;0.84;0.97;1", "0;0;1;1;0")
    clip_w = 0 if s.t is None else clip_v
    fill_w = 0 if s.t is None else fill_v
    fill_c = GREEN if s.t is None else fcol_v
    warn_o = 0 if s.t is None else warn_v
    return f'''
<defs><clipPath id="type"><rect x="{x0 + 18}" y="{y0 + 84}" width="{clip_w}" height="26">{clip_a}</rect></clipPath></defs>
<g filter="url(#shadow)"><rect x="{x0}" y="{y0}" width="{w}" height="172" rx="16" fill="{CARD}" stroke="#ffffff" stroke-opacity="0.08"/></g>
<rect x="{x0 + 18}" y="{y0 + 22}" width="250" height="10" rx="5" fill="#3a3850"/>
<rect x="{x0 + 18}" y="{y0 + 42}" width="300" height="10" rx="5" fill="#3a3850"/>
<rect x="{x0 + 18}" y="{y0 + 62}" width="180" height="10" rx="5" fill="#3a3850"/>
<g clip-path="url(#type)"><text x="{x0 + 18}" y="{y0 + 102}" font-family="{MONO}" font-size="14" fill="{MUTED}"><tspan fill="{ORANGE_HI}">◉</tspan> ≈ $0.42 API value · 97% from cache</text></g>
<text x="{x0 + 18}" y="{y0 + 136}" font-family="{MONO}" font-size="12" fill="{MUTED}">session budget</text>
<rect x="{x0 + 18}" y="{y0 + 146}" width="{bar_w}" height="10" rx="5" fill="{TRACK}"/>
<rect x="{x0 + 18}" y="{y0 + 146}" width="{fill_w}" height="10" rx="5" fill="{fill_c}">{fill_a}{fcol_a}</rect>
<g opacity="{warn_o}">{warn_a}<text x="{x0 + w - 18}" y="{y0 + 136}" text-anchor="end" font-family="{MONO}" font-size="12" font-weight="700" fill="{AMBER}">82 % of $5.00</text></g>'''


# --- warn: the model pill switches, a note slides in before the cache is re-written; a bell rings -----------
def warn(s):
    x0, y0 = 40, 40
    pill_a, pill_v = s.a("opacity", "0;0.20;0.26;1", "1;1;0.25;0.25")
    new_a, new_v = s.a("opacity", "0;0.20;0.26;1", "0;0;1;1")
    card_keys = "0;0.30;0.40;0.90;1"
    _, slide_v = s.a("transform", card_keys, "0 40;0 40;0 0;0 0;0 40")
    cop_a, cop_v = s.a("opacity", card_keys, "0;0;1;1;0")
    if s.t is None:
        slide = f'<animateTransform attributeName="transform" type="translate" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="{card_keys}" values="0 40;0 40;0 0;0 0;0 40"/>'
        bell = f'<animateTransform attributeName="transform" type="rotate" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="0;0.40;0.44;0.48;0.52;0.56;1" values="0 372 64;0 372 64;-16 372 64;14 372 64;-10 372 64;0 372 64;0 372 64"/>'
        p_op, n_op, c_op, c_tr = 1, 0, 0, "translate(0 40)"
    else:
        slide = bell = ""
        p_op, n_op, c_op = pill_v, new_v, cop_v
        c_tr = "translate(" + str(slide_v) + ")" if " " in str(slide_v) else f"translate(0 {slide_v})"
    return f'''
<g opacity="{p_op}">{pill_a}<rect x="{x0}" y="{y0}" width="118" height="34" rx="17" fill="{TRACK}"/><text x="{x0 + 59}" y="{y0 + 22}" text-anchor="middle" font-family="{MONO}" font-size="14" fill="{SECOND}">opus 5</text></g>
<text x="{x0 + 136}" y="{y0 + 23}" font-family="{MONO}" font-size="18" fill="{MUTED}">→</text>
<g opacity="{n_op}">{new_a}<rect x="{x0 + 166}" y="{y0}" width="118" height="34" rx="17" fill="{ORANGE}" fill-opacity="0.18" stroke="{ORANGE}" stroke-opacity="0.6"/><text x="{x0 + 225}" y="{y0 + 22}" text-anchor="middle" font-family="{MONO}" font-size="14" fill="{ORANGE_HI}">sonnet 5</text></g>
<g transform="rotate(0 372 64)">{bell}
<path d="M 360 70 C 360 56 364 50 372 50 C 380 50 384 56 384 70 L 388 76 L 356 76 Z" fill="{AMBER}"/><circle cx="372" cy="80" r="4" fill="{AMBER}"/></g>
<g opacity="{c_op}">{cop_a}<g transform="{c_tr}">{slide}
<g filter="url(#shadow)"><rect x="{x0}" y="{y0 + 66}" width="330" height="94" rx="14" fill="{CARD}" stroke="{AMBER}" stroke-opacity="0.5"/></g>
<text x="{x0 + 18}" y="{y0 + 94}" font-family="{MONO}" font-size="14" font-weight="700" fill="{AMBER}">Model switch re-writes</text>
<text x="{x0 + 18}" y="{y0 + 118}" font-family="{MONO}" font-size="14" fill="{SECOND}">148.0k tokens (≈ $1.18)</text>
<text x="{x0 + 18}" y="{y0 + 142}" font-family="{MONO}" font-size="13" fill="{MUTED}">cache warm 42m more</text>
</g></g>'''


# --- tokens: request columns grow one by one, a cold one rises red, its tooltip names the cause -------------
def tokens(s):
    x0, base, cw, gap = 44, 196, 24, 10
    heights = [26, 18, 22, 16, 120, 20, 14, 18, 24]
    cols = []
    for i, h in enumerate(heights):
        start = 0.04 + i * 0.05
        keys = f"0;{start:.2f};{start + 0.06:.2f};0.92;1"
        col = RED if h > 100 else (ORANGE if i == 0 else GREEN)
        ha, hv = s.a("height", keys, f"0;0;{h};{h};0")
        ya, yv = s.a("y", keys, f"{base};{base};{base - h};{base - h};{base}")
        if s.t is None:
            hv, yv = 0, base
        cols.append(f'<rect x="{x0 + i * (cw + gap)}" y="{yv}" width="{cw}" height="{hv}" rx="4" fill="{col}" opacity="0.92">{ha}{ya}</rect>')
    tip_a, tip_v = s.a("opacity", "0;0.50;0.56;0.90;1", "0;0;1;1;0")
    tip_o = 0 if s.t is None else tip_v
    tx = x0 + 4 * (cw + gap) + cw + 12
    return f'''
<line x1="{x0 - 6}" y1="{base + 1}" x2="{x0 + 9 * (cw + gap)}" y2="{base + 1}" stroke="{TRACK}" stroke-width="3"/>
{''.join(cols)}
<g opacity="{tip_o}">{tip_a}<g filter="url(#shadow)"><rect x="{tx}" y="44" width="232" height="74" rx="12" fill="{CARD}" stroke="{RED}" stroke-opacity="0.5"/></g>
<text x="{tx + 14}" y="68" font-family="{MONO}" font-size="13" font-weight="700" fill="{RED}">warm miss · 148.0k written</text>
<text x="{tx + 14}" y="90" font-family="{MONO}" font-size="12" fill="{SECOND}">effort high → medium</text>
<text x="{tx + 14}" y="108" font-family="{MONO}" font-size="12" fill="{MUTED}">splits the cache</text></g>'''


# --- report: a Markdown page fills line by line, then lands on the clipboard with a check ------------------
def report(s):
    x0, y0 = 40, 26
    lines = [("# Cache Meter – session report", TEXT, 13, True), ("## Cost and cache", ORANGE_HI, 12, True), ("- Cost: ≈ $4.10 API value", SECOND, 12, False),
             ("- Cache hit rate: 96%", SECOND, 12, False), ("## Context", ORANGE_HI, 12, True), ("- Largest: Bash npm 10.0k", SECOND, 12, False)]
    out = []
    for i, (txt, col, size, bold) in enumerate(lines):
        start = 0.05 + i * 0.07
        oa, ov = s.a("opacity", f"0;{start:.2f};{start + 0.05:.2f};0.92;1", "0;0;1;1;0")
        op = 0 if s.t is None else ov
        out.append(f'<text x="{x0 + 20}" y="{y0 + 32 + i * 26}" font-family="{MONO}" font-size="{size}" font-weight="{700 if bold else 400}" fill="{col}" opacity="{op}">{oa}{txt}</text>')
    chk_a, chk_v = s.a("opacity", "0;0.55;0.60;0.92;1", "0;0;1;1;0")
    chk_o = 0 if s.t is None else chk_v
    cx, cy = 352, 122
    return f'''
<g filter="url(#shadow)"><rect x="{x0}" y="{y0}" width="250" height="186" rx="14" fill="{CARD}" stroke="#ffffff" stroke-opacity="0.08"/></g>
{''.join(out)}
<path d="M {x0 + 262} 120 L {cx - 52} 120" stroke="{MUTED}" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 7"/>
<rect x="{cx - 40}" y="{cy - 50}" width="80" height="104" rx="12" fill="{TRACK}" stroke="{SECOND}" stroke-opacity="0.35" stroke-width="2"/>
<rect x="{cx - 18}" y="{cy - 60}" width="36" height="20" rx="6" fill="{SECOND}" opacity="0.55"/>
<g opacity="{chk_o}">{chk_a}<circle cx="{cx}" cy="{cy + 6}" r="24" fill="{GREEN}" opacity="0.2" filter="url(#glow)"/>
<path d="M {cx - 13} {cy + 6} L {cx - 3} {cy + 17} L {cx + 15} {cy - 7}" fill="none" stroke="{GREEN_HI}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>'''


# --- auto: a timeline – you work (prompts keep the cache full), you are away (it drains to the ping mark, a
# ping refills it, twice), you are back (cache warm) --------------------------------------------------------
def auto(s):
    x0, x1, ty = 40, 440, 168
    tx = lambda x: (x - x0) / (x1 - x0) * 0.9
    play_a, play_v = s.a("x1", "0;0.9;1", f"{x0};{x1};{x1}")
    play2_a, play2_v = s.a("x2", "0;0.9;1", f"{x0};{x1};{x1}")
    px = x0 if s.t is None else float(play_v)
    out = []
    # the cache bar: full while you work, drains while you are away, refilled by each ping
    p1, p2, back = 228, 330, 404
    k = [0, tx(120), tx(p1), tx(p1) + 0.005, tx(p2), tx(p2) + 0.005, tx(back), tx(back) + 0.005, 1]
    keys = ";".join(f"{v:.3f}" for v in k)
    full, low = 360, 62
    w_a, w_v = s.a("width", keys, f"{full};{full};{low};{full};{low};{full};{full - 70};{full};{full}")
    c_a, c_v = s.a("fill", keys, f"{GREEN};{GREEN};{AMBER};{GREEN};{AMBER};{GREEN};{GREEN};{GREEN};{GREEN}")
    bw = full if s.t is None else w_v
    bc = GREEN if s.t is None else c_v
    out.append(f'<text x="{x0}" y="62" font-family="{MONO}" font-size="13" fill="{MUTED}">prompt cache</text>')
    out.append(f'<rect x="{x0}" y="74" width="{full}" height="14" rx="7" fill="{TRACK}"/>')
    out.append(f'<rect x="{x0}" y="74" width="{bw}" height="14" rx="7" fill="{bc}" filter="url(#glow)">{w_a}{c_a}</rect>')
    out.append(f'<line x1="{x0 + low:.0f}" y1="68" x2="{x0 + low:.0f}" y2="94" stroke="#ff8a5c" stroke-width="4" stroke-linecap="round"/>')
    # the timeline: work, away, back
    out.append(f'<line x1="{x0}" y1="{ty}" x2="{x1}" y2="{ty}" stroke="{TRACK}" stroke-width="6" stroke-linecap="round"/>')
    out.append(f'<rect x="132" y="{ty - 3}" width="{back - 144}" height="6" rx="3" fill="{ORANGE}" fill-opacity="0.18"/>')
    for x in (58, 86, 114):
        o_a, o_v = s.a("opacity", f"0;{tx(x):.3f};{tx(x) + 0.01:.3f};0.97;1", "0.15;0.15;1;1;0.15")
        out.append(f'<circle cx="{x}" cy="{ty}" r="8" fill="{ORANGE}" opacity="{1 if s.t is None else o_v}">{o_a}</circle>')
    for x in (p1, p2):
        f_a, f_v = s.a("opacity", f"0;{tx(x):.3f};{tx(x) + 0.01:.3f};{tx(x) + 0.08:.3f};1", "0;0;1;0.35;0.35")
        r_a, r_v = s.a("r", f"0;{tx(x):.3f};{tx(x) + 0.06:.3f};1", "6;6;20;8")
        out.append(f'<circle cx="{x}" cy="{ty}" r="{8 if s.t is None else r_v}" fill="#ff8a5c" opacity="{0.35 if s.t is None else f_v}" filter="url(#glow)">{f_a}{r_a}</circle>')
        out.append(f'<text x="{x}" y="{ty - 18}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="#ff8a5c">ping</text>')
    b_a, b_v = s.a("opacity", f"0;{tx(back):.3f};{tx(back) + 0.01:.3f};0.97;1", "0.15;0.15;1;1;0.15")
    out.append(f'<circle cx="{back}" cy="{ty}" r="8" fill="{ORANGE}" opacity="{1 if s.t is None else b_v}">{b_a}</circle>')
    out.append(f'<text x="86" y="{ty + 30}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{MUTED}">you work</text>')
    out.append(f'<text x="{(132 + back) / 2:.0f}" y="{ty + 30}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{MUTED}">away · 2h</text>')
    out.append(f'<text x="{back}" y="{ty + 30}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{MUTED}">back</text>')
    # "cache warm" when you are back
    ok_a, ok_v = s.a("opacity", f"0;{tx(back):.3f};{tx(back) + 0.02:.3f};0.97;1", "0;0;1;1;0")
    out.append(f'<g opacity="{0 if s.t is None else ok_v}">{ok_a}<rect x="{back - 92}" y="{ty - 62}" width="128" height="28" rx="14" fill="{GREEN}" fill-opacity="0.14" stroke="{GREEN}" stroke-opacity="0.6"/>'
               f'<text x="{back - 28}" y="{ty - 43}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{GREEN_HI}">cache warm ✓</text></g>')
    # the playhead
    out.append(f'<line x1="{px}" y1="{ty - 12}" x2="{px}" y2="{ty + 12}" stroke="{TEXT}" stroke-opacity="0.7" stroke-width="2">{play_a}{play2_a}</line>')
    return "\n".join(out)


# --- why: what a cold cache costs against a keepwarm ping – two bars grow, the figures land -----------------
def why(s):
    x0, full = 40, 360
    ping = full * 0.03 / 1.20
    out = []
    keys = "0;0.06;0.34;0.92;1"
    rw_a, rw_v = s.a("width", keys, f"0;0;{full};{full};0", static=f"{full}")
    pg_a, pg_v = s.a("width", "0;0.30;0.44;0.92;1", f"0;0;{ping:.1f};{ping:.1f};0", static=f"{ping:.1f}")
    t1_a, t1_v = s.a("opacity", "0;0.30;0.36;0.92;1", "0;0;1;1;0", static="1")
    t2_a, t2_v = s.a("opacity", "0;0.42;0.48;0.92;1", "0;0;1;1;0", static="1")
    bw = full if s.t is None else rw_v
    pw = f"{ping:.1f}" if s.t is None else pg_v
    o1 = 1 if s.t is None else t1_v
    o2 = 1 if s.t is None else t2_v
    out.append(f'<text x="{x0}" y="62" font-family="{MONO}" font-size="13" fill="{MUTED}">re-write after the break</text>')
    out.append(f'<rect x="{x0}" y="72" width="{full}" height="26" rx="8" fill="{TRACK}"/>')
    out.append(f'<rect x="{x0}" y="72" width="{bw}" height="26" rx="8" fill="{RED}" filter="url(#glow)">{rw_a}</rect>')
    out.append(f'<text x="{x0 + full}" y="128" text-anchor="end" font-family="{FONT}" font-size="22" font-weight="700" fill="{TEXT}" opacity="{o1}">$1.20{t1_a}</text>')
    out.append(f'<text x="{x0}" y="150" font-family="{MONO}" font-size="13" fill="{MUTED}">/keepwarm ping</text>')
    out.append(f'<rect x="{x0}" y="160" width="{full}" height="26" rx="8" fill="{TRACK}"/>')
    out.append(f'<rect x="{x0}" y="160" width="{pw}" height="26" rx="4" fill="{GREEN}" filter="url(#glow)">{pg_a}</rect>')
    out.append(f'<text x="{x0 + 24}" y="180" font-family="{FONT}" font-size="22" font-weight="700" fill="{GREEN_HI}" opacity="{o2}">$0.03{t2_a}</text>')
    out.append(f'<text x="{x0}" y="214" font-family="{MONO}" font-size="12" fill="{MUTED}">Opus 5.5 · 150k tokens · API prices</text>')
    return "\n".join(out)


BANNERS = [
    ("keepwarm", "Keep it: /keepwarm – one tiny ping keeps the prompt cache alive while you are away.", keepwarm, "KEEP IT", "/keepwarm",
     "One tiny ping keeps the cache alive while you are away.", "≈ 1/20 of a re-write · heartbeat in the band · stops on a miss"),
    ("why", "Why Cache Meter – stop wasting tokens: a re-write after a break costs about $1.20 for a 150k-token conversation on Opus 5.5 at API prices, a keepwarm ping about $0.03. Twelve everyday problems it solves follow.", why, "WHY CACHE METER", "Stop wasting tokens",
     "Twelve everyday problems it solves – right below.", "see it · keep it · understand it · local and read-only"),
    ("auto", "Every break: /keepwarm auto – switched on once, it keeps the prompt cache warm through every break of the session, by itself.", auto, "EVERY BREAK", "/keepwarm auto",
     "Type it once – every break stays warm, by itself.", "opt-in · pings only while you are away · 2h break ≈ 2 pings"),
    ("cost", "See it: every answer, priced – and a session budget that warns at 80 percent.", cost, "SEE IT", "Every answer, priced",
     "What each answer cost – and a budget that warns at 80 %.", "API value on a plan · real spend on an API key"),
    ("warn", "Before it breaks: a heads-up before a switch re-writes the cache.", warn, "BEFORE IT BREAKS", "Warned in time",
     "A heads-up before a switch re-writes your cache.", "model and effort switches · a reminder before it expires"),
    ("tokens", "Understand it: /tokens shows why the cache broke and what fills your context.", tokens, "UNDERSTAND IT", "/tokens",
     "Why the cache broke, what fills your context, what it saved.", "warm misses with causes · tool results · subagents · forecasts"),
    ("report", "Copy it: /tokens report copies your session stats as Markdown to your own clipboard – never your conversation.", report, "COPY IT", "/tokens report",
     "Your session stats as Markdown – never your conversation.", "cost · cache · context · subagents · plan limits"),
]

for name, label, art, eyebrow, title, sub, mono in BANNERS:
    open(f"{D}/feature-{name}.svg", "w").write(frame(label, art(Scene(None)), eyebrow, title, sub, mono))
    if STILLS:
        for t in (0.5, 0.75):
            open(f"{D}/still-{name}-{int(t * 100)}.svg", "w").write(frame(label, art(Scene(t)), eyebrow, title, sub, mono))
