import { desktopDocuments, desktopRows } from "./apps";

export const iconCell = 92;
export const iconAreaWidth = 8 + Math.max(desktopDocuments.length, ...desktopRows.map((row) => row.length)) * iconCell;
