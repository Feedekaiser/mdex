// roadmap in the bottom

const tree_node = (type, value) => 
{
	return { type : type, value: value, children : Array() };
}

const EMPTY_ARR = []; // do NOT touch this.
const EMPTY_STRING = "";
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
	["img",     /!(?:\[(.+)\])?\((.+?)\s*(?:"(.+)")?\)(?:{(?:(\d+)?(?:x(\d+))?)?(?:\s*"(.+)")?})?(?:\((.+?)\))?/],
	["a",       /\[(.+)\]\((.+?)\s*(?:"(.+)")?\)/],
	["del",     /~(.+?)(?<!\\)(?:\\\\)*~/],
	["u",       /_(.+?)(?<!\\)(?:\\\\)*_/],
	["spoiler", /\|(.+?)(?<!\\)(?:\\\\)*\|/],
	["strong",  /\^(.+?)(?<!\\)(?:\\\\)*\^/],
	["em",      /\*(.+?)(?<!\\)(?:\\\\)*\*/],
	["sup",     /=(.+?)(?<!\\)(?:\\\\)*=/],
	["sub",     /-(.+?)(?<!\\)(?:\\\\)*-/],
	["mark",    /&(.+?)(?<!\\)(?:\\\\)*&/],
	["ruby",    /{(.+?)(?<!\\)(?:\\\\)*}/],
	["var",     /%(\w+?)%/],
	["math",    /@(.+?)@/],
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

const MATH_FUNCTIONS = {abs:1,and:1,arccos:1,arcsin:1,arctan:1,C:1,ceil:1,cot:1,cos:1,cosh:1,csc:1,deg:1,exp:1,fact:1,floor:1,frac:"mfrac",if:1,int:1,lim:1,log:1,ln:1,max:1,min:1,or:1,over:"mover",P:1,pow:"msup",prod:1,rad:1,root:"mroot",round:1,sec:1,sgn:1,sign:1,sin:1,sinh:1,sqrt:"msqrt",sum:1,sub:"msub",subsup:"msubsup",tan:1,tanh:1,under:"munder",underover:"munderover"};

