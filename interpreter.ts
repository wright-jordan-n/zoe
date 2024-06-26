import {
  AssignmentExpr_t,
  BinaryExpr_t,
  BlockStmt_t,
  CallExpr_t,
  Expr,
  ExprStmt_t,
  IdentifierExpr_t,
  IfStmt_t,
  MemberExpr_t,
  NodeType,
  ObjectLiteralExpr_t,
  ReturnStmt_t,
  Stmt,
  SubscriptExpr_t,
  UnaryExpr_t,
  VarStmt_t,
} from "./ast.ts";
import { assignVar, initVar, lookupVar, Scope, Scope_t } from "./scope.ts";
import {
  BooleanValue,
  FloatValue,
  FunctionValue,
  IntegerValue,
  NullValue,
  ObjectValue,
  RuntimeValue,
  StringValue,
  ValueType,
} from "./runtime.ts";

export function interpret(stmts: Stmt[], scope: Scope_t): RuntimeValue {
  let lastEval: RuntimeValue = NullValue();
  for (const stmt of stmts) {
    lastEval = evaluate(stmt, scope);
  }
  return lastEval;
}

function evaluate(node: Stmt | Expr, scope: Scope_t): RuntimeValue {
  switch (node.tag) {
    case NodeType.VAR_STMT:
      return evalVarStmt(node, scope);
    case NodeType.EXPRESSION_STMT:
      return evalExprStmt(node, scope);
    case NodeType.INTEGER_LITERAL_EXPR:
      return IntegerValue(node.value);
    case NodeType.FLOAT_LITERAL_EXPR:
      return FloatValue(node.value);
    case NodeType.NULL_LITERAL_EXPR:
      return NullValue();
    case NodeType.BOOLEAN_LITERAL_EXPR:
      if (node.value) {
        return BooleanValue(true);
      }
      return BooleanValue(false);
    case NodeType.BINARY_EXPR:
      return evalBinaryExpr(node, scope);
    case NodeType.IDENTIFIER_EXPR:
      return evalIdentifierExpr(node, scope);
    case NodeType.OBJECT_LITERAL_EXPR:
      return evalObjectLiteralExpr(node, scope);
    case NodeType.ASSIGNMENT_EXPR:
      return evalAssignmentExpr(node, scope);
    case NodeType.MEMBER_EXPR:
      return evalMemberExpr(node, scope);
    case NodeType.CALL_EXPR:
      return evalCallExpr(node, scope);
    case NodeType.BLOCK_STMT:
      return evalBlockStmt(node, Scope(scope));
    case NodeType.FUNCTION_LITERAL_EXPR:
      return FunctionValue(scope, node);
    case NodeType.RETURN_STMT:
      return evalReturnStmt(node, scope);
    case NodeType.UNARY_EXPR:
      return evalUnaryExpr(node, scope);
    case NodeType.IF_STMT:
      return evalIfStmt(node, scope);
    case NodeType.STRING_LITERAL_EXPR:
      return StringValue(node.value);
    case NodeType.SUBSCRIPT_EXPR:
      return evalSubscriptExpr(node, scope);
      // default:
      //   throw new Error(
      //     `error: encountered invalid ast node with NodeType ${node.tag}`,
      //   );
  }
}

// EXPRESSIONS
function evalSubscriptExpr(
  expr: SubscriptExpr_t,
  scope: Scope_t,
): RuntimeValue {
  const lhs = evaluate(expr.left, scope);
  const rhs = evaluate(expr.right, scope);

  if (lhs.tag !== ValueType.STRING) {
    throw new Error("error: lhs of subscript expresssion must be a string");
  }
  if (rhs.tag !== ValueType.INTEGER) {
    throw new Error("error: subscript expression expects integer argument");
  }
  if (rhs.value >= lhs.value.length) {
    throw new Error("error: attempting to index outside of string range");
  }
  return IntegerValue(BigInt(lhs.value[Number(rhs.value)]));
}

