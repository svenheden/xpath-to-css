var test = require('tape');
var xPathToCss = require('./index');

test('input validation', function(assert) {
  assert.throws(xPathToCss, 'should throw an error if no xpath expression is provided');
  assert.throws(xPathToCss.bind(null, '1'), 'should throw an error if an invalid xpath expression is provided');

  assert.end();
});

test('conversion', function(assert) {
  var actual, expected;

  actual = xPathToCss('/HTML/HEAD/TITLE');
  expected = 'HTML > HEAD > TITLE';
  assert.equal(actual, expected, 'should handle upper case');

  actual = xPathToCss('/html/head/title');
  expected = 'html > head > title';
  assert.equal(actual, expected, 'should handle lower case');

  actual = xPathToCss('/HTML/BODY/DIV[@id=\'menu\']/NAV/UL[5]');
  expected = 'HTML > BODY > DIV#menu > NAV > UL:nth-of-type(5)';
  assert.equal(actual, expected);

  actual = xPathToCss('/HTML/BODY/DIV[@id=\'menu\']/NAV/UL[10]');
  expected = 'HTML > BODY > DIV#menu > NAV > UL:nth-of-type(10)';
  assert.equal(actual, expected);

  actual = xPathToCss('/HTML/BODY/DIV[@id=\'menu\']/NAV/UL[123]');
  expected = 'HTML > BODY > DIV#menu > NAV > UL:nth-of-type(123)';
  assert.equal(actual, expected);

  actual = xPathToCss('//div[@id="foo"][2]/span[@class="bar"]//a[contains(@class, "baz")]//img[1]');
  expected = 'div#foo:nth-of-type(2) > span.bar a[class*="baz"] img:first-of-type';
  assert.equal(actual, expected);

  assert.end();
});
