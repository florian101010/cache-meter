"""Cache Meter icon: a glowing countdown ring with the keepwarm marker, around a coffee cup
(icon.svg) or the minutes left (icon-60.svg). Render: rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png"""
import math, sys
D = sys.argv[1] if len(sys.argv) > 1 else "."
def arc(cx,cy,r,a0,a1):
    def p(a):
        t=math.radians(a-90); return cx+r*math.cos(t), cy+r*math.sin(t)
    x0,y0=p(a0); x1,y1=p(a1); large=1 if (a1-a0)>180 else 0
    return f"M {x0:.1f} {y0:.1f} A {r} {r} 0 {large} 1 {x1:.1f} {y1:.1f}"
def pt(cx,cy,r,a):
    t=math.radians(a-90); return cx+r*math.cos(t), cy+r*math.sin(t)
cx,cy,r=512,512,350
a0,a1=-140,140; fill=0.74
av=a0+(a1-a0)*fill
mk=a0+(a1-a0)*0.17
mi=pt(cx,cy,r-50,mk); mo=pt(cx,cy,r+50,mk)
ticks=''.join(f'<line x1="{pt(cx,cy,r+78,a)[0]:.1f}" y1="{pt(cx,cy,r+78,a)[1]:.1f}" x2="{pt(cx,cy,r+96,a)[0]:.1f}" y2="{pt(cx,cy,r+96,a)[1]:.1f}" stroke="#585b70" stroke-width="8" stroke-linecap="round"/>' for a in range(-140,141,28))
defs=f'''<defs>
<radialGradient id="bg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#2a2540"/><stop offset="0.6" stop-color="#17151f"/><stop offset="1" stop-color="#0b0a10"/></radialGradient>
<linearGradient id="ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2fbf71"/><stop offset="1" stop-color="#9af2b8"/></linearGradient>
<linearGradient id="steam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d97757"/><stop offset="1" stop-color="#ffb38a"/></linearGradient>
<linearGradient id="cup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9dbe6"/></linearGradient>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>'''
base=f'''<rect width="1024" height="1024" rx="224" fill="url(#bg)"/>
<circle cx="512" cy="470" r="300" fill="#d97757" opacity="0.07"/>
{ticks}
<path d="{arc(cx,cy,r,a0,a1)}" fill="none" stroke="#2c2b3c" stroke-width="58" stroke-linecap="round"/>
<path d="{arc(cx,cy,r,a0,av)}" fill="none" stroke="url(#ring)" stroke-width="58" stroke-linecap="round" filter="url(#glow)"/>
<line x1="{mi[0]:.1f}" y1="{mi[1]:.1f}" x2="{mo[0]:.1f}" y2="{mo[1]:.1f}" stroke="#ff8a5c" stroke-width="20" stroke-linecap="round" filter="url(#soft)"/>'''
cup=f'''<g transform="translate(0,30)">
<path d="M 392 470 C 380 470 372 478 372 490 L 382 600 C 388 650 430 690 482 690 L 526 690 C 578 690 620 650 626 600 L 636 490 C 636 478 628 470 616 470 Z" fill="url(#cup)"/>
<path d="M 632 512 C 712 512 716 618 618 626" fill="none" stroke="url(#cup)" stroke-width="30" stroke-linecap="round"/>
<rect x="352" y="704" width="304" height="26" rx="13" fill="#d9dbe6" opacity="0.9"/>
<g fill="none" stroke="url(#steam)" stroke-width="22" stroke-linecap="round" filter="url(#soft)">
<path d="M 446 440 C 418 404 474 376 446 330"/>
<path d="M 504 440 C 476 396 536 364 504 300"/>
<path d="M 562 440 C 534 404 590 376 562 330"/>
</g></g>'''
border='<rect x="6" y="6" width="1012" height="1012" rx="220" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="12"/>'
open(f'{D}/icon.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{defs}{base}{cup}{border}</svg>')
num=f'''<text x="512" y="590" text-anchor="middle" font-family="Menlo" font-weight="bold" font-size="270" fill="#f5f5f7">60</text>
<text x="512" y="690" text-anchor="middle" font-family="Helvetica Neue" font-weight="bold" font-size="62" letter-spacing="8" fill="#9af2b8">MIN</text>'''
open(f'{D}/icon-60.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{defs}{base}{num}{border}</svg>')
