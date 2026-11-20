package cn.mdtbbs.renderer;

import java.io.DataOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.DeflaterOutputStream;

import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.math.geom.Point2;
import arc.struct.Seq;
import arc.struct.StringMap;
import arc.util.serialization.JsonReader;
import arc.util.serialization.JsonValue;
import arc.util.serialization.JsonWriter;
import mindustry.Vars;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import mindustry.game.Team;
import mindustry.io.MapIO;
import mindustry.maps.Map;
import mindustry.world.Block;
import mindustry.world.blocks.logic.LogicBlock;

/** Regression coverage for the static schematic/map diff endpoints. */
public final class DiffRegression {
    private DiffRegression() {}

    public static void main(String[] args) {
        verify();
    }

    public static void verify() {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Path root;
        try {
            root = Files.createTempDirectory("mindfourm-diff-regression-");
        } catch (java.io.IOException error) {
            throw new AssertionError("could not create the diff fixture directory", error);
        }
        new HeadlessApplication(new ApplicationListener() {
            @Override public void init() {
                try {
                    MapRenderer.initializeForFixture(root);
                    verifySchematicDiff(root);
                    verifyOffsetAndIdenticalLogic(root);
                    verifyUnknownSchematic(root);
                    verifyMapDiff(root);
                } catch (Throwable error) {
                    failure.set(error);
                } finally {
                    Core.app.exit();
                    completed.countDown();
                }
            }
        }, error -> failure.compareAndSet(null, error));

        try {
            require(completed.await(180, TimeUnit.SECONDS), "static diff regression timed out");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new AssertionError("static diff regression was interrupted", error);
        }
        if (failure.get() != null) throw new AssertionError("static diff regression failed", failure.get());
        System.out.println("static diff fixtures passed");
    }

