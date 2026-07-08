// stickers.js — built-in sticker packs. Every client ships the same artwork,
// so a sticker message only carries its id (tiny, E2EE-friendly); received ids
// are used purely as lookup keys and never interpreted as markup.
//
// 9 packs organised by everyday CHAT SCENE + 台灣流行語/迷因 (based on LINE
// store trend research): 日常回覆 / 已讀敷衍 / 嗆人白爛 / 迷因爛梗 / 厭世上班 /
// 撒嬌愛心 / 應援吹捧 / 祝福問候 / 疑惑吐槽. Each pack keeps its own character.
// Animation: parts carry st-* classes; the keyframes live in styles.css and
// only apply where the SVG is inline in the DOM (chat bubbles + picker).
// prefers-reduced-motion users get static stickers via the global CSS rule.

const INK = '#2b2b2b';
const line = (w, c = INK) =>
  `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

const blush = (x1, x2, y) =>
  `<circle cx="${x1}" cy="${y}" r="6" fill="#ff9a9a" opacity=".5"/><circle cx="${x2}" cy="${y}" r="6" fill="#ff9a9a" opacity=".5"/>`;

const heart = (x, y, s, c = '#ff6f9c') =>
  `<path d="M${x} ${y + s * 0.9} C ${x - s * 1.4} ${y - s * 0.3} ${x - s * 0.6} ${y - s * 1.4} ${x} ${y - s * 0.35} ` +
  `C ${x + s * 0.6} ${y - s * 1.4} ${x + s * 1.4} ${y - s * 0.3} ${x} ${y + s * 0.9} Z" fill="${c}"/>`;

// 4-point sparkle star, used for excited "starry" eyes and shiny props.
const star4 = (cx, cy, r, c = '#ffd23e') => {
  const b = r * 0.4;
  return (
    `<path d="M${cx} ${cy - r} L${cx + b} ${cy - b} L${cx + r} ${cy} L${cx + b} ${cy + b} ` +
    `L${cx} ${cy + r} L${cx - b} ${cy + b} L${cx - r} ${cy} L${cx - b} ${cy - b} Z" ` +
    `fill="${c}" stroke="#d99a12" stroke-width="1"/>`
  );
};

// ---- pack characters (faces plug in around eyes y≈47 / mouth y≈60-68) -------

