import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	type DecorationSet,
	type PluginValue,
} from "@codemirror/view";
import { LINK_END, LINK_START } from "src/utils";

class FrontmatterLinkPlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy(): void {}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const tree = syntaxTree(view.state);
		const { from, to } = view.visibleRanges.reduce(
			({ from, to }, { from: from_, to: to_ }) => ({
				from: Math.min(from, from_),
				to: Math.max(to, to_),
			}),
			{ from: Infinity, to: -Infinity }
		);
		tree.iterate({
			from,
			to,
			enter(node) {
				if (node.name !== "hmd-frontmatter_string") return;

				const text = view.state.sliceDoc(node.from, node.to);
				const link = /^"\[\[([^\]]+)\]\]"$/.exec(text);
				if (!link) return;
				builder.add(
					node.from,
					node.from + LINK_START.length,
					Decoration.mark({
						class: "cm-formatting-link cm-formatting-link_formatting-link-start",
						tagName: "span",
					})
				);
				builder.add(
					node.from + LINK_START.length,
					node.to - LINK_END.length,
					Decoration.mark({
						class: "cm-hmd-internal-link",
						tagName: "span",
					})
				);
				builder.add(
					node.to - LINK_END.length,
					node.to,
					Decoration.mark({
						class: "cm-formatting-link cm-formatting-link_formatting-link-end",
						tagName: "span",
					})
				);
			},
		});
		return builder.finish();
	}
}

const pluginSpec = {
	decorations: (value: FrontmatterLinkPlugin) => value.decorations,
};

export const frontmatterLinkPlugin = ViewPlugin.fromClass(
	FrontmatterLinkPlugin,
	pluginSpec
);
