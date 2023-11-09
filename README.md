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
\`\`\`
|# this |# is |# header |#
|{x2} 1 | 2   |      3>:|
|#{2}        5          |
| 7     |:<{2x2}8       |
| 10    |
|{3} the numbers are in tbody! |
|{3} this is in tfoot   |<-
^this is the caption for the table
~~~
this is a tilde block. you can define variables here!
%like% = *^Lua^* :crescent_moon:
%dislike% = Java :coffee:
%smartest_programmer% = Terry A. Davis
~~~
I prefer %like%, and I dislike %dislike%.
The smartest programmer is %smartest_programmer%.
The math function, @sin@, can be approximated with the taylor series @underover(∑, n = 0, ∞) pow((-1), n)frac(pow(x,2n + 1),(2n + 1)!)@`;

element.replaceChildren(...render(to_tree(markdown)));
```

The above code will change the `innerHTML` of `element` to:

```html
<h1>Heading</h1>
<p>
	This is some <strong>bold</strong> and <em>italic</em> text. <br>
	This is some <mark>mark</mark> and <del>strikethrough</del> text. <br>
	This is some <ruby>振<rt>ふ</rt></ruby>り<ruby>仮<rt>が</rt>名<rt>な</rt></ruby> text. <br>
	This is some <sup>sup</sup> and <sub>sub</sub> text. 
</p>

<blockquote>This is a blockquote.</blockquote>

<ul>
	<li>List item 1</li>
	<li>List item 2</li>
</ul>

<pre><code>// Code block
((s) =&gt;
	console.log(s)
)("Hello World!")</code></pre>
<table>
	<caption>this is the caption for the table</caption>
	<thead>
		<tr>
			<th align="center">this</th>
			<th align="center">is</th>
			<th align="center">header</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td align="center" rowspan="2" colspan="1">1</td>
			<td align="center">2</td>
			<td align="right">3</td>
		</tr>
		<tr>
			<th align="center" rowspan="1" colspan="2">5</th>
		</tr>
		<tr>
			<td align="center">7</td>
			<td align="left" rowspan="2" colspan="2">8</td>
		</tr>
		<tr>
			<td align="center">10</td>
		</tr>
		<tr>
			<td align="center" rowspan="1" colspan="3">the numbers are in tbody!</td>
		</tr>
	</tbody>
	<tfoot>
		<tr>
			<td align="center" rowspan="1" colspan="3">this is in tfoot</td>
		</tr>
	</tfoot>
</table>
<p>
	I prefer <em><strong>Lua</strong></em> 🌙, and I dislike Java ☕. <br>
	The smartest programmer is Terry A. Davis. <br>
	The math function,<math><mi>sin</mi></math>, can be approximated with the taylor series 
	<math>
		<mrow>
			<munderover>
				<mo>∑</mo>
				<mrow>
					<mi>n</mi>
					<mo>=</mo>
					<mn>0</mn>
				</mrow>
				<mo>∞</mo>
			</munderover>
			<msup>
				<mrow>
					<mo>(</mo>
					<mo>-</mo>
					<mn>1</mn>
					<mo>)</mo>
				</mrow>
				<mi>n</mi>
			</msup>
			<mfrac>
				<msup>
					<mi>x</mi>
					<mrow>
						<mn>2</mn>
						<mi>n</mi>
						<mo>+</mo>
						<mn>1</mn>
					</mrow>
				</msup>
				<mrow>
					<mo>(</mo>
					<mn>2</mn>
					<mi>n</mi>
					<mo>+</mo>
					<mn>1</mn>
					<mo>)</mo>
					<mo>!</mo>
				</mrow>
			</mfrac>
		</mrow>
	</math>
</p>
```

## License

mdex.js is released under the [MIT License](LICENSE).
