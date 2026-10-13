import { App, Modal, setIcon } from "obsidian";
import { t } from "./i18n";

export interface TagItem {
  tag: string;
  count: number;
}

/** Searchable tag visibility toggles; stays open across changes. */
export class TagPickerModal extends Modal {
  private items: TagItem[];
  private excluded: Set<string>;
  private onToggle: (tag: string) => void;
  private listEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private query = "";

  constructor(
    app: App,
    items: TagItem[],
    excluded: Set<string>,
    onToggle: (tag: string) => void,
  ) {
    super(app);
    this.items = items;
    this.excluded = excluded;
    this.onToggle = onToggle;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(t("tag_sheet_title"));
    contentEl.addClass("jotdrop-tagpicker");

    this.inputEl = contentEl.createEl("input", {
      cls: "jotdrop-tagpicker-search",
      attr: { type: "search", placeholder: t("tag_sheet_search") },
    });
    this.inputEl.addEventListener("input", () => {
      this.query = this.inputEl.value.toLowerCase().trim();
      this.renderList();
    });

    this.listEl = contentEl.createDiv({ cls: "jotdrop-tagpicker-list" });
    this.renderList();
    // Focus the search field so the user can filter immediately.
    window.setTimeout(() => this.inputEl.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderList(): void {
    this.listEl.empty();
    const filtered = this.query
      ? this.items.filter((i) => i.tag.toLowerCase().includes(this.query))
      : this.items;

    if (filtered.length === 0) {
      this.listEl.createDiv({
        cls: "jotdrop-tagpicker-empty",
        text: t("tag_sheet_empty"),
      });
      return;
    }

    for (const item of filtered) {
      const row = this.listEl.createEl("button", {
        cls: "jotdrop-tagpicker-row",
        attr: { type: "button", "data-tag": item.tag, "aria-pressed": String(!this.excluded.has(item.tag)) },
      });
      const isExcluded = this.excluded.has(item.tag);
      if (isExcluded) row.addClass("is-excluded");

      const check = row.createSpan({ cls: "jotdrop-tagpicker-icon" });
      setIcon(check, isExcluded ? "eye-off" : "eye");
      row.createSpan({ cls: "jotdrop-tagpicker-name", text: `#${item.tag}` });
      row.createSpan({
        cls: "jotdrop-tagpicker-count",
        text: String(item.count),
      });

      row.addEventListener("click", () => {
        this.onToggle(item.tag);
        this.renderList();
        Array.from(this.listEl.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => button.dataset.tag === item.tag)?.focus();
      });
    }
  }
}
