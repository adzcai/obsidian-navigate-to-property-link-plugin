import * as chrono from 'chrono-node';
import { Periodicity } from 'src/utils';
import { SuggestModal, moment } from 'obsidian';
import type NavigateToPropertyLink from './main';

export class PeriodicPicker extends SuggestModal<string> {
	private initialDate: Date;

	constructor(private readonly plugin: NavigateToPropertyLink) {
		super(plugin.app);

		const path = this.app.workspace.getActiveFile()?.path;
		if (path) {
			const dateFromFilename = Object.values(Periodicity)
				.map((p) => this.getTemplate(p) ? moment(path, this.getTemplate(p) + '[.md]', true) : null)
				.find(p => p?.isValid());
			this.initialDate = dateFromFilename ? dateFromFilename.toDate() : new Date();
		}
	}

	getTemplate(p: Periodicity) {
		return this.plugin.settings.templatePaths[p];
	}

	getSuggestions(query: string): string[] {
		const date = chrono.parseDate(query, this.initialDate);
		if (!date) return [];
		return Object.values(Periodicity).map((p) => this.getPeriodic(date, p)!).filter((p) => p);
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
