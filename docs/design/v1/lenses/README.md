# Lenses

Each page is one lens's prompt section, word for word as the model reads it, under a header that
noslop reads and the model never sees. [Calls](../calls.md) covers how a call joins the sections of
the lenses that fired, after a shared header with the finding rules, the severity criteria, the
verdict rules and the output schema. When the lenses module lands, each prompt moves into its
package and its page is deleted.

| Lens                                                                        | Call |
| --------------------------------------------------------------------------- | ---- |
| [Correctness](correctness.md)                                               | A    |
| [Failure handling and observability](failure-handling-and-observability.md) | A    |
| [Concurrency and data integrity](concurrency-and-data-integrity.md)         | A    |
| [Security and input trust](security.md)                                     | B    |
| [Architecture and boundaries](architecture-and-boundaries.md)               | C    |
| [Naming, shape and comments](naming-shape-and-comments.md)                  | C    |
| [Cross-repo and platform limits](cross-repo-and-platform-limits.md)         | D    |
| [Deploy and config](deploy-and-config.md)                                   | D    |
| [Intent](intent.md)                                                         | E    |
| [Tests](tests.md)                                                           | E    |
| [Reuse](reuse.md)                                                           | F    |
| [Instructions](instructions.md)                                             | G    |
| [Documentation](documentation.md)                                           | H    |
