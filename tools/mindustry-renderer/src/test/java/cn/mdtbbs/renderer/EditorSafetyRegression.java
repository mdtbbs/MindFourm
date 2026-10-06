package cn.mdtbbs.renderer;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.struct.Seq;
import arc.struct.StringMap;
import arc.math.geom.Point2;
import arc.util.serialization.JsonValue;
import mindustry.Vars;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import mindustry.io.MapIO;
import mindustry.io.SaveIO;
import mindustry.maps.Map;
import mindustry.world.Block;

/** Regression coverage for destructive schematic editor operations. */
public final class EditorSafetyRegression {
    private EditorSafetyRegression() {}

    public static void main(String[] args) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Path root = Files.createTempDirectory("mindfourm-editor-safety-");

        new HeadlessApplication(new ApplicationListener() {
            @Override public void init() {
                try {
                    MapRenderer.initializeForFixture(root);
                    verifyParserDimensionLimits();
                    verifyMultiblockEdits(root);
                    verifyOfficialSchematicConfigRoundTrip(root);
                    verifyOfficialMapObjectRoundTrip(root);
                } catch (Throwable error) {
                    failure.set(error);
                } finally {
                    Core.app.exit();
                    completed.countDown();
                }
            }
        }, error -> failure.compareAndSet(null, error));

