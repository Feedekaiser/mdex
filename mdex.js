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
 * https://www.markdownguide.org/extended-syntax/ ✅❗
 * Strikethrough ✅
 * Tables ✅
 * Footnotes ✅
 * Heading IDs ✅
 * Definition Lists ✅
 * Task Lists ❓
 * Emoji ❌
 * Highlight ✅
 * Subscript & Superscript ✅
 * Automatic URL Linking ✅ escape it using backslash instead of surrounding it with backticks!
 * Fenced Code Blocks ✅
 * 
 * extended-extended features: 🛠️🚧
 * Underline ✅ use _
 * Spoiler ✅ use |
 * Furigana (<ruby>) ✅ use {明日(あす)} or {明(あ)日(す)}. {振(ふ)}り{仮(が)名(な)} is amazing! 💯
 * Math formula ❎
 * Variables ✅ define variables in a tildeblock and type %greeting% = hai, then use %greeting% anywhere below and it will be parsed into hai. 
 */

const tree_node = (type, value) => 
{
	return { type : type, value: value, children : Array() };
}

const EMPTY_ARR = []; // do NOT touch this.
const NOTE_ID_PREFIX = "_note:";
const CONTAINER_NODE_TYPE = "_cont";
const UNDEFINED_VAR_WARNING = "!UNDEFINED_VARIABLE!";
const INDENTED_LINE     = /^(?:(?:\s{4})|\t)(.+)/;
const RUBY_PAIR         = /(.+?)(?<!\\)(?:\\\\)*\((.+?)\)/g;
const DL_DD             = /^:\s(.+)/;
const TABLE_CAPTION     = /^\^(.+)/;
const TABLE_LEFT_ALIGN  = ":<";
const TABLE_RIGHT_ALIGN = ">:";
const TABLE_HEADER      = "#";
const TABLE_MERGE_MATCH = /^{(?:(\d+)?(?:x(\d+))?)?}(.+)/;
const VARBLOCK_SETVAR   = /^%(\w+?)%\s=\s(.+)$/;


