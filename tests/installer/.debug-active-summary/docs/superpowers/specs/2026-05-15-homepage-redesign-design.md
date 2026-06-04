# Homepage Redesign Design

Date: 2026-05-15
Surface: `homepage/`
Status: approved direction

## Summary

The homepage redesign should follow the existing `homepage/DESIGN.md` visual system while replacing the current restrained product-intro hero with a clearer, more forceful landing page narrative.

The selected direction is:

**B1 structure + a more manifesto-leaning hero**

This means the homepage should stay readable and explanatory, but the opening claim should feel more declarative and memorable. The page should no longer feel like a polite project summary. It should feel like a confident statement about a better way to work.

Core message:

> Stop losing good judgment.

The homepage must explain that the project combines two strengths:

- planning files preserve durable visible state
- superpowers provide deeper reasoning when complexity justifies it

The homepage should make the relationship obvious:

**Breadth + Depth = Hybrid workflow**

## Goals

1. Explain what the project is within the first screen.
2. Make the combined value of planning files and superpowers immediately legible.
3. Keep the page visually aligned with `homepage/DESIGN.md`.
4. Increase hero impact without making the page vague or purely atmospheric.
5. Guide users toward GitHub and workflow documentation.

## Non-goals

- Do not turn the homepage into a generic SaaS marketing page.
- Do not add decorative sections that do not strengthen understanding.
- Do not move away from the existing dark engineering-led visual language.
- Do not overextend the page with too many feature grids or repetitive claims.

## Chosen Narrative Direction

The page should feel like a declaration first and an explanation second.

However, it must remain more concrete than a pure brand manifesto. The selected balance is:

- stronger emotional claim in the hero
- immediate structural proof beside or just below the hero
- compact comparison that clarifies why the combination matters
- short downstream sections that point to real repo artifacts and workflow behavior

In short:

**This homepage is not introducing a project. It is declaring a better operating model, then proving it.**

## Information Architecture

The homepage should contain five sections.

### 1. Hero

Purpose:
- establish the main claim
- define the system in one screen
- create visual weight and memorability

Structure:
- left side: manifesto-style headline, short explanatory paragraph, primary CTAs
- right side: compact structural proof showing Breadth + Depth = Hybrid

Recommended hero headline direction:
- `Stop losing good judgment.`

Recommended supporting copy direction:
- Hard work deserves stronger reasoning.
- Important decisions deserve a visible trail.
- This workflow does both in the same repo-native system.

CTA set:
- `View source`
- `Read workflow`

### 2. Comparison strip

Purpose:
- show why the combined model is better than either capability alone

Structure:
- three cards in a row:
  - Only breadth
  - Only depth
  - Both

Recommended copy direction:
- Only breadth: state survives, but judgment does not improve
- Only depth: judgment improves, but durable state fades
- Both: deeper judgment lands back into visible planning state

This strip should be short and decisive. It should not become a long argument.

### 3. How routing works

Purpose:
- explain that the system does not use heavy reasoning everywhere
- reinforce that complexity determines escalation

Content direction:
- simple explanation of routing by task complexity
- emphasize that ordinary tasks stay fast
- emphasize that difficult tasks earn deeper handling

This section should feel operational, not inspirational.

### 4. What lives in files / repo proof

Purpose:
- anchor the claims in concrete artifacts
- show that the trail is real, not conceptual

Content direction:
- plans
- findings
- progress
- task state
- workflow traces
- documentation entry points

This section should point to real repo-native outputs instead of introducing abstract feature claims.

### 5. Closing CTA

Purpose:
- end cleanly
- direct users to source and docs

Constraints:
- no bloated footer-marketing stack
- no additional vanity sections
- keep the close concise and deliberate

## Visual Direction

The redesign should stay inside the current design system from `homepage/DESIGN.md`.

### Must retain

- near-black canvas
- white high-contrast type
- uppercase display language
- hard-edged geometry
- restrained, rare use of BMW M tricolor accents
- engineered, editorial, controlled feeling

### Should strengthen

- hero scale and dominance
- typographic force in the first screen
- visual hierarchy between claim, proof, and follow-up sections
- sense of a flagship entry point rather than a modest project summary

### Should avoid

- airy startup marketing tropes
- soft rounded consumer-product styling
- decorative color usage beyond the allowed accent role
- image-heavy drama that obscures comprehension
- adding content just to fill space

## Hero Design Rules

The hero is the most important change.

Rules:
- it must feel more forceful than the current homepage
- it must still explain the system clearly within one screen
- the proof block must stay tightly connected to the claim
- the page must not require scrolling before the core model becomes understandable

The hero should communicate this sequence almost instantly:

1. a strong claim
2. what the system combines
3. why that combination matters
4. where to go next

## Tone

The tone should be:
- declarative
- controlled
- technical
- confident
- concise

The tone should not be:
- hypey
- vague
- chatty
- whimsical
- overloaded with buzzwords

## Recommended Copy Posture

The homepage copy should use short, high-conviction lines.

Good examples of tone direction:
- `Stop losing good judgment.`
- `Files keep state.`
- `Superpowers sharpen hard calls.`
- `One workflow. Routed by complexity.`
- `Judgment lands as state.`

The copy should prefer claims that can be supported by the next visual block or repo proof.

## Component Priorities

If implementation scope needs to stay tight, prioritize these in order:

1. hero redesign
2. comparison strip rewrite
3. hybrid proof block
4. concise repo-proof section
5. closing CTA cleanup

Everything else is secondary.

## Error Handling / Failure Modes

The redesign should avoid these failure modes:

1. **Too polite**
   - The hero explains but does not land emotionally.
2. **Too abstract**
   - The hero sounds strong but leaves the system unclear.
3. **Too long**
   - Supporting sections repeat what the hero already said.
4. **Too decorative**
   - Visual treatment overwhelms comprehension.
5. **Too product-marketing**
   - The page starts to resemble a generic SaaS landing page instead of a repo-native system homepage.

## Accessibility and Responsiveness

The redesign should preserve practical clarity across breakpoints.

Requirements:
- maintain strong contrast
- preserve one-screen comprehension at desktop
- collapse the hero proof block cleanly on smaller widths
- keep CTA targets clear and simple
- do not rely on color alone for meaning
- keep motion optional and restrained

## Testing Approach

The implementation should be evaluated against these questions:

1. Can a new visitor understand the project in the first screen?
2. Is the combined value of files plus superpowers obvious?
3. Does the hero feel stronger without becoming vague?
4. Does the page still look like it belongs to the current `DESIGN.md` system?
5. Does each lower section add new information instead of repeating the headline?

## Acceptance Criteria

This redesign direction is successful if:

- the homepage clearly communicates the hybrid model in the hero
- the hero feels more declarative than the current version
- the page remains grounded in the existing dark engineering-led visual language
- the information architecture is reduced to a focused five-section flow
- GitHub and workflow docs remain the primary exit paths
- the page feels like a confident operating-model homepage rather than a soft project intro

## Final Decision

Approved direction:

**Use the B1 information architecture, but upgrade the hero to a manifesto-leaning declaration while preserving immediate clarity.**
