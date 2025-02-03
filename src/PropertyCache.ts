import { LINK_KEY } from 'src/utils';
import type { MetadataCache, TFile, Reference } from 'obsidian';
import { flatEntries } from 'src/utils';

export class PropertyCache {
	reverseCache = new Map<string, Map<string, unknown>>();
	activeKeys = new Map<string, Set<string>>();

	constructor(private metadataCache: MetadataCache) { }

	public resetFileCache(file: TFile) {
		const activeKeys = this.activeKeys.get(file.path);
		if (activeKeys) {
			activeKeys.forEach((property) => this.reverseCache.get(property)?.delete(file.path));
			activeKeys.clear();
		}
	}

	public cacheFileMetadata(file: TFile) {
		const metadata = this.metadataCache.getFileCache(file);

		if (typeof metadata?.frontmatter === 'object') {
			flatEntries(metadata.frontmatter).forEach(([key, value]) => {
				this.cacheProperty(key, file.path, value);
			});
		}

		metadata?.links?.forEach((link) => this.cacheLink(link, file));
		metadata?.frontmatterLinks?.forEach((link) => {
			this.cacheLink(link, file);
			this.cacheProperty(`${LINK_KEY}.${link.key}`, file.path, link);
		});
	}

	private cacheLink(link: Reference, source: TFile) {
		const target = this.metadataCache.getFirstLinkpathDest(link.link, source.path);
		if (target) this.cacheProperty(LINK_KEY, target.path, source, true);
	}

	private cacheProperty(property: string, path: string, value: unknown, multiple = false) {
		const keyCache = this.reverseCache.get(property);
		if (keyCache) {
			keyCache.set(path, multiple ? [...keyCache.get(path) as Array<unknown> ?? [], value] : value);
		} else {
			this.reverseCache.set(property, new Map([[path, multiple ? [value] : value]]));
		}

		const activeKeys = this.activeKeys.get(path);
		if (activeKeys) activeKeys.add(property);
		else this.activeKeys.set(path, new Set([property]));
	}

	public clear() {
		this.reverseCache.clear();
		this.activeKeys.clear();
	}
}
