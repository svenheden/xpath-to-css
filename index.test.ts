import { parseHTML } from "linkedom";
import { runtime } from "std-env";
import { describe, expect, it } from "vitest";
import { xPathToCss } from "./index.js";
import pkg from "./package.json" with { type: "json" };

describe("@miichom/lodestone", () => {
  it("throws for invalid XPath with no steps", () => {
    expect(() => xPathToCss("//")).toThrow(/Invalid or unsupported XPath/);
  });

  it("throws for text() predicates", () => {
    expect(() => xPathToCss('//div[text()="foo"]')).toThrow(
      /Unsupported predicate/
    );
  });

  it("throws for contains(text(), ...) predicates", () => {
    expect(() => xPathToCss('//div[contains(text(), "foo")]')).toThrow(
      /Unsupported predicate/
    );
  });

  it("throws for unsupported XPath functions", () => {
    expect(() => xPathToCss('//div[normalize-space(@id)="foo"]')).toThrow(
      /Unsupported predicate/
    );
  });

  it("normalizes whitespace in id and class predicates", () => {
    expect(xPathToCss('//div[@id="foo bar"][1]')).toBe(
      "div#foo#bar:first-of-type"
    );

    expect(xPathToCss('//span[@class="a b c"][2]')).toBe(
      "span.a.b.c:nth-of-type(2)"
    );
  });

  it("converts equals attribute predicates", () => {
    expect(xPathToCss('//a[@href="https://example.com"]')).toBe(
      'a[href="https://example.com"]'
    );
  });

  it("converts last() to :last-of-type", () => {
    expect(xPathToCss("//li[last()]")).toBe("li:last-of-type");
  });

  it("converts arbitrary attribute equals predicates", () => {
    expect(xPathToCss('//input[@type="text"]')).toBe('input[type="text"]');
  });

  it("converts UL nth-of-type selectors", () => {
    expect(xPathToCss("/HTML/BODY/DIV[@id='menu']/NAV/UL[5]")).toBe(
      "HTML > BODY > DIV#menu > NAV > UL:nth-of-type(5)"
    );

    expect(xPathToCss("/HTML/BODY/DIV[@id='menu']/NAV/UL[10]")).toBe(
      "HTML > BODY > DIV#menu > NAV > UL:nth-of-type(10)"
    );

    expect(xPathToCss("/HTML/BODY/DIV[@id='menu']/NAV/UL[123]")).toBe(
      "HTML > BODY > DIV#menu > NAV > UL:nth-of-type(123)"
    );
  });

  it("converts complex descendant, child, and predicate selectors", () => {
    const actual = xPathToCss(
      '//div[@id="foo"][2]/span[@class="bar"]//a[contains(@class, "baz")]//img[1]'
    );

    const expected =
      'div#foo:nth-of-type(2) > span.bar a[class*="baz"] img:first-of-type';

    expect(actual).toBe(expected);
  });

  it("supports namespaced elements", () => {
    expect(xPathToCss("//div/custom:element")).toBe("div > custom:element");
  });

  it("supports custom elements", () => {
    expect(xPathToCss("//div/custom-element")).toBe("div > custom-element");
  });

  it("treats implicit axis on subsequent steps as child", () => {
    expect(xPathToCss("div/span")).toBe("div > span");
  });

  it("resolves explicit child axis (/)", () => {
    expect(xPathToCss("/div/span")).toBe("div > span");
  });

  it("resolves explicit descendant axis (//)", () => {
    expect(xPathToCss("div//span")).toBe("div span");
  });

  it("resolves following-sibling axis", () => {
    expect(xPathToCss("div/following-sibling::span")).toBe("div + span");
  });

  it("converts tag presence predicates to :has()", () => {
    expect(xPathToCss("//div[img]")).toBe("div:has(> img)");
  });

  it("converts negated tag predicates to :not(:has())", () => {
    expect(xPathToCss("//div[not(span)]")).toBe("div:not(:has(> span))");
  });

  it("converts multi-condition predicates connected by 'and'", () => {
    const actual = xPathToCss("//ul/li[img and span and not(i)]/span");
    const expected = "ul > li:has(> img):has(> span):not(:has(> i)) > span";

    expect(actual).toBe(expected);
  });

  it("correctly queries HTML nodes based on child element presence", () => {
    const html = `
      <section>
        <div id="target"><img src="a.png"><span>Valid Target</span></div>
        <div id="ignored-1"><i><img src="b.png"></i><span>Ignored Nested</span></div>
        <div id="ignored-2"><span>No Image</span></div>
      </section>
    `;

    const { document } = parseHTML(html);

    // 1. Target container with direct <img> and <span>, but no <i>
    const selector = xPathToCss("//section/div[img and span and not(i)]/span");
    const el = document.querySelector(selector);
    expect(el?.textContent?.trim()).toBe("Valid Target");

    // 2. Query for element missing a specific child
    const noSpanSelector = xPathToCss("//section/div[not(span)]");
    const noSpanEl = document.querySelector(noSpanSelector);
    expect(noSpanEl).toBeNull();
  });

  it("converts negated attribute predicates to :not([attr])", () => {
    expect(xPathToCss("//li[not(@data-tooltip)]")).toBe("li:not([data-tooltip])");
  });

  it("converts complex multi-conditions with negated attributes", () => {
    const actual = xPathToCss(
      "//ul[@class='entry__pvpteam__info']/li[img and span and not(i) and not(@data-tooltip)]/span"
    );
    const expected =
      "ul.entry__pvpteam__info > li:not([data-tooltip]):has(> img):has(> span):not(:has(> i)) > span";

    expect(actual).toBe(expected);
  });

  it("correctly filters DOM elements using negated attribute predicates", () => {
    const html = `
      <section>
        <div id="valid"><span>Active Item</span></div>
        <div id="ignored" data-disabled="true"><span>Disabled Item</span></div>
      </section>
    `;

    const { document } = parseHTML(html);

    // Should only match the <span> inside the <div> without the data-disabled attribute
    const selector = xPathToCss("//section/div[not(@data-disabled)]/span");
    const el = document.querySelector(selector);

    expect(el?.textContent?.trim()).toBe("Active Item");
  });

  it("converts live XPath from unjs.io", async () => {
    const res = await fetch("https://unjs.io/", {
      headers: {
        "User-Agent": `${pkg.name}/${pkg.version} (${runtime}; +${pkg.homepage})`,
      },
    });

    const { document } = parseHTML(await res.text());

    const css = xPathToCss(
      "/html/body/div[2]/div[3]/main/section[1]/div[1]/div[1]/h1"
    );

    const el = document.querySelector(css);

    expect(el?.textContent.trim()).toBe(
      "Unleash JavaScript's Potential with the UnJS Ecosystem"
    );
  });
});
