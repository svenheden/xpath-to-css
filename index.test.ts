import * as CSSselect from "css-select";
import { parseHTML } from "linkedom";
import { runtime } from "std-env";
import { describe, expect, it } from "vitest";
import { xPathToCss } from ".";
import pkg from "./package.json" with { type: "json" };

expect.extend({
  toBeValidCss(xpath: string, expected: string) {
    const received = xPathToCss(xpath);
    const pass = received === expected;

    let isValidSyntax = true;
    if (pass) {
      try {
        CSSselect.compile(received);
      } catch {
        isValidSyntax = false;
      }
    }

    return {
      pass: pass && isValidSyntax,
      message: () => {
        if (!pass) {
          return `Expected XPath "${xpath}" to translate to CSS selector:\n  Expected: ${expected}\n  Received: ${received}`;
        }
        return `Expected CSS selector "${received}" to be syntactically valid according to CSS specs.`;
      },
    };
  },
});

declare module "vitest" {
  interface Assertion<T> {
    toBeValidCss(expectedCss: string): void;
  }
}

describe("Axes and Combinators", () => {
  it("should handle default descendant selectors (//)", () => {
    expect("//h1").toBeValidCss("h1");
    expect("//div//p").toBeValidCss("div p");
  });

  it("should handle child selectors (/) and root (:root)", () => {
    expect("//ul/li").toBeValidCss("ul > li");
    expect("//ul/li/a").toBeValidCss("ul > li > a");
    expect("//div/*").toBeValidCss("div >");
    expect("/").toBeValidCss("root");
    expect("/body").toBeValidCss("body");
  });

  it("should handle explicit axis tokens", () => {
    expect("//ul/child::li").toBeValidCss("ul > li");
    expect("//div/descendant-or-self::h4").toBeValidCss("div > h4");
    expect("//h1/following-sibling::ul").toBeValidCss("h1 + ul");
  });

  it("should handle unsupported or reset axes gracefully", () => {
    expect("//li/ancestor-or-self::section").toBeValidCss("section");
  });
});

describe("Functions and Complex Expressions", () => {
  it("should handle string matching functions", () => {
    expect("//a[starts-with(@href, '/')]").toBeValidCss('a[href^="/"]');
    expect("//a[ends-with(@href, '.pdf')]").toBeValidCss('a[href$=".pdf"]');
    expect("//a[contains(@href, '://')]").toBeValidCss('a[href*="://"]');
  });

  it("should handle boolean negation function (not)", () => {
    expect("//h1[not(@id)]").toBeValidCss("h1:not([id])");
    expect('//button[not(starts-with(text(),"Submit"))]').toBeValidCss(
      "button"
    );
  });

  it("should handle unions (|)", () => {
    expect("//a | //span").toBeValidCss("a, span");
  });

  it("should handle unsupported functions or complex expressions gracefully", () => {
    expect('//button[text()="Submit"]').toBeValidCss("button");
    expect("//ul[count(li) > 2]").toBeValidCss("ul");
    expect("//product[@price > 2.50]").toBeValidCss("product");
  });

  it("should handle extreme complex edge cases", () => {
    expect(
      '//div[@id="main"]/section[position()>1][not(contains(@class, "hidden"))]//article[last()][ends-with(@data-v, "99")] | //aside[@role="complementary"]/p[text()="Sponsored"]'
    ).toBeValidCss(
      'div#main > section:not(:first-of-type):not([class*="hidden"]) article:last-of-type[data-v$="99"], aside[role="complementary"] > p'
    );
  });
});

describe("Predicates", () => {
  it("should handle ID and attribute selectors", () => {
    expect('//*[@id="id"]').toBeValidCss("#id");
    expect('//div[@class="foo bar"]').toBeValidCss("div.foo.bar");
    expect('//input[@type="submit"]').toBeValidCss('input[type="submit"]');
    expect("//a[@rel]").toBeValidCss("a[rel]");
  });

  it("should handle chained attributes", () => {
    expect('//a[@id="abc"][@for="xyz"]').toBeValidCss('a#abc[for="xyz"]');
  });

  it("should handle order and indexing selectors", () => {
    expect("//ul/li[1]").toBeValidCss("ul > li:first-of-type");
    expect("//ul/li[2]").toBeValidCss("ul > li:nth-of-type(2)");
    expect("//ul/li[last()]").toBeValidCss("ul > li:last-of-type");
    expect("//ol/li[position()>1]").toBeValidCss("ol > li:not(:first-of-type)");
  });

  it("should handle class checks and workarounds", () => {
    expect('//*[.="class"]').toBeValidCss("");
    expect(
      "//div[contains(concat(' ',normalize-space(@class),' '),' ')]"
    ).toBeValidCss("div");
  });
});

describe("DOM and Runtime Integration", () => {
  it("should correctly query HTML nodes based on child element presence", () => {
    const html = `
      <section>
        <div id="target"><img src="a.png"><span>Valid Target</span></div>
        <div id="ignored-1"><i><img src="b.png"></i><span>Ignored Nested</span></div>
        <div id="ignored-2"><span>No Image</span></div>
      </section>
    `;
    const { document } = parseHTML(html);

    const selector = xPathToCss("//section/div[img and span and not(i)]/span");
    const el = document.querySelector(selector);

    expect(el?.textContent?.trim()).toBe("Valid Target");
  });

  it("should correctly filter DOM elements using negated attribute predicates", () => {
    const html = `
      <section>
        <div id="valid"><span>Active Item</span></div>
        <div id="ignored" data-disabled="true"><span>Disabled Item</span></div>
      </section>
    `;
    const { document } = parseHTML(html);

    const selector = xPathToCss("//section/div[not(@data-disabled)]/span");
    const el = document.querySelector(selector);

    expect(el?.textContent?.trim()).toBe("Active Item");
  });

  it("should convert live XPath from unjs.io successfully", async () => {
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

    expect(el?.textContent?.trim()).toBe(
      "Unleash JavaScript's Potential with the UnJS Ecosystem"
    );
  });
});
