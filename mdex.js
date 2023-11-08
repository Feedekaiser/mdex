// refer to the bottom for details.

const tree_node = (type, value) => 
{
	return { type : type, value: value, children : [] };
}

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
					++i; tokens.push([`​${check_and_build((cc) => cc != 0x26)} ​`, "mtext"]); ++i; // zwsp at the end and start to make html render the space (if any) at end and start
					break;
				case 0x2A: // '*'
					tokens.push(["·", "mi"]);
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

	math_parse.render = (tokens, start = 0, end = tokens.length) =>
	{
		let children = [];

		const default_token_handle = (token) =>
			create_element_and_push(token[1], children).textContent = token[0];


		for (let i = start, current_token = tokens[i]; i < end; current_token = tokens[++i])
		{
			if (current_token[1] == "mtext") { default_token_handle(current_token); continue; }
			
			let arg_count = MATH_ARG_COUNT[current_token[0]];
			let next_token = tokens[i + 1] || [];

			if (arg_count && (next_token[0] == '('))
			{
				let element = create_element_and_push(MATH_FUNCTIONS[current_token[0]], children);
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
		
		let mrow = document.createElement("mrow");
		mrow.replaceChildren(...children);
		return mrow;
	};
}

const EMPTY_ARR = []; // do NOT touch this.
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

/* https://gist.github.com/cherryblossom000/195c9ee047b85493210bd4d689920899
let line = "";
for (let i = 0; i < $0.rows.length; ++i) 
{
	const key = $0.rows[i].cells[1].innerText;
	const value = $0.rows[i].cells[0].innerText;
	for (const k of key.split("\n")) line += (`${k}:"${value}",`);
}
console.log(line);
 */
const EMOJI_LIST = {angry:"😠",blush:"😊",broken_heart:"💔",confused:"😕",cry:"😢",frowning:"😦",heart:"❤️",imp:"👿",innocent:"😇",joy:"😂",kissing:"😗",laughing:"😆",neutral_face:"😐",open_mouth:"😮",rage:"😡",smile:"😄",smiling_face_with_tear:"🥲",slight_smile:"🙂",smiling_imp:"😈",sob:"😭",stuck_out_tongue:"😛",sunglasses:"😎",sweat:"😓",sweat_smile:"😅",unamused:"😒",wink:"😉",laughing:"😆",satisfied:"😆",rofl:"🤣",rolling_on_the_floor_laughing:"🤣",slight_smile:"🙂",slightly_smiling_face:"🙂",upside_down:"🙃",upside_down_face:"🙃",nerd:"🤓",nerd_face:"🤓",slight_frown:"🙁",slightly_frowning_face:"🙁",frowning2:"☹️",white_frowning_face:"☹️",hugging:"🤗",hugging_face:"🤗",thinking:"🤔",thinking_face:"🤔",lying_face:"🤥",liar:"🤥",rolling_eyes:"🙄",face_with_rolling_eyes:"🙄",drooling_face:"🤤",drool:"🤤",zipper_mouth:"🤐",zipper_mouth_face:"🤐",nauseated_face:"🤢",sick:"🤢",sneezing_face:"🤧",sneeze:"🤧",thermometer_face:"🤒",face_with_thermometer:"🤒",head_bandage:"🤕",face_with_head_bandage:"🤕",money_mouth:"🤑",money_mouth_face:"🤑",cowboy:"🤠",face_with_cowboy_hat:"🤠",clown:"🤡",clown_face:"🤡",poop:"💩",shit:"💩",hankey:"💩",poo:"💩",skull:"💀",skeleton:"💀",skull_crossbones:"☠️",skull_and_crossbones:"☠️",robot:"🤖",robot_face:"🤖",handshake:"🤝",shaking_hands:"🤝",thumbsup:"👍","+1":"👍",thumbup:"👍",thumbsdown:"👎","-1":"👎",thumbdown:"👎",left_facing_fist:"🤛",left_fist:"🤛",right_facing_fist:"🤜",right_fist:"🤜",fingers_crossed:"🤞",hand_with_index_and_middle_finger_crossed:"🤞",metal:"🤘",sign_of_the_horns:"🤘",raised_back_of_hand:"🤚",back_of_hand:"🤚",hand_splayed:"🖐️",raised_hand_with_fingers_splayed:"🖐️",vulcan:"🖖",raised_hand_with_part_between_middle_and_ring_fingers:"🖖",call_me:"🤙",call_me_hand:"🤙",middle_finger:"🖕",reversed_hand_with_middle_finger_extended:"🖕",speaking_head:"🗣️",speaking_head_in_silhouette:"🗣️",blond_haired_person:"👱",person_with_blond_hair:"👱",older_woman:"👵",grandma:"👵",man_with_chinese_cap:"👲",man_with_gua_pi_mao:"👲",person_wearing_turban:"👳",man_with_turban:"👳",police_officer:"👮",cop:"👮",guard:"💂",guardsman:"💂",detective:"🕵️",spy:"🕵️",sleuth_or_spy:"🕵️",woman_with_veil:"👰‍♀️",bride_with_veil:"👰‍♀️",mrs_claus:"🤶",mother_christmas:"🤶",pregnant_woman:"🤰",expecting_woman:"🤰",person_bowing:"🙇",bow:"🙇",person_tipping_hand:"💁",information_desk_person:"💁",person_gesturing_no:"🙅",no_good:"🙅",person_raising_hand:"🙋",raising_hand:"🙋",person_facepalming:"🤦",face_palm:"🤦",facepalm:"🤦",person_shrugging:"🤷",shrug:"🤷",person_pouting:"🙎",person_with_pouting_face:"🙎",person_getting_haircut:"💇",haircut:"💇",person_getting_massage:"💆",massage:"💆",man_dancing:"🕺",male_dancer:"🕺",people_with_bunny_ears_partying:"👯",dancers:"👯",levitate:"🕴️",man_in_business_suit_levitating:"🕴️",person_walking:"🚶",walking:"🚶",person_running:"🏃",runner:"🏃",couple_ww:"👩‍❤️‍👩",couple_with_heart_ww:"👩‍❤️‍👩",couple_mm:"👨‍❤️‍👨",couple_with_heart_mm:"👨‍❤️‍👨",kiss_ww:"👩‍❤️‍💋‍👩",couplekiss_ww:"👩‍❤️‍💋‍👩",kiss_mm:"👨‍❤️‍💋‍👨",couplekiss_mm:"👨‍❤️‍💋‍👨",helmet_with_cross:"⛑️",helmet_with_white_cross:"⛑️",kiwi:"🥝",kiwifruit:"🥝",french_bread:"🥖",baguette_bread:"🥖",cheese:"🧀",cheese_wedge:"🧀",hotdog:"🌭",hot_dog:"🌭",stuffed_flatbread:"🥙",stuffed_pita:"🥙",salad:"🥗",green_salad:"🥗",shallow_pan_of_food:"🥘",paella:"🥘",custard:"🍮",pudding:"🍮",flan:"🍮",peanuts:"🥜",shelled_peanut:"🥜",milk:"🥛",glass_of_milk:"🥛",champagne_glass:"🥂",clinking_glass:"🥂",tumbler_glass:"🥃",whisky:"🥃",champagne:"🍾",bottle_with_popping_cork:"🍾",fork_knife_plate:"🍽️",fork_and_knife_with_plate:"🍽️",heart_exclamation:"❣️",heavy_heart_exclamation_mark_ornament:"❣️",peace:"☮️",peace_symbol:"☮️",cross:"✝️",latin_cross:"✝️",place_of_worship:"🛐",worship_symbol:"🛐",atom:"⚛️",atom_symbol:"⚛️",radioactive:"☢️",radioactive_sign:"☢️",biohazard:"☣️",biohazard_sign:"☣️",octagonal_sign:"🛑",stop_sign:"🛑",asterisk:"*️⃣",keycap_asterisk:"*️⃣",eject:"⏏️",eject_symbol:"⏏️",pause_button:"⏸️",double_vertical_bar:"⏸️",track_next:"⏭️",next_track:"⏭️",track_previous:"⏮️",previous_track:"⏮️",speech_left:"🗨️",left_speech_bubble:"🗨️",anger_right:"🗯️",right_anger_bubble:"🗯️",mobile_phone:"📱",iphone:"📱",desktop:"🖥️",desktop_computer:"🖥️",mouse_three_button:"🖱️",three_button_mouse:"🖱️",projector:"📽️",film_projector:"📽️",microphone2:"🎙️",studio_microphone:"🎙️",timer:"⏲️",timer_clock:"⏲️",clock:"🕰️",mantlepiece_clock:"🕰️",oil:"🛢️",oil_drum:"🛢️",hammer_pick:"⚒️",hammer_and_pick:"⚒️",tools:"🛠️",hammer_and_wrench:"🛠️",dagger:"🗡️",dagger_knife:"🗡️",urn:"⚱️",funeral_urn:"⚱️",bellhop:"🛎️",bellhop_bell:"🛎️",key2:"🗝️",old_key:"🗝️",couch:"🛋️",couch_and_lamp:"🛋️",frame_photo:"🖼️",frame_with_picture:"🖼️",shopping_cart:"🛒",shopping_trolley:"🛒",e_mail:"📧",email:"📧",notepad_spiral:"🗒️",spiral_note_pad:"🗒️",calendar_spiral:"🗓️",spiral_calendar_pad:"🗓️",card_box:"🗃️",card_file_box:"🗃️",ballot_box:"🗳️",ballot_box_with_ballot:"🗳️",dividers:"🗂️",card_index_dividers:"🗂️",newspaper2:"🗞️",rolled_up_newspaper:"🗞️",paperclips:"🖇️",linked_paperclips:"🖇️",pen_ballpoint:"🖊️",lower_left_ballpoint_pen:"🖊️",pen_fountain:"🖋️",lower_left_fountain_pen:"🖋️",paintbrush:"🖌️",lower_left_paintbrush:"🖌️",crayon:"🖍️",lower_left_crayon:"🖍️",pencil:"📝",memo:"📝",ping_pong:"🏓",table_tennis:"🏓",cricket_game:"🏏",cricket_bat_ball:"🏏",goal:"🥅",goal_net:"🥅",bow_and_arrow:"🏹",archery:"🏹",boxing_glove:"🥊",boxing_gloves:"🥊",martial_arts_uniform:"🥋",karate_uniform:"🥋",person_lifting_weights:"🏋️",lifter:"🏋️",weight_lifter:"🏋️",people_wrestling:"🤼",wrestlers:"🤼",wrestling:"🤼",person_doing_cartwheel:"🤸",cartwheel:"🤸",person_bouncing_ball:"⛹️",basketball_player:"⛹️",person_with_ball:"⛹️",person_fencing:"🤺",fencer:"🤺",fencing:"🤺",person_playing_handball:"🤾",handball:"🤾",person_golfing:"🏌️",golfer:"🏌️",person_surfing:"🏄",surfer:"🏄",person_swimming:"🏊",swimmer:"🏊",person_playing_water_polo:"🤽",water_polo:"🤽",person_rowing_boat:"🚣",rowboat:"🚣",person_mountain_biking:"🚵",mountain_bicyclist:"🚵",person_biking:"🚴",bicyclist:"🚴",first_place:"🥇",first_place_medal:"🥇",second_place:"🥈",second_place_medal:"🥈",third_place:"🥉",third_place_medal:"🥉",medal:"🏅",sports_medal:"🏅",tickets:"🎟️",admission_tickets:"🎟️",person_juggling:"🤹",juggling:"🤹",juggler:"🤹",drum:"🥁",drum_with_drumsticks:"🥁",rainbow_flag:"🏳️‍🌈", gay_pride_flag:"🏳️‍🌈",race_car:"🏎️",racing_car:"🏎️",motor_scooter:"🛵",motorbike:"🛵",motorcycle:"🏍️",racing_motorcycle:"🏍️",airplane_small:"🛩️",small_airplane:"🛩️",canoe:"🛶",kayak:"🛶",cruise_ship:"🛳️",passenger_ship:"🛳️",map:"🗺️",world_map:"🗺️",beach_umbrella:"⛱️",umbrella_on_ground:"⛱️",beach:"🏖️",beach_with_umbrella:"🏖️",island:"🏝️",desert_island:"🏝️",mountain_snow:"🏔️",snow_capped_mountain:"🏔️",homes:"🏘️",house_buildings:"🏘️",house_abandoned:"🏚️",derelict_house_building:"🏚️",construction_site:"🏗️",building_construction:"🏗️",railway_track:"🛤️",railroad_track:"🛤️",park:"🏞️",national_park:"🏞️",city_sunset:"🌇",city_sunrise:"🌇",fox:"🦊",fox_face:"🦊",lion_face:"🦁",lion:"🦁",unicorn:"🦄",unicorn_face:"🦄",rhino:"🦏",rhinoceros:"🦏",dove:"🕊️",dove_of_peace:"🕊️",feet:"🐾",paw_prints:"🐾",wilted_rose:"🥀",wilted_flower:"🥀",fire:"🔥",flame:"🔥",cloud_tornado:"🌪️",cloud_with_tornado:"🌪️",white_sun_small_cloud:"🌤️",white_sun_with_small_cloud:"🌤️",white_sun_cloud:"🌥️",white_sun_behind_cloud:"🌥️",white_sun_rain_cloud:"🌦️",white_sun_behind_cloud_with_rain:"🌦️",cloud_rain:"🌧️",cloud_with_rain:"🌧️",thunder_cloud_rain:"⛈️",thunder_cloud_and_rain:"⛈️",cloud_lightning:"🌩️",cloud_with_lightning:"🌩️",cloud_snow:"🌨️",cloud_with_snow:"🌨️",};


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
	["emoji",   /:([0-9_a-z\+\-]+):/],
	["kbd",     /!(.+?)!/], // using <kbd>!</kbd> is semantically incorrect?
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
 * @param {string} str input string to be rendered
 */
export const to_tree = (str, variables = {}) =>
{
	let arr = str.split("\n");
	let tree = [];
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

						let text_under_element = [];
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
	
	switch (type)
	{
	// put here if need to create this element
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
		create_element_and_append("math", parent).replaceChildren(math_parse.render(node.tokens));
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
			 /* if (node.children.length > 0) */render_nodes(node.children, "tbody"); // not worth checking
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
 */

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