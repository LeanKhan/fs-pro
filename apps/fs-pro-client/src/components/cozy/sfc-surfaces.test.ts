import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';

/**
 * No jsdom is available in this harness, so every new Track A `.vue` surface is
 * proved to *compile* (parse + `<script setup>` + template) with
 * `@vue/compiler-sfc` — the same gate the grid/scout/campus tests use. That
 * catches malformed SFC blocks, template syntax errors and macro misuse; the
 * runtime logic lives in the pure helper suites.
 */
const VUE_FILES = [
  './club-hub.vue',
  './defense-inbox.vue',
  './league-ladder.vue',
  './season-panel.vue',
  './legacy-panel.vue',
  './abilities-panel.vue',
  './association-panel.vue',
  './preseason-panel.vue',
].map((name) => fileURLToPath(new URL(name, import.meta.url)));

for (const file of VUE_FILES) {
  const name = file.split(/[\\/]/).pop();
  describe(`SFC compiles: ${name}`, () => {
    const source = readFileSync(file, 'utf8');
    const parsed = parse(source, { filename: file });

    it('parses with no SFC errors and has the expected blocks', () => {
      assert.deepEqual(parsed.errors, []);
      assert.ok(parsed.descriptor.template, 'has a <template>');
      assert.ok(parsed.descriptor.scriptSetup, 'has <script setup>');
    });

    it('compiles <script setup> and the template', () => {
      const id = `sfc-${name}`;
      const script = compileScript(parsed.descriptor, { id });
      assert.ok(script.content.length > 0, 'script output is non-empty');

      const template = parsed.descriptor.template;
      assert.ok(template, 'has a <template>');
      const compiled = compileTemplate({
        source: template.content,
        filename: file,
        id,
        compilerOptions: { expressionPlugins: ['typescript'] },
      });
      assert.deepEqual(compiled.errors, []);
      assert.match(
        compiled.code,
        /function render|const _hoisted|export function render/
      );
    });
  });
}
