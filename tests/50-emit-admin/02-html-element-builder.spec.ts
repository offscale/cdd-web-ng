import { describe, expect, it } from 'vitest';
import { HtmlElementBuilder as _ } from '@src/generators/angular/admin/html-element.builder.js';

describe('Admin: HtmlElementBuilder', () => {
    it('should create a simple element with text content', () => {
        const p = _.create('p').setTextContent('Hello').render();
        expect(p).toBe('<p>Hello</p>');
    });

    it('should create an element with attributes and a class', () => {
        const div = _.create('div').setAttribute('id', 'main').addClass('container').render();
        expect(div).toBe('<div id="main" class="container"></div>');
    });

    it('should append additional classes', () => {
        const div = _.create('div').addClass('one').addClass('two').render();
        expect(div).toBe('<div class="one two"></div>');
    });

    it('should create a self-closing tag', () => {
        const input = _.create('input').setAttribute('type', 'text').selfClosing().render();
        expect(input).toBe('<input type="text" />');
    });

    it('should nest children correctly with proper indentation', () => {
        const list = _.create('ul')
            .appendChild(_.create('li').setTextContent('One'))
            .appendChild(_.create('li').setTextContent('Two'))
            .render();

        const expected = `<ul>
  <li>One</li>
  <li>Two</li>
</ul>`;
        expect(list).toBe(expected);
    });

    it('should render inner HTML correctly with indentation', () => {
        const template = `@if (true) {
  <span>Content</span>
}`;
        const container = _.create('div').setInnerHtml(template).render();
        const expected = `<div>
  @if (true) {
  <span>Content</span>
  }
</div>`;
        expect(container).toBe(expected);
    });

    // Covers the branch where `render` is called on a non-builder child
    it('should render string children correctly', () => {
        const div = _.create('div').appendChild('Just a string').render();
        const expected = `<div>
  Just a string
</div>`;
        expect(div).toBe(expected);
    });
});
