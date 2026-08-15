/* =========================================================
   RoutineX — ui/shell.js
   Monta sidebar + topbar em todas as páginas a partir de um
   único lugar, cuida do drawer no mobile e marca a página ativa.

   Cada página informa quem é através do <body data-page="..." data-root="...">
   ========================================================= */

import { el, $ } from "../utils.js";
import { icon } from "./icons.js";
import { store } from "../storage.js";
import { THEME_LABEL } from "./theme.js";
import { accounts } from "../auth/accounts.js";
import { can, roleOf, isReadOnly } from "../auth/permissions.js";
import { initialsOf } from "../auth/validators.js";

/* Não existe item "Hoje": o dashboard é a tela do dia — resumo,
   agenda e progresso moram lá. Para outro dia, o calendário. */
const NAV = [
  { id: "dashboard", label: "Dashboard", href: "index.html", icon: "dashboard" },
  {
    id: "calendar",
    label: "Calendário",
    href: "pages/calendar.html",
    icon: "calendar",
  },
  { id: "tasks", label: "Tarefas", href: "pages/tasks.html", icon: "tasks" },
  {
    id: "routines",
    label: "Rotinas",
    href: "pages/routines.html",
    icon: "routines",
  },
  {
    id: "statistics",
    label: "Estatísticas",
    href: "pages/statistics.html",
    icon: "statistics",
  },
];

/* Só aparece para quem pode gerenciar contas. */
const ADMIN_ITEM = {
  id: "users",
  label: "Usuários",
  href: "pages/users.html",
  icon: "users",
  requires: "users:manage",
};

const PROFILE_ITEM = {
  id: "profile",
  label: "Meu perfil",
  href: "pages/profile.html",
  icon: "user",
};

const SETTINGS_ITEM = {
  id: "settings",
  label: "Configurações",
  href: "pages/settings.html",
  icon: "settings",
};

/* O botão principal muda de acordo com a tela em que você está. */
const PRIMARY_ACTION = {
  tasks: { kind: "task", label: "Nova tarefa" },
  routines: { kind: "routine", label: "Nova rotina" },
  settings: { kind: "activity", label: "Nova atividade" },
};

const DEFAULT_ACTION = { kind: "activity", label: "Nova atividade" };

/* Espelha o breakpoint do CSS: a partir de 900px a sidebar é fixa. */
const MOBILE_QUERY = "(max-width: 899.98px)";

let drawerOpen = false;
let lastFocused = null;

/**
 * Marca do sistema: um slot de imagem, e nada mais.
 *
 * São dois arquivos porque a escrita da logo é preta: no tema escuro
 * ela sumiria. O N azul é o mesmo nos dois — só a palavra muda de cor.
 * O quadro segue a proporção da imagem (uma logo deitada não fica
 * espremida num quadrado) e `size` define a altura dela.
 */
export const LOGO_FILE = "assets/images/logo.png"; /* escrita preta — tema claro */
export const LOGO_FILE_DARK = "assets/images/logo-dark.png"; /* escrita branca — tema escuro */

/** O tema em vigor mora em <html data-theme>, gravado antes da primeira pintura. */
const isDarkTheme = () => document.documentElement.dataset.theme !== "light";

export function brandMark(root, { size = 56 } = {}) {
  // O símbolo embutido é só rede de segurança: fica escondido e só
  // aparece se o arquivo da logo faltar. Assim ele nunca pisca por
  // cima da marca enquanto a imagem carrega.
  const glyph = el("span", {
    class: "brand__glyph",
    html: icon("logo", Math.round(size * 0.5)),
    hidden: true,
  });

  const image = el("img", {
    class: "brand__logo",
    alt: "",
    onerror: () => {
      image.hidden = true;
      glyph.hidden = false;
    },
  });

  const applyTheme = () => {
    const file = isDarkTheme() ? LOGO_FILE_DARK : LOGO_FILE;
    const next = root + file;
    if (image.getAttribute("src") !== next) image.src = next;
  };

  applyTheme();

  // Trocar o tema troca o arquivo na hora, sem recarregar a página.
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributeFilter: ["data-theme"],
  });

  return el(
    "span",
    { class: "brand__mark", style: `--brand-size:${size}px` },
    [glyph, image]
  );
}

