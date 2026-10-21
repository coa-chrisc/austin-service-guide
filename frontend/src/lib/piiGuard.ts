/* ------------------------------------------------------------------ */
/*  Pre-flight PII guard                                               */
/*                                                                     */
/*  Mirror of backend/app/services/pii.py (resident rules only: no     */
/*  `kinds` / `keep` options). It lets the browser warn a resident     */
/*  before sending. The backend stays the authority and always         */
/*  redacts again. Patterns, order, placeholders and the Luhn check    */
/*  must stay identical; backend/tests/fixtures/pii_cases.json is run  */
/*  through both implementations to prove it.                          */
/* ------------------------------------------------------------------ */

export type PiiKind =
  | "email"
  | "card"
  | "ssn"
  | "id_number"
  | "dob"
  | "phone"
  | "address"
  | "name";

export const PII_PLACEHOLDERS: Record<PiiKind, string> = {
  email: "[email removed]",
  card: "[card number removed]",
  ssn: "[SSN removed]",
  id_number: "[ID number removed]",
  dob: "[date of birth removed]",
  phone: "[phone removed]",
  address: "[address removed]",
  name: "[name removed]",
};

/* ---- Python regex source -> JS RegExp ---- */

// Python `str` patterns are Unicode-aware; JS ones are not. The sources
// below are copied verbatim from pii.py and translated by `py()`:
//   \d -> \p{Nd}, \s -> Python's whitespace set, \b -> Unicode word
//   boundary, (?P<n> -> (?<n>, and IGNORECASE / (?i: / (?-i: scopes are
//   expanded into explicit [xX] classes (JS has no scoped flags).
const WORD = "\\p{L}\\p{N}_";
const BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
const SPACE =
  "\\t-\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

function otherCase(ch: string): string {
  const up = ch.toUpperCase();
  const alt = up !== ch ? up : ch.toLowerCase();
  return alt !== ch && alt.length === 1 ? alt : "";
}

function pyClass(src: string, start: number, ci: boolean): [string, number] {
  const atoms: string[] = [];
  let i = start + 1;
  while (src[i] !== "]") {
    if (src[i] === "\\") {
      atoms.push(src.slice(i, i + 2));
      i += 2;
    } else {
      atoms.push(src[i]);
      i += 1;
    }
  }
  let body = "";
  for (let k = 0; k < atoms.length; k += 1) {
    const atom = atoms[k];
    if (atoms[k + 1] === "-" && k + 2 < atoms.length) {
      body += atom + "-" + atoms[k + 2];
      k += 2;
      continue;
    }
    if (atom === "\\d") body += "\\p{Nd}";
    else if (atom === "\\s") body += SPACE;
    else {
      body += atom;
      if (ci && atom.length === 1) body += otherCase(atom);
    }
  }
  return [`[${body}]`, i + 1];
}

function py(src: string, ignoreCase = false): RegExp {
  let out = "";
  let ci = ignoreCase;
  const scopes: boolean[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      if (n === "d") out += "\\p{Nd}";
      else if (n === "s") out += `[${SPACE}]`;
      else if (n === "b") out += BOUNDARY;
      else out += c + n;
      i += 2;
    } else if (c === "[") {
      const [cls, next] = pyClass(src, i, ci);
      out += cls;
      i = next;
    } else if (c === "(") {
      scopes.push(ci);
      if (src.startsWith("(?P<", i)) {
        const end = src.indexOf(">", i);
        out += "(?<" + src.slice(i + 4, end + 1);
        i = end + 1;
      } else if (src.startsWith("(?i:", i)) {
        ci = true;
        out += "(?:";
        i += 4;
      } else if (src.startsWith("(?-i:", i)) {
        ci = false;
        out += "(?:";
        i += 5;
      } else {
        out += c;
        i += 1;
      }
    } else if (c === ")") {
      ci = scopes.pop() ?? ci;
      out += c;
      i += 1;
    } else if (c === "{") {
      const end = src.indexOf("}", i);
      out += src.slice(i, end + 1);
      i = end + 1;
    } else {
      const alt = ci ? otherCase(c) : "";
      out += alt ? `[${c}${alt}]` : c;
      i += 1;
    }
  }
  return new RegExp(out, "gu");
}

/* ---- Patterns (same as pii.py) ---- */

