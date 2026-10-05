import { todayISO } from "./dates.ts";

export const HOUSE_NAME = process.env.HOUSE_NAME ?? "Casa Pards";
export const houseToday = () => todayISO(process.env.HOUSE_TIMEZONE || undefined);
