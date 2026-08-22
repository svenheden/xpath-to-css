/** biome-ignore-all lint/style/noNonNullAssertion: match.groups is guaranteed by the regex structure */
type Axis = "root" | "child" | "descendant" | "followingSibling";

type Predicate = { not?: boolean } & (
  | { type: "id" | "class"; value: string }
  | { type: "attr"; name: string }
  | {
      type: "attrEquals" | "attrContains" | "attrStartsWith" | "attrEndsWith";
      name: string;
      value: string;
    }
  | { type: "hasChild"; tag: string }
  | { type: "nth"; index: number }
  | { type: "nthLast" }
);

type XPathStep = { axis: Axis; tag: string; predicates: Predicate[] };

/**
 * Resolve an XPath axis token into a normalized Axis value.
 * @param {string | undefined} axis The raw axis token extracted from the XPath expression
 * @param {number} index The step index (used to determine combinator)
 * @returns {Axis} The resolved XPath axis
 * @example
 * ```ts
 * const axis = resolveAxis("//")
 * console.log(axis) // => "descendant"
 * ```
 */
function resolveAxis(axis: string | undefined, index: number): Axis {
  /* v8 ignore start */
  if (!axis) return index === 0 ? "descendant" : "child";
  if (axis === "/") return index === 0 ? "root" : "child";
  if (axis === "//") return "descendant";
  if (axis === "following-sibling::") return "followingSibling";
  return "child";
  /* v8 ignore stop */
}

/**
 * Preprocess special XPath patterns into simpler forms.
 */
