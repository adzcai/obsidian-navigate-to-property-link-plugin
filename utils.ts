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