const BODIES = {
  // 兔兔（可愛）：長耳朵 + 粉紅內耳
  bunny:
    `<ellipse cx="45" cy="18" rx="8" ry="16" fill="#ffffff" stroke="#cfc4bd" stroke-width="2.5" transform="rotate(-10 45 18)"/>` +
    `<ellipse cx="45" cy="20" rx="4" ry="10" fill="#ffc9d4" transform="rotate(-10 45 18)"/>` +
    `<ellipse cx="75" cy="18" rx="8" ry="16" fill="#ffffff" stroke="#cfc4bd" stroke-width="2.5" transform="rotate(10 75 18)"/>` +
    `<ellipse cx="75" cy="20" rx="4" ry="10" fill="#ffc9d4" transform="rotate(10 75 18)"/>` +
    `<ellipse cx="60" cy="56" rx="34" ry="30" fill="#ffffff" stroke="#cfc4bd" stroke-width="2.5"/>` +
    blush(36, 84, 62),
  // 貓咪小姐（美麗）：尖耳 + 耳邊小花 + 鬍鬚
  prettycat:
    `<path d="M30 34 l4 -18 l16 8 Z" fill="#fdf0f6" stroke="#dbb8cc" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M90 34 l-4 -18 l-16 8 Z" fill="#fdf0f6" stroke="#dbb8cc" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<ellipse cx="60" cy="56" rx="34" ry="29" fill="#fdf0f6" stroke="#dbb8cc" stroke-width="2.5"/>` +
    `<g><circle cx="34" cy="14" r="3" fill="#ff9dbb"/><circle cx="28" cy="19" r="3" fill="#ff9dbb"/><circle cx="31" cy="26" r="3" fill="#ff9dbb"/><circle cx="38" cy="26" r="3" fill="#ff9dbb"/><circle cx="40" cy="19" r="3" fill="#ff9dbb"/><circle cx="34" cy="20" r="2.8" fill="#ffd23e"/></g>` +
    `<path d="M20 56 h9 M20 63 h9 M91 56 h9 M91 63 h9" ${line(2, '#dbb8cc')}/>` +
    blush(36, 84, 62),
  // 鼠鼠（可憐）：小圓耳 + 淺色口鼻 + 小手手
  hamster:
    `<circle cx="40" cy="28" r="8" fill="#f0e4d6" stroke="#c9b49c" stroke-width="2.5"/><circle cx="40" cy="28" r="3.5" fill="#e0c9b0"/>` +
    `<circle cx="80" cy="28" r="8" fill="#f0e4d6" stroke="#c9b49c" stroke-width="2.5"/><circle cx="80" cy="28" r="3.5" fill="#e0c9b0"/>` +
    `<ellipse cx="60" cy="56" rx="35" ry="31" fill="#f0e4d6" stroke="#c9b49c" stroke-width="2.5"/>` +
    `<ellipse cx="60" cy="64" rx="13" ry="10" fill="#faf3ea"/>` +
    `<ellipse cx="60" cy="57" rx="3.5" ry="2.8" fill="#c98a8a"/>` +
    `<ellipse cx="47" cy="79" rx="5.5" ry="4" fill="#f0e4d6" stroke="#c9b49c" stroke-width="2"/>` +
    `<ellipse cx="73" cy="79" rx="5.5" ry="4" fill="#f0e4d6" stroke="#c9b49c" stroke-width="2"/>` +
    blush(33, 87, 60),
  // 虎虎（威武）：圓耳 + 額頭「王」+ 側邊虎紋 + 口鼻
  tiger:
    `<circle cx="36" cy="26" r="10" fill="#ffa245" stroke="#d97b1a" stroke-width="2.5"/><circle cx="36" cy="26" r="4.5" fill="#ffd9ae"/>` +
    `<circle cx="84" cy="26" r="10" fill="#ffa245" stroke="#d97b1a" stroke-width="2.5"/><circle cx="84" cy="26" r="4.5" fill="#ffd9ae"/>` +
    `<ellipse cx="60" cy="56" rx="36" ry="31" fill="#ffa245" stroke="#d97b1a" stroke-width="2.5"/>` +
    `<path d="M53 28 h14 M53 33 h14 M53 38 h14 M60 28 v10" ${line(3)}/>` +
    `<path d="M27 48 q7 2 6 8 M93 48 q-7 2 -6 8" ${line(3.5)}/>` +
    `<ellipse cx="60" cy="64" rx="13" ry="9" fill="#ffe9d1"/>` +
    `<ellipse cx="60" cy="58" rx="4.5" ry="3.5" fill="#5c3a22"/>`,
  // 章魚（上班）：圓頭 + 波浪裙擺觸手
  octopus:
    `<ellipse cx="60" cy="44" rx="34" ry="27" fill="#ff8e7d" stroke="#e06a58" stroke-width="2.5"/>` +
    `<path d="M28 58 h64 v8 q0 10 -8 10 q-8 0 -8 -8 q0 8 -8 8 q-8 0 -8 -8 q0 8 -8 8 q-8 0 -8 -8 q0 8 -8 8 q-8 0 -8 -10 Z" fill="#ff8e7d" stroke="#e06a58" stroke-width="2.5"/>` +
    `<circle cx="44" cy="72" r="2" fill="#e06a58"/><circle cx="60" cy="74" r="2" fill="#e06a58"/><circle cx="76" cy="72" r="2" fill="#e06a58"/>` +
    blush(37, 83, 54),
  // 藍色小貓（休息）：圓耳朵 + 額頭條紋
  bluecat:
    `<circle cx="40" cy="26" r="9" fill="#8fd0f2" stroke="#5fa8cc" stroke-width="2.5"/><circle cx="80" cy="26" r="9" fill="#8fd0f2" stroke="#5fa8cc" stroke-width="2.5"/>` +
    `<ellipse cx="60" cy="54" rx="36" ry="32" fill="#8fd0f2" stroke="#5fa8cc" stroke-width="2.5"/>` +
    `<path d="M52 26 v7 M60 24 v8 M68 26 v7" ${line(3, '#5fb0dd')}/>` +
    blush(34, 86, 60),
  // 小熊（喝酒）：圓耳朵 + 淺色口鼻
  bear:
    `<circle cx="35" cy="25" r="10" fill="#c68d5c" stroke="#9a6a3e" stroke-width="2.5"/><circle cx="35" cy="25" r="5" fill="#e8c49a"/>` +
    `<circle cx="85" cy="25" r="10" fill="#c68d5c" stroke="#9a6a3e" stroke-width="2.5"/><circle cx="85" cy="25" r="5" fill="#e8c49a"/>` +
    `<ellipse cx="60" cy="54" rx="36" ry="32" fill="#c68d5c" stroke="#9a6a3e" stroke-width="2.5"/>` +
    `<ellipse cx="60" cy="63" rx="13" ry="9.5" fill="#e8c49a"/>` +
    `<ellipse cx="60" cy="56" rx="4.5" ry="3.5" fill="#5c3a22"/>` +
    blush(33, 87, 60),
  // 調皮小子（男生）：粗眉 + 短瀏海
  kid:
    `<ellipse cx="60" cy="54" rx="33" ry="31" fill="#ffd9b3" stroke="#e0b088" stroke-width="2.5"/>` +
    `<path d="M27 48 a33 28 0 0 1 66 0" fill="none" stroke="#4a332a" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M38 37 q9 -4 18 1 M82 37 q-9 -4 -18 1" ${line(4.5, '#4a332a')}/>` +
    blush(36, 84, 60),
  // 柴犬 doge（迷因爛梗）：尖立耳 + 白吻部 + 黑鼻，迷因界門面
  shiba:
    `<path d="M28 33 L33 7 L51 26 Z" fill="#e6b45f" stroke="#c9963e" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M92 33 L87 7 L69 26 Z" fill="#e6b45f" stroke="#c9963e" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<ellipse cx="60" cy="55" rx="35" ry="31" fill="#f2cf8f" stroke="#c9963e" stroke-width="2.5"/>` +
    `<ellipse cx="60" cy="68" rx="22" ry="15" fill="#fbf3e2"/>` +
    `<ellipse cx="60" cy="55" rx="4.2" ry="3" fill="#4a2f1c"/>` +
    blush(34, 86, 63),
};

