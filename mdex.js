/*
 * mdex.js is a markdown parser.
 * https://www.markdownguide.org/basic-syntax/ ✅❗
 * Headings ✅ will not support alternate syntax.
 * Bold ✅ use ^ instead of **
 * Italic ✅
 * Blockquote ✅
 * Nested blockquote ❌ rare + is ambiguous by nature without adding extra controls.
 * (Nested) List ✅
 * Code ✅
 * Horizontal Rule ✅
 * Link ✅
 * Images ✅
 * 
 * https://www.markdownguide.org/extended-syntax/ 🛠️🚧❗
 * Strikethrough ✅
 * Tables ❎
 * Footnotes ✅
 * Heading IDs ✅
 * Definition Lists ❎
 * Task Lists ❓
 * Emoji ❌
 * Highlight ✅
 * Subscript & Superscript ✅
 * Automatic URL Linking ✅ escape it using backslash instead of surrounding it with backticks!
 * Fenced Code Blocks ❓
 * 
 * extended-extended features: 🛠️🚧
 * Underline ✅ use _
 * Spoiler ✅ use |
 * Furigana (<ruby>) ✅ use {明日(あす)} or {明(あ)日(す)}. {振(ふ)}り{仮(が)名(な)} is amazing! 💯
 * Math formula ❎
 */

import { stringify } from "./stringify.js";
const tree_node = (type, value) => 
{
	return { type : type, value: value, children : Array() };
}

const NOTE_ID_PREFIX = "_note:";
const CONTAINER_NODE_TYPE = "_cont";
const INDENTED_LINE = /^(?:(?:    )|\t)(.+)/;
const RUBY_PAIR    = /(.+?)(?<!\\)(?:\\\\)*\((.+?)\)/g;

