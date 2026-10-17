import { expect, test } from 'bun:test';
import { mergeConfigLayers } from './merge-config-layers';

test('it merges objects by key and records the source of each leaf', () => {
  expect(
    mergeConfigLayers([
      { source: 'defaults', value: { lenses: { security: { effort: 'medium' } }, rules: null } },
      { source: 'review.json', value: { lenses: { reuse: { model: 'small' } } } },
    ]),
  ).toStrictEqual({
    value: { lenses: { security: { effort: 'medium' }, reuse: { model: 'small' } } },
    sources: {
      'lenses.security.effort': 'defaults',
      'lenses.reuse.model': 'review.json',
    },
  });
});

test('it replaces an array instead of joining it', () => {
  expect(
    mergeConfigLayers([
      { source: 'defaults', value: { report: ['json'] } },
      { source: 'review.json', value: { report: ['github', 'sqlite'] } },
    ]),
  ).toStrictEqual({
    value: { report: ['github', 'sqlite'] },
    sources: { report: 'review.json' },
  });
});

test('it removes an inherited key that a later layer sets to null', () => {
  expect(
    mergeConfigLayers([
      {
        source: 'defaults',
        value: { riskClasses: { auth: { paths: ['src/auth/**'] }, money: { paths: [] } } },
      },
      { source: 'review.json', value: { riskClasses: { money: null } } },
    ]),
  ).toStrictEqual({
    value: { riskClasses: { auth: { paths: ['src/auth/**'] } } },
    sources: { 'riskClasses.auth.paths': 'defaults' },
  });
});

test('it drops a null inside an object that no earlier layer holds', () => {
  expect(
    mergeConfigLayers([
      { source: 'defaults', value: { lenses: {} } },
      { source: 'review.json', value: { lenses: { security: { model: 'small', effort: null } } } },
    ]),
  ).toStrictEqual({
    value: { lenses: { security: { model: 'small' } } },
    sources: { 'lenses.security.model': 'review.json' },
  });
});

test('it replaces a scalar with an object and takes the object leaves from the later layer', () => {
  expect(
    mergeConfigLayers([
      { source: 'parent', value: { thresholds: 1 } },
      { source: 'child', value: { thresholds: { chunkLines: 100 } } },
    ]),
  ).toStrictEqual({
    value: { thresholds: { chunkLines: 100 } },
    sources: { 'thresholds.chunkLines': 'child' },
  });
});
