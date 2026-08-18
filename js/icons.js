/* ============================================================================
   icons.js — one glyph set, for every page.

   Both prototypes draw from this file, because an icon is part of the system
   rather than part of a page: `gear` and `globe` had drifted into two different
   drawings, one per page, and ten more glyphs were byte-identical copies. A
   name means one mark everywhere or the vocabulary is a coincidence.

   Every glyph is a fragment of a 24x24 path set, stroked — no fills, no
   viewBox of its own, no size. `ic()` supplies all three, which is why a glyph
   can be dropped into a 12px row or a 32px tile without being redrawn.

   Loaded before everything else on both pages: it declares two globals, `P`
   and `ic`, and nothing may declare them again.
   ========================================================================= */
const P = {
  /* rail sections — chat, knowledge, build, cloud, account */
  chat:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.7A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/>',
  cube:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  build:'<path d="M4 5v14l7.3-6.2a1 1 0 0 0 0-1.6Z"/><path d="M20 5v14l-7.3-6.2a1 1 0 0 1 0-1.6Z"/>',
  cloud:'<path d="M7 18.5a4.2 4.2 0 0 1-.5-8.4 5.6 5.6 0 0 1 10.8 1.2A3.7 3.7 0 0 1 17 18.5Z"/>',
  user:'<circle cx="12" cy="9" r="3.2"/><path d="M5.6 19.6a6.7 6.7 0 0 1 12.8 0"/>',

  /* content kinds */
  library:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M11 4h3.5A1.5 1.5 0 0 1 16 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11z"/><path d="m18.2 5.4 1.7 13.3"/>',
  agent:'<rect x="4" y="7" width="16" height="12" rx="2.5"/><path d="M12 3v4M8.5 12v1.5M15.5 12v1.5"/>',
  data:'<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  layers:'<path d="m12 3 9 4.8-9 4.8-9-4.8Z"/><path d="m3 13.2 9 4.8 9-4.8"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  folder:'<path d="M3 7.5A2 2 0 0 1 5 5.5h3.4l2 2.4H19a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  link:'<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.6 1.6"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.6-1.6"/>',
  /* leaving the page — download, share, and the two audiences a link can have */
  down:'<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M5 20h14"/>',
  share:'<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3.4 9.5h17.2M3.4 14.5h17.2"/><path d="M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18Z"/>',
  users:'<circle cx="9.5" cy="9" r="3"/><path d="M3.7 19a6.1 6.1 0 0 1 11.6 0"/><path d="M16 6.6a3 3 0 0 1 0 5.8"/><path d="M17.6 19a6.5 6.5 0 0 0-1.4-3.2"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.6-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10a2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.6 1Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4"/><path d="M12 17h.01"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  retry:'<path d="M20 11a8 8 0 1 0-2 6.2"/><path d="M20 5v6h-6"/>',
  branch:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="9" r="2.4"/><path d="M6 8.4v7.2M8.4 6H14a2 2 0 0 1 2 2v.6"/>',
  file:'<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/>',
  spark:'<path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9Z"/>',
  chevR:'<path d="m9 6 6 6-6 6"/>',
  chevL:'<path d="m15 6-6 6 6 6"/>',
  chevD:'<path d="m6 9 6 6 6-6"/>',
  tool:'<path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 13l-8 8-2-2 1.9-1.9a3.5 3.5 0 0 0-4.6-4.6L6.4 14.4l-2-2 8-8Z"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  check:'<path d="m5 13 4 4L19 7"/>',
  play:'<path d="M7 4.5 19 12 7 19.5Z"/>',
  table:'<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 10h18M9 10v9.5"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  doc:'<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6M9 13h6M9 17h4"/>',
  diff:'<path d="M6 3v12a3 3 0 0 0 3 3h6"/><path d="M3 6h6M15 15l3 3-3 3"/><path d="M18 21V9a3 3 0 0 0-3-3H9"/>',
  open:'<path d="M14 4h6v6"/><path d="m20 4-8.5 8.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',

  /* knowledge-detail tabs */
  files:'<path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h6.6L20 7.9v8.6a1.5 1.5 0 0 1-1.5 1.5H16"/><rect x="4" y="8" width="10" height="12" rx="1.5"/>',
  trend:'<path d="m3 16 5.5-5.5 3.5 3.5L21 5"/><path d="M15 5h6v6"/>',
  pie:'<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M14.5 3.4A9 9 0 0 1 20.6 9.5H14.5Z"/>',
  lock:'<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
  pulse:'<path d="M3 12h3.5l2.2-5.5 3.4 11 2.3-5.5H21"/>',
  sort:'<path d="m8.5 10 3.5-3.5L15.5 10"/><path d="m8.5 14 3.5 3.5L15.5 14"/>',
  code:'<path d="m9.5 8.5-4 3.5 4 3.5"/><path d="m14.5 8.5 4 3.5-4 3.5"/>',
  /* One star, outlined or filled — the filled one is the same path with a fill,
     so the two states cannot drift out of shape. */
  star:'<path d="m12 4.3 2.35 4.9 5.35.75-3.9 3.75.95 5.3-4.75-2.6-4.75 2.6.95-5.3L4.3 9.95l5.35-.75Z"/>',
  starOn:'<path d="m12 4.3 2.35 4.9 5.35.75-3.9 3.75.95 5.3-4.75-2.6-4.75 2.6.95-5.3L4.3 9.95l5.35-.75Z" fill="currentColor"/>',
  trash:'<path d="M4.5 7h15M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',

  /* builder kinds — connector, widget, website template, solution */
  plug:'<path d="M9 3v5M15 3v5"/><path d="M7 8h10v3.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z"/><path d="M12 16.5V21"/>',
  widget:'<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6.5" y="8" width="7" height="8" rx="1"/><path d="M16 8h1.5M16 11h1.5"/>',
  template:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  pkg:'<path d="m12 3 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/><path d="m8 5 8 4"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>',

  /* app glyphs — the identity half of an app tile */
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  filetext:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  dollar:'<path d="M12 3v18"/><path d="M16.5 7.5A3.5 3.5 0 0 0 13 5.5h-1.6a2.9 2.9 0 0 0 0 5.8h1.2a3 3 0 0 1 0 6H11a3.5 3.5 0 0 1-3.2-2"/>',
  checksq:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.2 2.8 2.8L16.5 9.3"/>',
  feather:'<path d="M19.4 4.6a5.5 5.5 0 0 0-7.8 0L5 11.2V19h7.8l6.6-6.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M15.5 8.5 5 19M13 11H8.5M16 8h-3"/>',
  idcard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.1"/><path d="M5.8 16.2a3.6 3.6 0 0 1 6.4 0M15 10h3.5M15 13.5h3.5"/>',
  receipt:'<path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  news:'<path d="M4 6h11a1 1 0 0 1 1 1v11H6a2 2 0 0 1-2-2Z"/><path d="M16 9h3a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2h-2"/><path d="M7 9h5M7 12h5M7 15h3"/>',
  note:'<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h7L19 9.5v9A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5Z"/><path d="M13 4v6h6"/><path d="M8.5 13.5h6M8.5 16.5h4"/>',

  /* publishing channels. Drawn on the same 24 grid at the same stroke weight as
     everything else — a channel is identified here, not advertised, so these are
     marks in the interface's own hand rather than three imported logos. */
  facebook:'<rect x="4" y="4" width="16" height="16" rx="3.4"/><path d="M15 8.4h-1.6a2 2 0 0 0-2 2V20"/><path d="M9.6 13h4.6"/>',
  instagram:'<rect x="4" y="4" width="16" height="16" rx="4.6"/><circle cx="12" cy="12" r="3.4"/><path d="M16.6 7.6h.01"/>',
  linkedin:'<rect x="4" y="4" width="16" height="16" rx="3.4"/><path d="M8.2 10.6V16"/><path d="M8.2 8.1h.01"/><path d="M11.6 16v-3.2a2.2 2.2 0 0 1 4.2 0V16"/>',

  /* deployment modules — the cloud page brought these, and the workspace is
     welcome to them. */
  flag:'<path d="M5 21V4M5 4h11l-1.6 4L16 12H5"/>',
  shield:'<path d="M12 3l7.5 3v5.6c0 4.3-3.1 7.8-7.5 8.9-4.4-1.1-7.5-4.6-7.5-8.9V6Z"/><path d="m9.2 12 2 2 3.6-3.6"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M14.6 9.2A2.6 2.6 0 0 0 12 7.8c-1.4 0-2.6.9-2.6 2s1.2 2 2.6 2 2.6.9 2.6 2-1.2 2-2.6 2a2.6 2.6 0 0 1-2.6-1.4M12 6.2v11.6"/>',
  gauge:'<path d="M3.6 18a8.4 8.4 0 1 1 16.8 0"/><path d="m12 18 4.2-5.4"/><circle cx="12" cy="18" r="1.3"/>',
  people:'<circle cx="9.2" cy="8.8" r="3"/><path d="M3.5 19a5.9 5.9 0 0 1 11.4 0"/><path d="M16.4 6.2a2.9 2.9 0 0 1 0 5.6M17.6 19a6 6 0 0 0-1.5-3.3"/>',
};

/* The one place an SVG is assembled. Stroke weight is a system decision, not a
   per-icon one: 1.6 at every size, so a 13px glyph in a row and a 32px glyph on
   a tile read as the same hand. */
function ic(name, size){
  const s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
         (P[name] || '') + '</svg>';
}
