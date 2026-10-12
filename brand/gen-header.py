import math, sys
D = sys.argv[1] if len(sys.argv) > 1 else "."
W, H = 1280, 400
CX, CY, R = 210, 205, 140          # ring centre / radius
TRACK = 280                         # degrees of the ring
START = 130                         # svg angle where the ring starts (bottom-left)
CYCLE = 9                           # seconds per loop
C = 2*math.pi*R                      # circumference in user units (no pathLength: not every renderer honours it)
U = lambda deg: deg/360*C
FONT = "'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif"
MONO = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"

def pt(a, r):  # a in svg degrees
    t = math.radians(a); return CX + r*math.cos(t), CY + r*math.sin(t)

def ring_value(t):   # degrees lit at time t (0..1 of the cycle)
    if t < 0.72: return 270 - (270-62)*(t/0.72)          # drains to the marker
    if t < 0.80: return 62                                  # ping moment
    if t < 0.92: return 62 + (270-62)*((t-0.80)/0.12)       # refills
    return 270

def ring_color(t):
    v = ring_value(t)
    return '#f0a050' if v < 120 else '#3ddc84'

marker_a = START + TRACK*0.17
mi, mo = pt(marker_a, R-30), pt(marker_a, R+30)
ticks = ''.join(
    f'<line x1="{pt(START+k*TRACK/10,R+44)[0]:.1f}" y1="{pt(START+k*TRACK/10,R+44)[1]:.1f}" '
    f'x2="{pt(START+k*TRACK/10,R+54)[0]:.1f}" y2="{pt(START+k*TRACK/10,R+54)[1]:.1f}" '
    f'stroke="#4a4860" stroke-width="4" stroke-linecap="round"/>' for k in range(11))

defs = f'''<defs>
<radialGradient id="bg" cx="0.18" cy="0.35" r="0.95"><stop offset="0" stop-color="#2b2540"/><stop offset="0.55" stop-color="#16141f"/><stop offset="1" stop-color="#0c0b12"/></radialGradient>
<linearGradient id="cup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6d8e4"/></linearGradient>
<linearGradient id="steam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d97757"/><stop offset="1" stop-color="#ffc09a"/></linearGradient>
<linearGradient id="claim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9a6b"/><stop offset="1" stop-color="#d97757"/></linearGradient>
<filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#ffffff" opacity="0.045"/></pattern>
</defs>'''

