# Changelog

## [0.3.0](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.2.1...@noslop/cli@0.3.0) (2026-10-18)


### ⚠ BREAKING CHANGES

* **review:** the review result gains the notReviewed list, and its version moves to 6.

### Features

* **cli:** fail the check when no review covers the head ([#18](https://github.com/zgeoff/noslop/issues/18)) ([2f1fd59](https://github.com/zgeoff/noslop/commit/2f1fd59edc825567d3e32289d6599bbcd84be9c0))
* **cli:** post a verified review result as the app ([#17](https://github.com/zgeoff/noslop/issues/17)) ([bbaf38b](https://github.com/zgeoff/noslop/commit/bbaf38bdd85378d379d68838edb67ab9d2929e7a))
* **cli:** verify a review result against its pull request ([#16](https://github.com/zgeoff/noslop/issues/16)) ([eb666d2](https://github.com/zgeoff/noslop/commit/eb666d23cdc2a60b9e21ebcb0e4c915dda2c273b))
* **review:** split a call over the prompt limit by file ([#15](https://github.com/zgeoff/noslop/issues/15)) ([9092b87](https://github.com/zgeoff/noslop/commit/9092b87c5cd117cfe38ddd9a7829993083a13954))


### Bug Fixes

* **review:** leave the description unjudged on a re-review ([#13](https://github.com/zgeoff/noslop/issues/13)) ([b390191](https://github.com/zgeoff/noslop/commit/b39019141b9150c329f535f986297820885a75b5))

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
