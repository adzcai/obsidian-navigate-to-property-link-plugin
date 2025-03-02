import Counter from "src/Counter.svelte";
import {
    App,
    type FrontmatterLinkCache,
    FuzzySuggestModal,
    Notice,
    Plugin,
    TFile,
    MarkdownRenderChild,
    parseYaml,
    resolveSubpath,
    type CachedMetadata,
} from "obsidian";
import { mount, unmount } from "svelte";
import {
    type Props,
    type Column,
    columnKey,
    type Row,
    LINK_START,
    LINK_END,
    LINK_KEY,
    linkMatch,
    Periodicity,
} from "src/utils";
import { PropertyCache } from "src/PropertyCache";
import { frontmatterLinkPlugin } from "src/FrontmatterLinkPlugin";
import type { EditorView } from "@codemirror/view";
import { PeriodicPicker } from "src/PeriodicPicker";
import { SettingTab } from "src/SettingTab";

interface ObsidianUtilitiesSettings {
    commandProperties: string[];
    templatePaths: {
        [key in Periodicity]: string | null;
    };
}

const DEFAULT_SETTINGS: ObsidianUtilitiesSettings = {
    commandProperties: [],

    templatePaths: {
        day: null,
        week: null,
        month: null,
        quarter: null,
        year: null,
    },
};

type Query =
    | {
        and: Array<Query>;
    }
    | {
        linksto:
        | string
        | {
            property: string;
            name: string;
        };
    };