    private static void verifySchematicDiff(Path root) throws Exception {
        Block conveyor = Vars.content.block("conveyor");
        Block router = Vars.content.block("router");
        Block logic = Vars.content.block("logic-processor");
        Block solar = Vars.content.block("solar-panel");
        Block drill = Vars.content.block("laser-drill");
        require(conveyor != null && router != null && logic != null && solar != null && drill != null,
            "schematic diff fixture blocks must be registered");

        Schematic from = new Schematic(new Seq<>(), new StringMap(), 8, 4);
        from.tiles.add(new Schematic.Stile(conveyor, 0, 0, null, (byte)0));
        from.tiles.add(new Schematic.Stile(router, 1, 0, null, (byte)0));
        from.tiles.add(new Schematic.Stile(conveyor, 2, 0, null, (byte)0));
        from.tiles.add(new Schematic.Stile(logic, 3, 0, compressLogic("set x 1\nend"), (byte)0));
        from.tiles.add(new Schematic.Stile(solar, 4, 0, null, (byte)0));
        from.tiles.add(new Schematic.Stile(drill, 5, 0, null, (byte)0));

        Schematic to = new Schematic(new Seq<>(), new StringMap(), 8, 4);
        to.tiles.add(new Schematic.Stile(conveyor, 0, 0, null, (byte)1));
        to.tiles.add(new Schematic.Stile(conveyor, 2, 0, null, (byte)0));
        to.tiles.add(new Schematic.Stile(conveyor, 2, 1, null, (byte)0));
        to.tiles.add(new Schematic.Stile(logic, 3, 0, compressLogic("set x 2\nend"), (byte)0));
        to.tiles.add(new Schematic.Stile(solar, 4, 0, null, (byte)0));
        to.tiles.add(new Schematic.Stile(solar, 4, 1, null, (byte)0));
        to.tiles.add(new Schematic.Stile(drill, 5, 0, null, (byte)0));
        to.tiles.add(new Schematic.Stile(drill, 5, 1, null, (byte)0));

        Path fromFile = root.resolve("diff-from.msch"), toFile = root.resolve("diff-to.msch");
        Schematics.write(from, new Fi(fromFile.toFile()));
        Schematics.write(to, new Fi(toFile.toFile()));

        JsonValue response = new JsonReader().parse(MapRenderer.schematicDiffJson(fromFile, toFile, 0, 0));
        require("full".equals(response.getString("mode", "")), "vanilla schematics must use the full diff mode");
        JsonValue diff = response.get("diff");
        require(diff != null && "schematic".equals(diff.getString("kind", "")), "schematic diff kind must be reported");
        require(diff.get("offset") != null && diff.get("offset").isObject(), "schematic diff must report its offset");
        JsonValue blocks = diff.get("blocks");
        require(!blocks.getBoolean("truncated", true), "a small schematic diff must not be truncated");
        require(findPosition(blocks.get("added"), 2, 1) != null, "an added conveyor must be reported at its coordinates");
        require(findPosition(blocks.get("removed"), 1, 0) != null, "a removed router must be reported at its coordinates");
        JsonValue rotationChange = findPosition(blocks.get("modified"), 0, 0);
        require(rotationChange != null && rotationChange.get("before").getInt("rotation", -1) == 0
            && rotationChange.get("after").getInt("rotation", -1) == 1, "rotation-only changes must be reported as modified");
        JsonValue logicChange = findPosition(blocks.get("modified"), 3, 0);
        require(logicChange != null && "logic".equals(logicChange.get("before").getString("config_type", ""))
            && !logicChange.get("before").getString("config_sha256", "").equals(logicChange.get("after").getString("config_sha256", "")),
            "logic config changes must be hashed without leaking the source");

        JsonValue copper = findItem(diff.get("materials_delta"), "copper");
        require(copper != null && copper.getInt("delta", 0) > 0, "added blocks must increase material requirements");
        JsonValue power = diff.get("power_delta");
        require(power.getFloat("production", 0f) == 0f, "power delta must be an object");
        require(power.get("production").getFloat("delta", 0f) > 0f, "an added solar panel must increase power production");
        require(power.get("consumption").getFloat("delta", 0f) > 0f, "an added laser drill must increase power consumption");
        require(power.getBoolean("estimated", false), "power delta must be marked estimated");

        JsonValue metadata = diff.get("metadata");
        require(metadata.get("block_count").getInt("before", -1) == from.tiles.size
            && metadata.get("block_count").getInt("after", -1) == to.tiles.size, "block counts must be reported for both sides");

        JsonValue logicDiffs = diff.get("logic_diffs");
        require(logicDiffs != null && logicDiffs.size == 1, "only the changed processor must produce a logic diff");
        JsonValue logicDiff = logicDiffs.child;
        require("modified".equals(logicDiff.getString("status", "")), "changed logic source must be a modified processor diff");
        require("3:0:logic-processor".equals(logicDiff.getString("key", "")), "logic diff keys must use output coordinates and block name");
        require(!logicDiff.getBoolean("truncated", true), "small logic diffs must not be truncated");
        require(logicDiff.get("hunks").size == 1, "changed logic source must produce one unified hunk");
        JsonValue hunk = logicDiff.get("hunks").child;
        require("@@ -1,2 +1,2 @@".equals(hunk.getString("header", "")), "hunk header must describe both line ranges");
        require(hasLine(hunk.get("lines"), "-", "set x 1"), "the unified diff must include the removed source line");
        require(hasLine(hunk.get("lines"), "+", "set x 2"), "the unified diff must include the added source line");
        require(hasLine(hunk.get("lines"), " ", "end"), "common lines must be emitted as context");
        require(!diff.getBoolean("logic_truncated", true), "small logic diffs must not truncate the batch");

        Block bridge = Vars.content.block("bridge-conveyor");
        require(bridge != null, "typed config fixture block must be registered");
        Schematic typedFrom = new Schematic(new Seq<>(), new StringMap(), 8, 1);
        typedFrom.tiles.add(new Schematic.Stile(bridge, 0, 0, new Point2(2, 0), (byte)0));
        Schematic typedTo = new Schematic(new Seq<>(), new StringMap(), 8, 1);
        typedTo.tiles.add(new Schematic.Stile(bridge, 0, 0, new Point2(3, 0), (byte)0));
        Path typedFromFile = root.resolve("typed-config-from.msch"), typedToFile = root.resolve("typed-config-to.msch");
        Schematics.write(typedFrom, new Fi(typedFromFile.toFile()));
        Schematics.write(typedTo, new Fi(typedToFile.toFile()));
        JsonValue typedModified = findPosition(new JsonReader().parse(
            MapRenderer.schematicDiffJson(typedFromFile, typedToFile, 0, 0)).get("diff").get("blocks").get("modified"), 0, 0);
        require(typedModified != null && "point".equals(typedModified.get("before").getString("config_type", ""))
            && !typedModified.get("before").getString("config_sha256", "").equals(typedModified.get("after").getString("config_sha256", "")),
            "typed point configuration changes must be reported as hashed modifications");
    }

