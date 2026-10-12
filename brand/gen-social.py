"""Social preview for the repository (GitHub › Settings › Social preview): 1280×640 PNG, uploaded by hand.

python3 brand/gen-social.py brand   -> brand/social-preview.svg (then: rsvg-convert -w 1280 … -o brand/social-preview.png)

Same look as header.svg and the feature banners; the icon is brand/icon.svg, embedded unchanged.
The figures are the README's own example (Opus 5.5, 150k tokens, API prices): re-write $1.20, ping $0.03.
"""
import re, sys

D = sys.argv[1] if len(sys.argv) > 1 else "."
W, H = 1280, 640
FONT = "'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif"
MONO = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
GREEN, GREEN_HI, RED, ORANGE, ORANGE_HI, BLUE = "#3ddc84", "#9af2b8", "#e05060", "#d97757", "#ff9a6b", "#89b4fa"
TEXT, SECOND, MUTED, TRACK = "#f5f5f7", "#cdd6f4", "#7f849c", "#2a2939"

icon = open(f"{D}/icon.svg").read()
inner = re.search(r"<svg[^>]*>(.*)</svg>", icon, re.S).group(1)
inner = re.sub(r'id="([^"]+)"', r'id="ic-\1"', inner)
inner = re.sub(r"url\(#([^)]+)\)", r"url(#ic-\1)", inner)
inner = re.sub(r'href="#([^"]+)"', r'href="#ic-\1"', inner)

def bullet(y, color, bold, rest):
    return (f'<circle cx="82" cy="{y - 8}" r="8" fill="{color}"/>'
            f'<text x="104" y="{y}" xml:space="preserve" font-family="{FONT}" font-size="27" fill="{TEXT}">'
            f'<tspan font-weight="700">{bold}</tspan><tspan fill="{SECOND}"> {rest}</tspan></text>')

# bars under the icon: a re-write against a keepwarm ping, to scale
bx, bw = 780, 400
ping = bw * 0.03 / 1.20
bars = f'''
<text x="{bx}" y="482" font-family="{MONO}" font-size="17" fill="{MUTED}">re-write after a break</text>
<rect x="{bx}" y="494" width="{bw}" height="24" rx="8" fill="{RED}"/>
<text x="{bx + bw}" y="482" text-anchor="end" font-family="{FONT}" font-size="22" font-weight="700" fill="{TEXT}">$1.20</text>
<text x="{bx}" y="552" font-family="{MONO}" font-size="17" fill="{MUTED}">/keepwarm ping</text>
<rect x="{bx}" y="564" width="{bw}" height="24" rx="8" fill="{TRACK}"/>
<rect x="{bx}" y="564" width="{ping:.1f}" height="24" rx="4" fill="{GREEN}"/>
<text x="{bx + bw}" y="552" text-anchor="end" font-family="{FONT}" font-size="22" font-weight="700" fill="{GREEN_HI}">$0.03</text>
<text x="{bx}" y="612" font-family="{MONO}" font-size="14" fill="{MUTED}">Opus 5.5 · 150k tokens · API prices</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Cache Meter, a Claude Code Mod – stop wasting tokens: every break kept warm with /keepwarm auto, the cost under every answer, why a cache broke. A re-write after a break costs about $1.20, a keepwarm ping about $0.03.">
<defs>
<radialGradient id="bg" cx="0.15" cy="0.25" r="1.1"><stop offset="0" stop-color="#2b2540"/><stop offset="0.55" stop-color="#16141f"/><stop offset="1" stop-color="#0c0b12"/></radialGradient>
<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{ORANGE_HI}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#ffffff" opacity="0.045"/></pattern>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<rect width="{W}" height="{H}" fill="url(#dots)"/>
<rect width="{W}" height="6" fill="url(#accent)"/>
<rect x="64" y="56" width="338" height="56" rx="28" fill="{ORANGE}" fill-opacity="0.16" stroke="{ORANGE}" stroke-opacity="0.7" stroke-width="2"/>
<text x="233" y="94" text-anchor="middle" font-family="{MONO}" font-size="26" font-weight="700" letter-spacing="3" fill="{ORANGE_HI}">CLAUDE CODE MOD</text>
<text x="62" y="212" font-family="{FONT}" font-size="86" font-weight="700" fill="{TEXT}" letter-spacing="-1.5">Cache Meter</text>
<text x="64" y="278" font-family="{FONT}" font-size="44" font-weight="700" fill="url(#accent)">Stop wasting tokens</text>
{bullet(362, GREEN, "Every break", "kept warm – with /keepwarm auto")}
{bullet(414, ORANGE, "Every answer", "shows what it cost")}
{bullet(466, BLUE, "A broken cache", "– and why it broke")}
<text x="64" y="590" font-family="{MONO}" font-size="19" fill="{MUTED}">github.com/florian101010/cache-meter</text>
<text x="64" y="616" font-family="{MONO}" font-size="15" fill="{MUTED}" opacity="0.8">local · read-only · MIT</text>
<svg x="800" y="56" width="360" height="360" viewBox="0 0 1024 1024">{inner}</svg>
{bars}
</svg>
'''
open(f"{D}/social-preview.svg", "w").write(svg)
