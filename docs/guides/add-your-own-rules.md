# Add your own rules

noslop ships no rule set, so the taste lenses report only what your rules file says. You write the
rules as Markdown, point the `rules` key of `review.json` at the file, and check the result with
`noslop config`. To share one set of rules across several repos, keep it in a config repo that each
repo extends. [Your own rules](../architecture/config/your-own-rules.md) covers how a review reads
the rules and cites them, and [the reviewer config](../architecture/config/review-config.md) covers
how the files of an `extends` chain merge.

## Write a rules file

Write each rule as Markdown prose, under a level-2 or level-3 heading. noslop reads the file whole
and reads no structure into it, so a skill or a style guide your agents load works unchanged.

- Write each rule in at least one full sentence. A taste finding quotes your file word for word and
  drops when the quote is not in it, so a rule written as a fragment gives the lens nothing to
  quote.
- Give each section a heading of its own. A taste finding takes the nearest heading above its quote
  as its rule, such as `rules.md: Error handling`, and the findings store counts the findings of
  each section.
- Keep example code in code blocks. A heading inside a code block labels nothing.

```markdown
## Error handling

Never swallow an error in a catch block. Rethrow it, or log it with the input that caused it.
```

## Point review.json at the file

1. Add the `rules` key to the `review.json` at the repo root. A path resolves against the
   `review.json` that holds it:

   ```json
   {
     "rules": "./rules.md"
   }
   ```

2. To give the lenses more than one file, list them. The lenses read every file that applies to the
   change, each under its label, which is the path as you wrote it unless the entry sets `label`.

   ```json
   {
     "rules": ["./rules.md", "./.claude/skills/testing/SKILL.md"]
   }
   ```

3. To load a file only for some changes, make it a reference of an entry. The `references` map takes
   each file, relative to the entry's file, to the path globs that load it, so a rule for Nix files
   costs a TypeScript change nothing:

   ```json
   {
     "rules": [
       {
         "path": "./.claude/skills/testing/SKILL.md",
         "references": { "references/nixos.md": ["**/*.nix"] }
       }
     ]
   }
   ```

A rules file that does not exist fails the load with `the rules file <label> does not exist`.

## Extend a shared config repo

Keep the shared rules and their `review.json` in a repo of their own, and have each repo extend it.

1. In the shared repo, write a `review.json` whose `rules` name the files each repo holds, with a
   `repo:` prefix. A `repo:` path resolves against the reviewed repo, not the shared one:

   ```json
   {
     "rules": ["repo:.claude/skills/code-style/SKILL.md", "repo:.claude/skills/testing/SKILL.md"]
   }
   ```

   A path without the prefix resolves inside the shared repo, so a rules file that sits beside the
   shared `review.json` works too.

2. In each repo, extend the shared file:

   ```json
   {
     "extends": "github:<owner>/<config_repo>",
     "rules": ["./rules.md"]
   }
   ```

   `github:<owner>/<repo>` reads `review.json` from that repo's default branch. Add `/<path>` to
   read another file, or `@<ref>` to pin a branch, tag or commit.

3. Make the shared repo public, or run noslop with the GitHub App's credentials in the environment.
   Without them, noslop reads GitHub anonymously and reaches only public repos.

The repo's own `rules` list appends to the shared one. An entry whose path matches a shared entry
replaces it, so a repo can change that file's references. `"rules": null` drops every inherited
file. A `repo:` file the repo does not hold gives no rule, and the load goes on.

## Check the result

Run `noslop config` from inside the repo:

```bash
noslop config
```

1. The `chain:` line lists every file of the chain, from `built-in` to the repo's own `review.json`.
   A remote parent reads as `github:<owner>/<repo>/review.json`.
2. The `rules` line holds the merged list, each entry with its resolved path and its label. Its
   source in parentheses is the last file that set `rules`.
3. Each `repo:` file the repo lacks prints its own line:
   `rules file not in this repo, so no rules from it: <label>`.
4. An entry that lists `skip` prints a `warning:` line, because noslop reads each file whole and
   ignores the list.

The first line, `config <hash>`, changes when the config or the text of any rules file changes. Two
reviews with the same hash ran under the same rules, so you can compare their findings in the
findings store.

To see a rule cited, run `noslop review` on a change that breaks it. The taste finding's rule is the
file's label and the heading above the quote.
