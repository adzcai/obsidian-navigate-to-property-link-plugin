<script lang="ts">
	import Represent from "src/Represent.svelte";
	import { columnKey, type Props } from "src/utils";
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
