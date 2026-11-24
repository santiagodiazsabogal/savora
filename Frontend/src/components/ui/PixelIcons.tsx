// Íconos pixel-art del Dashboard — sprites 16×16 dibujados a mano como grillas ASCII.
// Cada string es una fila de 16 caracteres: un carácter = un píxel, '.' = transparente,
// el resto se mapea a un color de la paleta del sprite. Se renderizan como <rect> SVG con
// shape-rendering="crispEdges" → bordes nítidos a cualquier tamaño, sin assets externos.
// Son drop-in de los íconos de lucide (aceptan className + style), pero con color propio.
import React from 'react'

type Palette = Record<string, string>

export interface PixelIconProps {
  className?: string
  style?: React.CSSProperties
}

interface Run { x: number; y: number; w: number; fill: string }

// Compacta cada fila en "runs" horizontales del mismo color → menos nodos <rect> en el DOM
function toRuns(rows: string[], palette: Palette): Run[] {
  const runs: Run[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      const fill = c === '.' ? undefined : palette[c]
      if (!fill) { x++; continue }
      let w = 1
      while (x + w < row.length && row[x + w] === c) w++
      runs.push({ x, y, w, fill })
      x += w
    }
  })
  return runs
}

function makeIcon(rows: string[], palette: Palette) {
  const runs = toRuns(rows, palette)
  return function PixelIcon({ className, style }: PixelIconProps) {
    return (
      <svg viewBox="0 0 16 16" className={className} style={style} shapeRendering="crispEdges" aria-hidden="true">
        {runs.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
        ))}
      </svg>
    )
  }
}

export const PixelChefHat = makeIcon(
  [
    '................',
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '.WWWWWWWWWWWWWW.',
    '.WWWWWWWWWWWWWW.',
    '.WWWWWWWWWWWWWW.',
    '..SWWWWWWWWWWS..',
    '...SWWWWWWWWS...',
    '...SWWWWWWWWS...',
    '...WWWWWWWWWW...',
    '...SSSSSSSSSS...',
    '...RRRRRRRRRR...',
    '...DRRRRRRRRD...',
    '................',
  ],
  { W: '#FFF6EC', S: '#E3D5C6', R: '#E2543A', D: '#C4402E' },
)

export const PixelUtensils = makeIcon(
  [
    '..F.F.F...CCC...',
    '..F.F.F..CCCCC..',
    '..F.F.F..CCCCC..',
    '..FFFFF..CCCCC..',
    '...FFF....CCC...',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '....F......C....',
    '................',
    '................',
  ],
  { F: '#FFFFFF', C: '#FFE8D6' },
)

export const PixelGradCap = makeIcon(
  [
    '................',
    '.......LL.......',
    '.....LLLLLL.....',
    '...LLLLLLLLLL...',
    '.LLLLLLLLLLLLLL.',
    'BBBBBBBBBBBBBBBB',
    '.BBBBBBBBBBBBBG.',
    '...HHHHHHHH...G.',
    '...HHHHHHHH...G.',
    '....HHHHHH....G.',
    '..............GG',
    '..............GG',
    '................',
    '................',
    '................',
    '................',
  ],
  { L: '#4A4494', B: '#34306B', H: '#3D3480', G: '#FFC53D' },
)

export const PixelBookHeart = makeIcon(
  [
    '................',
    '..PPPPPPPPPPPP..',
    '.SPPPPPPPPPPPPP.',
    '.SPPPPPPPPPPPPP.',
    '.SPPHHPPHHPPPPP.',
    '.SPPHHHHHHPPPPP.',
    '.SPPHHHHHHPPPPP.',
    '.SPPPHHHHPPPPPP.',
    '.SPPPPHHPPPPPPP.',
    '.SPPPPPPPPPPPPP.',
    '.SPPPPPPPPPPPPP.',
    '.SPPPPPPPPPPPPP.',
    '.SWWWWWWWWWWWWW.',
    '..WWWWWWWWWWWW..',
    '................',
    '................',
  ],
  { P: '#8B5CF6', S: '#6D3FD6', H: '#FF7BAC', W: '#F5EFE6' },
)

export const PixelSwords = makeIcon(
  [
    'WW............WW',
    'WWW..........WWW',
    '.WWW........WWW.',
    '..WWW......WWW..',
    '...WWW....WWW...',
    '....WWW..WWW....',
    '.....WWWWWW.....',
    '......WWWW......',
    '.....WWWWWW.....',
    '....WWW..WWW....',
    '...GWW....WWG...',
    '..GGG......GGG..',
    '.PPG........GPP.',
    'PPP..........PPP',
    'PP............PP',
    '................',
  ],
  { W: '#E6EDF5', G: '#FFC53D', P: '#8B5CF6' },
)

export const PixelFridge = makeIcon(
  [
    '................',
    '.BBBBBBBBBBBBB..',
    '.BWWLLLLLLLLLB..',
    '.BWLLLLLLLLLLB..',
    '.BLLLLLLLLLLHB..',
    '.BLLLLLLLLLLHB..',
    '.BBBBBBBBBBBBB..',
    '.BWLLLLLLLLLLB..',
    '.BLLLLLLLLLLHB..',
    '.BLLLLLLLLLLHB..',
    '.BLLLLLLLLLLLB..',
    '.BLLLLLLLLLLLB..',
    '.BBBBBBBBBBBBB..',
    '..FF.......FF...',
    '................',
    '................',
  ],
  { B: '#2563C4', L: '#4DA3FF', W: '#9CCBFF', H: '#17407F', F: '#123458' },
)

