// A sandboxed arithmetic evaluator -- ported from the Python app's
// tools/math_tool.py. Never uses eval()/Function(): a hand-rolled
// tokenizer + recursive-descent parser that only ever recognizes numbers,
// the fixed operator set, a fixed constant set, and a fixed function set --
// there is no path to arbitrary code execution, property access, or
// anything beyond arithmetic, by construction rather than by blocklist.

export class MathError extends Error {}

const MAX_EXPRESSION_LENGTH = 200;
const MAX_EXPONENT = 1000;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  factorial: (x) => {
    if (x < 0 || !Number.isInteger(x)) throw new MathError("factorial requires a non-negative integer");
    let result = 1;
    for (let i = 2; i <= x; i++) result *= i;
    return result;
  },
  exp: Math.exp,
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  log: (x, base = 10) => Math.log(x) / Math.log(base),
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
};

type Token =
  | { type: "number"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: string };

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++;
      const raw = expression.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(raw)) throw new MathError(`Invalid number: ${raw}`);
      tokens.push({ type: "number", value: Number(raw) });
      i = j;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[a-zA-Z_]/.test(expression[j])) j++;
      tokens.push({ type: "name", value: expression.slice(i, j) });
      i = j;
    } else if ("+-*/%(),".includes(ch)) {
      if (ch === "*" && expression[i + 1] === "*") {
        tokens.push({ type: "op", value: "**" });
        i += 2;
      } else if (ch === "/" && expression[i + 1] === "/") {
        tokens.push({ type: "op", value: "//" });
        i += 2;
      } else {
        tokens.push({ type: "op", value: ch });
        i++;
      }
    } else {
      throw new MathError(`Unsupported expression element: ${JSON.stringify(ch)}`);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(expected?: string): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new MathError("Unexpected end of expression");
    if (expected && !(token.type === "op" && token.value === expected)) {
      throw new MathError(`Expected '${expected}'`);
    }
    this.pos++;
    return token;
  }

  parse(): number {
    const value = this.parseExpr();
    if (this.pos < this.tokens.length) throw new MathError("Unexpected trailing input");
    return value;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    while (this.peek()?.type === "op" && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.consume().value;
      const rhs = this.parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (
      this.peek()?.type === "op" &&
      ["*", "/", "//", "%"].includes((this.peek() as { value: string }).value)
    ) {
      const op = this.consume().value;
      const rhs = this.parseUnary();
      if (op === "*") value *= rhs;
      else if (op === "/") {
        if (rhs === 0) throw new MathError("Division by zero.");
        value /= rhs;
      } else if (op === "//") {
        if (rhs === 0) throw new MathError("Division by zero.");
        value = Math.floor(value / rhs);
      } else {
        if (rhs === 0) throw new MathError("Division by zero.");
        value %= rhs;
      }
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peek()?.type === "op" && (this.peek()!.value === "-" || this.peek()!.value === "+")) {
      const op = this.consume().value;
      const value = this.parseUnary();
      return op === "-" ? -value : value;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parseAtom();
    if (this.peek()?.type === "op" && this.peek()!.value === "**") {
      this.consume("**");
      const exponent = this.parseUnary();
      if (Math.abs(exponent) > MAX_EXPONENT) throw new MathError("Exponent too large.");
      return base ** exponent;
    }
    return base;
  }

  private parseAtom(): number {
    const token = this.peek();
    if (!token) throw new MathError("Unexpected end of expression");

    if (token.type === "number") {
      this.consume();
      return token.value;
    }

    if (token.type === "op" && token.value === "(") {
      this.consume();
      const value = this.parseExpr();
      this.consume(")");
      return value;
    }

    if (token.type === "name") {
      this.consume();
      if (this.peek()?.type === "op" && this.peek()!.value === "(") {
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new MathError(`Unsupported expression element: ${token.value}`);
        this.consume("(");
        const args: number[] = [];
        if (!(this.peek()?.type === "op" && this.peek()!.value === ")")) {
          args.push(this.parseExpr());
          while (this.peek()?.type === "op" && this.peek()!.value === ",") {
            this.consume(",");
            args.push(this.parseExpr());
          }
        }
        this.consume(")");
        return fn(...args);
      }
      const constant = CONSTANTS[token.value];
      if (constant === undefined) throw new MathError(`Unsupported expression element: ${token.value}`);
      return constant;
    }

    throw new MathError("Unsupported expression element");
  }
}

export function evaluate(expression: string): number {
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new MathError("Expression is too long.");
  let result: number;
  try {
    result = new Parser(tokenize(expression)).parse();
  } catch (err) {
    if (err instanceof MathError) throw err;
    throw new MathError(`Couldn't evaluate '${expression}': ${err instanceof Error ? err.message : err}`);
  }
  if (!Number.isFinite(result)) throw new MathError("Result is too large to compute.");
  return result;
}

const FUNCTION_NAMES = "sqrt|sin|cos|tan|log10|log2|ln|log|exp|abs|round|factorial";
const NUM = String.raw`[-+]?\d+(?:\.\d+)?`;

const EXPRESSION_RE = new RegExp(`${NUM}(?:\\s*(?:\\*\\*|\\^|[+\\-*/%])\\s*${NUM})+`);
const FUNCTION_CALL_RE = new RegExp(`\\b(?:${FUNCTION_NAMES})\\s*\\([^()]*\\)`, "i");
const PERCENT_OF_RE = new RegExp(`(${NUM})\\s*%\\s*of\\s*(${NUM})`, "i");
const SQUARE_ROOT_OF_RE = new RegExp(`square\\s*root\\s*of\\s*(${NUM})`, "i");
const SQUARED_RE = new RegExp(`(${NUM})\\s*squared\\b`, "i");
const CUBED_RE = new RegExp(`(${NUM})\\s*cubed\\b`, "i");

export function detectMathExpression(text: string): string | null {
  let match = text.match(PERCENT_OF_RE);
  if (match) return `(${match[1]}/100)*${match[2]}`;

  match = text.match(SQUARE_ROOT_OF_RE);
  if (match) return `sqrt(${match[1]})`;

  match = text.match(SQUARED_RE);
  if (match) return `(${match[1]})**2`;

  match = text.match(CUBED_RE);
  if (match) return `(${match[1]})**3`;

  match = text.match(FUNCTION_CALL_RE);
  if (match) return match[0].replace(/\^/g, "**");

  match = text.match(EXPRESSION_RE);
  if (match) return match[0].replace(/\^/g, "**");

  return null;
}

interface MathResult {
  triggered: boolean;
  success?: boolean;
  liveData?: string;
  note?: string;
  expression?: string;
  result?: number;
}

export function runMathForMessage(text: string): MathResult {
  const expression = detectMathExpression(text);
  if (!expression) return { triggered: false };

  try {
    const result = evaluate(expression);
    const liveData =
      `A math tool evaluated this expression exactly using real arithmetic (not the language model): ` +
      `${expression} = ${result}\nUse this exact value in your answer -- do not recompute it yourself, ` +
      `round it differently, or second-guess it. You may explain how the calculation works in words. If ` +
      `trig functions were used, note that the tool interprets their arguments as degrees.`;
    return { triggered: true, success: true, liveData, expression, result };
  } catch (err) {
    return {
      triggered: true,
      success: false,
      note: err instanceof MathError ? err.message : "Couldn't evaluate that expression.",
    };
  }
}