const LINE_MATCH_STRINGS = {
	hr : /^(?:-{3,}|_{3,}|\*{3,})$/,
	ol : /^(\d+)\.\s(.+)/,
	ul : /^[-\*+]\s(.+)/,
	dl : /^\/(.+)/,
	h  : /^(#{1,6})\s(.+?)(?:\s#(.*))?$/,
	blockquote : /^>\s(.+)/,
	note_desc  : /^\[\^(.+?)\s*(?:"(.+)")?\]:\s(.+)/,
	codeblock  : /^`{3,}$/,
	varblock   : /^~{3}$/,
	table      : /^\|(.+)\|/,
};

// pointers are massively underrated in intepreted language!1!!
// metatables should be a feature in every intepreted language!!1!
const CHAR_TO_LINE_REGEX_MAP = {};
{
	const map = (char, tag) => 
		(CHAR_TO_LINE_REGEX_MAP[char] || (CHAR_TO_LINE_REGEX_MAP[char] = [])).push(tag);

	for (const c of ['-', '_', '*']) map(c, "hr");
	for (let i = 0; i <= 9; ++i) map(i + '', "ol");
	for (const c of ['-', '*', '+']) map(c, "ul");
	map('/', "dl");
	map('#', "h");
	map('>', "blockquote");
	map('[', "note_desc");
	map('`', "codeblock");
	map('~', "varblock");
	map('|', "table");
}


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
	["var",     /%(\w+?)%/, true],
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
	while ((i = line.indexOf('\\', i)) != -1)
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
 * only touch nodes which has type CONTAINER_NODE_TYPE and undefined value.
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

const parse_optimize_node = (line, node, variables) => optimize_node(inner_parse_node(line, node, variables));

/**
 * @description parse single line. only match controls. 
 * @param {string} line the line to be changed into a tree.
 * @param {Object} variables 
 * @return {Array} 
 */
const inner_parse_node = (line, node = tree_node("text"), variables) => 
{
	const line_length = line.length;
	let is_pure_text = true;
	let regex_match_result;

	outer_loop:
	for (let i = 0; i < line_length; ++i)
	{
		const regex_that_start_with_c = CHAR_TO_REGEX_MAP[line[i]];

		if (!regex_that_start_with_c || is_escaped(line, i))
			continue;

		for (const [type, regex, check_lastchar_escaped] of regex_that_start_with_c)
			if ((regex_match_result = line.substring(i).match(regex)) && 
				!(check_lastchar_escaped && is_last_char_escaped(regex_match_result[0])))
			{
				is_pure_text = false;

				let children = node.children;

				i > 0 && children.push(inner_parse_node(line.substring(0, i)));

				{
					let text_node = tree_node(type); // please suggest me a better variable name :D

					switch (type)
					{
					case "var":
						text_node = variables[regex_match_result[1]] || tree_node("text", UNDEFINED_VAR_WARNING);
						break;
					case "ruby":
						for (const pair of regex_match_result[1].matchAll(RUBY_PAIR))
						{
							const base_node = parse_optimize_node(pair[1], undefined, variables);
							base_node.rt = parse_optimize_node(pair[2], undefined, variables);
							text_node.children.push(base_node);
						}
						if (text_node.children.length == 0)
						{
							text_node.type = "text";
							text_node.value = regex_match_result[1];
							break;
						}
						break;
					case "note":
						text_node.id = regex_match_result[1];
						if (regex_match_result[2])
						{
							parse_optimize_node(regex_match_result[2], text_node, variables);
							break;
						}
					case "code": text_node.value = regex_match_result[1]; break; // code cannot nest other controls.
					case "link": text_node.type = "a"; text_node.link = regex_match_result[0]; text_node.value = regex_match_result[0]; break;
					case "img":
						text_node.alt = regex_match_result[1];
						text_node.width = regex_match_result[4];
						text_node.height = regex_match_result[5];
						if (regex_match_result[6]) 
							text_node.figcaption = parse_optimize_node(regex_match_result[6], tree_node("figcaption"), variables);
					case "a": 
						text_node.link = regex_match_result[2];
						text_node.hover = regex_match_result[3];
						if (regex_that_start_with_c == "img") break;
					default: inner_parse_node(regex_match_result[1], text_node, variables);
					}
					children.push(text_node);
				}

				let index_match_end = i + regex_match_result[0].length;
				index_match_end < line_length && children.push(inner_parse_node(line.substring(index_match_end), tree_node(CONTAINER_NODE_TYPE), variables));

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
export const to_tree = (str, variables = {}) =>
{
	let arr = str.split("\n");
	let tree = Array();
	let regex_match_result;

	const arr_length = arr.length;
	for (let i = 0; i < arr_length;)
	{
		const line = arr[i];
		const node = tree_node();

		check_match_strings:
		for (const type of CHAR_TO_LINE_REGEX_MAP[line[0]] || EMPTY_ARR)
		{
			const match_string = LINE_MATCH_STRINGS[type];
			if (regex_match_result = line.match(match_string))
			{
				node.type = type;
				switch (type)
				{
				case "table":
					if (is_last_char_escaped(arr[i])) { node.type = undefined; break check_match_strings; };

					do
					{
						let row = regex_match_result[1] + "|";
						let tr_node = tree_node("tr");
						let j;
						let last = -1;
						while ((j = row.indexOf('|', j)) >= 0)
						{
							if (is_escaped(row, j))
							{
								++j;
								continue;
							}

							let this_part = row.substring(last + 1, j);
							let data_node = tree_node("td");

							if (this_part.startsWith(TABLE_LEFT_ALIGN))
							{
								data_node.align = "left";
								this_part = this_part.substring(TABLE_LEFT_ALIGN.length);
							} 
							else if (this_part.endsWith(TABLE_RIGHT_ALIGN) && !is_escaped(this_part, this_part.length))
							{
								data_node.align = "right";
								this_part = this_part.substring(0, this_part.length - TABLE_RIGHT_ALIGN.length);
							}
							else data_node.align = "center";

							if (this_part.startsWith(TABLE_HEADER))
							{
								data_node.type = "th";
								this_part = this_part.substring(1);
							}

							if (regex_match_result = this_part.match(TABLE_MERGE_MATCH))
							{
								data_node.colspan = regex_match_result[1] || "1";
								data_node.rowspan = regex_match_result[2] || "1";
								this_part = regex_match_result[3];
							}
							let trimmed = this_part.trim();
							if (trimmed != "")
								tr_node.children.push(parse_optimize_node(trimmed, data_node, variables));

							last = j++;
						}
						node.children.push(tr_node);
					} while (++i < arr_length && (regex_match_result = arr[i].match(match_string)));

					if (i < arr_length && (regex_match_result = arr[i].match(TABLE_CAPTION)))
					{
						++i;
						node.caption = parse_optimize_node(regex_match_result[1], tree_node("caption"), variables);
					}

					break check_match_strings;
				case "dl":
					do
					{
						node.children.push(parse_optimize_node(regex_match_result[1], tree_node("dt"), variables));

						while (++i < arr_length && (regex_match_result = arr[i].match(DL_DD)))
							node.children.push(parse_optimize_node(regex_match_result[1], tree_node("dd"), variables));
					} while (i < arr_length && (regex_match_result = arr[i].match(match_string)));
					break check_match_strings;
				case "varblock":
				case "codeblock":
					let j = i;
					while (++j < arr_length && !(arr[j] == arr[i]));

					let part = arr.slice(i + 1, j);

					if (type == "codeblock") node.value = part.join("\n");
					else
						for (const part_line of part)
							if (regex_match_result = part_line.match(VARBLOCK_SETVAR))
								variables[regex_match_result[1]] = parse_optimize_node(regex_match_result[2], undefined, variables);

					i = j + 1;
					break check_match_strings;
				case "blockquote":
					do
					{
						node.children.push(parse_optimize_node(regex_match_result[1], tree_node("br_after"), variables));
					} while (++i < arr_length && (regex_match_result = arr[i].match(match_string)));
					break check_match_strings;
				case "ol":
				case "ul":
					const is_ol = type == "ol";
					node.value = is_ol && regex_match_result[1];
					do
					{
						const item_node = parse_optimize_node(regex_match_result[1 + is_ol], tree_node("li"), variables);
						node.children.push(item_node);

						let text_under_element = Array();
						let indented_match;
						while (++i < arr_length && (indented_match = arr[i].match(INDENTED_LINE)))
							text_under_element.push(indented_match[1]);
						if (text_under_element.length > 0) item_node.under_element = to_tree(text_under_element.join("\n"), variables);
					} while (i < arr_length && (regex_match_result = arr[i].match(match_string)))
					break check_match_strings;
				case "note_desc":
					node.id = regex_match_result[1];
					node.children.push(regex_match_result[2] ? parse_optimize_node(regex_match_result[2] + ": ", undefined, variables) : tree_node("text", regex_match_result[1] + ": "));
					node.children.push(parse_optimize_node(regex_match_result[3], tree_node("br_after"), variables));

					let indented_match;
					while (++i < arr_length && (indented_match = arr[i].match(INDENTED_LINE)))
						node.children.push(parse_optimize_node(indented_match[1], tree_node("br_after"), variables));
					
					break check_match_strings;
				case "h":
					node.type += regex_match_result[1].length;
					parse_optimize_node(regex_match_result[2], node, variables);
					if (regex_match_result[3]) node.id = regex_match_result[3];
					// fall through
				case "hr": ++i;
				}
				break;
			}
		}

		if (!node.type)
		{
			node.type = "br_after";
			parse_optimize_node(arr[i++], node, variables);
		}

		tree.push(node);
	}

	return tree;
};

const inner_render_node_default = (node, parent) =>
	node.value ? 
		parent.appendChild(document.createTextNode(node.value)) :
		node.children.forEach(child => inner_render_node(child, parent));

// not used for performance reason its 15% slower
// const create_create_element_and_method = (method) => (type, o) =>
// {
// 	const element = document.createElement(type);
// 	o[method](element);
// 	return element;
// }

const create_element_and_append = (type, parent) =>
{
	const element = document.createElement(type);
	parent.appendChild(element);
	return element;
};

const create_element_and_push = (type, arr) =>
{
	const element = document.createElement(type);
	arr.push(element);
	return element;
};

const inner_render_node = (node, parent) =>
{
	let append_text_to = parent;
	const type = node.type;
	
	outer_switch:
	switch (type)
	{
	case "dd":
	case "dt":
	case "tr":
	case "td":
	case "th":
	case "caption":
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
		const element = create_element_and_append(type, parent);
		append_text_to = element; 

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
		case "td":
		case "th":
			element.align = node.align;
			if (node.rowspan) element.rowSpan = node.rowspan;
			if (node.colspan) element.colSpan = node.colspan;
		}
	default:
		inner_render_node_default(node, append_text_to);

		switch(type)
		{
		case "br_after": create_element_and_append("br", parent); break;
		case "li":
			if (node.under_element)
				create_element_and_append("p", append_text_to).replaceChildren(...render(node.under_element));
		}
		break;
	case "note":
		const a = create_element_and_append("a", create_element_and_append("sup", parent));
		a.href = `#${NOTE_ID_PREFIX}${node.id}`;
		inner_render_node_default(node, a);

		break;
	case "ruby":
		const ruby = create_element_and_append("ruby", parent);

		for (const child of node.children)
		{
			inner_render_node(child, ruby);
			create_element_and_append("rp", ruby).textContent = "(";
			inner_render_node(child.rt, create_element_and_append("rt", ruby));
			create_element_and_append("rp", ruby).textContent = ")";
		}
		break;
	// do nothing
	case "hr":
	}
};

class mock_element
{
	constructor() { this.arr = Array(); }
	appendChild(element) { this.arr.push(element); }
	push(element) { this.arr.push(element) }
};

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
		case "h5":
		case "h6":
		case "blockquote":
			let element = document.createElement(type);
			append_text_to = element;

			if (node.id) element.id = node.id;
		case "br_after":
			inner_render_node(node, append_text_to); 
			if (type == "br_after") break;
			children_nodes.push(element);
			break;
		case "codeblock":
			create_element_and_append("code", create_element_and_push("pre", children_nodes)).textContent = node.value;
			break;
		case "note_desc":
			let p = create_element_and_push("p", children_nodes);
			p.classList.add("mdex_note");
			p.id = NOTE_ID_PREFIX + node.id;
			inner_render_node(node, p);
			break;
		case "ul":
		case "ol":
		case "dl":
		case "table":
			let list = create_element_and_push(type, children_nodes);
			node.children.forEach((child) => inner_render_node(child, list));

			// implement as switch later if changes.
			if (type == "ol" && node.value != "1")
				list.start = node.value;
			
			if (type == "table" && node.caption)
				inner_render_node(node.caption, list);
		}
	}

	return children_nodes.arr;
};