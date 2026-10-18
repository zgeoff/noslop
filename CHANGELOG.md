# Changelog

## [0.2.1](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.2.0...@noslop/cli@0.2.1) (2026-10-18)

### Features

- **cli:** export the review contract with its declarations
  ([492cd40](https://github.com/zgeoff/noslop/commit/492cd4002500b4d98c5874c81d87ac2cf80cab07))

## [0.2.0](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.1.0...@noslop/cli@0.2.0) (2026-10-18)

### ⚠ BREAKING CHANGES

- **config:** a review from before this version never matches the config hash of a review from after
  it, in the findings store or the eval.

### Features

- **cli:** review a change under the config of its base commit
  ([28c540c](https://github.com/zgeoff/noslop/commit/28c540c43bf4f8cb23806ea974bdd297e4374932))
- **cli:** take the linked issue from --issue-file
  ([d5ab301](https://github.com/zgeoff/noslop/commit/d5ab301b8eb803453ee1bfac5c20839b2e432565))

### Bug Fixes

- **config:** hash local rules paths relative to the repo
  ([7e2f671](https://github.com/zgeoff/noslop/commit/7e2f6711349afbfb356a3497838f3206f84e800d))
- **config:** mark the config hash change as breaking
  ([59e734f](https://github.com/zgeoff/noslop/commit/59e734ff6aea2b5c82275c15dcce63b48821d9a8))
- **testing:** keep a git hook's repo out of test repos
  ([440fb84](https://github.com/zgeoff/noslop/commit/440fb84e512d329aeef70507ca1d3f2cb46d1ef5))