const EMAIL_RE = py(
  String.raw`(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`,
);

const CARD_RE = py(
  String.raw`(?<![\d$])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -])\d{6}\2\d{5})(?!\d)`,
);

const SSN_FORMATTED_RE = py(String.raw`(?<![\d$])\d{3}([-. ])\d{2}\1\d{4}(?!\d)`);

const SSN_KEYWORDS =
  String.raw`ssn|itin(?:\s+(?:number|no\.?|#))?|s\.s\.n\.?|social(?:\s+security)?(?:\s+(?:number|no\.?|#))?` +
  String.raw`|seguro\s+social|n[uú]mero\s+de\s+seguro\s+social`;
const SSN_CONTEXT_RE = py(
  String.raw`(?P<pre>\b(?:${SSN_KEYWORDS})\b[\s:#-]*(?:(?:is|es|was)\s+)?)(?P<val>\d{9})(?!\d)`,
  true,
);
const SSN_LAST4_RE = py(
  String.raw`(?P<pre>\blast\s+(?:4|four)\s+(?:digits\s+)?(?:of\s+)?(?:my\s+)?` +
    String.raw`(?:${SSN_KEYWORDS})\b[\s:#-]*(?:(?:is|was)\s+)?)(?P<val>\d{4})(?!\d)`,
  true,
);

const ID_KEYWORDS =
  String.raw`medicaid|medicare|member(?:ship)?|subscriber|policy|insurance|account|acct` +
  String.raw`|case|chip|snap|ebt|wic|i\.?d\.?|driver'?s?\s+licen[cs]e|licen[cs]e` +
  String.raw`|passport|alien|a-number|uscis|green\s+card|routing|group|mbi` +
  String.raw`|n[uú]mero\s+de\s+(?:miembro|cuenta|caso|p[oó]liza)`;
const ID_CONNECTORS = String.raw`(?:card|number|num|no\.?|#|id|is|was|es|:|-)`;
const ID_CONTEXT_RE = py(
  String.raw`(?P<pre>\b(?:${ID_KEYWORDS})(?![A-Za-z])(?:\s*${ID_CONNECTORS}){0,4}\s*)` +
    String.raw`(?P<val>[A-Za-z0-9][A-Za-z0-9-]{4,24}[A-Za-z0-9])(?![A-Za-z0-9-])`,
  true,
);

const MONTHS =
  String.raw`jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?` +
  String.raw`|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?` +
  String.raw`|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre` +
  String.raw`|noviembre|diciembre`;
