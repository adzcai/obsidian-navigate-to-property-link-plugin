import { App, FrontmatterLinkCache, FuzzySuggestModal, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface ObsidianUtilitiesSettings {
	commandProperties: string[];
}

const DEFAULT_SETTINGS: ObsidianUtilitiesSettings = {
	commandProperties: [],
}

export default class NavigateToPropertyLink extends Plugin {
	settings: ObsidianUtilitiesSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'navigate-property-link',
			name: 'Navigate to property link',
			checkCallback: (checking) => this.navigateToPropertyLink(checking),
		});

		this.addSettingTab(new SampleSettingTab(this));
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

	addPropertyCommands(properties: string[]) {
		new Set(properties).forEach((property) => this.addCommand({
			id: `navigate-to-${property}`,
			name: `Navigate to ${property}`,
			checkCallback: (checking) => this.navigateToPropertyLink(checking, property),
		}));
	}

	navigateToPropertyLink(checking: boolean, key?: string) {
		const activeFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
		if (!activeFile) {
			if (!checking) new Notice('No active file');
			return false;
		}

		const frontmatterLinks = this.app.metadataCache.getFileCache(activeFile)?.frontmatterLinks;
		const links = key ? frontmatterLinks?.filter((link) => linkMatch(key, link.key)) : frontmatterLinks;

		const available = links && links.length > 0;
		if (checking) {
			return !!available;
		}

		if (available) {
			new LinkSelectionModal(this.app, activeFile.path, links, !key).open();
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

class SampleSettingTab extends PluginSettingTab {
	constructor(private plugin: NavigateToPropertyLink) {
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
	}
}

function linkMatch(key: string, link: string) {
	if (link === key) return true;
	const i = link.lastIndexOf('.')
	return i > -1 && link.slice(0, i) === key && /^\d+$/.test(link.slice(i + 1));
}
