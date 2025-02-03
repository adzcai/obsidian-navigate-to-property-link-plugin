import * as chrono from 'chrono-node'
import Counter, { columnKey, type Column, type Props, type Row } from 'Counter.svelte';
import { moment, App, type FrontmatterLinkCache, FuzzySuggestModal, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal, MarkdownRenderChild, parseYaml, type LinkCache, type Reference, resolveSubpath, type CachedMetadata, MarkdownRenderer } from 'obsidian';
import { flatEntries } from 'Represent.svelte';
import { mount, unmount } from 'svelte';

enum Periodicity {
	DAY = 'day',
	WEEK = 'week',
	MONTH = 'month',
	QUARTER = 'quarter',
	YEAR = 'year',
}

const placeholders: { [key in Periodicity]: string } = {
	day: 'YYYY-MM-DD',
	week: 'gggg [W]ww',
	month: 'YYYY-MM MMMM',
	quarter: 'YYYY [Q]Q',
	year: 'YYYY',
}

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
	}
}

const LINK_KEY = '__LINK__' as const;

type Query =
	| {
		and: Array<Query>
	}
	| {
		linksto: string | {
			property: string;
			name: string;
		}
	};

export default class NavigateToPropertyLink extends Plugin {
	settings: ObsidianUtilitiesSettings;
	reverseCache = new Map<string, Map<string, unknown>>();
	activeKeys = new Map<string, Set<string>>();

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'open-a-property-link',
			name: 'Open a property link',
			editorCallback: (editor, ctx) => ctx.file && this.openPropertyLink(ctx.file),
		});

		this.addCommand({
			id: 'open-a-date-note',
			name: 'Open a date note',
			callback: () => new PeriodicPicker(this).open()
		});

		this.addSettingTab(new PeriodicPickerSettingsTab(this));

		this.registerMarkdownCodeBlockProcessor('tabular', async (source, el, ctx) => {
			try {
				const { rows, columns } = await this.parseQuery(source, ctx.sourcePath);
				ctx.addChild(new TableComponent(rows, columns, el));
			} catch (e) {
				console.error(e);
				el.setText(e)
			}
		})

		this.app.workspace.onLayoutReady(() => {
			this.initializeStore();

			this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => {
				if (file instanceof TFile) {
					this.resetCache(file);
					this.cacheFile(file)
				}
			}))
		})
	}

	onunload(): void {
		this.reverseCache.clear();
		this.activeKeys.clear();
	}

	/**
	 * Creates the mapping from properties to filepaths to values.
	 */
	private initializeStore() {
		const start = Date.now();

		this.app.vault.getMarkdownFiles().forEach(file => this.cacheFile(file));

		new Notice(`Done in ${Date.now() - start} ms`, 1000);
	}

	private resetCache(file: TFile) {
		const activeKeys = this.activeKeys.get(file.path);
		if (activeKeys) {
			activeKeys.forEach((property) => this.reverseCache.get(property)?.delete(file.path));
			activeKeys.clear();
		}
	}

	private cacheFile(file: TFile) {
		const metadata = this.app.metadataCache.getFileCache(file);
		if (typeof metadata?.frontmatter === 'object') {
			flatEntries(metadata.frontmatter).forEach(([key, value]) => {
				this.cacheProperty(key, file.path, value);
			})
		}

		metadata?.links?.forEach((link) => this.cacheLink(link, file));
		metadata?.frontmatterLinks?.forEach((link) => {
			this.cacheLink(link, file);
			this.cacheProperty(`${LINK_KEY}.${link.key}`, file.path, link);
		});
	}

	private cacheLink(link: Reference, source: TFile) {
		const target = this.app.metadataCache.getFirstLinkpathDest(link.link, source.path);
		if (target) this.cacheProperty(LINK_KEY, target.path, source, true);
	}

	private cacheProperty(property: string, path: string, value: unknown, multiple = false) {
		const keyCache = this.reverseCache.get(property);
		if (keyCache) {
			keyCache.set(path, multiple ? [...keyCache.get(path) as Array<unknown> ?? [], value] : value)
		} else {
			this.reverseCache.set(property, new Map([[path, multiple ? [value] : value]]))
		}

		const activeKeys = this.activeKeys.get(path);
		if (activeKeys) activeKeys.add(property);
		else this.activeKeys.set(path, new Set([property]));
	}

	private async parseQuery(yaml: string, sourcePath: string): Promise<Props> {
		const body = parseYaml(yaml);
		const query = body.query as Query;
		const columns = body.columns as Array<Column>;
		const rows = await Promise.all(this.evaluateQuery(query, sourcePath).map(async (file) => {
			const data = this.app.metadataCache.getFileCache(file);
			if (!data) throw new Error("Data for " + file.path + " not found");
			const entries = await Promise.all(columns.map(async (column) => {
				const key = columnKey(column);
				const value = await this.getRowValue(file, data, key)
				return [key, value] as const;
			}));
			return Object.fromEntries([...entries, ['path', file.path]]);
		}));

		return {
			rows,
			columns,
		}
	}

	private async getRowValue(file: TFile, data: CachedMetadata, key: string): Promise<unknown> {
		// check for blocks
		if (!key.startsWith('#')) {
			return file[key as keyof TFile] ?? data.frontmatter?.[key];
		}
		const subpathResult = resolveSubpath(data, key);
		if (!subpathResult) return;
		const contents = await this.app.vault.cachedRead(file);
		const start = subpathResult.start.offset;
		const end = subpathResult.end ? subpathResult.end.offset : undefined
		const block = contents.slice(start, end);
		return block;
	}

	private evaluateQuery(query: Query, sourcePath: string): Array<TFile> {
		if ('linksto' in query) {
			if (typeof query.linksto === 'string') {
				const target = query.linksto.replace(/^\[\[|\]\]$/g, '');
				const destFile = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
				if (!destFile) return [];
				const backlinks = this.reverseCache.get(LINK_KEY)?.get(destFile.path) as Array<TFile> | undefined;
				return backlinks ?? [];
			}
		}

		return [];
	}


	private async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.addPropertyCommands(this.settings.commandProperties);
	}

	async updatePropertyCommands(properties: string[]) {
		const currentProperties = this.settings.commandProperties;
		const removedProperties = currentProperties.filter((property) => !properties.includes(property));
		const addedProperties = properties.filter((property) => !currentProperties.includes(property));

		removedProperties.forEach((property) => this.removeCommand(`navigate-to-${property}`));
		this.addPropertyCommands(addedProperties);

		this.settings.commandProperties = properties;
		await this.saveData(this.settings);
	}

	async updateTemplate(key: Periodicity, value: string | null) {
		this.settings.templatePaths[key] = value;
		await this.saveData(this.settings);
	}

	addPropertyCommands(properties: string[]) {
		new Set(properties).forEach((property) => this.addCommand({
			id: `open-property-${property}`,
			name: `Open ${property}`,
			editorCallback: (editor, ctx) => ctx.file && this.openPropertyLink(ctx.file, property),
		}));
	}

	openPropertyLink(file: TFile, key?: string) {
		const frontmatterLinks = this.app.metadataCache.getFileCache(file)?.frontmatterLinks;
		const links = key ? frontmatterLinks?.filter((link) => linkMatch(key, link.key)) : frontmatterLinks;
		const available = links && links.length > 0;

		if (available) {
			new LinkSelectionModal(this.app, file.path, links, !key).open();
		} else if (key) {
			new Notice(`No "${key}" link found`);
		} else {
			new Notice('No links found');
		}
	}
}

