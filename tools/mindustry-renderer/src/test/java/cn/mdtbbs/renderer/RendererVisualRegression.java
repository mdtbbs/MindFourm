package cn.mdtbbs.renderer;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.io.DataOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.HashSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.DeflaterOutputStream;
import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.graphics.Pixmap;
import mindustry.io.MapIO;
import mindustry.io.SaveIO;
import mindustry.io.SaveMeta;
import mindustry.core.Version;
import mindustry.maps.Map;
import mindustry.Vars;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import arc.struct.Seq;
import arc.struct.StringMap;
import arc.struct.ObjectMap;
import arc.math.geom.Point2;
import arc.util.serialization.JsonReader;
import arc.util.serialization.JsonValue;

/** Tiny deterministic fixture for the transparent multi-region icon compositor. */
public final class RendererVisualRegression {
    private RendererVisualRegression() {}

    public static void main(String[] args) {
        verifyIconComposition();
        verifyVanillaMapFixture();
        System.out.println("renderer visual fixtures passed");
    }

    private static void verifyIconComposition() {
        BufferedImage bottom = new BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB);
        BufferedImage top = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < bottom.getHeight(); y++) for (int x = 0; x < bottom.getWidth(); x++) bottom.setRGB(x, y, Color.RED.getRGB());
        for (int y = 0; y < top.getHeight(); y++) for (int x = 0; x < top.getWidth(); x++) top.setRGB(x, y, Color.GREEN.getRGB());

        BufferedImage composed = MapRenderer.composeLayers(List.of(bottom, top));
        require(composed.getWidth() == 4 && composed.getHeight() == 4, "composition dimensions must preserve the base layer");
        require(composed.getRGB(0, 0) == Color.RED.getRGB(), "the lower generated icon layer must remain visible");
        require(composed.getRGB(1, 1) == Color.GREEN.getRGB(), "the later generated icon layer must draw on top");
        require(composed.getRGB(3, 3) == Color.RED.getRGB(), "transparent area in the upper layer must preserve lower pixels");
    }

    private static void verifyVanillaMapFixture() {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        try {
            Path root = Files.createTempDirectory("mindfourm-render-fixture-");
            new HeadlessApplication(new ApplicationListener() {
                @Override public void init() {
                    try {
                        MapRenderer.initializeForFixture(root);
                        verifySchematicFixtures(root);
                        verifySchematicFingerprints();
                        verifyCompatibilityInference();
                        verifyProductionAnalysis();
                        String mapFixture = System.getenv("MINDFOURM_MSAV_FIXTURE");
                        Path fixture = configuredFixture("MINDFOURM_MSAV_FIXTURE", root.resolve("debris-field.msav"));
                        if (mapFixture == null || mapFixture.isBlank()) {
                            try (InputStream input = MapRenderer.class.getClassLoader().getResourceAsStream("maps/default/debrisField.msav")) {
                                if (input == null) throw new AssertionError("official debrisField.msav fixture is missing from the locked runtime");
                                Files.copy(input, fixture);
                            }
                        }
                        Map map = MapIO.createMap(new Fi(fixture.toFile()), true);
                        SaveMeta savedMeta = SaveIO.getMeta(new Fi(fixture.toFile()));
                        String fileMetadata = MapRenderer.mapMetadata(map, false, savedMeta);
                        require(fileMetadata.contains("\"save_format_version\":" + map.version), "map metadata must expose the save format version separately");
                        if (savedMeta.tags != null && savedMeta.tags.containsKey("build") && savedMeta.build > 0) {
                            require(fileMetadata.contains("\"stored_game_build\":" + savedMeta.build), "stored game build must come from the SaveMeta build tag");
                        }
                        if (savedMeta.tags != null) savedMeta.tags.remove("build");
                        String oldSaveMetadata = MapRenderer.mapMetadata(map, false, savedMeta);
                        require(oldSaveMetadata.contains("\"stored_game_build\":null") && oldSaveMetadata.contains("\"source\":\"unknown\""), "old maps without a stored build must report unknown");
                        require(oldSaveMetadata.contains("\"mindustry_build\":" + Version.build), "parser runtime must remain a separate field");
                        require(!oldSaveMetadata.contains("\"build\":" + Version.build), "parser runtime must never be emitted as the map's stored build");
                        JsonValue headerOnly = new JsonReader().parse(oldSaveMetadata);
                        require(headerOnly.get("tile_layers") == null || headerOnly.get("tile_layers").get("terrain") == null,
                            "header-only map metadata must not invent tile layer coordinates");
                        MapIO.loadMap(map);
                        JsonValue layeredMap = new JsonReader().parse(MapRenderer.mapMetadata(map, true, savedMeta));
                        JsonValue tileLayers = layeredMap.get("tile_layers");
                        require(tileLayers != null && tileLayers.get("terrain") != null && tileLayers.get("terrain").size > 0,
                            "loaded maps must expose bounded terrain tile coordinates");
                        require(tileLayers.get("enemy_spawns") != null && tileLayers.get("buildings") != null && tileLayers.get("liquid") != null,
                            "map viewer layer groups must be present even when a layer has no markers");
                        if ((long)map.width * map.height > 5_000) {
                            require(layeredMap.getBoolean("tile_layers_truncated", false), "large map layers must declare coordinate truncation");
                        }
                        Pixmap preview = MapIO.generatePreview(map);
                        try {
                            HashSet<Integer> colors = new HashSet<>();
                            for (int y = 0; y < preview.height; y++) for (int x = 0; x < preview.width; x++) colors.add(preview.getRaw(x, y));
                            require(preview.width == map.width && preview.height == map.height, "map preview dimensions must match the saved map");
                            require(colors.size() > 8, "map preview must contain floor, ore, wall and building colors rather than only ore");
                        } finally {
                            preview.dispose();
                        }
                    } catch (Throwable error) {
                        failure.set(error);
                    } finally {
                        Core.app.exit();
                        completed.countDown();
                    }
                }
            }, error -> failure.compareAndSet(null, error));
            require(completed.await(60, TimeUnit.SECONDS), "headless map fixture timed out");
            if (failure.get() != null) throw new AssertionError("vanilla map preview fixture failed", failure.get());
        } catch (Exception error) {
            throw new AssertionError("could not run the headless map fixture", error);
        }
    }

    private static void verifySchematicFixtures(Path root) throws Exception {
        var wall = Vars.content.block("copper-wall");
        var drill = Vars.content.block("mechanical-drill");
        var conveyor = Vars.content.block("conveyor");
        var multiblock = Vars.content.block("core-shard");
        require(wall != null && drill != null && conveyor != null && multiblock != null, "vanilla schematic fixture blocks must be registered");
        require(multiblock.size > 1, "multiblock fixture must use a multi-tile block");

        Schematic[] fixtures = {
            schematic(wall, 1, 1, (byte) 0),
            schematic(drill, 1, 1, (byte) 0),
            schematic(conveyor, 1, 1, (byte) 1),
            schematic(multiblock, 3, 3, (byte) 0),
        };
        String[] names = { "single-layer", "generated-icon-building", "rotated-building", "multiblock-building" };
        for (int index = 0; index < fixtures.length; index++) {
            Path file = root.resolve(names[index] + ".msch");
            Schematics.write(fixtures[index], new Fi(file.toFile()));
            Schematic roundTrip = Schematics.read(new Fi(file.toFile()));
            require(roundTrip.tiles.size == 1, names[index] + " fixture must round-trip one building");
            require(roundTrip.tiles.first().rotation == fixtures[index].tiles.first().rotation, names[index] + " rotation must survive round-trip");
            int formatVersion = Files.readAllBytes(file)[4] & 0xff;
            String metadata = MapRenderer.schematicMetadata(roundTrip, List.of(), formatVersion);
            require(metadata.contains("\"schematic_format_version\":" + formatVersion), names[index] + " metadata must expose the schematic file format");
            require(metadata.contains("\"parser_runtime\""), names[index] + " metadata must identify its parser runtime");
            double expectedBuildSeconds = roundTrip.tiles.first().block.buildTime / 60d;
            JsonValue metadataJson = new JsonReader().parse(metadata);
            double reportedBuildSeconds = Double.parseDouble(metadataJson.getString("estimated_build_time_seconds", "null"));
            require(Math.abs(reportedBuildSeconds - expectedBuildSeconds) < 0.000001d,
                names[index] + " metadata must estimate build time from resolved Mindustry block build times");
            String incompleteEstimate = MapRenderer.schematicMetadata(roundTrip, List.of("unknown-content"), formatVersion);
            require(incompleteEstimate.contains("\"estimated_build_time_seconds\":null"),
                names[index] + " metadata must not report a partial estimate when content is unknown");
            BufferedImage image = MapRenderer.renderSchematicImage(roundTrip);
            require(image.getWidth() > 0 && image.getHeight() > 0, names[index] + " preview must be non-empty");
        }
        verifySchematicEditorRoundTrip(root);
        String userFixture = System.getenv("MINDFOURM_MSCH_FIXTURE");
        if (userFixture != null && !userFixture.isBlank()) {
            Schematic original = Schematics.read(new Fi(Path.of(userFixture).toFile()));
            BufferedImage preview = MapRenderer.renderSchematicImage(original);
            require(original.tiles.size > 0 && preview.getWidth() > 0 && preview.getHeight() > 0, "reported schematic must decode and render");
        }
    }

    private static void verifySchematicEditorRoundTrip(Path root) throws Exception {
        var router = Vars.content.block("router");
        var conveyor = Vars.content.block("conveyor");
        require(router != null && conveyor != null, "schematic editor fixture blocks must be registered");
        Schematic original = new Schematic(new Seq<>(), new StringMap(), 4, 3);
        original.tags.put("name", "Editor fixture");
        original.tags.put("description", "metadata survives transforms");
        original.labels.add("editor-test");
        original.tiles.add(new Schematic.Stile(conveyor, 0, 0, null, (byte)0));
        original.tiles.add(new Schematic.Stile(router, 3, 2, null, (byte)1));
        original.tiles.add(new Schematic.Stile(conveyor, 2, 1, null, (byte)2));
        Path source = root.resolve("schematic-editor-source.msch");
        Schematics.write(original, new Fi(source.toFile()));

        byte[] editedBytes = MapRenderer.transformSchematicBytes(source, 1, true, List.of(new Point2(0, 0)));
        require(editedBytes.length > 5 && editedBytes[0] == 'm' && editedBytes[1] == 's' && editedBytes[2] == 'c' && editedBytes[3] == 'h',
            "the editor must emit an official .msch serialization");
        Schematic edited = Schematics.read(new java.io.ByteArrayInputStream(editedBytes));
        require(edited.width == 3 && edited.height == 4, "a quarter-turn must swap schematic dimensions");
        require(edited.tiles.size == 2, "deleting a selected source coordinate must remove exactly one block");
        require("Editor fixture".equals(edited.tags.get("name")) && "metadata survives transforms".equals(edited.tags.get("description")),
            "schematic tags must survive rotation, reflection and serialization");
        require(edited.labels.contains("editor-test"), "schematic labels must survive rotation, reflection and serialization");
        require(edited.tiles.contains(tile -> tile.block == router && tile.x == 1 && tile.y == 2 && tile.rotation == 0),
            "rotation and horizontal reflection must preserve the router and transform its orientation");
        require(edited.tiles.contains(tile -> tile.block == conveyor && tile.x == 0 && tile.y == 1 && tile.rotation == 3),
            "rotation and horizontal reflection must preserve the conveyor placement");

        Schematic evenWidth = new Schematic(new Seq<>(), new StringMap(), 4, 2);
        evenWidth.tiles.add(new Schematic.Stile(router, 0, 0, null, (byte)0));
        evenWidth.tiles.add(new Schematic.Stile(router, 1, 1, null, (byte)0));
        Path evenWidthSource = root.resolve("schematic-editor-even-width.msch");
        Schematics.write(evenWidth, new Fi(evenWidthSource.toFile()));
        Schematic mirrored = Schematics.read(new java.io.ByteArrayInputStream(
            MapRenderer.transformSchematicBytes(evenWidthSource, 0, true, List.of())
        ));
        require(mirrored.tiles.contains(tile -> tile.block == router && tile.x == 3 && tile.y == 0),
            "horizontal reflection must mirror placements across an even-width schematic's tile boundary");
        require(mirrored.tiles.contains(tile -> tile.block == router && tile.x == 2 && tile.y == 1),
            "horizontal reflection must preserve all even-width block placements");

        Path unknown = root.resolve("schematic-editor-unknown.msch");
        try (DataOutputStream file = new DataOutputStream(Files.newOutputStream(unknown))) {
            file.writeInt(0x6d736368);
            file.writeByte(1);
            try (DataOutputStream data = new DataOutputStream(new DeflaterOutputStream(file))) {
                data.writeShort(1); data.writeShort(1);
                data.writeByte(1); data.writeUTF("contentMap"); data.writeUTF("{}");
                data.writeByte(1); data.writeUTF("example-mod:unknown-machine");
            }
        }
        try {
            MapRenderer.transformSchematicBytes(unknown, 0, false, List.of());
            throw new AssertionError("the editor must reject unknown blocks instead of serializing them as air");
        } catch (MapRenderer.SchematicTransformException exception) {
            require("UNSUPPORTED_SCHEMATIC_CONTENT".equals(exception.errorCode), "unknown block content must fail closed");
        }
    }

    private static void verifySchematicFingerprints() {
        var wall = Vars.content.block("copper-wall");
        var conveyor = Vars.content.block("conveyor");
        require(wall != null && conveyor != null, "fingerprint fixture blocks must exist");
        Schematic original = schematicWithTiles(new StringMap(),
            new Schematic.Stile(wall, 0, 0, null, (byte)0),
            new Schematic.Stile(conveyor, 2, 1, null, (byte)1));
        Schematic renamed = schematicWithTiles(new StringMap(),
            new Schematic.Stile(wall, 0, 0, null, (byte)0),
            new Schematic.Stile(conveyor, 2, 1, null, (byte)1));
        renamed.tags.put("name", "renamed");
        renamed.tags.put("description", "display-only change");
        renamed.tags.put("labels", "tutorial,logistics");
        require(SchematicFingerprint.exact(original).equals(SchematicFingerprint.exact(renamed)), "name, description and labels must not affect structure identity");

        Schematic rotated = schematicWithTiles(new StringMap(),
            new Schematic.Stile(wall, 1, 0, null, (byte)1),
            new Schematic.Stile(conveyor, 0, 2, null, (byte)2));
        require(!SchematicFingerprint.exact(original).equals(SchematicFingerprint.exact(rotated)), "rotating a schematic must change its exact structure hash");
        require(SchematicFingerprint.normalized(original).equals(SchematicFingerprint.normalized(rotated)), "whole-schematic rotations must share the normalized structure hash");

        Schematic mirrored = schematicWithTiles(new StringMap(),
            new Schematic.Stile(wall, 2, 0, null, (byte)0),
            new Schematic.Stile(conveyor, 0, 1, null, (byte)3));
        require(SchematicFingerprint.normalized(original).equals(SchematicFingerprint.normalized(mirrored)), "whole-schematic mirrors must share the normalized structure hash");

        Schematic changedBlock = schematicWithTiles(new StringMap(),
            new Schematic.Stile(conveyor, 0, 0, null, (byte)0),
            new Schematic.Stile(conveyor, 2, 1, null, (byte)1));
        require(!SchematicFingerprint.exact(original).equals(SchematicFingerprint.exact(changedBlock)), "changing a block must change the structure hash");

        ObjectMap<String, Object> configA = new ObjectMap<>(); configA.put("z", "router"); configA.put("a", 1);
        ObjectMap<String, Object> configB = new ObjectMap<>(); configB.put("a", 1); configB.put("z", "router");
        Schematic configuredA = schematicWithTiles(new StringMap(), new Schematic.Stile(wall, 0, 0, configA, (byte)0));
        Schematic configuredB = schematicWithTiles(new StringMap(), new Schematic.Stile(wall, 0, 0, configB, (byte)0));
        require(SchematicFingerprint.exact(configuredA).equals(SchematicFingerprint.exact(configuredB)), "config object property order must be canonicalized");
        Schematic changedConfig = schematicWithTiles(new StringMap(), new Schematic.Stile(wall, 0, 0, "different", (byte)0));
        require(!SchematicFingerprint.exact(configuredA).equals(SchematicFingerprint.exact(changedConfig)), "changing block config must change the structure hash");
    }

    private static void verifyCompatibilityInference() {
        var erekirWall = Vars.content.block("beryllium-wall");
        var wall = Vars.content.block("copper-wall");
        require(erekirWall != null && wall != null, "compatibility fixture blocks must exist");
        var known = MindustryCompatibilityRegistry.infer(schematic(erekirWall), List.of(), true);
        require(known.minimumSupportedBuild() == 135 && known.source().equals("inferred") && known.confidence().equals("medium"), "registry-known content must infer its curated minimum build");
        var unknownContent = MindustryCompatibilityRegistry.infer(schematic(wall), List.of("example-mod:machine"), true);
        require(unknownContent.minimumSupportedBuild() == null && unknownContent.confidence().equals("low"), "unknown Mod content must not receive a guessed build");
        var unknownFormat = MindustryCompatibilityRegistry.infer(schematic(erekirWall), List.of(), false);
        require(unknownFormat.minimumSupportedBuild() == null, "unknown schematic format must not receive a guessed build");
        var unknownConfig = MindustryCompatibilityRegistry.infer(schematic(new Schematic.Stile(erekirWall, 0, 0, "config", (byte)0)), List.of(), true);
        require(unknownConfig.minimumSupportedBuild() == null && unknownConfig.source().equals("unknown"), "unregistered config serializers must fail closed");
    }

    private static void verifyProductionAnalysis() throws Exception {
        var press = Vars.content.block("graphite-press");
        var drill = Vars.content.block("mechanical-drill");
        var router = Vars.content.block("router");
        var separator = Vars.content.block("separator");
        require(press != null && drill != null && router != null && separator != null, "production fixtures must use official vanilla blocks");

        String factory = MapRenderer.productionAnalysis(schematic(press, press));
        require(factory.contains("\"mode\":\"theoretical\""), "production result must identify the theoretical mode");
        require(factory.contains("\"id\":\"coal\""), "graphite press input must come from official item consumers");
        require(factory.contains("\"id\":\"graphite\""), "graphite output must come from official block content");
        require(factory.contains("\"available\":true"), "factory fixture must be identified as a production facility");

        var coal = Vars.content.item("coal");
        var graphite = Vars.content.item("graphite");
        var silicon = Vars.content.item("silicon");
        var producer = new mindustry.world.blocks.production.GenericCrafter("fixture-graphite-press");
        producer.craftTime = 60f;
        producer.consumers = new mindustry.world.consumers.Consume[] { new mindustry.world.consumers.ConsumeItems(new mindustry.type.ItemStack[] { new mindustry.type.ItemStack(coal, 5) }) };
        producer.outputItems = new mindustry.type.ItemStack[] { new mindustry.type.ItemStack(graphite, 6) };
        var consumer = new mindustry.world.blocks.production.GenericCrafter("fixture-silicon-smelter");
        consumer.craftTime = 60f;
        consumer.consumers = new mindustry.world.consumers.Consume[] { new mindustry.world.consumers.ConsumeItems(new mindustry.type.ItemStack[] { new mindustry.type.ItemStack(graphite, 4) }) };
        consumer.outputItems = new mindustry.type.ItemStack[] { new mindustry.type.ItemStack(silicon, 2) };
        String chain = MapRenderer.productionAnalysis(schematic(producer, consumer));
        require(chain.contains("\"id\":\"graphite\",\"name\":\"graphite\",\"produced\":6.0,\"consumed\":4.0,\"net\":2.0"), "intermediate production must be globally netted without discarding full internal totals");
        require(chain.contains("\"id\":\"coal\",\"name\":\"coal\",\"rate\":5.0"), "fixed item inputs must use 60 ticks per second and multiply block counts");

        var water = Vars.content.liquid("water");
        var cryofluid = Vars.content.liquid("cryofluid");
        var mixer = new mindustry.world.blocks.production.GenericCrafter("fixture-cryofluid-mixer");
        mixer.craftTime = 120f;
        mixer.consumers = new mindustry.world.consumers.Consume[] { new mindustry.world.consumers.ConsumeLiquid(water, 0.05f) };
        mixer.outputLiquids = new mindustry.type.LiquidStack[] { new mindustry.type.LiquidStack(cryofluid, 0.1f) };
        String liquid = MapRenderer.productionAnalysis(schematic(mixer));
        require(liquid.contains("\"id\":\"water\",\"name\":\"water\",\"rate\":3.0"), "liquid consumption must convert per-tick values to per-second rates");
        require(liquid.contains("\"id\":\"cryofluid\",\"name\":\"cryofluid\",\"rate\":6.0"), "liquid outputs must convert per-tick values to per-second rates: " + liquid);

        var generator = new mindustry.world.blocks.power.PowerGenerator("fixture-solar-generator");
        generator.powerProduction = 15f;
        generator.consumers = new mindustry.world.consumers.Consume[] { new mindustry.world.consumers.ConsumePower(2f, 0f, false) };
        String power = MapRenderer.productionAnalysis(schematic(generator));
        require(power.contains("\"power\":{\"generated\":900.0,\"consumed\":120.0,\"net\":780.0}"), "generation and consumption must use official per-tick power values");

        String drillResult = MapRenderer.productionAnalysis(schematic(drill));
        require(drillResult.contains("terrain-dependent") && !drillResult.contains("copper"), "drill must warn without guessing an ore output");

        String separatorResult = MapRenderer.productionAnalysis(schematic(separator));
        require(separatorResult.contains("\"estimated\":true"), "separator output must be labelled as expected yield");

        String logistics = MapRenderer.productionAnalysis(schematic(router));
        require(logistics.contains("\"available\":false"), "pure logistics must report no analyzable production");

        String unknown = MapRenderer.productionAnalysis(schematic((mindustry.world.Block)null));
        require(unknown.contains("unknown-content") && unknown.contains("\"complete\":false"), "unknown content must preserve known output and mark analysis incomplete");

        Path unknownFile = Files.createTempFile("mindfourm-unknown-block-", ".msch");
        try (DataOutputStream file = new DataOutputStream(Files.newOutputStream(unknownFile))) {
            file.writeInt(0x6d736368);
            file.writeByte(1);
            try (DataOutputStream data = new DataOutputStream(new DeflaterOutputStream(file))) {
                data.writeShort(1);
                data.writeShort(1);
                data.writeByte(0);
                data.writeByte(1);
                data.writeUTF("example-mod:unknown-machine");
            }
        }
        List<String> unknownIds = MapRenderer.unknownSchematicBlocks(unknownFile);
        require(unknownIds.contains("example-mod:unknown-machine"), "the bounded msch dictionary scan must retain unknown Mod content IDs: " + unknownIds);
        String unknownMod = MapRenderer.productionAnalysis(schematic(router), unknownIds);
        require(unknownMod.contains("example-mod:unknown-machine") && unknownMod.contains("\"count\":null") && unknownMod.contains("\"complete\":false"), "unknown Mod definitions must not invent a tile count or block known analysis");
        Files.deleteIfExists(unknownFile);
    }

    private static Path configuredFixture(String variable, Path fallback) {
        String configured = System.getenv(variable);
        return configured == null || configured.isBlank() ? fallback : Path.of(configured).toAbsolutePath().normalize();
    }

    private static Schematic schematic(mindustry.world.Block block, int width, int height, byte rotation) {
        Seq<Schematic.Stile> tiles = new Seq<>();
        tiles.add(new Schematic.Stile(block, width / 2, height / 2, null, rotation));
        return new Schematic(tiles, new StringMap(), width, height);
    }

    private static Schematic schematic(mindustry.world.Block... blocks) {
        Seq<Schematic.Stile> tiles = new Seq<>();
        for (int index = 0; index < blocks.length; index++) tiles.add(new Schematic.Stile(blocks[index], index, 0, null, (byte)0));
        return new Schematic(tiles, new StringMap(), Math.max(1, blocks.length), 1);
    }

    private static Schematic schematic(Schematic.Stile... tiles) {
        return schematicWithTiles(new StringMap(), tiles);
    }

    private static Schematic schematicWithTiles(StringMap tags, Schematic.Stile... tiles) {
        Seq<Schematic.Stile> values = new Seq<>();
        for (Schematic.Stile tile : tiles) values.add(tile);
        return new Schematic(values, tags, 4, 4);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
