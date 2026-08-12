/* =========================================================
   RoutineX — core/schedule.js
   Traduz rotinas (regras) + atividades (registros) em
   "ocorrências": o que efetivamente acontece em cada dia.

   Regra de ouro:
   - Uma rotina gera uma ocorrência virtual em cada dia que ela cobre.
   - Se existir uma atividade real com o mesmo routineId naquele dia,
     ela vence a virtual (foi concluída, editada ou removida).
   - Atividade com skipped=true é uma lápide: cancela aquele dia
     sem apagar a rotina inteira.
   ========================================================= */

import { store } from "../storage.js";
import {
  addDays,
  eachDay,
  fromISODate,
  timeToMinutes,
  todayISO,
  nowMinutes,
  toISODate,
} from "../utils.js";

export const VIRTUAL_SEP = "::";

/* ---------- Rotinas ---------- */

export function routineCoversDate(routine, iso) {
  if (!routine || routine.paused) return false;
  if (routine.startDate && iso < routine.startDate) return false;
  if (routine.endDate && iso > routine.endDate) return false;
  return (routine.days || []).includes(fromISODate(iso).getDay());
}

/** Ocorrência virtual: tem o formato de uma atividade, mas não está salva. */
function virtualFromRoutine(routine, iso) {
  return {
    id: `${routine.id}${VIRTUAL_SEP}${iso}`,
    virtual: true,
    routineId: routine.id,
    title: routine.title,
    notes: routine.notes || "",
    categoryId: routine.categoryId,
    date: iso,
    start: routine.start,
    end: routine.end,
    done: false,
    doneAt: null,
  };
}

/* ---------- Ocorrências ---------- */

const byStart = (a, b) =>
  a.start.localeCompare(b.start) || a.title.localeCompare(b.title);

/** Tudo o que acontece em um dia, já ordenado por horário. */
export function occurrencesFor(iso) {
  const activities = store.getActivities({ date: iso });
  const claimed = new Set(
    activities.filter((a) => a.routineId).map((a) => a.routineId)
  );

  const virtuals = store
    .getRoutines()
    .filter((r) => routineCoversDate(r, iso) && !claimed.has(r.id))
    .map((r) => virtualFromRoutine(r, iso));

  return [...activities.filter((a) => !a.skipped), ...virtuals].sort(byStart);
}

/** Map<iso, ocorrências[]> para um intervalo fechado. */
export function occurrencesInRange(from, to) {
  const days = eachDay(from, to);
  const activities = store.getActivities({ from, to });
  const routines = store.getRoutines();

  const byDate = new Map(days.map((iso) => [iso, []]));

  for (const activity of activities) {
    if (activity.skipped) continue;
    byDate.get(activity.date)?.push(activity);
  }

  const claimed = new Set(
    activities
      .filter((a) => a.routineId)
      .map((a) => `${a.routineId}${VIRTUAL_SEP}${a.date}`)
  );

  for (const iso of days) {
    for (const routine of routines) {
      if (!routineCoversDate(routine, iso)) continue;
      if (claimed.has(`${routine.id}${VIRTUAL_SEP}${iso}`)) continue;
      byDate.get(iso).push(virtualFromRoutine(routine, iso));
    }
    byDate.get(iso).sort(byStart);
  }

  return byDate;
}

/** Recupera uma ocorrência pelo id — real ou virtual. */
export function getOccurrence(id) {
  if (!id) return null;

  if (id.includes(VIRTUAL_SEP)) {
    const [routineId, iso] = id.split(VIRTUAL_SEP);
    const routine = store.getRoutine(routineId);
    if (!routine || !routineCoversDate(routine, iso)) return null;

    // Se já virou atividade real nesse dia, devolve a real.
    const real = store
      .getActivities({ date: iso })
      .find((a) => a.routineId === routineId);
    return real && !real.skipped ? real : virtualFromRoutine(routine, iso);
  }

  const activity = store.getActivity(id);
  return activity && !activity.skipped ? activity : null;
}

/**
 * Transforma uma ocorrência virtual em atividade salva.
 * Ocorrências reais passam direto.
 */
export function materialize(occurrence, patch = {}) {
  if (!occurrence.virtual) {
    return Object.keys(patch).length
      ? store.saveActivity({ id: occurrence.id, ...patch })
      : occurrence;
  }

  const { id, virtual, ...rest } = occurrence;
  return store.saveActivity({ ...rest, ...patch });
}

/** Marca / desmarca a conclusão, materializando a rotina se preciso. */
export function toggleOccurrenceDone(occurrence) {
  const done = !occurrence.done;
  return materialize(occurrence, {
    done,
    doneAt: done ? new Date().toISOString() : null,
  });
}

/**
 * Remove uma ocorrência.
 * @param {"one"|"series"} scope  um dia só, ou a rotina inteira
 */
export function deleteOccurrence(occurrence, scope = "one") {
  if (!occurrence.routineId) {
    store.deleteActivity(occurrence.id);
    return;
  }

  if (scope === "series") {
    store.deleteRoutineActivities(occurrence.routineId);
    store.deleteRoutine(occurrence.routineId);
    return;
  }

  // Um dia só: grava a lápide para a rotina não regerar a ocorrência.
  if (occurrence.virtual) {
    const { id, virtual, ...rest } = occurrence;
    store.saveActivity({ ...rest, skipped: true, done: false });
  } else {
    store.saveActivity({ id: occurrence.id, skipped: true, done: false });
  }
}