const math_lex = (str) =>
{
	let str_length = str.length;
	let tokens = Array();
	{
		let i;

		const check_and_build = (f) =>
		{
			let buffer = str[i];
			while (++i < str_length && f(str.charCodeAt(i)))
				buffer += str[i];
			return buffer;
		}

		for (i = 0; i < str_length;)
		{
			let c = str.charCodeAt(i);
			switch (c)
			{
			case 0x26: // '&'
				++i; tokens.push([check_and_build((cc) => cc != 0x26), 'ms']); ++i;
				break;
			case 0x2A: // '*'
				tokens.push(['·', "mi"])
			case 0x20: // space
				++i; break;
			// '0', '1', ..., '9'
			case 0x30: case 0x31: case 0x32: case 0x33: case 0x34:
			case 0x35: case 0x36: case 0x37: case 0x38: case 0x39:
				tokens.push([check_and_build((cc) => (cc >= 0x30 && cc <= 0x39) || cc == 0x2E), 'mn']);
				break;

			// 'A', 'B', ..., 'Z'
			case 0x41: case 0x42: case 0x43: case 0x44: case 0x45:
			case 0x46: case 0x47: case 0x48: case 0x49: case 0x4A:
			case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F:
			case 0x50: case 0x51: case 0x52: case 0x53: case 0x54:
			case 0x55: case 0x56: case 0x57: case 0x58: case 0x59:
			case 0x5A:

			// 'a', 'b', ..., 'z'
			case 0x61: case 0x62: case 0x63: case 0x64: case 0x65:
			case 0x66: case 0x67: case 0x68: case 0x69: case 0x6A:
			case 0x6B: case 0x6C: case 0x6D: case 0x6E: case 0x6F:
			case 0x70: case 0x71: case 0x72: case 0x73: case 0x74:
			case 0x75: case 0x76: case 0x77: case 0x78: case 0x79:
			case 0x7A:
				let substr = check_and_build((cc) => (cc >= 0x41 && cc <= 0x5A) || (cc >= 0x61 && cc <= 0x7A));
				if (MATH_FUNCTIONS[substr])
					tokens.push([substr, 'mi']);
				else
					for (const character of substr)
						tokens.push([character, 'mi']);

				break;
			default:
				tokens.push([str[i++], 'mo']);
			}
		}
	}

	{
		let bracket_stack = Array();
		for (let i = 0, token = tokens[i], idx_open; i < tokens.length; token = tokens[++i])
			if (token[0] == '(')
				bracket_stack.push(i);
			else if (token[0] == ')')
				if ((idx_open = bracket_stack.pop()) != undefined)
					tokens[idx_open].push(i), token.push(idx_open);
	}
	return tokens;
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

		for (const [type, regex] of regex_that_start_with_c)
			if ((regex_match_result = line.substring(i).match(regex)))
			{
				is_pure_text = false;

				let children = node.children;

				i > 0 && children.push(inner_parse_node(line.substring(0, i)));

				{
					let text_node = tree_node(type); // please suggest me a better variable name :D

					switch (type)
					{
					case "math":
						text_node.tokens = math_lex(regex_match_result[1]); break;
					case "var":
						text_node = variables[regex_match_result[1]] || tree_node("text", UNDEFINED_VAR_WARNING); break;
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
						text_node.src = regex_match_result[2];
						text_node.hover = regex_match_result[3];
						text_node.width = regex_match_result[4];
						text_node.height = regex_match_result[5];
						if (regex_match_result[6]) 
							text_node.figcaption = parse_optimize_node(regex_match_result[6], tree_node("figcaption"), variables);
						text_node.link = regex_match_result[7];
						break;
					case "a": 
						text_node.link = regex_match_result[2];
						text_node.hover = regex_match_result[3];
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
					if (is_escaped(arr[i], arr[i].length - 1)) { node.type = undefined; break check_match_strings; };

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
							if (trimmed != EMPTY_STRING)
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

const MATH_ARG_COUNT = {
	sqrt  : 1,
	over  : 2,
	under : 2,
	sub   : 2,
	frac  : 2,
	pow   : 2,
	root  : 2,
	underover : 3,
	subsup : 3,
}

const math_render = (tokens, start = 0, end = tokens.length) =>
{
	let children = [];

	const create_and_append = (token) =>
	{
		let element = document.createElement(token[1]);
		element.textContent = token[0];
		children.push(element);
	};

	for (let i = start, current_token = tokens[i]; i < end; current_token = tokens[++i])
	{
		if (current_token[1] == "ms") { create_and_append(current_token); continue; }
		
		let arg_count = MATH_ARG_COUNT[current_token[0]];
		let next_token = tokens[i + 1] || [];

		if (arg_count && (next_token[0] == '('))
		{
			let element = document.createElement(MATH_FUNCTIONS[current_token[0]]);
			let idx_comma;
			let start = i + 2;
			while (--arg_count > 0)
			{
				for (idx_comma = start; idx_comma < end && tokens[idx_comma][0] != ','; ++idx_comma)
					if (tokens[idx_comma][0] == '(')
						idx_comma = tokens[idx_comma][2];

				element.appendChild(math_render(tokens, start, idx_comma));
				start = idx_comma + 1;
			}

			element.appendChild(math_render(tokens, (idx_comma + 1) || start, next_token[2]));
			children.push(element);
			i = next_token[2];
			continue;
		}

		create_and_append(current_token);
	}
	if (children.length == 1) return children[0];
	
	let mrow = document.createElement("mrow");
	mrow.replaceChildren(...children);
	return mrow;
};

const inner_render_node = (node, parent) =>
{
	let append_text_to = parent;
	const type = node.type;
	
	switch (type)
	{
	case "dd":
	case "dt":
	case "tr":
	case "td":
	case "th":
	case "caption":
	case "a":
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
	case "math":
		create_element_and_append("math", parent).replaceChildren(math_render(node.tokens));
		break;
	case "img":
		if (node.link)
		{
			parent = create_element_and_append("a", parent);
			parent.href = node.link;
		}
		
		let img = create_element_and_append("img", parent);
		img.src = node.src;
		img.alt = node.alt;
		if (node.hover) img.title = node.hover;
		if (node.width) img.width = node.width;
		if (node.height) img.height = node.height;
		if (node.figcaption) inner_render_node(node.figcaption, parent);		
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


/*
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
 * Emoji ❓
 * Highlight ✅ use &
 * Subscript & Superscript ✅ use - and =
 * Automatic URL Linking ✅ escape it using backslash instead of surrounding it with backticks!
 * Fenced Code Blocks ✅
 * 
 * extended-extended features: 🛠️🚧
 * Underline ✅ use _
 * Spoiler ✅ use |
 * Furigana (<ruby>) ✅ use {明日(あす)} or {明(あ)日(す)}. {振(ふ)}り{仮(が)名(な)} is amazing! 💯
 * Math formula ✅
 * Variables ✅ define variables in a tildeblock and type %greeting% = hai, then use %greeting% anywhere below and it will be parsed into hai. 
 */