/* =========================================================
   RoutineX — ui/icons.js
   Ícones SVG inline (traço 1.6, grid 24). Sem dependências.
   ========================================================= */

const PATHS = {
  logo: '<path d="M12 3v9l6 3"/><circle cx="12" cy="12" r="9"/>',
  dashboard:
    '<rect x="3" y="3" width="7" height="8" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="3" y="15" width="7" height="6" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/>',
  today:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tasks:
    '<path d="M4 7l2.5 2.5L11 5"/><path d="M4 17l2.5 2.5L11 15"/><path d="M14 8h6M14 18h6"/>',
  routines:
    '<path d="M4 10a8 8 0 0 1 13.6-5.6L21 8"/><path d="M21 4v4h-4"/><path d="M20 14a8 8 0 0 1-13.6 5.6L3 16"/><path d="M3 20v-4h4"/>',
  statistics:
    '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.4V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.6 9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  alert:
    '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  inbox:
    '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-7z"/>',
  sparkle:
    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>',
  user:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-1a5.5 5.5 0 0 1 5.5-5.5h3A5.5 5.5 0 0 1 16 19v1"/><path d="M17 4.3a3.5 3.5 0 0 1 0 6.8M18.5 13.7A5 5 0 0 1 22 18.5V20"/>',
  logout:
    '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  shield:
    '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  download: '<path d="M12 4v11"/><path d="M8 12l4 4 4-4"/><path d="M4 20h16"/>',
  upload: '<path d="M12 20V9"/><path d="M8 12l4-4 4 4"/><path d="M4 4h16"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 4l12 8-12 8V4z"/>',
  bell:
    '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
};

/**
 * Devolve o markup SVG do ícone.
 * @param {string} name  chave em PATHS
 * @param {number} size  tamanho em px
 */
export function icon(name, size = 20) {
  const path = PATHS[name] || PATHS.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

/** Versão que devolve um nó pronto para append. */
export function iconEl(name, size = 20) {
  const wrapper = document.createElement("span");
  wrapper.innerHTML = icon(name, size);
  return wrapper.firstElementChild;
}

export const ICON_NAMES = Object.keys(PATHS);
