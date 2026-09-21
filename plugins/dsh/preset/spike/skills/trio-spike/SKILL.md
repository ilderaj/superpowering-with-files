# Trio Spike Marker Skill

A marker skill for the swf-spike preset: proves that a preset-local `skills/`
directory is discovered and loadable alongside `agent.cordis.yml` (the same
mechanism the full SWF preset will use to carry the vendored trio / dev /
office / safety / chiefops skills).

## When to use

Only during the spike run: if this skill appears in the catalog, preset-local
skill mounting works. Nothing else to do.