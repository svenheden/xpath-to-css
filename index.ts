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

type XPathStep = {
  axis: Axis;
  tag: string;
  predicates: Predicate[];
  attribute?: string;
};

function resolveAxis(axis: string | undefined, index: number): Axis {
  /* v8 ignore start */
  if (!axis) return index === 0 ? "descendant" : "child";
  if (axis === "/") return index === 0 ? "root" : "child";
  if (axis === "//") return "descendant";
  if (axis === "following-sibling::") return "followingSibling";
  return "child";
  /* v8 ignore stop */
}

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

function stepToCss(
  step: XPathStep,
  index: number
): string | { selector: string; attribute: string } {
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

  const selector = nav + tag + selectors;

  if (!step.attribute) return selector;

  return { selector, attribute: step.attribute };
}

function tokenizeXPath(expr: string): XPathStep[] {
  expr = preParseXPath(expr);

  const steps: XPathStep[] = [];
  const stepRegex =
    /(?:\s*(?<axis>\/\/|\/|following-sibling::|ancestor-or-self::|preceding-sibling::))?(?<tag>[a-zA-Z_][\w:-]*|\*)(?<predicates>(?:\[.+?\])*)(?:\/@(?<attribute>[a-zA-Z_][\w:-]*))?/g;

  for (const match of expr.matchAll(stepRegex)) {
    /* v8 ignore next */
    if (!match.groups) continue;
    let { attribute, axis: rawAxis, tag, predicates } = match.groups;

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

    steps.push({ attribute, axis, tag, predicates: preds });
  }

  return steps;
}

/**
 * Convert a full XPath expression (including unions) into a CSS selector or attribute target
 * @param {string} expr The XPath expression
 * @returns {string} The CSS selector string
 * @example
 * ```ts
 * const selector = fromXPathExpression('//div[@id="foo"]/span[2]');
 * console.log(selector) // => "div#foo > span:nth-of-type(2)"
 * ```
 * @deprecated Use {@link fromXPathExpression} instead, this will be removed in the next minor version.
 */
export function xPathToCss(expr: string): string {
  const css = fromXPathExpression(expr);
  return typeof css === "string" ? css : css.selector;
}

/**
 * Convert a full XPath expression (including unions) into a CSS selector or attribute target
 * @param {string} xpath The XPath expression
 * @returns {string | { selector: string; attribute: string }} The CSS selector string or attribute object
 * @example
 * ```ts
 * const selector = fromXPathExpression('//div[@id="foo"]/span[2]');
 * console.log(selector) // => "div#foo > span:nth-of-type(2)"
 *
 * const { selector, attribute } = fromXPathExpression('//div[@id="foo"]/a/@href');
 * console.log(selector) // => "div#foo > a"
 * console.log(attribute) // => "href"
 * ```
 */
export function fromXPathExpression(
  xpath: string
): string | { selector: string; attribute: string } {
  const results = xpath
    .split("|")
    .map((e) => {
      const selectors = tokenizeXPath(e.trim()).map(stepToCss);
      return selectors.length === 1 ? selectors[0] : selectors.join("").trim();
    })
    .filter(Boolean);

  if (results.length === 1) return results[0];

  return results
    .map((r) => (typeof r === "string" ? r : r.selector))
    .join(", ");
}
