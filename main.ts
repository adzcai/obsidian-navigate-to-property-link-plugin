import * as chrono from 'chrono-node'
import { moment, App, FrontmatterLinkCache, FuzzySuggestModal, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal } from 'obsidian';

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

export default class NavigateToPropertyLink extends Plugin {
	settings: ObsidianUtilitiesSettings;

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
	}

	async loadSettings() {
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

function linkMatch(key: string, link: string) {
	if (link === key) return true;
	const i = link.lastIndexOf('.')
	return i > -1 && link.slice(0, i) === key && /^\d+$/.test(link.slice(i + 1));
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}