const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('main.js', 'utf8');
const context = vm.createContext({ module:{exports:{}}, require: name => {
  if(name !== 'obsidian') throw new Error('Unexpected dependency: '+name);
  class Base {}
  return {Plugin:Base,Modal:Base,SuggestModal:Base,ItemView:Base,PluginSettingTab:Base};
}});
vm.runInContext(source, context);
const preview = context.module.exports.extractPreview;
const body = '## Section\n\n**bold** and *italic*\n\n- first\n  - nested\n\n[link](https://example.com)\n\n```js\nconst a = 1;\n```\n\n- [ ] task';
assert.equal(preview('---\ncolor: red\n---\n# Title\n' + body), body);
assert.equal(preview('    # code, not a heading\n    indented code'), '    # code, not a heading\n    indented code');
assert.equal(preview('# Title\n\nline with hard break  \nnext'), 'line with hard break  \nnext');
console.log('PASS: card Markdown preserves headings, paragraphs, nesting, links, fences and tasks.');
