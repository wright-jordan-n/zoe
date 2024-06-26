import { Stmt } from "./ast.ts";
import { lex } from "./lexer.ts";
import { parse } from "./parser.ts";
import { Token_t } from "./token.ts";
import { interpret } from "./interpreter.ts";
import { initVar, Scope } from "./scope.ts";
import {
  IntegerValue,
  JsFnValue,
  NullValue,
  ObjectValue,
  ObjectValue_t,
  RuntimeValue,
  ValueType,
} from "./runtime.ts";

function stringifyZoeValue(rv: RuntimeValue): string {
  switch (rv.tag) {
    case ValueType.NULL:
      return "nil";
    case ValueType.FLOAT: {
      let str = rv.value.toString();
      if (!str.includes(".")) {
        str = str.concat(".0");
      }
      return str;
    }
    case ValueType.INTEGER:
      return rv.value.toString();
    case ValueType.BOOLEAN:
      return rv.value.toString();
    case ValueType.OBJECT:
      return stringifyZoeObject(rv);
    case ValueType.JS_FN:
      return "[JavaScript Function]";
    case ValueType.FUNCTION:
      return `[Zoe Function]`;
    case ValueType.STRING:
      return new TextDecoder().decode(rv.value);
  }
}

function stringifyZoeObject(rv: ObjectValue_t): string {
  const entries = Object.entries(rv.value);
  if (entries.length === 0) {
    return "{}";
  }
  const arr: string[] = [];
  arr.push("{ ");
  for (let i = 0; i < entries.length - 1; i += 1) {
    if (entries[i][1].tag !== ValueType.OBJECT) {
      arr.push(`${entries[i][0]}: ${stringifyZoeValue(entries[i][1])}, `);
    } else {
      arr.push(
        `${entries[i][0]}: ${
          stringifyZoeObject(entries[i][1] as ObjectValue_t)
        }, `,
      );
    }
  }
  if (entries[entries.length - 1][1].tag !== ValueType.OBJECT) {
    arr.push(
      `${entries[entries.length - 1][0]}: ${
        stringifyZoeValue(entries[entries.length - 1][1])
      } }`,
    );
  } else {
    arr.push(
      `${entries[entries.length - 1][0]}: ${
        stringifyZoeObject(entries[entries.length - 1][1] as ObjectValue_t)
      } }`,
    );
  }
  return arr.join("");
}

function print(rv_arr: RuntimeValue[]): RuntimeValue {
  if (rv_arr.length !== 1) {
    throw new Error("error: print function expects one argument");
  }
  console.log(stringifyZoeValue(rv_arr[0]));
  return NullValue();
}

function panic(rv_arr: RuntimeValue[]): RuntimeValue {
  if (rv_arr.length !== 1) {
    throw new Error("error: panic function expects one argument");
  }
  const val = rv_arr[0];
  throw new Error(`error: ${stringifyZoeValue(val)}`);
}

const strings = ObjectValue({
  len: JsFnValue(function (rv_arr: RuntimeValue[]): RuntimeValue {
    if (rv_arr.length !== 1) {
      throw new Error("error: strings.len function expects one argument");
    }
    const str = rv_arr[0];
    if (str.tag !== ValueType.STRING) {
      throw new Error(
        "error: strings.len function expects a string",
      );
    }
    return IntegerValue(BigInt(str.value.length));
  }),
});

const globalScope = Scope(null);
initVar(
  globalScope,
  "print",
  JsFnValue(print),
);
initVar(
  globalScope,
  "panic",
  JsFnValue(panic),
);
initVar(globalScope, "strings", strings);

if (Deno.args.length === 0) {
  let toks: Token_t[], stmts: Stmt[], lexErrs: string[], parseErrs: string[];
  for (let input = prompt(">"); input !== null; input = prompt(">")) {
    let hasError = false;
    ({ toks, errs: lexErrs } = lex(input));
    if (lexErrs.length !== 0) {
      hasError = true;
      for (const err of lexErrs) {
        console.log(err);
      }
    }
    // console.log(toks);
    ({ stmts, errs: parseErrs } = parse(toks));
    if (parseErrs.length !== 0) {
      hasError = true;
      for (const err of parseErrs) {
        console.log(err);
      }
    }
    // console.log(stmts);
    if (!hasError) {
      try {
        interpret(stmts, globalScope);
      } catch (error) {
        console.log(error.message);
      }
    }
  }
} else if (Deno.args.length === 1) {
  const bytes = Deno.readFileSync(Deno.args[0]);
  const src = new TextDecoder().decode(bytes);
  // deno-lint-ignore prefer-const
  let toks: Token_t[], stmts: Stmt[], lexErrs: string[], parseErrs: string[];
  let hasError = false;
  ({ toks, errs: lexErrs } = lex(src));
  // console.log(toks);
  if (lexErrs.length !== 0) {
    hasError = true;
    for (const err of lexErrs) {
      console.log(err);
    }
  }
  ({ stmts, errs: parseErrs } = parse(toks));
  // console.log(stmts);
  if (parseErrs.length !== 0) {
    hasError = true;
    for (const err of parseErrs) {
      console.log(err);
    }
  }
  if (!hasError) {
    try {
      interpret(stmts, globalScope);
    } catch (error) {
      console.log(error.message);
    }
  }
}