class LinkSelectionModal extends FuzzySuggestModal<FrontmatterLinkCache> {
	constructor(app: App, private sourcePath: string, private links: Array<FrontmatterLinkCache>, private showKey: boolean) {
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

	onChooseItem(item: FrontmatterLinkCache, evt: MouseEvent | KeyboardEvent): void {
		this.app.workspace.openLinkText(item.link, this.sourcePath)
	}
}

class PeriodicPicker extends SuggestModal<string> {
	private initialDate: Date | undefined;

	constructor(private readonly plugin: NavigateToPropertyLink) {
		super(plugin.app);

		const path = this.app.workspace.getActiveFile()?.path;
		if (path) {
			this.initialDate = Object.values(Periodicity)
				.map((p) => this.getTemplate(p) ? moment(path, this.getTemplate(p) + '[.md]', true) : null)
				.find(p => p?.isValid())
				?.toDate();
		}
	}

	getTemplate(p: Periodicity) {
		return this.plugin.settings.templatePaths[p];
	}

	getSuggestions(query: string): string[] {
		const date = chrono.parseDate(query, this.initialDate);
		if (!date) return [];
		return Object.values(Periodicity).map((p) => this.getPeriodic(date, p)!).filter((p) => p)
	}

	getPeriodic(date: moment.MomentInput, p: Periodicity): string | null {
		const template = this.getTemplate(p);
		if (!template) return null;
		return moment(date).format(template);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.plugin.app.workspace.openLinkText(item, '');
	}
}

class PeriodicPickerSettingsTab extends PluginSettingTab {
	constructor(private readonly plugin: NavigateToPropertyLink) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Properties')
			.setDesc('Create a command for each property in the list. Each property should be entered on its own line.')
			.addTextArea((text) => {
				text
					.setPlaceholder(['up', 'down', 'next', 'prev'].join('\n'))
					.setValue(this.plugin.settings.commandProperties.join('\n'))
					.onChange(async (value) => {
						const list = value.split('\n').filter((item) => item.length > 0);
						await this.plugin.updatePropertyCommands(list);
					})
				text.inputEl.rows = 8;
			});

		Object.values(Periodicity).forEach((p) => {
			const setting = new Setting(containerEl);
			setting
				.setName(`${capitalize(p)} note path`)
				.setDesc(`Path to ${p} note: `)
				.addMomentFormat((fmt) => {
					fmt
						.setPlaceholder(placeholders[p])
						.setSampleEl(setting.descEl.createEl('strong'))
						.onChange(async (value) => {
							await this.plugin.updateTemplate(p, value);
						});
					const initial = this.plugin.settings.templatePaths[p];
					if (initial) fmt.setValue(initial)
				})
		});
	}
}


class TableComponent extends MarkdownRenderChild {
	counter: ReturnType<typeof Counter>;

	constructor(private rows: Array<Row>, private columns: Array<Column>, containerEl: HTMLElement) {
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

function linkMatch(key: string, link: string) {
	if (link === key) return true;
	const i = link.lastIndexOf('.')
	return i > -1 && link.slice(0, i) === key && /^\d+$/.test(link.slice(i + 1));
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