const EYES = {
  dot: `<circle cx="47" cy="47" r="4.5" fill="${INK}"/><circle cx="73" cy="47" r="4.5" fill="${INK}"/>`,
  happy: `<path d="M41 49 Q47 41 53 49" ${line(4)}/><path d="M67 49 Q73 41 79 49" ${line(4)}/>`,
  closed: `<path d="M41 45 Q47 52 53 45" ${line(4)}/><path d="M67 45 Q73 52 79 45" ${line(4)}/>`,
  tired: `<path d="M41 47 h12" ${line(4)}/><path d="M67 47 h12" ${line(4)}/>`,
  dead: `<path d="M42 42 l10 10 M52 42 l-10 10" ${line(3.5)}/><path d="M68 42 l10 10 M78 42 l-10 10" ${line(3.5)}/>`,
  dizzy: `<g class="st-spin"><path d="M51 47 a4.5 4.5 0 1 1 -4.5 -4.5 a3 3 0 1 0 3 3" ${line(3)}/></g><g class="st-spin"><path d="M77 47 a4.5 4.5 0 1 1 -4.5 -4.5 a3 3 0 1 0 3 3" ${line(3)}/></g>`,
  angry: `<path d="M39 40 l14 4 M81 40 l-14 4" ${line(3.5)}/><circle cx="47" cy="50" r="4" fill="${INK}"/><circle cx="73" cy="50" r="4" fill="${INK}"/>`,
  shades: `<path d="M28 41 h64" ${line(3.5, '#20242c')}/><rect x="36" y="40" width="20" height="13" rx="5" fill="#20242c"/><rect x="64" y="40" width="20" height="13" rx="5" fill="#20242c"/>`,
  // 亮晶晶大眼（可愛）
  shiny: `<circle cx="47" cy="47" r="6" fill="${INK}"/><circle cx="45" cy="45" r="2.2" fill="#fff"/><circle cx="49.5" cy="49.5" r="1.2" fill="#fff"/>` +
    `<circle cx="73" cy="47" r="6" fill="${INK}"/><circle cx="71" cy="45" r="2.2" fill="#fff"/><circle cx="75.5" cy="49.5" r="1.2" fill="#fff"/>`,
  // 汪汪淚眼（可憐 🥺）
  plead: `<circle cx="47" cy="47" r="7" fill="${INK}"/><circle cx="44.5" cy="44.5" r="2.6" fill="#fff"/><circle cx="49.5" cy="50" r="1.4" fill="#fff"/><ellipse cx="47" cy="53.5" rx="5" ry="1.8" fill="#bfe4ff"/>` +
    `<circle cx="73" cy="47" r="7" fill="${INK}"/><circle cx="70.5" cy="44.5" r="2.6" fill="#fff"/><circle cx="75.5" cy="50" r="1.4" fill="#fff"/><ellipse cx="73" cy="53.5" rx="5" ry="1.8" fill="#bfe4ff"/>`,
  wink: `<path d="M41 49 Q47 41 53 49" ${line(4)}/><circle cx="73" cy="47" r="4.5" fill="${INK}"/>`,
  // 優雅睫毛（美麗）
  lash: `<path d="M41 46 q6 6 12 0" ${line(3.5)}/><path d="M40 48 l-3 3 M45 50.5 l-2 3.5 M51 50.5 l1 3.5" ${line(2.5)}/>` +
    `<path d="M67 46 q6 6 12 0" ${line(3.5)}/><path d="M69 50.5 l-1 3.5 M75 50.5 l2 3.5 M80 48 l3 3" ${line(2.5)}/>`,
  heart: `<g class="st-beat">${heart(47, 47, 6.5, '#e0554e')}${heart(73, 47, 6.5, '#e0554e')}</g>`,
  // 翻白眼（嗆人/敷衍）：眼白 + 瞳孔往上
  roll: `<circle cx="47" cy="48" r="5.5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="47" cy="44.5" r="2.6" fill="${INK}"/>` +
    `<circle cx="73" cy="48" r="5.5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="73" cy="44.5" r="2.6" fill="${INK}"/>`,
  // 瞪大眼（傻眼/震驚）
  wide: `<circle cx="47" cy="47" r="8.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="47" cy="48" r="3.2" fill="${INK}"/>` +
    `<circle cx="73" cy="47" r="8.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="73" cy="48" r="3.2" fill="${INK}"/>`,
  // 星星眼（崇拜/吹捧）
  starry: `<g class="st-twinkle">${star4(47, 47, 7)}</g><g class="st-twinkle" style="animation-delay:.3s">${star4(73, 47, 7)}</g>`,
};

const MOUTH = {
  smile: `<path d="M50 60 Q60 70 70 60" ${line(4)}/>`,
  grin: `<path d="M48 60 Q60 77 72 60 Z" fill="#8c4a3c"/>`,
  o: `<ellipse cx="60" cy="64" rx="5.5" ry="6.5" fill="#8c4a3c"/>`,
  wavy: `<path d="M50 64 Q55 60 60 64 Q65 68 70 64" ${line(4)}/>`,
  frown: `<path d="M50 68 Q60 59 70 68" ${line(4)}/>`,
  flat: `<path d="M52 64 h16" ${line(4)}/>`,
  uwu: `<path d="M50 61 q5 6 10 0 q5 6 10 0" ${line(4)}/>`,
  smirk: `<path d="M51 64 q9 6 18 -3" ${line(4)}/>`,
  shout: `<ellipse cx="60" cy="65" rx="9" ry="8" fill="#8c4a3c"/><path d="M54 69 q6 5 12 0 Z" fill="#ff8a8a"/>`,
  kiss: heart(60, 64, 5, '#e0554e'),
  // 咬牙開口（嗆人）
  gah: `<path d="M49 60 h22 v5 q-11 5 -22 0 Z" fill="#8c4a3c"/><path d="M49 62.5 h22" stroke="#fff" stroke-width="2"/>` +
    `<path d="M55 60 v6.5 M61 60 v6.5 M67 60 v6.5" stroke="#fff" stroke-width="1.6"/>`,
  // 吐舌（賤賤的/白爛）
  tongue: `<path d="M50 60 Q60 67 70 60" ${line(4)}/><path d="M57 62 q3 8 7 1 Z" fill="#ff7a7a" stroke="#e0554e" stroke-width="1.5"/>`,
  // 大笑 D 嘴（笑死）
  d: `<path d="M47 59 Q60 82 73 59 Z" fill="#8c4a3c"/><path d="M53 71 q7 6 14 0 Z" fill="#ff8a8a"/>`,
};

