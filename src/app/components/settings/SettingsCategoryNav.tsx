export type SettingsCategory = "theme" | "canvas" | "layout" | "content";

const categories: Array<{ id: SettingsCategory; label: string }> = [
  { id: "theme", label: "主题" },
  { id: "canvas", label: "画布" },
  { id: "layout", label: "排版" },
  { id: "content", label: "内容" },
];

export function SettingsCategoryNav({
  activeCategory,
  onSelect,
}: {
  activeCategory: SettingsCategory;
  onSelect: (category: SettingsCategory) => void;
}) {
  return (
    <nav class="settings-category-nav" aria-label="排版分类">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          class={activeCategory === category.id ? "selected" : ""}
          aria-pressed={activeCategory === category.id}
          onClick={() => onSelect(category.id)}
        >
          <span>{category.label}</span>
        </button>
      ))}
    </nav>
  );
}