    private static void verifyOffsetAndIdenticalLogic(Path root) throws Exception {
        Block router = Vars.content.block("router");
        Block logic = Vars.content.block("logic-processor");
        require(router != null && logic != null, "offset fixture blocks must be registered");

        Schematic from = new Schematic(new Seq<>(), new StringMap(), 2, 2);
        from.tiles.add(new Schematic.Stile(router, 0, 0, null, (byte)0));
        Schematic to = new Schematic(new Seq<>(), new StringMap(), 2, 2);
        to.tiles.add(new Schematic.Stile(router, 1, 1, null, (byte)0));
        Path fromFile = root.resolve("offset-from.msch"), toFile = root.resolve("offset-to.msch");
        Schematics.write(from, new Fi(fromFile.toFile()));
        Schematics.write(to, new Fi(toFile.toFile()));

        JsonValue unshifted = new JsonReader().parse(MapRenderer.schematicDiffJson(fromFile, toFile, 0, 0)).get("diff").get("blocks");
        require(unshifted.get("added").size == 1 && unshifted.get("removed").size == 1,
            "without an offset, shifted blocks must be reported as added and removed");
        JsonValue shifted = new JsonReader().parse(MapRenderer.schematicDiffJson(fromFile, toFile, 1, 1)).get("diff").get("blocks");
        require(shifted.get("added").size == 0 && shifted.get("removed").size == 0 && shifted.get("modified").size == 0,
            "an offset must allow matching shifted source coordinates");

        Schematic fromRemoved = new Schematic(new Seq<>(), new StringMap(), 3, 3);
        fromRemoved.tiles.add(new Schematic.Stile(router, 0, 0, null, (byte)0));
        Schematic toAdded = new Schematic(new Seq<>(), new StringMap(), 3, 3);
        toAdded.tiles.add(new Schematic.Stile(router, 2, 2, null, (byte)0));
        Path removedFile = root.resolve("offset-removed.msch"), addedFile = root.resolve("offset-added.msch");
        Schematics.write(fromRemoved, new Fi(removedFile.toFile()));
        Schematics.write(toAdded, new Fi(addedFile.toFile()));
        JsonValue shiftedOutput = new JsonReader().parse(MapRenderer.schematicDiffJson(removedFile, addedFile, 1, 1)).get("diff").get("blocks");
        JsonValue removed = findPosition(shiftedOutput.get("removed"), 1, 1);
        JsonValue added = findPosition(shiftedOutput.get("added"), 2, 2);
        require(removed != null && added != null, "offset output must translate from-coordinates without changing the to-coordinate origin");

        Schematic identicalFrom = new Schematic(new Seq<>(), new StringMap(), 2, 2);
        identicalFrom.tiles.add(new Schematic.Stile(logic, 0, 0, compressLogic("set x 1\nend"), (byte)0));
        Schematic identicalTo = new Schematic(new Seq<>(), new StringMap(), 2, 2);
        identicalTo.tiles.add(new Schematic.Stile(logic, 0, 0, compressLogic("set x 1\nend"), (byte)0));
        Path identicalFromFile = root.resolve("logic-identical-from.msch"), identicalToFile = root.resolve("logic-identical-to.msch");
        Schematics.write(identicalFrom, new Fi(identicalFromFile.toFile()));
        Schematics.write(identicalTo, new Fi(identicalToFile.toFile()));
        JsonValue identical = new JsonReader().parse(MapRenderer.schematicDiffJson(identicalFromFile, identicalToFile, 0, 0)).get("diff");
        require(identical.get("logic_diffs").size == 0, "identical logic sources must not produce hunks");
        require(identical.get("blocks").get("modified").size == 0, "identical processors must not produce block modifications");
    }

