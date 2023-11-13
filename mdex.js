// refer to the bottom for details.

const tree_node = (type, value) => 
{
	return { type : type, value: value, children : [] };
}

const EMPTY_ARR = []; // do NOT touch this. it should always have 0 elements.
const EMPTY_STRING = "";
const NOTE_ID_PREFIX = "_note:";
const CONTAINER_NODE_TYPE = "_cont";
const UNDEFINED_VAR_WARNING = "!UNDEFINED_VARIABLE!";
const INDENTED_LINE     = /^(?:(?:\s{4})|\t)(.+)/;
const TASK_LIST         = /^\[(.)\](.*)/;
const TASK_LIST_STATE   = {
	x : "checked",
	X : "checked",
	'+' : "checked",
	'-' : "indeterminate",
};
const RUBY_PAIR         = /(.+?)(?<!\\)(?:\\\\)*\((.+?)\)/g;
const DL_DD             = /^:\s(.+)/;
const TABLE_CAPTION     = /^\^(.+)/;
const TABLE_LEFT_ALIGN  = ":<";
const TABLE_RIGHT_ALIGN = ">:";
const TABLE_DATA_HEADER = "#";
const TABLE_HEADER      = "#";
const TABLE_FOOTER      = "<-";
const TABLE_MERGE_MATCH = /^{(?:(\d+)?(?:x(\d+))?)?}(.+)/;
const VARBLOCK_SETVAR   = /^%(\w+?)%\s=\s(.+)$/;

/* https://gist.githubusercontent.com/cherryblossom000/195c9ee047b85493210bd4d689920899/raw/c27cae9aff800cb9a5296bb376a313ff8c4d82f8/emojis.json
let line = "";
for (const [_, section] of Object.entries(a))
    for (const o of section)
		for (const name of o.names)
				line += `"${name}":"${o.surrogates}",`;
console.log(line);
 */

