<script lang="ts">
	import { flatEntries } from "src/utils";
	import Self from "src/Represent.svelte";

	let { item }: { item: unknown } = $props();
</script>

{#if typeof item === "object" && item !== null}
	<dl>
		{#each flatEntries(item) as [key, value]}
			<dt>{key}</dt>
			<dd>{value}</dd>
		{/each}
	</dl>
{:else}
	{item}
{/if}