function evalUnaryExpr(expr: UnaryExpr_t, scope: Scope_t): RuntimeValue {
  const rhs = evaluate(expr.expr, scope);
  switch (expr.operator) {
    case "!":
      if (rhs.tag === ValueType.BOOLEAN) {
        rhs.value = !rhs.value;
        return rhs;
      }
      throw new Error(
        "error: unary operator '!' only allowed for boolean values",
      );
    case "-":
      switch (rhs.tag) {
        case ValueType.FLOAT: {
          rhs.value *= -1;
          return rhs;
        }
        case ValueType.INTEGER: {
          rhs.value *= -1n;
          return rhs;
        }
        default:
          throw new Error(
            "error: unary operator '-' only allowed for float or int values",
          );
      }
    default:
      throw new Error(
        `error: unable to evaluate '${expr.operator}' as unary operator expression`,
      );
  }
}

function evalBinaryExpr(expr: BinaryExpr_t, scope: Scope_t): RuntimeValue {
  const lhs = evaluate(expr.left, scope);
  const rhs = evaluate(expr.right, scope);
  switch (expr.operator) {
    case "and":
      if (lhs.tag !== ValueType.BOOLEAN || rhs.tag !== ValueType.BOOLEAN) {
        throw new Error(
          "error: both sides of 'and' operator must be boolean expressions",
        );
      }
      return BooleanValue(lhs.value && rhs.value);
    case "or":
      if (lhs.tag !== ValueType.BOOLEAN || rhs.tag !== ValueType.BOOLEAN) {
        throw new Error(
          "error: both sides of 'or' operator must be boolean expressions",
        );
      }
      return BooleanValue(lhs.value || rhs.value);
    case "==":
      if (lhs.value === rhs.value) {
        return BooleanValue(true);
      }
      return BooleanValue(false);
    case "!=":
      if (lhs.value !== rhs.value) {
        return BooleanValue(true);
      }
      return BooleanValue(false);
    case "<":
      if (lhs.tag !== rhs.tag) {
        throw new Error("error: operands for '<' must be of the same type");
      }
      if (lhs.tag !== ValueType.INTEGER && lhs.tag !== ValueType.FLOAT) {
        throw new Error("error: operands for '<' must be of type int or float");
      }
      return BooleanValue(lhs.value < (rhs.value as number | bigint));
    case ">":
      if (lhs.tag !== rhs.tag) {
        throw new Error("error: operands for '>' must be of the same type");
      }
      if (lhs.tag !== ValueType.INTEGER && lhs.tag !== ValueType.FLOAT) {
        throw new Error("error: operands for '>' must be of type int or float");
      }
      return BooleanValue(lhs.value > (rhs.value as number | bigint));
    case "+":
      if (lhs.tag !== rhs.tag) {
        throw new Error(`error: operands for '+' must be of the same time`);
      }
      if (lhs.tag === ValueType.INTEGER) {
        return IntegerValue(lhs.value + (rhs.value as bigint));
      }
      if (lhs.tag === ValueType.FLOAT) {
        return FloatValue(lhs.value + (rhs.value as number));
      }
      if (lhs.tag === ValueType.STRING) {
        const u8Array = new Uint8Array(
          lhs.value.length + (rhs.value as Uint8Array).length,
        );
        let i = 0;
        for (; i < lhs.value.length; i += 1) {
          u8Array[i] = lhs.value[i];
        }
        for (; i < u8Array.length; i += 1) {
          u8Array[i] = (rhs.value as Uint8Array)[i];
        }
        return StringValue(u8Array);
      }
      throw new Error(
        "error: operands for '+' must be of type int, float, or string",
      );
    case "-":
      if (lhs.tag !== rhs.tag) {
        throw new Error(`error: operands for '-' must be of the same time`);
      }
      if (lhs.tag === ValueType.INTEGER) {
        return IntegerValue(lhs.value - (rhs.value as bigint));
      }
      if (lhs.tag === ValueType.FLOAT) {
        return FloatValue(lhs.value - (rhs.value as number));
      }
      throw new Error("error: operands for '-' must be of type int or float");
    case "*":
      if (lhs.tag !== rhs.tag) {
        throw new Error(`error: operands for '*' must be of the same time`);
      }
      if (lhs.tag === ValueType.INTEGER) {
        return IntegerValue(lhs.value * (rhs.value as bigint));
      }
      if (lhs.tag === ValueType.FLOAT) {
        return FloatValue(lhs.value * (rhs.value as number));
      }
      throw new Error("error: operands for '*' must be of type int or float");
    case "/":
      if (lhs.tag !== rhs.tag) {
        throw new Error(`error: operands for '/' must be of the same time`);
      }
      if (lhs.tag === ValueType.INTEGER) {
        if (rhs.value === 0n) {
          throw new Error("error: division by zero not allowed");
        }
        return IntegerValue(lhs.value / (rhs.value as bigint));
      }
      if (lhs.tag === ValueType.FLOAT) {
        if (rhs.value === 0) {
          throw new Error("error: division by zero not allowed");
        }
        return FloatValue(lhs.value / (rhs.value as number));
      }
      throw new Error("error: operands for '/' must be of type int or float");
    case "%":
      if (lhs.tag !== rhs.tag) {
        throw new Error(`error: operands for '%' must be of the same time`);
      }
      if (lhs.tag === ValueType.INTEGER) {
        return IntegerValue(lhs.value % (rhs.value as bigint));
      }
      if (lhs.tag === ValueType.FLOAT) {
        return FloatValue(lhs.value % (rhs.value as number));
      }
      throw new Error("error: operands for '%' must be of type int or float");
    default:
      throw new Error(
        `error: unable to evaluate '${expr.operator}' as binary operator expression`,
      );
  }
}