const DATE =
  String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}` +
  String.raw`|\d{4}-\d{2}-\d{2}` +
  String.raw`|(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}` +
  String.raw`|\d{1,2}(?:\s+de)?\s+(?:${MONTHS})\.?,?(?:\s+de)?\s+\d{4}`;
const DOB_RE = py(
  String.raw`(?P<pre>\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|birth\s*date|birthday` +
    String.raw`|born(?:\s+on)?|fecha\s+de\s+nacimiento|nac[ií](?:\s+el)?)\b[\s:,-]*` +
    String.raw`(?:(?:is|was|es|fue)\s+)?)` +
    String.raw`(?P<val>${DATE})`,
  true,
);

const PHONE_RE = py(
  String.raw`(?<![\d$])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)`,
);
const PHONE_LOCAL_RE = py(
  String.raw`(?P<pre>\b(?:call|text|phone|cell|mobile|number|reach\s+me|tel[eé]fono|celular)` +
    String.raw`\b(?:\s+(?:me|at|is|es|number|al|:)){0,4}[\s:]{0,4})` +
    String.raw`(?P<val>\d{3}[\s.-]\d{4})(?!\d)`,
  true,
);

const STREET_SUFFIXES =
  String.raw`street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln` +
  String.raw`|ct|cir|pl|parkway|pkwy|highway|hwy|trl|ter|cv|xing` +
  String.raw`|(?-i:Way|Court|Circle|Place|Trail|Terrace|Cove|Loop|Bend|Path|Crossing|Row|Pass|Run)`;
const NOT_STREET_WORDS =
  String.raw`the|on|in|at|a|an|of|to|for|my|our|from|near|by|and|or|with|but|no|not` +
  String.raw`|years?|months?|weeks?|days?|hours?|people|persons?|kids?|children|adults?` +
  String.raw`|dollars?|times?|am|pm|i|we|me|it|is|was` +
  String.raw`|minutes?|mins?|miles?|blocks?|nights?|notices?|evictions?`;
const STREET_TOKEN = String.raw`(?!(?:${NOT_STREET_WORDS})\b)[A-Za-z0-9][A-Za-z0-9.'-]*`;
const ADDRESS_RE = py(
  String.raw`(?<![\d$,.])(?!7[86]\d{3}\b)\d{1,6}[A-Za-z]?\s+` +
    String.raw`(?:${STREET_TOKEN}\s+){1,4}` +
    String.raw`(?:${STREET_SUFFIXES})\b\.?` +
    String.raw`(?:,?\s*(?:apt|apartment|unit|suite|ste|#)\.?\s*#?\s*[A-Za-z0-9-]+)?`,
  true,
);
const PO_BOX_RE = py(String.raw`\bP\.?\s?O\.?\s*Box\s+\d+`, true);

const NAME_LET = "A-Za-zÀ-ÖØ-öø-ÿ";
const NAME_UP = "A-ZÀ-ÖØ-Þ";
const NAME_LOW = "a-zß-öø-ÿ";
const NAME_STOP_FUNC =
  String.raw`on|in|at|to|of|not|no|the|a|an|and|or|but|is|was|are|for|with|from|under` +
  String.raw`|off|also|here|there|different|same|wrong|misspelled|spelled|listed` +
  String.raw`|correct|incorrect|mine|ok|okay|just|really|so|that|this|it|its|then|if` +
  String.raw`|when|what|who|why|how|we|you|he|she|they|my|me|your|his|her|our|their` +
  String.raw`|too|very|still|now|never|always|only|written|printed|signed|required` +
  String.raw`|missing|en|el|la|los|las|de|del|y|mi|es|un|una|que|para|por|con|sin` +
  String.raw`|aqui|aquí|mal|igual|diferente`;
const NAME_STOP_CONTINUATION =
  NAME_STOP_FUNC +
  String.raw`|i|im|need|needs|needed|looking|look|want|wants|wanted|have|has|had|am|be` +
  String.raw`|been|live|lives|living|work|works|working|help|trying|try|seeking|get` +
  String.raw`|getting|got|can|cant|could|will|would|do|does|did|lost|late|behind|hungry` +
  String.raw`|homeless|unemployed|pregnant|disabled|veteran|calling|writing|applying` +
  String.raw`|please|pls|thanks|hi|hello|necesito|busco|tengo|soy|estoy|vivo|quiero` +
  String.raw`|trabajo|perdi|perdí|ayuda|hola|gracias`;

const NAME_STOP_DESCRIPTOR =
  NAME_STOP_FUNC +
  String.raw`|monday|tuesday|wednesday|thursday|friday|saturday|sunday` +
  String.raw`|january|february|march|april|may|june|july|august|september|october` +
  String.raw`|november|december|veterans?|unemployed|disabled|pregnant|retired` +
  String.raw`|homeless|single|married|divorced|widowed|separated|student|citizen` +
  String.raw`|resident|immigrant|refugee|senior|elderly|deaf|blind|sick|diabetic` +
  String.raw`|spanish|english|mexican|texas|austin|american|african|asian|black|white` +
  String.raw`|hispanic|latino|latina|latinx|native|indian|chinese|vietnamese|korean` +
  String.raw`|filipino|cuban|salvadoran|guatemalan|honduran|venezuelan|haitian|french` +
  String.raw`|german|arabic|catholic|christian|muslim|jewish|buddhist|hindu|currently` +
  String.raw`|looking|seeking|trying|having|living|working|needing|receiving|behind` +
  String.raw`|out|laid|late|without|sure|new|public|health|center|city|county|food` +
  String.raw`|bank|help|need|needs`;

const notStop = (words: string): string =>
  String.raw`(?!(?i:${words})(?![${NAME_LET}]))`;

const NAME_CAP =
  String.raw`[${NAME_UP}](?:[${NAME_LOW}]+|['’][${NAME_UP}][${NAME_LOW}]+)` +
  String.raw`(?:[${NAME_UP}][${NAME_LOW}]+)?(?:-[${NAME_UP}][${NAME_LOW}]+)?(?![${NAME_LET}])`;
const NAME_ANY = String.raw`[${NAME_LET}]+(?:['’-][${NAME_LET}]+)*`;
const NAME_FUNC_GUARD = notStop(NAME_STOP_FUNC);
const NAME_DESC_GUARD = notStop(NAME_STOP_DESCRIPTOR);
const NAME_CONT_GUARD = notStop(NAME_STOP_CONTINUATION);

const NAME_EXPLICIT_RE = py(
  String.raw`(?P<pre>(?i:\bmy\s+name(?:\s+is|['’]s)|\bme\s+llamo|\bmi\s+nombre\s+es)[ \t]+)` +
    String.raw`(?P<val>${NAME_FUNC_GUARD}${NAME_ANY}(?:[ \t]+${NAME_CONT_GUARD}${NAME_ANY}){0,2})`,
);
const NAME_SELF_RE = py(
  String.raw`(?P<pre>(?i:\bi(?:\s+am|['’]m)|\bthis\s+is)[ \t]+)` +
    String.raw`(?P<val>${NAME_DESC_GUARD}${NAME_CAP}(?:[ \t]+${NAME_DESC_GUARD}${NAME_CAP}){1,2})`,
);

/* ---- Helpers ---- */

const NON_DIGIT_RE = /\P{Nd}/gu;

// Value of a Unicode decimal digit (Python's int() accepts them). Nd
// characters come in contiguous runs of ten, so walk back to the run start.
function digitValue(ch: string): number {
  const ND = /^\p{Nd}$/u;
  let cp = ch.codePointAt(0) as number;
  let offset = 0;
  while (ND.test(String.fromCodePoint(cp - 1))) {
    cp -= 1;
    offset += 1;
  }
  return offset % 10;
}

function luhnValid(digits: string): boolean {
  let total = 0;
  Array.from(digits)
    .reverse()
    .forEach((ch, idx) => {
      let n = digitValue(ch);
      if (idx % 2 === 1) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      total += n;
    });
  return total % 10 === 0;
}

const ZIP4_OR_PHONE_RE = /^(?:\p{Nd}{5}-\p{Nd}{4}|(?:1-)?\p{Nd}{3}-\p{Nd}{3}-\p{Nd}{4})$/u;

type Accept = (match: string, groups: Record<string, string> | undefined) => boolean;

const always: Accept = () => true;
const isCard: Accept = (match) => luhnValid(match.replace(NON_DIGIT_RE, ""));
const isIdValue: Accept = (_match, groups) => {
  const value = groups?.val ?? "";
  const digits = Array.from(value).filter((ch) => /\p{Nd}/u.test(ch)).length;
  return digits >= 4 && !ZIP4_OR_PHONE_RE.test(value);
};

// Order matters and matches pii.py.
const RULES: Array<[PiiKind, RegExp, Accept]> = [
  ["email", EMAIL_RE, always],
  ["card", CARD_RE, isCard],
  ["ssn", SSN_FORMATTED_RE, always],
  ["ssn", SSN_CONTEXT_RE, always],
  ["ssn", SSN_LAST4_RE, always],
  ["dob", DOB_RE, always],
  ["id_number", ID_CONTEXT_RE, isIdValue],
  ["phone", PHONE_RE, always],
  ["phone", PHONE_LOCAL_RE, always],
  ["address", PO_BOX_RE, always],
  ["address", ADDRESS_RE, always],
  ["name", NAME_EXPLICIT_RE, always],
  ["name", NAME_SELF_RE, always],
];

/* ---- Public API ---- */

export function scrubPII(text: string): { text: string; kinds: PiiKind[] } {
  const found = new Set<PiiKind>();
  let out = text;
  for (const [kind, pattern, accept] of RULES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, (...args: unknown[]) => {
      const match = args[0] as string;
      const last = args[args.length - 1];
      const groups =
        typeof last === "object" && last !== null
          ? (last as Record<string, string>)
          : undefined;
      if (!accept(match, groups)) return match;
      found.add(kind);
      return groups && "val" in groups
        ? groups.pre + PII_PLACEHOLDERS[kind]
        : PII_PLACEHOLDERS[kind];
    });
  }
  return { text: out, kinds: Array.from(found).sort() };
}

export function inspectForPII(text: string): { hasPII: boolean; kinds: PiiKind[] } {
  const { kinds } = scrubPII(text);
  return { hasPII: kinds.length > 0, kinds };
}
