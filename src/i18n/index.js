// One dictionary per UI area, keyed by the English source text. Each
// area file exports `{ sq: {...}, de: {...}, fr, es, it, tr }`; they are
// merged per language here.
import home from './home';
import settings from './settings';
import options from './options';
import clips from './clips';
import tray from './tray';
import mcp from './mcp';
import shell from './shell';

const AREAS = [home, settings, options, clips, tray, mcp, shell];
const LANGS = ['sq', 'de', 'fr', 'es', 'it', 'tr'];

const dicts = {};
for (const l of LANGS) dicts[l] = Object.assign({}, ...AREAS.map((a) => a[l] ?? {}));

export default dicts;
