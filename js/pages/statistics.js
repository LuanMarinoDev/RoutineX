/* =========================================================
   RoutineX — pages/statistics.js
   O que você planejou contra o que você fez, no período
   escolhido. Tudo sai de core/schedule.js — aqui só se desenha.

   >>> USE_MOCK = true enche a tela com dados de mentira só
   >>> para conferir o visual. Vire para false ao integrar.
   ========================================================= */

import {
  $,
  el,
  render,
  addDays,
  todayISO,
  fromISODate,
  formatDuration,
  formatDateShort,
  WEEKDAYS_MIN,
} from "../utils.js";
import { store } from "../storage.js";
import {
  rangeStats,
  categoryBreakdown,
  currentStreak,
  bestStreak,
} from "../core/schedule.js";
import { emptyState } from "../ui/components.js";

const USE_MOCK = true;

const RANGES = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
};

/** Texto vindo dos dados entra em SVG por innerHTML: escapar é obrigatório. */
const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

/* =========================================================
   Dados de mentira — some quando USE_MOCK vira false
   ========================================================= */

const MOCK_CATEGORIES = [
  { name: "Trabalho", color: "#59a5ff", weight: 0.34 },
  { name: "Exercício", color: "#b6f000", weight: 0.22 },
  { name: "Estudos", color: "#a78bfa", weight: 0.18 },
  { name: "Casa", color: "#ff9d47", weight: 0.14 },
  { name: "Lazer", color: "#f472b6", weight: 0.12 },
];