/* ---------- Construção ---------- */

function navLink(item, current, root) {
  const active = item.id === current;
  return el("a", {
    class: "nav__link",
    href: root + item.href,
    "aria-current": active ? "page" : null,
    html: `${icon(item.icon, 18)}<span>${item.label}</span>`,
  });
}

function buildSidebar(current, root) {
  return el("aside", { class: "sidebar", id: "sidebar" }, [
    el("nav", { class: "nav", "aria-label": "Navegação principal" }, [
      el("p", { class: "eyebrow nav__label", text: "Navegar" }),
      ...visibleNav().map((item) => navLink(item, current, root)),
    ]),

    el("div", { class: "sidebar__foot" }, [
      navLink(SETTINGS_ITEM, current, root),
      accountCard(root),
      el("div", { class: "sidebar__meta" }, [
        el("span", { text: "Tema" }),
        el("span", {
          class: "theme-pill",
          text: THEME_LABEL[store.getSettings().theme] || "Dark",
        }),
      ]),
    ]),
  ]);
}

/** Navegação visível para o nível de acesso de quem está logado. */
function visibleNav() {
  const user = accounts.currentUser();
  return [...NAV, ADMIN_ITEM].filter(
    (item) => !item.requires || can(user, item.requires)
  );
}

/** Avatar com iniciais — sem foto para carregar, sem rede envolvida. */
export function avatar(user, size = 34) {
  return el("span", {
    class: "avatar",
    style: `--avatar-size:${size}px`,
    "aria-hidden": "true",
    text: initialsOf(user?.name),
  });
}

/** Cartão da conta no rodapé da sidebar: quem sou eu e como saio. */
function accountCard(root) {
  const user = accounts.currentUser();
  if (!user) return null;

  return el(
    "a",
    {
      class: "account",
      href: `${root}pages/profile.html`,
      "aria-label": `Perfil de ${user.name}`,
    },
    [
      avatar(user),
      el("span", { class: "account__text" }, [
        el("span", { class: "account__name", text: user.name.split(" ")[0] }),
        el("span", { class: "account__role", text: roleOf(user).label }),
      ]),
      el("span", { class: "account__chevron", html: icon("chevronRight", 14) }),
    ]
  );
}

