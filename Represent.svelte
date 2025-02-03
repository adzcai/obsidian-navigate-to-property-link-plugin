<script module>
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
</script>

<script lang="ts">
	import Self from "./Represent.svelte";

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