    private static void verifyUnknownSchematic(Path root) throws Exception {
        Path unknown = root.resolve("unknown-content.msch");
        try (DataOutputStream file = new DataOutputStream(Files.newOutputStream(unknown))) {
            file.writeInt(0x6d736368);
            file.writeByte(1);
            try (DataOutputStream data = new DataOutputStream(new DeflaterOutputStream(file))) {
                data.writeShort(1);
                data.writeShort(1);
                data.writeByte(0);
                data.writeByte(1);
                data.writeUTF("example-mod:unknown-machine");
                data.writeInt(1);
                data.writeByte(0);
                data.writeInt(Point2.pack(0, 0));
                data.writeByte(0);
                data.writeByte(0);
            }
        }
        List<String> unknownBlocks = MapRenderer.unknownSchematicBlocks(unknown);
        require(unknownBlocks.contains("example-mod:unknown-machine"), "the bounded .msch dictionary scan must retain unknown Mod content");
        JsonValue response = new JsonReader().parse(MapRenderer.schematicDiffJson(unknown, unknown, 0, 0));
        require("metadata_only".equals(response.getString("mode", "")), "unknown schematic content must fall back to metadata-only mode");
        require("MODDED_CONTENT_NOT_SUPPORTED_BY_VANILLA_RENDERER".equals(response.getString("fallbackReason", "")),
            "metadata-only responses must use the stable fallback reason");
        require(response.get("unknownContent").size == 1
            && "example-mod:unknown-machine".equals(response.get("unknownContent").child.asString()),
            "metadata-only responses must list unknown content");
        JsonValue diff = response.get("diff");
        require(diff == null || diff.isNull(), "metadata-only schematic responses must not emit a diff");
    }

