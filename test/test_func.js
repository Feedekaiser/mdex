let i = -1;
import {stringify} from "/stringify.js"
export const test = (case_name, will_error, expected_out, func) => {
	try 
	{
		let a, b;
		if ((a = stringify(expected_out)) == (b = stringify(func())))
			console.log(`test #${++i} passed (${case_name})`);
		else
		{
			console.warn([
				"------------------------------------",
				`test #${++i} failed (${case_name})`,
				`expected: ${a}\n`,
				`actual: ${b}`,
				"------------------------------------"
			].join("\n"))
		}
			
	} 
	catch (e)
	{
		if (!will_error) 
			console.warn(`test #${++i} (${case_name}) errored: ${e}`);
		else
			console.log(`test #${++i} passed (${case_name})`);
	}
} 