const LINE_MATCH_STRINGS = {
	hr : /^(?:-{3,}|_{3,}|\*{3,})$/,
	ol : /^(\d+)\.\s(.+)/,
	ul : /^[-\*+]\s(.+)/,
	dl : /^\/(.+)/,
	h  : /^(#{1,6})\s(.+?)(?:\s#(.*))?$/,
	blockquote : /^>(.*)/,
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
	["emoji",   /:([0-9_a-z\+\-]+):/],
	["kbd",     /!(.+?)!/], // using <kbd>!</kbd> is semantically incorrect?
	["var",     /%(\w+?)%/],
	["math",    /@(.+?)@/],
	["note",    /\[\^(.+?)\s*(?:"(.+)")?\]/],
	["link",    /https?:\/\/\S+/],
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

		line = `${line.substring(0, i - backslash_count)}${"\\".repeat(backslash_remained)}${line.substring(i)}`;
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
					case "emoji":
						text_node.type = "text";
						text_node.value = EMOJI_LIST[regex_match_result[1]] || regex_match_result[0]; break;
					case "math":
						text_node.tokens = math_parse.lex(regex_match_result[1]); break;
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
						if (regex_match_result[6]) text_node.figcaption = parse_optimize_node(regex_match_result[6], tree_node("figcaption"), variables);
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
 * @param {string|Array} str input string to be rendered. when `split` is falsy, it will parse `str` as an array of strings instead.
 */
export const to_tree = (str, variables = {}, split = true) =>
{
	let arr = split ? str.split("\n") : str;
	let tree = [];
	let regex_match_result;
	let previous_p_node;

	const arr_length = arr.length;

	process_line:
	for (let i = 0; i < arr_length;)
	{
		let line = arr[i];
		let node = tree_node();

		if (line == "")
		{
			++i;
			previous_p_node = null;
			continue;
		}

		check_match_strings:
		for (const type of CHAR_TO_LINE_REGEX_MAP[line[0]] || EMPTY_ARR)
		{
			const match_string = LINE_MATCH_STRINGS[type];
			if (regex_match_result = line.match(match_string))
			{
				node.type = type;
				previous_p_node = null;

				const under_element_nest = (node) =>
				{
					let under_element = [];
					let match;

					while (++i < arr_length && (match = arr[i].match(INDENTED_LINE)))
						under_element.push(match[1]);

					if (under_element.length > 0)
						node.under_element = to_tree(under_element, variables, false);

					return node;
				};

				switch (type)
				{
				case "table":
					if (is_escaped(arr[i], arr[i].length - 1)) { node.type = undefined; break check_match_strings; };

					node.thead = [];
					node.tfoot = [];
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
							else if (this_part.endsWith(TABLE_RIGHT_ALIGN) && !is_escaped(this_part, this_part.length - TABLE_RIGHT_ALIGN.length))
							{
								data_node.align = "right";
								this_part = this_part.substring(0, this_part.length - TABLE_RIGHT_ALIGN.length);
							}
							else data_node.align = "center";

							if (this_part.startsWith(TABLE_DATA_HEADER))
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


						if (arr[i].endsWith(TABLE_FOOTER))
							node.tfoot.push(tr_node);
						else if (arr[i].endsWith(TABLE_HEADER))
							node.thead.push(tr_node);
						else
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
						++i;
						node.children.push(parse_optimize_node(regex_match_result[1], tree_node("dt"), variables));
						
						while (i < arr_length && (regex_match_result = arr[i].match(DL_DD)))
							node.children.push(under_element_nest(parse_optimize_node(regex_match_result[1], tree_node("dd"), variables)));
					} while (i < arr_length && (regex_match_result = arr[i].match(match_string)));
					break check_match_strings;
				case "varblock":
				case "codeblock":
					let j = i;
					while (++j < arr_length && !(arr[j] == arr[i]));

					let part = arr.slice(i + 1, j);
					i = j + 1;

					if (type == "codeblock") node.value = part.join("\n");
					else
					{
						for (const part_line of part)
							if (regex_match_result = part_line.match(VARBLOCK_SETVAR))
								variables[regex_match_result[1]] = parse_optimize_node(regex_match_result[2], undefined, variables);

						continue process_line;
					}


					break check_match_strings;
				case "blockquote":
					let lines = [regex_match_result[1]];
					while (++i < arr_length && (regex_match_result = arr[i].match(match_string)))
						lines.push(regex_match_result[1]);

					node.children = to_tree(lines, variables, false);
					break check_match_strings;
				case "ol":
				case "ul":
					const is_ol = type == "ol";
					node.value = is_ol && regex_match_result[1];
					do
					{
						let line = regex_match_result[1 + is_ol];
						let item_node = tree_node("li");

						{
							let tasklist_match;
							if (tasklist_match = line.match(TASK_LIST))
							{
								item_node.checkbox = TASK_LIST_STATE[tasklist_match[1]];
								line = tasklist_match[2];
							}
						}

						node.children.push(parse_optimize_node(line, item_node, variables));
						under_element_nest(item_node);
					} while (i < arr_length && (regex_match_result = arr[i].match(match_string)))
					break check_match_strings;
				case "note_desc":
					node.id = regex_match_result[1];

					node.children.push(
						regex_match_result[2] ? 
							parse_optimize_node(regex_match_result[2] + ": ", undefined, variables) :
							tree_node("text", regex_match_result[1] + ": ")
						
						, 
						parse_optimize_node(regex_match_result[3], tree_node("text"), variables)
					);

					under_element_nest(node);
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

		if (node.type)
		{
			tree.push(node);
			continue;
		}

		++i;
		parse_optimize_node(line, node, variables);
		if (!previous_p_node)
		{
			node.type = "p";
			tree.push(node);
			previous_p_node = node;
		} 
		else
		{
			node.type = "br_before"
			previous_p_node.children.push(node);
		}
	}

	return tree;
};

const inner_render_node_default = (node, parent) =>
{
	node.value && parent.appendChild(document.createTextNode(node.value));
	node.children.forEach(child => inner_render_node(child, parent));
}

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
	
	switch (type)
	{
	case "br_before":
		create_element_and_append("br", parent);
		inner_render_node_default(node, append_text_to);
		break;
	// put here if need to create this element
	case "blockquote":
	case "p":
	case "li":
	case "kbd":
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
	case "sub":
	case "sup":
	case "mark":
	case "figcaption":
	case "spoiler":
		const element = create_element_and_append(type, parent);
		append_text_to = element; 

		switch (type)
		{
		case "li":
			if ("checkbox" in node)
			{
				let checkbox = create_element_and_append("input", element);
				checkbox.type = "checkbox";
				checkbox.disabled = 1;
				checkbox[node.checkbox] = 1;
			}
			break;
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
	// if not just render it on the parent node as text
	default:
		inner_render_node_default(node, append_text_to);

		switch(type)
		{
		case "dd":
		case "note_desc":
		case "li":
			if (node.under_element)
				append_text_to.append(...render(node.under_element));
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
		let math = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
		math.appendChild(math_parse.render(node.tokens));
		parent.appendChild(math);
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
	constructor() { this.arr = []; }
	appendChild(element) { this.arr.push(element); }
	push(element) { this.arr.push(element) }
};

export const render = (tree) =>
{
	let children_nodes = new mock_element();
	for (const node of tree)
	{
		let type = node.type;
		switch (type)
		{
		case "hr":
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "h5":
		case "h6":
			let element = create_element_and_push(type, children_nodes);
			if (node.id) element.id = node.id;
			inner_render_node_default(node, element);
			break;
		case "p":
			inner_render_node_default(node, create_element_and_push("p", children_nodes)); break;
		case "codeblock":
			create_element_and_append("code", create_element_and_push("pre", children_nodes)).textContent = node.value; break;
		case "note_desc":
			let div = create_element_and_push("div", children_nodes);
			div.classList.add("mdex_note");
			div.id = NOTE_ID_PREFIX + node.id;
			inner_render_node(node, div);
			break;
		case "ul":
		case "ol":
		case "dl":
		case "blockquote":
		case "table":
			let list = create_element_and_push(type, children_nodes);

			switch (type)
			{
			case "table":
				if (node.caption)
					inner_render_node(node.caption, list);

				const render_nodes = (arr, parent_tag) => 
				{
					let tag = create_element_and_append(parent_tag, list);
					arr.forEach((node) => inner_render_node(node, tag));
				};

				if (node.thead.length > 0) render_nodes(node.thead, "thead");
				if (node.children.length > 0) render_nodes(node.children, "tbody");
				if (node.tfoot.length > 0) render_nodes(node.tfoot, "tfoot");

				break;
			case "ol":
				if (node.value != "1")
					list.start = node.value;
			default:
				node.children.forEach((child) => inner_render_node(child, list));
			}
		}
	}

	return children_nodes.arr;
};


const math_parse = {}; {
	const MATH_FUNCTIONS = {abs:1,and:1,arccos:1,arcsin:1,arctan:1,C:1,ceil:1,cot:1,cos:1,cosh:1,csc:1,deg:1,exp:1,fact:1,floor:1,frac:"mfrac",if:1,int:1,lim:1,log:1,ln:1,max:1,min:1,or:1,over:"mover",P:1,pow:"msup",prod:1,rad:1,root:"mroot",round:1,sec:1,sgn:1,sign:1,sin:1,sinh:1,sqrt:"msqrt",sum:1,sub:"msub",subsup:"msubsup",tan:1,tanh:1,under:"munder",underover:"munderover"};
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
	};

	math_parse.lex = (str) =>
	{
		let str_length = str.length;
		let tokens = [];
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
					++i; tokens.push([`​${check_and_build((cc) => cc != 0x26)}​`, "mtext"]); ++i; // zwsp at the end and start to make html render the space (if any) at end and start
					break;
				case 0x2A: // '*'
					tokens.push(["·", "mo"]);
				case 0x20: // space
					++i; break;
				// '0', '1', ..., '9'
				case 0x30: case 0x31: case 0x32: case 0x33: case 0x34:
				case 0x35: case 0x36: case 0x37: case 0x38: case 0x39:
					tokens.push([check_and_build((cc) => (cc >= 0x30 && cc <= 0x39) || cc == 0x2E), "mn"]);
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
						tokens.push([substr, "mi"]);
					else
						for (const character of substr)
							tokens.push([character, "mi"]);
	
					break;
				case 0x3C0: case 0x3B1: case 0x3B2: case 0x3B3: case 0x3B4: case 0x3B5:
				case 0x3B6: case 0x3B8: case 0x3BB: case 0x3BC: case 0x3BD: case 0x3C1:
				case 0x3C3: case 0x3C4: case 0x3A9: case 0x394:
					tokens.push([str[i++], "mi"]); break;
				default:
					tokens.push([str[i++], "mo"]);
				}
			}
		}
	
		{
			let bracket_stack = [];
			for (let i = 0, token = tokens[i], idx_open; i < tokens.length; token = tokens[++i])
				if (token[0] == '(')
					bracket_stack.push(i);
				else if (token[0] == ')')
					if ((idx_open = bracket_stack.pop()) != undefined)
						tokens[idx_open].push(i), token.push(idx_open);
		}
		return tokens;
	};

	const create_math_element_and_push = (type, arr) =>
	{
		let element = document.createElementNS("http://www.w3.org/1998/Math/MathML", type);
		arr.push(element);
		return element;
	};

	math_parse.render = (tokens, start = 0, end = tokens.length) =>
	{
		let children = [];

		const default_token_handle = (token) =>
			create_math_element_and_push(token[1], children).textContent = token[0];


		for (let i = start, current_token = tokens[i]; i < end; current_token = tokens[++i])
		{
			if (current_token[1] == "mtext") { default_token_handle(current_token); continue; }
			
			let arg_count = MATH_ARG_COUNT[current_token[0]];
			let next_token = tokens[i + 1] || EMPTY_ARR;

			if (arg_count && (next_token[0] == '('))
			{
				let element = create_math_element_and_push(MATH_FUNCTIONS[current_token[0]], children);
				let idx_comma;
				let start = i + 2;
				while (--arg_count > 0)
				{
					for (idx_comma = start; idx_comma < end && tokens[idx_comma][0] != ','; ++idx_comma)
						if (tokens[idx_comma][0] == '(')
							idx_comma = tokens[idx_comma][2];

					element.appendChild(math_parse.render(tokens, start, idx_comma));
					start = idx_comma + 1;
				}

				element.appendChild(math_parse.render(tokens, (idx_comma + 1) || start, next_token[2]));
				i = next_token[2];
				continue;
			}

			default_token_handle(current_token);
		}


		if (children.length == 1) return children[0];


		let mrow = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mrow");
		mrow.replaceChildren(...children);
		return mrow;
	};
}



/*
 * https://www.markdownguide.org/basic-syntax/ ✅
 * Headings ✅ will not support alternate syntax.
 * Bold ✅ use ^ instead of **
 * Italic ✅
 * (Nested) Blockquote ✅
 * (Nested) List ✅
 * Code ✅
 * Horizontal Rule ✅
 * Link ✅
 * Images ✅
 * 
 * https://www.markdownguide.org/extended-syntax/ ✅
 * Strikethrough ✅
 * Tables ✅
 * Footnotes ✅
 * Heading IDs ✅
 * Definition Lists ✅
 * Task Lists ✅
 * Emoji ✅
 * Highlight ✅ use &
 * Subscript & Superscript ✅ use - and =
 * Automatic URL Linking ✅ escape it using backslash instead of surrounding it with backticks!
 * Fenced Code Blocks ✅
 * 
 * extended-extended features: ✅❗ 🛠️🚧
 * See https://github.com/Feedekaiser/mdex/wiki
**/

/*
MIT License

Copyright (c) 2023 Feedekaiser

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


const EMOJI_LIST = {"grinning":"😀","smiley":"😃","smile":"😄","grin":"😁","laughing":"😆","satisfied":"😆","face_holding_back_tears":"🥹","sweat_smile":"😅","joy":"😂","rofl":"🤣","rolling_on_the_floor_laughing":"🤣","smiling_face_with_tear":"🥲","relaxed":"☺️","blush":"😊","innocent":"😇","slight_smile":"🙂","slightly_smiling_face":"🙂","upside_down":"🙃","upside_down_face":"🙃","wink":"😉","relieved":"😌","heart_eyes":"😍","smiling_face_with_3_hearts":"🥰","kissing_heart":"😘","kissing":"😗","kissing_smiling_eyes":"😙","kissing_closed_eyes":"😚","yum":"😋","stuck_out_tongue":"😛","stuck_out_tongue_closed_eyes":"😝","stuck_out_tongue_winking_eye":"😜","zany_face":"🤪","face_with_raised_eyebrow":"🤨","face_with_monocle":"🧐","nerd":"🤓","nerd_face":"🤓","sunglasses":"😎","disguised_face":"🥸","star_struck":"🤩","partying_face":"🥳","smirk":"😏","unamused":"😒","disappointed":"😞","pensive":"😔","worried":"😟","confused":"😕","slight_frown":"🙁","slightly_frowning_face":"🙁","frowning2":"☹️","white_frowning_face":"☹️","persevere":"😣","confounded":"😖","tired_face":"😫","weary":"😩","pleading_face":"🥺","cry":"😢","sob":"😭","triumph":"😤","angry":"😠","rage":"😡","face_with_symbols_over_mouth":"🤬","exploding_head":"🤯","flushed":"😳","hot_face":"🥵","cold_face":"🥶","face_in_clouds":"😶‍🌫️","scream":"😱","fearful":"😨","cold_sweat":"😰","disappointed_relieved":"😥","sweat":"😓","hugging":"🤗","hugging_face":"🤗","thinking":"🤔","thinking_face":"🤔","face_with_peeking_eye":"🫣","face_with_hand_over_mouth":"🤭","face_with_open_eyes_and_hand_over_mouth":"🫢","saluting_face":"🫡","shushing_face":"🤫","melting_face":"🫠","lying_face":"🤥","liar":"🤥","no_mouth":"😶","dotted_line_face":"🫥","neutral_face":"😐","face_with_diagonal_mouth":"🫤","expressionless":"😑","grimacing":"😬","rolling_eyes":"🙄","face_with_rolling_eyes":"🙄","hushed":"😯","frowning":"😦","anguished":"😧","open_mouth":"😮","astonished":"😲","yawning_face":"🥱","sleeping":"😴","drooling_face":"🤤","drool":"🤤","sleepy":"😪","face_exhaling":"😮‍💨","dizzy_face":"😵","face_with_spiral_eyes":"😵‍💫","zipper_mouth":"🤐","zipper_mouth_face":"🤐","woozy_face":"🥴","nauseated_face":"🤢","sick":"🤢","face_vomiting":"🤮","sneezing_face":"🤧","sneeze":"🤧","mask":"😷","thermometer_face":"🤒","face_with_thermometer":"🤒","head_bandage":"🤕","face_with_head_bandage":"🤕","money_mouth":"🤑","money_mouth_face":"🤑","cowboy":"🤠","face_with_cowboy_hat":"🤠","smiling_imp":"😈","imp":"👿","japanese_ogre":"👹","japanese_goblin":"👺","clown":"🤡","clown_face":"🤡","poop":"💩","shit":"💩","hankey":"💩","poo":"💩","ghost":"👻","skull":"💀","skeleton":"💀","skull_crossbones":"☠️","skull_and_crossbones":"☠️","alien":"👽","space_invader":"👾","robot":"🤖","robot_face":"🤖","jack_o_lantern":"🎃","smiley_cat":"😺","smile_cat":"😸","joy_cat":"😹","heart_eyes_cat":"😻","smirk_cat":"😼","kissing_cat":"😽","scream_cat":"🙀","crying_cat_face":"😿","pouting_cat":"😾","heart_hands":"🫶","palms_up_together":"🤲","open_hands":"👐","raised_hands":"🙌","clap":"👏","handshake":"🤝","shaking_hands":"🤝","thumbsup":"👍","+1":"👍","thumbup":"👍","thumbsdown":"👎","-1":"👎","thumbdown":"👎","punch":"👊","fist":"✊","left_facing_fist":"🤛","left_fist":"🤛","right_facing_fist":"🤜","right_fist":"🤜","fingers_crossed":"🤞","hand_with_index_and_middle_finger_crossed":"🤞","v":"✌️","hand_with_index_finger_and_thumb_crossed":"🫰","love_you_gesture":"🤟","metal":"🤘","sign_of_the_horns":"🤘","ok_hand":"👌","pinched_fingers":"🤌","pinching_hand":"🤏","palm_down_hand":"🫳","palm_up_hand":"🫴","point_left":"👈","point_right":"👉","point_up_2":"👆","point_down":"👇","point_up":"☝️","raised_hand":"✋","raised_back_of_hand":"🤚","back_of_hand":"🤚","hand_splayed":"🖐️","raised_hand_with_fingers_splayed":"🖐️","vulcan":"🖖","raised_hand_with_part_between_middle_and_ring_fingers":"🖖","wave":"👋","call_me":"🤙","call_me_hand":"🤙","leftwards_hand":"🫲","rightwards_hand":"🫱","muscle":"💪","mechanical_arm":"🦾","middle_finger":"🖕","reversed_hand_with_middle_finger_extended":"🖕","writing_hand":"✍️","pray":"🙏","index_pointing_at_the_viewer":"🫵","foot":"🦶","leg":"🦵","mechanical_leg":"🦿","lipstick":"💄","kiss":"💋","lips":"👄","biting_lip":"🫦","tooth":"🦷","tongue":"👅","ear":"👂","ear_with_hearing_aid":"🦻","nose":"👃","footprints":"👣","eye":"👁️","eyes":"👀","anatomical_heart":"🫀","lungs":"🫁","brain":"🧠","speaking_head":"🗣️","speaking_head_in_silhouette":"🗣️","bust_in_silhouette":"👤","busts_in_silhouette":"👥","people_hugging":"🫂","baby":"👶","child":"🧒","girl":"👧","boy":"👦","adult":"🧑","woman":"👩","man":"👨","person_curly_hair":"🧑‍🦱","woman_curly_haired":"👩‍🦱","man_curly_haired":"👨‍🦱","person_red_hair":"🧑‍🦰","woman_red_haired":"👩‍🦰","man_red_haired":"👨‍🦰","blond_haired_person":"👱","person_with_blond_hair":"👱","blond_haired_woman":"👱‍♀️","blond_haired_man":"👱‍♂️","person_white_hair":"🧑‍🦳","woman_white_haired":"👩‍🦳","man_white_haired":"👨‍🦳","person_bald":"🧑‍🦲","woman_bald":"👩‍🦲","man_bald":"👨‍🦲","bearded_person":"🧔","woman_beard":"🧔‍♀️","man_beard":"🧔‍♂️","older_adult":"🧓","older_woman":"👵","grandma":"👵","older_man":"👴","man_with_chinese_cap":"👲","man_with_gua_pi_mao":"👲","person_wearing_turban":"👳","man_with_turban":"👳","woman_wearing_turban":"👳‍♀️","man_wearing_turban":"👳‍♂️","woman_with_headscarf":"🧕","police_officer":"👮","cop":"👮","woman_police_officer":"👮‍♀️","man_police_officer":"👮‍♂️","construction_worker":"👷","woman_construction_worker":"👷‍♀️","man_construction_worker":"👷‍♂️","guard":"💂","guardsman":"💂","woman_guard":"💂‍♀️","man_guard":"💂‍♂️","detective":"🕵️","spy":"🕵️","sleuth_or_spy":"🕵️","woman_detective":"🕵️‍♀️","man_detective":"🕵️‍♂️","health_worker":"🧑‍⚕️","woman_health_worker":"👩‍⚕️","man_health_worker":"👨‍⚕️","farmer":"🧑‍🌾","woman_farmer":"👩‍🌾","man_farmer":"👨‍🌾","cook":"🧑‍🍳","woman_cook":"👩‍🍳","man_cook":"👨‍🍳","student":"🧑‍🎓","woman_student":"👩‍🎓","man_student":"👨‍🎓","singer":"🧑‍🎤","woman_singer":"👩‍🎤","man_singer":"👨‍🎤","teacher":"🧑‍🏫","woman_teacher":"👩‍🏫","man_teacher":"👨‍🏫","factory_worker":"🧑‍🏭","woman_factory_worker":"👩‍🏭","man_factory_worker":"👨‍🏭","technologist":"🧑‍💻","woman_technologist":"👩‍💻","man_technologist":"👨‍💻","office_worker":"🧑‍💼","woman_office_worker":"👩‍💼","man_office_worker":"👨‍💼","mechanic":"🧑‍🔧","woman_mechanic":"👩‍🔧","man_mechanic":"👨‍🔧","scientist":"🧑‍🔬","woman_scientist":"👩‍🔬","man_scientist":"👨‍🔬","artist":"🧑‍🎨","woman_artist":"👩‍🎨","man_artist":"👨‍🎨","firefighter":"🧑‍🚒","woman_firefighter":"👩‍🚒","man_firefighter":"👨‍🚒","pilot":"🧑‍✈️","woman_pilot":"👩‍✈️","man_pilot":"👨‍✈️","astronaut":"🧑‍🚀","woman_astronaut":"👩‍🚀","man_astronaut":"👨‍🚀","judge":"🧑‍⚖️","woman_judge":"👩‍⚖️","man_judge":"👨‍⚖️","person_with_veil":"👰","woman_with_veil":"👰‍♀️","bride_with_veil":"👰‍♀️","man_with_veil":"👰‍♂️","person_in_tuxedo":"🤵","woman_in_tuxedo":"🤵‍♀️","man_in_tuxedo":"🤵‍♂️","person_with_crown":"🫅","princess":"👸","prince":"🤴","superhero":"🦸","woman_superhero":"🦸‍♀️","man_superhero":"🦸‍♂️","supervillain":"🦹","woman_supervillain":"🦹‍♀️","man_supervillain":"🦹‍♂️","ninja":"🥷","mx_claus":"🧑‍🎄","mrs_claus":"🤶","mother_christmas":"🤶","santa":"🎅","mage":"🧙","woman_mage":"🧙‍♀️","man_mage":"🧙‍♂️","elf":"🧝","woman_elf":"🧝‍♀️","man_elf":"🧝‍♂️","troll":"🧌","vampire":"🧛","woman_vampire":"🧛‍♀️","man_vampire":"🧛‍♂️","zombie":"🧟","woman_zombie":"🧟‍♀️","man_zombie":"🧟‍♂️","genie":"🧞","woman_genie":"🧞‍♀️","man_genie":"🧞‍♂️","merperson":"🧜","mermaid":"🧜‍♀️","merman":"🧜‍♂️","fairy":"🧚","woman_fairy":"🧚‍♀️","man_fairy":"🧚‍♂️","angel":"👼","pregnant_person":"🫄","pregnant_woman":"🤰","expecting_woman":"🤰","pregnant_man":"🫃","breast_feeding":"🤱","person_feeding_baby":"🧑‍🍼","woman_feeding_baby":"👩‍🍼","man_feeding_baby":"👨‍🍼","person_bowing":"🙇","bow":"🙇","woman_bowing":"🙇‍♀️","man_bowing":"🙇‍♂️","person_tipping_hand":"💁","information_desk_person":"💁","woman_tipping_hand":"💁‍♀️","man_tipping_hand":"💁‍♂️","person_gesturing_no":"🙅","no_good":"🙅","woman_gesturing_no":"🙅‍♀️","man_gesturing_no":"🙅‍♂️","person_gesturing_ok":"🙆","woman_gesturing_ok":"🙆‍♀️","man_gesturing_ok":"🙆‍♂️","person_raising_hand":"🙋","raising_hand":"🙋","woman_raising_hand":"🙋‍♀️","man_raising_hand":"🙋‍♂️","deaf_person":"🧏","deaf_woman":"🧏‍♀️","deaf_man":"🧏‍♂️","person_facepalming":"🤦","face_palm":"🤦","facepalm":"🤦","woman_facepalming":"🤦‍♀️","man_facepalming":"🤦‍♂️","person_shrugging":"🤷","shrug":"🤷","woman_shrugging":"🤷‍♀️","man_shrugging":"🤷‍♂️","person_pouting":"🙎","person_with_pouting_face":"🙎","woman_pouting":"🙎‍♀️","man_pouting":"🙎‍♂️","person_frowning":"🙍","woman_frowning":"🙍‍♀️","man_frowning":"🙍‍♂️","person_getting_haircut":"💇","haircut":"💇","woman_getting_haircut":"💇‍♀️","man_getting_haircut":"💇‍♂️","person_getting_massage":"💆","massage":"💆","woman_getting_face_massage":"💆‍♀️","man_getting_face_massage":"💆‍♂️","person_in_steamy_room":"🧖","woman_in_steamy_room":"🧖‍♀️","man_in_steamy_room":"🧖‍♂️","nail_care":"💅","selfie":"🤳","dancer":"💃","man_dancing":"🕺","male_dancer":"🕺","people_with_bunny_ears_partying":"👯","dancers":"👯","women_with_bunny_ears_partying":"👯‍♀️","men_with_bunny_ears_partying":"👯‍♂️","levitate":"🕴️","man_in_business_suit_levitating":"🕴️","person_in_manual_wheelchair":"🧑‍🦽","woman_in_manual_wheelchair":"👩‍🦽","man_in_manual_wheelchair":"👨‍🦽","person_in_motorized_wheelchair":"🧑‍🦼","woman_in_motorized_wheelchair":"👩‍🦼","man_in_motorized_wheelchair":"👨‍🦼","person_walking":"🚶","walking":"🚶","woman_walking":"🚶‍♀️","man_walking":"🚶‍♂️","person_with_probing_cane":"🧑‍🦯","woman_with_probing_cane":"👩‍🦯","man_with_probing_cane":"👨‍🦯","person_kneeling":"🧎","woman_kneeling":"🧎‍♀️","man_kneeling":"🧎‍♂️","person_running":"🏃","runner":"🏃","woman_running":"🏃‍♀️","man_running":"🏃‍♂️","person_standing":"🧍","woman_standing":"🧍‍♀️","man_standing":"🧍‍♂️","people_holding_hands":"🧑‍🤝‍🧑","couple":"👫","two_women_holding_hands":"👭","two_men_holding_hands":"👬","couple_with_heart":"💑","couple_with_heart_woman_man":"👩‍❤️‍👨","couple_ww":"👩‍❤️‍👩","couple_with_heart_ww":"👩‍❤️‍👩","couple_mm":"👨‍❤️‍👨","couple_with_heart_mm":"👨‍❤️‍👨","couplekiss":"💏","kiss_woman_man":"👩‍❤️‍💋‍👨","kiss_ww":"👩‍❤️‍💋‍👩","couplekiss_ww":"👩‍❤️‍💋‍👩","kiss_mm":"👨‍❤️‍💋‍👨","couplekiss_mm":"👨‍❤️‍💋‍👨","family":"👪","family_man_woman_boy":"👨‍👩‍👦","family_mwg":"👨‍👩‍👧","family_mwgb":"👨‍👩‍👧‍👦","family_mwbb":"👨‍👩‍👦‍👦","family_mwgg":"👨‍👩‍👧‍👧","family_wwb":"👩‍👩‍👦","family_wwg":"👩‍👩‍👧","family_wwgb":"👩‍👩‍👧‍👦","family_wwbb":"👩‍👩‍👦‍👦","family_wwgg":"👩‍👩‍👧‍👧","family_mmb":"👨‍👨‍👦","family_mmg":"👨‍👨‍👧","family_mmgb":"👨‍👨‍👧‍👦","family_mmbb":"👨‍👨‍👦‍👦","family_mmgg":"👨‍👨‍👧‍👧","family_woman_boy":"👩‍👦","family_woman_girl":"👩‍👧","family_woman_girl_boy":"👩‍👧‍👦","family_woman_boy_boy":"👩‍👦‍👦","family_woman_girl_girl":"👩‍👧‍👧","family_man_boy":"👨‍👦","family_man_girl":"👨‍👧","family_man_girl_boy":"👨‍👧‍👦","family_man_boy_boy":"👨‍👦‍👦","family_man_girl_girl":"👨‍👧‍👧","knot":"🪢","yarn":"🧶","thread":"🧵","sewing_needle":"🪡","coat":"🧥","lab_coat":"🥼","safety_vest":"🦺","womans_clothes":"👚","shirt":"👕","jeans":"👖","briefs":"🩲","shorts":"🩳","necktie":"👔","dress":"👗","bikini":"👙","one_piece_swimsuit":"🩱","kimono":"👘","sari":"🥻","thong_sandal":"🩴","womans_flat_shoe":"🥿","high_heel":"👠","sandal":"👡","boot":"👢","mans_shoe":"👞","athletic_shoe":"👟","hiking_boot":"🥾","socks":"🧦","gloves":"🧤","scarf":"🧣","tophat":"🎩","billed_cap":"🧢","womans_hat":"👒","mortar_board":"🎓","helmet_with_cross":"⛑️","helmet_with_white_cross":"⛑️","military_helmet":"🪖","crown":"👑","ring":"💍","pouch":"👝","purse":"👛","handbag":"👜","briefcase":"💼","school_satchel":"🎒","luggage":"🧳","eyeglasses":"👓","dark_sunglasses":"🕶️","goggles":"🥽","closed_umbrella":"🌂","dog":"🐶","cat":"🐱","mouse":"🐭","hamster":"🐹","rabbit":"🐰","fox":"🦊","fox_face":"🦊","bear":"🐻","panda_face":"🐼","polar_bear":"🐻‍❄️","koala":"🐨","tiger":"🐯","lion_face":"🦁","lion":"🦁","cow":"🐮","pig":"🐷","pig_nose":"🐽","frog":"🐸","monkey_face":"🐵","see_no_evil":"🙈","hear_no_evil":"🙉","speak_no_evil":"🙊","monkey":"🐒","chicken":"🐔","penguin":"🐧","bird":"🐦","baby_chick":"🐤","hatching_chick":"🐣","hatched_chick":"🐥","duck":"🦆","eagle":"🦅","owl":"🦉","bat":"🦇","wolf":"🐺","boar":"🐗","horse":"🐴","unicorn":"🦄","unicorn_face":"🦄","bee":"🐝","bug":"🐛","butterfly":"🦋","snail":"🐌","worm":"🪱","lady_beetle":"🐞","ant":"🐜","fly":"🪰","mosquito":"🦟","cockroach":"🪳","beetle":"🪲","cricket":"🦗","spider":"🕷️","spider_web":"🕸️","scorpion":"🦂","turtle":"🐢","snake":"🐍","lizard":"🦎","t_rex":"🦖","sauropod":"🦕","octopus":"🐙","squid":"🦑","shrimp":"🦐","lobster":"🦞","crab":"🦀","blowfish":"🐡","tropical_fish":"🐠","fish":"🐟","seal":"🦭","dolphin":"🐬","whale":"🐳","whale2":"🐋","shark":"🦈","crocodile":"🐊","tiger2":"🐅","leopard":"🐆","zebra":"🦓","gorilla":"🦍","orangutan":"🦧","elephant":"🐘","mammoth":"🦣","bison":"🦬","hippopotamus":"🦛","rhino":"🦏","rhinoceros":"🦏","dromedary_camel":"🐪","camel":"🐫","giraffe":"🦒","kangaroo":"🦘","water_buffalo":"🐃","ox":"🐂","cow2":"🐄","racehorse":"🐎","pig2":"🐖","ram":"🐏","sheep":"🐑","llama":"🦙","goat":"🐐","deer":"🦌","dog2":"🐕","poodle":"🐩","guide_dog":"🦮","service_dog":"🐕‍🦺","cat2":"🐈","black_cat":"🐈‍⬛","feather":"🪶","rooster":"🐓","turkey":"🦃","dodo":"🦤","peacock":"🦚","parrot":"🦜","swan":"🦢","flamingo":"🦩","dove":"🕊️","dove_of_peace":"🕊️","rabbit2":"🐇","raccoon":"🦝","skunk":"🦨","badger":"🦡","beaver":"🦫","otter":"🦦","sloth":"🦥","mouse2":"🐁","rat":"🐀","chipmunk":"🐿️","hedgehog":"🦔","feet":"🐾","paw_prints":"🐾","dragon":"🐉","dragon_face":"🐲","cactus":"🌵","christmas_tree":"🎄","evergreen_tree":"🌲","deciduous_tree":"🌳","palm_tree":"🌴","seedling":"🌱","herb":"🌿","shamrock":"☘️","four_leaf_clover":"🍀","bamboo":"🎍","tanabata_tree":"🎋","leaves":"🍃","fallen_leaf":"🍂","maple_leaf":"🍁","empty_nest":"🪹","nest_with_eggs":"🪺","mushroom":"🍄","shell":"🐚","coral":"🪸","rock":"🪨","wood":"🪵","ear_of_rice":"🌾","potted_plant":"🪴","bouquet":"💐","tulip":"🌷","rose":"🌹","wilted_rose":"🥀","wilted_flower":"🥀","lotus":"🪷","hibiscus":"🌺","cherry_blossom":"🌸","blossom":"🌼","sunflower":"🌻","sun_with_face":"🌞","full_moon_with_face":"🌝","first_quarter_moon_with_face":"🌛","last_quarter_moon_with_face":"🌜","new_moon_with_face":"🌚","full_moon":"🌕","waning_gibbous_moon":"🌖","last_quarter_moon":"🌗","waning_crescent_moon":"🌘","new_moon":"🌑","waxing_crescent_moon":"🌒","first_quarter_moon":"🌓","waxing_gibbous_moon":"🌔","crescent_moon":"🌙","earth_americas":"🌎","earth_africa":"🌍","earth_asia":"🌏","ringed_planet":"🪐","dizzy":"💫","star":"⭐","star2":"🌟","sparkles":"✨","zap":"⚡","comet":"☄️","boom":"💥","fire":"🔥","flame":"🔥","cloud_tornado":"🌪️","cloud_with_tornado":"🌪️","rainbow":"🌈","sunny":"☀️","white_sun_small_cloud":"🌤️","white_sun_with_small_cloud":"🌤️","partly_sunny":"⛅","white_sun_cloud":"🌥️","white_sun_behind_cloud":"🌥️","cloud":"☁️","white_sun_rain_cloud":"🌦️","white_sun_behind_cloud_with_rain":"🌦️","cloud_rain":"🌧️","cloud_with_rain":"🌧️","thunder_cloud_rain":"⛈️","thunder_cloud_and_rain":"⛈️","cloud_lightning":"🌩️","cloud_with_lightning":"🌩️","cloud_snow":"🌨️","cloud_with_snow":"🌨️","snowflake":"❄️","snowman2":"☃️","snowman":"⛄","wind_blowing_face":"🌬️","dash":"💨","droplet":"💧","sweat_drops":"💦","bubbles":"🫧","umbrella":"☔","umbrella2":"☂️","ocean":"🌊","fog":"🌫️","green_apple":"🍏","apple":"🍎","pear":"🍐","tangerine":"🍊","lemon":"🍋","banana":"🍌","watermelon":"🍉","grapes":"🍇","blueberries":"🫐","strawberry":"🍓","melon":"🍈","cherries":"🍒","peach":"🍑","mango":"🥭","pineapple":"🍍","coconut":"🥥","kiwi":"🥝","kiwifruit":"🥝","tomato":"🍅","eggplant":"🍆","avocado":"🥑","olive":"🫒","broccoli":"🥦","leafy_green":"🥬","bell_pepper":"🫑","cucumber":"🥒","hot_pepper":"🌶️","corn":"🌽","carrot":"🥕","garlic":"🧄","onion":"🧅","potato":"🥔","sweet_potato":"🍠","croissant":"🥐","bagel":"🥯","bread":"🍞","french_bread":"🥖","baguette_bread":"🥖","flatbread":"🫓","pretzel":"🥨","cheese":"🧀","cheese_wedge":"🧀","egg":"🥚","cooking":"🍳","butter":"🧈","pancakes":"🥞","waffle":"🧇","bacon":"🥓","cut_of_meat":"🥩","poultry_leg":"🍗","meat_on_bone":"🍖","bone":"🦴","hotdog":"🌭","hot_dog":"🌭","hamburger":"🍔","fries":"🍟","pizza":"🍕","sandwich":"🥪","stuffed_flatbread":"🥙","stuffed_pita":"🥙","falafel":"🧆","taco":"🌮","burrito":"🌯","tamale":"🫔","salad":"🥗","green_salad":"🥗","shallow_pan_of_food":"🥘","paella":"🥘","fondue":"🫕","canned_food":"🥫","jar":"🫙","spaghetti":"🍝","ramen":"🍜","stew":"🍲","curry":"🍛","sushi":"🍣","bento":"🍱","dumpling":"🥟","oyster":"🦪","fried_shrimp":"🍤","rice_ball":"🍙","rice":"🍚","rice_cracker":"🍘","fish_cake":"🍥","fortune_cookie":"🥠","moon_cake":"🥮","oden":"🍢","dango":"🍡","shaved_ice":"🍧","ice_cream":"🍨","icecream":"🍦","pie":"🥧","cupcake":"🧁","cake":"🍰","birthday":"🎂","custard":"🍮","pudding":"🍮","flan":"🍮","lollipop":"🍭","candy":"🍬","chocolate_bar":"🍫","popcorn":"🍿","doughnut":"🍩","cookie":"🍪","chestnut":"🌰","peanuts":"🥜","shelled_peanut":"🥜","beans":"🫘","honey_pot":"🍯","milk":"🥛","glass_of_milk":"🥛","pouring_liquid":"🫗","baby_bottle":"🍼","teapot":"🫖","coffee":"☕","tea":"🍵","mate":"🧉","beverage_box":"🧃","cup_with_straw":"🥤","bubble_tea":"🧋","sake":"🍶","beer":"🍺","beers":"🍻","champagne_glass":"🥂","clinking_glass":"🥂","wine_glass":"🍷","tumbler_glass":"🥃","whisky":"🥃","cocktail":"🍸","tropical_drink":"🍹","champagne":"🍾","bottle_with_popping_cork":"🍾","ice_cube":"🧊","spoon":"🥄","fork_and_knife":"🍴","fork_knife_plate":"🍽️","fork_and_knife_with_plate":"🍽️","bowl_with_spoon":"🥣","takeout_box":"🥡","chopsticks":"🥢","salt":"🧂","soccer":"⚽","basketball":"🏀","football":"🏈","baseball":"⚾","softball":"🥎","tennis":"🎾","volleyball":"🏐","rugby_football":"🏉","flying_disc":"🥏","8ball":"🎱","yo_yo":"🪀","ping_pong":"🏓","table_tennis":"🏓","badminton":"🏸","hockey":"🏒","field_hockey":"🏑","lacrosse":"🥍","cricket_game":"🏏","cricket_bat_ball":"🏏","boomerang":"🪃","goal":"🥅","goal_net":"🥅","golf":"⛳","kite":"🪁","playground_slide":"🛝","bow_and_arrow":"🏹","archery":"🏹","fishing_pole_and_fish":"🎣","diving_mask":"🤿","boxing_glove":"🥊","boxing_gloves":"🥊","martial_arts_uniform":"🥋","karate_uniform":"🥋","running_shirt_with_sash":"🎽","skateboard":"🛹","roller_skate":"🛼","sled":"🛷","ice_skate":"⛸️","curling_stone":"🥌","ski":"🎿","skier":"⛷️","snowboarder":"🏂","parachute":"🪂","person_lifting_weights":"🏋️","lifter":"🏋️","weight_lifter":"🏋️","woman_lifting_weights":"🏋️‍♀️","man_lifting_weights":"🏋️‍♂️","people_wrestling":"🤼","wrestlers":"🤼","wrestling":"🤼","women_wrestling":"🤼‍♀️","men_wrestling":"🤼‍♂️","person_doing_cartwheel":"🤸","cartwheel":"🤸","woman_cartwheeling":"🤸‍♀️","man_cartwheeling":"🤸‍♂️","person_bouncing_ball":"⛹️","basketball_player":"⛹️","person_with_ball":"⛹️","woman_bouncing_ball":"⛹️‍♀️","man_bouncing_ball":"⛹️‍♂️","person_fencing":"🤺","fencer":"🤺","fencing":"🤺","person_playing_handball":"🤾","handball":"🤾","woman_playing_handball":"🤾‍♀️","man_playing_handball":"🤾‍♂️","person_golfing":"🏌️","golfer":"🏌️","woman_golfing":"🏌️‍♀️","man_golfing":"🏌️‍♂️","horse_racing":"🏇","person_in_lotus_position":"🧘","woman_in_lotus_position":"🧘‍♀️","man_in_lotus_position":"🧘‍♂️","person_surfing":"🏄","surfer":"🏄","woman_surfing":"🏄‍♀️","man_surfing":"🏄‍♂️","person_swimming":"🏊","swimmer":"🏊","woman_swimming":"🏊‍♀️","man_swimming":"🏊‍♂️","person_playing_water_polo":"🤽","water_polo":"🤽","woman_playing_water_polo":"🤽‍♀️","man_playing_water_polo":"🤽‍♂️","person_rowing_boat":"🚣","rowboat":"🚣","woman_rowing_boat":"🚣‍♀️","man_rowing_boat":"🚣‍♂️","person_climbing":"🧗","woman_climbing":"🧗‍♀️","man_climbing":"🧗‍♂️","person_mountain_biking":"🚵","mountain_bicyclist":"🚵","woman_mountain_biking":"🚵‍♀️","man_mountain_biking":"🚵‍♂️","person_biking":"🚴","bicyclist":"🚴","woman_biking":"🚴‍♀️","man_biking":"🚴‍♂️","trophy":"🏆","first_place":"🥇","first_place_medal":"🥇","second_place":"🥈","second_place_medal":"🥈","third_place":"🥉","third_place_medal":"🥉","medal":"🏅","sports_medal":"🏅","military_medal":"🎖️","rosette":"🏵️","reminder_ribbon":"🎗️","ticket":"🎫","tickets":"🎟️","admission_tickets":"🎟️","circus_tent":"🎪","person_juggling":"🤹","juggling":"🤹","juggler":"🤹","woman_juggling":"🤹‍♀️","man_juggling":"🤹‍♂️","performing_arts":"🎭","ballet_shoes":"🩰","art":"🎨","clapper":"🎬","microphone":"🎤","headphones":"🎧","musical_score":"🎼","musical_keyboard":"🎹","drum":"🥁","drum_with_drumsticks":"🥁","long_drum":"🪘","saxophone":"🎷","trumpet":"🎺","accordion":"🪗","guitar":"🎸","banjo":"🪕","violin":"🎻","game_die":"🎲","chess_pawn":"♟️","dart":"🎯","bowling":"🎳","video_game":"🎮","slot_machine":"🎰","jigsaw":"🧩","red_car":"🚗","taxi":"🚕","blue_car":"🚙","pickup_truck":"🛻","bus":"🚌","trolleybus":"🚎","race_car":"🏎️","racing_car":"🏎️","police_car":"🚓","ambulance":"🚑","fire_engine":"🚒","minibus":"🚐","truck":"🚚","articulated_lorry":"🚛","tractor":"🚜","probing_cane":"🦯","crutch":"🩼","manual_wheelchair":"🦽","motorized_wheelchair":"🦼","scooter":"🛴","bike":"🚲","motor_scooter":"🛵","motorbike":"🛵","motorcycle":"🏍️","racing_motorcycle":"🏍️","auto_rickshaw":"🛺","wheel":"🛞","rotating_light":"🚨","oncoming_police_car":"🚔","oncoming_bus":"🚍","oncoming_automobile":"🚘","oncoming_taxi":"🚖","aerial_tramway":"🚡","mountain_cableway":"🚠","suspension_railway":"🚟","railway_car":"🚃","train":"🚋","mountain_railway":"🚞","monorail":"🚝","bullettrain_side":"🚄","bullettrain_front":"🚅","light_rail":"🚈","steam_locomotive":"🚂","train2":"🚆","metro":"🚇","tram":"🚊","station":"🚉","airplane":"✈️","airplane_departure":"🛫","airplane_arriving":"🛬","airplane_small":"🛩️","small_airplane":"🛩️","seat":"💺","satellite_orbital":"🛰️","rocket":"🚀","flying_saucer":"🛸","helicopter":"🚁","canoe":"🛶","kayak":"🛶","sailboat":"⛵","speedboat":"🚤","motorboat":"🛥️","cruise_ship":"🛳️","passenger_ship":"🛳️","ferry":"⛴️","ship":"🚢","ring_buoy":"🛟","anchor":"⚓","hook":"🪝","fuelpump":"⛽","construction":"🚧","vertical_traffic_light":"🚦","traffic_light":"🚥","busstop":"🚏","map":"🗺️","world_map":"🗺️","moyai":"🗿","statue_of_liberty":"🗽","tokyo_tower":"🗼","european_castle":"🏰","japanese_castle":"🏯","stadium":"🏟️","ferris_wheel":"🎡","roller_coaster":"🎢","carousel_horse":"🎠","fountain":"⛲","beach_umbrella":"⛱️","umbrella_on_ground":"⛱️","beach":"🏖️","beach_with_umbrella":"🏖️","island":"🏝️","desert_island":"🏝️","desert":"🏜️","volcano":"🌋","mountain":"⛰️","mountain_snow":"🏔️","snow_capped_mountain":"🏔️","mount_fuji":"🗻","camping":"🏕️","tent":"⛺","house":"🏠","house_with_garden":"🏡","homes":"🏘️","house_buildings":"🏘️","house_abandoned":"🏚️","derelict_house_building":"🏚️","hut":"🛖","construction_site":"🏗️","building_construction":"🏗️","factory":"🏭","office":"🏢","department_store":"🏬","post_office":"🏣","european_post_office":"🏤","hospital":"🏥","bank":"🏦","hotel":"🏨","convenience_store":"🏪","school":"🏫","love_hotel":"🏩","wedding":"💒","classical_building":"🏛️","church":"⛪","mosque":"🕌","synagogue":"🕍","hindu_temple":"🛕","kaaba":"🕋","shinto_shrine":"⛩️","railway_track":"🛤️","railroad_track":"🛤️","motorway":"🛣️","japan":"🗾","rice_scene":"🎑","park":"🏞️","national_park":"🏞️","sunrise":"🌅","sunrise_over_mountains":"🌄","stars":"🌠","sparkler":"🎇","fireworks":"🎆","city_sunset":"🌇","city_sunrise":"🌇","city_dusk":"🌆","cityscape":"🏙️","night_with_stars":"🌃","milky_way":"🌌","bridge_at_night":"🌉","foggy":"🌁","watch":"⌚","mobile_phone":"📱","iphone":"📱","calling":"📲","computer":"💻","keyboard":"⌨️","desktop":"🖥️","desktop_computer":"🖥️","printer":"🖨️","mouse_three_button":"🖱️","three_button_mouse":"🖱️","trackball":"🖲️","joystick":"🕹️","compression":"🗜️","minidisc":"💽","floppy_disk":"💾","cd":"💿","dvd":"📀","vhs":"📼","camera":"📷","camera_with_flash":"📸","video_camera":"📹","movie_camera":"🎥","projector":"📽️","film_projector":"📽️","film_frames":"🎞️","telephone_receiver":"📞","telephone":"☎️","pager":"📟","fax":"📠","tv":"📺","radio":"📻","microphone2":"🎙️","studio_microphone":"🎙️","level_slider":"🎚️","control_knobs":"🎛️","compass":"🧭","stopwatch":"⏱️","timer":"⏲️","timer_clock":"⏲️","alarm_clock":"⏰","clock":"🕰️","mantlepiece_clock":"🕰️","hourglass":"⌛","hourglass_flowing_sand":"⏳","satellite":"📡","battery":"🔋","low_battery":"🪫","electric_plug":"🔌","bulb":"💡","flashlight":"🔦","candle":"🕯️","diya_lamp":"🪔","fire_extinguisher":"🧯","oil":"🛢️","oil_drum":"🛢️","money_with_wings":"💸","dollar":"💵","yen":"💴","euro":"💶","pound":"💷","coin":"🪙","moneybag":"💰","credit_card":"💳","identification_card":"🪪","gem":"💎","scales":"⚖️","ladder":"🪜","toolbox":"🧰","screwdriver":"🪛","wrench":"🔧","hammer":"🔨","hammer_pick":"⚒️","hammer_and_pick":"⚒️","tools":"🛠️","hammer_and_wrench":"🛠️","pick":"⛏️","carpentry_saw":"🪚","nut_and_bolt":"🔩","gear":"⚙️","mouse_trap":"🪤","bricks":"🧱","chains":"⛓️","magnet":"🧲","gun":"🔫","bomb":"💣","firecracker":"🧨","axe":"🪓","knife":"🔪","dagger":"🗡️","dagger_knife":"🗡️","crossed_swords":"⚔️","shield":"🛡️","smoking":"🚬","coffin":"⚰️","headstone":"🪦","urn":"⚱️","funeral_urn":"⚱️","amphora":"🏺","crystal_ball":"🔮","prayer_beads":"📿","nazar_amulet":"🧿","hamsa":"🪬","barber":"💈","alembic":"⚗️","telescope":"🔭","microscope":"🔬","hole":"🕳️","x_ray":"🩻","adhesive_bandage":"🩹","stethoscope":"🩺","pill":"💊","syringe":"💉","drop_of_blood":"🩸","dna":"🧬","microbe":"🦠","petri_dish":"🧫","test_tube":"🧪","thermometer":"🌡️","broom":"🧹","plunger":"🪠","basket":"🧺","roll_of_paper":"🧻","toilet":"🚽","potable_water":"🚰","shower":"🚿","bathtub":"🛁","bath":"🛀","soap":"🧼","toothbrush":"🪥","razor":"🪒","sponge":"🧽","bucket":"🪣","squeeze_bottle":"🧴","bellhop":"🛎️","bellhop_bell":"🛎️","key":"🔑","key2":"🗝️","old_key":"🗝️","door":"🚪","chair":"🪑","couch":"🛋️","couch_and_lamp":"🛋️","bed":"🛏️","sleeping_accommodation":"🛌","teddy_bear":"🧸","nesting_dolls":"🪆","frame_photo":"🖼️","frame_with_picture":"🖼️","mirror":"🪞","window":"🪟","shopping_bags":"🛍️","shopping_cart":"🛒","shopping_trolley":"🛒","gift":"🎁","balloon":"🎈","flags":"🎏","ribbon":"🎀","magic_wand":"🪄","piñata":"🪅","confetti_ball":"🎊","tada":"🎉","dolls":"🎎","izakaya_lantern":"🏮","wind_chime":"🎐","mirror_ball":"🪩","red_envelope":"🧧","envelope":"✉️","envelope_with_arrow":"📩","incoming_envelope":"📨","e_mail":"📧","email":"📧","love_letter":"💌","inbox_tray":"📥","outbox_tray":"📤","package":"📦","label":"🏷️","placard":"🪧","mailbox_closed":"📪","mailbox":"📫","mailbox_with_mail":"📬","mailbox_with_no_mail":"📭","postbox":"📮","postal_horn":"📯","scroll":"📜","page_with_curl":"📃","page_facing_up":"📄","bookmark_tabs":"📑","receipt":"🧾","bar_chart":"📊","chart_with_upwards_trend":"📈","chart_with_downwards_trend":"📉","notepad_spiral":"🗒️","spiral_note_pad":"🗒️","calendar_spiral":"🗓️","spiral_calendar_pad":"🗓️","calendar":"📆","date":"📅","wastebasket":"🗑️","card_index":"📇","card_box":"🗃️","card_file_box":"🗃️","ballot_box":"🗳️","ballot_box_with_ballot":"🗳️","file_cabinet":"🗄️","clipboard":"📋","file_folder":"📁","open_file_folder":"📂","dividers":"🗂️","card_index_dividers":"🗂️","newspaper2":"🗞️","rolled_up_newspaper":"🗞️","newspaper":"📰","notebook":"📓","notebook_with_decorative_cover":"📔","ledger":"📒","closed_book":"📕","green_book":"📗","blue_book":"📘","orange_book":"📙","books":"📚","book":"📖","bookmark":"🔖","safety_pin":"🧷","link":"🔗","paperclip":"📎","paperclips":"🖇️","linked_paperclips":"🖇️","triangular_ruler":"📐","straight_ruler":"📏","abacus":"🧮","pushpin":"📌","round_pushpin":"📍","scissors":"✂️","pen_ballpoint":"🖊️","lower_left_ballpoint_pen":"🖊️","pen_fountain":"🖋️","lower_left_fountain_pen":"🖋️","black_nib":"✒️","paintbrush":"🖌️","lower_left_paintbrush":"🖌️","crayon":"🖍️","lower_left_crayon":"🖍️","pencil":"📝","memo":"📝","pencil2":"✏️","mag":"🔍","mag_right":"🔎","lock_with_ink_pen":"🔏","closed_lock_with_key":"🔐","lock":"🔒","unlock":"🔓","heart":"❤️","orange_heart":"🧡","yellow_heart":"💛","green_heart":"💚","blue_heart":"💙","purple_heart":"💜","black_heart":"🖤","brown_heart":"🤎","white_heart":"🤍","broken_heart":"💔","heart_exclamation":"❣️","heavy_heart_exclamation_mark_ornament":"❣️","two_hearts":"💕","revolving_hearts":"💞","heartbeat":"💓","heartpulse":"💗","sparkling_heart":"💖","cupid":"💘","gift_heart":"💝","mending_heart":"❤️‍🩹","heart_on_fire":"❤️‍🔥","heart_decoration":"💟","peace":"☮️","peace_symbol":"☮️","cross":"✝️","latin_cross":"✝️","star_and_crescent":"☪️","om_symbol":"🕉️","wheel_of_dharma":"☸️","star_of_david":"✡️","six_pointed_star":"🔯","menorah":"🕎","yin_yang":"☯️","orthodox_cross":"☦️","place_of_worship":"🛐","worship_symbol":"🛐","ophiuchus":"⛎","aries":"♈","taurus":"♉","gemini":"♊","cancer":"♋","leo":"♌","virgo":"♍","libra":"♎","scorpius":"♏","sagittarius":"♐","capricorn":"♑","aquarius":"♒","pisces":"♓","id":"🆔","atom":"⚛️","atom_symbol":"⚛️","accept":"🉑","radioactive":"☢️","radioactive_sign":"☢️","biohazard":"☣️","biohazard_sign":"☣️","mobile_phone_off":"📴","vibration_mode":"📳","u6709":"🈶","u7121":"🈚","u7533":"🈸","u55b6":"🈺","u6708":"🈷️","eight_pointed_black_star":"✴️","vs":"🆚","white_flower":"💮","ideograph_advantage":"🉐","secret":"㊙️","congratulations":"㊗️","u5408":"🈴","u6e80":"🈵","u5272":"🈹","u7981":"🈲","a":"🅰️","b":"🅱️","ab":"🆎","cl":"🆑","o2":"🅾️","sos":"🆘","x":"❌","o":"⭕","octagonal_sign":"🛑","stop_sign":"🛑","no_entry":"⛔","name_badge":"📛","no_entry_sign":"🚫","100":"💯","anger":"💢","hotsprings":"♨️","no_pedestrians":"🚷","do_not_litter":"🚯","no_bicycles":"🚳","non_potable_water":"🚱","underage":"🔞","no_mobile_phones":"📵","no_smoking":"🚭","exclamation":"❗","grey_exclamation":"❕","question":"❓","grey_question":"❔","bangbang":"‼️","interrobang":"⁉️","low_brightness":"🔅","high_brightness":"🔆","part_alternation_mark":"〽️","warning":"⚠️","children_crossing":"🚸","trident":"🔱","fleur_de_lis":"⚜️","beginner":"🔰","recycle":"♻️","white_check_mark":"✅","u6307":"🈯","chart":"💹","sparkle":"❇️","eight_spoked_asterisk":"✳️","negative_squared_cross_mark":"❎","globe_with_meridians":"🌐","diamond_shape_with_a_dot_inside":"💠","m":"Ⓜ️","cyclone":"🌀","zzz":"💤","atm":"🏧","wc":"🚾","wheelchair":"♿","parking":"🅿️","u7a7a":"🈳","sa":"🈂️","passport_control":"🛂","customs":"🛃","baggage_claim":"🛄","left_luggage":"🛅","elevator":"🛗","mens":"🚹","womens":"🚺","baby_symbol":"🚼","restroom":"🚻","put_litter_in_its_place":"🚮","cinema":"🎦","signal_strength":"📶","koko":"🈁","symbols":"🔣","information_source":"ℹ️","abc":"🔤","abcd":"🔡","capital_abcd":"🔠","ng":"🆖","ok":"🆗","up":"🆙","cool":"🆒","new":"🆕","free":"🆓","zero":"0️⃣","one":"1️⃣","two":"2️⃣","three":"3️⃣","four":"4️⃣","five":"5️⃣","six":"6️⃣","seven":"7️⃣","eight":"8️⃣","nine":"9️⃣","keycap_ten":"🔟","1234":"🔢","hash":"#️⃣","asterisk":"*️⃣","keycap_asterisk":"*️⃣","eject":"⏏️","eject_symbol":"⏏️","arrow_forward":"▶️","pause_button":"⏸️","double_vertical_bar":"⏸️","play_pause":"⏯️","stop_button":"⏹️","record_button":"⏺️","track_next":"⏭️","next_track":"⏭️","track_previous":"⏮️","previous_track":"⏮️","fast_forward":"⏩","rewind":"⏪","arrow_double_up":"⏫","arrow_double_down":"⏬","arrow_backward":"◀️","arrow_up_small":"🔼","arrow_down_small":"🔽","arrow_right":"➡️","arrow_left":"⬅️","arrow_up":"⬆️","arrow_down":"⬇️","arrow_upper_right":"↗️","arrow_lower_right":"↘️","arrow_lower_left":"↙️","arrow_upper_left":"↖️","arrow_up_down":"↕️","left_right_arrow":"↔️","arrow_right_hook":"↪️","leftwards_arrow_with_hook":"↩️","arrow_heading_up":"⤴️","arrow_heading_down":"⤵️","twisted_rightwards_arrows":"🔀","repeat":"🔁","repeat_one":"🔂","arrows_counterclockwise":"🔄","arrows_clockwise":"🔃","musical_note":"🎵","notes":"🎶","heavy_plus_sign":"➕","heavy_minus_sign":"➖","heavy_division_sign":"➗","heavy_multiplication_x":"✖️","heavy_equals_sign":"🟰","infinity":"♾️","heavy_dollar_sign":"💲","currency_exchange":"💱","tm":"™️","copyright":"©️","registered":"®️","wavy_dash":"〰️","curly_loop":"➰","loop":"➿","end":"🔚","back":"🔙","on":"🔛","top":"🔝","soon":"🔜","heavy_check_mark":"✔️","ballot_box_with_check":"☑️","radio_button":"🔘","white_circle":"⚪","black_circle":"⚫","red_circle":"🔴","blue_circle":"🔵","brown_circle":"🟤","purple_circle":"🟣","green_circle":"🟢","yellow_circle":"🟡","orange_circle":"🟠","small_red_triangle":"🔺","small_red_triangle_down":"🔻","small_orange_diamond":"🔸","small_blue_diamond":"🔹","large_orange_diamond":"🔶","large_blue_diamond":"🔷","white_square_button":"🔳","black_square_button":"🔲","black_small_square":"▪️","white_small_square":"▫️","black_medium_small_square":"◾","white_medium_small_square":"◽","black_medium_square":"◼️","white_medium_square":"◻️","black_large_square":"⬛","white_large_square":"⬜","orange_square":"🟧","blue_square":"🟦","red_square":"🟥","brown_square":"🟫","purple_square":"🟪","green_square":"🟩","yellow_square":"🟨","speaker":"🔈","mute":"🔇","sound":"🔉","loud_sound":"🔊","bell":"🔔","no_bell":"🔕","mega":"📣","loudspeaker":"📢","speech_left":"🗨️","left_speech_bubble":"🗨️","eye_in_speech_bubble":"👁‍🗨","speech_balloon":"💬","thought_balloon":"💭","anger_right":"🗯️","right_anger_bubble":"🗯️","spades":"♠️","clubs":"♣️","hearts":"♥️","diamonds":"♦️","black_joker":"🃏","flower_playing_cards":"🎴","mahjong":"🀄","clock1":"🕐","clock2":"🕑","clock3":"🕒","clock4":"🕓","clock5":"🕔","clock6":"🕕","clock7":"🕖","clock8":"🕗","clock9":"🕘","clock10":"🕙","clock11":"🕚","clock12":"🕛","clock130":"🕜","clock230":"🕝","clock330":"🕞","clock430":"🕟","clock530":"🕠","clock630":"🕡","clock730":"🕢","clock830":"🕣","clock930":"🕤","clock1030":"🕥","clock1130":"🕦","clock1230":"🕧","female_sign":"♀️","male_sign":"♂️","transgender_symbol":"⚧","medical_symbol":"⚕️","regional_indicator_z":"🇿","regional_indicator_y":"🇾","regional_indicator_x":"🇽","regional_indicator_w":"🇼","regional_indicator_v":"🇻","regional_indicator_u":"🇺","regional_indicator_t":"🇹","regional_indicator_s":"🇸","regional_indicator_r":"🇷","regional_indicator_q":"🇶","regional_indicator_p":"🇵","regional_indicator_o":"🇴","regional_indicator_n":"🇳","regional_indicator_m":"🇲","regional_indicator_l":"🇱","regional_indicator_k":"🇰","regional_indicator_j":"🇯","regional_indicator_i":"🇮","regional_indicator_h":"🇭","regional_indicator_g":"🇬","regional_indicator_f":"🇫","regional_indicator_e":"🇪","regional_indicator_d":"🇩","regional_indicator_c":"🇨","regional_indicator_b":"🇧","regional_indicator_a":"🇦","flag_white":"🏳️","flag_black":"🏴","checkered_flag":"🏁","triangular_flag_on_post":"🚩","rainbow_flag":"🏳️‍🌈","gay_pride_flag":"🏳️‍🌈","transgender_flag":"🏳️‍⚧️","pirate_flag":"🏴‍☠️","flag_af":"🇦🇫","flag_ax":"🇦🇽","flag_al":"🇦🇱","flag_dz":"🇩🇿","flag_as":"🇦🇸","flag_ad":"🇦🇩","flag_ao":"🇦🇴","flag_ai":"🇦🇮","flag_aq":"🇦🇶","flag_ag":"🇦🇬","flag_ar":"🇦🇷","flag_am":"🇦🇲","flag_aw":"🇦🇼","flag_au":"🇦🇺","flag_at":"🇦🇹","flag_az":"🇦🇿","flag_bs":"🇧🇸","flag_bh":"🇧🇭","flag_bd":"🇧🇩","flag_bb":"🇧🇧","flag_by":"🇧🇾","flag_be":"🇧🇪","flag_bz":"🇧🇿","flag_bj":"🇧🇯","flag_bm":"🇧🇲","flag_bt":"🇧🇹","flag_bo":"🇧🇴","flag_ba":"🇧🇦","flag_bw":"🇧🇼","flag_br":"🇧🇷","flag_io":"🇮🇴","flag_vg":"🇻🇬","flag_bn":"🇧🇳","flag_bg":"🇧🇬","flag_bf":"🇧🇫","flag_bi":"🇧🇮","flag_kh":"🇰🇭","flag_cm":"🇨🇲","flag_ca":"🇨🇦","flag_ic":"🇮🇨","flag_cv":"🇨🇻","flag_bq":"🇧🇶","flag_ky":"🇰🇾","flag_cf":"🇨🇫","flag_td":"🇹🇩","flag_cl":"🇨🇱","flag_cn":"🇨🇳","flag_cx":"🇨🇽","flag_cc":"🇨🇨","flag_co":"🇨🇴","flag_km":"🇰🇲","flag_cg":"🇨🇬","flag_cd":"🇨🇩","flag_ck":"🇨🇰","flag_cr":"🇨🇷","flag_ci":"🇨🇮","flag_hr":"🇭🇷","flag_cu":"🇨🇺","flag_cw":"🇨🇼","flag_cy":"🇨🇾","flag_cz":"🇨🇿","flag_dk":"🇩🇰","flag_dj":"🇩🇯","flag_dm":"🇩🇲","flag_do":"🇩🇴","flag_ec":"🇪🇨","flag_eg":"🇪🇬","flag_sv":"🇸🇻","flag_gq":"🇬🇶","flag_er":"🇪🇷","flag_ee":"🇪🇪","flag_et":"🇪🇹","flag_eu":"🇪🇺","flag_fk":"🇫🇰","flag_fo":"🇫🇴","flag_fj":"🇫🇯","flag_fi":"🇫🇮","flag_fr":"🇫🇷","flag_gf":"🇬🇫","flag_pf":"🇵🇫","flag_tf":"🇹🇫","flag_ga":"🇬🇦","flag_gm":"🇬🇲","flag_ge":"🇬🇪","flag_de":"🇩🇪","flag_gh":"🇬🇭","flag_gi":"🇬🇮","flag_gr":"🇬🇷","flag_gl":"🇬🇱","flag_gd":"🇬🇩","flag_gp":"🇬🇵","flag_gu":"🇬🇺","flag_gt":"🇬🇹","flag_gg":"🇬🇬","flag_gn":"🇬🇳","flag_gw":"🇬🇼","flag_gy":"🇬🇾","flag_ht":"🇭🇹","flag_hn":"🇭🇳","flag_hk":"🇭🇰","flag_hu":"🇭🇺","flag_is":"🇮🇸","flag_in":"🇮🇳","flag_id":"🇮🇩","flag_ir":"🇮🇷","flag_iq":"🇮🇶","flag_ie":"🇮🇪","flag_im":"🇮🇲","flag_il":"🇮🇱","flag_it":"🇮🇹","flag_jm":"🇯🇲","flag_jp":"🇯🇵","crossed_flags":"🎌","flag_je":"🇯🇪","flag_jo":"🇯🇴","flag_kz":"🇰🇿","flag_ke":"🇰🇪","flag_ki":"🇰🇮","flag_xk":"🇽🇰","flag_kw":"🇰🇼","flag_kg":"🇰🇬","flag_la":"🇱🇦","flag_lv":"🇱🇻","flag_lb":"🇱🇧","flag_ls":"🇱🇸","flag_lr":"🇱🇷","flag_ly":"🇱🇾","flag_li":"🇱🇮","flag_lt":"🇱🇹","flag_lu":"🇱🇺","flag_mo":"🇲🇴","flag_mk":"🇲🇰","flag_mg":"🇲🇬","flag_mw":"🇲🇼","flag_my":"🇲🇾","flag_mv":"🇲🇻","flag_ml":"🇲🇱","flag_mt":"🇲🇹","flag_mh":"🇲🇭","flag_mq":"🇲🇶","flag_mr":"🇲🇷","flag_mu":"🇲🇺","flag_yt":"🇾🇹","flag_mx":"🇲🇽","flag_fm":"🇫🇲","flag_md":"🇲🇩","flag_mc":"🇲🇨","flag_mn":"🇲🇳","flag_me":"🇲🇪","flag_ms":"🇲🇸","flag_ma":"🇲🇦","flag_mz":"🇲🇿","flag_mm":"🇲🇲","flag_na":"🇳🇦","flag_nr":"🇳🇷","flag_np":"🇳🇵","flag_nl":"🇳🇱","flag_nc":"🇳🇨","flag_nz":"🇳🇿","flag_ni":"🇳🇮","flag_ne":"🇳🇪","flag_ng":"🇳🇬","flag_nu":"🇳🇺","flag_nf":"🇳🇫","flag_kp":"🇰🇵","flag_mp":"🇲🇵","flag_no":"🇳🇴","flag_om":"🇴🇲","flag_pk":"🇵🇰","flag_pw":"🇵🇼","flag_ps":"🇵🇸","flag_pa":"🇵🇦","flag_pg":"🇵🇬","flag_py":"🇵🇾","flag_pe":"🇵🇪","flag_ph":"🇵🇭","flag_pn":"🇵🇳","flag_pl":"🇵🇱","flag_pt":"🇵🇹","flag_pr":"🇵🇷","flag_qa":"🇶🇦","flag_re":"🇷🇪","flag_ro":"🇷🇴","flag_ru":"🇷🇺","flag_rw":"🇷🇼","flag_ws":"🇼🇸","flag_sm":"🇸🇲","flag_st":"🇸🇹","flag_sa":"🇸🇦","flag_sn":"🇸🇳","flag_rs":"🇷🇸","flag_sc":"🇸🇨","flag_sl":"🇸🇱","flag_sg":"🇸🇬","flag_sx":"🇸🇽","flag_sk":"🇸🇰","flag_si":"🇸🇮","flag_gs":"🇬🇸","flag_sb":"🇸🇧","flag_so":"🇸🇴","flag_za":"🇿🇦","flag_kr":"🇰🇷","flag_ss":"🇸🇸","flag_es":"🇪🇸","flag_lk":"🇱🇰","flag_bl":"🇧🇱","flag_sh":"🇸🇭","flag_kn":"🇰🇳","flag_lc":"🇱🇨","flag_pm":"🇵🇲","flag_vc":"🇻🇨","flag_sd":"🇸🇩","flag_sr":"🇸🇷","flag_sz":"🇸🇿","flag_se":"🇸🇪","flag_ch":"🇨🇭","flag_sy":"🇸🇾","flag_tw":"🇹🇼","flag_tj":"🇹🇯","flag_tz":"🇹🇿","flag_th":"🇹🇭","flag_tl":"🇹🇱","flag_tg":"🇹🇬","flag_tk":"🇹🇰","flag_to":"🇹🇴","flag_tt":"🇹🇹","flag_tn":"🇹🇳","flag_tr":"🇹🇷","flag_tm":"🇹🇲","flag_tc":"🇹🇨","flag_vi":"🇻🇮","flag_tv":"🇹🇻","flag_ug":"🇺🇬","flag_ua":"🇺🇦","flag_ae":"🇦🇪","flag_gb":"🇬🇧","england":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","flag_us":"🇺🇸","flag_uy":"🇺🇾","flag_uz":"🇺🇿","flag_vu":"🇻🇺","flag_va":"🇻🇦","flag_ve":"🇻🇪","flag_vn":"🇻🇳","flag_wf":"🇼🇫","flag_eh":"🇪🇭","flag_ye":"🇾🇪","flag_zm":"🇿🇲","flag_zw":"🇿🇼","flag_ac":"🇦🇨","flag_bv":"🇧🇻","flag_cp":"🇨🇵","flag_ea":"🇪🇦","flag_dg":"🇩🇬","flag_hm":"🇭🇲","flag_mf":"🇲🇫","flag_sj":"🇸🇯","flag_ta":"🇹🇦","flag_um":"🇺🇲","united_nations":"🇺🇳",};