    private static void verifyMapDiff(Path root) throws Exception {
        Path fromFile = root.resolve("map-diff-from.msav");
        try (var input = DiffRegression.class.getClassLoader().getResourceAsStream("maps/default/debrisField.msav")) {
            require(input != null, "the official v160.5 runtime must include the debrisField .msav fixture");
            Files.copy(input, fromFile);
        }

        Map source = MapIO.createMap(new Fi(fromFile.toFile()), true);
        var sourceRules = new JsonReader().parse(source.tags.get("rules", "{}"));
        sourceRules.remove("waveSpacing");
        sourceRules.addChild("waveSpacing", new JsonValue(300.0));
        String sourceRulesText = sourceRules.toJson(JsonWriter.OutputType.minimal);
        Files.write(fromFile, MapRenderer.patchMapRules(Files.readAllBytes(fromFile), sourceRulesText));

        Map working = MapIO.createMap(new Fi(fromFile.toFile()), true);
        MapIO.loadMap(working);
        Vars.world.tile(0, 0).setFloor(Vars.content.block("sand-floor").asFloor());
        Vars.world.tile(1, 0).setOverlay(Vars.content.block("ore-copper"));
        Vars.world.tile(2, 0).setBlock(Vars.content.block("router"), Team.derelict);

        var targetRules = new JsonReader().parse(sourceRulesText);
        targetRules.remove("waveSpacing");
        targetRules.addChild("waveSpacing", new JsonValue(999.0));
        JsonValue spawns = targetRules.get("spawns");
        require(spawns != null && spawns.child != null, "the map fixture must contain spawn groups for wave diff coverage");
        spawns.child.remove("amount");
        spawns.child.addChild("amount", new JsonValue(7));
        targetRules.addChild("bannedBlocks", new JsonReader().parse("[\"router\"]"));
        targetRules.addChild("loadout", new JsonReader().parse("[{\"item\":\"copper\",\"amount\":250}]"));
        String targetRulesText = targetRules.toJson(JsonWriter.OutputType.minimal);
        working.tags.put("rules", targetRulesText);
        Vars.state.map = working;

        Path toFile = root.resolve("map-diff-to.msav");
        MapIO.writeMap(new Fi(toFile.toFile()), working, false);
        Files.write(toFile, MapRenderer.patchMapRules(Files.readAllBytes(toFile), targetRulesText));

        String fromSha = sha256(fromFile), toSha = sha256(toFile);
        JsonValue response = new JsonReader().parse(MapRenderer.mapDiffJson(fromFile, toFile, fromSha, toSha));
        require("full".equals(response.getString("mode", "")), "vanilla maps must use the full diff mode");
        JsonValue diff = response.get("diff");
        require(diff != null && "map".equals(diff.getString("kind", "")), "map diff kind must be reported");

        JsonValue rules = diff.get("rules_diff");
        JsonValue spacing = findRule(rules.get("changed"), "waveSpacing");
        require(spacing != null && spacing.getFloat("before", 0f) == 300f && spacing.getFloat("after", 0f) == 999f,
            "changed flat rule keys must include their before and after values");
        require(hasString(rules.get("banned_blocks").get("added"), "router"), "banned block set differences must be reported");
        require(findLoadout(rules.get("loadout").get("added"), "copper", 250) != null, "loadout set differences must be reported");
        require(!rules.getBoolean("unknown_rules_changed", true), "unknown rules must never be guessed");

        JsonValue wavesChanged = diff.get("waves_diff").get("groups").get("changed");
        require(wavesChanged.size == 1 && wavesChanged.child.get("after").getInt("amount", -1) == 7,
            "spawn group field changes must be reported by the wave diff");

        JsonValue buildings = diff.get("objects_diff").get("buildings");
        require(findObject(buildings.get("added"), 2, 0, "router") != null, "a newly placed building must be reported");
        require(diff.get("objects_diff").get("counts").get("buildings").getInt("after", -1)
            == diff.get("objects_diff").get("counts").get("buildings").getInt("before", -1) + 1,
            "object counts must reflect the added building");
        require(!diff.getBoolean("objects_truncated", true), "small object sets must not be truncated");

        JsonValue sand = findResource(diff.get("resources_delta"), "sand", "ore");
        require(sand != null && sand.getInt("delta", 0) == 1, "terrain resource changes must be reported");
        JsonValue chunk = findChunk(diff.get("terrain_chunks_summary"), 0, 0);
        require(chunk != null && chunk.getBoolean("floor_changed", false) && chunk.getBoolean("overlay_changed", false),
            "the changed 128x128 terrain chunk must be summarized");
        require(diff.getInt("chunk_size", -1) == 128 && !diff.getBoolean("chunks_truncated", true),
            "terrain chunk summary metadata must be stable");
        String overlayKey = response.getString("diffOverlayKey", null);
        require(overlayKey != null && overlayKey.startsWith("resources/map-diff/")
            && overlayKey.endsWith("/overlay.png"), "map diffs must expose a stored overlay PNG key");
        require(Files.isRegularFile(root.resolve(overlayKey)), "the overlay PNG must exist under the storage root");
        require(diff.getBoolean("estimated", false), "map diffs must be marked estimated");

        JsonValue chunkResponse = new JsonReader().parse(MapRenderer.mapDiffChunkJson(fromFile, toFile, 0, 0));
        JsonValue rle = chunkResponse.get("chunk");
        require(rle != null && rle.getInt("tileWidth", -1) == 128 && rle.getInt("tileHeight", -1) == 128,
            "chunk RLE dimensions must be clipped to the target map");
        require(rle.getBoolean("floorChanged", false) && rle.getBoolean("overlayChanged", false),
            "chunk RLE must report both floor and overlay changes");
        require(findRun(rle.get("floorRuns"), 0, 0, "space", "sand-floor") != null,
            "floor RLE runs must carry absolute coordinates and before/after names");
        require(findRun(rle.get("overlayRuns"), 1, 0, "air", "ore-copper") != null,
            "overlay RLE runs must carry absolute coordinates and before/after names");
        require(!rle.getBoolean("truncated", true), "small chunk RLE output must not be truncated");

        Map modded = MapIO.createMap(new Fi(toFile.toFile()), true);
        MapIO.loadMap(modded);
        modded.tags.put("mod", "example-mod");
        Vars.state.map = modded;
        Path moddedFile = root.resolve("map-diff-modded.msav");
        MapIO.writeMap(new Fi(moddedFile.toFile()), modded, false);
        JsonValue moddedResponse = new JsonReader().parse(MapRenderer.mapDiffJson(fromFile, moddedFile, fromSha, sha256(moddedFile)));
        require("metadata_only".equals(moddedResponse.getString("mode", "")), "modded maps must fall back to metadata-only mode");
        require("MODDED_CONTENT_NOT_SUPPORTED_BY_VANILLA_RENDERER".equals(moddedResponse.getString("fallbackReason", "")),
            "modded maps must use the stable fallback reason");
        require(moddedResponse.get("diff") == null || moddedResponse.get("diff").isNull(),
            "metadata-only map responses must not emit a diff");
    }

