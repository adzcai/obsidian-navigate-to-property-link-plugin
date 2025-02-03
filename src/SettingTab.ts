import { Periodicity } from 'src/utils';
import { capitalize } from 'src/utils';
import { PluginSettingTab, Setting } from 'obsidian';
import type NavigateToPropertyLink from './main';

export class SettingTab extends PluginSettingTab {
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
					});
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
					if (initial) fmt.setValue(initial);
				});
		});
	}
}
export const placeholders: {
	[key in Periodicity]: string;
} = {
	day: 'YYYY-MM-DD',
	week: 'gggg [W]ww',
	month: 'YYYY-MM MMMM',
	quarter: 'YYYY [Q]Q',
	year: 'YYYY',
};