        require(completed.await(60, TimeUnit.SECONDS), "editor safety regression timed out");
        if (failure.get() != null) throw new AssertionError("editor safety regression failed", failure.get());
        System.out.println("editor safety fixtures passed");
    }

    private static void verifyMultiblockEdits(Path root) throws Exception {
        var coreShard = Vars.content.block("core-shard");
        var router = Vars.content.block("router");
        require(coreShard != null && coreShard.size > 1, "core-shard must be a registered multiblock");
        require(router != null && router.size == 1, "router fixture must be registered");

        Schematic source = new Schematic(new Seq<>(), new StringMap(), 8, 8);
        source.tags.put("name", "Multiblock editor safety");
        source.tiles.add(new Schematic.Stile(coreShard, 2, 2, null, (byte)0));
        source.tiles.add(new Schematic.Stile(router, 6, 6, null, (byte)0));
        Path file = root.resolve("multiblock-editor-source.msch");
        Schematics.write(source, new Fi(file.toFile()));

        byte[] addedBytes = MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(), List.of(),
            List.of(new MapRenderer.AddedBlock(5, 2, "core-shard", 0)), List.of());
        Schematic added = Schematics.read(new ByteArrayInputStream(addedBytes));
        require(added.tiles.count(tile -> tile.block == coreShard) == 2,
            "the editor must serialize a valid added multiblock with its official block size");
        require(added.tiles.contains(tile -> tile.block == coreShard && tile.x == 5 && tile.y == 2),
            "the added multiblock anchor must round-trip through official .msch serialization");

        byte[] movedBytes = MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(),
            List.of(new MapRenderer.MovePosition(2, 2, 2, 5)), List.of(), List.of());
        Schematic moved = Schematics.read(new ByteArrayInputStream(movedBytes));
        require(moved.tiles.contains(tile -> tile.block == coreShard && tile.x == 2 && tile.y == 5),
            "a valid multiblock move must preserve the block and its new anchor");
        require(!moved.tiles.contains(tile -> tile.block == coreShard && tile.x == 2 && tile.y == 2),
            "a moved multiblock must not leave its old anchor behind");

        expectInvalid(() -> MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(),
            List.of(new MapRenderer.MovePosition(2, 2, 6, 6)), List.of(), List.of()),
            "moving a multiblock onto another building must fail closed");

        expectInvalid(() -> MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(),
            List.of(new MapRenderer.MovePosition(2, 2, 0, 4)), List.of(), List.of()),
            "moving a multiblock beyond the map boundary must fail closed");

        expectInvalid(() -> MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(), List.of(),
            List.of(new MapRenderer.AddedBlock(0, 0, "core-shard", 0)), List.of()),
            "adding a multiblock beyond the schematic boundary must fail closed");
    }

    private static void verifyParserDimensionLimits() throws Exception {
        require(MapRenderer.isSafeMapSize(2_000, 1_000), "map bounds should accept the configured maximum tile area");
        require(!MapRenderer.isSafeMapSize(2_000, 1_001), "map bounds must reject areas above the parser budget");
        require(!MapRenderer.isSafeMapSize(65_535, 65_535), "map bounds must avoid integer-overflow dimensions");
        try {
            MapRenderer.validateSchematicSize(new Schematic(new Seq<>(), new StringMap(), 129, 1));
            throw new AssertionError("schematic dimensions beyond the official editor limit must be rejected");
        } catch (MapRenderer.SchematicTransformException exception) {
            require("INVALID_SCHEMATIC_SIZE".equals(exception.errorCode), "oversized schematics must fail with a stable size error");
        }
    }

    private static void verifyOfficialMapObjectRoundTrip(Path root) throws Exception {
        require(MapRenderer.readMapObjectOperations(new arc.util.serialization.JsonReader().parse(
            "[{\"action\":\"add\",\"object_type\":\"spawn\",\"x\":1,\"y\":1,\"name\":\"spawn\"}]"
        )).size() == 1, "the HTTP map editor contract must accept adding a spawn without irrelevant team/rotation fields");
        require(MapRenderer.readMapObjectOperations(new arc.util.serialization.JsonReader().parse(
            "[{\"action\":\"add\",\"object_type\":\"spawn\",\"x\":1,\"y\":1,\"name\":\"spawn\",\"rotation\":0}]"
        )).size() == 1, "an explicit neutral spawn rotation must remain compatible with the typed request DTO");
        expectMapInvalid(() -> MapRenderer.readMapObjectOperations(new arc.util.serialization.JsonReader().parse(
            "[{\"action\":\"add\",\"object_type\":\"spawn\",\"x\":1,\"y\":1,\"name\":\"spawn\",\"rotation\":1}]"
        )), "spawn points must reject unsupported orientation values");
        Path source = root.resolve("official-debris-field.msav");
        try (var input = EditorSafetyRegression.class.getClassLoader().getResourceAsStream("maps/default/debrisField.msav")) {
            require(input != null, "the official v160.5 runtime must include the debrisField .msav fixture");
            Files.copy(input, source);
        }
        Map sourceMap = MapIO.createMap(new Fi(source.toFile()), true);
        MapIO.loadMap(sourceMap);
        JsonValue initial = new arc.util.serialization.JsonReader().parse(
            MapRenderer.mapMetadata(sourceMap, true, SaveIO.getMeta(new Fi(source.toFile()))));
        require(initial.get("tile_layers").get("object_catalog") != null, "map metadata must expose the official placement catalog");

        Block coreBlock = Vars.content.block("core-shard");
        Block spawnBlock = Vars.content.block("spawn");
        Block buildingBlock = Vars.content.block("router");
        require(coreBlock != null && spawnBlock != null && buildingBlock != null, "object fixture content must be registered vanilla blocks");
        java.util.HashSet<Long> reserved = new java.util.HashSet<>();
        Point2 coreAt = findEmptyFootprint(coreBlock, reserved, sourceMap.width, sourceMap.height);
        Point2 spawnAt = findEmptyFootprint(spawnBlock, reserved, sourceMap.width, sourceMap.height);
        Point2 buildingAt = findEmptyFootprint(buildingBlock, reserved, sourceMap.width, sourceMap.height);
        Point2 coreTo = findEmptyFootprint(coreBlock, reserved, sourceMap.width, sourceMap.height);
        Point2 spawnTo = findEmptyFootprint(spawnBlock, reserved, sourceMap.width, sourceMap.height);
        Point2 buildingTo = findEmptyFootprint(buildingBlock, reserved, sourceMap.width, sourceMap.height);

        Path added = root.resolve("official-map-objects-added.msav");
        MapRenderer.transformMapBytes(source, added, List.of(), new arc.util.serialization.JsonReader().parse("{}"), List.of(), List.of(
            add("core", coreAt, "core-shard", "sharded"),
            add("spawn", spawnAt, "spawn", ""),
            add("building", buildingAt, "router", "sharded")
        ));
        JsonValue afterAdd = readOfficialMap(added);
        require(hasObject(afterAdd.get("cores"), coreAt.x, coreAt.y, "core-shard"), "an added core must round-trip through official MapIO");
        require(hasObject(afterAdd.get("tile_layers").get("enemy_spawns"), spawnAt.x, spawnAt.y, "spawn"), "an added spawn must round-trip through official MapIO");
        require(hasObject(afterAdd.get("tile_layers").get("buildings"), buildingAt.x, buildingAt.y, "router"), "an added building must round-trip through official MapIO");

        Path moved = root.resolve("official-map-objects-moved.msav");
        MapRenderer.transformMapBytes(added, moved, List.of(), new arc.util.serialization.JsonReader().parse("{}"), List.of(), List.of(
            new MapRenderer.MapObjectOperation("move", "core", -1, -1, coreAt.x, coreAt.y, coreTo.x, coreTo.y, "", "", 0),
            new MapRenderer.MapObjectOperation("move", "spawn", -1, -1, spawnAt.x, spawnAt.y, spawnTo.x, spawnTo.y, "", "", 0),
            new MapRenderer.MapObjectOperation("move", "building", -1, -1, buildingAt.x, buildingAt.y, buildingTo.x, buildingTo.y, "", "", 0),
            new MapRenderer.MapObjectOperation("team", "core", coreAt.x, coreAt.y, -1, -1, -1, -1, "", "crux", 0),
            new MapRenderer.MapObjectOperation("team", "building", buildingAt.x, buildingAt.y, -1, -1, -1, -1, "", "crux", 0)
        ));
        JsonValue afterMove = readOfficialMap(moved);
        require(hasObject(afterMove.get("cores"), coreTo.x, coreTo.y, "core-shard"), "a moved core must preserve its block and official coordinates");
        require(!hasObject(afterMove.get("cores"), coreAt.x, coreAt.y, "core-shard"), "a moved core must not leave an old footprint");
        require(hasObject(afterMove.get("tile_layers").get("enemy_spawns"), spawnTo.x, spawnTo.y, "spawn"), "a moved spawn must round-trip through official MapIO");
        require(hasObject(afterMove.get("tile_layers").get("buildings"), buildingTo.x, buildingTo.y, "router"), "a moved building must round-trip through official MapIO");
        require("crux".equals(findTeam(afterMove.get("cores"), coreTo.x, coreTo.y)), "core team edits must round-trip through official MapIO");
        require("crux".equals(findTeam(afterMove.get("tile_layers").get("buildings"), buildingTo.x, buildingTo.y)), "building team edits must round-trip through official MapIO");

        expectMapInvalid(() -> MapRenderer.transformMapBytes(moved, root.resolve("invalid-map-object.msav"), List.of(),
            new arc.util.serialization.JsonReader().parse("{}"), List.of(), List.of(add("core", new Point2(0, 0), "core-shard", "sharded"))),
            "an out-of-bounds multiblock core must be rejected");
        expectMapInvalid(() -> MapRenderer.transformMapBytes(moved, root.resolve("collision-map-object.msav"), List.of(),
            new arc.util.serialization.JsonReader().parse("{}"), List.of(), List.of(add("building", coreTo, "router", "sharded"))),
            "an object colliding with a core footprint must be rejected");
        try {
            MapRenderer.transformMapBytes(moved, root.resolve("illegal-map-object.msav"), List.of(),
                new arc.util.serialization.JsonReader().parse("{}"), List.of(), List.of(add("building", buildingAt, "not-a-vanilla-block", "sharded")));
            throw new AssertionError("an unknown map content name must be rejected");
        } catch (MapRenderer.MapTransformException exception) {
            require("UNSUPPORTED_MAP_CONTENT".equals(exception.errorCode), "unknown map content must fail closed");
        }

        Path deleted = root.resolve("official-map-objects-deleted.msav");
        MapRenderer.transformMapBytes(moved, deleted, List.of(), new arc.util.serialization.JsonReader().parse("{}"), List.of(), List.of(
            new MapRenderer.MapObjectOperation("delete", "core", coreTo.x, coreTo.y, -1, -1, -1, -1, "", "", 0),
            new MapRenderer.MapObjectOperation("delete", "spawn", spawnTo.x, spawnTo.y, -1, -1, -1, -1, "", "", 0),
            new MapRenderer.MapObjectOperation("delete", "building", buildingTo.x, buildingTo.y, -1, -1, -1, -1, "", "", 0)
        ));
        JsonValue afterDelete = readOfficialMap(deleted);
        require(!hasObject(afterDelete.get("cores"), coreTo.x, coreTo.y, "core-shard"), "a deleted core must be absent after official reread");
        require(!hasObject(afterDelete.get("tile_layers").get("enemy_spawns"), spawnTo.x, spawnTo.y, "spawn"), "a deleted spawn must be absent after official reread");
        require(!hasObject(afterDelete.get("tile_layers").get("buildings"), buildingTo.x, buildingTo.y, "router"), "a deleted building must be absent after official reread");
    }

    private static void verifyOfficialSchematicConfigRoundTrip(Path root) throws Exception {
        Path sourceFile = root.resolve("official-v160.5-item-power.msch");
        try (var input = EditorSafetyRegression.class.getClassLoader().getResourceAsStream("schematics/official-v160.5-item-power.msch")) {
            require(input != null, "the genuine v160.5 baseparts schematic fixture must be present");
            Files.copy(input, sourceFile);
        }
        Schematic source = Schematics.read(new Fi(sourceFile.toFile()));
        Block itemSource = Vars.content.block("item-source");
        Block powerNode = Vars.content.block("power-node-large");
        require(source.width == 6 && source.height == 6, "the official item/power schematic dimensions must parse");
        Schematic.Stile sourceItem = source.tiles.find(tile -> tile.block == itemSource && tile.x == 3 && tile.y == 5);
        Schematic.Stile sourcePower = source.tiles.find(tile -> tile.block == powerNode && tile.x == 2 && tile.y == 0);
        require(sourceItem != null && sourceItem.config instanceof mindustry.type.Item item && item.name.equals("coal"),
            "the genuine official fixture must contain a typed Item config");
        require(sourcePower != null && sourcePower.config instanceof Point2[] points && points.length == 2,
            "the genuine official fixture must contain a typed power-link Point2[] config");
        Point2[] originalPowerLinks = (Point2[])sourcePower.config;

        JsonValue itemConfig = new arc.util.serialization.JsonReader().parse("{\"type\":\"content\",\"content_type\":\"item\",\"name\":\"lead\"}");
        StringBuilder powerPoints = new StringBuilder("[");
        for (int index = 0; index < originalPowerLinks.length; index++) {
            if (index > 0) powerPoints.append(',');
            powerPoints.append("{\"x\":").append(originalPowerLinks[index].x).append(",\"y\":").append(originalPowerLinks[index].y).append('}');
        }
        powerPoints.append(']');
        JsonValue powerConfig = new arc.util.serialization.JsonReader().parse("{\"type\":\"point_array\",\"points\":" + powerPoints + "}");
        byte[] outputBytes = MapRenderer.transformSchematicBytes(sourceFile, 0, false, List.of(), List.of(), List.of(), List.of(), List.of(
            new MapRenderer.SchematicConfigEdit(3, 5, itemConfig),
            new MapRenderer.SchematicConfigEdit(2, 0, powerConfig)
        ));
        Schematic verified = Schematics.read(new ByteArrayInputStream(outputBytes));
        Schematic.Stile verifiedItem = verified.tiles.find(tile -> tile.block == itemSource && tile.x == 3 && tile.y == 5);
        Schematic.Stile verifiedPower = verified.tiles.find(tile -> tile.block == powerNode && tile.x == 2 && tile.y == 0);
        require(verifiedItem != null && verifiedItem.config instanceof mindustry.type.Item item && item.name.equals("lead"),
            "typed item edits must reread through the official .msch parser");
        require(verifiedPower != null && verifiedPower.config instanceof Point2[] points && points.length == 2,
            "typed Point2[] power links must survive the official writer/parser round-trip");
        require(java.util.Arrays.equals((Point2[])verifiedPower.config, originalPowerLinks),
            "typed power-link coordinate arrays must preserve their official relative targets");

        expectSchematicConfigInvalid(() -> MapRenderer.transformSchematicBytes(sourceFile, 0, false, List.of(), List.of(), List.of(), List.of(), List.of(
            new MapRenderer.SchematicConfigEdit(3, 5, new arc.util.serialization.JsonReader().parse("{\"type\":\"content\",\"content_type\":\"item\",\"name\":\"not-a-v160.5-item\"}"))
        )), "unknown official content names must be rejected");
        expectSchematicConfigInvalid(() -> MapRenderer.transformSchematicBytes(sourceFile, 0, false, List.of(), List.of(), List.of(), List.of(), List.of(
            new MapRenderer.SchematicConfigEdit(2, 0, new arc.util.serialization.JsonReader().parse("{\"type\":\"point_array\",\"points\":[{\"x\":127,\"y\":0}]}"))
        )), "point config references outside the schematic must be rejected");
        expectSchematicConfigInvalid(() -> MapRenderer.transformSchematicBytes(sourceFile, 0, false, List.of(), List.of(), List.of(), List.of(), List.of(
            new MapRenderer.SchematicConfigEdit(3, 5, new arc.util.serialization.JsonReader().parse("{\"type\":\"arbitrary\",\"payload\":{}}"))
        )), "unknown config discriminators and arbitrary nested JSON must be rejected");
    }

    private static MapRenderer.MapObjectOperation add(String type, Point2 point, String name, String team) {
        return new MapRenderer.MapObjectOperation("add", type, point.x, point.y, -1, -1, -1, -1, name, team, 0);
    }

    private static Point2 findEmptyFootprint(Block block, java.util.Set<Long> reserved, int width, int height) {
        Block air = Vars.content.block("air");
        for (int y = 1; y < height - 1; y++) for (int x = 1; x < width - 1; x++) {
            java.util.HashSet<Long> footprint = new java.util.HashSet<>();
            boolean empty = block.size > 0 && block.size <= 16;
            for (int dx = 0; empty && dx < block.size; dx++) for (int dy = 0; dy < block.size; dy++) {
                int tx = x + block.sizeOffset + dx, ty = y + block.sizeOffset + dy;
                if (tx < 0 || ty < 0 || tx >= width || ty >= height) { empty = false; break; }
                long key = (((long)tx) << 32) | (ty & 0xffffffffL);
                if (Vars.world.tile(tx, ty).block() != air || reserved.contains(key) || !footprint.add(key)) { empty = false; break; }
            }
            if (empty) { reserved.addAll(footprint); return new Point2(x, y); }
        }
        throw new AssertionError("official map fixture needs a free footprint for " + block.name);
    }

    private static JsonValue readOfficialMap(Path file) {
        try {
            Map map = MapIO.createMap(new Fi(file.toFile()), true);
            MapIO.loadMap(map);
            return new arc.util.serialization.JsonReader().parse(MapRenderer.mapMetadata(map, true, SaveIO.getMeta(new Fi(file.toFile()))));
        } catch (Exception exception) {
            throw new AssertionError("official Mindustry MapIO must reread generated map fixture", exception);
        }
    }

    private static boolean hasObject(JsonValue rows, int x, int y, String name) {
        if (rows == null || !rows.isArray()) return false;
        for (JsonValue row = rows.child; row != null; row = row.next) {
            if (row.getInt("x", -1) == x && row.getInt("y", -1) == y
                && (name == null || name.equals(row.getString("name", "")))) return true;
        }
        return false;
    }

    private static String findTeam(JsonValue rows, int x, int y) {
        if (rows == null || !rows.isArray()) return null;
        for (JsonValue row = rows.child; row != null; row = row.next) {
            if (row.getInt("x", -1) == x && row.getInt("y", -1) == y) return row.getString("team", null);
        }
        return null;
    }

    private static void expectMapInvalid(CheckedOperation operation, String message) throws Exception {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (MapRenderer.MapTransformException exception) {
            require("INVALID_MAP_OBJECT_OPERATION".equals(exception.errorCode), message + ": got " + exception.errorCode);
        }
    }

    private static void expectInvalid(CheckedOperation operation, String message) throws Exception {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (MapRenderer.SchematicTransformException exception) {
            require("INVALID_SCHEMATIC_OPERATION".equals(exception.errorCode),
                message + ": expected INVALID_SCHEMATIC_OPERATION, got " + exception.errorCode);
        }
    }

    private static void expectSchematicConfigInvalid(CheckedOperation operation, String message) throws Exception {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (MapRenderer.SchematicTransformException exception) {
            require("INVALID_SCHEMATIC_CONFIG".equals(exception.errorCode),
                message + ": expected INVALID_SCHEMATIC_CONFIG, got " + exception.errorCode);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface CheckedOperation {
        void run() throws Exception;
    }
}