    private static byte[] compressLogic(String source) {
        return LogicBlock.compress(source, new Seq<>());
    }

    private static String sha256(Path file) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
    }

    private static JsonValue findPosition(JsonValue array, int x, int y) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (value.getInt("x", Integer.MIN_VALUE) == x && value.getInt("y", Integer.MIN_VALUE) == y) return value;
        }
        return null;
    }

    private static JsonValue findItem(JsonValue array, String item) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (item.equals(value.getString("item", ""))) return value;
        }
        return null;
    }

    private static JsonValue findRule(JsonValue array, String key) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (key.equals(value.getString("key", ""))) return value;
        }
        return null;
    }

    private static JsonValue findLoadout(JsonValue array, String item, int amount) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (item.equals(value.getString("item", "")) && value.getInt("amount", -1) == amount) return value;
        }
        return null;
    }

    private static boolean hasString(JsonValue array, String expected) {
        if (array == null || !array.isArray()) return false;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (expected.equals(value.asString())) return true;
        }
        return false;
    }

    private static boolean hasLine(JsonValue lines, String type, String text) {
        if (lines == null || !lines.isArray()) return false;
        for (JsonValue line = lines.child; line != null; line = line.next) {
            if (type.equals(line.getString("type", "")) && text.equals(line.getString("text", ""))) return true;
        }
        return false;
    }

    private static JsonValue findObject(JsonValue array, int x, int y, String name) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (value.getInt("x", Integer.MIN_VALUE) == x && value.getInt("y", Integer.MIN_VALUE) == y
                && name.equals(value.getString("name", ""))) return value;
        }
        return null;
    }

    private static JsonValue findResource(JsonValue array, String name, String kind) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (name.equals(value.getString("name", "")) && kind.equals(value.getString("kind", ""))) return value;
        }
        return null;
    }

    private static JsonValue findChunk(JsonValue array, int cx, int cy) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (value.getInt("cx", Integer.MIN_VALUE) == cx && value.getInt("cy", Integer.MIN_VALUE) == cy) return value;
        }
        return null;
    }

    private static JsonValue findRun(JsonValue array, int x, int y, String from, String to) {
        if (array == null || !array.isArray()) return null;
        for (JsonValue value = array.child; value != null; value = value.next) {
            if (value.getInt("x", Integer.MIN_VALUE) == x && value.getInt("y", Integer.MIN_VALUE) == y
                && from.equals(value.getString("from", "")) && to.equals(value.getString("to", ""))) return value;
        }
        return null;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
