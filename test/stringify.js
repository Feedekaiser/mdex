export const stringify = (v, depth = 1) =>
{
	switch (typeof v)
	{
	case "string": 
		return `"${v}"`;
	case "number":
	case "boolean": 
		return v + "";
	case "undefined":
	case "null": 
		return typeof v;
	}

	const is_object = v instanceof Object && Object.getPrototypeOf(v) == Object.prototype; // {} or []
	const open = is_object ? "{" : "[";
	const close = is_object ? "}" : "]";

    if (v.length == 0)
        return open + close;

    let tabs = "\t".repeat(depth);
    let out = [open];
    let i = 0;

	for (const [k, x] of Object.entries(v))
		out[++i] = `\n${tabs}[${(is_object ? `"${k}"` : k)}] = ${stringify(x, depth + 1)},`;

	out[i] = out[i].slice(0, -1);
	out.push(`\n${tabs.slice(0, -1)}${close}`);

    return out.join("");
}