/* ---------- Tempo ---------- */

export function durationOf(occurrence) {
  const start = timeToMinutes(occurrence.start);
  const end = timeToMinutes(occurrence.end);
  return Math.max(0, end - start);
}

/** Estado de uma ocorrência em relação ao instante atual. */
export function statusOf(occurrence, date = new Date()) {
  const today = toISODate(date);
  if (occurrence.date < today) return "past";
  if (occurrence.date > today) return "future";

  const minutes = nowMinutes(date);
  if (minutes < timeToMinutes(occurrence.start)) return "future";
  if (minutes >= timeToMinutes(occurrence.end)) return "past";
  return "now";
}

/** Quanto já passou da ocorrência, de 0 a 1. */
export function progressOf(occurrence, date = new Date()) {
  const total = durationOf(occurrence);
  if (!total) return 1;
  const elapsed = nowMinutes(date) - timeToMinutes(occurrence.start);
  return Math.min(1, Math.max(0, elapsed / total));
}

/**
 * O que está acontecendo agora e o que vem em seguida.
 * Procura em até 14 dias à frente para não devolver vazio numa semana calma.
 */
export function focusNow(date = new Date(), horizonDays = 14) {
  const today = toISODate(date);
  const minutes = nowMinutes(date);
  const todays = occurrencesFor(today);

  const current =
    todays.find(
      (o) =>
        !o.done &&
        timeToMinutes(o.start) <= minutes &&
        minutes < timeToMinutes(o.end)
    ) || null;

  let next =
    todays.find((o) => !o.done && timeToMinutes(o.start) > minutes) || null;

  for (let ahead = 1; !next && ahead <= horizonDays; ahead++) {
    next = occurrencesFor(addDays(today, ahead)).find((o) => !o.done) || null;
  }

  return { current, next, today: todays };
}

/** Minutos até o início (positivo) ou desde o início (negativo). */
export function minutesUntil(occurrence, date = new Date()) {
  const today = toISODate(date);
  const dayDiff = Math.round(
    (fromISODate(occurrence.date) - fromISODate(today)) / 86400000
  );
  return dayDiff * 1440 + timeToMinutes(occurrence.start) - nowMinutes(date);
}

/* ---------- Estatísticas ---------- */

export function dayStats(iso, list = null) {
  const items = list || occurrencesFor(iso);
  const done = items.filter((o) => o.done);

  const plannedMinutes = items.reduce((sum, o) => sum + durationOf(o), 0);
  const doneMinutes = done.reduce((sum, o) => sum + durationOf(o), 0);

  return {
    date: iso,
    total: items.length,
    done: done.length,
    pending: items.length - done.length,
    plannedMinutes,
    doneMinutes,
    rate: items.length ? Math.round((done.length / items.length) * 100) : 0,
    complete: items.length > 0 && done.length === items.length,
  };
}

/** Estatísticas dia a dia + totais do intervalo. */
export function rangeStats(from, to) {
  const byDate = occurrencesInRange(from, to);
  const days = [...byDate.entries()].map(([iso, list]) => dayStats(iso, list));

  const total = days.reduce((sum, d) => sum + d.total, 0);
  const done = days.reduce((sum, d) => sum + d.done, 0);

  return {
    days,
    total,
    done,
    plannedMinutes: days.reduce((sum, d) => sum + d.plannedMinutes, 0),
    doneMinutes: days.reduce((sum, d) => sum + d.doneMinutes, 0),
    rate: total ? Math.round((done / total) * 100) : 0,
  };
}

/** Minutos concluídos por categoria em um intervalo. */
export function categoryBreakdown(from, to) {
  const byDate = occurrencesInRange(from, to);
  const totals = new Map();

  for (const list of byDate.values()) {
    for (const occurrence of list) {
      if (!occurrence.done) continue;
      const key = occurrence.categoryId || "cat_outros";
      totals.set(key, (totals.get(key) || 0) + durationOf(occurrence));
    }
  }

  const categories = store.getCategories();
  return [...totals.entries()]
    .map(([id, minutes]) => ({
      category: categories.find((c) => c.id === id) || {
        id,
        name: "Sem categoria",
        color: "#929892",
      },
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Dias seguidos com tudo concluído, contando de trás para frente.
 * O dia de hoje só entra quando já está completo — assim a sequência
 * não "quebra" às oito da manhã.
 */
export function currentStreak(maxDays = 400) {
  let cursor = todayISO();
  if (!dayStats(cursor).complete) cursor = addDays(cursor, -1);

  let streak = 0;
  for (let i = 0; i < maxDays; i++) {
    if (!dayStats(cursor).complete) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Melhor sequência já registrada dentro da janela observada. */
export function bestStreak(windowDays = 180) {
  const today = todayISO();
  const byDate = occurrencesInRange(addDays(today, -windowDays), today);

  let best = 0;
  let run = 0;
  for (const [iso, list] of byDate) {
    if (dayStats(iso, list).complete) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}
