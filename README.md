# mdex.js - Markdown Parser

**mdex.js** is a lightweight JavaScript module for parsing Markdown and converting it into HTML, loosely adhering to the [Markdown Guide](https://www.markdownguide.org/) specifications.

## Features

mdex.js supports the following Markdown syntax features:

- [Basic Syntax](https://www.markdownguide.org/basic-syntax/):
  - Headings (excluding alternate syntax, `---`)
  - Bold (using `^` instead of `**`)
  - Italic
  - Blockquote (Nested blockquote not supported)
  - Lists (ordered and unordered)
  - Code blocks
  - Horizontal Rule
  - Link
  - Images

- [Extended Syntax](https://www.markdownguide.org/extended-syntax/):
  - Strikethrough
  - Tables
  - Footnotes
  - Heading IDs
  - Definition Lists
  - Task Lists (support not confirmed, very specific use case)
  - Emoji (will not support)
  - Highlight
  - Subscript & Superscript
  - Automatic URL Linking (escaped using `\` instead of backtick)
  - Fenced Code Blocks

- Extended-Extended Features:
  - Underline (using `_`)
  - Spoiler (using `|`)
  - Furigana (using curly braces `{}` with readings in parentheses) e.g., `{明日(あす)}` or `{明(あ)日(す)}`.
  - Math formula (coming soon)
  - Variables (defined in tilde blocks using `%variable_name% = value`)

## Installation

mdex.js is a single-file module that can be easily integrated into your project. Just import it.  

```html
<script src="mdex.js"></script>
```

or

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

const tree = to_tree(markdown);
console.log(stringify(tree));
element.replaceChildren(...render(tree));
```

The above code will output the following HTML:

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