// stickers.js — built-in sticker packs. Every client ships the same artwork,
// so a sticker message only carries its id (tiny, E2EE-friendly); received ids
// are used purely as lookup keys and never interpreted as markup.

const INK = '#2b2b2b';
const line = (w, c = INK) =>
  `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

// ---- the character: a round yellow blob with swappable face parts ----------

const BLOB =
  `<ellipse cx="60" cy="52" rx="37" ry="33" fill="#ffd66e"/>` +
  `<circle cx="34" cy="59" r="6" fill="#ff9a9a" opacity=".5"/>` +
  `<circle cx="86" cy="59" r="6" fill="#ff9a9a" opacity=".5"/>`;

const EYES = {
  dot: `<circle cx="47" cy="47" r="4.5" fill="${INK}"/><circle cx="73" cy="47" r="4.5" fill="${INK}"/>`,
  happy: `<path d="M41 49 Q47 41 53 49" ${line(4)}/><path d="M67 49 Q73 41 79 49" ${line(4)}/>`,
  closed: `<path d="M41 45 Q47 52 53 45" ${line(4)}/><path d="M67 45 Q73 52 79 45" ${line(4)}/>`,
  tired: `<path d="M41 47 h12" ${line(4)}/><path d="M67 47 h12" ${line(4)}/>`,
  dead: `<path d="M42 42 l10 10 M52 42 l-10 10" ${line(3.5)}/><path d="M68 42 l10 10 M78 42 l-10 10" ${line(3.5)}/>`,
  dizzy: `<path d="M51 47 a4.5 4.5 0 1 1 -4.5 -4.5 a3 3 0 1 0 3 3" ${line(3)}/><path d="M77 47 a4.5 4.5 0 1 1 -4.5 -4.5 a3 3 0 1 0 3 3" ${line(3)}/>`,
  angry: `<path d="M39 38 l14 5 M81 38 l-14 5" ${line(3.5)}/><circle cx="47" cy="49" r="4" fill="${INK}"/><circle cx="73" cy="49" r="4" fill="${INK}"/>`,
  shades: `<path d="M28 41 h64" ${line(3.5, '#20242c')}/><rect x="36" y="40" width="20" height="13" rx="5" fill="#20242c"/><rect x="64" y="40" width="20" height="13" rx="5" fill="#20242c"/>`,
};

const MOUTH = {
  smile: `<path d="M50 60 Q60 70 70 60" ${line(4)}/>`,
  grin: `<path d="M48 60 Q60 77 72 60 Z" fill="#8c4a3c"/>`,
  o: `<ellipse cx="60" cy="64" rx="5.5" ry="6.5" fill="#8c4a3c"/>`,
  wavy: `<path d="M50 64 Q55 60 60 64 Q65 68 70 64" ${line(4)}/>`,
  frown: `<path d="M50 68 Q60 59 70 68" ${line(4)}/>`,
  flat: `<path d="M52 64 h16" ${line(4)}/>`,
};

// ---- props / effects --------------------------------------------------------

const PROP = {
  sweat: `<path d="M93 27 q8 11 0 16 q-8 -5 0 -16" fill="#6fb9ff"/>`,
  tear: `<path d="M45 55 q6 9 0 14 q-6 -5 0 -14" fill="#6fb9ff"/>`,
  zzz: `<text x="90" y="28" font-size="18" font-weight="900" fill="#6fa4ff">Z</text><text x="102" y="16" font-size="12" font-weight="900" fill="#6fa4ff">z</text>`,
  boltRed: `<path d="M92 12 l-7 11 h5 l-4 10 l11 -13 h-5 l5 -8 Z" fill="#e0554e"/>`,
  spark: `<path d="M24 22 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z" fill="#ffd23e"/>`,
  sparkR: `<path d="M98 18 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z" fill="#ffd23e"/>`,
  confetti: `<circle cx="22" cy="34" r="3" fill="#e0554e"/><circle cx="97" cy="14" r="3" fill="#33c481"/><circle cx="106" cy="36" r="2.5" fill="#4f8cff"/>`,
  dots: `<circle cx="88" cy="24" r="2.6" fill="#9fb0cd"/><circle cx="97" cy="19" r="3.2" fill="#9fb0cd"/><circle cx="107" cy="13" r="3.8" fill="#9fb0cd"/>`,
  moon: `<path d="M104 12 a10 10 0 1 0 7 17 a8 8 0 1 1 -7 -17" fill="#ffd23e"/>`,
  speedLines: `<path d="M16 34 h11 M12 44 h13 M16 54 h11" ${line(3, '#9fb0cd')}/>`,
  blushMore: `<circle cx="34" cy="59" r="8" fill="#ff8a8a" opacity=".6"/><circle cx="86" cy="59" r="8" fill="#ff8a8a" opacity=".6"/>`,
  bubbles: `<circle cx="22" cy="28" r="4.5" fill="#ffd8e2"/><circle cx="15" cy="40" r="3" fill="#ffd8e2"/><circle cx="103" cy="30" r="3.5" fill="#ffd8e2"/>`,
  beer:
    `<g transform="rotate(14 88 56)">` +
    `<rect x="78" y="46" width="20" height="24" rx="3" fill="#ffb636" stroke="#a86f10" stroke-width="3"/>` +
    `<path d="M98 52 h4 a5 5 0 0 1 0 11 h-4" fill="none" stroke="#a86f10" stroke-width="3"/>` +
    `<circle cx="82" cy="44" r="5" fill="#fff"/><circle cx="89" cy="41" r="6" fill="#fff"/><circle cx="96" cy="44" r="5" fill="#fff"/>` +
    `</g>`,
  coffee:
    `<g><rect x="80" y="52" width="20" height="16" rx="3" fill="#fff" stroke="#8a6a4a" stroke-width="3"/>` +
    `<path d="M100 55 h3 a4 4 0 0 1 0 9 h-3" fill="none" stroke="#8a6a4a" stroke-width="3"/>` +
    `<path d="M86 47 q2 -4 0 -8 M94 47 q2 -4 0 -8" ${line(2.5, '#9fb0cd')}/></g>`,
  fish:
    `<g transform="translate(89 64)"><path d="M-13 0 Q-4 -9 6 0 Q-4 9 -13 0 Z" fill="#7cc4ff"/>` +
    `<path d="M6 0 l9 -6 v12 Z" fill="#7cc4ff"/><circle cx="-6" cy="-2" r="1.7" fill="#123a5c"/></g>`,
  laptop:
    `<g transform="translate(88 62) rotate(6)"><rect x="-13" y="-11" width="26" height="17" rx="2" fill="#39465e"/>` +
    `<rect x="-10" y="-8" width="20" height="11" rx="1" fill="#7cc4ff"/>` +
    `<rect x="-16" y="6" width="32" height="4" rx="2" fill="#5b6b86"/></g>`,
  tv:
    `<g transform="translate(89 59)"><rect x="-15" y="-11" width="30" height="21" rx="3" fill="#39465e"/>` +
    `<path d="M-4 -6 l10 5.5 -10 5.5 Z" fill="#fff"/></g>`,
  phone:
    `<g transform="translate(89 60) rotate(-14)"><rect x="-8" y="-13" width="16" height="26" rx="3" fill="#39465e"/>` +
    `<rect x="-5.5" y="-9.5" width="11" height="17" rx="1" fill="#7cc4ff"/></g>`,
  battery:
    `<g transform="translate(88 60)"><rect x="-14" y="-8" width="24" height="16" rx="3" fill="none" stroke="#5b6b86" stroke-width="3"/>` +
    `<rect x="11" y="-4" width="4" height="8" rx="1.5" fill="#5b6b86"/>` +
    `<path d="M1 -7 l-8 9 h5 l-3 7 l9 -10 h-5 Z" fill="#33c481"/></g>`,
  controller:
    `<g transform="translate(88 61)"><rect x="-17" y="-9" width="34" height="18" rx="9" fill="#5b6b86"/>` +
    `<path d="M-9 -3 v6 M-12 0 h6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="7" cy="-2.5" r="2.2" fill="#ffd23e"/><circle cx="11" cy="2.5" r="2.2" fill="#e0554e"/></g>`,
  basketball:
    `<g transform="translate(90 62)"><circle r="12" fill="#e8833a"/>` +
    `<path d="M-12 0 h24 M0 -12 v24 M-8 -9 q9 9 0 18 M8 -9 q-9 9 0 18" ${line(2, '#8a4516')}/></g>`,
  dumbbell:
    `<g transform="translate(88 62) rotate(-25)"><rect x="-13" y="-2.5" width="26" height="5" rx="2.5" fill="#5b6b86"/>` +
    `<rect x="-19" y="-8" width="7" height="16" rx="2.5" fill="#39465e"/>` +
    `<rect x="12" y="-8" width="7" height="16" rx="2.5" fill="#39465e"/></g>`,
  coin:
    `<g transform="translate(91 62)"><circle r="11" fill="#ffd23e" stroke="#c99a12" stroke-width="2.5"/>` +
    `<text y="5.5" text-anchor="middle" font-size="14" font-weight="900" fill="#a67c00">$</text></g>`,
  thumb:
    `<g transform="translate(88 58)"><rect x="-9" y="-1" width="21" height="18" rx="6" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5"/>` +
    `<rect x="-6" y="-16" width="9" height="19" rx="4.5" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5" transform="rotate(-16)"/></g>`,
  fists:
    `<g transform="translate(60 14)"><rect x="-31" y="-6" width="19" height="15" rx="6.5" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5"/>` +
    `<rect x="12" y="-6" width="19" height="15" rx="6.5" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5"/>` +
    `<path d="M-5 -8 l3 4 M0 -10 v5 M5 -8 l-3 4" ${line(2.5, '#ffd23e')}/></g>`,
  question: `<text x="94" y="34" font-size="30" font-weight="900" fill="#e0554e">?</text>`,
};

