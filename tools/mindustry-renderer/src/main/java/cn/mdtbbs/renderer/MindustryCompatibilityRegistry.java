package cn.mdtbbs.renderer;

import mindustry.game.Schematic;

import java.util.List;
import java.util.Map;

/** Curated content introduction facts. Add only entries backed by official release history. */
final class MindustryCompatibilityRegistry {
    private static final Map<String, Integer> BLOCK_MINIMUM_BUILDS = Map.ofEntries(
        Map.entry("beryllium-wall", 135),
        Map.entry("beryllium-wall-large", 135),
        Map.entry("tungsten-wall", 135),
        Map.entry("tungsten-wall-large", 135),
        Map.entry("reinforced-conduit", 135),
        Map.entry("reinforced-duct", 135),
        Map.entry("reinforced-liquid-junction", 135),
        Map.entry("reinforced-liquid-router", 135),
        Map.entry("reinforced-liquid-container", 135),
        Map.entry("reinforced-liquid-tank", 135),
        Map.entry("duct", 135),
        Map.entry("duct-router", 135),
        Map.entry("duct-bridge", 135),
        Map.entry("duct-unloader", 135),
        Map.entry("core-bastion", 135),
        Map.entry("core-citadel", 135),
        Map.entry("core-acropolis", 135)
    );

    private MindustryCompatibilityRegistry() {}

    static Inference infer(Schematic schematic, List<String> unknownBlocks, boolean knownFormat) {
        if (!unknownBlocks.isEmpty() || !knownFormat) return new Inference(null, "unknown", "low");
        int minimum = 0;
        boolean matched = false;
        for (Schematic.Stile tile : schematic.tiles) {
            if (tile.block == null) return new Inference(null, "unknown", "low");
            // Config serializer introduction facts are intentionally fail-closed:
            // until a serializer is entered in this registry, configured content
            // cannot establish a reliable minimum client build.
            if (tile.config != null) return new Inference(null, "unknown", "low");
            Integer build = BLOCK_MINIMUM_BUILDS.get(tile.block.name);
            if (build != null) { minimum = Math.max(minimum, build); matched = true; }
        }
        // Common older blocks do not by themselves prove an exact minimum.
        if (!matched) return new Inference(null, "unknown", "low");
        return new Inference(minimum, "inferred", "medium");
    }

    record Inference(Integer minimumSupportedBuild, String source, String confidence) {}
}
