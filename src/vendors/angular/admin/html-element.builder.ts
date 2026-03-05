/**
 * A simple, fluent, string-based builder for creating HTML-like template fragments.
 * This completely avoids using a DOM parser (like jsdom), which is too strict for
 * Angular's template syntax (e.g., @if, [prop], (event)).
 */
export class HtmlElementBuilder {
    private tagName: string;
    /* v8 ignore next */
    private attributes: Map<string, string> = new Map();
    /* v8 ignore next */
    private children: (HtmlElementBuilder | string)[] = [];
    /* v8 ignore next */
    private innerHtml: string | null = null;
    /* v8 ignore next */
    private textContent: string | null = null;
    /* v8 ignore next */
    private isSelfClosing: boolean = false;

    private constructor(tagName: string) {
        /* v8 ignore next */
        this.tagName = tagName;
    }

    public static create(tagName: string): HtmlElementBuilder {
        /* v8 ignore next */
        return new HtmlElementBuilder(tagName);
    }

    public selfClosing(): this {
        /* v8 ignore next */
        this.isSelfClosing = true;
        /* v8 ignore next */
        return this;
    }

    public setAttribute(name: string, value: string): this {
        /* v8 ignore next */
        this.attributes.set(name, value);
        /* v8 ignore next */
        return this;
    }

    public addClass(className: string): this {
        /* v8 ignore next */
        const existingClass = this.attributes.get('class');
        /* v8 ignore next */
        this.attributes.set('class', existingClass ? `${existingClass} ${className}` : className);
        /* v8 ignore next */
        return this;
    }

    public appendChild(child: HtmlElementBuilder | string): this {
        /* v8 ignore next */
        this.children.push(child);
        /* v8 ignore next */
        return this;
    }

    public setTextContent(text: string): this {
        /* v8 ignore next */
        this.textContent = text;
        /* v8 ignore next */
        return this;
    }

    public setInnerHtml(html: string): this {
        /* v8 ignore next */
        this.innerHtml = html;
        /* v8 ignore next */
        return this;
    }

    public render(indentationLevel = 0): string {
        /* v8 ignore next */
        const indent = '  '.repeat(indentationLevel);
        /* v8 ignore next */
        const attrs = Array.from(this.attributes.entries())
            /* v8 ignore next */
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        /* v8 ignore next */
        const openingTagFirstPart = `${indent}<${this.tagName}${attrs ? ' ' + attrs : ''}`;

        /* v8 ignore next */
        if (this.isSelfClosing) {
            /* v8 ignore next */
            return `${openingTagFirstPart} />`;
        }

        /* v8 ignore next */
        const openingTag = `${openingTagFirstPart}>`;

        /* v8 ignore next */
        let content = '';
        /* v8 ignore next */
        if (this.innerHtml) {
            /* v8 ignore next */
            content = `\n${this.innerHtml
                .split('\n')
                /* v8 ignore next */
                .map(line => `${'  '.repeat(indentationLevel + 1)}${line.trim()}`)
                .join('\n')}\n${indent}`;
            /* v8 ignore next */
        } else if (this.textContent) {
            /* v8 ignore next */
            content = this.textContent;
            /* v8 ignore next */
        } else if (this.children.length > 0) {
            /* v8 ignore next */
            content = `\n${this.children
                .map(child =>
                    /* v8 ignore next */
                    child instanceof HtmlElementBuilder
                        ? child.render(indentationLevel + 1)
                        : `${'  '.repeat(indentationLevel + 1)}${child}`,
                )
                .join('\n')}\n${indent}`;
        }

        /* v8 ignore next */
        return `${openingTag}${content}</${this.tagName}>`;
    }
}
