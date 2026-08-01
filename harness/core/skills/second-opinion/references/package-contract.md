# Package Contract

The package builder creates a fresh output directory containing only:

- `request.md`: the reviewed UTF-8 primary prompt, copied byte-for-byte;
- `manifest.json`: deterministic metadata and integrity receipts;
- `attachments/`: copied attachment files, addressed by stable basename.

## Manifest fields

`schemaVersion` is `1`, and `packageType` is `second-opinion-request`. `mode` is exactly
`review-existing` or `explore-from-context`.

The manifest records:

- `prompt`: path, Unicode character count, byte count, and SHA-256;
- `promptCharCount` and `maxPromptChars` (`18000`);
- `included`, `excluded`, `redactions`, and `sourcePointers` disclosure arrays;
- `attachments`: path, basename, byte count, and SHA-256 for every attachment;
- `files`: integrity metadata for `request.md` and every attachment;
- `packageHash`: a `sha256:<hex>` digest over the canonical manifest without `packageHash`
  plus the exact prompt and attachment bytes in stable path order.

Each `sourcePointers` entry has the form `{ "path": "<package-relative-path>", "pointer": "<non-empty-pointer>" }`.
The CLI accepts repeatable `--source-pointer <package-path>=<pointer>` bindings. Every path in
`included` must have at least one binding, including `request.md` and every attachment; unknown
package paths, missing coverage, empty pointers, and a package with no pointers are rejected.
Bindings are canonicalized in `included` path order and then pointer order before manifest and
package-hash generation. Package paths cannot be absolute, traversal-based, or contain Windows
path separators.

The output path, timestamps, source absolute paths, and machine-specific values are never
included in the manifest or package hash. Identical inputs and disclosure metadata therefore
produce identical packages in different directories. A package hash proves deterministic
packaging and byte integrity; it does not prove semantic losslessness or that any Web action
occurred.

The builder rejects an unsupported mode, missing or non-regular prompt/attachment, invalid
UTF-8 prompt, empty prompt, a prompt over 18,000 characters, duplicate attachment sources,
duplicate attachment basenames, malformed or unsafe source-pointer bindings, unknown package
paths, missing source-pointer coverage, empty pointers, no source pointers, unknown arguments,
and an already existing output directory.
