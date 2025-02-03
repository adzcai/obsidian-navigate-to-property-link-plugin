import type { TFile } from "obsidian";

export interface Row extends TFile {
    [key: string]: unknown;
}

export type Column =
    | string
    | {
        key: string;
        title: string;
    };

export interface Props {
    rows: Array<Row>;
    columns: Array<Column>;
}

export function columnKey(column: Column) {
    return typeof column === "string" ? column : column.key;
}

export function flatEntries(obj: object): Array<[string, unknown]> {
    if (obj === null) return [];
    return Object.entries(obj).flatMap(([key, value]) =>
        typeof value === "object"
            ? flatEntries(value).map(([k, value]): [string, unknown] => [
                `${key}.${k}`,
                value,
            ])
            : [[key, value]],
    );
}

export const LINK_START = '"[[' as const;
export const LINK_END = ']]"' as const;
export const LINK_KEY = '__LINK__' as const;export function linkMatch(key: string, link: string) {
	if (link === key) return true;
	const i = link.lastIndexOf('.');
	return i > -1 && link.slice(0, i) === key && /^\d+$/.test(link.slice(i + 1));
}
export function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
export enum Periodicity {
	DAY = 'day',
	WEEK = 'week',
	MONTH = 'month',
	QUARTER = 'quarter',
	YEAR = 'year'
}