const LINE_MATCH_STRINGS = [
	["hr",         /^(?:-{3,}|_{3,}|\*{3,})$/],
	["ol",         /^(\d+)\.\s(.+)/],
	["ul",         /^[-\*+]\s(.+)/],
	["h",          /^(#{1,4})\s(.+?)(?:\s#(.*))?$/],
	["blockquote", /^>\s(.+)/],
	["note_desc",  /^\[\^(.+?)\s*(?:"(.+)")?\]:\s(.+)/],
	["codeblock",  /^```$/],
];


const CHAR_TO_REGEX_MAP = {};
for (const [type, regex] of [
	["img",     /!(?:\[(.+)\])?\((.+?)\s*(?:"(.+)")?\)(?:{(?:(\d+)?(?:x(\d+))?)?(?:\s*"(.+)")?})?/],
	["a",       /\[(.+)\]\((.+?)\s*(?:"(.+)")?\)/],
	["del",     /~(.+?)~/, true],
	["u",       /_(.+?)_/, true],
	["spoiler", /\|(.+?)\|/, true],
	["strong",  /\^(.+?)\^/, true],
	["em",      /\*(.+?)\*/, true],
	["sup",     /=(.+?)=/, true],
	["sub",     /-(.+?)-/, true],
	["mark",    /&(.+?)&/, true],
	["ruby",    /{(.+?)}/, true],
	["note",    /\[\^(.+?)\s*(?:"(.+)")?\]/],
	["link",    /https?:\/\/\S+\.\S\S+/],
	["code",    /`(.+?)`/],
])
{
	const first_char = regex.source[0 + (regex.source[0] == '\\')];
	(CHAR_TO_REGEX_MAP[first_char] || (CHAR_TO_REGEX_MAP[first_char] = [])).push([type, regex.source])
}

/**
 * @description checks whether the `idx`th character in `str` was escaped by `\`.
 * @param  {string} str
 * @param  {number} idx
 * @return {boolean}
 */
const is_escaped = (str, idx) =>
{
	let escaped = false;

	while (str[--idx] == '\\')
		escaped = !escaped;

	return escaped;
};

/**
 * @param {string} str 
 * @returns {boolean}
 */
const is_last_char_escaped = (str) => is_escaped(str, str.length - 1);	

/**
 * @param {string} line 
 * @returns {string}
 */
const remove_escapes = (line) =>
{
	let i;
	while ((i = line.indexOf('\\', i)) > 0)
	{
		let backslash_count = 1;

		while (line[++i] == '\\')
			++backslash_count;

		const backslash_remained = Math.floor(backslash_count * 0.5);

		line = 
			line.substring(0, i - backslash_count) +
			"\\".repeat(backslash_remained) +
			line.substring(i);

		i -= backslash_remained;
	}

	return line;
};

/**
 * @description 
 * optimize the node from `[a, b, [c, d, [e, f, g]]]` to `[a, b, c, d, e, f, g]`
 */
const optimize_node = (master_node) => 
{
	let master_children = master_node.children;
	let node = master_children.pop();

	while (node && node.type == CONTAINER_NODE_TYPE && !node.value)
	{
		for (let i = 0; i < node.children.length - 1; ++i)
			master_children.push(node.children[i]);

		node = node.children.pop();
	}
	node && master_children.push(node);
	return master_node;
};

const parse_optimize_node = (line, node) => optimize_node(inner_parse_node(line, node));

/**
 * @description parse single line. only match controls. 
 * @param {string} line the line to be changed into a tree.
 * @return {Array} 
 */
const inner_parse_node = (line, node) => 
{
	const line_length = line.length;
	let is_pure_text = true;
	let regex_match_result;

	outer_loop:
	for (let i = 0; i < line_length; ++i)
	{
		const c = line[i];
		const regex_that_start_with_c = CHAR_TO_REGEX_MAP[c];

		if (!regex_that_start_with_c || is_escaped(line, i))
			continue;

		for (const [type, regex, check_lastchar_escaped] of regex_that_start_with_c)
			if ((regex_match_result = line.substring(i).match(regex)) && 
				!(check_lastchar_escaped && is_last_char_escaped(regex_match_result[0])))
			{
				is_pure_text = false;

				let children = node.children;

				i > 0 && children.push(inner_parse_node(line.substring(0, i), tree_node("text")));

				{
					const text_node = tree_node(type); // please suggest me a better variable name :D

					switch (type)
					{
					case "ruby":
						const pairs = [];

						for (const pair of regex_match_result[1].matchAll(RUBY_PAIR))
						{
							const base_node = parse_optimize_node(pair[1], tree_node("text"));
							base_node.rt = parse_optimize_node(pair[2], tree_node("text"));
							pairs.push(base_node);
						}
						if (pairs.length == 0)
						{
							text_node.type = "text";
							text_node.value = regex_match_result[1];
							break;
						}
						text_node.pairs = pairs;
						break;
					case "note":
						text_node.id = regex_match_result[1];
						if (regex_match_result[2])
						{
							parse_optimize_node(regex_match_result[2], text_node);
							break;
						}
					case "code": text_node.value = regex_match_result[1]; break; // code cannot nest other controls.
					case "link": text_node.type = "a"; text_node.link = regex_match_result[0]; text_node.value = regex_match_result[0]; break;
					case "img":
						text_node.alt = regex_match_result[1];
						text_node.width = regex_match_result[4];
						text_node.height = regex_match_result[5];
						if (regex_match_result[6]) 
							text_node.figcaption = parse_optimize_node(regex_match_result[6], tree_node("figcaption"));
					case "a": 
						text_node.link = regex_match_result[2];
						text_node.hover = regex_match_result[3];
						if (regex_that_start_with_c == "img") break;
					default: inner_parse_node(regex_match_result[1], text_node);
					}
					children.push(text_node);
				}

				let index_match_end = i + regex_match_result[0].length;
				index_match_end < line_length && children.push(inner_parse_node(line.substring(index_match_end), tree_node(CONTAINER_NODE_TYPE)));

				break outer_loop;
			}
	}

	if (is_pure_text)
		node.value = remove_escapes(line);

	return node;
};


/**
 * @param {string} str input string to be rendered
 */
export const to_tree = (str) =>
{
	let arr = str.split("\n");
	let tree = Array();
	let regex_match_result;

	const arr_length = arr.length;
	for (let i = 0; i < arr_length;)
	{
		let line = arr[i];
		let node = tree_node();

		check_match_strings:
		for (const [type, match_string] of LINE_MATCH_STRINGS)
		if (regex_match_result = line.match(match_string))
		{
			node.type = type;
			switch (type)
			{
			default: console.warn(`UNIMPLEMENTED ${type} TYPE!\n trace: ${console.trace()}`); break;
			case "codeblock":
				let j = i;
				while (++j < arr_length && !arr[j].match(match_string));
				node.value = arr.slice(i + 1, j).join("\n");
				i = j + 1;
				break check_match_strings;
			case "blockquote":
				do
				{
					node.children.push(parse_optimize_node(regex_match_result[1], tree_node("br_after")));
				} while (++i < arr_length && (regex_match_result = arr[i].match(match_string)))
				break;
			case "ol":
			case "ul":
				const is_ol = type == "ol";
				node.value = is_ol && regex_match_result[1];
				do
				{
					const item_node = parse_optimize_node(regex_match_result[1 + is_ol], tree_node("li"));
					node.children.push(item_node);

					let text_under_element = Array();
					let indented_match;
					while (++i < arr_length && (indented_match = arr[i].match(INDENTED_LINE)))
						text_under_element.push(indented_match[1]);
					if (text_under_element.length > 0) item_node.under_element = to_tree(text_under_element.join("\n"));
				} while (i < arr.length && (regex_match_result = arr[i].match(match_string)))
				break check_match_strings;
			case "note_desc":
				node.id = regex_match_result[1];
				node.children.push(regex_match_result[2] ? parse_optimize_node(regex_match_result[2] + ": ", tree_node("text")) : tree_node("text", regex_match_result[1] + ": "));
				node.children.push(parse_optimize_node(regex_match_result[3], tree_node("br_after")));

				let indented_match;
				while (++i < arr_length && (indented_match = arr[i].match(INDENTED_LINE)))
					node.children.push(parse_optimize_node(indented_match[1], tree_node("br_after")));

				break;
			case "h":
				node.type += regex_match_result[1].length;
				parse_optimize_node(regex_match_result[2], node);
				if (regex_match_result[3]) node.id = regex_match_result[3];
				// fall through
			case "hr": ++i;
			}
			break;
		}


		// if it didn't match anything.
		if (!node.type)
		{
			node.type = "br_after";
			parse_optimize_node(arr[i++], node);
		}

		tree.push(node);
	}

	return tree;
}

const inner_render_node_default = (node, parent) =>
	node.value ? 
		parent.appendChild(document.createTextNode(node.value)) :
		node.children.forEach(child => inner_render_node(child, parent));

const inner_render_node = (node, parent) =>
{
	let append_text_to = parent;
	const type = node.type;
	
	outer_switch:
	switch (type)
	{
	case "a":
	case "img":
	case "del":
	case "em":
	case "strong":
	case "u":
	case "code":
	case "li":
	case "sub":
	case "sup":
	case "mark":
	case "figcaption":
	case "spoiler":
		const element = document.createElement(type);
		append_text_to = element; 
		parent.appendChild(element);

		switch (type)
		{
		case "a":
			element.href = node.link;
			if (node.hover) element.title = node.hover;
			break;
		case "img":
			element.src = node.link;
			if (node.hover) element.title = node.hover;
			if (node.width) element.width = node.width;
			if (node.height) element.height = node.height;
			if (node.alt) element.alt = node.alt;
			if (node.figcaption) inner_render_node(node.figcaption, parent);
			break outer_switch;
		}
	default:
		inner_render_node_default(node, append_text_to);

		switch(type)
		{
		case "br_after": parent.appendChild(document.createElement("br")); break;
		case "li":
			if (node.under_element)
			{
				const p = document.createElement("p");
				p.replaceChildren(...render(node.under_element));
				append_text_to.appendChild(p);
			}
		}
		break;
	case "note":
		const a = document.createElement("a");
		a.href = `#${NOTE_ID_PREFIX}${node.id}`;
		inner_render_node_default(node, a);

		const sup = document.createElement("sup");
		sup.appendChild(a);
		parent.appendChild(sup);
		break;
	case "ruby":
		const ruby = document.createElement("ruby");
		const handle_rp = (s) => 
		{
			const rp = document.createElement("rp");
			rp.textContent = s;
			ruby.appendChild(rp);
		}

		for (const pair of node.pairs)
		{
			inner_render_node(pair, ruby);

			handle_rp("(");
			const rt = document.createElement("rt");
			inner_render_node(pair.rt, rt);
			ruby.appendChild(rt);
			handle_rp(")");
		}

		parent.appendChild(ruby);
		break;
	// do nothing
	case "hr":
	}
}

class mock_element
{
	constructor() { this.arr = Array(); }
	appendChild(element) { this.arr.push(element); }
	push(element) { this.arr.push(element) }
}

export const render = (tree) =>
{
	let children_nodes = new mock_element();
	for (const node of tree)
	{
		let type = node.type;
		let append_text_to = children_nodes;
		switch (type)
		{
		case "hr":
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "blockquote":
			let element = document.createElement(type);
			append_text_to = element;

			if (node.id) element.id = node.id;
		case "br_after":
			inner_render_node(node, append_text_to); 
			if (type == "br_after") break;
			children_nodes.push(element);
			break;

		case "ul":
		case "ol":
			let list = document.createElement(type);
			if (type == "ol" && node.value != "1")
				list.start = node.value;
			
			for (const item of node.children)
				inner_render_node(item, list);
			
			children_nodes.push(list);
			break;
		case "codeblock":
			let pre = document.createElement("pre");
			let code = document.createElement("code");
			code.textContent = node.value;
			pre.appendChild(code);
			children_nodes.push(pre);
			break;
		case "note_desc":
			let p = document.createElement("p");
			p.classList.add("mdex_note");
			p.id = NOTE_ID_PREFIX + node.id;
			inner_render_node(node, p);
			
			children_nodes.push(p);
		}
	}

	return children_nodes.arr;
}