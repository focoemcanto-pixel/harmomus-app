const BR_TIME_ZONE = "America/Bahia";

const brDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BR_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTimeBR(value?: string | number | Date | null) {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return brDateTimeFormatter.format(date).replace(",", "");
}