function evalIdentifierExpr(
  expr: IdentifierExpr_t,
  scope: Scope_t,
): RuntimeValue {
  return lookupVar(scope, expr.symbol);
}

function evalObjectLiteralExpr(
  expr: ObjectLiteralExpr_t,
  scope: Scope_t,
): RuntimeValue {
  const m: { [key: string]: RuntimeValue } = {};
  for (const { symbol, value } of expr.properties) {
    if (value === null) {
      m[symbol] = lookupVar(scope, symbol);
    } else {
      m[symbol] = evaluate(value, scope);
    }
  }
  return ObjectValue(m);
}

function evalMemberExpr(expr: MemberExpr_t, scope: Scope_t) {
  const parentVal = evaluate(expr.left, scope);
  const child = expr.right;
  if (
    parentVal.tag !== ValueType.OBJECT
  ) {
    throw new Error(
      "error: dot operator can only be called on type object",
    );
  }
  if (child.tag !== NodeType.IDENTIFIER_EXPR) {
    throw new Error(
      "error: right hand side of dot operator must be an identifier",
    );
  }
  const childVal = parentVal.value[child.symbol];
  if (childVal === undefined) {
    throw new Error(
      `error: field ${child.symbol} is not present on calling object`,
    );
  }
  return childVal;
}