function preParseXPath(expr: string): string {
  if (expr === "/") return ":root";
  return expr
    .replace(
      /contains\s*\(\s*concat\s*\(\s*(['"])\s+\1\s*,\s*(?:normalize-space\s*\(\s*)?@class(?:[:\s]*\))?\s*,\s*\1\s+\1\s*\)\s*,\s*(['"])\s+([a-zA-Z0-9-_]+)\s+\2\s*\)/gi,
      '@class="$3"'
    )
    .replace(
      /contains\s*\(\s*concat\s*\(\s*(['"])\s+\1\s*,\s*@class\s*,\s*\1\s+\1\s*\)\s*,\s*(['"])\s+([a-zA-Z0-9-_]+)\s+\2\s*\)/gi,
      '@class="$3"'
    )
    .replace(/\/text\(\)/g, "")
    .replace(/\/\.\./g, "");
}

/**
 * Convert a single parsed XPath step into a CSS fragment
 * @param {XPathStep} step The parsed XPath step
 * @param {number} index The step index (used to determine combinator)
 * @returns {string} The CSS fragment for this step
 * @example
 * ```ts
 * const css = stepToCss({ axis: "child", tag: "div", predicates: [] }, 1);
 * console.log(css); // => " > div"
 * ```
 */
function stepToCss(step: XPathStep, index: number): string {
  const nav =
    index === 0 || step.axis === "root"
      ? ""
      : step.axis === "descendant"
        ? " "
        : step.axis === "child"
          ? " > "
          : " + ";

  const tag = step.tag === "*" ? "" : step.tag;

  let selectors = "";
  for (const p of step.predicates) {
    let inner = "";
    switch (p.type) {
      case "id":
        inner = `#${p.value.replace(/\s+/g, "#")}`;
        break;
      case "class":
        inner = `.${p.value.replace(/\s+/g, ".")}`;
        break;
      case "attr":
        inner = `[${p.name}]`;
        break;
      case "attrEquals":
        inner = `[${p.name}="${p.value}"]`;
        break;
      case "attrContains":
        inner = `[${p.name}*="${p.value}"]`;
        break;
      case "attrStartsWith":
        inner = `[${p.name}^="${p.value}"]`;
        break;
      case "attrEndsWith":
        inner = `[${p.name}$="${p.value}"]`;
        break;
      case "hasChild":
        inner = `:has(> ${p.tag})`;
        break;
      case "nth":
        inner = p.index === 1 ? ":first-of-type" : `:nth-of-type(${p.index})`;
        break;
      case "nthLast":
        inner = ":last-of-type";
        break;
      /* v8 ignore next 2 */
      default:
        break;
    }

    if (inner) selectors += p.not ? `:not(${inner})` : inner;
  }

  return nav + tag + selectors;
}

/**
 * Tokenize a full XPath expression into structured steps.
 * @param {string} expr The XPath expression
 * @returns {XPathStep[]} Array of parsed XPath steps
 * @example
 * ```ts
 * const steps = tokenizeXPath('//div[@id="foo"]/span[2]');
 * console.log(steps); // => [{ axis: "descendant", ...  }, ...]
 * ```
 */
function tokenizeXPath(expr: string): XPathStep[] {
  expr = preParseXPath(expr);

  const steps: XPathStep[] = [];
  const stepRegex =
    /(?:\s*(?<axis>\/\/|\/|following-sibling::|ancestor-or-self::|preceding-sibling::))?(?<tag>[a-zA-Z_][\w:-]*|\*)(?<predicates>(?:\[.+?\])*)/g;

  for (const match of expr.matchAll(stepRegex)) {
    /* v8 ignore next */
    if (!match.groups) continue;
    let { axis: rawAxis, tag, predicates } = match.groups;

    if (tag.includes("::")) {
      const parts = tag.split("::");
      rawAxis = `${parts[0]}::`;
      tag = parts[1];
    }

    if (rawAxis === "ancestor-or-self::" || rawAxis === "preceding-sibling::") {
      steps.length = 0;
    }

    const axis = resolveAxis(rawAxis, steps.length);
    const preds: Predicate[] = [];

    if (predicates) {
      for (const predMatch of predicates.matchAll(/\[(.*?)\]/g)) {
        const bracketContent = predMatch[1].trim();
        const subexpr = bracketContent.split(/\s+and\s+/i);

        for (const sub of subexpr) {
          const subExpr = sub.trim();
          if (!subExpr) continue;

          let isNot = false;
          let innerExpr = subExpr;
          const notMatch = /^not\((.*)\)$/.exec(subExpr);
          if (notMatch) {
            isNot = true;
            innerExpr = notMatch[1].trim();
          }

          // [last()] => :last-of-type
          if (innerExpr === "last()") {
            preds.push({ type: "nthLast", not: isNot });
            continue;
          }

          // [1] or [position()=1] => :first-of-type / :nth-of-type(index)
          const nthMatch = /^(\d+)$|^position\(\)=(\d+)$/.exec(innerExpr);
          if (nthMatch) {
            const index = parseInt(nthMatch[1] || nthMatch[2], 10);
            preds.push({ type: "nth", index, not: isNot });
            continue;
          }

          // [position()>1] => :not(:first-of-type)
          if (innerExpr === "position()>1") {
            preds.push({ type: "nth", index: 1, not: true });
            continue;
          }

          // contains() / starts-with() / ends-with() (ignoring text() functions safely)
          if (innerExpr.includes("text()")) continue;

          const fnMatch =
            /^(?<fn>contains|starts-with|ends-with)\(@(?<name>[a-zA-Z_][\w:-]*),\s*["'](?<value>[^"']+)["']\)$/.exec(
              innerExpr
            );
          if (fnMatch?.groups) {
            const { fn, name, value } = fnMatch.groups;

            if (fn === "contains")
              preds.push({ type: "attrContains", name, value, not: isNot });
            else if (fn === "starts-with")
              preds.push({ type: "attrStartsWith", name, value, not: isNot });
            else if (fn === "ends-with")
              preds.push({ type: "attrEndsWith", name, value, not: isNot });

            continue;
          }

          // Attributes: [@attr], [@attr="value"], [@id="foo"], [@class="foo"]
          const attrMatch =
            /^@(?<name>[a-zA-Z_][\w:-]*)(?:=["'](?<value>[^"']+)["'])?$/.exec(
              innerExpr
            );
          if (attrMatch?.groups) {
            const { name, value } = attrMatch.groups;
            if (value === undefined) {
              preds.push({ type: "attr", name, not: isNot });
            } else if (name === "id") {
              preds.push({ type: "id", value, not: isNot });
            } else if (name === "class") {
              preds.push({ type: "class", value, not: isNot });
            } else {
              preds.push({ type: "attrEquals", name, value, not: isNot });
            }
            continue;
          }

          // Child Tags: [li]
          const tagMatch = /^(?<tag>[a-zA-Z][\w:-]*)$/.exec(innerExpr);
          if (tagMatch?.groups) {
            preds.push({
              type: "hasChild",
              tag: tagMatch.groups.tag,
              not: isNot,
            });
          }
        }
      }
    }

    steps.push({ axis, tag, predicates: preds });
  }

  return steps;
}

/**
 * Convert a full XPath expression (including unions) into a CSS selector
 */
export function xPathToCss(expr: string): string {
  return expr
    .split("|")
    .map((expr) => {
      const steps = tokenizeXPath(expr.trim());
      if (steps.length === 0) return "";
      return steps.map(stepToCss).join("").trim();
    })
    .filter((css) => css.length > 0)
    .join(", ");
}
