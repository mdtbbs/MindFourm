package cn.mdtbbs.renderer;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.HashSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.graphics.Pixmap;
import mindustry.io.MapIO;
import mindustry.maps.Map;
import mindustry.Vars;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import arc.struct.Seq;
import arc.struct.StringMap;

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
                        String mapFixture = System.getenv("MINDFOURM_MSAV_FIXTURE");
                        Path fixture = configuredFixture("MINDFOURM_MSAV_FIXTURE", root.resolve("debris-field.msav"));
                        if (mapFixture == null || mapFixture.isBlank()) {
                            try (InputStream input = MapRenderer.class.getClassLoader().getResourceAsStream("maps/default/debrisField.msav")) {
                                if (input == null) throw new AssertionError("official debrisField.msav fixture is missing from the locked runtime");
                                Files.copy(input, fixture);
                            }
                        }
                        Map map = MapIO.createMap(new Fi(fixture.toFile()), true);
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
            BufferedImage image = MapRenderer.renderSchematicImage(roundTrip);
            require(image.getWidth() > 0 && image.getHeight() > 0, names[index] + " preview must be non-empty");
        }
        String userFixture = System.getenv("MINDFOURM_MSCH_FIXTURE");
        if (userFixture != null && !userFixture.isBlank()) {
            Schematic original = Schematics.read(new Fi(Path.of(userFixture).toFile()));
            BufferedImage preview = MapRenderer.renderSchematicImage(original);
            require(original.tiles.size > 0 && preview.getWidth() > 0 && preview.getHeight() > 0, "reported schematic must decode and render");
        }
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

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
