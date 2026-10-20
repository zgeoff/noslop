# Changelog

## [0.4.5](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.4.4...@noslop/cli@0.4.5) (2026-10-20)


### Features

* **geo-1501:** check a merge's conflict resolution in a fixes-only run ([#54](https://github.com/zgeoff/noslop/issues/54)) ([67db079](https://github.com/zgeoff/noslop/commit/67db079e5e33bfd923b184ccd91f12b53c2cec14))

## [0.4.4](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.4.3...@noslop/cli@0.4.4) (2026-10-20)

### Features

- **geo-1490:** map a rebased reviewed head for a fixes-only run
  ([#52](https://github.com/zgeoff/noslop/issues/52))
  ([4071fd4](https://github.com/zgeoff/noslop/commit/4071fd441ca341eebcec6ad57b1b7174a0a0c174))

## [0.4.3](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.4.2...@noslop/cli@0.4.3) (2026-10-20)

### Features

- **geo-1515:** match a p1 or security finding by its own id alone
  ([#50](https://github.com/zgeoff/noslop/issues/50))
  ([a243dd8](https://github.com/zgeoff/noslop/commit/a243dd86d9e8e8cf60c50e654af3860cb0cf6467))

## [0.4.2](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.4.1...@noslop/cli@0.4.2) (2026-10-19)

### Features

- **geo-1419:** drop a finding that matches one answered not-a-defect
  ([#48](https://github.com/zgeoff/noslop/issues/48))
  ([3f4a026](https://github.com/zgeoff/noslop/commit/3f4a0260a446c893538e12e0ee0c528e48b5a8f2))

## [0.4.1](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.4.0...@noslop/cli@0.4.1) (2026-10-19)

### Features

- **geo-1372:** count a fixed commit that changes any file of the pr
  ([#45](https://github.com/zgeoff/noslop/issues/45))
  ([d744906](https://github.com/zgeoff/noslop/commit/d7449068e9bf3aa62676ee97dc0035346fff60dc))

## [0.4.0](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.3.0...@noslop/cli@0.4.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1369:** the review result gains the notReviewedByLens list, and its version moves to 7.
- **geo-1294:** a review.json whose rules entry lists skip no longer loads, and the JSON output of
  noslop config drops its warnings key.

### Features

- **geo-1294:** reject a skip list on a rules file
  ([#33](https://github.com/zgeoff/noslop/issues/33))
  ([0da2767](https://github.com/zgeoff/noslop/commit/0da2767d8ceea0005bfa72f4a332be797506c3c0))
- **geo-1344:** replay an eval case as a re-review of a push
  ([#34](https://github.com/zgeoff/noslop/issues/34))
  ([67f525b](https://github.com/zgeoff/noslop/commit/67f525b998fce4b888ca18f4bae96e05328e19dc))
- **geo-1433:** add a design lens from a pull request's second review on
  ([#40](https://github.com/zgeoff/noslop/issues/40))
  ([bc29fe4](https://github.com/zgeoff/noslop/commit/bc29fe48eec08f5f1a201b1889ac125699b20743))
- **geo-1461:** report each new cast disable comment and any claim
  ([#43](https://github.com/zgeoff/noslop/issues/43))
  ([9e6c271](https://github.com/zgeoff/noslop/commit/9e6c2712e05ec4038fb0bdf0b05f0ca46ae984d1))
- **geo-1477:** add a fixes-only run that checks each fixed answer
  ([#44](https://github.com/zgeoff/noslop/issues/44))
  ([8a9716f](https://github.com/zgeoff/noslop/commit/8a9716f50e9b71f03b2d5a9e5ea34b098303c6c0))

### Bug Fixes

- **geo-1343:** skip a synced caller that only moves its workflow ref
  ([#32](https://github.com/zgeoff/noslop/issues/32))
  ([bc6285b](https://github.com/zgeoff/noslop/commit/bc6285ba50ec80b505993f68db6d4b2716a65c59))
- **geo-1361:** count a fixed sha that a rebase rewrote
  ([#31](https://github.com/zgeoff/noslop/issues/31))
  ([1aa0f3c](https://github.com/zgeoff/noslop/commit/1aa0f3c68ec2d09e0e1988653b7df7fd923d38e2))
- **geo-1369:** confirm no fix through a lens that left out the file
  ([#41](https://github.com/zgeoff/noslop/issues/41))
  ([4508bec](https://github.com/zgeoff/noslop/commit/4508bec3e2f01ca8631e812441e00e6ddf9d67a4))
- **geo-1394:** review only the pr's own files after a merge from main
  ([#36](https://github.com/zgeoff/noslop/issues/36))
  ([12931ff](https://github.com/zgeoff/noslop/commit/12931fff5193e526ae03ff536263e67a6f503a54))
- **github:** keep a later summary when an earlier post is retried
  ([#37](https://github.com/zgeoff/noslop/issues/37))
  ([aebde36](https://github.com/zgeoff/noslop/commit/aebde360a9f4d269f785394b4aeb468fe8752baa))

## [0.3.0](https://github.com/zgeoff/noslop/compare/@noslop/cli@0.2.1...@noslop/cli@0.3.0) (2026-10-18)

### ⚠ BREAKING CHANGES

- **review:** the review result gains the notReviewed list, and its version moves to 6.

### Features

- **cli:** fail the check when no review covers the head
  ([#18](https://github.com/zgeoff/noslop/issues/18))
  ([2f1fd59](https://github.com/zgeoff/noslop/commit/2f1fd59edc825567d3e32289d6599bbcd84be9c0))
- **cli:** post a verified review result as the app
  ([#17](https://github.com/zgeoff/noslop/issues/17))
  ([bbaf38b](https://github.com/zgeoff/noslop/commit/bbaf38bdd85378d379d68838edb67ab9d2929e7a))
- **cli:** verify a review result against its pull request
  ([#16](https://github.com/zgeoff/noslop/issues/16))
  ([eb666d2](https://github.com/zgeoff/noslop/commit/eb666d23cdc2a60b9e21ebcb0e4c915dda2c273b))
- **review:** split a call over the prompt limit by file
  ([#15](https://github.com/zgeoff/noslop/issues/15))
  ([9092b87](https://github.com/zgeoff/noslop/commit/9092b87c5cd117cfe38ddd9a7829993083a13954))

### Bug Fixes

- **review:** leave the description unjudged on a re-review
  ([#13](https://github.com/zgeoff/noslop/issues/13))
  ([b390191](https://github.com/zgeoff/noslop/commit/b39019141b9150c329f535f986297820885a75b5))

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
