# XPath to CSS

![Tests][tests-badge]
[![NPM version][npm-image]][npm-url]

Utility function for converting XPath expressions to CSS selectors.

Originally written in Python by [santiycr](https://github.com/santiycr) for [cssify](https://github.com/santiycr/cssify) and ported to JavaScript by [Dither](https://github.com/Dither) who published it in [this gist](https://gist.github.com/Dither/1909679). Since I needed it in a project and can't depend on a gist in my `package.json` I have converted it to ES2015 and CommonJS, cleaned it up a bit and [published it to npm][npm-url].

## Install

```
$ npm install --save xpath-to-css
```

## Usage

```js
import xPathToCss from "xpath-to-css";

const xPath =
  '//div[@id="foo"][2]/span[@class="bar"]//a[contains(@class, "baz")]//img[1]';
const css = xPathToCss(xPath);
console.log(css); // => 'div#foo:nth-of-type(2) > span.bar a[class*=baz] img:first-of-type'
```

## License

MIT © [Jonathan Svenheden](https://github.com/svenheden)

[npm-url]: https://npmjs.org/package/xpath-to-css
[npm-image]: https://badge.fury.io/js/xpath-to-css.svg
[tests-badge]: https://github.com/svenheden/xpath-to-css/workflows/Tests/badge.svg
