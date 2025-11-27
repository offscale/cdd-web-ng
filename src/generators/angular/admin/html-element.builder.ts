/**
 * A simple, fluent, string-based builder for creating HTML-like template fragments.
 * This completely avoids using a DOM parser (like jsdom), which is too strict for
 * Angular's template syntax (e.g., @if, [prop], (event)).
 */
export class HtmlElementBuilder {
    private tagName: string;
    private attributes: Map<string, string> = new Map();
    private children: (HtmlElementBuilder | string)[] = [];
    private innerHtml: string | null = null;
    private textContent: string | null = null;
    private isSelfClosing: boolean = false;

    private constructor(tagName: string) {
        this.tagName = tagName;
    }

    public static create(tagName: string): HtmlElementBuilder {
        return new HtmlElementBuilder(tagName);
    }

    public selfClosing(): this {
        this.isSelfClosing = true;
        return this;
    }

    public setAttribute(name: string, value: string): this {
        this.attributes.set(name, value);
        return this;
    }

    public addClass(className: string): this {
        const existingClass = this.attributes.get('class');
        this.attributes.set('class', existingClass ? `${existingClass} ${className}` : className);
        return this;
    }

    public appendChild(child: HtmlElementBuilder | string): this {
        this.children.push(child);
        return this;
    }

    public setTextContent(text: string): this {
        this.textContent = text;
        return this;
    }

    public setInnerHtml(html: string): this {
        this.innerHtml = html;
        return this;
    }

    public render(indentationLevel = 0): string {
        const indent = '  '.repeat(indentationLevel);
        const attrs = Array.from(this.attributes.entries())
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        const openingTagFirstPart = `${indent}<${this.tagName}${attrs ? ' ' + attrs : ''}`;

        if (this.isSelfClosing) {
            return `${openingTagFirstPart} />`;
        }

        const openingTag = `${openingTagFirstPart}>`;

        let content = '';
        if (this.innerHtml) {
            content = `\n${this.innerHtml
                .split('\n')
                .map(line => `${'  '.repeat(indentationLevel + 1)}${line.trim()}`)
                .join('\n')}\n${indent}`;
        } else if (this.textContent) {
            content = this.textContent;
        } else if (this.children.length > 0) {
            content = `\n${this.children
                .map(child =>
                    child instanceof HtmlElementBuilder
                        ? child.render(indentationLevel + 1)
                        : `${'  '.repeat(indentationLevel + 1)}${child}`,
                )
                .join('\n')}\n${indent}`;
        }

        return `${openingTag}${content}</${this.tagName}>`;
    }
}
