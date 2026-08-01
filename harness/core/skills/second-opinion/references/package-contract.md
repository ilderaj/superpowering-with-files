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

The output path, timestamps, source absolute paths, and machine-specific values are never
included in the manifest or package hash. Identical inputs and disclosure metadata therefore
produce identical packages in different directories. A package hash proves deterministic
packaging and byte integrity; it does not prove semantic losslessness or that any Web action
occurred.

The builder rejects an unsupported mode, missing or non-regular prompt/attachment, invalid
UTF-8 prompt, empty prompt, a prompt over 18,000 characters, duplicate attachment sources,
duplicate attachment basenames, unknown arguments, and an already existing output directory.
