# @miichom/xpath2css

[![npm](https://img.shields.io/npm/v/@miichom/xpath2css.svg)](https://www.npmjs.com/package/@miichom/xpath2css)
![node](https://img.shields.io/node/v/@miichom/xpath2css)

A lightweight, dependency‑free utility for converting XPath selectors into CSS selectors. Ideal for scrapers, DOM utilities, testing frameworks, and environments where XPath is stored but CSS is executed.

This package is a modern TypeScript rewrite of the original Python [cssify](https://github.com/santiycr/cssify) converter created by [santiycr](https://github.com/santiycr). It was later ported to JavaScript by [Dither](https://github.com/Dither), and subsequently converted to ES2015 and CommonJS, and published to npm by [svenheden](https://github.com/svenheden).

## Install

```bash
npm install @miichom/xpath2css
```

## Basic Usage

```ts
// npm, pnpm, yarn, bun
import { xPathToCss } from "@miichom/xpath2css";

// deno
import { xPathToCss } from "https://esm.sh/@miichom/xpath2css";
import { xPathToCss } from "npm:@miichom/xpath2css"; // or directly from npm

const xPath =
  '//div[@id="foo"][2]/span[@class="bar"]//a[contains(@class, "baz")]//img[1]';
const css = xPathToCss(xPath);
console.log(css); // => 'div#foo:nth-of-type(2) > span.bar a[class*=baz] img:first-of-type'
```

## Contributing

Contributions, issues, and feature requests are always welcome! If you'd like to help improve the project, feel free to check open issues or submit a pull request. A huge thank you to everyone helping make this package better!

Please review our [Contributor Manual](./CONTRIBUTING.md) before getting started.

## License

MIT &copy; 2015-2026 [Jonathan Svenheden](https://github.com/svenheden), 2026-present [miichom](https://github.com/miichom)
