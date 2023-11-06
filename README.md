# mdex.js - Markdown Parser

**mdex.js** is a lightweight and <ruby>*kind of* performant<rt>slightly faster than [marked.js](https://github.com/markedjs/marked)</rt></ruby> JavaScript module for parsing Markdown and converting it into HTML, *loosely* adhering to the specifications mentioned [here](https://www.markdownguide.org/).

## Features

mdex.js supports the following Markdown syntax features:

- [Basic Syntax](https://www.markdownguide.org/basic-syntax/):
  - Headings (excluding alternate syntax, `---`)
  - **Bold** (using `^` instead of `**`)
  - *Italic*
  - Blockquote (Nested blockquote not supported)
  - Lists (ordered and unordered)
  - `Code`
  - Horizontal Rule
  - Link
  - Images

- [Extended Syntax](https://www.markdownguide.org/extended-syntax/):
  - ~~Strikethrough~~
  - Tables
  - <sup>[Footnotes](https://github.com/Feedekaiser/mdex/wiki/Extended-Features#footnotes)</sup>
  - Heading IDs
  - Definition Lists
  - Task Lists (not yet. might not support)
  - Emoji (not yet. might not support)
  - <mark>Highlight</mark>
  - <sub>Subscript</sub> & <sup>Superscript</sup>
  - Automatic URL Linking (escaped using `\` instead of backtick)
  - Fenced Code Blocks

- Extended-Extended Features:
  - <ins>Underline</ins> (using `_`)
  - Spoiler (using `|`)
  - Furigana <ruby>振<rp>(</rp><rt>ふ</rt><rp>)</rp></ruby>り<ruby>仮<rp>(</rp><rt>が</rt><rp>)</rp>名<rp>(</rp><rt>な</rt><rp>)</rp></ruby> (using curly braces `{}` with readings in parentheses) e.g., `{明日(あす)}` or `{明(あ)日(す)}`.
  - Math formula
  - Variables (defined in tilde blocks using `%variable_name% = value`)

Check out the [wiki](https://github.com/Feedekaiser/mdex/wiki/Basics) for more details.
## Installation

mdex.js is a single-file module that can be easily integrated into your project. Just import it.  

```javascript
import { to_tree, render } from './mdex.js';
```

## Usage
```javascript
const markdown = `# Heading
This is some ^bold^ and *italic* text.
This is some &mark& and ~strikethrough~ text.
This is some {振(ふ)}り{仮(が)名(な)} text.
This is some =sup= and -sub- text.
> This is a blockquote.
- List item 1
- List item 2
\`\`\`
// Code block
((s) =>
	console.log(s)
)("Hello World!")
\`\`\``;

element.replaceChildren(...render(to_tree(markdown)));
```

The above code will change the `innerHTML` of `element` to:

```html
<h1>Heading</h1>
This is some <strong>bold</strong> and <em>italic</em> text. <br>
This is some <mark>mark</mark> and <del>strikethrough</del> text. <br>
This is some <ruby>振 <rp>(</rp><rt>ふ</rt><rp>)</rp></ruby>り <ruby>仮 <rp>(</rp><rt>が</rt><rp>)</rp>名 <rp>(</rp><rt>な</rt><rp>)</rp></ruby> text. <br>
This is some <sup>sup</sup> and <sub>sub</sub> text.<br>
<blockquote>This is a blockquote. <br></blockquote>
<ul>
	<li>List item 1</li>
	<li>List item 2</li>
</ul>
<pre><code>// Code block
((s) =&gt;
	console.log(s)
)("Hello World!")</code></pre>
```

## License

mdex.js is released under the [MIT License](LICENSE).