function buildTopbar(current) {
  const burger = el("button", {
    class: "btn btn--ghost btn--icon topbar__burger",
    type: "button",
    "aria-label": "Abrir menu",
    "aria-controls": "sidebar",
    "aria-expanded": "false",
    html: icon("menu", 18),
    onclick: () => toggleDrawer(),
  });

  // O campo é só a porta de entrada: quem busca de verdade é o overlay.
  const openSearchOverlay = (event) => {
    event.preventDefault();
    event.target.blur?.();
    document.dispatchEvent(new CustomEvent("lp:search"));
  };

  const search = el("div", { class: "search" }, [
    el("span", { html: icon("search", 15) }),
    el("input", {
      class: "input",
      type: "search",
      placeholder: "Pesquisar",
      "aria-label": "Abrir a busca global",
      readonly: true,
      onclick: openSearchOverlay,
      onfocus: openSearchOverlay,
    }),
  ]);

  const searchButton = el("button", {
    class: "btn btn--ghost btn--icon topbar__search-btn",
    type: "button",
    "aria-label": "Buscar",
    html: icon("search", 16),
    onclick: () => document.dispatchEvent(new CustomEvent("lp:search")),
  });

  const action = PRIMARY_ACTION[current] || DEFAULT_ACTION;
  const user = accounts.currentUser();
  const root = document.body.dataset.root ?? "";

  // A logo mora no centro do header — a mesma marca em toda tela.
  const brand = el(
    "a",
    {
      class: "topbar__brand",
      href: root + "index.html",
      "aria-label": "RoutineX — ir para o dashboard",
      title: "RoutineX",
    },
    [brandMark(root, { size: 64 })]
  );

  // Visitante não cria nada: em vez de um botão que falha, um selo honesto.
  if (isReadOnly(user)) {
    return el("header", { class: "topbar" }, [
      el("div", { class: "topbar__start" }, [burger]),
      brand,
      el("div", { class: "topbar__end" }, [
        search,
        searchButton,
        el("span", {
          class: "tag tag--plain",
          title: "Seu nível de acesso permite apenas consultar",
          text: "Somente leitura",
        }),
        userMenu(),
      ]),
    ]);
  }

  const newButton = el("button", {
    class: "btn btn--primary",
    type: "button",
    id: "new-activity",
    "aria-label": action.label,
    html: `${icon("plus", 16)}<span class="btn__text">${action.label}</span>`,
    onclick: () => requestCreate(action.kind, { source: "topbar" }),
  });

  return el("header", { class: "topbar" }, [
    el("div", { class: "topbar__start" }, [burger]),
    brand,
    el("div", { class: "topbar__end" }, [search, searchButton, newButton, userMenu()]),
  ]);
}

/* ---------- Menu da conta ---------- */

