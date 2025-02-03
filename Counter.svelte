<script module>
	import type { TFile } from "obsidian";
	import Represent from "Represent.svelte";

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
</script>

<script lang="ts">
	let { rows, columns }: Props = $props();
</script>

<table>
	<thead>
		<tr>
			{#each columns as column}
				<th>
					{column}
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.path)}
			<tr>
				{#each columns as column (columnKey(column))}
					<td>
						<Represent item={row[columnKey(column)]} />
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