// Face-attached extras: concatenated into the eyes/mouth slot so they ride
// along with the body animation (they sit ON the face).
const FACEX = {
  blushMore: `<circle cx="36" cy="59" r="8" fill="#ff8a8a" opacity=".6"/><circle cx="84" cy="59" r="8" fill="#ff8a8a" opacity=".6"/>`,
  tear: `<g class="st-drip"><path d="M45 55 q6 9 0 14 q-6 -5 0 -14" fill="#6fb9ff"/></g>`,
  streams: `<g class="st-drip"><path d="M43 54 q-1 12 1 22" ${line(5, '#6fb9ff')}/><path d="M77 54 q1 12 -1 22" ${line(5, '#6fb9ff')}/></g>`,
  // 臉上裂痕（我裂開）
  crack: `<g class="st-blink"><path d="M60 27 l-5 8 l6 5 l-6 8 l6 6 l-4 7" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/></g>`,
};

// ---- ambient props / effects (rendered outside the body, own animations) ----

const PROP = {
  sweat: `<g class="st-drip"><path d="M93 27 q8 11 0 16 q-8 -5 0 -16" fill="#6fb9ff"/></g>`,
  zzz: `<g class="st-floaty"><text x="90" y="28" font-size="18" font-weight="900" fill="#6fa4ff">Z</text><text x="102" y="16" font-size="12" font-weight="900" fill="#6fa4ff">z</text></g>`,
  boltRed: `<g class="st-blink"><path d="M92 12 l-7 11 h5 l-4 10 l11 -13 h-5 l5 -8 Z" fill="#e0554e"/></g>`,
  spark: `<g class="st-twinkle"><path d="M24 22 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z" fill="#ffd23e"/></g>`,
  sparkR: `<g class="st-twinkle" style="animation-delay:.55s"><path d="M98 18 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z" fill="#ffd23e"/></g>`,
  confetti: `<g class="st-twinkle"><circle cx="22" cy="34" r="3" fill="#e0554e"/><circle cx="106" cy="36" r="2.5" fill="#4f8cff"/></g><g class="st-twinkle" style="animation-delay:.4s"><circle cx="97" cy="14" r="3" fill="#33c481"/><circle cx="14" cy="18" r="2.5" fill="#e0891e"/></g>`,
  dots: `<g class="st-floaty"><circle cx="88" cy="24" r="2.6" fill="#9fb0cd"/><circle cx="97" cy="19" r="3.2" fill="#9fb0cd"/><circle cx="107" cy="13" r="3.8" fill="#9fb0cd"/></g>`,
  moon: `<path d="M104 12 a10 10 0 1 0 7 17 a8 8 0 1 1 -7 -17" fill="#ffd23e"/>`,
  sun: `<g class="st-twinkle"><circle cx="24" cy="24" r="7" fill="#ffd23e"/><path d="M24 13 v-5 M24 35 v5 M13 24 h-5 M35 24 h5 M16 16 l-3.5 -3.5 M32 32 l3.5 3.5 M32 16 l3.5 -3.5 M16 32 l-3.5 3.5" ${line(2.5, '#ffd23e')}/></g>`,
  speedLines: `<g class="st-dash"><path d="M16 34 h11 M12 44 h13 M16 54 h11" ${line(3, '#9fb0cd')}/></g>`,
  bubbles: `<g class="st-floaty"><circle cx="22" cy="28" r="4.5" fill="#ffd8e2"/><circle cx="15" cy="40" r="3" fill="#ffd8e2"/></g><g class="st-floaty" style="animation-delay:.7s"><circle cx="103" cy="30" r="3.5" fill="#ffd8e2"/></g>`,
  hearts: `<g class="st-floaty">${heart(24, 28, 6)}</g><g class="st-floaty" style="animation-delay:.6s">${heart(101, 22, 4.5)}</g>`,
  flower: `<g class="st-twinkle" style="animation-delay:.3s"><circle cx="100" cy="20" r="3" fill="#ff9dbb"/><circle cx="94" cy="25" r="3" fill="#ff9dbb"/><circle cx="97" cy="32" r="3" fill="#ff9dbb"/><circle cx="103" cy="32" r="3" fill="#ff9dbb"/><circle cx="106" cy="25" r="3" fill="#ff9dbb"/><circle cx="100" cy="26" r="2.8" fill="#ffd23e"/></g>`,
  fire: `<g class="st-twinkle"><path d="M99 34 q-9 -4 -6 -13 q2 4 5 5 q-2 -8 6 -12 q-1 6 3 9 q5 5 0 10 q-4 4 -8 1 Z" fill="#ff7a30"/><path d="M97 32 q-4 -3 -2 -8 q3 3 4 -2 q3 4 1 8 q-1 3 -3 2 Z" fill="#ffd23e"/></g>`,
  exclam: `<g class="st-pop"><text x="93" y="36" font-size="28" font-weight="900" fill="#e0554e">！</text></g>`,
  bowl: `<g transform="translate(90 60)"><circle cx="-6" cy="-6" r="4" fill="#fff" stroke="#c9b49c" stroke-width="2"/><circle cx="2" cy="-8" r="4.5" fill="#fff" stroke="#c9b49c" stroke-width="2"/><circle cx="8" cy="-5" r="3.5" fill="#fff" stroke="#c9b49c" stroke-width="2"/><path d="M-13 -3 a13 13 0 0 0 26 0 Z" fill="#e07a5f" stroke="#b85a42" stroke-width="2.5"/></g>`,
  beer:
    `<g class="st-cheers"><g transform="rotate(14 88 56)">` +
    `<rect x="78" y="46" width="20" height="24" rx="3" fill="#ffb636" stroke="#a86f10" stroke-width="3"/>` +
    `<path d="M98 52 h4 a5 5 0 0 1 0 11 h-4" fill="none" stroke="#a86f10" stroke-width="3"/>` +
    `<circle cx="82" cy="44" r="5" fill="#fff"/><circle cx="89" cy="41" r="6" fill="#fff"/><circle cx="96" cy="44" r="5" fill="#fff"/>` +
    `</g></g>`,
  coffee:
    `<g><rect x="80" y="52" width="20" height="16" rx="3" fill="#fff" stroke="#8a6a4a" stroke-width="3"/>` +
    `<path d="M100 55 h3 a4 4 0 0 1 0 9 h-3" fill="none" stroke="#8a6a4a" stroke-width="3"/></g>` +
    `<g class="st-floaty"><path d="M86 47 q2 -4 0 -8 M94 47 q2 -4 0 -8" ${line(2.5, '#9fb0cd')}/></g>`,
  fish:
    `<g class="st-swim"><g transform="translate(89 64)"><path d="M-13 0 Q-4 -9 6 0 Q-4 9 -13 0 Z" fill="#7cc4ff"/>` +
    `<path d="M6 0 l9 -6 v12 Z" fill="#7cc4ff"/><circle cx="-6" cy="-2" r="1.7" fill="#123a5c"/></g></g>`,
  laptop:
    `<g transform="translate(88 62) rotate(6)"><rect x="-13" y="-11" width="26" height="17" rx="2" fill="#39465e"/>` +
    `<rect x="-10" y="-8" width="20" height="11" rx="1" fill="#7cc4ff"/>` +
    `<rect x="-16" y="6" width="32" height="4" rx="2" fill="#5b6b86"/></g>`,
  tv:
    `<g transform="translate(89 59)"><rect x="-15" y="-11" width="30" height="21" rx="3" fill="#39465e"/>` +
    `<path class="st-blink" d="M-4 -6 l10 5.5 -10 5.5 Z" fill="#fff"/></g>`,
  phone:
    `<g transform="translate(89 60) rotate(-14)"><rect x="-8" y="-13" width="16" height="26" rx="3" fill="#39465e"/>` +
    `<rect x="-5.5" y="-9.5" width="11" height="17" rx="1" fill="#7cc4ff"/></g>`,
  battery:
    `<g transform="translate(88 60)"><rect x="-14" y="-8" width="24" height="16" rx="3" fill="none" stroke="#5b6b86" stroke-width="3"/>` +
    `<rect x="11" y="-4" width="4" height="8" rx="1.5" fill="#5b6b86"/></g>` +
    `<g class="st-blink"><path d="M89 53 l-8 9 h5 l-3 7 l9 -10 h-5 Z" fill="#33c481"/></g>`,
  controller:
    `<g class="st-mash"><g transform="translate(88 61)"><rect x="-17" y="-9" width="34" height="18" rx="9" fill="#5b6b86"/>` +
    `<path d="M-9 -3 v6 M-12 0 h6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="7" cy="-2.5" r="2.2" fill="#ffd23e"/><circle cx="11" cy="2.5" r="2.2" fill="#e0554e"/></g></g>`,
  basketball:
    `<g class="st-dribble"><g transform="translate(90 62)"><circle r="12" fill="#e8833a"/>` +
    `<path d="M-12 0 h24 M0 -12 v24 M-8 -9 q9 9 0 18 M8 -9 q-9 9 0 18" ${line(2, '#8a4516')}/></g></g>`,
  dumbbell:
    `<g class="st-pump"><g transform="translate(88 62) rotate(-25)"><rect x="-13" y="-2.5" width="26" height="5" rx="2.5" fill="#5b6b86"/>` +
    `<rect x="-19" y="-8" width="7" height="16" rx="2.5" fill="#39465e"/>` +
    `<rect x="12" y="-8" width="7" height="16" rx="2.5" fill="#39465e"/></g></g>`,
  coin:
    `<g class="st-flip"><g transform="translate(91 62)"><circle r="11" fill="#ffd23e" stroke="#c99a12" stroke-width="2.5"/>` +
    `<text y="5.5" text-anchor="middle" font-size="14" font-weight="900" fill="#a67c00">$</text></g></g>`,
  thumb:
    `<g class="st-pop"><g transform="translate(88 58)"><rect x="-9" y="-1" width="21" height="18" rx="6" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5"/>` +
    `<rect x="-6" y="-16" width="9" height="19" rx="4.5" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5" transform="rotate(-16)"/></g></g>`,
  fists:
    `<g class="st-pop"><g transform="translate(60 12)"><rect x="-31" y="-6" width="19" height="15" rx="6.5" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5"/>` +
    `<rect x="12" y="-6" width="19" height="15" rx="6.5" fill="#ffc84d" stroke="#c9962e" stroke-width="2.5"/>` +
    `<path d="M-5 -8 l3 4 M0 -10 v5 M5 -8 l-3 4" ${line(2.5, '#ffd23e')}/></g></g>`,
  question: `<g class="st-pop"><text x="94" y="34" font-size="30" font-weight="900" fill="#e0554e">?</text></g>`,
  // 多個問號（是在哈囉/傻眼）
  qmarks: `<g class="st-floaty"><text x="86" y="30" font-size="21" font-weight="900" fill="#e0554e">?</text></g>` +
    `<g class="st-floaty" style="animation-delay:.5s"><text x="100" y="18" font-size="15" font-weight="900" fill="#e0891e">?</text></g>`,
  // 怒氣青筋 💢（嗆人/崩潰）
  vein: `<g class="st-pop"><path d="M89 15 q8 0 8 8 M97 15 q0 8 -8 8" fill="none" stroke="#e0554e" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M98 23 q7 0 7 7 M105 23 q0 7 -7 7" fill="none" stroke="#e0554e" stroke-width="2.5" stroke-linecap="round"/></g>`,
  // 往上箭頭（上車囉/超頂）
  arrowUp: `<g class="st-floaty"><path d="M100 26 l-9 13 h5 v11 h8 v-11 h5 Z" fill="#33c481" stroke="#1f9e5e" stroke-width="1.5" stroke-linejoin="round"/></g>`,
  // 皇冠 👑（尊爆/太神）
  crown: `<g class="st-twinkle"><path d="M43 16 L52 25 L60 10 L68 25 L77 16 L73 33 L47 33 Z" fill="#ffd23e" stroke="#c99a12" stroke-width="2" stroke-linejoin="round"/><circle cx="60" cy="17" r="2.6" fill="#ff6f9c"/></g>`,
  // 生日蛋糕 🎂
  cake: `<g transform="translate(89 61)"><rect x="-15" y="-3" width="30" height="13" rx="2" fill="#ffe0ea" stroke="#d98aa5" stroke-width="2"/>` +
    `<path d="M-15 2 h30" stroke="#ff9dbb" stroke-width="3"/><rect x="-1.5" y="-13" width="3" height="10" fill="#7ec8ff"/>` +
    `<g class="st-twinkle"><path d="M0 -18 q-3 3 0 5 q3 -2 0 -5" fill="#ff7a30"/></g></g>`,
};