// ---- sticker builder --------------------------------------------------------

function art(label, color, parts) {
  const fs = label.length >= 4 ? 19 : 22;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-hidden="true">` +
    BLOB + parts.join('') +
    `<text x="60" y="112" text-anchor="middle" font-size="${fs}" font-weight="900"` +
    ` font-family="'PingFang TC','Heiti TC','Microsoft JhengHei','Noto Sans TC',sans-serif"` +
    ` fill="${color}" stroke="#ffffff" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${label}</text>` +
    `</svg>`
  );
}

function pack(id, name, icon, color, defs) {
  return {
    id, name, icon,
    stickers: defs.map(([key, label, ...parts]) => ({
      id: `${id}.${key}`, label, svg: art(label, color, parts),
    })),
  };
}

// ---- the packs ----------------------------------------------------------------

export const STICKER_PACKS = [
  pack('work', '上班用', '💼', '#2f6fe0', [
    ['ok', '收到！', EYES.happy, MOUTH.smile, PROP.sparkR],
    ['meeting', '開會中', EYES.tired, MOUTH.flat, PROP.laptop],
    ['overtime', '加班中', EYES.dead, MOUTH.wavy, PROP.moon, PROP.sweat],
    ['busy', '忙到爆', EYES.dizzy, MOUTH.o, PROP.sweat, PROP.speedLines],
    ['slack', '摸魚中', EYES.happy, MOUTH.smile, PROP.fish],
    ['salary', '薪水呢', EYES.dot, MOUTH.frown, PROP.tear, PROP.coin],
    ['offwork', '下班啦！', EYES.happy, MOUTH.grin, PROP.spark, PROP.sparkR],
    ['boss', '好的老闆', EYES.closed, MOUTH.smile, PROP.sweat],
  ]),
  pack('rest', '休息用', '☕', '#8a5cd8', [
    ['lazy', '耍廢中', EYES.tired, MOUTH.flat, PROP.phone],
    ['sleep', '晚安', EYES.closed, MOUTH.o, PROP.zzz, PROP.moon],
    ['coffee', '咖啡時間', EYES.dot, MOUTH.smile, PROP.coffee],
    ['drama', '追劇中', EYES.dot, MOUTH.o, PROP.tv],
    ['blank', '放空', EYES.dot, MOUTH.flat, PROP.dots],
    ['weekend', '週末萬歲', EYES.happy, MOUTH.grin, PROP.confetti, PROP.spark],
    ['recharge', '充電中', EYES.closed, MOUTH.flat, PROP.battery],
    ['dnd', '別吵我', EYES.angry, MOUTH.frown, PROP.boltRed],
  ]),
  pack('drink', '喝酒用', '🍺', '#e0891e', [
    ['cheers', '乾杯！', EYES.happy, MOUTH.grin, PROP.beer, PROP.spark],
    ['onemore', '再一杯', EYES.dot, MOUTH.o, PROP.blushMore, PROP.beer],
    ['tipsy', '微醺中', EYES.dizzy, MOUTH.smile, PROP.blushMore, PROP.bubbles],
    ['down', '我掛了', EYES.dead, MOUTH.wavy, PROP.sweat],
    ['letsgo', '走！喝酒', EYES.dot, MOUTH.grin, PROP.beer, PROP.speedLines],
    ['treat', '我請客', EYES.shades, MOUTH.smile, PROP.coin],
    ['strong', '千杯不醉', EYES.shades, MOUTH.grin, PROP.beer],
    ['tomorrow', '明天再說', EYES.tired, MOUTH.flat, PROP.zzz],
  ]),
  pack('guys', '男生用', '💪', '#16a06a', [
    ['bro', '兄弟！', EYES.happy, MOUTH.grin, PROP.fists],
    ['buff', '猛！', EYES.dot, MOUTH.grin, PROP.dumbbell],
    ['cool', '帥！', EYES.shades, MOUTH.smile, PROP.sparkR],
    ['ball', '打球嗎', EYES.dot, MOUTH.smile, PROP.basketball],
    ['game', '開黑上分', EYES.dot, MOUTH.o, PROP.controller],
    ['broke', '我沒錢', EYES.dot, MOUTH.frown, PROP.tear, PROP.coin],
    ['huh', '蛤？', EYES.dot, MOUTH.o, PROP.question],
    ['nice', '讚啦', EYES.happy, MOUTH.grin, PROP.thumb],
  ]),
];

const BY_ID = new Map();
for (const p of STICKER_PACKS) for (const s of p.stickers) BY_ID.set(s.id, s);

// Look up a sticker by id. Returns null for anything unknown, so a hostile or
// newer peer can never make us render arbitrary content.
export function getSticker(id) {
  return BY_ID.get(id) || null;
}