// I might want to swap these switches.
function evalAssignmentExpr(
  expr: AssignmentExpr_t,
  scope: Scope_t,
): RuntimeValue {
  switch (expr.operator) {
    case "=":
      switch (expr.assignee.tag) {
        case NodeType.IDENTIFIER_EXPR: {
          const value = evaluate(expr.value, scope);
          assignVar(scope, expr.assignee.symbol, value);
          return value;
        }
        case NodeType.MEMBER_EXPR: {
          const parentVal = evaluate(expr.assignee.left, scope);
          const child = expr.assignee.right;
          if (
            parentVal.tag !== ValueType.OBJECT
          ) {
            throw new Error(
              "error: dot operator can only be called on type object",
            );
          }
          if (child.tag !== NodeType.IDENTIFIER_EXPR) {
            throw new Error(
              "error: right hand side of dot operator must be an identifier",
            );
          }
          const value = evaluate(expr.value, scope);
          parentVal.value[child.symbol] = value;
          return value;
        }
        case NodeType.SUBSCRIPT_EXPR: {
          const lhs = evaluate(expr.assignee.left, scope);
          const rhs = evaluate(expr.assignee.right, scope);

          if (lhs.tag !== ValueType.STRING) {
            throw new Error(
              "error: lhs of subscript expresssion must be a string",
            );
          }
          if (rhs.tag !== ValueType.INTEGER) {
            throw new Error(
              "error: subscript expression expects integer argument",
            );
          }
          if (rhs.value >= lhs.value.length) {
            throw new Error(
              "error: attempting to index outside of string range",
            );
          }
          const value = evaluate(expr.value, scope);
          if (value.tag !== ValueType.INTEGER) {
            throw new Error(
              "error: string index can only be assigned to type integer",
            );
          }
          lhs.value[Number(rhs.value)] = Number(value.value);
          return value;
        }
        default:
          throw new Error(
            "error: assignee must be an identifier or object property",
          );
      }
    default:
      throw new Error(
        `error: unable to evaluate '${expr.operator}' as assignment expression`,
      );
  }
}

function evalCallExpr(expr: CallExpr_t, scope: Scope_t): RuntimeValue {
  const args = expr.args.map(function (expr) {
    return evaluate(expr, scope);
  });
  const fn = evaluate(expr.caller, scope);
  if (fn.tag === ValueType.JS_FN) {
    return fn.value(args);
  } else if (fn.tag === ValueType.FUNCTION) {
    if (args.length !== fn.value.parameters.length) {
      throw new Error(
        `error: function call expected ${fn.value.parameters.length} args, received ${args.length}`,
      );
    }
    const newScope = Scope(fn.captured);
    for (let i = 0; i < fn.value.parameters.length; i += 1) {
      initVar(newScope, fn.value.parameters[i], args[i]);
    }
    try {
      evalBlockStmt(fn.value.block, newScope);
    } catch (error) {
      if (error instanceof Return) {
        return error.value;
      }
      throw error;
    }
    return NullValue();
  }
  throw new Error("error: non function types are not callable");
}

// STATEMENTS

function evalVarStmt(stmt: VarStmt_t, scope: Scope_t): RuntimeValue {
  initVar(scope, stmt.symbol, evaluate(stmt.expr, scope));
  return NullValue();
}

function evalExprStmt(stmt: ExprStmt_t, scope: Scope_t): RuntimeValue {
  evaluate(stmt.expr, scope);
  return NullValue();
}

function evalBlockStmt(block: BlockStmt_t, scope: Scope_t): RuntimeValue {
  for (const stmt of block.stmts) {
    evaluate(stmt, scope);
  }
  return NullValue();
}

class Return extends Error {
  value: RuntimeValue;
  constructor(value: RuntimeValue) {
    super("error: return statement only permitted within function");
    this.value = value;
  }
}

function evalReturnStmt(stmt: ReturnStmt_t, scope: Scope_t): RuntimeValue {
  const value = evaluate(stmt.expr, scope);
  throw new Return(value);
}

function evalIfStmt(stmt: IfStmt_t, scope: Scope_t): RuntimeValue {
  for (const sect of stmt.ifs) {
    const rv = evaluate(sect.condition, scope);
    if (rv.tag !== ValueType.BOOLEAN) {
      throw new Error("error: if condition must be a boolean expression");
    }
    if (rv.value === true) {
      evalBlockStmt(sect.block, Scope(scope));
      return NullValue();
    }
  }
  if (stmt.dflt !== null) {
    evalBlockStmt(stmt.dflt, Scope(scope));
  }
  return NullValue();
}