// ---- sticker builder --------------------------------------------------------

const SHADOW = `<ellipse cx="60" cy="90" rx="25" ry="4.5" fill="#7a8aa0" opacity=".22"/>`;

function art(label, color, body, bodyAnim, parts) {
  const n = String(label).length;
  const fs = n <= 2 ? 23 : n === 3 ? 21 : n === 4 ? 19 : n === 5 ? 16 : 14;
  const [face, ...ambient] = parts;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-hidden="true">` +
    SHADOW +
    `<g class="${bodyAnim}">` + body + face + `</g>` +
    ambient.join('') +
    `<text x="60" y="112" text-anchor="middle" font-size="${fs}" font-weight="900"` +
    ` font-family="'PingFang TC','Heiti TC','Microsoft JhengHei','Noto Sans TC',sans-serif"` +
    ` fill="${color}" stroke="#ffffff" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${label}</text>` +
    `</svg>`
  );
}

function pack(id, name, icon, color, body, defs) {
  return {
    id, name, icon,
    stickers: defs.map(([key, label, bodyAnim, face, ...ambient]) => ({
      id: `${id}.${key}`, label, svg: art(label, color, body, bodyAnim, [face, ...ambient]),
    })),
  };
}

// ---- the packs ----------------------------------------------------------------
// def: [key, label, bodyAnim, face(eyes+mouth+face-extras), ...ambient props]

export const STICKER_PACKS = [
  // 1) 日常回覆 — 使用率最高的萬用回覆（好喔/收到/確實…）
  pack('daily', '日常回覆', '👌', '#27a06a', BODIES.bunny, [
    ['hao', '好喔', 'st-bob', EYES.happy + MOUTH.smile, PROP.sparkR],
    ['got', '收到', 'st-bob', EYES.dot + MOUTH.smile, PROP.thumb],
    ['okla', 'OK啦', 'st-jump', EYES.wink + MOUTH.grin, PROP.thumb],
    ['good', '讚啦', 'st-jump', EYES.happy + MOUTH.grin, PROP.thumb],
    ['mm', '嗯嗯', 'st-bob', EYES.closed + MOUTH.smile, PROP.sparkR],
    ['sure', '確實', 'st-bob', EYES.dot + MOUTH.smirk, PROP.sparkR],
    ['noprob', '沒問題', 'st-jump', EYES.wink + MOUTH.grin, PROP.spark, PROP.sparkR],
    ['okok', '好喔好喔', 'st-wiggle', EYES.happy + MOUTH.smile, PROP.hearts],
    ['ic', '了解', 'st-bob', EYES.dot + MOUTH.smile, PROP.sparkR],
    ['gotgot', '收到收到', 'st-bob', EYES.happy + MOUTH.smile, PROP.spark, PROP.sparkR],
  ]),
  // 2) 已讀敷衍 — 慵懶藍貓，回得心不在焉（已讀亂回/隨便你…）
  pack('read', '已讀敷衍', '😑', '#7a8699', BODIES.bluecat, [
    ['seen', '已讀', 'st-bob-slow', EYES.tired + MOUTH.flat, PROP.phone],
    ['random', '已讀亂回', 'st-wiggle', EYES.dot + MOUTH.smirk, PROP.phone],
    ['later', '再說啦', 'st-bob-slow', EYES.tired + MOUTH.flat, PROP.dots],
    ['ohya', '喔是喔', 'st-bob-slow', EYES.roll + MOUTH.flat, PROP.dots],
    ['whatever', '隨便你', 'st-sway', EYES.tired + MOUTH.flat, PROP.dots],
    ['fine', '好啦好啦', 'st-bob-slow', EYES.roll + MOUTH.flat, PROP.dots],
    ['mmm', '嗯', 'st-breathe', EYES.tired + MOUTH.flat],
    ['iknow', '知道了啦', 'st-sway', EYES.roll + MOUTH.smirk, PROP.dots],
    ['anyway', '都可以', 'st-bob-slow', EYES.tired + MOUTH.flat, PROP.phone],
    ['nvm', '沒差', 'st-sway', EYES.roll + MOUTH.flat, PROP.dots],
  ]),
  // 3) 嗆人白爛 — 粗眉小子，直白嗆辣（白爛貓風：歸剛欸/要確欸…）
  pack('sass', '嗆人白爛', '😤', '#d64545', BODIES.kid, [
    ['guigang', '歸剛欸', 'st-shake', EYES.angry + MOUTH.gah, PROP.vein],
    ['quersh', '要確欸', 'st-tilt', EYES.roll + MOUTH.smirk],
    ['shutup', '閉嘴啦', 'st-shake', EYES.angry + MOUTH.gah, PROP.boltRed],
    ['notmybiz', '關我屁事', 'st-sway', EYES.roll + MOUTH.smirk, PROP.dots],
    ['getout', '滾', 'st-shake', EYES.angry + MOUTH.shout, PROP.speedLines, PROP.boltRed],
    ['sayagain', '你再說', 'st-shake', EYES.angry + MOUTH.gah, PROP.vein],
    ['sowhat', '不然咧', 'st-tilt', EYES.roll + MOUTH.smirk],
    ['bs', '屁啦', 'st-shake', EYES.angry + MOUTH.tongue],
    ['ohreally', '是喔', 'st-sway', EYES.roll + MOUTH.smirk, PROP.dots],
    ['eyeroll', '翻白眼', 'st-tilt', EYES.roll + MOUTH.flat],
  ]),
  // 4) 迷因爛梗 — 柴犬 doge，國民級網路迷因（我就爛/真的假的/芭比Q…）
  pack('meme', '迷因爛梗', '💀', '#4f5560', BODIES.shiba, [
    ['sucks', '我就爛', 'st-sway', EYES.dead + MOUTH.flat, PROP.dots],
    ['giveup', '擺爛', 'st-breathe', EYES.tired + MOUTH.flat, PROP.zzz],
    ['forreal', '真的假的', 'st-tilt', EYES.wide + MOUTH.o, PROP.qmarks],
    ['bbq', '芭比Q', 'st-shake', EYES.dead + MOUTH.wavy, PROP.fire, PROP.sweat],
    ['nope', '母湯', 'st-shake', EYES.angry + MOUTH.gah, PROP.boltRed],
    ['thankq', '栓Q', 'st-bob-slow', EYES.tired + MOUTH.flat, PROP.thumb],
    ['broke', '破防', 'st-bob-slow', EYES.tired + MOUTH.wavy + FACEX.streams],
    ['cringe', '社死', 'st-shake', EYES.dizzy + MOUTH.wavy + FACEX.blushMore, PROP.sweat],
    ['sarcasm', '好棒棒', 'st-tilt', EYES.roll + MOUTH.smirk, PROP.thumb],
    ['emo', 'emo', 'st-breathe', EYES.tired + MOUTH.frown, PROP.dots],
  ]),
  // 5) 厭世上班 — 上班章魚，社畜苦悶（想離職/躺平/連滾帶爬…）
  pack('office', '厭世上班', '😩', '#3f6bd6', BODIES.octopus, [
    ['quit', '想離職', 'st-bob-slow', EYES.dead + MOUTH.wavy, PROP.laptop],
    ['nowork', '不想上班', 'st-sway', EYES.tired + MOUTH.frown, PROP.sweat],
    ['salary', '薪水呢', 'st-bob-slow', EYES.plead + MOUTH.frown + FACEX.tear, PROP.coin],
    ['leaveme', '放過我', 'st-shake', EYES.dead + MOUTH.wavy, PROP.sweat, PROP.speedLines],
    ['liedown', '躺平', 'st-breathe', EYES.tired + MOUTH.flat, PROP.zzz],
    ['crawl', '連滾帶爬', 'st-shake', EYES.dizzy + MOUTH.wavy, PROP.sweat, PROP.speedLines],
    ['sotired', '好累喔', 'st-breathe', EYES.tired + MOUTH.flat, PROP.zzz],
    ['ot', '加班中', 'st-sway', EYES.dead + MOUTH.wavy, PROP.moon, PROP.laptop],
    ['collapse', '崩潰', 'st-shake', EYES.dead + MOUTH.shout, PROP.vein, PROP.sweat],
    ['done', '厭世', 'st-breathe', EYES.dead + MOUTH.flat, PROP.dots],
  ]),
  // 6) 撒嬌愛心 — 美麗貓咪，情侶/朋朋撒嬌（抱抱/接住我/討拍…）
  pack('love', '撒嬌愛心', '🥰', '#e0679a', BODIES.prettycat, [
    ['missyou', '想你了', 'st-bob-slow', EYES.shiny + MOUTH.uwu, PROP.hearts],
    ['hug', '抱抱', 'st-bob', EYES.plead + MOUTH.o, PROP.hearts],
    ['kiss', '親親', 'st-bob', EYES.wink + MOUTH.kiss, PROP.hearts],
    ['friend', '朋朋', 'st-jump', EYES.happy + MOUTH.smile, PROP.hearts],
    ['catchme', '接住我', 'st-jump', EYES.plead + MOUTH.o, PROP.hearts],
    ['comfort', '討拍', 'st-bob-slow', EYES.plead + MOUTH.wavy + FACEX.tear, PROP.hearts],
    ['loveyou', '愛你唷', 'st-bob', EYES.heart + MOUTH.smile, PROP.hearts],
    ['staywme', '陪我嘛', 'st-sway', EYES.plead + MOUTH.uwu, PROP.hearts],
    ['soothe', '秀秀', 'st-bob-slow', EYES.lash + MOUTH.smile, PROP.hearts],
    ['mylove', '最愛你', 'st-bob', EYES.heart + MOUTH.uwu, PROP.hearts],
  ]),
  // 7) 應援吹捧 — 威武虎虎，浮誇吹捧（太頂了/超派/上車囉…）
  pack('hype', '應援吹捧', '🙌', '#e0891e', BODIES.tiger, [
    ['peak', '太頂了', 'st-jump', EYES.starry + MOUTH.d, PROP.crown, PROP.arrowUp],
    ['hardcore', '超派', 'st-shake', EYES.angry + MOUTH.shout, PROP.fire],
    ['lol', '笑死', 'st-jump', EYES.happy + MOUTH.d, PROP.spark, PROP.sparkR],
    ['respect', '尊爆', 'st-bob', EYES.starry + MOUTH.o, PROP.crown],
    ['amazing', '太神啦', 'st-jump', EYES.starry + MOUTH.shout, PROP.crown, PROP.spark],
    ['getin', '上車囉', 'st-jump', EYES.happy + MOUTH.grin, PROP.arrowUp, PROP.speedLines],
    ['topped', '超頂', 'st-jump', EYES.starry + MOUTH.grin, PROP.arrowUp],
    ['strong', '太猛了', 'st-jump', EYES.shades + MOUTH.grin, PROP.fire],
    ['praise', '爆讚', 'st-bob', EYES.happy + MOUTH.grin, PROP.thumb, PROP.spark],
    ['crazy', '狂', 'st-shake', EYES.shades + MOUTH.smirk, PROP.fire, PROP.sparkR],
  ]),
  // 8) 祝福問候 — 溫暖小熊，過年/日常問候（早安/新年快樂/辛苦了…）
  pack('bless', '祝福問候', '✨', '#8a5cd8', BODIES.bear, [
    ['morning', '早安', 'st-bob', EYES.happy + MOUTH.smile, PROP.sun],
    ['night', '晚安', 'st-breathe', EYES.closed + MOUTH.smile, PROP.zzz, PROP.moon],
    ['newyear', '新年快樂', 'st-jump', EYES.happy + MOUTH.grin, PROP.confetti, PROP.spark],
    ['congrats', '恭喜', 'st-jump', EYES.happy + MOUTH.grin, PROP.confetti],
    ['goodwork', '辛苦了', 'st-bow', EYES.closed + MOUTH.smile, PROP.spark],
    ['takecare', '保重', 'st-bob', EYES.happy + MOUTH.smile, PROP.hearts],
    ['fighting', '加油', 'st-jump', EYES.happy + MOUTH.shout, PROP.fists],
    ['birthday', '生日快樂', 'st-jump', EYES.happy + MOUTH.grin, PROP.cake, PROP.confetti],
    ['weekend', '週末愉快', 'st-jump', EYES.happy + MOUTH.grin, PROP.confetti, PROP.spark],
    ['thankyou', '謝謝你', 'st-bob', EYES.shiny + MOUTH.smile, PROP.hearts],
  ]),
  // 9) 疑惑吐槽 — 呆萌鼠鼠，黑人問號吐槽（蛤？/傻眼/是在哈囉…）
  pack('huh', '疑惑吐槽', '🤨', '#2f7fd6', BODIES.hamster, [
    ['ha', '蛤？', 'st-tilt', EYES.wide + MOUTH.o, PROP.question],
    ['wut', '傻眼', 'st-shake', EYES.wide + MOUTH.flat, PROP.qmarks],
    ['hello', '是在哈囉', 'st-tilt', EYES.wide + MOUTH.o, PROP.qmarks],
    ['answerme', '回答我', 'st-shake', EYES.angry + MOUTH.shout, PROP.exclam],
    ['broken', '我裂開', 'st-shake', EYES.dead + MOUTH.wavy + FACEX.crack],
    ['speechless', '無言', 'st-bob-slow', EYES.tired + MOUTH.flat, PROP.dots],
    ['srsly', '認真？', 'st-tilt', EYES.wide + MOUTH.flat, PROP.question],
    ['whatt', '蝦毀', 'st-shake', EYES.wide + MOUTH.o, PROP.qmarks],
    ['bigwut', '傻爆眼', 'st-shake', EYES.wide + MOUTH.o, PROP.qmarks, PROP.exclam],
    ['ureal', '你認真', 'st-tilt', EYES.roll + MOUTH.flat, PROP.question],
  ]),
];

const BY_ID = new Map();
for (const p of STICKER_PACKS) for (const s of p.stickers) BY_ID.set(s.id, s);

// Look up a sticker by id. Returns null for anything unknown, so a hostile or
// newer peer can never make us render arbitrary content.
export function getSticker(id) {
  return BY_ID.get(id) || null;
}
