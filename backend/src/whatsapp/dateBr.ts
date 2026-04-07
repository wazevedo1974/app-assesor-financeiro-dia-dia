const TZ = "America/Sao_Paulo";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Data YYYY-MM-DD no fuso de São Paulo (hoje). */
export function todayYmdBr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Primeiro e último dia do mês corrente em SP, como YYYY-MM-DD. */
export function monthRangeYmdBr(): { from: string; to: string } {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: TZ }).split("-");
  const y = Number(ymd[0]);
  const mo = Number(ymd[1]);
  const lastDay = new Date(y, mo, 0).getDate();
  return {
    from: `${y}-${pad2(mo)}-01`,
    to: `${y}-${pad2(mo)}-${pad2(lastDay)}`,
  };
}

/**
 * Início e fim de um dia civil em São Paulo (UTC−3, sem horário de verão),
 * expressos em Date para filtros Prisma.
 */
export function brDayBoundsUtc(ymd: string): { gte: Date; lte: Date } {
  const [y, m, d] = ymd.split("-").map(Number);
  const gte = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
  const lte = new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999));
  return { gte, lte };
}

export function monthBoundsUtc(): { gte: Date; lte: Date } {
  const { from, to } = monthRangeYmdBr();
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const gte = new Date(Date.UTC(fy, fm - 1, fd, 3, 0, 0, 0));
  const lte = new Date(Date.UTC(ty, tm - 1, td + 1, 2, 59, 59, 999));
  return { gte, lte };
}