/** Avatar clicável na topbar: perfil, configurações e saída. */
function userMenu() {
  const user = accounts.currentUser();
  if (!user) return null;

  const root = document.body.dataset.root ?? "";

  const items = [
    { label: "Meu perfil", icon: "user", href: `${root}pages/profile.html` },
    { label: "Configurações", icon: "settings", href: `${root}pages/settings.html` },
    can(user, "users:manage") && {
      label: "Usuários",
      icon: "users",
      href: `${root}pages/users.html`,
    },
  ].filter(Boolean);

  const list = el("div", { class: "menu__list menu__list--right", role: "menu", hidden: true }, [
    el("div", { class: "menu__head" }, [
      el("p", { class: "menu__name", text: user.name }),
      el("p", { class: "menu__mail", text: user.email }),
      el("span", { class: "tag tag--plain", text: roleOf(user).label }),
    ]),

    ...items.map((item) =>
      el("a", {
        class: "menu__item",
        role: "menuitem",
        href: item.href,
        html: `${icon(item.icon, 15)}<span>${item.label}</span>`,
      })
    ),

    el("button", {
      class: "menu__item menu__item--danger",
      type: "button",
      role: "menuitem",
      html: `${icon("logout", 15)}<span>Sair da conta</span>`,
      onclick: () => {
        accounts.signOut();
        window.location.href = `${root}pages/login.html`;
      },
    }),
  ]);

  const trigger = el("button", {
    class: "topbar__user",
    type: "button",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-label": `Conta de ${user.name}`,
    onclick: (event) => {
      event.stopPropagation();
      const opening = list.hidden;
      list.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      if (opening) document.addEventListener("click", close, { once: true });
    },
  });

  trigger.append(avatar(user, 30));

  function close() {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  document.addEventListener("lp:escape", close);

  return el("div", { class: "menu menu--user" }, [trigger, list]);
}

/* ---------- Barra inferior (celular) ---------- */

/* As telas que a mão alcança sem abrir menu nenhum. */
const TABS = ["dashboard", "calendar", "tasks", "routines"];

function buildTabbar(current, root) {
  const user = accounts.currentUser();

  const links = TABS.map((id) => {
    const item = NAV.find((entry) => entry.id === id);
    return el("a", {
      class: "tabbar__link",
      href: root + item.href,
      "aria-current": item.id === current ? "page" : null,
      html: `${icon(item.icon, 20)}<span>${item.label}</span>`,
    });
  });

  // O botão de criar fica no meio, onde o polegar chega primeiro.
  const action = PRIMARY_ACTION[current] || DEFAULT_ACTION;
  const create = isReadOnly(user)
    ? null
    : el("button", {
        class: "tabbar__link tabbar__link--action",
        type: "button",
        "aria-label": action.label,
        html: `<span>${icon("plus", 18)}</span><span>Criar</span>`,
        onclick: () => requestCreate(action.kind, { source: "tabbar" }),
      });

  if (create) links.splice(2, 0, create);

  return el("nav", { class: "tabbar", "aria-label": "Navegação rápida" }, links);
}

/* ---------- Drawer ---------- */

const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

export function toggleDrawer(force) {
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const burger = $(".topbar__burger");
  if (!sidebar) return;

  drawerOpen = force ?? !drawerOpen;

  sidebar.dataset.open = String(drawerOpen);
  scrim.dataset.open = String(drawerOpen);
  burger?.setAttribute("aria-expanded", String(drawerOpen));
  burger?.setAttribute("aria-label", drawerOpen ? "Fechar menu" : "Abrir menu");
  document.body.dataset.drawer = drawerOpen ? "open" : "closed";

  if (drawerOpen) {
    lastFocused = document.activeElement;
    sidebar.querySelector(".nav__link")?.focus();
  } else {
    lastFocused?.focus?.();
    lastFocused = null;
  }
}

/** Mantém o foco dentro do drawer enquanto ele estiver aberto. */
function trapFocus(event) {
  if (!drawerOpen || event.key !== "Tab") return;

  const sidebar = $("#sidebar");
  const focusable = sidebar.querySelectorAll("a[href], button:not([disabled])");
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- Ações de criação ---------- */

/**
 * O shell não conhece os formulários. Ele apenas anuncia a intenção
 * e o app.js — que costura os módulos — abre o modal certo.
 * @param {"activity"|"task"|"routine"} kind
 */
export function requestCreate(kind = "activity", detail = {}) {
  document.dispatchEvent(
    new CustomEvent("lp:create", { detail: { kind, ...detail } })
  );
}

export const requestNewActivity = (detail = {}) => requestCreate("activity", detail);

/* ---------- Inicialização ---------- */

export function initShell() {
  const body = document.body;
  const current = body.dataset.page || "dashboard";
  const root = body.dataset.root ?? "";

  const sidebarSlot = $("#shell-sidebar");
  const topbarSlot = $("#shell-topbar");
  if (!sidebarSlot || !topbarSlot) {
    console.warn("[shell] Slots do layout não encontrados nesta página.");
    return;
  }

  sidebarSlot.replaceWith(buildSidebar(current, root));
  topbarSlot.replaceWith(buildTopbar(current));

  document.body.append(buildTabbar(current, root));

  // Fundo escuro do drawer
  const scrim = el("div", {
    id: "scrim",
    class: "scrim",
    "data-open": "false",
    hidden: false,
    onclick: () => toggleDrawer(false),
  });
  body.append(scrim);

  // Fecha o menu ao navegar ou ao voltar para o desktop
  $("#sidebar").addEventListener("click", (event) => {
    if (event.target.closest(".nav__link") && isMobile()) toggleDrawer(false);
  });

  window.matchMedia(MOBILE_QUERY).addEventListener("change", (event) => {
    if (!event.matches) toggleDrawer(false);
  });

  // Qualquer botão da página pode pedir um cadastro novo
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;

    const KINDS = {
      "new-activity": "activity",
      "new-task": "task",
      "new-routine": "routine",
    };

    const kind = KINDS[trigger.dataset.action];
    if (kind) requestCreate(kind, { source: "page", date: trigger.dataset.date });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawerOpen) toggleDrawer(false);
    trapFocus(event);
  });

  document.body.dataset.drawer = "closed";
}

export const isDrawerOpen = () => drawerOpen;