export const PixelBasket = makeIcon(
  [
    '................',
    '....GG.....C....',
    '...GGGG...CC....',
    '...GgGG..CCC....',
    '....GG...CC.....',
    '.EEEEEEEEEEEEE..',
    '.EBBBBBBBBBBBE..',
    '.EBDBBDBBDBBDE..',
    '.EBBBBBBBBBBBE..',
    '..EBDBBDBBDBE...',
    '..EBBBBBBBBBE...',
    '...EBBBBBBBE....',
    '...EEEEEEEEE....',
    '................',
    '................',
    '................',
  ],
  { G: '#3FBF4F', g: '#2E9440', C: '#FF8A3D', E: '#1E7A34', B: '#2FA84F', D: '#23843C' },
)

export const PixelFlame = makeIcon(
  [
    '................',
    '.......R........',
    '.......RR.......',
    '......RRR.......',
    '......RRRR......',
    '.....RRRRR..R...',
    '....RRRRRR.RR...',
    '....RRRRRRRRR...',
    '...RRROOOORRR...',
    '...RROOOOOORR...',
    '..RROOYYYYOORR..',
    '..RROYYYYYYORR..',
    '..RROYYYYYYORR..',
    '...RROYYYYORR...',
    '....RROOOORR....',
    '.....RRRRRR.....',
  ],
  { R: '#FF5E1A', O: '#FFA43D', Y: '#FFE08A' },
)

export const PixelTarget = makeIcon(
  [
    '................',
    '.....RRRRRR.....',
    '...RRRRRRRRRR...',
    '..RRWWWWWWWWRR..',
    '.RRWWWWWWWWWWRR.',
    '.RWWWRRRRRRWWWR.',
    '.RWWRRRRRRRRWWR.',
    '.RWWRRRYYRRRWWR.',
    '.RWWRRRYYRRRWWR.',
    '.RWWRRRRRRRRWWR.',
    '.RWWWRRRRRRWWWR.',
    '.RRWWWWWWWWWWRR.',
    '..RRWWWWWWWWRR..',
    '...RRRRRRRRRR...',
    '.....RRRRRR.....',
    '................',
  ],
  { R: '#EF4444', W: '#FFF6EC', Y: '#FFC53D' },
)

export const PixelSparkles = makeIcon(
  [
    '............Y...',
    '...........YYY..',
    '............Y...',
    '......Y.........',
    '......Y.........',
    '.....YYY........',
    '....YYWYY.......',
    '..YYYWWWYYY.....',
    '....YYWYY.......',
    '.....YYY........',
    '......Y.........',
    '......Y.........',
    '..Y.............',
    '.YYY............',
    '..Y.............',
    '................',
  ],
  { Y: '#FFC53D', W: '#FFF1C4' },
)

export const PixelLock = makeIcon(
  [
    '................',
    '.....SSSSSS.....',
    '....SS....SS....',
    '....S......S....',
    '....S......S....',
    '..EEEEEEEEEEEE..',
    '..EGGGGGGGGGGE..',
    '..EGGGGGGGGGGE..',
    '..EGGGGDDGGGGE..',
    '..EGGGGDDGGGGE..',
    '..EGGGGGDGGGGE..',
    '..EGGGGGGGGGGE..',
    '..EEEEEEEEEEEE..',
    '................',
    '................',
    '................',
  ],
  { S: '#C9CBD6', E: '#D99A1F', G: '#FFC53D', D: '#7A5200' },
)

export const PixelClock = makeIcon(
  [
    '................',
    '.....BBBBBB.....',
    '...BBWWWWWWBB...',
    '..BWWWWWWWWWWB..',
    '.BWWWWWWDWWWWWB.',
    '.BWWWWWWDWWWWWB.',
    '.BWWWWWWDWWWWWB.',
    '.BWWWWWWDDDDWWB.',
    '.BWWWWWWWWWWWWB.',
    '.BWWWWWWWWWWWWB.',
    '..BWWWWWWWWWWB..',
    '...BBWWWWWWBB...',
    '.....BBBBBB.....',
    '................',
    '................',
    '................',
  ],
  { B: '#38BDF8', W: '#FFF6EC', D: '#1F2937' },
)

export const PixelSalad = makeIcon(
  [
    '................',
    '....GG...GG.....',
    '...GGGGgGGGG....',
    '..GGgGGGGTGGG...',
    '..GGGGTGGGGGg...',
    '...GGGGGGGGG....',
    '.BBBBBBBBBBBBBB.',
    '.SBBBBBBBBBBBBS.',
    '..SBBBBBBBBBBS..',
    '...SBBBBBBBBS...',
    '....SSSSSSSS....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  { G: '#3FBF4F', g: '#2E9440', T: '#EF4444', B: '#E8D9C0', S: '#C9B79A' },
)

export const PixelDumbbell = makeIcon(
  [
    '................',
    '................',
    '................',
    '..dD........Dd..',
    '..dD........Dd..',
    '..dDBBBBBBBBDd..',
    '..dDBBBBBBBBDd..',
    '..dD........Dd..',
    '..dD........Dd..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  { d: '#6B7280', D: '#9CA3AF', B: '#C9CFDA' },
)

export const PixelScale = makeIcon(
  [
    '................',
    '.......YY.......',
    '.YYYYYYYYYYYYYY.',
    '.Y.....YY.....Y.',
    '.Y.....YY.....Y.',
    'Y.Y....YY....Y.Y',
    'YYY....YY....YYY',
    '.......YY.......',
    '.......YY.......',
    '......YYYY......',
    '.....YYYYYY.....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  { Y: '#FFC53D' },
)
