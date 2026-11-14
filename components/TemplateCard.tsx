import Icon from "./Icon";
import type { AppTemplate } from "@/lib/templates";

export default function TemplateCard({
  template,
  onUse,
}: {
  template: AppTemplate;
  onUse: () => void;
}) {
  return (
    <button type="button" className="template-tile" onClick={onUse}>
      <span className={`template-art tone-${template.tone}`}>
        <span className="template-browser" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="template-glyph" aria-hidden="true">
          {template.glyph}
        </span>
        <span className="template-skeleton" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="template-copy">
        <span className="template-meta">
          <span>{template.category}</span>
          <span className="template-category-arrow">
            <Icon name="arrowUpRight" size={13} />
          </span>
        </span>
        <strong>{template.title}</strong>
        <span className="template-blurb">{template.blurb}</span>
      </span>
    </button>
  );
}