export default class NavigateToPropertyLink extends Plugin {
    settings: ObsidianUtilitiesSettings;
    propertyCache = new PropertyCache(this.app.metadataCache);

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: "open-a-property-link",
            name: "Open a property link",
            editorCallback: (editor, ctx) =>
                ctx.file && this.openPropertyLink(ctx.file),
        });

        this.addCommand({
            id: "open-a-date-note",
            name: "Open a date note",
            callback: () => new PeriodicPicker(this).open(),
        });

        this.addSettingTab(new SettingTab(this));

        this.registerMarkdownCodeBlockProcessor(
            "tabular",
            async (source, el, ctx) => {
                try {
                    const { rows, columns } = await this.parseQuery(
                        source,
                        ctx.sourcePath
                    );
                    ctx.addChild(new TableComponent(rows, columns, el));
                } catch (e) {
                    console.error(e);
                    el.setText(e);
                }
            }
        );

        this.app.workspace.onLayoutReady(() => {
            this.initializeStore();

            this.registerEvent(
                this.app.metadataCache.on("changed", (file, data, cache) => {
                    if (file instanceof TFile) {
                        this.propertyCache.resetFileCache(file);
                        this.propertyCache.cacheFileMetadata(file);
                    }
                })
            );

            this.registerEvent(
                this.app.metadataCache.on("deleted", (file) => {
                    this.propertyCache.resetFileCache(file);
                })
            );
        });

        this.registerEditorExtension(frontmatterLinkPlugin);

        this.addCommand({
            id: "follow-internal-link",
            name: "Follow frontmatter link under cursor",
            editorCheckCallback: (checking, editor, ctx) => {
                // @ts-expect-error
                const editorView = editor.cm as EditorView;
                const plugin = editorView.plugin(frontmatterLinkPlugin);
                if (!plugin) return false;
                const cursorPos = editor.posToOffset(editor.getCursor());
                const {
                    from,
                    to,
                    value: decoration,
                } = plugin.decorations.iter(cursorPos);
                if (!decoration || cursorPos < from) return false;
                const dest = editor.getRange(
                    editor.offsetToPos(from - LINK_START.length),
                    editor.offsetToPos(to + LINK_END.length)
                );
                if (!dest.startsWith(LINK_START) || !dest.endsWith(LINK_END))
                    return false;
                if (checking) return true;
                this.app.workspace.openLinkText(dest, ctx.file?.path ?? "");
            },
        });
    }

    onunload(): void {
        this.propertyCache.clear();
    }

    /**
     * Creates the mapping from properties to filepaths to values.
     */
    private initializeStore() {
        const start = Date.now();

        this.app.vault
            .getMarkdownFiles()
            .forEach((file) => this.propertyCache.cacheFileMetadata(file));

        new Notice(`Done in ${Date.now() - start} ms`, 1000);
    }

    private async parseQuery(yaml: string, sourcePath: string): Promise<Props> {
        const body = parseYaml(yaml);
        const query = body.query as Query;
        const columns = body.columns as Array<Column>;
        const rows = await Promise.all(
            this.evaluateQuery(query, sourcePath).map(async (file) => {
                const data = this.app.metadataCache.getFileCache(file);
                if (!data)
                    throw new Error("Data for " + file.path + " not found");
                const entries = await Promise.all(
                    columns.map(async (column) => {
                        const key = columnKey(column);
                        const value = await this.getRowValue(file, data, key);
                        return [key, value] as const;
                    })
                );
                return Object.fromEntries([
                    ...entries,
                    ["path", file.path],
                ]) as Row;
            })
        );

        return {
            rows,
            columns,
        };
    }

    private async getRowValue(
        file: TFile,
        data: CachedMetadata,
        key: string
    ): Promise<unknown> {
        // check for blocks
        if (!key.startsWith("#")) {
            return file[key as keyof TFile] ?? data.frontmatter?.[key];
        }
        const subpathResult = resolveSubpath(data, key);
        if (!subpathResult) return;
        const contents = await this.app.vault.cachedRead(file);
        const start = subpathResult.start.offset;
        const end = subpathResult.end ? subpathResult.end.offset : undefined;
        const block = contents.slice(start, end);
        return block;
    }

    private evaluateQuery(query: Query, sourcePath: string): Array<TFile> {
        if ("linksto" in query) {
            if (typeof query.linksto === "string") {
                const target = query.linksto.replace(/^\[\[|\]\]$/g, "");
                const destFile = this.app.metadataCache.getFirstLinkpathDest(
                    target,
                    sourcePath
                );
                if (!destFile) return [];
                const backlinks = this.propertyCache.reverseCache
                    .get(LINK_KEY)
                    ?.get(destFile.path) as Array<TFile> | undefined;
                return backlinks ?? [];
            }
        }

        return [];
    }

    private async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
        this.addPropertyCommands(this.settings.commandProperties);
    }

    async updatePropertyCommands(properties: string[]) {
        const currentProperties = this.settings.commandProperties;
        const removedProperties = currentProperties.filter(
            (property) => !properties.includes(property)
        );
        const addedProperties = properties.filter(
            (property) => !currentProperties.includes(property)
        );

        removedProperties.forEach((property) =>
            this.removeCommand(`navigate-to-${property}`)
        );
        this.addPropertyCommands(addedProperties);

        this.settings.commandProperties = properties;
        await this.saveData(this.settings);
    }

    async updateTemplate(key: Periodicity, value: string | null) {
        this.settings.templatePaths[key] = value;
        await this.saveData(this.settings);
    }

    addPropertyCommands(properties: string[]) {
        new Set(properties).forEach((property) =>
            this.addCommand({
                id: `open-property-${property}`,
                name: `Open ${property}`,
                editorCallback: (editor, ctx) =>
                    ctx.file && this.openPropertyLink(ctx.file, property),
            })
        );
    }

    openPropertyLink(file: TFile, key?: string) {
        const frontmatterLinks =
            this.app.metadataCache.getFileCache(file)?.frontmatterLinks;
        const links = key
            ? frontmatterLinks?.filter((link) => linkMatch(key, link.key))
            : frontmatterLinks;
        const available = links && links.length > 0;

        if (available) {
            new LinkSelectionModal(this.app, file.path, links, !key).open();
        } else if (key) {
            new Notice(`No "${key}" link found`);
        } else {
            new Notice("No links found");
        }
    }
}

class LinkSelectionModal extends FuzzySuggestModal<FrontmatterLinkCache> {
    constructor(
        app: App,
        private sourcePath: string,
        private links: Array<FrontmatterLinkCache>,
        private showKey: boolean
    ) {
        super(app);
    }

    getItems(): FrontmatterLinkCache[] {
        return this.links;
    }

    getItemText(item: FrontmatterLinkCache): string {
        const text = item.displayText ?? item.link;
        if (!this.showKey) return text;
        return `${text} (${item.key})`;
    }

    onChooseItem(
        item: FrontmatterLinkCache,
        evt: MouseEvent | KeyboardEvent
    ): void {
        this.app.workspace.openLinkText(item.link, this.sourcePath);
    }
}

class TableComponent extends MarkdownRenderChild {
    counter: ReturnType<typeof Counter>;

    constructor(
        private rows: Array<Row>,
        private columns: Array<Column>,
        containerEl: HTMLElement
    ) {
        super(containerEl);
    }

    onload(): void {
        this.counter = mount(Counter, {
            target: this.containerEl,
            props: {
                rows: this.rows,
                columns: this.columns,
            },
        });
    }

    onunload(): void {
        unmount(this.counter).catch(console.error);
    }
}