/** Ruído estável: o mesmo dia devolve sempre o mesmo número. */
function noise(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function mockRangeStats(from, count) {
  const days = [];
  let done = 0;
  let total = 0;
  let doneMinutes = 0;
  let plannedMinutes = 0;

  for (let index = 0; index < count; index++) {
    const date = addDays(from, index);
    const weekday = fromISODate(date).getDay();
    const random = noise(index);

    // Fim de semana tem agenda mais leve.
    const planned = weekday === 0 || weekday === 6
      ? 1 + Math.round(random * 2)
      : 3 + Math.round(random * 3);

    const completed = Math.min(planned, Math.round(planned * (0.4 + noise(index + 99) * 0.7)));
    const minutes = completed * (35 + Math.round(noise(index + 7) * 45));

    days.push({
      date,
      total: planned,
      done: completed,
      complete: planned > 0 && completed === planned,
      doneMinutes: minutes,
      plannedMinutes: planned * 55,
    });

    done += completed;
    total += planned;
    doneMinutes += minutes;
    plannedMinutes += planned * 55;
  }

  return {
    days,
    done,
    total,
    doneMinutes,
    plannedMinutes,
    rate: total ? Math.round((done / total) * 100) : 0,
  };
}

function mockBreakdown(totalMinutes) {
  return MOCK_CATEGORIES.map((category, index) => ({
    category: { name: category.name, color: category.color },
    minutes: Math.round(totalMinutes * category.weight * (0.9 + noise(index) * 0.2)),
  })).sort((a, b) => b.minutes - a.minutes);
}

/* ---------- Fonte de dados ---------- */

function readStats(from, to, count) {
  if (!USE_MOCK) return rangeStats(from, to);
  return mockRangeStats(from, count);
}

function readBreakdown(from, to, stats) {
  if (!USE_MOCK) return categoryBreakdown(from, to);
  return mockBreakdown(stats.doneMinutes);
}

const readCurrentStreak = () => (USE_MOCK ? 4 : currentStreak());
const readBestStreak = () => (USE_MOCK ? 9 : bestStreak());

/* =========================================================
   Página
   ========================================================= */

export function init() {
  const hero = $("#stats-hero");
  const grid = $("#stats-grid");
  const chart = $("#stats-chart");
  const rail = $("#stats-rail");
  const bannerBox = $("#stats-banner");
  const rangeBox = $("#stats-range");
  const eyebrow = $("[data-range-label]");

  const params = new URLSearchParams(window.location.search);
  let days = RANGES[params.get("days")] ? Number(params.get("days")) : 7;

  /* ---------- Peças de gráfico ---------- */

  /** Rosca: uma fatia por item, na cor do próprio item. */
  function donut(slices, size = 190, thickness = 20) {
    const radius = size / 2 - thickness / 2 - 2;
    const circumference = 2 * Math.PI * radius;
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);

    let offset = 0;
    const arcs = slices
      .map((slice) => {
        const length = total ? (slice.value / total) * circumference : 0;
        const arc = `
          <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
                  fill="none"
                  stroke="${escape(slice.color)}"
                  stroke-width="${thickness}"
                  stroke-dasharray="${length} ${circumference - length}"
                  stroke-dashoffset="${-offset}">
            <title>${escape(slice.label)}</title>
          </circle>`;
        offset += length;
        return arc;
      })
      .join("");

    const node = el("div", { class: "donut" });
    node.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Gráfico de rosca">
        <g transform="rotate(-90 ${size / 2} ${size / 2})">
          <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
                  fill="none" stroke="var(--surface-3)" stroke-width="${thickness}" />
          ${arcs}
        </g>
      </svg>`;
    return node;
  }

  function donutBlock(slices, { size = 190, thickness = 20, value, label } = {}) {
    return el("div", { class: "donut-wrap" }, [
      donut(slices, size, thickness),
      el("div", { class: "donut__center" }, [
        el("p", { class: "donut__value num", text: value }),
        el("p", { class: "donut__label", text: label }),
      ]),
    ]);
  }

  /** Curva suave da série diária, no rodapé dos cartões de número. */
  function spark(values, color = "var(--accent)") {
    const width = 220;
    const height = 52;
    const peak = Math.max(...values, 1);
    const step = values.length > 1 ? width / (values.length - 1) : width;

    const points = values.map((value, index) => [
      index * step,
      height - 6 - (value / peak) * (height - 14),
    ]);

    // Suaviza ligando os pontos por médias — evita o serrilhado da polyline.
    let line = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
    for (let index = 0; index < points.length - 1; index++) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[index + 1];
      line += ` Q ${x1.toFixed(1)} ${y1.toFixed(1)} ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}`;
    }
    const last = points[points.length - 1];
    line += ` T ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;

    const id = `spark-${Math.random().toString(36).slice(2, 8)}`;
    const node = el("div", { class: "spark" });
    node.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.35" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="${line} L ${width} ${height} L 0 ${height} Z" fill="url(#${id})" />
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>`;
    return node;
  }

  /** Colunas: a barra clara é o planejado, a cheia é o concluído. */
  function columns(series, { mini = false } = {}) {
    const peak = Math.max(...series.map((item) => item.total), 1);

    return el(
      "div",
      { class: `bars${mini ? " bars--mini" : ""}` },
      series.map((item) =>
        el(
          "div",
          {
            class: "bars__col",
            dataset: { today: String(Boolean(item.today)) },
            title: item.title || "",
          },
          [
            el("div", { class: "bars__bar", style: `height:${(item.total / peak) * 100}%` }, [
              el("span", {
                class: "bars__done",
                style: `height:${item.total ? (item.done / item.total) * 100 : 0}%${
                  item.color ? `;background:${item.color}` : ""
                }`,
              }),
            ]),
            item.label ? el("span", { class: "bars__label", text: item.label }) : null,
          ]
        )
      )
    );
  }

  /** Faixa de constância: um quadradinho por dia, quanto mais cheio melhor. */
  function heatStrip(series) {
    return el(
      "div",
      { class: "heat", role: "img", "aria-label": "Constância dia a dia" },
      series.map((day) => {
        const share = day.total ? Math.round((day.done / day.total) * 100) : 0;

        return el("span", {
          class: "heat__cell",
          dataset: { complete: String(Boolean(day.complete)) },
          style: `background:color-mix(in srgb, var(--accent) ${share}%, var(--surface-3))`,
          title: `${formatDateShort(day.date)} — ${day.done} de ${day.total}`,
        });
      })
    );
  }

  /* ---------- Seletor de período ---------- */

  function paintRange() {
    render(
      rangeBox,
      el("div", { class: "segmented", role: "group", "aria-label": "Período" },
        Object.entries(RANGES).map(([value, label]) =>
          el("button", {
            type: "button",
            "aria-pressed": String(Number(value) === days),
            text: label,
            onclick: () => {
              days = Number(value);
              const url = new URL(window.location.href);
              url.searchParams.set("days", value);
              window.history.replaceState({}, "", url);
              paint();
            },
          })
        )
      )
    );

    if (eyebrow) eyebrow.textContent = `Os últimos ${RANGES[days]}`;
  }

  /* ---------- Bloco principal: rosca por categoria ---------- */

  function paintHero(stats, breakdown) {
    if (!breakdown.length) {
      render(
        hero,
        el("div", { class: "card__head" }, [
          el("p", { class: "eyebrow", text: "Tempo por categoria" }),
        ]),
        emptyState({
          icon: "inbox",
          title: "Nenhuma atividade concluída ainda",
          text: "Quando você concluir atividades, elas aparecem divididas por categoria.",
        })
      );
      return;
    }

    const slices = breakdown.map((item) => ({
      color: item.category.color,
      value: item.minutes,
      label: `${item.category.name} — ${formatDuration(item.minutes)}`,
    }));

    const legend = el(
      "ul",
      { class: "legend" },
      breakdown.map((item) =>
        el("li", { class: "legend__row" }, [
          el("span", { class: "legend__dot", style: `background:${item.category.color}` }),
          el("span", { class: "legend__name", text: item.category.name }),
          el("span", { class: "legend__value num", text: formatDuration(item.minutes) }),
        ])
      )
    );

    render(
      hero,
      el("div", { class: "card__head" }, [
        el("p", { class: "eyebrow", text: "Tempo por categoria" }),
      ]),
      el("div", { class: "hero" }, [
        el("div", { class: "hero__side" }, [
          el("p", { class: "hero__value num", text: formatDuration(stats.doneMinutes) }),
          el("p", {
            class: "hero__hint",
            text: `cumpridos de ${formatDuration(stats.plannedMinutes)} planejados`,
          }),
          legend,
        ]),

        donutBlock(slices, {
          value: String(stats.done),
          label: "concluídas",
        }),
      ])
    );
  }

  /* ---------- Números com curva ---------- */

  function paintGrid(stats) {
    const daily = stats.days;
    const done = daily.map((day) => day.done);
    const planned = daily.map((day) => day.total);
    const minutes = daily.some((day) => Number.isFinite(day.doneMinutes))
      ? daily.map((day) => day.doneMinutes || 0)
      : done;

    const average = daily.length
      ? formatDuration(Math.round(stats.doneMinutes / daily.length))
      : "0 min";

    render(
      grid,
      metric("Atividades concluídas", String(stats.done), `de ${stats.total} planejadas`, done, "var(--accent)"),
      metric("Tempo cumprido", formatDuration(stats.doneMinutes), `de ${formatDuration(stats.plannedMinutes)}`, minutes, "#a78bfa"),
      metric("Média por dia", average, `${(stats.total / (daily.length || 1)).toFixed(1)} atividades por dia`, planned, "#38d9d9")
    );
  }

  function metric(label, value, hint, series, color) {
    return el("article", { class: "stat-card" }, [
      el("div", {}, [
        el("p", { class: "eyebrow", text: label }),
        el("p", { class: "stat-card__value num", text: value }),
        hint && el("p", { class: "stat-card__hint", text: hint }),
      ]),
      series.length ? spark(series, color) : null,
    ]);
  }

  /* ---------- Gráfico por dia ---------- */

  function paintChart(stats) {
    if (!stats.total) {
      render(
        chart,
        el("div", { class: "card__head" }, [
          el("p", { class: "eyebrow", text: "Atividades por dia" }),
        ]),
        emptyState({
          icon: "statistics",
          title: "Ainda sem dados neste período",
          text: "Cadastre atividades e vá concluindo: o gráfico compara o que você planejou com o que cumpriu.",
        })
      );
      return;
    }

    const today = todayISO();
    const dense = stats.days.length > 14;
    const every = Math.ceil(stats.days.length / 10);

    const series = stats.days.map((day, index) => {
      const date = fromISODate(day.date);
      const show = !dense || index % every === 0;

      return {
        total: day.total,
        done: day.done,
        today: day.date === today,
        label: show ? (dense ? String(date.getDate()) : WEEKDAYS_MIN[date.getDay()]) : "",
        title: `${formatDateShort(day.date)} — ${day.done} de ${day.total} concluídas`,
      };
    });

    render(
      chart,
      el("div", { class: "card__head" }, [
        el("p", { class: "eyebrow", text: "Atividades por dia" }),
        el("div", { class: "chart-legend" }, [
          legendItem("Concluídas", "var(--accent)"),
          legendItem("Planejadas", "var(--surface-3)"),
        ]),
      ]),
      columns(series)
    );
  }

  function legendItem(label, color) {
    return el("span", { class: "chart-legend__item" }, [
      el("span", { class: "chart-legend__dot", style: `background:${color}` }),
      el("span", { text: label }),
    ]);
  }

  /* ---------- Trilho lateral ---------- */

  function paintRail(stats) {
    const current = readCurrentStreak();
    const best = readBestStreak();
    const complete = stats.days.filter((day) => day.complete).length;

    // Média por dia da semana: domingo a sábado.
    const buckets = Array.from({ length: 7 }, () => ({ done: 0, total: 0, count: 0 }));
    stats.days.forEach((day) => {
      const bucket = buckets[fromISODate(day.date).getDay()];
      bucket.done += day.done;
      bucket.total += day.total;
      bucket.count += 1;
    });

    const weekdaySeries = buckets.map((bucket, weekday) => ({
      done: bucket.count ? bucket.done / bucket.count : 0,
      total: bucket.count ? bucket.total / bucket.count : 0,
      label: WEEKDAYS_MIN[weekday],
      title: `${WEEKDAYS_MIN[weekday]} — média de ${(bucket.count ? bucket.done / bucket.count : 0).toFixed(1)} concluídas`,
    }));

    const pending = Math.max(0, stats.total - stats.done);

    render(
      rail,

      el("article", { class: "rail-card" }, [
        el("p", { class: "eyebrow", text: "Constância" }),
        heatStrip(stats.days),
        el("div", { class: "rail-card__pair" }, [
          pair(String(current), current === 1 ? "dia seguido" : "dias seguidos"),
          pair(String(best), "melhor sequência"),
          pair(String(complete), "dias completos"),
        ]),
      ]),

      el("article", { class: "rail-card" }, [
        el("p", { class: "eyebrow", text: "Por dia da semana" }),
        columns(weekdaySeries, { mini: true }),
      ]),

      el("article", { class: "rail-card" }, [
        el("p", { class: "eyebrow", text: "Planejado x concluído" }),
        donutBlock(
          [
            { color: "var(--accent)", value: stats.done, label: `Concluídas — ${stats.done}` },
            { color: "var(--surface-3)", value: pending, label: `Em aberto — ${pending}` },
          ],
          { size: 132, thickness: 16, value: String(stats.total), label: "planejadas" }
        ),
        el("div", { class: "rail-card__pair" }, [
          pair(String(stats.done), "concluídas"),
          pair(String(pending), "em aberto"),
        ]),
      ])
    );
  }

  function pair(value, label) {
    return el("div", { class: "pair" }, [
      el("p", { class: "pair__value num", text: value }),
      el("p", { class: "pair__label", text: label }),
    ]);
  }

  /* ---------- Faixa do rodapé ---------- */

  function paintBanner() {
    if (!bannerBox || bannerBox.dataset.dismissed === "true") return;

    const close = el("button", {
      class: "banner__close",
      type: "button",
      "aria-label": "Fechar aviso",
      text: "×",
    });

    close.addEventListener("click", () => {
      bannerBox.dataset.dismissed = "true";
      render(bannerBox);
    });

    render(
      bannerBox,
      el("div", { class: "banner" }, [
        el("div", {}, [
          el("p", { class: "banner__title", text: "Como a sequência funciona" }),
          el("p", {
            class: "banner__text",
            text: "Um dia entra na sequência quando todas as atividades dele são concluídas. Rotinas pausadas não contam.",
          }),
        ]),
        el("a", { class: "btn btn--primary", href: "calendar.html", text: "Abrir calendário" }),
        close,
      ])
    );
  }

  /* ---------- Orquestração ---------- */

  function paint() {
    const to = todayISO();
    const from = addDays(to, -(days - 1));
    const stats = readStats(from, to, days);
    const breakdown = readBreakdown(from, to, stats);

    paintRange();
    paintHero(stats, breakdown);
    paintGrid(stats);
    paintChart(stats);
    paintRail(stats);
    paintBanner();
  }

  paint();
  store.on("change", paint);
}