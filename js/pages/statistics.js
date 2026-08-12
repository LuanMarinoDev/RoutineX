/* =========================================================
   RoutineX — pages/statistics.js
   O que você planejou contra o que você fez, no período
   escolhido. Tudo sai de core/schedule.js — aqui só se desenha.
   ========================================================= */

import {
  $,
  $$,
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
import { emptyState, progressBar } from "../ui/components.js";

const RANGES = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
};

export function init() {
  const grid = $("#stats-grid");
  const chart = $("#stats-chart");
  const categoriesBox = $("#stats-categories");
  const streaksBox = $("#stats-streaks");
  const rangeBox = $("#stats-range");
  const eyebrow = $("[data-range-label]");

  const params = new URLSearchParams(window.location.search);
  let days = RANGES[params.get("days")] ? Number(params.get("days")) : 7;

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

  /* ---------- Números do topo ---------- */

  function paintGrid(stats) {
    render(
      grid,
      card("Atividades concluídas", String(stats.done), `de ${stats.total} planejadas`, true),
      card("Taxa de conclusão", `${stats.rate}%`, stats.rate >= 70 ? "Ritmo bom" : "Dá para melhorar"),
      card("Tempo cumprido", formatDuration(stats.doneMinutes), `de ${formatDuration(stats.plannedMinutes)}`),
      card(
        "Média por dia",
        stats.days.length ? formatDuration(Math.round(stats.doneMinutes / stats.days.length)) : "0 min",
        "de atividades concluídas"
      )
    );
  }

  function card(label, value, hint, accent = false) {
    return el("article", { class: `stat-card${accent ? " stat-card--accent" : ""}` }, [
      el("p", { class: "eyebrow", text: label }),
      el("p", { class: "stat-card__value", text: value }),
      hint && el("p", { class: "stat-card__hint", text: hint }),
    ]);
  }

  /* ---------- Gráfico por dia ---------- */

  function paintChart(stats) {
    if (!stats.total) {
      render(
        chart,
        emptyState({
          icon: "statistics",
          title: "Ainda sem dados neste período",
          text: "Cadastre atividades e vá concluindo: o gráfico compara o que você planejou com o que cumpriu.",
        })
      );
      return;
    }

    const peak = Math.max(...stats.days.map((day) => day.total), 1);
    const today = todayISO();

    render(
      chart,
      el(
        "div",
        { class: "bars", role: "img", "aria-label": `Atividades por dia nos últimos ${days} dias` },
        stats.days.map((day) => {
          const date = fromISODate(day.date);
          const label = days > 14 ? String(date.getDate()) : WEEKDAYS_MIN[date.getDay()];

          return el(
            "div",
            {
              class: "bars__col",
              dataset: { today: String(day.date === today) },
              title: `${formatDateShort(day.date)} — ${day.done} de ${day.total} concluídas`,
            },
            [
              el("div", { class: "bars__bar", style: `height:${(day.total / peak) * 100}%` }, [
                el("span", {
                  class: "bars__done",
                  style: `height:${day.total ? (day.done / day.total) * 100 : 0}%`,
                }),
              ]),
              el("span", { class: "bars__label", text: label }),
            ]
          );
        })
      ),
      el("div", { class: "chart-legend" }, [
        legend("Concluídas", "var(--accent)"),
        legend("Planejadas", "var(--surface-3)"),
      ])
    );
  }

  function legend(label, color) {
    return el("span", { class: "chart-legend__item" }, [
      el("span", { class: "chart-legend__dot", style: `background:${color}` }),
      el("span", { text: label }),
    ]);
  }

  /* ---------- Categorias ---------- */

  function paintCategories(from, to) {
    const breakdown = categoryBreakdown(from, to);

    if (!breakdown.length) {
      render(
        categoriesBox,
        emptyState({
          icon: "inbox",
          title: "Nenhuma atividade concluída ainda",
          text: "Quando você concluir atividades, elas aparecem divididas por categoria.",
        })
      );
      return;
    }

    const total = breakdown.reduce((sum, item) => sum + item.minutes, 0);

    render(
      categoriesBox,
      el(
        "div",
        { class: "breakdown" },
        breakdown.map((item) => {
          const share = Math.round((item.minutes / total) * 100);

          return el("div", { class: "breakdown__row" }, [
            el("div", { class: "breakdown__head" }, [
              el("span", { class: "tag", style: `--tag-color:${item.category.color}`, text: item.category.name }),
              el("span", { class: "breakdown__value num", text: `${formatDuration(item.minutes)} · ${share}%` }),
            ]),
            el("div", { class: "progress" }, [
              el("div", {
                class: "progress__bar",
                style: `width:${share}%;background:${item.category.color}`,
              }),
            ]),
          ]);
        })
      )
    );
  }

  /* ---------- Sequências ---------- */

  function paintStreaks(stats) {
    const current = currentStreak();
    const best = bestStreak();

    render(
      streaksBox,
      el("div", { class: "day-summary" }, [
        stat("Sequência atual", `${current} ${current === 1 ? "dia" : "dias"}`),
        stat("Melhor sequência", `${best} ${best === 1 ? "dia" : "dias"}`),
        stat("Dias completos", String(stats.days.filter((day) => day.complete).length)),
        stat("Dias com agenda", String(stats.days.filter((day) => day.total).length)),
      ]),
      progressBar(stats.rate, "Conclusão do período"),
      el("p", {
        class: "form__hint",
        text: "Um dia entra na sequência quando todas as atividades dele são concluídas.",
      })
    );
  }

  /* ---------- Orquestração ---------- */

  function paint() {
    const to = todayISO();
    const from = addDays(to, -(days - 1));
    const stats = rangeStats(from, to);

    paintRange();
    paintGrid(stats);
    paintChart(stats);
    paintCategories(from, to);
    paintStreaks(stats);
  }

  paint();
  store.on("change", paint);
}

function stat(label, value) {
  return el("div", { class: "stat" }, [
    el("p", { class: "stat__value", text: value }),
    el("p", { class: "stat__label", text: label }),
  ]);
}