def scene(t=None):
    """t=None: animated (SMIL); t=0..1: a still frame at that point of the loop."""
    anim = t is None
    tt = 0 if anim else t
    v, col = ring_value(tt), ring_color(tt)
    keys = "0;0.72;0.80;0.92;1"
    ring_anim = (f'<animate attributeName="stroke-dasharray" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="{keys}" '
                 f'values="{U(270):.1f} {C:.1f};{U(62):.1f} {C:.1f};{U(62):.1f} {C:.1f};{U(270):.1f} {C:.1f};{U(270):.1f} {C:.1f}" calcMode="spline" keySplines="0.4 0 0.6 1;0 0 1 1;0.3 0 0.2 1;0 0 1 1"/>'
                 f'<animate attributeName="stroke" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="0;0.45;0.6;0.84;0.92;1" '
                 f'values="#3ddc84;#3ddc84;#f0a050;#f0a050;#3ddc84;#3ddc84"/>') if anim else ''
    # steam: three wisps rising, strongest around the ping (t ~ 0.76..0.92)
    wisps = []
    for i, (x, d) in enumerate([(-34, 0.0), (0, 0.15), (34, 0.3)]):
        base_x = CX + x
        path = f'M {base_x} 205 C {base_x-18} 180 {base_x+18} 162 {base_x} 136'
        if anim:
            a = (f'<animate attributeName="opacity" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="0;0.70;0.80;0.95;1" values="0.35;0.35;1;0.35;0.35"/>'
                 f'<animateTransform attributeName="transform" type="translate" dur="3s" begin="{d}s" repeatCount="indefinite" values="0 6;0 -10;0 6"/>')
            op = 0.35
        else:
            a = ''; op = 1 if 0.74 < tt < 0.95 else 0.35
        wisps.append(f'<path d="{path}" opacity="{op}">{a}</path>')
    # ping flash on the marker
    flash = (f'<circle cx="{pt(marker_a,R)[0]:.1f}" cy="{pt(marker_a,R)[1]:.1f}" r="16" fill="#ff8a5c" opacity="0" filter="url(#glow)">'
             f'<animate attributeName="opacity" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="0;0.74;0.78;0.86;1" values="0;0;0.9;0;0"/>'
             f'<animate attributeName="r" dur="{CYCLE}s" repeatCount="indefinite" keyTimes="0;0.74;0.86;1" values="10;10;34;10"/></circle>') if anim else (
             f'<circle cx="{pt(marker_a,R)[0]:.1f}" cy="{pt(marker_a,R)[1]:.1f}" r="26" fill="#ff8a5c" opacity="{0.8 if 0.76<tt<0.86 else 0}" filter="url(#glow)"/>')
    fade = lambda delay: (f'<animate attributeName="opacity" from="0" to="1" dur="0.9s" begin="{delay}s" fill="freeze"/>'
                          f'<animateTransform attributeName="transform" type="translate" from="0 14" to="0 0" dur="0.9s" begin="{delay}s" fill="freeze"/>') if anim else ''
    o0 = '0' if anim else '1'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Cache Meter – Never lose your prompt cache to a coffee break again.">
{defs}
<rect width="{W}" height="{H}" rx="28" fill="url(#bg)"/>
<rect width="{W}" height="{H}" rx="28" fill="url(#dots)"/>
<circle cx="{CX}" cy="{CY}" r="190" fill="#d97757" opacity="0.06"/>
{ticks}
<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="#2a2939" stroke-width="26" stroke-linecap="round" stroke-dasharray="{U(TRACK):.1f} {C:.1f}" transform="rotate({START} {CX} {CY})"/>
<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" stroke="{col}" stroke-width="26" stroke-linecap="round" stroke-dasharray="{U(v):.1f} {C:.1f}" transform="rotate({START} {CX} {CY})" filter="url(#glow)">{ring_anim}</circle>
<line x1="{mi[0]:.1f}" y1="{mi[1]:.1f}" x2="{mo[0]:.1f}" y2="{mo[1]:.1f}" stroke="#ff8a5c" stroke-width="9" stroke-linecap="round"/>
{flash}
<g transform="translate({CX-512*0.42:.1f},{CY-560*0.42:.1f}) scale(0.42)">
<path d="M 392 470 C 380 470 372 478 372 490 L 382 600 C 388 650 430 690 482 690 L 526 690 C 578 690 620 650 626 600 L 636 490 C 636 478 628 470 616 470 Z" fill="url(#cup)"/>
<path d="M 632 512 C 712 512 716 618 618 626" fill="none" stroke="url(#cup)" stroke-width="30" stroke-linecap="round"/>
<rect x="352" y="704" width="304" height="26" rx="13" fill="#d6d8e4" opacity="0.9"/>
</g>
<g fill="none" stroke="url(#steam)" stroke-width="9" stroke-linecap="round" filter="url(#soft)">{''.join(wisps)}</g>

<g opacity="{o0}">{fade(0.1)}
<rect x="440" y="92" width="196" height="32" rx="16" fill="#d97757" fill-opacity="0.14" stroke="#d97757" stroke-opacity="0.55"/>
<text x="538" y="113" text-anchor="middle" font-family="{MONO}" font-size="14" font-weight="700" letter-spacing="1.6" fill="#ff9a6b">CLAUDE CODE MOD</text>
</g>
<g opacity="{o0}">{fade(0.25)}
<text x="440" y="184" font-family="{FONT}" font-size="64" font-weight="700" fill="#f5f5f7" letter-spacing="-1">Cache Meter</text>
</g>
<g opacity="{o0}">{fade(0.45)}
<text x="442" y="240" font-family="{FONT}" font-size="34" fill="#cdd6f4">Never lose your prompt cache</text>
<text x="442" y="282" font-family="{FONT}" font-size="34" fill="#cdd6f4">to a coffee break <tspan fill="url(#claim)" font-weight="700">again.</tspan></text>
</g>
<g opacity="{o0}">{fade(0.7)}
<text x="442" y="336" font-family="{MONO}" font-size="17" fill="#7f849c">live countdown · /keepwarm · /tokens dashboard</text>
</g>
<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="27" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2"/>
</svg>'''

open(f'{D}/header.svg', 'w').write(scene(None))
for t in (0.0, 0.5, 0.8, 0.9):
    open(f'{D}/frame-{int(t*100):02d}.svg', 'w').write(scene(t))
