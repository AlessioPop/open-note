/* Open Note — ui/icons.js
   the line-icon set — one small drawing per feature, 24×24, stroke only.

   Everything draws in currentColor so an icon takes whatever colour the text
   around it has. `icn('table')` hands back the <svg>; a feature that ships an
   icon of its own registers it with defineIcon('mything', '<path d="…"/>')
   and names it in defineTool. Nothing here knows what the icons are for. */

const ICONS = {
  /* ---- shelves ---- */
  pencil:  '<path d="M4.8 19.2l.9-3.6L16 5.3a1.9 1.9 0 0 1 2.7 2.7L8.4 18.3l-3.6.9z"/><path d="M14.4 6.9l2.7 2.7"/>',
  sigma:   '<path d="M16.8 6.2H7.6l5.2 5.8-5.2 5.8h9.2"/>',
  cube:    '<path d="M5 9l5-5h9v9l-5 5H5z"/><path d="M5 9h9v9M14 9l5-5"/>',
  flask:   '<path d="M9.6 4h4.8M10.4 4v5.3l-4.7 8a1.7 1.7 0 0 0 1.5 2.6h9.6a1.7 1.7 0 0 0 1.5-2.6l-4.7-8V4"/><path d="M8.2 14.6h7.6"/>',
  logic:   '<path d="M8.5 6.5h4a5.5 5.5 0 0 1 0 11h-4z"/><path d="M8.5 12h-5M8.5 8.6h-5M8.5 15.4h-5M18 12h3"/>',
  sparkle: '<path d="M12 4c.75 4.4 1.6 5.25 6 6-4.4.75-5.25 1.6-6 6-.75-4.4-1.6-5.25-6-6 4.4-.75 5.25-1.6 6-6z"/><path d="M18.6 15.6c.35 2.05.75 2.45 2.8 2.8-2.05.35-2.45.75-2.8 2.8-.35-2.05-.75-2.45-2.8-2.8 2.05-.35 2.45-.75 2.8-2.8z"/>',

  /* ---- write ---- */
  heading: '<path d="M6 5v14M18 5v14M6 12h12"/>',
  text:    '<path d="M4 6.5h16M4 11.5h16M4 16.5h9.5"/>',
  hand:    '<path d="M3.5 15.5c2-6.5 4-8.5 5-7.5s-1 7.5.5 8 2.5-4 4-4 .5 3.5 2 4 3.5-2 5.5-5.5"/>',
  mono:    '<path d="M9.5 8l-4 4 4 4M14.5 8l4 4-4 4"/>',
  marker:  '<path d="M14 4l6 6-8 8-6-6z"/><path d="M9.5 11.5l3 3M4 20h16"/>',
  check:   '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M8.5 12.3l2.6 2.6 4.6-5.2"/>',
  note:    '<path d="M5 5h14v8.5L13.5 19H5z"/><path d="M13.5 19v-5.5H19"/>',
  deck:    '<path d="M8 5.5h11.5v8"/><rect x="4.5" y="8.5" width="11.5" height="10" rx="1.5"/><path d="M4.5 12.5h11.5"/>',
  atlas:   '<path d="M5 4.5h5v9l-2.5-1.9L5 13.5z"/><path d="M13.5 6.5h6M13.5 10h6M5 17h14.5M5 20h9"/>',

  /* ---- maths & data ---- */
  plot:    '<path d="M5.5 4.5v14h14.5"/><path d="M7.5 15.5c1.5-6 3-6 4.5-2s3 4 5.5-1.5"/>',
  table:   '<rect x="4" y="5.5" width="16" height="13" rx="1.5"/><path d="M4 11h16M12 5.5v13"/>',
  sheet:   '<rect x="4" y="4.5" width="16" height="15" rx="1.5"/><path d="M4 9h16M9.5 9v10.5M15 9v10.5"/>',
  node:    '<rect x="3.5" y="4.5" width="7" height="6" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="6" rx="1.5"/><path d="M10.5 7.5c4 0 0 9 3 9"/>',
  matrix:  '<path d="M8.5 4.5H6v15h2.5M15.5 4.5H18v15h-2.5"/><circle cx="10.5" cy="9.2" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="9.2" r="1.15" fill="currentColor" stroke="none"/><circle cx="10.5" cy="14.8" r="1.15" fill="currentColor" stroke="none"/><circle cx="13.5" cy="14.8" r="1.15" fill="currentColor" stroke="none"/>',
  vector:  '<path d="M5 19L17.5 6.5"/><path d="M17.5 6.5H12M17.5 6.5V12"/>',

  /* ---- media ---- */
  image:   '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4.5 16.4l4-3.6 3.4 3 3.2-2.6 4.4 3.4"/>',
  video:   '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10.3 9.2v5.6l4.9-2.8z" fill="currentColor" stroke="none"/>',
  model:   '<path d="M12 3.2l7.4 4.2v9.2L12 20.8l-7.4-4.2V7.4z"/><path d="M12 11.6l7.4-4.2M12 11.6L4.6 7.4M12 11.6v9.2"/>',
  clip:    '<path d="M20.6 11.3l-8.5 8.5a5.6 5.6 0 0 1-7.9-7.9l8.5-8.5a3.7 3.7 0 0 1 5.3 5.3l-8.5 8.5a1.85 1.85 0 0 1-2.6-2.6l7.8-7.9"/>',
  folder:  '<path d="M4 18.5v-11c0-1.1.9-2 2-2h4l2 2.5h6c1.1 0 2 .9 2 2v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',

  /* ---- science ---- */
  molecule:'<path d="M12 5.4l5.4 3.1v6.3L12 17.9l-5.4-3.1V8.5z"/><path d="M9.4 9.6v4.8M17.4 8.5l3.1-1.8"/><circle cx="21.2" cy="6.2" r="1.1" fill="currentColor" stroke="none"/>',

  /* ---- shapes to draw over ---- */
  sphere:  '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3.2"/>',
  torus:   '<ellipse cx="12" cy="12" rx="8.5" ry="5.5"/><ellipse cx="12" cy="11.5" rx="3.6" ry="1.9"/>',
  square:  '<path d="M7.5 6.5h9L20 17.5H4z"/>',
  circle:  '<ellipse cx="12" cy="12" rx="8.8" ry="4.6"/>',

  /* ---- decoration ---- */
  washi:   '<path d="M4.6 11.2l12.6-6a1.6 1.6 0 0 1 2.2.8l1 2.2a1.6 1.6 0 0 1-.8 2.2l-12.6 6a1.6 1.6 0 0 1-2.2-.8l-1-2.2a1.6 1.6 0 0 1 .8-2.2z"/><path d="M9.2 12.4l.9 2M13.2 10.5l.9 2"/>',
  sticker: '<path d="M12 4.4l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.7l5-.7z"/>',

  /* ---- page actions, and the palette's own furniture ---- */
  eraser:  '<path d="M13.6 5.4l5 5L11 18H7.4l-2-2z"/><path d="M10.6 8.4l5 5M13 18h7"/>',
  trash:   '<path d="M5 7h14M9.5 7V4.8h5V7M7 7l.8 12.4h8.4L17 7"/><path d="M10 10.5v5.5M14 10.5v5.5"/>',
  search:  '<circle cx="11" cy="11" r="5.8"/><path d="M15.2 15.2L20 20"/>'
};

function defineIcon(name, inner){ ICONS[name] = inner; }

/* the <svg> itself — sized by the CSS around it, coloured by currentColor */
function icn(name, cls){
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
}
