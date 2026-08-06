/** biome-ignore-all lint/style/noNonNullAssertion: match.groups is guaranteed by the regex structure */
type Axis = "root" | "child" | "descendant" | "followingSibling";

type Predicate =
  | { type: "id" | "class"; value: string }
  | { type: "attrEquals" | "attrContains"; name: string; value: string }
  | { type: "hasChild" | "notHasChild"; tag: string }
  | { type: "notAttr"; name: string }
  | { type: "nth"; index: number }
  | { type: "nthLast" };

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
  if (!axis) return index === 0 ? "descendant" : "child";

  if (axis === "//") return "descendant";
  else if (axis === "following-sibling::") return "followingSibling";
  return "child";
}

/**
 * Preprocess special XPath patterns into simpler forms.
 * @param {string} expr The raw XPath expression
 * @returns {string} The normalized XPath expression
 * @example
 * ```ts
 * const parsed = preParseXPath('contains(concat(" ",@class," ")," foo ")')
 * console.log(parsed) // => '@class="foo"'
 * ```
 */
function preParseXPath(expr: string): string {
  return expr.replace(
    /contains\s*\(\s*concat\(["']\s+["']\s*,\s*@class\s*,\s*["']\s+["']\)\s*,\s*["']\s+([a-zA-Z0-9-_]+)\s+["']\)/gi,
    '@class="$1"'
  );
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

  let attrs = "";
  let nth = "";
  let pseudos = "";

  for (const p of step.predicates) {
    switch (p.type) {
      case "id":
        attrs += `#${p.value.replace(/\s+/g, "#")}`;
        break;
      case "class":
        attrs += `.${p.value.replace(/\s+/g, ".")}`;
        break;
      case "attrEquals":
        attrs += `[${p.name}="${p.value}"]`;
        break;
      case "attrContains":
        attrs += `[${p.name}*="${p.value}"]`;
        break;
      case "hasChild":
        pseudos += `:has(> ${p.tag})`;
        break;
      case "notHasChild":
        pseudos += `:not(:has(> ${p.tag}))`;
        break;
      case "notAttr":
        attrs += `:not([${p.name}])`;
        break;
      case "nth":
        nth += p.index === 1 ? ":first-of-type" : `:nth-of-type(${p.index})`;
        break;
      case "nthLast":
        nth += ":last-of-type";
        break;
    }
  }

  return nav + tag + attrs + pseudos + nth;
}

/**
 * Tokenize a full XPath expression into structured steps.
 * @param {string} expr The XPath expression
 * @returns {XPathStep[]} Array of parsed XPath steps
 * @throws {xPath2CssError} If the XPath contains unsupported syntax
 * @example
 * ```ts
 * const steps = tokenizeXPath('//div[@id="foo"]/span[2]');
 * console.log(steps); // => [{ axis: "descendant", ...  }, ...]
 * ```
 */
function tokenizeXPath(expr: string): XPathStep[] {
  expr = preParseXPath(expr);

  const steps: XPathStep[] = [];
  for (const match of expr.matchAll(
    /(?<axis>\/\/|\/)?(?<tag>[a-zA-Z][\w:-]*|\*)(?<predicates>(\[[^\]]+\])*)/g
  )) {
    let { axis, tag, predicates } = match.groups!;

    if (tag.startsWith("following-sibling::")) {
      axis = "following-sibling::";
      tag = tag.slice("following-sibling::".length);
    }

    const preds: Predicate[] = [];
    for (const p of predicates.matchAll(/\[(?<content>[^\]]+)\]/g)) {
      const content = p.groups!.content.trim();
      const subexpr = content.split(/\s+and\s+/i);

      for (const sub of subexpr) {
        const expr = sub.trim();

        if (content === "last()") {
          preds.push({ type: "nthLast" });
          continue;
        }

        const nthMatch = /^(\d+)$/.exec(expr);
        if (nthMatch) {
          preds.push({ type: "nth", index: parseInt(nthMatch[1], 10) });
          continue;
        }

        const notTagMatch = /^not\((?<tag>[a-zA-Z][\w:-]*)\)$/.exec(expr);
        if (notTagMatch?.groups) {
          preds.push({ type: "notHasChild", tag: notTagMatch.groups.tag });
          continue;
        }

        const childTagMatch = /^(?<tag>[a-zA-Z][\w:-]*)$/.exec(expr);
        if (childTagMatch?.groups) {
          preds.push({ type: "hasChild", tag: childTagMatch.groups.tag });
          continue;
        }

        const notAttrMatch = /^not\(@(?<name>[a-zA-Z_][\w:-]*)\)$/.exec(expr);
        if (notAttrMatch?.groups) {
          preds.push({ type: "notAttr", name: notAttrMatch.groups.name });
          continue;
        }

        const containsMatch =
          /^contains\(@(?<name>[a-zA-Z_][\w:-]*),\s*["'](?<value>[^"']+)["']\)$/.exec(
            expr
          );
        if (containsMatch?.groups) {
          preds.push({
            type: "attrContains",
            name: containsMatch.groups.name,
            value: containsMatch.groups.value,
          });
          continue;
        }

        const eqMatch =
          /^@(?<name>[a-zA-Z_][\w:-]*)=["'](?<value>[^"']+)["']$/.exec(expr);
        if (eqMatch?.groups) {
          const { name, value } = eqMatch.groups;
          if (name === "id") preds.push({ type: "id", value });
          else if (name === "class") preds.push({ type: "class", value });
          else preds.push({ type: "attrEquals", name, value });
          continue;
        }

        throw new Error(`Unsupported predicate: ${expr}`);
      }
    }

    steps.push({
      axis: resolveAxis(axis, steps.length),
      tag,
      predicates: preds,
    });
  }

  if (steps.length === 0) {
    throw new Error(`Invalid or unsupported XPath: ${expr}`);
  }

  return steps;
}

/**
 * Convert a full XPath expression (including unions) into a CSS selector
 * @param {string} expr The XPath expression
 * @returns {string} The CSS selector string
 * @example
 * ```ts
 * const selector = xPathToCss('//div[@id="foo"]/span[2]');
 * console.log(selector) // => "div#foo > span:nth-of-type(2)"
 * ```
 */
export function xPathToCss(expr: string): string {
  return expr
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => tokenizeXPath(part).map(stepToCss).join(""))
    .join(", ");
}
